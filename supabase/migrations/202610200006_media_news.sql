-- GMPI Sidoarjo: Kolom berita dari media mitra.
-- * Pemilik/Editor Situs mengelola daftar media mitra dan semua berita.
-- * Setiap akun media (peran "media_partner") hanya bisa menulis & mengelola berita
--   milik medianya sendiri. Tidak bisa melihat aduan, pendaftaran, kartu, toko, dll.
-- * Pengunjung hanya melihat berita berstatus "published" dari media yang aktif.
-- Aman dijalankan ulang.

-- 1) Peran baru: media_partner
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.admin_profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.admin_profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.admin_profiles add constraint admin_profiles_role_check
  check (role in ('owner','content_editor','lbh_officer','registrar','media_partner'));

-- 2) Daftar media mitra
create table if not exists public.media_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  website_url text check (website_url is null or website_url ~ '^https?://[^\s]{3,300}$'),
  logo_path text check (logo_path is null or logo_path ~ '^media/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  requires_review boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

alter table public.media_partners enable row level security;
revoke all on table public.media_partners from public;
grant select on table public.media_partners to anon, authenticated;
grant insert, update, delete on table public.media_partners to authenticated;
grant all on table public.media_partners to service_role;

drop policy if exists "public reads active media partners" on public.media_partners;
create policy "public reads active media partners"
on public.media_partners for select to anon, authenticated
using (is_active = true or public.has_admin_role(array['owner','content_editor','media_partner']::text[]));

drop policy if exists "editors manage media partners" on public.media_partners;
create policy "editors manage media partners"
on public.media_partners for all to authenticated
using (public.has_admin_role(array['owner','content_editor']::text[]))
with check (public.has_admin_role(array['owner','content_editor']::text[]));

-- 3) Akun media ↔ media mitra (hanya Pemilik yang boleh mengatur, karena ini hak akses)
create table if not exists public.media_partner_members (
  email text not null check (email = lower(email)),
  partner_id uuid not null references public.media_partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email, partner_id)
);

alter table public.media_partner_members enable row level security;
revoke all on table public.media_partner_members from public, anon;
grant select, insert, update, delete on table public.media_partner_members to authenticated;
grant all on table public.media_partner_members to service_role;

drop policy if exists "member reads own media link or owner reads all" on public.media_partner_members;
create policy "member reads own media link or owner reads all"
on public.media_partner_members for select to authenticated
using (
  email = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.has_admin_role(array['owner','content_editor']::text[])
);

drop policy if exists "owner manages media members" on public.media_partner_members;
create policy "owner manages media members"
on public.media_partner_members for all to authenticated
using (public.has_admin_role(array['owner']::text[]))
with check (public.has_admin_role(array['owner']::text[]));

create or replace function public.is_media_member(p_partner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_partner_members m
    join public.admin_profiles a on a.email = m.email and a.role = 'media_partner' and a.active = true
    join public.media_partners mp on mp.id = m.partner_id and mp.is_active = true
    where m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and m.partner_id = p_partner
  );
$$;
revoke all on function public.is_media_member(uuid) from public;
grant execute on function public.is_media_member(uuid) to anon, authenticated;

-- 4) Berita
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.media_partners(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 160),
  summary text not null default '' check (char_length(summary) <= 400),
  body text not null default '' check (char_length(body) <= 20000),
  cover_path text check (cover_path is null or cover_path ~ '^news/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'),
  source_url text check (source_url is null or source_url ~ '^https?://[^\s]{3,500}$'),
  status text not null default 'draft' check (status in ('draft','review','published','hidden')),
  published_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_posts_public_idx on public.news_posts (status, published_at desc);
create index if not exists news_posts_partner_idx on public.news_posts (partner_id);

alter table public.news_posts enable row level security;
revoke all on table public.news_posts from public;
grant select on table public.news_posts to anon, authenticated;
grant insert, update, delete on table public.news_posts to authenticated;
grant all on table public.news_posts to service_role;

drop policy if exists "public reads published news" on public.news_posts;
create policy "public reads published news"
on public.news_posts for select to anon, authenticated
using (
  (status = 'published' and (partner_id is null or exists (
    select 1 from public.media_partners mp where mp.id = partner_id and mp.is_active = true)))
  or public.has_admin_role(array['owner','content_editor']::text[])
  or (partner_id is not null and public.is_media_member(partner_id))
);

drop policy if exists "news writers insert" on public.news_posts;
create policy "news writers insert"
on public.news_posts for insert to authenticated
with check (
  public.has_admin_role(array['owner','content_editor']::text[])
  or (partner_id is not null and public.is_media_member(partner_id))
);

drop policy if exists "news writers update" on public.news_posts;
create policy "news writers update"
on public.news_posts for update to authenticated
using (
  public.has_admin_role(array['owner','content_editor']::text[])
  or (partner_id is not null and public.is_media_member(partner_id))
)
with check (
  public.has_admin_role(array['owner','content_editor']::text[])
  or (partner_id is not null and public.is_media_member(partner_id))
);

drop policy if exists "news writers delete" on public.news_posts;
create policy "news writers delete"
on public.news_posts for delete to authenticated
using (
  public.has_admin_role(array['owner','content_editor']::text[])
  or (partner_id is not null and public.is_media_member(partner_id) and status <> 'hidden')
);

-- Aturan status untuk akun media:
-- * tidak boleh memakai/mengubah status "hidden" (khusus pengurus);
-- * bila medianya "perlu persetujuan", status "published" otomatis menjadi "review".
create or replace function public.news_posts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_editor boolean := public.has_admin_role(array['owner','content_editor']::text[]);
  needs_review boolean := false;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := lower(coalesce(auth.jwt() ->> 'email', new.created_by));
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if not is_editor then
    if tg_op = 'UPDATE' and old.status = 'hidden' then
      raise exception 'Berita ini disembunyikan pengurus GMPI dan tidak dapat diubah.';
    end if;
    if new.status = 'hidden' then
      raise exception 'Status "hidden" hanya dapat diatur pengurus GMPI.';
    end if;
    if tg_op = 'UPDATE' and new.partner_id is distinct from old.partner_id then
      raise exception 'Berita tidak dapat dipindahkan ke media lain.';
    end if;
    select mp.requires_review into needs_review from public.media_partners mp where mp.id = new.partner_id;
    if coalesce(needs_review, false) and new.status = 'published'
       and (tg_op = 'INSERT' or old.status <> 'published'
            or new.title is distinct from old.title or new.summary is distinct from old.summary
            or new.body is distinct from old.body or new.cover_path is distinct from old.cover_path) then
      new.status := 'review';
    end if;
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists news_posts_guard on public.news_posts;
create trigger news_posts_guard
before insert or update on public.news_posts
for each row execute function public.news_posts_guard();

-- 5) Gambar: sampul berita (news/) dan logo media (media/) di bucket publik site-assets
drop policy if exists "news writers upload covers" on storage.objects;
create policy "news writers upload covers"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'news'
  and public.has_admin_role(array['owner','content_editor','media_partner']::text[])
);

drop policy if exists "news writers read own covers" on storage.objects;
create policy "news writers read own covers"
on storage.objects for select to authenticated
using (
  bucket_id = 'site-assets' and (storage.foldername(name))[1] in ('news','media')
  and public.has_admin_role(array['owner','content_editor','media_partner']::text[])
);

drop policy if exists "news writers delete covers" on storage.objects;
create policy "news writers delete covers"
on storage.objects for delete to authenticated
using (
  bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'news'
  and (public.has_admin_role(array['owner','content_editor']::text[]) or owner_id = auth.uid()::text)
);

drop policy if exists "editors upload media logos" on storage.objects;
create policy "editors upload media logos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'media'
  and public.has_admin_role(array['owner','content_editor']::text[])
);

drop policy if exists "editors delete media logos" on storage.objects;
create policy "editors delete media logos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'site-assets' and (storage.foldername(name))[1] = 'media'
  and public.has_admin_role(array['owner','content_editor']::text[])
);
