-- Allow a DPD Chair to be classified across all divisions in the Owner editor.
-- Run after migration 024_owner_edit_member_details.sql.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.member_registrations'::regclass
       and contype = 'c' and pg_get_constraintdef(oid) ilike '%division%'
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
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa',
    'Seluruh bidang (Ketua DPD)'
  ));

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
  v_division := coalesce(p_values ->> 'division', v_old.division);
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
  if v_division not in (
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


revoke all on function public.owner_update_member_registration(uuid,jsonb) from public, anon;
grant execute on function public.owner_update_member_registration(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
