-- ============================================================================
-- GMPI DPD Sidoarjo: TAGIHAN IURAN (draf → diluncurkan → ditutup)
-- ----------------------------------------------------------------------------
-- Tujuan: pengurus bisa MENYIAPKAN tagihan lebih dulu (masih DRAF, tidak
-- terlihat anggota), lalu MELUNCUKANNYA kapan saja setelah rapat memutuskan —
-- atau menjadwalkan peluncuran otomatis pada tanggal & jam tertentu.
--
-- Isi migrasi:
--   1) Tabel public.dues_invoices (tagihan) + RLS + pemicu updated_at.
--   2) Kolom baru di dues_payments: invoice_id dan months (berlaku surut).
--   3) Ganti indeks unik lama dengan pemicu anti-dobel-bayar yang memahami
--      rentang bulan (satu pembayaran boleh mencakup beberapa bulan).
--   4) RPC publik:  dues_public_status(), submit_dues_payment(...) versi baru,
--                   dues_status(nomor, nama) versi baru.
--   5) RPC admin:   dues_save_invoice(...), dues_launch_invoice(...),
--                   dues_close_invoice(...), dues_delete_invoice(...),
--                   dues_unpaid_members(period).
-- Aman dijalankan ulang. Migrasi ini melanjutkan 202610270028.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabel tagihan
-- ---------------------------------------------------------------------------
create table if not exists public.dues_invoices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  period text not null check (period ~ '^[0-9]{4}(-[0-9]{2})?$'),
  months integer not null default 1 check (months between 1 and 12),
  nominal integer not null check (nominal between 1000 and 100000000),
  due_date date,
  note text check (note is null or char_length(note) <= 400),
  status text not null default 'draf' check (status in ('draf','dibuka','ditutup')),
  publish_at timestamptz,
  launched_at timestamptz,
  closed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'dibuka' or launched_at is not null)
);

create index if not exists dues_invoices_created_idx on public.dues_invoices (created_at desc);
create index if not exists dues_invoices_status_idx on public.dues_invoices (status, publish_at);

alter table public.dues_invoices enable row level security;
revoke all on table public.dues_invoices from public, anon;
grant select, insert, update, delete on table public.dues_invoices to authenticated;
grant all on table public.dues_invoices to service_role;

drop policy if exists "dues officers read invoices" on public.dues_invoices;
create policy "dues officers read invoices"
on public.dues_invoices for select to authenticated
using (public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]));

drop policy if exists "dues officers write invoices" on public.dues_invoices;
create policy "dues officers write invoices"
on public.dues_invoices for insert to authenticated
with check (public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]));

drop policy if exists "dues officers update invoices" on public.dues_invoices;
create policy "dues officers update invoices"
on public.dues_invoices for update to authenticated
using (public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]))
with check (public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]));

drop policy if exists "owner deletes invoices" on public.dues_invoices;
create policy "owner deletes invoices"
on public.dues_invoices for delete to authenticated
using (public.has_admin_role(array['owner']::text[]));

create or replace function public.dues_invoices_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dues_invoices_touch on public.dues_invoices;
create trigger dues_invoices_touch
before update on public.dues_invoices
for each row execute function public.dues_invoices_touch();

-- ---------------------------------------------------------------------------
-- 2) Kolom tambahan di catatan pembayaran
-- ---------------------------------------------------------------------------
alter table public.dues_payments
  add column if not exists invoice_id uuid references public.dues_invoices(id) on delete set null,
  add column if not exists months integer not null default 1;

alter table public.dues_payments drop constraint if exists dues_payments_months_check;
alter table public.dues_payments add constraint dues_payments_months_check
  check (months between 1 and 12);

create index if not exists dues_payments_invoice_idx on public.dues_payments (invoice_id);

-- ---------------------------------------------------------------------------
-- 3) Anti-dobel-bayar yang memahami rentang bulan
-- ---------------------------------------------------------------------------
-- Indeks unik lama hanya melihat satu periode, sehingga pembayaran 3 bulan
-- sekaligus tidak terlindungi. Diganti pemicu di bawah.
drop index if exists dues_payments_unique_verified;

-- Awal periode sebagai tanggal. '2026' → 1 Januari 2026, '2026-10' → 1 Okt 2026.
create or replace function public.dues_period_start(p text)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null then null
    when p ~ '^[0-9]{4}$' then make_date(substr(p, 1, 4)::int, 1, 1)
    when p ~ '^[0-9]{4}-[0-9]{2}$' then make_date(substr(p, 1, 4)::int, substr(p, 6, 2)::int, 1)
    else null
  end;
$$;

-- Daftar bulan yang dicakup satu pembayaran, contoh: {'2026-10','2026-11'}.
create or replace function public.dues_month_list(p_start date, p_months integer)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array(
      select to_char(m, 'YYYY-MM')
      from generate_series(p_start, p_start + (greatest(coalesce(p_months, 1), 1) - 1) * interval '1 month', interval '1 month') as m
    ),
    '{}'::text[]
  );
$$;

-- Rentang bulan sebuah periode. Periode 4 digit ('2026') tanpa jumlah bulan
-- dianggap mencakup seluruh tahun (12 bulan).
create or replace function public.dues_period_months(p_period text, p_months integer)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_period ~ '^[0-9]{4}$' and coalesce(p_months, 1) = 1
      then public.dues_month_list(make_date(substr(p_period, 1, 4)::int, 1, 1), 12)
    when p_period ~ '^[0-9]{4}$'
      then public.dues_month_list(make_date(substr(p_period, 1, 4)::int, 1, 1), coalesce(p_months, 1))
    else public.dues_month_list(public.dues_period_start(p_period), coalesce(p_months, 1))
  end;
$$;

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

  v_months := public.dues_period_months(new.period, new.months);
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
    and public.dues_period_months(d.period, d.months) && v_months
  limit 1;

  if found then
    raise exception 'Sebagian bulan sudah lunas (%). Batalkan verifikasi catatan lain lebih dulu bila ini pembetulan.', v_clash.period;
  end if;

  return new;
end;
$$;

drop trigger if exists dues_payments_guard on public.dues_payments;
create trigger dues_payments_guard
before insert or update on public.dues_payments
for each row execute function public.dues_payments_guard();

-- ---------------------------------------------------------------------------
-- 4) Publik: status tagihan yang sedang berlaku
--    * Hanya tagihan berstatus 'dibuka' yang tampil.
--    * Tagihan berjadwal (status 'draf' + publish_at lewat) otomatis dianggap
--      dibuka, jadi tidak perlu proses terjadwal di server.
-- ---------------------------------------------------------------------------
create or replace function public.dues_public_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with aktif as (
    select i.*
    from public.dues_invoices i
    where i.status = 'dibuka'
       or (i.status = 'draf' and i.publish_at is not null and i.publish_at <= now())
    order by coalesce(i.launched_at, i.publish_at) desc nulls last, i.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'has_invoices', exists (select 1 from public.dues_invoices),
    'active', (
      select jsonb_build_object(
        'id', a.id,
        'title', a.title,
        'period', a.period,
        'months', a.months,
        'nominal', a.nominal,
        'due_date', a.due_date,
        'note', a.note
      )
      from aktif a
    )
  );
$$;

revoke all on function public.dues_public_status() from public;
grant execute on function public.dues_public_status() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Publik: kirim klaim pembayaran (versi tagihan)
-- ---------------------------------------------------------------------------
drop function if exists public.submit_dues_payment(text,text,text,text,text,integer,text,date,text);

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
  p_invoice_id uuid default null
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
  v_invoice public.dues_invoices;
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
  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then
    raise exception 'Jumlah pembayaran tidak wajar.';
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

  -- Pembayaran harus mengikuti tagihan yang benar-benar sedang dibuka.
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
    v_months := v_invoice.months;
  end if;

  if v_period !~ '^[0-9]{4}(-[0-9]{2})?$' then
    raise exception 'Periode iuran tidak valid.';
  end if;

  -- Kiriman ganda (klik dua kali) dalam 12 jam: kembalikan catatan yang sudah ada.
  select * into v_existing
  from public.dues_payments d
  where lower(d.member_name) = lower(v_name)
    and d.period = v_period
    and d.phone = v_phone
    and d.created_at > now() - interval '12 hours'
    and d.status <> 'ditolak'
  order by d.created_at desc
  limit 1;

  if found then
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;

  insert into public.dues_payments (
    member_name, member_number, district, phone, method, amount, period, months,
    paid_at, note, source, invoice_id
  ) values (
    v_name, v_number, v_district, v_phone, v_method, p_amount, v_period, v_months,
    p_paid_at, v_note, 'web', p_invoice_id
  )
  returning id, status into v_new_id, v_new_status;

  return jsonb_build_object('id', v_new_id, 'status', v_new_status, 'duplicate', false);
end;
$$;

revoke all on function public.submit_dues_payment(text,text,text,text,text,integer,text,date,text,integer,uuid) from public;
grant execute on function public.submit_dues_payment(text,text,text,text,text,integer,text,date,text,integer,uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Publik: cek status iuran sendiri (kini menampilkan jumlah bulan)
-- ---------------------------------------------------------------------------
drop function if exists public.dues_status(text,text);

create or replace function public.dues_status(p_nomor text, p_nama text)
returns table (
  period text,
  months integer,
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
-- 7) Admin: simpan / luncurkan / jadwalkan / tutup / hapus tagihan
-- ---------------------------------------------------------------------------
create or replace function public.dues_save_invoice(
  p_id uuid default null,
  p_title text default 'Iuran Keanggotaan',
  p_period text default null,
  p_months integer default 1,
  p_nominal integer default 10000,
  p_due_date date default null,
  p_note text default null,
  p_action text default 'draf',       -- 'draf' | 'launch' | 'schedule'
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

create or replace function public.dues_launch_invoice(
  p_id uuid,
  p_publish_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.dues_invoices;
begin
  if not public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]) then
    raise exception 'Akun ini tidak berwenang meluncurkan tagihan.';
  end if;

  select * into v_row from public.dues_invoices where id = p_id;
  if not found then
    raise exception 'Tagihan tidak ditemukan.';
  end if;

  -- Hanya satu tagihan yang boleh berjalan pada satu waktu.
  update public.dues_invoices
  set status = 'ditutup',
      closed_at = now()
  where id <> p_id
    and (status = 'dibuka' or (status = 'draf' and publish_at is not null));

  if p_publish_at is null then
    update public.dues_invoices
    set status = 'dibuka',
        publish_at = null,
        launched_at = now(),
        closed_at = null
    where id = p_id
    returning * into v_row;
  else
    update public.dues_invoices
    set status = 'draf',
        publish_at = p_publish_at,
        launched_at = null,
        closed_at = null
    where id = p_id
    returning * into v_row;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.dues_launch_invoice(uuid,timestamptz) from public;
grant execute on function public.dues_launch_invoice(uuid,timestamptz) to authenticated;

create or replace function public.dues_close_invoice(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.dues_invoices;
begin
  if not public.has_admin_role(array['owner','content_editor','registrar','bendahara']::text[]) then
    raise exception 'Akun ini tidak berwenang menutup tagihan.';
  end if;

  update public.dues_invoices
  set status = 'ditutup',
      closed_at = now(),
      publish_at = null
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Tagihan tidak ditemukan.';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.dues_close_invoice(uuid) from public;
grant execute on function public.dues_close_invoice(uuid) to authenticated;

create or replace function public.dues_delete_invoice(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Hanya Pemilik yang dapat menghapus tagihan.';
  end if;

  select count(*) into v_used from public.dues_payments where invoice_id = p_id;
  if v_used > 0 then
    raise exception 'Tagihan ini sudah memiliki % catatan pembayaran. Tutup saja, jangan dihapus.', v_used;
  end if;

  delete from public.dues_invoices where id = p_id;
  if not found then
    raise exception 'Tagihan tidak ditemukan.';
  end if;

  return jsonb_build_object('deleted', true);
end;
$$;

revoke all on function public.dues_delete_invoice(uuid) from public;
grant execute on function public.dues_delete_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Admin: daftar anggota aktif yang belum lunas untuk periode tertentu
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
  select c.member_number,
         c.full_name,
         c.district,
         r.phone
  from public.member_cards c
  left join public.member_registrations r on r.id = c.registration_id
  where c.status = 'aktif'
    and c.is_sample = false
    and not exists (
      select 1 from public.dues_payments d
      where d.status = 'terverifikasi'
        and public.dues_period_months(d.period, d.months)
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

comment on table public.dues_invoices is
  'Tagihan iuran. Draf tidak terlihat publik; peluncuran bisa segera atau dijadwalkan (publish_at).';
