-- Aduan langsung ke panel LBH; hak SELECT/UPDATE dan kebijakan RLS tetap.
-- Hanya laporan yang dibuat oleh fungsi ini yang termasuk penghapusan terjadwal.
alter table public.citizen_reports drop constraint citizen_reports_topic_check;
alter table public.citizen_reports add constraint citizen_reports_topic_check
  check (topic in ('Lingkungan', 'Ketidakadilan sosial', 'Sengketa / persoalan hukum', 'Hak pekerja', 'Kebencanaan / Tagana', 'Lainnya'));

create or replace function public.submit_citizen_report(
  p_name text, p_contact text, p_district text, p_topic text,
  p_summary text, p_contact_consent boolean
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_contact text := pg_catalog.btrim(coalesce(p_contact, ''));
  v_district text := pg_catalog.btrim(coalesce(p_district, ''));
  v_topic text := pg_catalog.btrim(coalesce(p_topic, ''));
  v_summary text := pg_catalog.btrim(coalesce(p_summary, ''));
begin
  if pg_catalog.char_length(v_name) not between 1 and 120
     or pg_catalog.char_length(v_contact) not between 5 and 40
     or pg_catalog.char_length(v_summary) not between 5 and 5000
     or p_contact_consent is distinct from true then
    raise exception 'Periksa nama, kontak, ringkasan dan persetujuan.' using errcode = '22023';
  end if;
  if v_district not in ('Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik','Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati')
     or v_topic not in ('Lingkungan','Ketidakadilan sosial','Sengketa / persoalan hukum','Hak pekerja','Kebencanaan / Tagana','Lainnya') then
    raise exception 'Periksa kecamatan dan topik aduan.' using errcode = '22023';
  end if;

  -- Batas sederhana pada seluruh kiriman dan kontak yang sama. Ini bukan
  -- pengganti CAPTCHA/WAF; kontak bisa dipalsukan dan batas global bisa disalahgunakan.
  -- Lock menjamin permintaan yang bersamaan tidak menerobos hitungan.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('gmpi_citizen_report_submit'));
  if (select count(*) from public.citizen_reports where created_at > pg_catalog.now() - interval '1 minute') >= 20
     or (select count(*) from public.citizen_reports
         where created_at > pg_catalog.now() - interval '1 hour'
           and pg_catalog.lower(pg_catalog.btrim(contact)) = pg_catalog.lower(v_contact)) >= 3 then
    raise exception 'Terlalu banyak permintaan. Coba lagi nanti.' using errcode = 'P0001';
  end if;

  insert into public.citizen_reports
    (name, contact, district, topic, summary, contact_consent, privacy_notice_version, retention_until)
  values (v_name, v_contact, v_district, v_topic, v_summary, true, 'aduan-lbh-v1', (current_date + interval '1 month')::date);
end;
$$;
revoke all on function public.submit_citizen_report(text,text,text,text,text,boolean) from public;
grant execute on function public.submit_citizen_report(text,text,text,text,text,boolean) to anon, authenticated;

-- Pembersihan hanya aduan yang masuk melalui alur baru, berdasarkan batas tanggal.
-- pg_cron berjalan pada jam UTC, dan tidak mengubah pendaftaran anggota atau data lain.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'gmpi-hapus-aduan-kedaluwarsa', '0 0 * * *',
  $cron$delete from public.citizen_reports
    where privacy_notice_version = 'aduan-lbh-v1'
      and retention_until is not null
      and retention_until <= (now() at time zone 'UTC')::date$cron$
);
