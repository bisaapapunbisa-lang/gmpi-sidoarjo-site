# Perbaikan keterbacaan nama pada pratinjau Struktur di Admin

Pada tangkapan layar, nama pengurus tampil putih pucat di atas latar pratinjau yang terang. Ini terjadi karena gaya tema gelap bagan publik ikut diterapkan ke pratinjau Admin.

Paket ini hanya menambahkan aturan CSS yang dibatasi ke `.org-admin-preview`: nama menjadi gelap dan mudah dibaca, jabatan/judul mendapat kontras lebih kuat, serta kartu pratinjau kembali berlatar putih. Gaya bagan publik tidak diubah; data Supabase, nama, foto, dan logo juga tidak disentuh.

## Penerapan

Unggah `struktur.css` dari paket ini ke folder root repositori GitHub, ganti berkas `struktur.css` yang ada, lalu commit/deploy. Setelah deploy, muat ulang halaman `/admin` dengan refresh penuh (Ctrl+F5) agar CSS baru dimuat.
