-- Migrasi 202610230021: PEMILIK (role owner) boleh menyetujui/meninjau kartu buatannya sendiri.
-- Petugas lain (card_approver) tetap TIDAK boleh menyetujui kartu buatan sendiri.
-- Mengganti fungsi trigger member_cards_guard versi migrasi 0008 (dua gerbangnya diberi pengecualian owner).
-- Idempoten: aman dijalankan ulang.

create or replace function public.member_cards_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  actor text := lower(coalesce(auth.jwt() ->> 'email', ''));
  approver boolean;
  is_owner boolean;
  data_changed boolean;
begin
  if actor = '' then
    if tg_op = 'UPDATE' then
      if new.card_token is distinct from old.card_token then
        raise exception 'Kode QR kartu tidak boleh diubah.';
      end if;
      new.updated_at := now();
    end if;
    return new;
  end if;

  approver := public.has_admin_role(array['owner','card_approver']::text[]);
  is_owner := public.has_admin_role(array['owner']::text[]);

  if tg_op = 'INSERT' then
    new.status := 'menunggu';
    new.submitted_by := actor;
    new.approved_by := null;
    new.approved_at := null;
    new.review_note := null;
    return new;
  end if;

  if new.card_token is distinct from old.card_token then
    raise exception 'Kode QR kartu tidak boleh diubah.';
  end if;

  new.submitted_by := old.submitted_by;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.updated_at := now();

  data_changed := (new.full_name, new.member_number, new.district, new.jabatan, new.issued_at, new.valid_until)
    is distinct from (old.full_name, old.member_number, old.district, old.jabatan, old.issued_at, old.valid_until);

  if data_changed then
    new.status := 'menunggu';
    new.submitted_by := actor;
    new.approved_by := null;
    new.approved_at := null;
    new.review_note := null;
    return new;
  end if;

  if new.status is not distinct from old.status then
    if new.review_note is distinct from old.review_note and not approver then
      new.review_note := old.review_note;
    end if;
    return new;
  end if;

  if new.status = 'aktif' then
    if not approver then
      raise exception 'Hanya Penyetuju Kartu atau Pemilik yang dapat menyetujui/mengaktifkan kartu.' using errcode = '42501';
    end if;
    if old.status not in ('menunggu','nonaktif') then
      raise exception 'Kartu berstatus % tidak bisa langsung diaktifkan. Ajukan ulang dulu.', old.status;
    end if;
    -- Pemilik dibebaskan dari larangan setujui-sendiri; petugas lain tetap dilarang.
    if actor = coalesce(old.submitted_by, '') and not is_owner then
      raise exception 'Kartu tidak boleh disetujui oleh orang yang membuat atau mengubahnya.' using errcode = '42501';
    end if;
    if old.status = 'menunggu' then
      new.approved_by := actor;
      new.approved_at := now();
      new.review_note := null;
    end if;
  elsif new.status = 'ditolak' then
    if not approver then
      raise exception 'Hanya Penyetuju Kartu atau Pemilik yang dapat menolak kartu.' using errcode = '42501';
    end if;
    if old.status <> 'menunggu' then
      raise exception 'Hanya kartu yang menunggu persetujuan yang bisa ditolak.';
    end if;
    if actor = coalesce(old.submitted_by, '') and not is_owner then
      raise exception 'Kartu tidak boleh ditinjau oleh orang yang membuat atau mengubahnya.' using errcode = '42501';
    end if;
  elsif new.status = 'menunggu' then
    if old.status not in ('ditolak','dicabut','nonaktif') then
      raise exception 'Status kartu tidak valid.';
    end if;
    new.submitted_by := actor;
    new.approved_by := null;
    new.approved_at := null;
    new.review_note := null;
  elsif new.status in ('nonaktif','dicabut') then
    if old.status not in ('aktif','nonaktif') then
      raise exception 'Hanya kartu yang sudah disetujui yang bisa dinonaktifkan atau dicabut.';
    end if;
  end if;
  return new;
end;
$$;

-- Cek: fungsi sudah berisi pengecualian owner
select proname, md5(prosrc) as sidik from pg_proc where proname = 'member_cards_guard';
