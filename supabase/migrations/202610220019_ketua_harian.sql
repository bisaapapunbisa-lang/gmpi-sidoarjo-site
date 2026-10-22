-- Migrasi 202610220019: tambah kursi Ketua Harian (sort 60, antara Sekretaris 50 dan Bendahara 70)
-- Tambahkan baris baru (abaikan kalau sudah ada — perintah ini aman dijalankan ulang)
INSERT INTO org_structure (section, jabatan, department, person_name, photo_path, sort_order)
SELECT 'ketua_harian', 'Ketua Harian', NULL, NULL, NULL, 60
WHERE NOT EXISTS (SELECT 1 FROM org_structure WHERE section = 'ketua_harian');

-- Cek hasil (harus muncul 11 baris; Ketua Harian berada di antara Sekretaris dan Bendahara)
SELECT section, jabatan, person_name, sort_order FROM org_structure ORDER BY sort_order;
