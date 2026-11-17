# Panduan Berita Media Mitra — GMPI DPD Sidoarjo

Panduan ini menjelaskan cara pengurus menyiapkan akses dan cara redaksi media mengirim berita ke website GMPI. Berita dapat berupa artikel yang ditulis langsung di panel, atau ringkasan dengan tautan ke artikel asli di situs media.

## 1. Pengurus menyiapkan media dan akun redaksi

Langkah ini dilakukan oleh akun **Pemilik / akses penuh**.

1. Buka **https://www.gmpisidoarjo.com/admin** dan masuk dengan akun Pemilik.
2. Pilih tab **Berita**. Gulir ke bagian **Media mitra & akun redaksi**.
3. Di bagian **Nama media**, tulis nama yang akan ditampilkan pada berita. Isi **Situs web** dengan alamat situs media (opsional), lalu klik **+ Tambah media**.
4. Undang redaksi di Supabase: **Authentication → Users → Invite user**. Masukkan alamat email redaksi yang akan digunakan untuk masuk Admin dan kirim undangan. Redaksi perlu mengikuti instruksi pada email undangan untuk menyiapkan akun/kata sandi.
5. Kembali ke Admin → **Berita**. Pada kartu media yang dibuat, masukkan alamat email yang sama pada kolom akun redaksi, lalu klik **Hubungkan**. Pastikan email tidak salah ketik.
6. Pastikan media berstatus aktif. Pengaturan **Aktif (berita tampil di website)** harus dicentang agar berita media dapat muncul di situs.
7. Pilih alur penerbitan:
   - **Berita perlu persetujuan pengurus** dicentang: kiriman redaksi masuk status **Menunggu persetujuan**. Pengurus memeriksa dan menekan **Terbitkan** untuk menayangkannya.
   - Tidak dicentang: redaksi dapat menerbitkan langsung. Gunakan pilihan ini hanya bila pengurus menyetujui alur tanpa moderasi sebelum tayang.
8. Logo media boleh ditambahkan lewat **Unggah logo**; ini tidak wajib untuk menulis berita.

Jika satu email redaksi dihubungkan ke beberapa media, pastikan memilih nama media yang benar saat membuat berita baru.

## 2. Redaksi masuk ke panel

1. Buka **https://www.gmpisidoarjo.com/admin**.
2. Masuk menggunakan email yang sudah diundang dan dihubungkan oleh Pemilik, beserta kata sandi akun Supabase.
3. Pilih tab **Berita**. Nama media yang terhubung akan terlihat di judul bagian berita.
4. Klik **+ Tulis berita**. Jika tombol atau tab Berita tidak ada, minta Pemilik memastikan email sudah diundang, peran media sudah aktif, akun sudah dihubungkan ke media yang aktif, lalu keluar dan masuk kembali.

## 3. Isi dan unggah berita

1. **Media** — pilih media yang menerbitkan berita (bila akun terhubung ke lebih dari satu media).
2. **Judul** — wajib, 5–160 karakter. Buat judul yang sesuai isi berita.
3. **Ringkasan** — maksimal 400 karakter. Tulis inti berita dalam satu atau dua kalimat; ringkasan ini tampil pada kartu berita.
4. **Isi berita** — maksimal 20.000 karakter. Pisahkan paragraf dengan satu baris kosong. Periksa nama, jabatan, tanggal, lokasi, ejaan, dan persetujuan kutipan/foto sebelum menerbitkan.
5. **Foto sampul** — opsional. Klik **Pilih foto sampul**, pilih JPG/JPEG, PNG, atau WebP. File asal maksimal 15 MB; sistem mengecilkan dan mengubahnya menjadi JPEG saat diunggah. Foto mendatar (rasio sekitar 16:9) paling sesuai. Tunggu sampai muncul keterangan **Foto terunggah**, lalu simpan berita.
6. **Tautan berita asli** — opsional. Isi URL artikel di situs media apabila artikel yang sama juga diterbitkan di sana. Tautan akan menjadi rujukan **Baca di …** pada berita website GMPI. Masukkan alamat lengkap, misalnya `https://contohmedia.id/berita/...`.
7. Pilih tindakan:
   - **Simpan draf** — simpan untuk dilanjutkan; belum tampil kepada pengunjung.
   - **Terbitkan** — tayangkan langsung bila media tidak mewajibkan persetujuan.
   - **Kirim untuk ditinjau** — tombol ini muncul bila media memerlukan persetujuan pengurus. Berita belum tampil sampai pengurus meninjau dan menerbitkannya.

Untuk menerbitkan, judul harus valid dan harus ada **isi berita atau tautan berita asli**. Foto sampul dan ringkasan tidak wajib, tetapi ringkasan sangat disarankan.

## 4. Memeriksa status, mengubah, dan menghapus berita

Di daftar Berita, status ditampilkan pada setiap berita:

- **Draf** — hanya tersimpan di panel.
- **Menunggu persetujuan** — menunggu pemeriksaan pengurus.
- **Tayang** — sudah tampil di bagian Berita website.
- **Disembunyikan pengurus** — ditarik oleh pengurus dan tidak dapat diubah oleh akun media; hubungi pengurus bila perlu koreksi.

Klik **Ubah** untuk memperbarui berita milik media. Jika berita sudah tayang dan disimpan dengan tindakan tayang, perubahan akan tetap tayang kecuali media memerlukan persetujuan; dalam hal itu perubahan kembali menunggu peninjauan. Untuk menghapus berita sendiri, buka **Ubah** lalu **Hapus** dan konfirmasi. Penghapusan tidak dapat dibatalkan. Hubungi pengurus jika ragu.

## 5. Jika ada masalah

- **Tab Berita tidak muncul:** pastikan masuk dengan email undangan yang benar dan Pemilik sudah menghubungkan email tersebut pada kartu media.
- **Pesan akun belum dihubungkan atau media tidak aktif:** minta Pemilik mengecek hubungan email-redaksi dan centang **Aktif (berita tampil di website)**.
- **Kolom berita belum aktif / daftar gagal dimuat:** hubungi Pemilik Admin; kemungkinan tabel atau migrasi berita belum disiapkan. Jangan mengubah SQL atau pengaturan Supabase sendiri.
- **Foto gagal diunggah:** cek koneksi, format file (JPG/PNG/WebP), dan ukuran asal (maksimal 15 MB). Coba ulang setelah halaman dimuat kembali; jangan klik simpan sebelum unggahan selesai.
- **Berita tidak langsung tampil:** periksa statusnya. Status **Draf** perlu diterbitkan; **Menunggu persetujuan** perlu disetujui pengurus; media yang dinonaktifkan tidak ditampilkan.
- **Berita disembunyikan:** hanya pengurus GMPI yang dapat meninjau atau menampilkannya lagi.

## Batas akses

Akun media hanya dapat melihat dan mengelola berita dari media yang ditautkan kepadanya. Akun ini bukan akun Pemilik dan tidak memperoleh akses ke aduan warga, data pendaftaran anggota, data KTP, kartu anggota, maupun pengaturan situs. Jangan berbagi kata sandi akun; minta Pemilik mencabut akses jika redaksi tidak lagi bertugas.
