# Perubahan Struktur Ketua Harian GMPI Sidoarjo

## Isi paket

- `admin.js` — menambahkan tombol untuk membuat posisi Ketua Harian I/II di editor admin.
- `struktur.js` — menampilkan dua posisi Ketua Harian pada cabang yang sama dan menyediakan placeholder I/II pada bagan cadangan.
- `struktur.css` — memberi ruang lebih lebar agar dua kartu Ketua Harian tampil berdampingan.

## Terapkan ke situs

1. Ekstrak `struktur-ketua-harian-i-ii.zip`.
2. Ganti tiga berkas tersebut pada root proyek situs, lalu commit/push agar Vercel membangun ulang situs.
3. Setelah deployment selesai, masuk ke halaman Admin dengan akun Pemilik/Editor dan buka **Struktur organisasi DPD**.
4. Di kelompok **Ketua Harian**, klik **＋ Tambah posisi Ketua Harian I/II**. Baris baru akan bernama **Ketua Harian I**; biarkan nama dan fotonya kosong.
5. Pada baris Faizal yang sudah ada, ubah kolom jabatan menjadi **Ketua Harian II** dan pastikan nama tetap **FAIZAL RIZZA ACHYANSYAH MALAWAT**.
6. Pada kelompok **Departemen**, klik **Hapus departemen** di entri **KETUA HARIAN II — FAIZAL RIZZA ACHYANSYAH MALAWAT** agar tidak tampil ganda.
7. Klik **Simpan struktur**. Perubahan data akan tampil di beranda.

Baris posisi I sengaja dibiarkan tanpa nama; bagan menampilkan teks **Segera diisi**. Paket ini mengubah berkas sumber lokal, bukan situs produksi atau data Supabase. Perlu deploy Vercel dan akun Pemilik/Editor untuk menyelesaikan penerapan live.
