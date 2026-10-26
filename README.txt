PEMBARUAN KTA — FOTO PROFIL TERSIMPAN DIMUAT OTOMATIS
GMPI DPD Sidoarjo

Isi paket
- admin.html, admin.css, admin.js — aset Admin terbaru. admin.js memuat foto profil anggota dari pendaftaran tersimpan, tidak menggunakan foto KTP.
- supabase/migrations/202610260022_hapus_pendaftaran_duplikat_aman.sql — fitur penghapusan pendaftaran yang ditolak secara terkonfirmasi dan tercatat.
- supabase/migrations/202610260023_pemilik_akses_penuh_pendaftaran.sql — akses Owner ke pendaftaran/dokumen dan RPC penghapusan untuk Owner.

Cara kerja foto
1. Di form Kartu Tanda Anggota, pilih orang dari “Pendaftar tersimpan”. Nama, kecamatan, dan jabatan diisi dari pendaftaran; foto profil privat akan dimuat otomatis.
2. Kartu baru ditautkan ke pendaftaran. Saat dibuka lagi, kartu memakai tautan itu untuk memulihkan foto.
3. Kartu lama yang belum bertaut mencoba mencocokkan nama+kecamatan; foto dimuat otomatis hanya bila kecocokannya tunggal. Jika ada beberapa orang yang sama, pilih entri yang benar dari daftar.
4. Foto yang diunggah manual dari perangkat hanya dipakai selama sesi halaman dan tidak tersimpan ke server. Agar bisa dimuat lagi lintas sesi, gunakan foto profil yang memang sudah tersimpan pada pendaftaran anggota.
5. Foto KTP tidak pernah dipakai sebagai foto kartu. Foto profil dan KTP tetap privat di bucket `member-documents`; URL akses sementara berlaku 60 detik.

Pemasangan frontend
1. Di repo situs/branch produksi yang terhubung ke Vercel, ganti `admin.html`, `admin.css`, dan `admin.js` di folder utama dengan file paket ini.
2. Commit/push dan tunggu deploy selesai. Sesudahnya muat ulang Admin dengan hard refresh (Ctrl+Shift+R) atau buka ulang tab.

Pemasangan Supabase (akses Owner dan penghapusan aman)
- Kolom `member_cards.registration_id` sudah dibuat oleh migration inti `202610200004_member_cards.sql`; pembaruan auto-foto tidak menambah kolom baru.
- Bila migration 022 belum pernah dijalankan, jalankan 022 terlebih dahulu. Setelah itu jalankan 023. Jika 022 sudah dijalankan sebelumnya, jangan perlu menjalankannya lagi—jalankan 023 bila belum diterapkan.
- Jika 023 sudah berhasil diterapkan, jangan jalankan migration 022 sesudahnya: 022 mengganti RPC menjadi versi lama khusus Registrar. Migration 023 adalah versi akhir yang memberi Owner akses tanpa role Registrar.
- Migration 023 membuat Owner dapat membuka data pendaftaran dan dokumen privat; Registrar tetap dapat menjalankan tugas registrasi.

Tes setelah deploy
1. Masuk Admin menggunakan akun Pemilik atau Petugas Registrasi.
2. Buka Kartu Tanda Anggota dan pilih pendaftar yang mempunyai foto profil tersimpan. Pastikan pratinjau kartu menampilkan foto dan status menyebut foto dimuat otomatis.
3. Simpan kartu baru, buka kembali dari daftar kartu, lalu pastikan fotonya tetap tampil.
4. Buka kartu lama: jika tautan pendaftaran belum ada, sistem mencoba kecocokan nama+kecamatan yang unik.

Catatan verifikasi
- Pemeriksaan lokal: `node --check admin.js` berhasil.
- Perilaku browser/live dan izin pada proyek Supabase belum dapat diverifikasi dari workspace ini. Tes langkah di atas setelah aset dan migration yang diperlukan dipasang.
- Jika tertulis pendaftar belum memiliki foto profil tersimpan, berarti baris pendaftar tidak memiliki `profile_object_key`; pilih foto profil di pendaftaran terlebih dahulu. Mengunggah foto manual di form kartu tidak menyimpan ulang file ke server.
