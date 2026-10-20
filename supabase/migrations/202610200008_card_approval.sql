-- GMPI DPD Sidoarjo: Persetujuan Kartu Tanda Anggota.
-- * Peran baru "card_approver" (Penyetuju Kartu), misalnya Ketua/Sekretaris DPD. Pemilik (owner) juga bisa menyetujui.
-- * Kartu baru (dan kartu yang datanya diubah) berstatus "menunggu" — QR BELUM berlaku.
-- * Hanya Penyetuju Kartu/Pemilik yang bisa menyetujui atau menolak.
-- * Orang yang membuat/mengubah kartu TIDAK BOLEH menyetujui kartunya sendiri.
-- * Aturan dijaga oleh database (trigger), bukan hanya oleh tampilan Admin.
-- Aman dijalankan ulang.

-- 1) Peran baru: card_approver
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
  check (role in ('owner','content_editor','lbh_officer','registrar','media_partner','card_approver'));

-- 2) Kolom persetujuan
alter table public.member_cards add column if not exists submitted_by text;
alter table public.member_cards add column if not exists approved_by text;
alter table public.member_cards add column if not exists approved_at timestamptz;
alter table public.member_cards add column if not exists review_note text;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.member_cards'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.member_cards drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.member_cards add constraint member_cards_status_check
  check (status in ('menunggu','ditolak','aktif','nonaktif','dicabut'));
alter table public.member_cards drop constraint if exists member_cards_review_note_len;
alter table public.member_cards add constraint member_cards_review_note_len
  check (review_note is null or char_length(review_note) <= 300);
alter table public.member_cards alter column status set default 'menunggu';

-- 3) Kartu yang sudah terbit sebelum fitur ini dianggap sudah disetujui
--    (QR yang sudah dicetak tetap berlaku).
update public.member_cards
set approved_at = coalesce(approved_at, created_at),
    approved_by = coalesce(approved_by, 'sebelum-fitur-persetujuan')
where status in ('aktif','nonaktif','dicabut') and approved_at is null;

-- 4) Siapa boleh membaca & mengubah
drop policy if exists "card officers read member cards" on public.member_cards;
create policy "card officers read member cards"
on public.member_cards for select to authenticated
using (public.has_admin_role(array['owner','registrar','card_approver']::text[]));

drop policy if exists "card officers update member cards" on public.member_cards;
create policy "card officers update member cards"
on public.member_cards for update to authenticated
using (public.has_admin_role(array['owner','registrar','card_approver']::text[]) and is_sample = false)
with check (public.has_admin_role(array['owner','registrar','card_approver']::text[]) and is_sample = false);
-- (Menerbitkan kartu baru tetap hanya Pemilik & Petugas Registrasi; hapus tetap hanya Pemilik.)

-- 5) Penjaga aturan persetujuan
create or replace function public.member_cards_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  approver boolean;
  data_changed boolean;
begin
  -- SQL Editor / service role (tanpa login Admin): tidak dibatasi.
  if actor = '' then
    if tg_op = 'UPDATE' then
      if new.card_token is distinct from old.card_token then
        raise exception 'Kode QR kartu tidak boleh diubah.';
      end if;
      new.updated_at := now();
    end if;
    return new;
  end if;

  approver := public.has_admin_role(array['owner','card_approver']::text[]);

  if tg_op = 'INSERT' then
    new.status := 'menunggu';
    new.submitted_by := actor;
    new.approved_by := null;
    new.approved_at := null;
    new.review_note := null;
    return new;
  end if;

  if new.card_token is distinct from old.card_token then
    raise exception 'Kode QR kartu tidak boleh diubah.';
  end if;

  -- Kolom persetujuan hanya diisi oleh sistem.
  new.submitted_by := old.submitted_by;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.updated_at := now();

  data_changed := (new.full_name, new.member_number, new.district, new.jabatan, new.issued_at, new.valid_until)
    is distinct from (old.full_name, old.member_number, old.district, old.jabatan, old.issued_at, old.valid_until);

  if data_changed then
    -- Data kartu berubah → wajib disetujui ulang oleh orang lain.
    new.status := 'menunggu';
    new.submitted_by := actor;
    new.approved_by := null;
    new.approved_at := null;
    new.review_note := null;
    return new;
  end if;

  if new.status is not distinct from old.status then
    if new.review_note is distinct from old.review_note and not approver then
      new.review_note := old.review_note;
    end if;
    return new;
  end if;

  if new.status = 'aktif' then
    if not approver then
      raise exception 'Hanya Penyetuju Kartu atau Pemilik yang dapat menyetujui/mengaktifkan kartu.' using errcode = '42501';
    end if;
    if old.status not in ('menunggu','nonaktif') then
      raise exception 'Kartu berstatus % tidak bisa langsung diaktifkan. Ajukan ulang dulu.', old.status;
    end if;
    if actor = coalesce(old.submitted_by, '') then
      raise exception 'Kartu tidak boleh disetujui oleh orang yang membuat atau mengubahnya.' using errcode = '42501';
    end if;
    if old.status = 'menunggu' then
      new.approved_by := actor;
      new.approved_at := now();
      new.review_note := null;
    end if;
  elsif new.status = 'ditolak' then
    if not approver then
      raise exception 'Hanya Penyetuju Kartu atau Pemilik yang dapat menolak kartu.' using errcode = '42501';
    end if;
    if old.status <> 'menunggu' then
      raise exception 'Hanya kartu yang menunggu persetujuan yang bisa ditolak.';
    end if;
    if actor = coalesce(old.submitted_by, '') then
      raise exception 'Kartu tidak boleh ditinjau oleh orang yang membuat atau mengubahnya.' using errcode = '42501';
    end if;
  elsif new.status = 'menunggu' then
    if old.status not in ('ditolak','dicabut','nonaktif') then
      raise exception 'Status kartu tidak valid.';
    end if;
    new.submitted_by := actor;
    new.approved_by := null;
    new.approved_at := null;
    new.review_note := null;
  elsif new.status in ('nonaktif','dicabut') then
    if old.status not in ('aktif','nonaktif') then
      raise exception 'Hanya kartu yang sudah disetujui yang bisa dinonaktifkan atau dicabut.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists member_cards_guard on public.member_cards;
create trigger member_cards_guard
before insert or update on public.member_cards
for each row execute function public.member_cards_guard();

-- 6) Verifikasi publik: kartu yang belum disetujui/ditolak TIDAK menampilkan nama & data.
create or replace function public.verify_member_card(p_token text)
returns table (
  member_number text,
  full_name text,
  district text,
  jabatan text,
  status text,
  issued_at date,
  valid_until date,
  is_sample boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case when c.status in ('menunggu','ditolak') then null else c.member_number end,
    case when c.status in ('menunggu','ditolak') then null else c.full_name end,
    case when c.status in ('menunggu','ditolak') then null else c.district end,
    case when c.status in ('menunggu','ditolak') then null else c.jabatan end,
    c.status,
    case when c.status in ('menunggu','ditolak') then null else c.issued_at end,
    case when c.status in ('menunggu','ditolak') then null else c.valid_until end,
    c.is_sample
  from public.member_cards as c
  where p_token is not null
    and char_length(p_token) between 6 and 20
    and c.card_token = upper(p_token)
  limit 1;
$$;

revoke all on function public.verify_member_card(text) from public;
grant execute on function public.verify_member_card(text) to anon, authenticated;
