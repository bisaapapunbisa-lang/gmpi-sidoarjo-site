-- Allow the site Owner to replace an existing private member profile photo in place.
-- Only objects currently referenced as a registration's profile photo can be updated.
-- The bucket remains private; public registration uploads keep their existing policy.

grant update on table storage.objects to authenticated;

drop policy if exists "owner replaces linked member profile photos" on storage.objects;
create policy "owner replaces linked member profile photos"
on storage.objects for update to authenticated
using (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['owner']::text[])
  and exists (
    select 1 from public.member_registrations r
     where r.profile_object_key = storage.objects.name
  )
)
with check (
  bucket_id = 'member-documents'
  and public.has_admin_role(array['owner']::text[])
  and exists (
    select 1 from public.member_registrations r
     where r.profile_object_key = storage.objects.name
  )
);
