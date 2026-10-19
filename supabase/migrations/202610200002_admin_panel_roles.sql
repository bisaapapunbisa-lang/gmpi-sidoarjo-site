-- GMPI DPC Sidoarjo: role-based admin access.
-- Apply only after 202610200001_private_intake.sql succeeded.
-- There is deliberately no public/self-signup path and no browser use of service_role.

create table if not exists public.admin_profiles (
  email text not null check (email = lower(email)),
  role text not null check (role in ('owner','content_editor','lbh_officer','registrar')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (email, role)
);

alter table public.admin_profiles enable row level security;
revoke all on table public.admin_profiles from public, anon;
grant select, insert, update, delete on table public.admin_profiles to authenticated;
grant all on table public.admin_profiles to service_role;

-- SECURITY DEFINER avoids recursive RLS lookups; the function only returns a boolean.
create or replace function public.has_admin_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_profiles as p
    where p.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and p.active = true
      and p.role = any (allowed_roles)
  );
$$;

revoke all on function public.has_admin_role(text[]) from public;
grant execute on function public.has_admin_role(text[]) to anon, authenticated;

drop policy if exists "admin can read own role or owner reads all" on public.admin_profiles;
create policy "admin can read own role or owner reads all"
on public.admin_profiles for select to authenticated
using (
  email = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_admin_role(array['owner']::text[])
);

drop policy if exists "owner manages admin roles" on public.admin_profiles;
create policy "owner manages admin roles"
on public.admin_profiles for all to authenticated
using (public.has_admin_role(array['owner']::text[]))
with check (public.has_admin_role(array['owner']::text[]));

create table if not exists public.site_content (
  key text primary key check (key in ('hero_lead','voice_intro','gallery_note','footer_slogan')),
  value jsonb not null check (jsonb_typeof(value) = 'object' and jsonb_typeof(value -> 'text') = 'string'),
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
revoke all on table public.site_content from public;
grant select on table public.site_content to anon, authenticated;
grant insert, update, delete on table public.site_content to authenticated;
grant all on table public.site_content to service_role;

drop policy if exists "public reads published site content" on public.site_content;
create policy "public reads published site content"
on public.site_content for select to anon, authenticated
using (true);

drop policy if exists "content editors manage public site content" on public.site_content;
create policy "content editors manage public site content"
on public.site_content for all to authenticated
using (public.has_admin_role(array['owner','content_editor']::text[]))
with check (public.has_admin_role(array['owner','content_editor']::text[]));

insert into public.site_content (key, value) values
  ('hero_lead', jsonb_build_object('text', 'Pergerakan lokal yang tumbuh bersama masyarakat. Hadir untuk menguatkan solidaritas, mengawal aspirasi, dan mengabdi di 18 kecamatan Sidoarjo.')),
  ('voice_intro', jsonb_build_object('text', 'Keluhan lingkungan, ketidakadilan sosial, sengketa, atau persoalan lain di wilayah Sidoarjo—sampaikan di sini. Tim LBH DPC akan meninjau dan menindaklanjuti sesuai kapasitas.')),
  ('gallery_note', jsonb_build_object('text', 'Galeri ini menunggu foto aksi resmi dari DPC/PAC. Gunakan dokumentasi asli dengan izin publikasi dan keterangan lokasi yang akurat.')),
  ('footer_slogan', jsonb_build_object('text', 'Setia Bersaudara Sampai Urat Nadi'))
on conflict (key) do nothing;

-- Report handlers can see/manage only complaint status and follow-up data.
grant select on table public.citizen_reports to authenticated;
grant update (status) on table public.citizen_reports to authenticated;
drop policy if exists "LBH and owner read citizen reports" on public.citizen_reports;
create policy "LBH and owner read citizen reports"
on public.citizen_reports for select to authenticated
using (public.has_admin_role(array['owner','lbh_officer']::text[]));
drop policy if exists "LBH and owner update report status" on public.citizen_reports;
create policy "LBH and owner update report status"
on public.citizen_reports for update to authenticated
using (public.has_admin_role(array['owner','lbh_officer']::text[]))
with check (public.has_admin_role(array['owner','lbh_officer']::text[]));

-- Only the registrar role can read member records containing NIK and KTP object keys.
-- An owner must also be explicitly assigned the registrar role to see this data.
grant select on table public.member_registrations to authenticated;
grant update (status) on table public.member_registrations to authenticated;
drop policy if exists "registrars read member registrations" on public.member_registrations;
create policy "registrars read member registrations"
on public.member_registrations for select to authenticated
using (public.has_admin_role(array['registrar']::text[]));
drop policy if exists "registrars update member status" on public.member_registrations;
create policy "registrars update member status"
on public.member_registrations for update to authenticated
using (public.has_admin_role(array['registrar']::text[]))
with check (public.has_admin_role(array['registrar']::text[]));

-- Documents remain private. Signed URLs can be issued only to an authenticated registrar.
grant select on table storage.objects to authenticated;
drop policy if exists "registrars read private member documents" on storage.objects;
create policy "registrars read private member documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['registrar']::text[])
);
