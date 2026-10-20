-- GMPI DPD Sidoarjo — Nomor KTA khusus 0001–0100 untuk anggota terpilih.
-- Keputusan pengurus:
-- * Bentuk nomor tetap GMPI-SDA-<TAHUN>-<URUT>, misalnya GMPI-SDA-2026-0001.
-- * Urutan 0001–0100 di setiap tahun disimpan sebagai jatah khusus untuk anggota terpilih.
-- * Hanya akun dengan peran PEMILIK (owner) yang boleh memberikan nomor khusus ini.
--   Petugas Registrasi tetap bisa menerbitkan kartu biasa mulai 0101.
-- * Tampilan kartu sama dengan kartu biasa; yang istimewa hanya nomornya.
-- * Kartu yang sudah terbit sebelum migrasi ini tidak diubah.
-- Aman dijalankan lebih dari sekali.

create or replace function public.is_reserved_member_number(p_number text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(upper(p_number) ~ '^GMPI-SDA-[0-9]{4}-0*([1-9][0-9]?|100)$', false);
$$;

grant execute on function public.is_reserved_member_number(text) to anon, authenticated;

create or replace function public.member_cards_reserved_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  -- SQL Editor / service role (tanpa login Admin): tidak dibatasi.
  if actor = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.member_number is not distinct from old.member_number then
    return new;
  end if;
  if public.is_reserved_member_number(new.member_number)
     and not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Nomor KTA 0001–0100 adalah nomor khusus anggota terpilih dan hanya dapat diberikan oleh Pemilik. Gunakan nomor 0101 ke atas.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists member_cards_reserved_guard on public.member_cards;
create trigger member_cards_reserved_guard
before insert or update of member_number on public.member_cards
for each row execute function public.member_cards_reserved_guard();
