-- GMPI DPD Sidoarjo: nomor WhatsApp piket siaga untuk tombol Darurat (/darurat).
-- * Diatur Pemilik / Editor Situs dari Admin → tab "Darurat".
-- * Bila kosong, tombol darurat memakai nomor WhatsApp toko.
-- * Website TIDAK menyimpan lokasi anggota; lokasi hanya dikirim lewat WhatsApp oleh anggota sendiri.
-- Aman dijalankan ulang.

alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in (
    'hero_lead','voice_intro','gallery_note','footer_slogan','site_logo',
    'shop_whatsapp','shop_bank','legal_npwp',
    'sos_whatsapp'
  ));

alter table public.site_content drop constraint if exists site_content_sos_whatsapp_check;
alter table public.site_content add constraint site_content_sos_whatsapp_check
  check (key <> 'sos_whatsapp' or value ->> 'text' = '' or value ->> 'text' ~ '^62[0-9]{8,13}$');

insert into public.site_content (key, value) values
  ('sos_whatsapp', jsonb_build_object('text', ''))
on conflict (key) do nothing;
