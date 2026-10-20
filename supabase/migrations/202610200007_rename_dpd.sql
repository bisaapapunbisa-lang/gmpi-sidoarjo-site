-- GMPI DPD Sidoarjo: ganti sebutan "DPC" menjadi "DPD" pada teks yang tersimpan di database.
-- Aman dijalankan berulang kali.

update public.site_content
set value = jsonb_set(value, '{text}', to_jsonb(regexp_replace(value->>'text', '\mDPC\M', 'DPD', 'g')))
where value ? 'text' and value->>'text' ~ '\mDPC\M';

update public.member_cards
set jabatan = regexp_replace(jabatan, '\mDPC\M', 'DPD', 'g')
where jabatan ~ '\mDPC\M';

select 'site_content' as tabel, count(*) as sisa_dpc from public.site_content where value::text ~ '\mDPC\M'
union all
select 'member_cards', count(*) from public.member_cards where jabatan ~ '\mDPC\M';
