-- Owner-only member-number editor from the registration profile modal.
-- Every new number is checked against all KTA rows and the unique DB constraint remains authoritative.

create table if not exists public.member_card_number_edit_audit (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  member_card_id uuid not null,
  old_member_number text not null,
  new_member_number text not null,
  actor_email text not null,
  edited_at timestamptz not null default now()
);
alter table public.member_card_number_edit_audit enable row level security;
revoke all on table public.member_card_number_edit_audit from public, anon, authenticated;
grant select on table public.member_card_number_edit_audit to authenticated;
grant all on table public.member_card_number_edit_audit to service_role;
drop policy if exists "owner reads member card number audit" on public.member_card_number_edit_audit;
create policy "owner reads member card number audit"
on public.member_card_number_edit_audit for select to authenticated
using (public.has_admin_role(array['owner']::text[]));

create or replace function public.owner_update_member_card_numbers(
  p_registration_id uuid,
  p_updates jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_card_id uuid;
  v_new_number text;
  v_old record;
  v_ids uuid[] := array[]::uuid[];
  v_numbers text[] := array[]::text[];
  v_changed text[] := array[]::text[];
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'owner'));
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Akses ditolak: hanya Pemilik dapat mengubah nomor anggota.' using errcode = '42501';
  end if;
  if p_updates is null or jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) > 20 then
    raise exception 'Daftar perubahan nomor KTA tidak valid.' using errcode = '22023';
  end if;

  -- Validate all requested numbers before changing any card.
  for v_item in select value from jsonb_array_elements(p_updates) as items(value) loop
    if jsonb_typeof(v_item) <> 'object' or (v_item - 'card_id' - 'member_number') <> '{}'::jsonb then
      raise exception 'Format perubahan nomor KTA tidak valid.' using errcode = '22023';
    end if;
    v_card_id := nullif(v_item ->> 'card_id', '')::uuid;
    v_new_number := upper(trim(coalesce(v_item ->> 'member_number', '')));
    if v_card_id is null or v_new_number !~ '^[A-Z0-9][A-Z0-9./-]{2,39}$' then
      raise exception 'Nomor KTA harus 3–40 karakter: huruf, angka, titik, garis miring, atau strip.' using errcode = '22023';
    end if;
    if v_card_id = any(v_ids) or v_new_number = any(v_numbers) then
      raise exception 'Ada kartu atau nomor yang tercantum lebih dari sekali.' using errcode = '22023';
    end if;
    select c.id, c.member_number, c.status into v_old
      from public.member_cards c
     where c.id = v_card_id and c.registration_id = p_registration_id and c.is_sample = false
     for update;
    if not found then
      raise exception 'KTA tidak ditemukan atau tidak terhubung ke pendaftaran ini.' using errcode = 'P0002';
    end if;
    if exists (
      select 1 from public.member_cards c
       where upper(trim(c.member_number)) = v_new_number and c.id <> v_card_id
    ) then
      raise exception 'Nomor anggota % sudah dipakai KTA lain. Pilih nomor yang belum digunakan.', v_new_number using errcode = '23505';
    end if;
    v_ids := array_append(v_ids, v_card_id);
    v_numbers := array_append(v_numbers, v_new_number);
  end loop;

  for v_item in select value from jsonb_array_elements(p_updates) as items(value) loop
    v_card_id := (v_item ->> 'card_id')::uuid;
    v_new_number := upper(trim(v_item ->> 'member_number'));
    select c.id, c.member_number, c.status into v_old
      from public.member_cards c
     where c.id = v_card_id and c.registration_id = p_registration_id and c.is_sample = false
     for update;
    if v_old.member_number is distinct from v_new_number then
      update public.member_cards set member_number = v_new_number where id = v_card_id;
      -- A number edit on an active KTA remains approved by the Owner who made the change.
      if v_old.status = 'aktif' then
        update public.member_cards set status = 'aktif' where id = v_card_id;
      end if;
      insert into public.member_card_number_edit_audit (
        registration_id, member_card_id, old_member_number, new_member_number, actor_email
      ) values (p_registration_id, v_card_id, v_old.member_number, v_new_number, v_actor);
      v_changed := array_append(v_changed, v_new_number);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'changed_numbers', to_jsonb(v_changed));
end;
$$;

revoke all on function public.owner_update_member_card_numbers(uuid,jsonb) from public, anon;
grant execute on function public.owner_update_member_card_numbers(uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';
