# Publikasi GMPI DPC Sidoarjo — GitHub, Vercel, Supabase

## Status saat ini

- Repository `https://github.com/bisaapapunbisa-lang/gmpi-sidoarjo-site` sudah menerima situs pada branch `main`.
- Pengguna telah menyambungkan repository ke Vercel.
- Project Supabase `gmpi` sehat di region Singapore. Migrasi `202610200001_private_intake.sql` berhasil dijalankan; tabel `citizen_reports` dan `member_registrations` terlihat di Table Editor.
- Panel Admin baru telah disiapkan di source lokal. Perubahan terbaru belum diunggah ke GitHub. Migrasi role `202610200002_admin_panel_roles.sql` belum dijalankan, `supabase-config.js` belum diisi dengan publishable key, dan belum ada akun yang diberi role.
- Formulir publik masih prototipe dan tidak mengirim/menyimpan data. Email LBH resmi belum tersedia dan draf privasi belum disetujui DPC.

## Perbarui source di GitHub

Setelah mengunduh arsip source terbaru, ekstrak lalu unggah isi folder ke repository GitHub melalui **Add file → Upload files**. Pertahankan struktur folder. Commit perubahan ke branch `main`; Vercel akan membuat deployment baru.

## Penyiapan panel Admin

Ikuti `ADMIN-SETUP.md` secara berurutan. Migrasi Admin menambahkan role `owner`, `content_editor`, `lbh_officer`, dan `registrar`; aturan RLS membatasi aduan dan data NIK/KTP berdasarkan role. Tombol Admin publik hanya membuka halaman login—tidak memberi akses tanpa akun undangan dan role aktif.

**Jangan pernah menaruh `service_role` key di HTML/JavaScript browser, GitHub, atau chat.** Admin menggunakan publishable/anon key bersama RLS; data sensitif hanya dapat dibaca melalui role `registrar`.

## Formulir publik

Belum ada endpoint server-side untuk menerima data. Jangan mengubah formulir menjadi insert langsung dari browser. Sebelum pendaftaran dan aduan nyata diaktifkan, DPC harus menyetujui pemberitahuan privasi, menetapkan email resmi LBH, mengonfirmasi masa simpan dan petugas yang berwenang, serta menyiapkan endpoint HTTPS anti-spam dan unggahan dokumen privat. Draf kerja ada pada `PRIVACY-NOTICE-DRAFT.md` dan belum untuk dipublikasikan.
