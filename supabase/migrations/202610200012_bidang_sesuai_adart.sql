-- GMPI DPD Sidoarjo: pilihan "Bidang pergerakan" pendaftaran disamakan dengan AD/ART 2021 Pasal 8 (organisasi otonom).
-- * "Satgas Brigade" (tidak ada di AD/ART) -> "Squad Militansi" (AD Pasal 8 huruf b)
-- * Tambah "Tagana — Tanggap Bencana" (AD Pasal 8 huruf i)
-- * Serikat Buruh mencakup buruh, tani & nelayan (AD Pasal 8 huruf d)
-- Aman dijalankan ulang. Formulir pendaftaran publik tetap NONAKTIF.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.member_registrations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%division%'
  loop
    execute format('alter table public.member_registrations drop constraint %I', c.conname);
  end loop;
end $$;

update public.member_registrations
set division = 'Squad Militansi — Pengamanan & Solidaritas'
where division = 'Satgas Brigade — Pengamanan & Aksi Tanggap Darurat';

alter table public.member_registrations add constraint member_registrations_division_check
  check (division in (
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Squad Militansi — Pengamanan & Solidaritas',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Serikat Buruh, Tani & Nelayan (SB GMPI)',
    'Tagana — Tanggap Bencana',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa'
  ));
