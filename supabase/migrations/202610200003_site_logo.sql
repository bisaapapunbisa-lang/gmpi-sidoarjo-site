-- GMPI DPC Sidoarjo: logo situs yang dapat diganti dari panel Admin.
-- Hanya Pemilik dan Editor Situs yang boleh mengunggah, memilih, atau menghapus logo.
-- Pengunjung hanya dapat melihat file logo melalui URL publik; daftar file tidak dibuka untuk publik.

-- 1) Izinkan kunci konten "site_logo". Nilainya berupa path file di bucket site-assets,
--    contoh: {"text": "logos/1729400000000-ab12cd.webp"}. Teks kosong = logo bawaan situs.
alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in ('hero_lead','voice_intro','gallery_note','footer_slogan','site_logo'));

alter table public.site_content drop constraint if exists site_content_logo_path_check;
alter table public.site_content add constraint site_content_logo_path_check
  check (
    key <> 'site_logo'
    or value ->> 'text' = ''
    or value ->> 'text' ~ '^logos/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
  );

insert into public.site_content (key, value)
values ('site_logo', jsonb_build_object('text', ''))
on conflict (key) do nothing;

-- 2) Bucket publik khusus aset tampilan situs (bukan untuk data pribadi).
--    Maksimal 2 MB, hanya PNG/JPEG/WebP (SVG sengaja tidak diizinkan).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, delete on table storage.objects to authenticated;

drop policy if exists "site editors list site logos" on storage.objects;
create policy "site editors list site logos"
on storage.objects for select to authenticated
using (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'logos'
  and public.has_admin_role(array['owner','content_editor']::text[])
);

drop policy if exists "site editors upload site logos" on storage.objects;
create policy "site editors upload site logos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'logos'
  and public.has_admin_role(array['owner','content_editor']::text[])
);

drop policy if exists "site editors delete site logos" on storage.objects;
create policy "site editors delete site logos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'site-assets'
  and (storage.foldername(name))[1] = 'logos'
  and public.has_admin_role(array['owner','content_editor']::text[])
);
