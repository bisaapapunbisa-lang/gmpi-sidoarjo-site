-- Penghapusan pendaftaran duplikat yang terbatas, terkonfirmasi, dan tercatat.
-- Terapkan setelah migration admin roles, member_cards, dan aktivasi pendaftaran.
-- Hanya peran registrar; Owner harus diberi peran Registrar terpisah sesuai kebijakan data sensitif.

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
create policy "registrar reads own deletion audit"
on public.member_registration_deletion_audit for select to authenticated
using (
  public.has_admin_role(array['registrar']::text[])
  and actor_email = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create or replace function public.delete_member_registration_safe(
  p_registration_id uuid,
  p_confirm_name text,
  p_confirm_nik_last4 text,
  p_reason text
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
begin
  if not public.has_admin_role(array['registrar']::text[]) then
    raise exception 'Akses ditolak: peran Petugas Registrasi diperlukan.' using errcode = '42501';
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
  if exists (
    select 1 from public.member_cards as c
    where c.registration_id = p_registration_id
      and c.is_sample = false
  ) then
    raise exception 'Pendaftaran ini sudah terhubung ke KTA. Jangan hapus; minta Pemilik mengurus KTA terkait terlebih dahulu.' using errcode = '23503';
  end if;

  insert into public.member_registration_deletion_audit (
    registration_id, actor_email, reason, ktp_object_key, profile_object_key
  ) values (
    v_member.id, v_actor, v_reason, v_member.ktp_object_key, v_member.profile_object_key
  ) returning id into v_audit_id;

  delete from public.member_registrations where id = p_registration_id;

  return jsonb_build_object(
    'audit_id', v_audit_id,
    'ktp_object_key', v_member.ktp_object_key,
    'profile_object_key', v_member.profile_object_key
  );
end;
$$;

revoke all on function public.delete_member_registration_safe(uuid,text,text,text) from public, anon;
grant execute on function public.delete_member_registration_safe(uuid,text,text,text) to authenticated;

create or replace function public.complete_member_registration_cleanup(p_audit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_audit record;
begin
  if not public.has_admin_role(array['registrar']::text[]) then
    raise exception 'Akses ditolak: peran Petugas Registrasi diperlukan.' using errcode = '42501';
  end if;
  select * into v_audit
    from public.member_registration_deletion_audit
   where id = p_audit_id
     and actor_email = v_actor
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
     set storage_cleanup_status = 'complete',
         completed_at = now(),
         ktp_object_key = null,
         profile_object_key = null
   where id = p_audit_id;
  return true;
end;
$$;

revoke all on function public.complete_member_registration_cleanup(uuid) from public, anon;
grant execute on function public.complete_member_registration_cleanup(uuid) to authenticated;

-- Storage API (bukan DELETE langsung ke storage.objects) hanya boleh menghapus
-- object yang tercatat sebagai pembersihan tertunda oleh registrar yang sama.
drop policy if exists "registrar deletes audited member documents" on storage.objects;
create policy "registrar deletes audited member documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['registrar']::text[])
  and exists (
    select 1
      from public.member_registration_deletion_audit as a
     where a.storage_cleanup_status = 'pending'
       and a.actor_email = lower(coalesce(auth.jwt() ->> 'email', ''))
       and (a.ktp_object_key = storage.objects.name or a.profile_object_key = storage.objects.name)
  )
);
