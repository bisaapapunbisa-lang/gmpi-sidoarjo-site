PEMILIK — EDIT SEMUA DATA PENDAFTARAN ANGGOTA
GMPI DPD Sidoarjo

Tujuan
Akun ber-role `owner` dapat mengubah seluruh data pendaftaran anggota dari Admin tanpa perlu diberi role `registrar`. Fitur ini menambah tombol “Edit data…” pada setiap baris pendaftaran, khusus Pemilik.

Data yang dapat diubah
- Nama, NIK, tempat/tanggal lahir, jenis kelamin, nomor kontak.
- Kecamatan/domisili, alamat, kelurahan/desa, RT, RW, kode pos, kota/kabupaten luar Sidoarjo.
- Bidang, jabatan, dan status pendaftaran.

Dokumen KTP dan foto profil tidak diganti lewat form ini. Keduanya tetap privat dan dibuka melalui tombol dokumen yang sudah ada. Audit mencatat ID anggota, akun Pemilik, waktu, dan nama kolom yang diubah; nilai NIK/alamat tidak disalin ke audit.

Isi paket
- admin.html, admin.css, admin.js — frontend Admin terbaru.
- supabase/migrations/202610260022_hapus_pendaftaran_duplikat_aman.sql — fitur hapus duplikat terdahulu.
- supabase/migrations/202610260023_pemilik_akses_penuh_pendaftaran.sql — akses Owner ke modul pendaftaran/dokumen dan RPC aman.
- supabase/migrations/202610260024_owner_edit_member_details.sql — editor lengkap Owner dan audit perubahan.

Pemasangan frontend
1. Ganti `admin.html`, `admin.css`, dan `admin.js` di repo/branch situs produksi (mis. `rhea`).
2. Commit dan push; tunggu Vercel selesai deploy, lalu buka ulang Admin dengan Ctrl+Shift+R.

Pemasangan Supabase
1. Migration 024 wajib dijalankan di SQL Editor setelah migration inti pendaftaran dan roles.
2. Agar Owner dapat membuka modul tanpa Registrar, migration 023 juga harus sudah diterapkan.
3. Jika 023 belum diterapkan dan 022 belum pernah dijalankan: jalankan 022 lalu 023, kemudian 024.
4. Jika 022 sudah diterapkan tetapi 023 belum: jalankan 023 lalu 024.
5. Jika 023 sudah diterapkan: jangan jalankan 022 sesudahnya. Jalankan 024 saja.
6. Migration 024 tidak memberi role tambahan kepada Owner; akun Owner saja cukup. Pastikan `admin_profiles` menandai akun pembuat situs sebagai `owner`.

Tes setelah pemasangan
1. Masuk Admin dengan akun Owner, buka Pendaftaran anggota.
2. Pada kolom Aksi, pilih “Edit data…”.
3. Ubah satu atau beberapa field, simpan, dan pastikan daftar menampilkan data baru.
4. Coba ubah jabatan lewat dropdown pada baris; sebagai Owner, perubahan disimpan melalui RPC Owner yang sama.

Verifikasi yang sudah dilakukan di workspace
- `node --check admin.js` berhasil.
- Arsip diuji dengan `unzip -t`.
- Browser live dan database Supabase belum dapat diuji dari workspace ini; tes langkah di atas setelah pemasangan.
