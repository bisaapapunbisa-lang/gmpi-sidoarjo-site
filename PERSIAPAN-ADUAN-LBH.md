# Operasional aduan langsung LBH

- Aduan baru dari formulir Posko Digital disimpan di tabel privat dan ditampilkan pada
  **Admin → Aduan LBH** untuk Pemilik dan Petugas LBH. Data lama di email tidak dipindahkan.
- Tidak ada notifikasi email otomatis. Petugas perlu memeriksa panel secara berkala.
- Aduan baru diberi tanggal batas simpan satu bulan setelah tanggal diterima dan dijadwalkan
  dihapus dari database aktif pada tanggal tersebut, **termasuk aduan yang belum selesai**.
  Jadwal pg_cron berjalan setiap hari pukul 00:00 UTC; pekerjaan yang gagal memerlukan
  pemeriksaan dan penanganan. Salinan/cadangan penyedia dan salinan yang dibuat petugas
  tidak dihapus oleh jadwal ini dan harus dikelola terpisah. Aduan yang tidak dibuat
  melalui fungsi ini tidak ikut dihapus oleh jadwal.
- Pemberitahuan privasi versi `aduan-lbh-v1` ada di `privasi-aduan.html`. DPD harus
  meninjau kesesuaiannya dengan hukum, menetapkan penanggung jawab, memeriksa kontak,
  dan memastikan permintaan pelapor serta penyimpanan cadangan dapat ditangani. Draf
  kebijakan dan SOP yang tersedia bukan persetujuan hukum otomatis.
- Perlindungan spam saat ini terbatas pada batas jumlah global dan per kontak; ini bukan
  CAPTCHA/WAF dan dapat disalahgunakan untuk menghambat aduan. Pantau penyalahgunaan.
- Pemilik harus membatasi peran LBH dan akun Pemilik, meninjau akses secara berkala,
  serta melindungi perangkat dan kerahasiaan aduan.
