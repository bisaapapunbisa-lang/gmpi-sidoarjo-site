-- GMPI Sidoarjo: Toko perlengkapan organisasi + pengaturan legalitas/pembayaran.
-- * Katalog barang dikelola Pemilik / Editor Situs dari panel Admin.
-- * Pengunjung hanya bisa melihat barang yang diaktifkan.
-- * Pesanan dikirim ke WhatsApp admin; website TIDAK menyimpan data pembeli.

-- 1) Pengaturan tambahan di site_content
alter table public.site_content drop constraint if exists site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in (
    'hero_lead','voice_intro','gallery_note','footer_slogan','site_logo',
    'shop_whatsapp','shop_bank','legal_npwp'
  ));

alter table public.site_content drop constraint if exists site_content_shop_whatsapp_check;
alter table public.site_content add constraint site_content_shop_whatsapp_check
  check (key <> 'shop_whatsapp' or value ->> 'text' = '' or value ->> 'text' ~ '^62[0-9]{8,13}$');

insert into public.site_content (key, value) values
  ('shop_whatsapp', jsonb_build_object('text', '')),
  ('shop_bank', jsonb_build_object('text', 'Bank bjb · 0163336219100 · a.n. GMPI DPD SIDOARJO')),
  ('legal_npwp', jsonb_build_object('text', ''))
on conflict (key) do nothing;

-- 2) Katalog barang
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  category text not null default 'Atribut' check (char_length(category) between 2 and 40),
  description text not null default '' check (char_length(description) <= 600),
  price integer not null default 0 check (price between 0 and 100000000),
  sizes text[] not null default '{}' check (coalesce(array_length(sizes, 1), 0) <= 12),
  image_path text check (image_path is null or image_path ~ '^products/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  stock_status text not null default 'tersedia' check (stock_status in ('tersedia','pre-order','habis')),
  is_active boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shop_products_sort_idx on public.shop_products (sort_order, created_at);

alter table public.shop_products enable row level security;
revoke all on table public.shop_products from public;
grant select on table public.shop_products to anon, authenticated;
grant insert, update, delete on table public.shop_products to authenticated;
grant all on table public.shop_products to service_role;

drop policy if exists "public reads active products" on public.shop_products;
create policy "public reads active products"
on public.shop_products for select to anon, authenticated
using (is_active = true or public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "shop editors manage products" on public.shop_products;
create policy "shop editors manage products"
on public.shop_products for all to authenticated
using (public.has_admin_role(array['owner','content_editor']::text[]))
with check (public.has_admin_role(array['owner','content_editor']::text[]));

-- 3) Foto barang di bucket publik site-assets, folder products/
drop policy if exists "shop editors list product images" on storage.objects;
create policy "shop editors list product images"
on storage.objects for select to authenticated
using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'products'
       and public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "shop editors upload product images" on storage.objects;
create policy "shop editors upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'products'
            and public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "shop editors delete product images" on storage.objects;
create policy "shop editors delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'products'
       and public.has_admin_role(array['owner','content_editor']::text[]));

-- 4) Draf barang (NONAKTIF, harga 0). Lengkapi harga & foto di Admin lalu aktifkan.
insert into public.shop_products (name, category, description, price, sizes, sort_order)
select * from (values
  ('Seragam PDH GMPI', 'Seragam', 'Pakaian Dinas Harian lengkap dengan atribut organisasi.', 0, array['S','M','L','XL','XXL','XXXL'], 10),
  ('Seragam PDL GMPI', 'Seragam', 'Pakaian Dinas Lapangan untuk kegiatan dan aksi.', 0, array['S','M','L','XL','XXL','XXXL'], 20),
  ('Kaos GMPI', 'Kaos & Jaket', 'Kaos organisasi dengan lambang GMPI.', 0, array['S','M','L','XL','XXL','XXXL'], 30),
  ('Jaket GMPI', 'Kaos & Jaket', 'Jaket organisasi.', 0, array['S','M','L','XL','XXL','XXXL'], 40),
  ('Topi GMPI', 'Atribut', 'Topi dengan bordir lambang GMPI.', 0, array[]::text[], 50),
  ('Emblem / Badge Bordir', 'Atribut', 'Emblem lambang GMPI untuk seragam.', 0, array[]::text[], 60),
  ('Pin Lambang GMPI', 'Atribut', 'Pin logam lambang organisasi.', 0, array[]::text[], 70),
  ('Bendera GMPI', 'Perlengkapan', 'Bendera organisasi untuk sekretariat dan kegiatan.', 0, array[]::text[], 80),
  ('Stiker GMPI', 'Perlengkapan', 'Stiker lambang GMPI.', 0, array[]::text[], 90),
  ('Cetak Kartu Tanda Anggota', 'Keanggotaan', 'Cetak KTA PVC dengan QR verifikasi (khusus anggota terdaftar).', 0, array[]::text[], 100)
) as seed(name, category, description, price, sizes, sort_order)
where not exists (select 1 from public.shop_products);
