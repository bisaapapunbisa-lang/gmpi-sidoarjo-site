-- When the Owner marks a registration as accepted, issue/reactivate a linked KTA immediately.
-- The KTA becomes active in the same transaction; no second card-approval step is required.

create table if not exists public.member_registration_kta_issue_audit (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null,
  member_card_id uuid not null,
  member_number text not null,
  actor_email text not null,
  action text not null check (action in ('issued','linked_existing','activated_existing','reactivated_existing','existing_active')),
  created_at timestamptz not null default now()
);
alter table public.member_registration_kta_issue_audit enable row level security;
revoke all on table public.member_registration_kta_issue_audit from public, anon, authenticated;
grant select on table public.member_registration_kta_issue_audit to authenticated;
grant all on table public.member_registration_kta_issue_audit to service_role;
drop policy if exists "owner reads registration KTA issue audit" on public.member_registration_kta_issue_audit;
create policy "owner reads registration KTA issue audit"
on public.member_registration_kta_issue_audit for select to authenticated
using (public.has_admin_role(array['owner']::text[]));

create or replace function public.owner_approve_member_and_issue_kta(p_registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_card record;
  v_match_count integer := 0;
  v_action text;
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'owner'));
  v_year text := to_char(current_date, 'YYYY');
  v_last_number integer;
  v_next_number integer;
  v_member_number text;
  v_jabatan text;
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Akses ditolak: hanya Pemilik yang dapat mengizinkan pendaftaran dan langsung menerbitkan KTA.' using errcode = '42501';
  end if;

  select r.id, r.full_name, r.district, r.jabatan, r.status
    into v_member
    from public.member_registrations r
   where r.id = p_registration_id
   for update;
  if not found then
    raise exception 'Pendaftaran tidak ditemukan.' using errcode = 'P0002';
  end if;
  if char_length(v_member.full_name) < 2 or char_length(v_member.full_name) > 120 then
    raise exception 'Nama harus 2–120 karakter agar dapat dicetak pada KTA.' using errcode = '22023';
  end if;
  if v_member.district not in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  ) then
    raise exception 'KTA otomatis hanya tersedia untuk anggota berdomisili di salah satu kecamatan Sidoarjo.' using errcode = '22023';
  end if;
  v_jabatan := coalesce(nullif(left(trim(coalesce(v_member.jabatan, '')), 60), ''), 'Anggota');

  update public.member_registrations set status = 'diterima' where id = p_registration_id;

  -- Reuse an existing linked card before creating another one.
  select c.id, c.member_number, c.status into v_card
    from public.member_cards c
   where c.registration_id = p_registration_id and c.is_sample = false
   order by case c.status when 'aktif' then 1 when 'menunggu' then 2 when 'nonaktif' then 3 else 4 end,
            c.created_at desc
   limit 1
   for update;

  -- Safe backfill for one exact, unique, currently-unlinked name + district match.
  if not found then
    select count(*) into v_match_count
      from public.member_cards c
     where c.registration_id is null and c.is_sample = false
       and lower(regexp_replace(trim(c.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(v_member.full_name), '\s+', ' ', 'g'))
       and c.district = v_member.district;
    if v_match_count = 1 then
      select c.id, c.member_number, c.status into v_card
        from public.member_cards c
       where c.registration_id is null and c.is_sample = false
         and lower(regexp_replace(trim(c.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(v_member.full_name), '\s+', ' ', 'g'))
         and c.district = v_member.district
       limit 1
       for update;
      update public.member_cards set registration_id = p_registration_id where id = v_card.id;
      v_action := 'linked_existing';
    end if;
  end if;

  if v_card.id is not null and v_card.status = 'aktif' then
    if v_action is null then v_action := 'existing_active'; end if;
  elsif v_card.id is not null and v_card.status in ('menunggu','nonaktif') then
    if v_action is null then v_action := case when v_card.status = 'menunggu' then 'activated_existing' else 'reactivated_existing' end; end if;
    update public.member_cards set status = 'aktif' where id = v_card.id
      returning id, member_number, status into v_card;
  else
    perform pg_advisory_xact_lock(hashtext('gmpi-member-card-number-' || v_year)::bigint);
    select coalesce(max((regexp_match(c.member_number, '^GMPI-SDA-' || v_year || '-([0-9]+)$'))[1]::integer), 100)
      into v_last_number
      from public.member_cards c
     where c.is_sample = false and c.member_number like 'GMPI-SDA-' || v_year || '-%';
    v_next_number := greatest(coalesce(v_last_number, 100), 100) + 1;
    v_member_number := 'GMPI-SDA-' || v_year || '-' || lpad(v_next_number::text, 4, '0');

    insert into public.member_cards (
      member_number, full_name, district, jabatan, status, issued_at, valid_until, registration_id, is_sample
    ) values (
      v_member_number, v_member.full_name, v_member.district, v_jabatan, 'menunggu', current_date,
      (current_date + interval '2 years')::date, p_registration_id, false
    ) returning id, member_number, status into v_card;

    -- Owner approval is the single final decision for this direct-issue flow.
    update public.member_cards set status = 'aktif' where id = v_card.id
      returning id, member_number, status into v_card;
    v_action := 'issued';
  end if;

  insert into public.member_registration_kta_issue_audit
    (registration_id, member_card_id, member_number, actor_email, action)
  values (p_registration_id, v_card.id, v_card.member_number, v_actor, coalesce(v_action, 'existing_active'));

  return jsonb_build_object(
    'ok', true,
    'registration_id', p_registration_id,
    'card_id', v_card.id,
    'member_number', v_card.member_number,
    'card_status', v_card.status,
    'action', coalesce(v_action, 'existing_active')
  );
end;
$$;

revoke all on function public.owner_approve_member_and_issue_kta(uuid) from public, anon;
grant execute on function public.owner_approve_member_and_issue_kta(uuid) to authenticated;

notify pgrst, 'reload schema';
