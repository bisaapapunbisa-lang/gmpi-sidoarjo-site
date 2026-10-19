# Publikasi GMPI DPC Sidoarjo — GitHub, Vercel, Supabase

## Status integrasi

Frontend statis dan konfigurasi dasar sudah disiapkan. Repository tujuan: `https://github.com/bisaapapunbisa-lang/gmpi-sidoarjo-site.git`. Branch `main`, remote `origin`, dan commit awal sudah disiapkan secara lokal. **Push ke GitHub belum berhasil** karena sesi ini tidak memiliki autentikasi GitHub; jangan kirim token/password ke chat. Konektor GitHub tidak tersedia di sesi ini. Proyek Vercel dan Supabase juga belum terhubung. Formulir belum mengirim atau menyimpan data.

## 1. Push ke GitHub

Di salinan proyek yang punya akses ke repository, autentikasi ke GitHub (misalnya melalui GitHub CLI dengan `gh auth login` atau credential manager), lalu jalankan:

```bash
git push -u origin main
```

Jika mulai dari arsip sumber tanpa riwayat Git, jalankan dari folder proyek:

```bash
git init -b main
git add .
git commit -m "Initial GMPI Sidoarjo website"
git remote add origin https://github.com/bisaapapunbisa-lang/gmpi-sidoarjo-site.git
git push -u origin main
```

Jangan commit file `.env`, secret, NIK, KTP, atau data calon anggota. Folder `/uploads/` sengaja diabaikan karena berisi unggahan sumber yang tidak dipakai langsung oleh situs.

## 2. Deploy frontend ke Vercel

Di Vercel pilih **Add New → Project**, hubungkan akun GitHub, lalu import `bisaapapunbisa-lang/gmpi-sidoarjo-site`. Deploy sebagai static site dari root repository. `vercel.json` mengatur header dasar. Setelah GitHub tersambung, push baru ke `main` akan memicu deployment.

## 3. Siapkan Supabase

1. Buat project Supabase dan simpan Project URL serta `service_role` key secara privat.
2. Jalankan `supabase/migrations/202610200001_private_intake.sql` di SQL Editor project.
3. Migrasi membuat tabel aduan/registrasi dengan RLS aktif, tanpa akses publik, dan bucket dokumen privat.
4. Jangan meletakkan `service_role` key di HTML, JavaScript browser, GitHub, atau chat. Kelak key hanya boleh ada di Vercel **Environment Variables** untuk fungsi server.

## 4. Sebelum mengaktifkan pengiriman formulir

Belum ada endpoint server yang menyimpan data. Jangan mengubah formulir menjadi `insert` langsung dari browser. Sebelum menerima NIK/KTP/aduan nyata, siapkan dan tinjau:

- endpoint server-side di Vercel untuk validasi, CAPTCHA/rate limit, dan operasi database;
- unggahan dokumen melalui signed URL terbatas ke bucket privat, bukan URL publik;
- pemberitahuan privasi yang menjelaskan tujuan, akses pengurus, masa retensi, penghapusan, dan kontak pengelola data;
- daftar petugas DPC yang berwenang mengakses data serta proses penghapusan berkala.

Migration membuat fondasi privasi, bukan dengan sendirinya mengaktifkan atau mengamankan alur penerimaan formulir. Lakukan uji RLS/storage dengan data dummy sebelum publikasi.
