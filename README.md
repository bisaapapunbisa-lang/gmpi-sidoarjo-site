# Sembunyikan tombol Admin dari footer

Paket ini hanya menghapus tautan/tombol **Admin ↗** pada footer halaman utama. Berkas `index.html` disusun dari versi terbaru `main` yang dibaca saat paket dibuat, lalu hanya elemen tautan footer Admin yang dihapus.

## Akses admin tetap tersedia

Menyembunyikan tombol tidak menonaktifkan panel dan bukan pengamanan akses. Pengurus/admin yang berhak tetap dapat membuka langsung `https://gmpisidoarjo.com/admin` (atau `admin.html`) dan masuk dengan akun yang diundang serta sudah diberi peran. Pemilik Admin dapat mengundang email masing-masing dan memberi peran yang diperlukan. Akun yang belum diberi peran tetap tidak dapat melihat data.

## Cara menerapkan

Unggah `index.html` ke folder root repositori GitHub dan ganti berkas `index.html` yang ada. Paket ini **tidak mengubah** `admin.html`, sistem login, data Supabase, atau peran pengguna. Periksa hasil setelah situs selesai di-deploy.
