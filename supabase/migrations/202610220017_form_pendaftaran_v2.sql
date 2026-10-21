-- GMPI DPD Sidoarjo: Formulir pendaftaran v2.
-- * Alamat dicatat terstruktur: kelurahan/desa, RT, RW, kode pos (tidak lagi satu kolom bebas).
-- * Domisili boleh "Di luar Kab. Sidoarjo" (untuk saudara yang tinggal di luar kabupaten).
-- * Kolom opsional "jabatan" — dicatat bila pendaftar adalah pengurus.
-- * Fungsi pendaftaran diganti total (parameter berubah, yang lama dihapus).
-- Aman dijalankan ulang.

-- 1) Kolom baru
alter table public.member_registrations
  add column if not exists kelurahan text,
  add column if not exists rt text,
  add column if not exists rw text,
  add column if not exists kode_pos text,
  add column if not exists jabatan text,
  add column if not exists kota_luar text;

-- 2) Kecamatan boleh 18 Sidoarjo atau 'Di luar Kab. Sidoarjo'
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.member_registrations'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%district%'
  loop
    execute format('alter table public.member_registrations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.member_registrations add constraint member_registrations_district_check
  check (district in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati',
    'Di luar Kab. Sidoarjo'
  ));

-- 3) Fungsi pendaftaran v2 (parameter lama tidak lagi dipakai)
drop function if exists public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text);

create or replace function public.submit_member_registration(
  p_full_name text,
  p_nik text,
  p_birth_place text,
  p_birth_date date,
  p_gender text,
  p_phone text,
  p_district text,
  p_address_street text,
  p_kelurahan text,
  p_rt text,
  p_rw text,
  p_kode_pos text,
  p_kota_luar text,
  p_division text,
  p_jabatan text,
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
  v_street text := left(trim(regexp_replace(coalesce(p_address_street, ''), '\s+', ' ', 'g')), 300);
  v_kelurahan text := left(trim(coalesce(p_kelurahan, '')), 80);
  v_rt text := regexp_replace(coalesce(p_rt, ''), '\D', '', 'g');
  v_rw text := regexp_replace(coalesce(p_rw, ''), '\D', '', 'g');
  v_pos text := regexp_replace(coalesce(p_kode_pos, ''), '\D', '', 'g');
  v_kota text := left(trim(coalesce(p_kota_luar, '')), 80);
  v_jabatan text := nullif(left(trim(coalesce(p_jabatan, '')), 60), '');
  v_address text;
  v_ktp text := trim(coalesce(p_ktp_key, ''));
  v_profile text := trim(coalesce(p_profile_key, ''));
  v_luar boolean := coalesce(p_district, '') = 'Di luar Kab. Sidoarjo';
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

  if not v_luar and coalesce(p_district, '') not in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  ) then
    raise exception 'Pilih kecamatan domisili.';
  end if;

  if v_luar then
    if char_length(v_kota) < 2 then
      raise exception 'Isi kota/kabupaten domisili Anda.';
    end if;
    v_kelurahan := null; v_rt := null; v_rw := null; v_pos := null;
    v_address := v_street || ', ' || v_kota;
  else
    if v_kelurahan = '' then raise exception 'Pilih kelurahan/desa.'; end if;
    if v_rt !~ '^[0-9]{1,3}$' or v_rw !~ '^[0-9]{1,3}$' then
      raise exception 'RT dan RW diisi angka (boleh dua digit, cth: 02).';
    end if;
    if v_pos !~ '^[0-9]{5}$' then raise exception 'Kode pos tidak valid.'; end if;
    v_kota := null;
    v_address := v_street || ' RT ' || v_rt || '/RW ' || v_rw || ', Kel./Desa ' || v_kelurahan
      || ', Kec. ' || p_district || ', Kab. Sidoarjo ' || v_pos;
  end if;

  if char_length(v_street) < 5 then
    raise exception 'Isi nama jalan/gang/blok/nomor rumah.';
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
    full_name, nik, birth_place, birth_date, gender, phone, district, address,
    kelurahan, rt, rw, kode_pos, jabatan, kota_luar, division,
    pledge_accepted, privacy_notice_version, privacy_acknowledged, ktp_object_key, profile_object_key
  ) values (
    v_name, v_nik, v_birth_place, p_birth_date, p_gender, v_phone, p_district, v_address,
    v_kelurahan, v_rt, v_rw, v_pos, v_jabatan, v_kota, p_division,
    true, 'gmpi-privasi-2026-10-v1', true, v_ktp, v_profile
  );
  return 'terkirim';
end;
$$;

revoke all on function public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
