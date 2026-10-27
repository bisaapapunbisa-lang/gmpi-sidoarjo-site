-- ============================================================================
-- GMPI DPD Sidoarjo: IURAN DICICIL PER BULAN
-- ----------------------------------------------------------------------------
-- Perubahan utama:
--   * Anggota TIDAK wajib membayar sekaligus. Satu tagihan bisa mencakup
--     beberapa bulan (mis. Januari–Desember 2026), tetapi anggota boleh memilih
--     bulan mana saja yang dibayar sekarang — minimal satu bulan.
--   * Setiap pembayaran menyimpan DAFTAR BULAN yang dibayar (kolom `periods`),
--     sehingga catatan menjadi per bulan: siapa lunas bulan apa.
--   * Anti-dobel-bayar memakai irisan daftar bulan, jadi pembayaran cicilan
--     tidak bisa bertumpuk dengan pembayaran lain.
--   * Fungsi baru `dues_members_ledger()` untuk rekap per anggota (matriks
--     bulan) di panel Admin — dasar menilai kesungguhan/kedisiplinan anggota.
--
-- Melanjutkan 202610270028 dan 202610280029. Aman dijalankan ulang.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Kolom daftar bulan yang dibayar
-- ---------------------------------------------------------------------------
alter table public.dues_payments add column if not exists periods text[];

alter table public.dues_payments drop constraint if exists dues_payments_periods_check;
alter table public.dues_payments add constraint dues_payments_periods_check
  check (
    periods is null
    or (
      cardinality(periods) between 1 and 24
      and array_to_string(periods, ',') ~ '^[0-9]{4}-[0-9]{2}(,[0-9]{4}-[0-9]{2}){0,23}$'
    )
  );

-- Isi otomatis dari data lama (rentang period + months → daftar bulan).
update public.dues_payments
set periods = public.dues_period_months(period, coalesce(months, 1))
where periods is null
  and public.dues_period_months(period, coalesce(months, 1)) is not null;

create index if not exists dues_payments_periods_idx on public.dues_payments using gin (periods);

-- ---------------------------------------------------------------------------
-- 2) Bantuan: daftar bulan efektif sebuah pembayaran
-- ---------------------------------------------------------------------------
create or replace function public.dues_payment_months(
  p_period text,
  p_months integer,
  p_periods text[]
)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_periods is not null and cardinality(p_periods) > 0 then p_periods
    else public.dues_period_months(p_period, coalesce(p_months, 1))
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Pemicu anti-dobel-bayar memakai daftar bulan
-- ---------------------------------------------------------------------------
create or replace function public.dues_payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_months text[];
  v_clash public.dues_payments;
begin
  if new.status <> 'terverifikasi' then
    return new;
  end if;

  v_months := public.dues_payment_months(new.period, new.months, new.periods);
  if v_months is null or cardinality(v_months) = 0 then
    raise exception 'Periode pembayaran tidak valid.';
  end if;

  select d.* into v_clash
  from public.dues_payments d
  where d.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and d.status = 'terverifikasi'
    and (
      (new.member_number is not null and d.member_number = new.member_number)
      or (new.member_number is null and d.member_number is null
          and lower(d.member_name) = lower(new.member_name))
    )
    and public.dues_payment_months(d.period, d.months, d.periods) && v_months
  limit 1;

  if found then
    raise exception 'Sebagian bulan sudah lunas (%). Batalkan verifikasi catatan lain lebih dulu bila ini pembetulan.', v_clash.period;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Publik: kirim klaim pembayaran — kini dengan daftar bulan
-- ---------------------------------------------------------------------------
drop function if exists public.submit_dues_payment(text,text,text,text,text,integer,text,date,text,integer,uuid);

create or replace function public.submit_dues_payment(
  p_member_name text,
  p_member_number text,
  p_district text,
  p_phone text,
  p_method text,
  p_amount integer,
  p_period text,
  p_paid_at date,
  p_note text default null,
  p_months integer default 1,
  p_invoice_id uuid default null,
  p_periods text[] default null
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
  v_months integer := greatest(1, least(12, coalesce(p_months, 1)));
  v_periods text[];
  v_invoice public.dues_invoices;
  v_allowed text[];
  v_invalid text;
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
  if v_number is not null and v_number !~* '^[A-Z0-9][A-Z0-9./-]{2,39}$' then
    raise exception 'Nomor anggota tidak valid. Periksa kembali dari kartu anggota.';
  end if;

  -- Bila nomor anggota tidak dikenali, simpan sebagai catatan nama saja.
  if v_number is not null and not exists (
    select 1 from public.member_cards c where c.member_number = v_number
  ) then
    v_number := null;
  end if;

  -- Tagihan menentukan batas bulan yang sah.
  if p_invoice_id is not null then
    select * into v_invoice from public.dues_invoices i where i.id = p_invoice_id;
    if not found then
      raise exception 'Tagihan tidak ditemukan. Muat ulang halaman iuran.';
    end if;
    if not (
      v_invoice.status = 'dibuka'
      or (v_invoice.status = 'draf' and v_invoice.publish_at is not null and v_invoice.publish_at <= now())
    ) then
      raise exception 'Tagihan ini belum dibuka atau sudah ditutup pengurus.';
    end if;
    v_period := v_invoice.period;
    v_allowed := public.dues_period_months(v_invoice.period, v_invoice.months);
  end if;

  -- Daftar bulan: dari pilihan anggota, atau diturunkan dari period + months.
  if p_periods is not null and cardinality(p_periods) > 0 then
    select coalesce(array_agg(distinct m order by m), '{}'::text[]) into v_periods
    from unnest(p_periods) as m
    where m ~ '^[0-9]{4}-[0-9]{2}$';
    if v_periods is null or cardinality(v_periods) = 0 then
      raise exception 'Bulan iuran tidak valid.';
    end if;
    if cardinality(v_periods) > 12 then
      raise exception 'Terlalu banyak bulan dalam satu pembayaran (maksimal 12).';
    end if;
  else
    if v_period !~ '^[0-9]{4}(-[0-9]{2})?$' then
      raise exception 'Periode iuran tidak valid.';
    end if;
    v_periods := public.dues_period_months(v_period, v_months);
  end if;

  -- Saat membayar lewat tagihan: bulan harus bagian dari rentang tagihan,
  -- dan nominal dihitung server (tidak bisa diubah dari browser).
  if v_invoice.id is not null then
    select m into v_invalid
    from unnest(v_periods) as m
    where not (v_allowed @> array[m])
    limit 1;
    if v_invalid is not null then
      raise exception 'Bulan % tidak termasuk tagihan ini (%).', v_invalid, v_invoice.title;
    end if;
    p_amount := v_invoice.nominal * cardinality(v_periods);
  end if;

  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception 'Jumlah pembayaran tidak wajar.';
  end if;

  -- Periode utama = bulan terawal, supaya tampilan lama tetap masuk akal.
  v_period := v_periods[1];
  v_months := cardinality(v_periods);

  -- Kiriman ganda (klik dua kali) dalam 12 jam: kembalikan catatan yang sudah ada.
  select * into v_existing
  from public.dues_payments d
  where lower(d.member_name) = lower(v_name)
    and d.phone = v_phone
    and d.created_at > now() - interval '12 hours'
    and d.status <> 'ditolak'
    and public.dues_payment_months(d.period, d.months, d.periods) && v_periods
  order by d.created_at desc
  limit 1;

  if found then
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  insert into public.dues_payments (
    member_name, member_number, district, phone, method, amount, period, months,
    periods, paid_at, note, source, invoice_id
  ) values (
    v_name, v_number, v_district, v_phone, v_method, p_amount, v_period, v_months,
    v_periods, p_paid_at, v_note, 'web', p_invoice_id
  )
  returning id, status into v_new_id, v_new_status;

  return jsonb_build_object(
    'id', v_new_id,
    'status', v_new_status,
    'duplicate', false,
    'periods', v_periods,
    'amount', p_amount
  );
end;
$$;

revoke all on function public.submit_dues_payment(text,text,text,text,text,integer,text,date,text,integer,uuid,text[]) from public;
grant execute on function public.submit_dues_payment(text,text,text,text,text,integer,text,date,text,integer,uuid,text[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Publik: cek status iuran sendiri — tampil daftar bulan
-- ---------------------------------------------------------------------------
drop function if exists public.dues_status(text,text);

create or replace function public.dues_status(p_nomor text, p_nama text)
returns table (
  period text,
  months integer,
  periods text[],
  amount integer,
  status text,
  paid_at date,
  verified_at timestamptz,
  invoice_title text
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
  select d.period,
         coalesce(d.months, 1),
         public.dues_payment_months(d.period, d.months, d.periods),
         d.amount,
         d.status,
         d.paid_at,
         d.verified_at,
         i.title
  from public.dues_payments d
  left join public.dues_invoices i on i.id = d.invoice_id
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
-- 6) Admin: rekap per anggota (matriks bulan) — dasar menilai kesungguhan
--    p_from / p_to dalam format YYYY-MM (inklusif).
-- ---------------------------------------------------------------------------
create or replace function public.dues_members_ledger(p_from text, p_to text)
returns table (
  member_number text,
  full_name text,
  district text,
  phone text,
  paid_months text[],
  pending_months text[],
  paid_amount bigint,
  last_paid date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from text := trim(coalesce(p_from, ''));
  v_to text := trim(coalesce(p_to, ''));
begin
  if not public.has_admin_role(array['owner','registrar','bendahara']::text[]) then
    raise exception 'Akun ini tidak berwenang membaca rekap iuran.';
  end if;
  if v_from !~ '^[0-9]{4}-[0-9]{2}$' or v_to !~ '^[0-9]{4}-[0-9]{2}$' then
    raise exception 'Rentang bulan harus format YYYY-MM.';
  end if;
  if v_from > v_to then
    raise exception 'Bulan awal harus sebelum bulan akhir.';
  end if;

  return query
  with kartu as (
    select c.member_number, c.full_name, c.district, r.phone
    from public.member_cards c
    left join public.member_registrations r on r.id = c.registration_id
    where c.status = 'aktif' and c.is_sample = false
  ),
  bayar as (
    select k.member_number,
           d.status,
           d.amount,
           d.paid_at,
           public.dues_payment_months(d.period, d.months, d.periods) as ms
    from kartu k
    join public.dues_payments d
      on (d.member_number = k.member_number
          or (d.member_number is null and lower(d.member_name) = lower(k.full_name)))
    where d.status in ('terverifikasi', 'menunggu')
  )
  select k.member_number,
         k.full_name,
         k.district,
         k.phone,
         coalesce((
           select array(select distinct x from bayar b, unnest(b.ms) as x
                        where b.member_number = k.member_number
                          and b.status = 'terverifikasi'
                          and x >= v_from and x <= v_to
                        order by x)
         ), '{}'::text[]) as paid_months,
         coalesce((
           select array(select distinct x from bayar b, unnest(b.ms) as x
                        where b.member_number = k.member_number
                          and b.status = 'menunggu'
                          and x >= v_from and x <= v_to
                        order by x)
         ), '{}'::text[]) as pending_months,
         coalesce((
           select sum(b.amount) from bayar b
           where b.member_number = k.member_number
             and b.status = 'terverifikasi'
             and exists (select 1 from unnest(b.ms) as x where x >= v_from and x <= v_to)
         ), 0)::bigint as paid_amount,
         (select max(b.paid_at) from bayar b
          where b.member_number = k.member_number and b.status = 'terverifikasi') as last_paid
  from kartu k
  order by coalesce((
      select count(distinct x) from bayar b, unnest(b.ms) as x
      where b.member_number = k.member_number
        and b.status = 'terverifikasi'
        and x >= v_from and x <= v_to
    ), 0), k.full_name;
end;
$$;

revoke all on function public.dues_members_ledger(text,text) from public;
grant execute on function public.dues_members_ledger(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Daftar belum lunas: satu periode (dipakai pengingat & pengaturan lama)
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
begin
  if not public.has_admin_role(array['owner','registrar','bendahara']::text[]) then
    raise exception 'Akun ini tidak berwenang membaca daftar iuran.';
  end if;
  if v_period !~ '^[0-9]{4}(-[0-9]{2})?$' then
    raise exception 'Periode iuran tidak valid.';
  end if;

  return query
  select c.member_number, c.full_name, c.district, r.phone
  from public.member_cards c
  left join public.member_registrations r on r.id = c.registration_id
  where c.status = 'aktif'
    and c.is_sample = false
    and not exists (
      select 1 from public.dues_payments d
      where d.status = 'terverifikasi'
        and public.dues_payment_months(d.period, d.months, d.periods)
            && public.dues_period_months(v_period, 1)
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

comment on column public.dues_payments.periods is
  'Daftar bulan yang dibayar (YYYY-MM). Satu pembayaran boleh 1 bulan saja (cicilan) atau beberapa bulan.';

-- ---------------------------------------------------------------------------
-- 8) Tagihan: periode 4 digit selalu berarti setahun penuh
--    Supaya "nominal per bulan × jumlah bulan" konsisten, periode '2026'
--    dengan jumlah bulan 1 dinormalkan menjadi 12 bulan (Januari–Desember).
-- ---------------------------------------------------------------------------
create or replace function public.dues_save_invoice(
  p_id uuid default null,
  p_title text default 'Iuran Keanggotaan',
  p_period text default null,
  p_months integer default 1,
  p_nominal integer default 10000,
  p_due_date date default null,
  p_note text default null,
  p_action text default 'draf',
  p_publish_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := left(trim(coalesce(p_title, '')), 100);
  v_period text := coalesce(nullif(trim(coalesce(p_period, '')), ''), to_char(current_date, 'YYYY-MM'));
  v_months integer := greatest(1, least(12, coalesce(p_months, 1)));
  v_note text := nullif(left(trim(coalesce(p_note, '')), 400), '');
  v_action text := lower(trim(coalesce(p_action, 'draf')));
  v_id uuid := p_id;
  v_row public.dues_invoices;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if not public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]) then
    raise exception 'Akun ini tidak berwenang mengatur tagihan iuran.';
  end if;
  if char_length(v_title) < 3 then
    raise exception 'Nama tagihan minimal 3 huruf.';
  end if;
  if v_period !~ '^[0-9]{4}(-[0-9]{2})?$' then
    raise exception 'Periode harus 4 digit tahun (2026) atau format 2026-10.';
  end if;
  if p_nominal is null or p_nominal < 1000 or p_nominal > 100000000 then
    raise exception 'Nominal tidak wajar (minimal Rp1.000).';
  end if;

  -- Periode tahunan = 12 bulan.
  if v_period ~ '^[0-9]{4}$' then
    v_months := 12;
  end if;

  if v_action not in ('draf','launch','schedule') then
    raise exception 'Aksi tagihan tidak dikenal.';
  end if;
  if v_action = 'schedule' and p_publish_at is null then
    raise exception 'Tanggal & jam peluncuran wajib diisi untuk penjadwalan.';
  end if;

  if v_id is null then
    insert into public.dues_invoices (title, period, months, nominal, due_date, note, created_by)
    values (v_title, v_period, v_months, p_nominal, p_due_date, v_note, v_email)
    returning * into v_row;
    v_id := v_row.id;
  else
    update public.dues_invoices
    set title = v_title,
        period = v_period,
        months = v_months,
        nominal = p_nominal,
        due_date = p_due_date,
        note = v_note
    where id = v_id
    returning * into v_row;
    if not found then
      raise exception 'Tagihan tidak ditemukan.';
    end if;
  end if;

  if v_action = 'launch' then
    perform public.dues_launch_invoice(v_id, null);
  elsif v_action = 'schedule' then
    perform public.dues_launch_invoice(v_id, p_publish_at);
  end if;

  select * into v_row from public.dues_invoices where id = v_id;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.dues_save_invoice(uuid,text,text,integer,integer,date,text,text,timestamptz) from public;
grant execute on function public.dues_save_invoice(uuid,text,text,integer,integer,date,text,text,timestamptz) to authenticated;
