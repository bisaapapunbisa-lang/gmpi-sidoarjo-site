-- Owner is the site creator/administrator and can use member registration controls.
-- Destructive actions remain server-checked and audited; KTA-linked rows require a clear owner override.

-- Owner can access the member registration workspace without separately holding registrar.
grant select on table public.member_registrations to authenticated;
grant update (status, jabatan) on table public.member_registrations to authenticated;
revoke delete on table public.member_registrations from public, anon, authenticated;

drop policy if exists "registrars read member registrations" on public.member_registrations;
create policy "owner and registrars read member registrations"
on public.member_registrations for select to authenticated
using (public.has_admin_role(array['owner','registrar']::text[]));

drop policy if exists "registrars update member status" on public.member_registrations;
create policy "owner and registrars update member registration controls"
on public.member_registrations for update to authenticated
using (public.has_admin_role(array['owner','registrar']::text[]))
with check (public.has_admin_role(array['owner','registrar']::text[]));

-- Private KTP/profile images remain private; Owner or Registrar can view them.
drop policy if exists "registrar membaca dokumen anggota" on storage.objects;
drop policy if exists "registrars read private member documents" on storage.objects;
create policy "owner and registrars read private member documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['owner','registrar']::text[])
);

-- The audit table stores no name/NIK. It records only IDs, actor, reason, and pending object keys.
create table if not exists public.member_registration_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  actor_email text not null,
  reason text not null check (char_length(reason) between 5 and 300),
  deleted_at timestamptz not null default now(),
  storage_cleanup_status text not null default 'pending'
    check (storage_cleanup_status in ('pending','complete')),
  completed_at timestamptz,
  ktp_object_key text,
  profile_object_key text
);
alter table public.member_registration_deletion_audit enable row level security;
revoke all on table public.member_registration_deletion_audit from public, anon, authenticated;
grant select on table public.member_registration_deletion_audit to authenticated;
grant all on table public.member_registration_deletion_audit to service_role;

drop policy if exists "registrar reads own deletion audit" on public.member_registration_deletion_audit;
drop policy if exists "owner and registrars read deletion audit" on public.member_registration_deletion_audit;
create policy "owner and registrars read deletion audit"
on public.member_registration_deletion_audit for select to authenticated
using (
  public.has_admin_role(array['owner','registrar']::text[])
  and (actor_email = lower(coalesce(auth.jwt() ->> 'email', ''))
       or public.has_admin_role(array['owner']::text[]))
);

-- Replace the registrar-only RPC with an owner-capable, confirmation-gated version.
drop function if exists public.delete_member_registration_safe(uuid,text,text,text);
create or replace function public.delete_member_registration_safe(
  p_registration_id uuid,
  p_confirm_name text,
  p_confirm_nik_last4 text,
  p_reason text,
  p_allow_kta_unlink boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_audit_id uuid;
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_has_linked_card boolean;
  v_is_owner boolean := public.has_admin_role(array['owner']::text[]);
begin
  if not public.has_admin_role(array['owner','registrar']::text[]) then
    raise exception 'Akses ditolak: peran Pemilik atau Petugas Registrasi diperlukan.' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Alasan penghapusan harus 5–300 karakter.' using errcode = '22023';
  end if;

  select r.id, r.full_name, r.nik, r.status, r.ktp_object_key, r.profile_object_key
    into v_member
    from public.member_registrations as r
   where r.id = p_registration_id
   for update;
  if not found then
    raise exception 'Pendaftaran sudah tidak ada atau tidak ditemukan.' using errcode = 'P0002';
  end if;
  if v_member.status <> 'ditolak' then
    raise exception 'Untuk keamanan, ubah status pendaftaran menjadi Ditolak terlebih dahulu.' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_member.full_name)) then
    raise exception 'Konfirmasi nama tidak cocok.' using errcode = '22023';
  end if;
  if coalesce(p_confirm_nik_last4, '') !~ '^[0-9]{4}$'
     or right(v_member.nik, 4) <> p_confirm_nik_last4 then
    raise exception 'Empat digit terakhir NIK tidak cocok.' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.member_cards as c
     where c.registration_id = p_registration_id
       and c.is_sample = false
  ) into v_has_linked_card;
  if v_has_linked_card and not (v_is_owner and coalesce(p_allow_kta_unlink, false)) then
    raise exception 'Pendaftaran terhubung ke KTA. Hanya Pemilik yang dapat melanjutkan dengan konfirmasi pelepasan tautan KTA.' using errcode = '23503';
  end if;
  if coalesce(p_allow_kta_unlink, false) and not v_is_owner then
    raise exception 'Pelepasan tautan KTA hanya dapat dikonfirmasi oleh Pemilik.' using errcode = '42501';
  end if;

  insert into public.member_registration_deletion_audit (
    registration_id, actor_email, reason, ktp_object_key, profile_object_key
  ) values (
    v_member.id, v_actor, v_reason, v_member.ktp_object_key, v_member.profile_object_key
  ) returning id into v_audit_id;

  -- FK member_cards.registration_id is ON DELETE SET NULL; KTA remains, the link is removed.
  delete from public.member_registrations where id = p_registration_id;

  return jsonb_build_object(
    'audit_id', v_audit_id,
    'ktp_object_key', v_member.ktp_object_key,
    'profile_object_key', v_member.profile_object_key,
    'has_linked_card', v_has_linked_card
  );
end;
$$;
revoke all on function public.delete_member_registration_safe(uuid,text,text,text,boolean) from public, anon;
grant execute on function public.delete_member_registration_safe(uuid,text,text,text,boolean) to authenticated;

-- Owner can retry/finish cleanup; Registrar can clean only records they deleted.
create or replace function public.complete_member_registration_cleanup(p_audit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_audit record;
  v_is_owner boolean := public.has_admin_role(array['owner']::text[]);
begin
  if not public.has_admin_role(array['owner','registrar']::text[]) then
    raise exception 'Akses ditolak: peran Pemilik atau Petugas Registrasi diperlukan.' using errcode = '42501';
  end if;
  select * into v_audit
    from public.member_registration_deletion_audit
   where id = p_audit_id
     and (actor_email = v_actor or v_is_owner)
     and storage_cleanup_status = 'pending'
   for update;
  if not found then
    raise exception 'Catatan pembersihan tidak ditemukan atau sudah selesai.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from storage.objects as o
     where o.bucket_id = 'member-documents'
       and (o.name = v_audit.ktp_object_key or o.name = v_audit.profile_object_key)
  ) then
    raise exception 'Foto privat masih tersimpan. Bersihkan berkas melalui Storage API terlebih dahulu.' using errcode = '23514';
  end if;
  update public.member_registration_deletion_audit
     set storage_cleanup_status = 'complete', completed_at = now(),
         ktp_object_key = null, profile_object_key = null
   where id = p_audit_id;
  return true;
end;
$$;
revoke all on function public.complete_member_registration_cleanup(uuid) from public, anon;
grant execute on function public.complete_member_registration_cleanup(uuid) to authenticated;

-- Remove the older broad owner-delete policy; all UI deletion now goes through audited RPC.
drop policy if exists "pemilik menghapus dokumen anggota" on storage.objects;
drop policy if exists "registrar deletes audited member documents" on storage.objects;
drop policy if exists "owner and registrars delete audited member documents" on storage.objects;
create policy "owner and registrars delete audited member documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['owner','registrar']::text[])
  and exists (
    select 1 from public.member_registration_deletion_audit as a
     where a.storage_cleanup_status = 'pending'
       and (a.actor_email = lower(coalesce(auth.jwt() ->> 'email', ''))
            or public.has_admin_role(array['owner']::text[]))
       and (a.ktp_object_key = storage.objects.name or a.profile_object_key = storage.objects.name)
  )
);
