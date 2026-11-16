-- Laporan iuran berjenjang GMPI DPD Sidoarjo.
-- Keputusan akses (disepakati DPD):
--   1) RINGKASAN laporan boleh dilihat publik (hanya angka gabungan).
--   2) RINCIAN laporan hanya untuk ANGGOTA TERVERIFIKASI — identitas dicocokkan
--      di server dengan kartu anggota (nomor + nama), bukan sekadar disembunyikan
--      di tampilan. Kartu sampel dan kartu dicabut tidak mendapat akses.
--   3) BENDAHARA (dan Pemilik) dapat MENERBITKAN laporan langsung dari panel
--      Admin tanpa antre persetujuan.
-- Aman dijalankan ulang (idempoten). Tidak menyentuh data pembayaran.

create table if not exists public.dues_reports (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.dues_invoices(id) on delete cascade,
  title text not null,
  period text not null,
  months integer not null default 1,
  nominal integer not null,
  due_date date,
  note text,
  status text not null default 'diterbitkan' check (status in ('diterbitkan','ditarik')),
  published_at timestamptz,
  published_by text,
  withdrawn_at timestamptz,
  withdrawn_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dues_reports enable row level security;
revoke all on table public.dues_reports from public, anon, authenticated;
grant select on table public.dues_reports to authenticated;
grant all on table public.dues_reports to service_role;

drop policy if exists "pengurus iuran membaca laporan" on public.dues_reports;
-- Panel Admin membaca status laporan langsung dari tabel (daftar terbit/tidak),
-- tetapi hanya untuk peran iuran. Publik sama sekali tidak membaca tabel ini.
create policy "pengurus iuran membaca laporan" on public.dues_reports
  for select to authenticated
  using (public.has_admin_role(array['owner','registrar','bendahara']::text[]));

-- ---------------------------------------------------------------------------
-- RINGKASAN PUBLIK — anon boleh memanggil; hasilnya hanya agregat tanpa nama.
-- Pembayaran yang dihitung: status 'terverifikasi' yang terikat ke tagihan
-- laporan (invoice_id cocok, atau entri manual bendahara dengan periode sama).
-- ---------------------------------------------------------------------------
create or replace function public.dues_report_public_summary()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  with lap as (
    select r.*
    from public.dues_reports r
    where r.status = 'diterbitkan'
    order by r.published_at desc nulls last
    limit 1
  ), stat as (
    select
      count(*)::int as entries,
      count(distinct coalesce(nullif(d.member_number, ''), 'nama:' || lower(trim(d.member_name))))::int as payers,
      coalesce(sum(d.amount), 0)::bigint as collected,
      max(d.verified_at) as last_verified_at
    from public.dues_payments d
    where d.status = 'terverifikasi'
      and exists (
        select 1 from lap
        where d.invoice_id = lap.invoice_id
           or (d.invoice_id is null and d.period = lap.period)
      )
  )
  select jsonb_build_object(
    'has_report', exists (select 1 from lap),
    'report', (
      select jsonb_build_object(
        'title', l.title,
        'period', l.period,
        'months', l.months,
        'nominal', l.nominal,
        'due_date', l.due_date,
        'note', l.note,
        'published_at', l.published_at
      )
      from lap l
    ),
    'stats', (
      select jsonb_build_object(
        'entries', s.entries,
        'payers', s.payers,
        'collected', s.collected,
        'last_verified_at', s.last_verified_at,
        'members_scope', (
          select count(*)::int
          from public.member_cards c
          where c.is_sample = false and c.status in ('aktif','nonaktif')
        )
      )
      from stat s
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- RINCIAN ANGGOTA — gerbang verifikasi kartu anggota ditegakkan penuh di
-- server (SECURITY DEFINER): nomor anggota + nama harus cocok dengan kartu
-- non-sampel berstatus aktif/nonaktif. Kegagalan sengaja memakai pesan yang
-- sama agar tidak membocorkan kolom mana yang salah (pola dues_status).
-- Rincian menampilkan pembayaran terverifikasi tanpa nomor WhatsApp/catatan.
-- ---------------------------------------------------------------------------
create or replace function public.dues_report_member_detail(p_nomor text, p_nama text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_number text := upper(trim(coalesce(p_nomor, '')));
  v_name text := trim(coalesce(p_nama, ''));
  v_card public.member_cards;
  v_report public.dues_reports;
  v_denied text := 'Data tidak cocok. Periksa nomor anggota dan nama sesuai kartu anggota.';
begin
  if char_length(v_number) < 3 or char_length(v_number) > 40 then
    raise exception '%', v_denied;
  end if;
  if char_length(v_name) < 2 then
    raise exception '%', v_denied;
  end if;

  select * into v_card
  from public.member_cards c
  where c.member_number = v_number
    and lower(c.full_name) = lower(v_name)
    and c.is_sample = false
    and c.status in ('aktif','nonaktif')
  limit 1;

  if not found then
    raise exception '%', v_denied;
  end if;

  select * into v_report
  from public.dues_reports r
  where r.status = 'diterbitkan'
  order by r.published_at desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object('has_report', false);
  end if;

  return jsonb_build_object(
    'has_report', true,
    'report', jsonb_build_object(
      'title', v_report.title,
      'period', v_report.period,
      'months', v_report.months,
      'nominal', v_report.nominal,
      'due_date', v_report.due_date,
      'note', v_report.note,
      'published_at', v_report.published_at
    ),
    'verified_member', jsonb_build_object(
      'member_number', v_card.member_number,
      'full_name', v_card.full_name,
      'district', v_card.district
    ),
    'entries', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_name', d.member_name,
          'district', d.district,
          'periods', public.dues_payment_months(d.period, d.months, d.periods),
          'months', coalesce(d.months, 1),
          'amount', d.amount,
          'paid_at', d.paid_at,
          'verified_at', d.verified_at
        )
        order by lower(d.member_name), d.paid_at desc
      )
      from public.dues_payments d
      where d.status = 'terverifikasi'
        and (d.invoice_id = v_report.invoice_id
             or (d.invoice_id is null and d.period = v_report.period))
    ), '[]'::jsonb)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- TERBITKAN LANGSUNG — Pemilik & Bendahara. Satu laporan per tagihan;
-- menerbitkan ulang memperbarui cuplikan tanggal/nominal dan stempel penerbit.
-- ---------------------------------------------------------------------------
create or replace function public.dues_publish_report(p_invoice_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.dues_invoices;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 400), '');
  v_row public.dues_reports;
begin
  if not public.has_admin_role(array['owner','bendahara']::text[]) then
    raise exception 'Hanya Pemilik atau Bendahara yang dapat menerbitkan laporan iuran.';
  end if;
  if p_invoice_id is null then
    raise exception 'Tagihan laporan belum dipilih.';
  end if;

  select * into v_inv from public.dues_invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'Tagihan tidak ditemukan.';
  end if;
  if v_inv.status not in ('dibuka','ditutup') then
    raise exception 'Laporan hanya bisa diterbitkan untuk tagihan yang sudah diluncurkan.';
  end if;

  insert into public.dues_reports
    (invoice_id, title, period, months, nominal, due_date, note, status, published_at, published_by)
  values
    (v_inv.id, v_inv.title, v_inv.period, v_inv.months, v_inv.nominal, v_inv.due_date,
     coalesce(v_note, v_inv.note), 'diterbitkan', now(), v_email)
  on conflict (invoice_id) do update
    set title = excluded.title,
        period = excluded.period,
        months = excluded.months,
        nominal = excluded.nominal,
        due_date = excluded.due_date,
        note = excluded.note,
        status = 'diterbitkan',
        published_at = excluded.published_at,
        published_by = excluded.published_by,
        withdrawn_at = null,
        withdrawn_by = null,
        updated_at = now()
  returning * into v_row;

  return to_jsonb(v_row);
end;
$function$;

-- ---------------------------------------------------------------------------
-- TARIK LAPORAN dari publik — Pemilik & Bendahara.
-- ---------------------------------------------------------------------------
create or replace function public.dues_withdraw_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row public.dues_reports;
begin
  if not public.has_admin_role(array['owner','bendahara']::text[]) then
    raise exception 'Hanya Pemilik atau Bendahara yang dapat menarik laporan iuran.';
  end if;

  update public.dues_reports
  set status = 'ditarik',
      withdrawn_at = now(),
      withdrawn_by = v_email,
      updated_at = now()
  where id = p_report_id
    and status = 'diterbitkan'
  returning * into v_row;

  if not found then
    raise exception 'Laporan tidak ditemukan atau sudah ditarik.';
  end if;

  return to_jsonb(v_row);
end;
$function$;

-- Pola akses mengikuti fungsi iuran yang sudah ada: dipanggil lewat API publik,
-- pagar peran/validasi ada di dalam fungsi (SECURITY DEFINER).
grant execute on function public.dues_report_public_summary() to anon, authenticated;
grant execute on function public.dues_report_member_detail(text, text) to anon, authenticated;
grant execute on function public.dues_publish_report(uuid, text) to anon, authenticated;
grant execute on function public.dues_withdraw_report(uuid) to anon, authenticated;
