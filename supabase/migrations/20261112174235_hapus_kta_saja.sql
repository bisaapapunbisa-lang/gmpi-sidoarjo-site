-- Hapus KTA duplikat tanpa menghapus data pendaftaran atau dokumen pendaftar.
-- Kartu aktif/nonaktif harus dicabut dahulu. Nomor dengan riwayat iuran/siaga
-- ditahan untuk pemeriksaan manual agar tidak salah menautkan riwayat.
create or replace function public.owner_delete_card_only(
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
  v_actor text := lower(coalesce(auth.jwt() ->> 'email', auth.uid()::text, 'owner'));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_audit_id uuid;
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Akses ditolak: hanya Pemilik yang dapat menghapus KTA.' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 300 then
    raise exception 'Alasan penghapusan wajib 5–300 karakter.' using errcode = '22023';
  end if;
  select id, registration_id, member_number, full_name, status, is_sample
    into v_card from public.member_cards where id = p_card_id for update;
  if not found or v_card.is_sample then
    raise exception 'KTA tidak ditemukan atau merupakan kartu contoh.' using errcode = 'P0002';
  end if;
  if v_card.status not in ('dicabut', 'menunggu', 'ditolak') then
    raise exception 'KTA aktif atau nonaktif harus dicabut terlebih dahulu.' using errcode = '22023';
  end if;
  if upper(btrim(coalesce(p_confirm_member_number, ''))) <> upper(v_card.member_number)
     or lower(btrim(regexp_replace(coalesce(p_confirm_name, ''), '\s+', ' ', 'g'))) <>
        lower(btrim(regexp_replace(v_card.full_name, '\s+', ' ', 'g'))) then
    raise exception 'Konfirmasi nomor KTA atau nama tidak cocok.' using errcode = '22023';
  end if;
  if exists (select 1 from public.dues_payments where upper(btrim(member_number)) = upper(btrim(v_card.member_number))) then
    raise exception 'KTA memiliki riwayat iuran. Penghapusan diblokir agar riwayat tidak salah terhubung; minta Pemilik dan Bendahara meninjau.' using errcode = '23503';
  end if;
  if exists (select 1 from public.sos_alerts where upper(btrim(member_number)) = upper(btrim(v_card.member_number))) then
    raise exception 'KTA memiliki catatan Siaga. Penghapusan diblokir agar riwayat tidak salah terhubung; periksa dahulu.' using errcode = '23503';
  end if;
  insert into public.member_card_permanent_deletion_audit (member_card_id, member_number, registration_id, actor_email, reason)
    values (v_card.id, v_card.member_number, v_card.registration_id, v_actor, v_reason)
    returning id into v_audit_id;
  -- Trigger yang sudah ada mengantrikan foto khusus KTA untuk pembersihan terpisah.
  delete from public.member_cards where id = v_card.id;
  return jsonb_build_object('ok', true, 'card_audit_id', v_audit_id, 'registration_deleted', false);
end;
$$;
revoke all on function public.owner_delete_card_only(uuid,text,text,text) from public, anon;
grant execute on function public.owner_delete_card_only(uuid,text,text,text) to authenticated;
notify pgrst, 'reload schema';

-- Angka KTA dipakai sebagai penghubung riwayat. Jangan mengganti nomor secara
-- diam-diam bila transaksi atau laporan darurat memakai nomor lama/tujuan.
create or replace function public.guard_member_card_number_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.member_number is distinct from old.member_number then
    if exists (select 1 from public.dues_payments where upper(btrim(member_number)) in (upper(btrim(old.member_number)), upper(btrim(new.member_number)))) then
      raise exception 'Nomor lama atau tujuan memiliki riwayat iuran. Periksa bersama Bendahara sebelum mengubah nomor KTA.' using errcode = '23503';
    end if;
    if exists (select 1 from public.sos_alerts where upper(btrim(member_number)) in (upper(btrim(old.member_number)), upper(btrim(new.member_number)))) then
      raise exception 'Nomor lama atau tujuan memiliki catatan Siaga. Periksa terlebih dahulu sebelum mengubah nomor KTA.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_member_card_number_history() from public, anon, authenticated;
drop trigger if exists guard_member_card_number_history on public.member_cards;
create trigger guard_member_card_number_history before update of member_number on public.member_cards
for each row execute function public.guard_member_card_number_history();
