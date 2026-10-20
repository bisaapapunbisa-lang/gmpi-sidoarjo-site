-- GMPI DPD Sidoarjo: sesuaikan sebutan tingkatan dengan AD/ART GMPI 2021
-- (DPD = kabupaten, DPC = kecamatan, Ranting = desa). Aman dijalankan berulang kali.

update public.site_content
set value = jsonb_set(value, '{text}', to_jsonb(
  replace(replace(replace(value->>'text',
    'LBH DPC', 'LBH DPD'),
    'DPC/PAC', 'DPD/DPC'),
    'DPD/PAC', 'DPD/DPC')))
where value ? 'text'
  and (value->>'text' like '%LBH DPC%' or value->>'text' like '%/PAC%');

update public.member_cards
set jabatan = regexp_replace(jabatan, '\mPAC\M', 'DPC', 'g')
where jabatan ~ '\mPAC\M';

select key, value->>'text' as teks
from public.site_content
where key in ('voice_intro', 'gallery_note');
