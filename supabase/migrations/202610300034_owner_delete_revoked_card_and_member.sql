-- Owner-only permanent deletion of a revoked KTA and its linked registration/documents.
-- Refuse the operation if any other card still points to the registration or if the
-- private document objects are shared with another registration. Storage cleanup is
-- completed separately through the existing audited Storage API workflow.

create table if not exists public.member_card_permanent_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  member_card_id uuid not null,
  member_number text not null,
  registration_id uuid,
  actor_email text not null,
  reason text not null check (char_length(reason) between 5 and 300),
  deleted_at timestamptz not null default now()
);

alter table public.member_card_permanent_deletion_audit enable row level security;
revoke all on table public.member_card_permanent_deletion_audit from public, anon, authenticated;
grant select on table public.member_card_permanent_deletion_audit to authenticated;
grant all on table public.member_card_permanent_deletion_audit to service_role;
drop policy if exists "owner reads permanent card deletion audit" on public.member_card_permanent_deletion_audit;
create policy "owner reads permanent card deletion audit"
on public.member_card_permanent_deletion_audit for select to authenticated
using (public.has_admin_role(array['owner']::text[]));

grant delete on table public.member_cards to authenticated;

drop policy if exists "owner deletes member cards" on public.member_cards;
create policy "owner deletes member cards"
on public.member_cards for delete to authenticated
using (public.has_admin_role(array['owner']::text[]) and is_sample = false);

create or replace function public.owner_delete_revoked_member_card(
  p_card_id uuid,
  p_confirm_member_number text,
  p_confirm_name text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card record;
  v_member record;
  v_card_audit_id uuid;
  v_registration_audit_id uuid;
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'owner'));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_other_card text;
  v_file_shared boolean := false;
begin
  select null::uuid as id, null::text as full_name, null::text as ktp_object_key, null::text as profile_object_key
    into v_member;
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Akses ditolak: hanya Pemilik yang dapat menghapus KTA permanen.' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Alasan penghapusan wajib 5–300 karakter.' using errcode = '22023';
  end if;

  select c.id, c.registration_id, c.member_number, c.full_name, c.status, c.is_sample
    into v_card
    from public.member_cards c
   where c.id = p_card_id
   for update;
  if not found or v_card.is_sample then
    raise exception 'KTA tidak ditemukan atau merupakan kartu contoh.' using errcode = 'P0002';
  end if;
  if v_card.status <> 'dicabut' then
    raise exception 'Hanya KTA berstatus Dicabut yang boleh dihapus permanen.' using errcode = '22023';
  end if;
  if upper(btrim(coalesce(p_confirm_member_number, ''))) <> upper(v_card.member_number)
     or lower(btrim(regexp_replace(coalesce(p_confirm_name, ''), '\s+', ' ', 'g'))) <>
        lower(btrim(regexp_replace(v_card.full_name, '\s+', ' ', 'g'))) then
    raise exception 'Konfirmasi nomor KTA atau nama tidak cocok.' using errcode = '22023';
  end if;

  if v_card.registration_id is not null then
    select r.id, r.full_name, r.ktp_object_key, r.profile_object_key
      into v_member
      from public.member_registrations r
     where r.id = v_card.registration_id
     for update;
    if found then
      select c.member_number into v_other_card
        from public.member_cards c
       where c.registration_id = v_member.id
         and c.id <> v_card.id
         and c.is_sample = false
       limit 1;
      if v_other_card is not null then
        raise exception 'Penghapusan diblokir: pendaftaran masih terhubung ke KTA lain (%). Dokumen anggota akan dipakai bersama.', v_other_card using errcode = '23503';
      end if;

      select exists (
        select 1
          from public.member_registrations r
         where r.id <> v_member.id
           and (
             r.ktp_object_key in (v_member.ktp_object_key, v_member.profile_object_key)
             or r.profile_object_key in (v_member.ktp_object_key, v_member.profile_object_key)
           )
      ) into v_file_shared;
      if v_file_shared then
        raise exception 'Penghapusan diblokir: berkas privat juga ditautkan ke pendaftaran lain.' using errcode = '23503';
      end if;

      insert into public.member_registration_deletion_audit (
        registration_id, actor_email, reason, ktp_object_key, profile_object_key
      ) values (
        v_member.id, v_actor, v_reason, v_member.ktp_object_key, v_member.profile_object_key
      ) returning id into v_registration_audit_id;
    end if;
  end if;

  insert into public.member_card_permanent_deletion_audit (
    member_card_id, member_number, registration_id, actor_email, reason
  ) values (
    v_card.id, v_card.member_number, v_card.registration_id, v_actor, v_reason
  ) returning id into v_card_audit_id;

  delete from public.member_cards where id = v_card.id;
  if v_member.id is not null then
    delete from public.member_registrations where id = v_member.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'card_audit_id', v_card_audit_id,
    'registration_audit_id', v_registration_audit_id,
    'registration_deleted', v_member.id is not null,
    'ktp_object_key', v_member.ktp_object_key,
    'profile_object_key', v_member.profile_object_key
  );
end;
$$;

revoke all on function public.owner_delete_revoked_member_card(uuid,text,text,text) from public, anon;
grant execute on function public.owner_delete_revoked_member_card(uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';
