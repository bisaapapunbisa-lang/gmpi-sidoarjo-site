-- Internal correspondence; no public document downloads, no certified-signature claim.
create table public.surat_signers (
 user_id uuid primary key references auth.users(id),
 display_name text not null check(length(display_name) between 1 and 120),
 active boolean not null default true
);
alter table public.surat_signers enable row level security;
grant select on public.surat_signers to authenticated;
create policy "read own signer assignment" on public.surat_signers for select to authenticated using(user_id=auth.uid());
-- Assignment via trusted SQL/service role ONLY, not by registrars or browser owners.
create table public.surat_documents (
 id uuid primary key default gen_random_uuid(),
 number text not null check(length(number) between 1 and 150),
 letter_date date not null,
 subject text not null check(length(subject) between 1 and 200),
 recipient text not null check(length(recipient) between 1 and 200),
 creator uuid not null references auth.users(id),
 source_path text not null,
 source_sha256 text not null,
 final_path text,
 final_sha256 text,
 status text not null default 'pending' check(status in ('pending','approved','rejected','revoked')),
 signer_name text,
 decided_by uuid references auth.users(id),
 decided_at timestamptz,
 reason text,
 created_at timestamptz not null default now(),
 check(status not in ('approved','revoked') or (final_path is not null and final_sha256 is not null and decided_by is not null))
);
create unique index surat_number_unique on public.surat_documents(lower(trim(number)));
alter table public.surat_documents enable row level security;
grant select on public.surat_documents to authenticated;
create policy "correspondence staff reads" on public.surat_documents for select to authenticated using(
 public.has_admin_role(array['owner','registrar']) or exists(select 1 from public.surat_signers where user_id=auth.uid() and active)
);
create table public.surat_events (
 id bigint generated always as identity primary key,
 document_id uuid not null references public.surat_documents(id),
 actor uuid not null references auth.users(id), action text not null,
 created_at timestamptz not null default now()
);
alter table public.surat_events enable row level security;
-- Writes performed exclusively by the authenticated edge workflow using service role.
grant all on public.surat_documents, public.surat_signers, public.surat_events to service_role;
grant usage,select on sequence public.surat_events_id_seq to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('surat-private','surat-private',false,10485760,array['application/pdf']) on conflict(id) do nothing;
-- No browser Storage policies: URLs issued only after edge authorization.
create function public.verify_surat(document_id uuid)
returns table(id uuid,number text,letter_date date,status text,signer_name text,decided_at timestamptz,final_sha256 text)
language sql stable security definer set search_path='' as $$
 select d.id,d.number,d.letter_date,d.status,d.signer_name,d.decided_at,d.final_sha256
 from public.surat_documents d where d.id=document_id and d.status in ('approved','revoked');
$$;
revoke all on function public.verify_surat(uuid) from public;
grant execute on function public.verify_surat(uuid) to anon,authenticated;
-- Audit is part of the same transaction as each document state change.
create function public.surat_audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.surat_events(document_id,actor,action)
 values(new.id,case when TG_OP='INSERT' then new.creator else new.decided_by end,
 case when TG_OP='INSERT' then 'submitted' else new.status end);
 return new;
end;
$$;
revoke all on function public.surat_audit_change() from public;
create trigger surat_audit after insert or update of status on public.surat_documents
for each row execute function public.surat_audit_change();

-- Hardening also included in the dashboard installation shared with the operator.
revoke all on public.surat_signers, public.surat_documents, public.surat_events from public, anon, authenticated;
grant select on public.surat_signers, public.surat_documents to authenticated;
revoke all on sequence public.surat_events_id_seq from public, anon, authenticated;
create policy "surat storage server only" on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'surat-private') with check (bucket_id <> 'surat-private');
