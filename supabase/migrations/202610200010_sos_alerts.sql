-- GMPI DPD Sidoarjo: Tahap 2 Tombol Darurat — panel Tim Siaga.
-- * Saat anggota menekan tombol kirim di /darurat, permintaan bantuan dicatat di sini
--   (nama, no. anggota, no. HP, jenis masalah, keterangan, lokasi).
-- * Pengunjung/anggota TIDAK bisa membaca tabel. Mereka hanya bisa memanggil fungsi:
--   submit_sos (kirim), update_sos_location (perbarui lokasi), sos_status (cek status), cancel_sos (sudah aman)
--   — tiga yang terakhir memakai kode rahasia yang hanya dimiliki HP pengirim.
-- * Hanya peran "siaga" (Tim Siaga) dan Pemilik yang bisa melihat & menangani di Admin.
-- * Data dihapus otomatis 7 hari setelah dibuat.
-- Aman dijalankan ulang.

-- 1) Peran baru: siaga
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.admin_profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.admin_profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role in ('owner','content_editor','lbh_officer','registrar','media_partner','card_approver','siaga'));

-- 2) Tabel permintaan bantuan
create table if not exists public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 60),
  member_number text check (member_number is null or char_length(member_number) <= 40),
  phone text check (phone is null or phone ~ '^[0-9]{8,15}$'),
  kind text not null check (char_length(kind) between 2 and 40),
  note text check (note is null or char_length(note) <= 240),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  accuracy real check (accuracy is null or accuracy >= 0),
  location_updated_at timestamptz,
  member_verified boolean not null default false,
  status text not null default 'baru' check (status in ('baru','diterima','menuju','selesai','palsu','dibatalkan')),
  handled_by text,
  handler_note text check (handler_note is null or char_length(handler_note) <= 300),
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  token_hash text not null
);
create index if not exists sos_alerts_created_idx on public.sos_alerts (created_at desc);

alter table public.sos_alerts enable row level security;
revoke all on table public.sos_alerts from public, anon, authenticated;
grant select (id, created_at, name, member_number, phone, kind, note, lat, lng, accuracy, location_updated_at,
              member_verified, status, handled_by, handler_note, resolved_at, updated_at)
  on public.sos_alerts to authenticated;
grant update (status, handler_note) on public.sos_alerts to authenticated;
grant delete on public.sos_alerts to authenticated;
grant all on table public.sos_alerts to service_role;

drop policy if exists "siaga reads alerts" on public.sos_alerts;
create policy "siaga reads alerts" on public.sos_alerts for select to authenticated
using (public.has_admin_role(array['owner','siaga']::text[]));

drop policy if exists "siaga handles alerts" on public.sos_alerts;
create policy "siaga handles alerts" on public.sos_alerts for update to authenticated
using (public.has_admin_role(array['owner','siaga']::text[]))
with check (public.has_admin_role(array['owner','siaga']::text[]));

drop policy if exists "owner deletes alerts" on public.sos_alerts;
create policy "owner deletes alerts" on public.sos_alerts for delete to authenticated
using (public.has_admin_role(array['owner']::text[]));

-- 3) Penanganan oleh Tim Siaga: catat siapa & kapan
create or replace function public.sos_alerts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if new.status in ('diterima','menuju') and actor <> '' then
      new.handled_by := actor;
    end if;
    if new.status in ('selesai','palsu','dibatalkan') then
      new.resolved_at := coalesce(new.resolved_at, now());
      if new.handled_by is null and actor <> '' then new.handled_by := actor; end if;
    else
      new.resolved_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sos_alerts_guard on public.sos_alerts;
create trigger sos_alerts_guard
before update on public.sos_alerts
for each row execute function public.sos_alerts_guard();

-- 4) Fungsi untuk HP anggota (tanpa login)
create or replace function public.submit_sos(
  p_name text, p_member_number text, p_phone text, p_kind text, p_note text,
  p_lat double precision, p_lng double precision, p_accuracy real
)
returns table (id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
  v_number text := nullif(upper(regexp_replace(coalesce(p_member_number, ''), '\s', '', 'g')), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_id uuid;
begin
  -- hapus data lama (retensi 7 hari)
  delete from public.sos_alerts where created_at < now() - interval '7 days';

  if v_phone is not null and v_phone like '0%' then v_phone := '62' || substr(v_phone, 2); end if;
  if v_phone is not null and v_phone !~ '^[0-9]{8,15}$' then v_phone := null; end if;

  -- rem darurat terhadap spam
  if (select count(*) from public.sos_alerts a where a.created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Terlalu banyak permintaan dalam waktu singkat. Hubungi piket lewat WhatsApp / 112.';
  end if;
  if v_phone is not null and (select count(*) from public.sos_alerts a
      where a.phone = v_phone and a.created_at > now() - interval '5 minutes') >= 3 then
    raise exception 'Permintaan dari nomor ini sudah tercatat. Tim Siaga sedang memprosesnya.';
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    p_lat := null; p_lng := null; p_accuracy := null;
  end if;

  insert into public.sos_alerts (name, member_number, phone, kind, note, lat, lng, accuracy, location_updated_at, member_verified, token_hash)
  values (
    left(coalesce(nullif(trim(p_name), ''), 'Tanpa nama'), 60),
    left(v_number, 40),
    v_phone,
    left(coalesce(nullif(trim(p_kind), ''), 'Masalah lain'), 40),
    nullif(left(trim(coalesce(p_note, '')), 240), ''),
    p_lat, p_lng, case when p_accuracy is null then null else greatest(p_accuracy, 0) end,
    case when p_lat is null then null else now() end,
    v_number is not null and exists (select 1 from public.member_cards c where c.member_number = v_number and c.status = 'aktif' and c.is_sample = false),
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  returning sos_alerts.id into v_id;

  return query select v_id, v_token;
end;
$$;

create or replace function public.update_sos_location(
  p_id uuid, p_token text, p_lat double precision, p_lng double precision, p_accuracy real
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return null;
  end if;
  update public.sos_alerts a
  set lat = p_lat, lng = p_lng, accuracy = greatest(coalesce(p_accuracy, 0), 0), location_updated_at = now()
  where a.id = p_id
    and a.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and a.created_at > now() - interval '3 hours'
    and a.status in ('baru','diterima','menuju')
  returning a.status into v_status;
  return v_status;
end;
$$;

create or replace function public.sos_status(p_id uuid, p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.status from public.sos_alerts a
  where a.id = p_id and a.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  limit 1;
$$;

create or replace function public.cancel_sos(p_id uuid, p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_status text;
begin
  update public.sos_alerts a
  set status = 'dibatalkan', handler_note = coalesce(a.handler_note, 'Anggota menyatakan sudah aman.')
  where a.id = p_id
    and a.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and a.status in ('baru','diterima','menuju')
  returning a.status into v_status;
  return v_status;
end;
$$;

-- Dipanggil panel Admin saat dibuka: bersihkan data > 7 hari.
create or replace function public.purge_old_sos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if not public.has_admin_role(array['owner','siaga']::text[]) then return 0; end if;
  delete from public.sos_alerts where created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.submit_sos(text, text, text, text, text, double precision, double precision, real) from public;
revoke all on function public.update_sos_location(uuid, text, double precision, double precision, real) from public;
revoke all on function public.sos_status(uuid, text) from public;
revoke all on function public.cancel_sos(uuid, text) from public;
revoke all on function public.purge_old_sos() from public;
grant execute on function public.submit_sos(text, text, text, text, text, double precision, double precision, real) to anon, authenticated;
grant execute on function public.update_sos_location(uuid, text, double precision, double precision, real) to anon, authenticated;
grant execute on function public.sos_status(uuid, text) to anon, authenticated;
grant execute on function public.cancel_sos(uuid, text) to anon, authenticated;
grant execute on function public.purge_old_sos() to authenticated;
