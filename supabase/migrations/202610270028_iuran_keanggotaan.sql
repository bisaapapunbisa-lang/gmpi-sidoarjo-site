-- ============================================================================
-- GMPI DPD Sidoarjo: IURAN KEANGGOTAAN (tagihan + pembayaran mudah)
-- ----------------------------------------------------------------------------
-- Isi migrasi ini:
--   1) Pengaturan iuran (nominal, periode, jatuh tempo, QRIS/e-wallet/bank,
--      nomor WA bendahara) disimpan di tabel site_content dengan awalan iuran_.
--      Semua kunci ini boleh DIBACA publik (agar halaman iuran bisa tampil),
--      tetapi hanya Pemilik / Editor Situs / Bendahara yang boleh MENGUBAH.
--   2) Tabel public.dues_payments: catatan klaim pembayaran dari anggota.
--      Publik TIDAK bisa membaca/menulis tabel ini langsung. Publik hanya bisa:
--        - submit_dues_payment(...)  -> mengirim klaim pembayaran
--        - dues_status(nomor, nama)  -> cek status iuran sendiri
--   3) Peran baru "bendahara" (Bendahara) untuk mengurus iuran tanpa harus
--      mendapat akses NIK/KTP.
--   4) Fungsi bantu admin: verify_dues_payment(...) dan dues_unpaid_members(...).
-- Aman dijalankan ulang (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Daftar kecamatan dipakai beberapa kali; jangan diubah tanpa ubah RPC.
-- ---------------------------------------------------------------------------
-- (Daftar 18 kecamatan Sidoarjo, sama dengan tabel member_cards.)

-- ---------------------------------------------------------------------------
-- 2) Peran "bendahara"
-- ---------------------------------------------------------------------------
alter table public.admin_profiles drop constraint if exists admin_profiles_role_check;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role in (
    'owner','content_editor','lbh_officer','registrar',
    'media_partner','card_approver','siaga','bendahara'
  ));

-- ---------------------------------------------------------------------------
-- 3) Pengaturan iuran di site_content
-- ---------------------------------------------------------------------------
alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in (
    'hero_lead','voice_intro','gallery_note','footer_slogan','site_logo',
    'shop_whatsapp','shop_bank','legal_npwp','sos_whatsapp',
    'iuran_aktif','iuran_nama','iuran_periode','iuran_nominal',
    'iuran_jatuh_tempo','iuran_ewallet','iuran_bank','iuran_wa','iuran_catatan'
  ));

-- Nilai kosong selalu diperbolehkan; bila diisi, formatnya harus masuk akal.
alter table public.site_content drop constraint if exists site_content_iuran_aktif_check;
alter table public.site_content add constraint site_content_iuran_aktif_check
  check (key <> 'iuran_aktif' or value ->> 'text' in ('0','1'));

alter table public.site_content drop constraint if exists site_content_iuran_nominal_check;
alter table public.site_content add constraint site_content_iuran_nominal_check
  check (key <> 'iuran_nominal' or value ->> 'text' = '' or value ->> 'text' ~ '^[0-9]{3,9}$');

alter table public.site_content drop constraint if exists site_content_iuran_periode_check;
alter table public.site_content add constraint site_content_iuran_periode_check
  check (key <> 'iuran_periode' or value ->> 'text' = '' or value ->> 'text' ~ '^[0-9]{4}(-[0-9]{2})?$');

alter table public.site_content drop constraint if exists site_content_iuran_tempo_check;
alter table public.site_content add constraint site_content_iuran_tempo_check
  check (key <> 'iuran_jatuh_tempo' or value ->> 'text' = '' or value ->> 'text' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

alter table public.site_content drop constraint if exists site_content_iuran_wa_check;
alter table public.site_content add constraint site_content_iuran_wa_check
  check (key <> 'iuran_wa' or value ->> 'text' = '' or value ->> 'text' ~ '^62[0-9]{8,13}$');

insert into public.site_content (key, value) values
  ('iuran_aktif',       jsonb_build_object('text', '0')),
  ('iuran_nama',        jsonb_build_object('text', 'Iuran Keanggotaan')),
  ('iuran_periode',     jsonb_build_object('text', to_char(current_date, 'YYYY'))),
  ('iuran_nominal',     jsonb_build_object('text', '60000')),
  ('iuran_jatuh_tempo', jsonb_build_object('text', to_char(current_date + 60, 'YYYY-MM-DD'))),
  ('iuran_ewallet',     jsonb_build_object('text', '')),
  ('iuran_bank',        jsonb_build_object('text', 'Bank bjb · 0163336219100 · a.n. GMPI DPD SIDOARJO')),
  ('iuran_wa',          jsonb_build_object('text', '6281235911689')),
  ('iuran_catatan',     jsonb_build_object('text', 'Iuran dipakai untuk kas organisasi: advokasi warga, kegiatan sosial, dan operasional sekretariat DPD.'))
on conflict (key) do nothing;

-- Siapa yang boleh mengubah kunci iuran_*: Pemilik, Editor Situs, Bendahara.
drop policy if exists "iuran editors manage dues settings" on public.site_content;
create policy "iuran editors manage dues settings"
on public.site_content for all to authenticated
using (
  key like 'iuran\_%'
  and public.has_admin_role(array['owner','content_editor','bendahara']::text[])
)
with check (
  key like 'iuran\_%'
  and public.has_admin_role(array['owner','content_editor','bendahara']::text[])
);

-- ---------------------------------------------------------------------------
-- 4) Tabel catatan pembayaran iuran
-- ---------------------------------------------------------------------------
create table if not exists public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_name text not null check (char_length(member_name) between 2 and 120),
  member_number text check (
    member_number is null or member_number ~* '^[A-Z0-9][A-Z0-9./-]{2,39}$'
  ),
  district text not null check (district in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  )),
  phone text not null check (char_length(phone) between 7 and 20),
  method text not null check (method in ('qris','ewallet','transfer','tunai')),
  amount integer not null check (amount between 1000 and 100000000),
  period text not null check (period ~ '^[0-9]{4}(-[0-9]{2})?$'),
  paid_at date not null,
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'menunggu'
    check (status in ('menunggu','terverifikasi','ditolak')),
  verified_at timestamptz,
  verified_by text,
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  source text not null default 'web' check (source in ('web','manual')),
  updated_at timestamptz not null default now()
);

create index if not exists dues_payments_created_idx on public.dues_payments (created_at desc);
create index if not exists dues_payments_status_idx on public.dues_payments (status, created_at desc);
create index if not exists dues_payments_period_idx on public.dues_payments (period, status);
create index if not exists dues_payments_number_idx on public.dues_payments (member_number);

-- Satu anggota hanya boleh punya SATU pembayaran terverifikasi per periode.
drop index if exists dues_payments_unique_verified;
create unique index dues_payments_unique_verified
  on public.dues_payments (period, coalesce(member_number, lower(member_name)))
  where status = 'terverifikasi';

alter table public.dues_payments enable row level security;
revoke all on table public.dues_payments from public, anon;
grant select, insert, update, delete on table public.dues_payments to authenticated;
grant all on table public.dues_payments to service_role;

drop policy if exists "dues officers read payments" on public.dues_payments;
create policy "dues officers read payments"
on public.dues_payments for select to authenticated
using (public.has_admin_role(array['owner','registrar','bendahara']::text[]));

drop policy if exists "dues officers record payments" on public.dues_payments;
create policy "dues officers record payments"
on public.dues_payments for insert to authenticated
with check (public.has_admin_role(array['owner','registrar','bendahara']::text[]));

drop policy if exists "dues officers update payments" on public.dues_payments;
create policy "dues officers update payments"
on public.dues_payments for update to authenticated
using (public.has_admin_role(array['owner','registrar','bendahara']::text[]))
with check (public.has_admin_role(array['owner','registrar','bendahara']::text[]));

drop policy if exists "owner deletes dues payments" on public.dues_payments;
create policy "owner deletes dues payments"
on public.dues_payments for delete to authenticated
using (public.has_admin_role(array['owner']::text[]));

create or replace function public.dues_payments_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dues_payments_touch on public.dues_payments;
create trigger dues_payments_touch
before update on public.dues_payments
for each row execute function public.dues_payments_touch();

-- ---------------------------------------------------------------------------
-- 5) Publik: kirim klaim pembayaran iuran
-- ---------------------------------------------------------------------------
create or replace function public.submit_dues_payment(
  p_member_name text,
  p_member_number text,
  p_district text,
  p_phone text,
  p_method text,
  p_amount integer,
  p_period text,
  p_paid_at date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(regexp_replace(coalesce(p_member_name, ''), '\s+', ' ', 'g')), 120);
  v_number text := nullif(upper(trim(coalesce(p_member_number, ''))), '');
  v_district text := trim(coalesce(p_district, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_method text := lower(trim(coalesce(p_method, '')));
  v_period text := trim(coalesce(p_period, ''));
  v_note text := nullif(left(trim(coalesce(p_note, '')), 300), '');
  v_existing public.dues_payments;
  v_new_id uuid;
  v_new_status text;
begin
  if char_length(v_name) < 2 then
    raise exception 'Nama wajib diisi minimal 2 huruf.';
  end if;
  if v_district not in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  ) then
    raise exception 'Kecamatan domisili belum dipilih dengan benar.';
  end if;
  if char_length(v_phone) < 9 or char_length(v_phone) > 15 then
    raise exception 'Nomor WhatsApp tidak valid. Contoh: 081234567890.';
  end if;
  if v_method not in ('qris', 'ewallet', 'transfer', 'tunai') then
    raise exception 'Metode pembayaran tidak dikenal.';
  end if;
  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception 'Jumlah pembayaran tidak wajar.';
  end if;
  if v_period !~ '^[0-9]{4}(-[0-9]{2})?$' then
    raise exception 'Periode iuran tidak valid.';
  end if;
  if p_paid_at is null then
    raise exception 'Tanggal pembayaran wajib diisi.';
  end if;
  -- Server menghitung tanggal dalam UTC; beri toleransi 1 hari untuk WIB/WITA/WIT.
  if p_paid_at > current_date + 1 then
    raise exception 'Tanggal pembayaran tidak boleh di masa depan.';
  end if;
  if p_paid_at < current_date - interval '400 days' then
    raise exception 'Tanggal pembayaran terlalu lama. Hubungi Bendahara langsung.';
  end if;
  if v_number is not null and v_number !~ '^[A-Z0-9][A-Z0-9./-]{2,39}$' then
    raise exception 'Nomor anggota tidak valid. Periksa kembali dari kartu anggota.';
  end if;

  -- Bila nomor anggota tidak dikenali, simpan sebagai catatan nama saja.
  if v_number is not null and not exists (
    select 1 from public.member_cards c where c.member_number = v_number
  ) then
    v_number := null;
  end if;

  -- Kiriman ganda (klik dua kali) dalam 12 jam: kembalikan catatan yang sudah ada.
  select * into v_existing
  from public.dues_payments d
  where lower(d.member_name) = lower(v_name)
    and d.period = v_period
    and d.phone = v_phone
    and d.created_at > now() - interval '12 hours'
    and d.status <> 'ditolak'
  order by d.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'duplicate', true
    );
  end if;

  insert into public.dues_payments (
    member_name, member_number, district, phone, method, amount, period, paid_at, note, source
  ) values (
    v_name, v_number, v_district, v_phone, v_method, p_amount, v_period, p_paid_at, v_note, 'web'
  )
  returning id, status into v_new_id, v_new_status;

  return jsonb_build_object(
    'id', v_new_id,
    'status', v_new_status,
    'duplicate', false
  );
end;
$$;

revoke all on function public.submit_dues_payment(text,text,text,text,text,integer,text,date,text) from public;
grant execute on function public.submit_dues_payment(text,text,text,text,text,integer,text,date,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Publik: anggota mengecek status iurannya sendiri
--    Harus menyebut nomor anggota + nama yang sama seperti di kartu anggota.
--    Tidak pernah menampilkan nomor HP, NIK, atau alamat.
-- ---------------------------------------------------------------------------
create or replace function public.dues_status(p_nomor text, p_nama text)
returns table (
  period text,
  amount integer,
  status text,
  paid_at date,
  verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_number text := upper(trim(coalesce(p_nomor, '')));
  v_name text := trim(coalesce(p_nama, ''));
  v_card public.member_cards;
begin
  if char_length(v_number) < 3 or char_length(v_number) > 40 then
    raise exception 'Nomor anggota belum diisi dengan benar.';
  end if;
  if char_length(v_name) < 2 then
    raise exception 'Nama anggota wajib diisi.';
  end if;

  select * into v_card
  from public.member_cards c
  where c.member_number = v_number
    and lower(c.full_name) = lower(v_name)
    and c.is_sample = false
  limit 1;

  if not found then
    raise exception 'Data tidak cocok. Periksa nomor anggota dan nama sesuai kartu anggota.';
  end if;

  return query
  select d.period, d.amount, d.status, d.paid_at, d.verified_at
  from public.dues_payments d
  where d.status <> 'ditolak'
    and (
      d.member_number = v_card.member_number
      or (d.member_number is null and lower(d.member_name) = lower(v_card.full_name))
    )
  order by d.period desc, d.created_at desc;
end;
$$;

revoke all on function public.dues_status(text,text) from public;
grant execute on function public.dues_status(text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Admin: verifikasi / tolak klaim pembayaran
-- ---------------------------------------------------------------------------
create or replace function public.verify_dues_payment(
  p_id uuid,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 300), '');
  v_row public.dues_payments;
begin
  if not public.has_admin_role(array['owner','registrar','bendahara']::text[]) then
    raise exception 'Akun ini tidak berwenang memverifikasi iuran.';
  end if;
  if v_status not in ('menunggu','terverifikasi','ditolak') then
    raise exception 'Status verifikasi tidak dikenal.';
  end if;
  if v_status = 'ditolak' and v_reason is null then
    raise exception 'Alasan penolakan wajib diisi.';
  end if;

  select * into v_row from public.dues_payments where id = p_id;
  if not found then
    raise exception 'Catatan pembayaran tidak ditemukan.';
  end if;

  if v_status = 'terverifikasi' and exists (
    select 1
    from public.dues_payments d
    where d.id <> p_id
      and d.status = 'terverifikasi'
      and d.period = v_row.period
      and (
        (v_row.member_number is not null and d.member_number = v_row.member_number)
        or (v_row.member_number is null and d.member_number is null
            and lower(d.member_name) = lower(v_row.member_name))
      )
  ) then
    raise exception 'Nama ini sudah punya pembayaran terverifikasi untuk periode %. Batalkan verifikasi baris lain lebih dulu.', v_row.period;
  end if;

  update public.dues_payments
  set status = v_status,
      verified_at = case when v_status = 'menunggu' then null else now() end,
      verified_by = case when v_status = 'menunggu' then null
                         else lower(coalesce(auth.jwt() ->> 'email', '')) end,
      reject_reason = case when v_status = 'ditolak' then v_reason else null end
  where id = p_id;

  return jsonb_build_object('id', p_id, 'status', v_status);
end;
$$;

revoke all on function public.verify_dues_payment(uuid,text,text) from public;
grant execute on function public.verify_dues_payment(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Admin: daftar anggota aktif yang belum membayar periode tertentu
--    Nomor HP hanya diberikan bila akun berhak (Pemilik/Registrasi/Bendahara).
-- ---------------------------------------------------------------------------
create or replace function public.dues_unpaid_members(p_period text)
returns table (
  member_number text,
  full_name text,
  district text,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period text := trim(coalesce(p_period, ''));
  v_phone_ok boolean := public.has_admin_role(array['owner','registrar','bendahara']::text[]);
begin
  if not v_phone_ok then
    raise exception 'Akun ini tidak berwenang membaca daftar iuran.';
  end if;
  if v_period !~ '^[0-9]{4}(-[0-9]{2})?$' then
    raise exception 'Periode iuran tidak valid.';
  end if;

  return query
  select c.member_number,
         c.full_name,
         c.district,
         case when v_phone_ok then r.phone else null end
  from public.member_cards c
  left join public.member_registrations r on r.id = c.registration_id
  where c.status = 'aktif'
    and c.is_sample = false
    and not exists (
      select 1 from public.dues_payments d
      where d.status = 'terverifikasi'
        and d.period = v_period
        and (
          d.member_number = c.member_number
          or (d.member_number is null and lower(d.member_name) = lower(c.full_name))
        )
    )
  order by c.district, c.full_name;
end;
$$;

revoke all on function public.dues_unpaid_members(text) from public;
grant execute on function public.dues_unpaid_members(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Catatan
-- ---------------------------------------------------------------------------
comment on table public.dues_payments is
  'Klaim pembayaran iuran keanggotaan. Berisi nama, nomor anggota, kecamatan, dan nomor WA. Jangan diekspor keluar organisasi tanpa izin Bendahara.';
