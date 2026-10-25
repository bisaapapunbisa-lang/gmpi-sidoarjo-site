-- Migrasi 202610220020: tambah bagian Humas (1 kursi, sort 65, antara Ketua Harian 60 dan Bendahara 70).
-- Sekaligus mendaftarkan 'humas' ke check constraint jenis kursi. Idempoten: aman dijalankan ulang.

ALTER TABLE org_structure DROP CONSTRAINT org_structure_section_check;
ALTER TABLE org_structure ADD CONSTRAINT org_structure_section_check
  CHECK (section IN ('penasihat','pembina','ketua','wakil_ketua','sekretaris','ketua_harian','humas','bendahara','departemen'));

INSERT INTO org_structure (section, jabatan, department, person_name, photo_path, sort_order)
SELECT 'humas', 'Kepala Humas', NULL, NULL, NULL, 65
WHERE NOT EXISTS (SELECT 1 FROM org_structure WHERE section = 'humas');

SELECT section, jabatan, person_name, sort_order FROM org_structure ORDER BY sort_order;
