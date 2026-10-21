-- GMPI DPD Sidoarjo: Aktivasi formulir pendaftaran anggota (fase aman).
-- Yang berubah:
-- * Pilihan bidang memakai daftar terbaru sesuai AD/ART (menggantikan daftar lama "Satgas Brigade").
-- * Publik boleh MENGUNGGAH foto KTP/pas foto, TAPI: tidak bisa membaca, mengubah, daftar,
--   atau menghapus file apa pun. File masuk folder acak (reg/…) yang tidak bisa ditebak.
-- * Publik tidak bisa menyentuh tabel member_registrations sama sekali — semua kiriman wajib
--   lewat fungsi submit_member_registration yang memeriksa kelengkapan data di server.
-- * Yang bisa melihat data & foto hanya peran owner dan registrar (sesuai aturan tab Admin yang ada).
-- * NIK yang sama tidak bisa mendaftar dua kali (kecuali pendaftaran lamanya status "ditolak").
-- Aman dijalankan ulang.

-- 1) Opsi bidang sesuai pilihan terbaru di formulir
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

alter table public.member_registrations add constraint member_registrations_division_check
  check (division in (
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Squad Militansi — Pengamanan & Solidaritas',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Serikat Buruh, Tani & Nelayan (SB GMPI)',
    'Tagana — Tanggap Bencana',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa'
  ));

-- 2) Kebijakan berkas pada bucket privat 'member-documents' (sudah dibuat di migrasi 0001)
drop policy if exists "publik hanya unggah dokumen" on storage.objects;
create policy "publik hanya unggah dokumen" on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'member-documents'
  and name ~ '^reg/[0-9a-fA-F-]{36}\.(jpg|png)$'
);

drop policy if exists "registrar membaca dokumen anggota" on storage.objects;
create policy "registrar membaca dokumen anggota" on storage.objects
for select to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['owner','registrar']::text[])
);

drop policy if exists "pemilik menghapus dokumen anggota" on storage.objects;
create policy "pemilik menghapus dokumen anggota" on storage.objects
for delete to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['owner']::text[])
);

-- 3) Fungsi pendaftaran (dipanggil halaman situs, tanpa login). Server memeriksa SEMUA isian.
create or replace function public.submit_member_registration(
  p_full_name text,
  p_nik text,
  p_birth_place text,
  p_birth_date date,
  p_gender text,
  p_phone text,
  p_district text,
  p_address text,
  p_division text,
  p_ktp_key text,
  p_profile_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(trim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g')), 160);
  v_nik text := regexp_replace(coalesce(p_nik, ''), '\D', '', 'g');
  v_birth_place text := left(trim(coalesce(p_birth_place, '')), 120);
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_address text := left(trim(regexp_replace(coalesce(p_address, ''), '\s+', ' ', 'g')), 1000);
  v_ktp text := trim(coalesce(p_ktp_key, ''));
  v_profile text := trim(coalesce(p_profile_key, ''));
begin
  if char_length(v_name) < 3 then
    raise exception 'Nama lengkap belum benar. Isi sesuai KTP.';
  end if;
  if v_nik !~ '^[0-9]{16}$' then
    raise exception 'NIK harus tepat 16 digit angka.';
  end if;
  if v_birth_place = '' then
    raise exception 'Tempat lahir wajib diisi.';
  end if;
  if p_birth_date is null or p_birth_date > current_date then
    raise exception 'Tanggal lahir tidak valid.';
  end if;
  if coalesce(p_gender, '') not in ('Laki-laki','Perempuan') then
    raise exception 'Pilih jenis kelamin.';
  end if;
  if v_phone like '0%' then v_phone := '62' || substr(v_phone, 2); end if;
  if v_phone !~ '^62[0-9]{8,13}$' then
    raise exception 'Nomor WhatsApp tidak valid. Contoh: 081234567890.';
  end if;
  if coalesce(p_district, '') not in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  ) then
    raise exception 'Pilih kecamatan domisili.';
  end if;
  if char_length(v_address) < 5 then
    raise exception 'Alamat lengkap wajib diisi.';
  end if;
  if coalesce(p_division, '') not in (
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Squad Militansi — Pengamanan & Solidaritas',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Serikat Buruh, Tani & Nelayan (SB GMPI)',
    'Tagana — Tanggap Bencana',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa'
  ) then
    raise exception 'Pilih bidang pergerakan.';
  end if;
  if v_ktp !~ '^reg/[0-9a-fA-F-]{36}\.(jpg|png)$' or v_profile !~ '^reg/[0-9a-fA-F-]{36}\.(jpg|png)$' then
    raise exception 'Foto dokumen belum terunggah dengan benar. Ulangi mengunggah.';
  end if;
  if v_ktp = v_profile then
    raise exception 'Foto KTP dan pas foto tidak boleh berkas yang sama.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'member-documents' and o.name = v_ktp) then
    raise exception 'Foto KTP belum terunggah. Coba ulangi.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'member-documents' and o.name = v_profile) then
    raise exception 'Pas foto belum terunggah. Coba ulangi.';
  end if;

  -- rem darurat terhadap spam
  if (select count(*) from public.member_registrations m where m.created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Pendaftaran sedang sangat ramai. Coba lagi beberapa menit lagi.';
  end if;

  -- NIK hanya boleh terdaftar satu kali (kecuali pendaftaran lamanya sudah ditolak)
  if exists (select 1 from public.member_registrations m where m.nik = v_nik and m.status <> 'ditolak') then
    raise exception 'NIK ini sudah terdaftar. Hubungi pengurus bila ingin memperbarui data.';
  end if;

  insert into public.member_registrations (
    full_name, nik, birth_place, birth_date, gender, phone, district, address, division,
    pledge_accepted, privacy_notice_version, privacy_acknowledged, ktp_object_key, profile_object_key
  ) values (
    v_name, v_nik, v_birth_place, p_birth_date, p_gender, v_phone, p_district, v_address, p_division,
    true, 'gmpi-privasi-2026-10-v1', true, v_ktp, v_profile
  );
  return 'terkirim';
end;
$$;

revoke all on function public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text) to anon, authenticated;
