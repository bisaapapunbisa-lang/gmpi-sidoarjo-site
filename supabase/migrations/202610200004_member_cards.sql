-- GMPI DPC Sidoarjo: Kartu Tanda Anggota (KTA) dengan QR verifikasi.
-- * Kartu diterbitkan dari panel Admin oleh Pemilik atau Petugas Registrasi.
-- * QR berisi kode acak 80-bit (20 karakter hex), bukan NIK dan bukan nomor urut, sehingga tidak bisa ditebak.
-- * Publik TIDAK bisa membaca tabel. Publik hanya bisa memanggil fungsi verify_member_card(kode)
--   yang mengembalikan data minimum satu kartu: nama, nomor, kecamatan, jabatan, status, masa berlaku.
-- * NIK, alamat, nomor HP, dan foto TIDAK disimpan di tabel ini.

create table if not exists public.member_cards (
  id uuid primary key default gen_random_uuid(),
  card_token text not null unique default upper(encode(extensions.gen_random_bytes(10), 'hex')),
  member_number text not null unique check (member_number ~ '^[A-Z0-9][A-Z0-9./-]{2,39}$'),
  full_name text not null check (char_length(full_name) between 2 and 120),
  district text not null check (district in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  )),
  jabatan text not null default 'Anggota' check (char_length(jabatan) between 2 and 60),
  status text not null default 'aktif' check (status in ('aktif','nonaktif','dicabut')),
  issued_at date not null default current_date,
  valid_until date not null,
  registration_id uuid references public.member_registrations(id) on delete set null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_cards_token_format check (card_token ~ '^[0-9A-F]{20}$' or (is_sample and card_token = 'CONTOH')),
  constraint member_cards_valid_range check (valid_until >= issued_at)
);

create index if not exists member_cards_created_at_idx on public.member_cards (created_at desc);

alter table public.member_cards enable row level security;
revoke all on table public.member_cards from public, anon;
grant select, insert, update, delete on table public.member_cards to authenticated;
grant all on table public.member_cards to service_role;

drop policy if exists "card officers read member cards" on public.member_cards;
create policy "card officers read member cards"
on public.member_cards for select to authenticated
using (public.has_admin_role(array['owner','registrar']::text[]));

drop policy if exists "card officers issue member cards" on public.member_cards;
create policy "card officers issue member cards"
on public.member_cards for insert to authenticated
with check (public.has_admin_role(array['owner','registrar']::text[]) and is_sample = false);

drop policy if exists "card officers update member cards" on public.member_cards;
create policy "card officers update member cards"
on public.member_cards for update to authenticated
using (public.has_admin_role(array['owner','registrar']::text[]) and is_sample = false)
with check (public.has_admin_role(array['owner','registrar']::text[]) and is_sample = false);

drop policy if exists "owner deletes member cards" on public.member_cards;
create policy "owner deletes member cards"
on public.member_cards for delete to authenticated
using (public.has_admin_role(array['owner']::text[]) and is_sample = false);

-- Kode kartu tidak boleh diubah setelah terbit (QR yang sudah dicetak harus tetap sah).
create or replace function public.member_cards_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.card_token is distinct from old.card_token then
    raise exception 'Kode QR kartu tidak boleh diubah.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists member_cards_guard on public.member_cards;
create trigger member_cards_guard
before update on public.member_cards
for each row execute function public.member_cards_guard();

-- Fungsi verifikasi publik: hanya mencocokkan satu kode persis, tanpa daftar/pencarian.
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
  select c.member_number, c.full_name, c.district, c.jabatan, c.status, c.issued_at, c.valid_until, c.is_sample
  from public.member_cards as c
  where p_token is not null
    and char_length(p_token) between 6 and 20
    and c.card_token = upper(p_token)
  limit 1;
$$;

revoke all on function public.verify_member_card(text) from public;
grant execute on function public.verify_member_card(text) to anon, authenticated;

-- Kartu contoh untuk ditampilkan di beranda (QR mengarah ke kode CONTOH, ditandai sebagai contoh).
insert into public.member_cards (card_token, member_number, full_name, district, jabatan, status, issued_at, valid_until, is_sample)
values ('CONTOH', 'GMPI-SDA-2026-0000', 'Nama Anggota', 'Sidoarjo', 'Anggota', 'aktif', date '2026-10-20', date '2028-10-20', true)
on conflict (card_token) do nothing;
