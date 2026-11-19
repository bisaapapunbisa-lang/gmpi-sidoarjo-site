-- Pengaturan poster pimpinan terpisah dari logo dan konten lain.
-- Gambar bawaan tetap dipakai jika belum ada unggahan.
create table if not exists public.leadership_poster (
  id boolean primary key default true check (id),
  image_path text not null check (image_path ~ '^leadership/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  updated_at timestamptz not null default now()
);
alter table public.leadership_poster enable row level security;
grant select on public.leadership_poster to anon, authenticated;
grant insert, update, delete on public.leadership_poster to authenticated;

create policy "public reads leadership poster" on public.leadership_poster
  for select to anon, authenticated using (true);
create policy "editors manage leadership poster" on public.leadership_poster
  for all to authenticated
  using (public.has_admin_role(array['owner','content_editor']::text[]))
  with check (public.has_admin_role(array['owner','content_editor']::text[]));

-- Gunakan bucket publik yang sudah ada, tanpa mengubah konfigurasi bucket.
create policy "editors upload leadership posters" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'leadership'
    and public.has_admin_role(array['owner','content_editor']::text[]));
