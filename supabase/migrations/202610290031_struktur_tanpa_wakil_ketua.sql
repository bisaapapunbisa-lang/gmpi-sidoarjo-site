-- GMPI DPD Sidoarjo — struktur organisasi tanpa jabatan "Wakil Ketua".
--
-- Keputusan pengurus: DPD Sidoarjo tidak memiliki Wakil Ketua. Bagan di beranda
-- dan panel Admin tidak lagi menampilkan jabatan itu.
--
-- Migrasi ini:
--   1. menghapus slot Wakil Ketua yang masih KOSONG (tanpa nama);
--   2. bila ternyata sudah ada nama pada slot Wakil Ketua, datanya TIDAK dihapus —
--      hanya tidak ditampilkan, supaya pengurus bisa memindahkannya lebih dulu;
--   3. bila tidak ada sisa baris Wakil Ketua, kolom `section` dikunci ulang tanpa
--      nilai 'wakil_ketua' agar tidak bisa dibuat lagi.
--
-- Aman dijalankan berulang, dan aman walau migrasi 202610200013 belum dijalankan.

do $$
begin
  if to_regclass('public.org_structure') is null then
    raise notice 'Tabel org_structure belum ada — migrasi 202610200013 belum dijalankan. Lewati.';
    return;
  end if;

  -- 1) Bersihkan slot kosong peninggalan bagan lama.
  delete from public.org_structure
   where section = 'wakil_ketua'
     and coalesce(btrim(person_name), '') = ''
     and photo_path is null;

  -- 2) Bila masih ada baris berisi nama, jangan kunci ulang constraint-nya.
  if exists (select 1 from public.org_structure where section = 'wakil_ketua') then
    raise notice 'Masih ada baris Wakil Ketua berisi nama. Baris itu tidak dihapus dan tidak ditampilkan; pindahkan dulu lewat Admin bila perlu.';
    return;
  end if;

  -- 3) Kunci ulang daftar bagian tanpa 'wakil_ketua'.
  alter table public.org_structure drop constraint if exists org_structure_section_check;
  alter table public.org_structure add constraint org_structure_section_check
    check (section in (
      'penasihat','pembina','ketua',
      'sekretaris','wakil_sekretaris',
      'bendahara','wakil_bendahara',
      'ketua_harian','humas','departemen'
    ));
  raise notice 'Daftar bagian struktur dikunci tanpa wakil_ketua.';
end
$$;
