-- Persistent, private per-KTA photos for legacy cards without a registration record.
-- Photos stay in the existing private member-documents bucket; no KTP is used.

alter table public.member_cards
  add column if not exists photo_object_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.member_cards'::regclass
      and conname = 'member_cards_photo_object_key_check'
  ) then
    alter table public.member_cards
      add constraint member_cards_photo_object_key_check
      check (
        photo_object_key is null
        or photo_object_key = 'kta-card-photos/' || id::text || '.jpg'
      );
  end if;
end $$;

create table if not exists public.member_card_photo_cleanup_audit (
  id uuid primary key default gen_random_uuid(),
  member_card_id uuid not null,
  member_number text not null,
  photo_object_key text not null,
  deleted_by text not null,
  deleted_at timestamptz not null default now(),
  cleanup_status text not null default 'pending' check (cleanup_status in ('pending','complete')),
  completed_at timestamptz
);
create index if not exists member_card_photo_cleanup_pending_idx
  on public.member_card_photo_cleanup_audit (deleted_at)
  where cleanup_status = 'pending';
create index if not exists member_card_photo_cleanup_card_idx
  on public.member_card_photo_cleanup_audit (member_card_id, deleted_at desc);

alter table public.member_card_photo_cleanup_audit enable row level security;
revoke all on table public.member_card_photo_cleanup_audit from public, anon, authenticated;
grant select on table public.member_card_photo_cleanup_audit to authenticated;
grant all on table public.member_card_photo_cleanup_audit to service_role;
drop policy if exists "owner reads KTA photo cleanup audit" on public.member_card_photo_cleanup_audit;
create policy "owner reads KTA photo cleanup audit"
on public.member_card_photo_cleanup_audit for select to authenticated
using (public.has_admin_role(array['owner']::text[]));

-- Prevent non-owners from changing which private image is attached to a card.
create or replace function public.member_cards_photo_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.photo_object_key is not null then
      if not public.has_admin_role(array['owner']::text[]) then
        raise exception 'Hanya Pemilik situs yang dapat memasang foto privat pada KTA.' using errcode = '42501';
      end if;
      if new.photo_object_key <> ('kta-card-photos/' || new.id::text || '.jpg') then
        raise exception 'Lokasi foto KTA tidak valid.' using errcode = '22023';
      end if;
    end if;
    return new;
  end if;
  if new.photo_object_key is distinct from old.photo_object_key then
    if not public.has_admin_role(array['owner']::text[]) then
      raise exception 'Hanya Pemilik situs yang dapat mengganti foto KTA.' using errcode = '42501';
    end if;
    if new.photo_object_key is not null
       and new.photo_object_key <> ('kta-card-photos/' || new.id::text || '.jpg') then
      raise exception 'Lokasi foto KTA tidak valid.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists member_cards_photo_guard on public.member_cards;
create trigger member_cards_photo_guard
before insert or update on public.member_cards
for each row execute function public.member_cards_photo_guard();

-- Exclude per-KTA photos from the broad member-document read policy, so Registrar access
-- to registration documents does not implicitly expose these owner-only card photos.
drop policy if exists "registrar membaca dokumen anggota" on storage.objects;
drop policy if exists "registrars read private member documents" on storage.objects;
drop policy if exists "owner and registrars read private member documents" on storage.objects;
create policy "owner and registrars read private member documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'member-documents'
  and name not like 'kta-card-photos/%'
  and public.has_admin_role(array['owner','registrar']::text[])
);

-- Owner-only upload/replacement/deletion in the existing private bucket.
-- Read access is Pemilik-only; registration profile photos keep their existing role policy.
grant select, insert, update, delete on table storage.objects to authenticated;

drop policy if exists "owner reads private KTA card photos" on storage.objects;
create policy "owner reads private KTA card photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'member-documents'
  and name ~ '^kta-card-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and public.has_admin_role(array['owner']::text[])
);

drop policy if exists "owner uploads private KTA card photos" on storage.objects;
create policy "owner uploads private KTA card photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'member-documents'
  and name ~ '^kta-card-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and public.has_admin_role(array['owner']::text[])
);

drop policy if exists "owner replaces private KTA card photos" on storage.objects;
create policy "owner replaces private KTA card photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'member-documents'
  and name ~ '^kta-card-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and public.has_admin_role(array['owner']::text[])
)
with check (
  bucket_id = 'member-documents'
  and name ~ '^kta-card-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and public.has_admin_role(array['owner']::text[])
);

drop policy if exists "owner deletes private KTA card photos" on storage.objects;
create policy "owner deletes private KTA card photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'member-documents'
  and name ~ '^kta-card-photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$'
  and public.has_admin_role(array['owner']::text[])
);

-- A deleted card's private photo is queued for Storage API cleanup before the card row disappears.
create or replace function public.audit_member_card_photo_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.photo_object_key is not null then
    insert into public.member_card_photo_cleanup_audit (
      member_card_id, member_number, photo_object_key, deleted_by
    ) values (
      old.id, old.member_number, old.photo_object_key,
      lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'system'))
    );
  end if;
  return old;
end;
$$;

drop trigger if exists member_card_photo_cleanup_queue on public.member_cards;
create trigger member_card_photo_cleanup_queue
before delete on public.member_cards
for each row execute function public.audit_member_card_photo_cleanup();

create or replace function public.owner_complete_member_card_photo_cleanup(p_audit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Akses ditolak: hanya Pemilik yang dapat membersihkan foto KTA.' using errcode = '42501';
  end if;
  select a.photo_object_key into v_key
    from public.member_card_photo_cleanup_audit a
   where a.id = p_audit_id and a.cleanup_status = 'pending'
   for update;
  if not found then
    raise exception 'Catatan pembersihan foto KTA tidak ditemukan atau sudah selesai.' using errcode = 'P0002';
  end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'member-documents' and o.name = v_key) then
    raise exception 'Foto KTA masih tersimpan di Storage. Hapus berkas melalui panel Admin terlebih dahulu.' using errcode = '23514';
  end if;
  update public.member_card_photo_cleanup_audit
     set cleanup_status = 'complete', completed_at = now()
   where id = p_audit_id;
  return true;
end;
$$;

revoke all on function public.owner_complete_member_card_photo_cleanup(uuid) from public, anon;
grant execute on function public.owner_complete_member_card_photo_cleanup(uuid) to authenticated;
revoke all on function public.member_cards_photo_guard() from public, anon, authenticated;
revoke all on function public.audit_member_card_photo_cleanup() from public, anon, authenticated;

notify pgrst, 'reload schema';
