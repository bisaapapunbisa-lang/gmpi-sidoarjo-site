PEMBARUAN ALAMAT RESMI WEBSITE GMPI
Domain resmi: https://www.gmpisidoarjo.com

Yang diubah
- Link QR pada KTA yang diterbitkan ke depan memakai www.gmpisidoarjo.com/V/<kode>.
- Halaman verifikasi mengakui QR baru menggunakan domain resmi dan menjelaskan bahwa QR kartu lama tetap bisa diverifikasi.
- Open Graph image untuk beranda, berita, darurat, dan RSVP memakai domain resmi.
- Panduan Admin/media dan halaman verifikasi menggunakan domain resmi.

Cara pasang
1. Ekstrak ZIP.
2. Salin file ke repo GitHub sesuai foldernya, timpa file lama saat nama/path sama.
3. Commit dan push ke branch produksi (main). Vercel akan deploy otomatis.
4. Tidak ada perubahan Supabase yang diperlukan.
5. Setelah deploy, hard-refresh situs/Admin. KTA baru yang dibuat setelah deploy memakai QR www.gmpisidoarjo.com. QR KTA yang sudah tercetak tetap dapat berfungsi karena alamat Vercel lama tetap diarahkan ke proyek yang sama.

Pemeriksaan lokal: `node --check member-card.js` lulus. Rute custom domain /V/CONTOH, halaman verifikasi, dan og-share.jpg merespons HTTP 200.
