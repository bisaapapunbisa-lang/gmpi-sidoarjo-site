-- SOS hanya dapat dicatat oleh pemegang KTA aktif dengan nomor HP yang cocok
-- dengan nomor pendaftaran. WhatsApp tetap memakai satu nomor piket yang diatur Admin.

-- Hapus overload lama agar RETURNS TABLE dapat menambahkan nama resmi KTA.
drop function if exists public.submit_sos(text, text, text, text, text, double precision, double precision, real);

create function public.submit_sos(
  p_name text, p_member_number text, p_phone text, p_kind text, p_note text,
  p_lat double precision, p_lng double precision, p_accuracy real
)
returns table (id uuid, token text, member_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
  v_number text := nullif(upper(regexp_replace(coalesce(p_member_number, ''), '\s', '', 'g')), '');
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text;
  v_id uuid;
begin
  -- Buang data lama sesuai retensi yang sudah berlaku.
  delete from public.sos_alerts where created_at < now() - interval '7 days';

  if v_number is null or v_phone = '' then
    raise exception 'Nomor KTA dan HP terdaftar wajib diisi.';
  end if;
  if left(v_phone, 1) = '0' then v_phone := '62' || substr(v_phone, 2); end if;
  if v_phone !~ '^[0-9]{8,15}$' then
    raise exception 'Nomor KTA atau HP terdaftar tidak cocok. Periksa kembali data Anda.';
  end if;

  -- Verifikasi server-side: kartu aktif, bukan kartu contoh, terhubung ke pendaftaran
  -- yang diterima, dan nomor HP pendaftaran cocok setelah normalisasi Indonesia.
  select c.full_name into v_name
  from public.member_cards c
  join public.member_registrations r on r.id = c.registration_id
  where c.member_number = v_number
    and c.status = 'aktif'
    and c.is_sample = false
    and c.issued_at <= current_date
    and c.valid_until >= current_date
    and r.status = 'diterima'
    and (
      case
        when left(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 1) = '0'
          then '62' || substr(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 2)
        else regexp_replace(coalesce(r.phone, ''), '\D', '', 'g')
      end
    ) = v_phone
  limit 1;

  if v_name is null then
    raise exception 'Nomor KTA atau HP terdaftar tidak cocok, atau KTA tidak aktif.';
  end if;

  -- Jangan izinkan pengiriman berulang selama alert anggota masih ditangani.
  if exists (
    select 1 from public.sos_alerts a
    where a.member_number = v_number
      and a.status in ('baru','diterima','menuju')
      and a.created_at > now() - interval '3 hours'
  ) then
    raise exception 'Permintaan darurat Anda sudah tercatat dan masih ditangani Tim Siaga.';
  end if;

  -- Rem darurat terhadap spam.
  if (select count(*) from public.sos_alerts a where a.created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Terlalu banyak permintaan dalam waktu singkat. Hubungi piket lewat WhatsApp / 112.';
  end if;
  if (select count(*) from public.sos_alerts a
      where a.phone = v_phone and a.created_at > now() - interval '5 minutes') >= 3 then
    raise exception 'Permintaan dari nomor ini sudah tercatat. Tim Siaga sedang memprosesnya.';
  end if;

  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    p_lat := null; p_lng := null; p_accuracy := null;
  end if;

  insert into public.sos_alerts (name, member_number, phone, kind, note, lat, lng, accuracy, location_updated_at, member_verified, token_hash)
  values (
    left(v_name, 60), v_number, v_phone,
    left(coalesce(nullif(trim(p_kind), ''), 'Masalah lain'), 40),
    nullif(left(trim(coalesce(p_note, '')), 240), ''),
    p_lat, p_lng, case when p_accuracy is null then null else greatest(p_accuracy, 0) end,
    case when p_lat is null then null else now() end,
    true,
    encode(extensions.digest(v_token, 'sha256'), 'hex')
  )
  returning sos_alerts.id into v_id;

  return query select v_id, v_token, v_name;
end;
$$;

-- Token sesi yang lama pun hanya sah selama alert memang berasal dari KTA aktif
-- yang terhubung ke pendaftaran dengan nomor HP tersebut.
create or replace function public.sos_status(p_id uuid, p_token text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.status
  from public.sos_alerts a
  join public.member_cards c
    on c.member_number = a.member_number
   and c.status = 'aktif'
   and c.is_sample = false
   and c.issued_at <= current_date
   and c.valid_until >= current_date
  join public.member_registrations r
    on r.id = c.registration_id
   and r.status = 'diterima'
  where a.id = p_id
    and a.member_verified = true
    and a.phone = case
      when left(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 1) = '0'
        then '62' || substr(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 2)
      else regexp_replace(coalesce(r.phone, ''), '\D', '', 'g')
    end
    and a.status in ('baru','diterima','menuju')
    and a.created_at > now() - interval '3 hours'
    and a.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  limit 1;
$$;

revoke all on function public.submit_sos(text, text, text, text, text, double precision, double precision, real) from public;
revoke all on function public.sos_status(uuid, text) from public;
grant execute on function public.submit_sos(text, text, text, text, text, double precision, double precision, real) to anon, authenticated;
grant execute on function public.sos_status(uuid, text) to anon, authenticated;
