# Aset media GMPI DPD Sidoarjo

Situs menggunakan aset lokal agar halaman tetap dapat dipratinjau tanpa CDN. Logo terbaru dari pengguna dipasang dalam versi terpotong di `assets/logo-gmpi-sidoarjo-crop.webp` dan digunakan di header, hero, serta footer. Sumber asli tetap disimpan sebagai `assets/logo-gmpi-sidoarjo.jpg`.

## Video hero

Tambahkan video kompilasi aksi resmi berdurasi sekitar 10 detik ke:

`assets/hero-aksi.mp4`

Format MP4 (H.264), tanpa audio, komposisi landscape 16:9, ukuran yang disarankan di bawah 12 MB. Situs akan otomatis menampilkan video jika file tersedia; jika belum, latar kamuflase grafis tetap tampil. Gunakan hanya dokumentasi yang memang milik/diizinkan DPD.

## Galeri dokumentasi

Simpan foto dengan nama berikut di `assets/gallery/`:

- `01-bakti-sosial.jpg`
- `02-rapat-koordinasi.jpg`
- `03-aspirasi-warga.jpg`
- `04-aksi-kemanusiaan.jpg`
- `05-pengawalan-aspirasi.jpg`

Foto akan menggantikan bidang placeholder secara otomatis. Tambahkan tanggal/lokasi yang telah diverifikasi pada caption di `index.html`.

## Surel formulir

Edit `SITE_CONFIG` di `script.js` dan isi alamat LBH dan registrasi yang telah diverifikasi. Formulir membuka aplikasi email pengunjung (`mailto:`), sehingga pengunjung masih perlu menekan **Kirim**. Pengiriman otomatis ke inbox memerlukan backend/form service dan konfigurasi keamanan tersendiri; jangan masukkan kredensial rahasia ke JavaScript publik.
