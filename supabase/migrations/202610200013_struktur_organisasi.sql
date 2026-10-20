-- GMPI DPD Sidoarjo: Bagan struktur organisasi (susunan pengurus DPD) — AD/ART 2021 Pasal 9 ayat 2.
-- * Dewan Penasihat (3) dan Dewan Pembina (3)
-- * Ketua + Wakil Ketua I–III, Sekretaris + Wakil Sekretaris I–III, Bendahara + Wakil Bendahara I–III
-- * Departemen: dipimpin Wakil Ketua Departemen (ditambah/dihapus di Admin)
-- Publik boleh MEMBACA (bagan di beranda). Yang boleh mengubah: Pemilik & Editor situs.
-- Foto pengurus disimpan di bucket publik site-assets, folder pengurus/.
-- Aman dijalankan ulang (isi awal hanya dibuat bila tabel masih kosong).

create table if not exists public.org_structure (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in (
    'penasihat','pembina','ketua','wakil_ketua','sekretaris','wakil_sekretaris','bendahara','wakil_bendahara','departemen'
  )),
  jabatan text not null check (char_length(jabatan) between 2 and 80),
  department text check (department is null or char_length(department) <= 80),
  person_name text check (person_name is null or char_length(person_name) <= 120),
  photo_path text check (photo_path is null or photo_path ~ '^pengurus/[A-Za-z0-9._-]+$'),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists org_structure_sort_idx on public.org_structure (sort_order);

alter table public.org_structure enable row level security;
revoke all on table public.org_structure from public, anon, authenticated;
grant select on table public.org_structure to anon, authenticated;
grant insert, update, delete on table public.org_structure to authenticated;
grant all on table public.org_structure to service_role;

drop policy if exists "public reads org structure" on public.org_structure;
create policy "public reads org structure" on public.org_structure for select to anon, authenticated
using (true);

drop policy if exists "editors insert org structure" on public.org_structure;
create policy "editors insert org structure" on public.org_structure for insert to authenticated
with check (public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "editors update org structure" on public.org_structure;
create policy "editors update org structure" on public.org_structure for update to authenticated
using (public.has_admin_role(array['owner','content_editor']::text[]))
with check (public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "editors delete org structure" on public.org_structure;
create policy "editors delete org structure" on public.org_structure for delete to authenticated
using (public.has_admin_role(array['owner','content_editor']::text[]));

create or replace function public.org_structure_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  new.person_name := nullif(btrim(coalesce(new.person_name, '')), '');
  new.department := nullif(btrim(coalesce(new.department, '')), '');
  return new;
end;
$$;

drop trigger if exists org_structure_stamp on public.org_structure;
create trigger org_structure_stamp
before insert or update on public.org_structure
for each row execute function public.org_structure_stamp();

-- Isi awal (hanya bila kosong)
insert into public.org_structure (section, jabatan, sort_order)
select v.section, v.jabatan, v.sort_order
from (values
  ('penasihat','Dewan Penasihat',10),('penasihat','Dewan Penasihat',11),('penasihat','Dewan Penasihat',12),
  ('pembina','Dewan Pembina',20),('pembina','Dewan Pembina',21),('pembina','Dewan Pembina',22),
  ('ketua','Ketua DPD',30),
  ('wakil_ketua','Wakil Ketua I',40),('wakil_ketua','Wakil Ketua II',41),('wakil_ketua','Wakil Ketua III',42),
  ('sekretaris','Sekretaris',50),
  ('wakil_sekretaris','Wakil Sekretaris I',60),('wakil_sekretaris','Wakil Sekretaris II',61),('wakil_sekretaris','Wakil Sekretaris III',62),
  ('bendahara','Bendahara',70),
  ('wakil_bendahara','Wakil Bendahara I',80),('wakil_bendahara','Wakil Bendahara II',81),('wakil_bendahara','Wakil Bendahara III',82)
) as v(section, jabatan, sort_order)
where not exists (select 1 from public.org_structure);

-- Foto pengurus: bucket publik site-assets, folder pengurus/
grant select, insert, delete on table storage.objects to authenticated;

drop policy if exists "site editors list pengurus photos" on storage.objects;
create policy "site editors list pengurus photos" on storage.objects for select to authenticated
using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'pengurus'
  and public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "site editors upload pengurus photos" on storage.objects;
create policy "site editors upload pengurus photos" on storage.objects for insert to authenticated
with check (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'pengurus'
  and public.has_admin_role(array['owner','content_editor']::text[]));

drop policy if exists "site editors delete pengurus photos" on storage.objects;
create policy "site editors delete pengurus photos" on storage.objects for delete to authenticated
using (bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'pengurus'
  and public.has_admin_role(array['owner','content_editor']::text[]));
