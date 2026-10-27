-- GMPI DPD Sidoarjo — formulir pendaftaran tanpa pertanyaan "Bidang pergerakan".
--
-- Keputusan pengurus: pilihan bidang di formulir /gabung membingungkan pendaftar
-- (isinya nama lembaga/bidang, bukan jabatan — jadi "Humas" tidak ada di sana),
-- sementara kolom "Jabatan pengurus" sudah tersedia. Pertanyaan itu dihapus dari
-- formulir. Di panel Admin, kolom Bidang TETAP ada untuk catatan internal.
--
-- Migrasi ini:
--   1. membolehkan `division` kosong (NULL) pada tabel pendaftaran;
--   2. membuat `submit_member_registration` menerima pendaftaran tanpa bidang
--      (p_division opsional), tapi tetap memvalidasi bila diisi;
--   3. membuat `owner_update_member_registration` menerima bidang kosong, sehingga
--      Pemilik dapat mengosongkan/mengisi bidang dari Admin.
--
-- Data lama tidak diubah. Aman dijalankan berulang.

-- 1) Bidang boleh kosong
alter table public.member_registrations alter column division drop not null;

do $$
declare c record;
begin
  -- buang semua check lama yang menyebut division
  for c in
    select conname from pg_constraint
     where conrelid = 'public.member_registrations'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%division%'
  loop
    execute format('alter table public.member_registrations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.member_registrations add constraint member_registrations_division_check
  check (division is null or division in (
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Squad Militansi — Pengamanan & Solidaritas',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Serikat Buruh, Tani & Nelayan (SB GMPI)',
    'Tagana — Tanggap Bencana',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa',
    'Seluruh bidang (Ketua DPD)'
  ));

-- 2) Fungsi pendaftaran: bidang opsional
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
  p_division text default null,
  p_jabatan text default null,
  p_ktp_key text default null,
  p_profile_key text default null
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
  v_division text := nullif(left(trim(coalesce(p_division, '')), 80), '');
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
  -- Bidang tidak lagi ditanyakan ke pendaftar (opsional). Bila diisi, tetap divalidasi.
  if v_division is not null and v_division not in (
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Squad Militansi — Pengamanan & Solidaritas',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Serikat Buruh, Tani & Nelayan (SB GMPI)',
    'Tagana — Tanggap Bencana',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa',
    'Seluruh bidang (Ketua DPD)'
  ) then
    raise exception 'Bidang pergerakan tidak valid.';
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
    v_kelurahan, v_rt, v_rw, v_pos, v_jabatan, v_kota, v_division,
    true, 'gmpi-privasi-2026-10-v1', true, v_ktp, v_profile
  );
  return 'terkirim';
end;
$$;

revoke all on function public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_member_registration(text, text, text, date, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- 3) Fungsi edit Pemilik: bidang boleh dikosongkan
create or replace function public.owner_update_member_registration(
  p_registration_id uuid,
  p_values jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.member_registrations%rowtype;
  v_full_name text;
  v_nik text;
  v_birth_place text;
  v_birth_date date;
  v_gender text;
  v_phone text;
  v_district text;
  v_address text;
  v_kelurahan text;
  v_rt text;
  v_rw text;
  v_kode_pos text;
  v_kota_luar text;
  v_division text;
  v_jabatan text;
  v_status text;
  v_changed_fields text[];
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'owner'));
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Akses ditolak: hanya Pemilik yang dapat mengubah data pendaftaran lengkap.' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'Perubahan data tidak valid atau kosong.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_values) as keys(key_name)
    where key_name not in (
      'full_name','nik','birth_place','birth_date','gender','phone','district','address',
      'kelurahan','rt','rw','kode_pos','kota_luar','division','jabatan','status'
    )
  ) then
    raise exception 'Kolom yang diminta tidak diizinkan untuk diubah.' using errcode = '22023';
  end if;

  select * into v_old
    from public.member_registrations
   where id = p_registration_id
   for update;
  if not found then
    raise exception 'Pendaftaran tidak ditemukan.' using errcode = 'P0002';
  end if;

  v_full_name := left(trim(regexp_replace(coalesce(p_values ->> 'full_name', v_old.full_name), '\s+', ' ', 'g')), 160);
  v_nik := trim(coalesce(p_values ->> 'nik', v_old.nik));
  v_birth_place := left(trim(coalesce(p_values ->> 'birth_place', v_old.birth_place)), 120);
  v_birth_date := case when p_values ? 'birth_date' then nullif(p_values ->> 'birth_date', '')::date else v_old.birth_date end;
  v_gender := coalesce(p_values ->> 'gender', v_old.gender);
  v_phone := left(trim(coalesce(p_values ->> 'phone', v_old.phone)), 40);
  v_district := coalesce(p_values ->> 'district', v_old.district);
  v_address := left(trim(regexp_replace(coalesce(p_values ->> 'address', v_old.address), '\s+', ' ', 'g')), 1000);
  v_kelurahan := case when p_values ? 'kelurahan' then nullif(left(trim(coalesce(p_values ->> 'kelurahan', '')), 80), '') else v_old.kelurahan end;
  v_rt := case when p_values ? 'rt' then nullif(left(trim(coalesce(p_values ->> 'rt', '')), 3), '') else v_old.rt end;
  v_rw := case when p_values ? 'rw' then nullif(left(trim(coalesce(p_values ->> 'rw', '')), 3), '') else v_old.rw end;
  v_kode_pos := case when p_values ? 'kode_pos' then nullif(left(trim(coalesce(p_values ->> 'kode_pos', '')), 5), '') else v_old.kode_pos end;
  v_kota_luar := case when p_values ? 'kota_luar' then nullif(left(trim(coalesce(p_values ->> 'kota_luar', '')), 80), '') else v_old.kota_luar end;
  v_division := case when p_values ? 'division' then nullif(btrim(coalesce(p_values ->> 'division', '')), '') else v_old.division end;
  v_jabatan := case when p_values ? 'jabatan' then nullif(left(trim(coalesce(p_values ->> 'jabatan', '')), 60), '') else v_old.jabatan end;
  v_status := coalesce(p_values ->> 'status', v_old.status);

  if char_length(v_full_name) < 1 or char_length(v_full_name) > 160 then
    raise exception 'Nama wajib diisi (maksimal 160 karakter).' using errcode = '22023';
  end if;
  if v_nik !~ '^[0-9]{16}$' then
    raise exception 'NIK harus tepat 16 digit angka.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.member_registrations r
     where r.nik = v_nik and r.id <> p_registration_id and r.status <> 'ditolak'
  ) then
    raise exception 'NIK tersebut sudah dipakai pendaftaran lain yang belum ditolak.' using errcode = '23505';
  end if;
  if char_length(v_birth_place) < 1 or v_birth_date is null or v_birth_date > current_date then
    raise exception 'Tempat/tanggal lahir tidak valid.' using errcode = '22023';
  end if;
  if v_gender not in ('Laki-laki','Perempuan') then
    raise exception 'Jenis kelamin tidak valid.' using errcode = '22023';
  end if;
  if char_length(v_phone) < 7 or char_length(v_phone) > 40 then
    raise exception 'Nomor kontak wajib diisi (maksimal 40 karakter).' using errcode = '22023';
  end if;
  if v_district not in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati',
    'Di luar Kab. Sidoarjo'
  ) then
    raise exception 'Kecamatan/domisili tidak valid.' using errcode = '22023';
  end if;
  if char_length(v_address) < 5 or char_length(v_address) > 1000 then
    raise exception 'Alamat wajib diisi (5–1000 karakter).' using errcode = '22023';
  end if;
  if p_values ? 'rt' and v_rt is not null and v_rt !~ '^[0-9]{1,3}$' then
    raise exception 'RT harus berupa 1–3 digit angka.' using errcode = '22023';
  end if;
  if p_values ? 'rw' and v_rw is not null and v_rw !~ '^[0-9]{1,3}$' then
    raise exception 'RW harus berupa 1–3 digit angka.' using errcode = '22023';
  end if;
  if p_values ? 'kode_pos' and v_kode_pos is not null and v_kode_pos !~ '^[0-9]{5}$' then
    raise exception 'Kode pos harus 5 digit angka.' using errcode = '22023';
  end if;
  -- Bidang boleh dikosongkan (pendaftar tidak lagi ditanya bidang).
  if v_division is not null and v_division not in (
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Squad Militansi — Pengamanan & Solidaritas',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Serikat Buruh, Tani & Nelayan (SB GMPI)',
    'Tagana — Tanggap Bencana',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa',
    'Seluruh bidang (Ketua DPD)'
  ) then
    raise exception 'Bidang pergerakan tidak valid.' using errcode = '22023';
  end if;
  if v_jabatan is not null and char_length(v_jabatan) > 60 then
    raise exception 'Jabatan maksimal 60 karakter.' using errcode = '22023';
  end if;
  if v_status not in ('menunggu_verifikasi','ditinjau','diterima','ditolak') then
    raise exception 'Status pendaftaran tidak valid.' using errcode = '22023';
  end if;

  select array_agg(key order by key) into v_changed_fields
    from jsonb_object_keys(p_values) as keys(key);

  update public.member_registrations
     set full_name = v_full_name,
         nik = v_nik,
         birth_place = v_birth_place,
         birth_date = v_birth_date,
         gender = v_gender,
         phone = v_phone,
         district = v_district,
         address = v_address,
         kelurahan = v_kelurahan,
         rt = v_rt,
         rw = v_rw,
         kode_pos = v_kode_pos,
         kota_luar = v_kota_luar,
         division = v_division,
         jabatan = v_jabatan,
         status = v_status
   where id = p_registration_id;

  insert into public.member_registration_edit_audit (registration_id, actor_email, changed_fields)
  values (p_registration_id, v_actor, v_changed_fields);

  return jsonb_build_object('ok', true, 'changed_fields', v_changed_fields);
end;
$$;

revoke all on function public.owner_update_member_registration(uuid, jsonb) from public, anon;
grant execute on function public.owner_update_member_registration(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
