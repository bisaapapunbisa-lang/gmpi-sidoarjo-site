# Catatan internal privasi pendaftaran — GMPI DPD Sidoarjo

Pemberitahuan publik berada di `privasi-pendaftaran.html` dan ditautkan langsung di dekat unggahan KTP/pas foto serta kotak persetujuan pada `index.html`.

## Aturan yang dinyatakan kepada pendaftar

- Pendaftaran ditolak: data dan dokumen dihapus paling lambat 90 hari setelah keputusan penolakan; pendaftaran tidak dilengkapi: dihapus paling lambat 90 hari sejak tanggal pengajuan.
- Pendaftaran diterima: data yang dibutuhkan untuk administrasi disimpan selama keanggotaan aktif, lalu dihapus paling lambat 12 bulan setelah keanggotaan berakhir.
- Perpanjangan hanya untuk data minimum bila diwajibkan hukum atau diperlukan menyelesaikan sengketa/kewajiban organisasi, dengan alasan dan masa tambahan dibatasi.
- Kontak permintaan: `gmpisda@gmail.com`. Pendaftar diminta tidak mengirim NIK penuh atau dokumen identitas melalui email.

## Kontrol dan pelaksanaan

- Formulir aktif mengirim data lewat RPC Supabase dan mengunggah dokumen ke bucket privat `member-documents`.
- Policy database/storage membatasi pembacaan ke akun berperan `owner` (Pemilik Admin) dan `registrar` (Petugas Registrasi).
- Saat ini **belum ada penghapusan otomatis terjadwal** untuk data pendaftaran atau dokumen. Jadwal dalam pemberitahuan merupakan batas kebijakan yang harus dipenuhi lewat pemeriksaan dan penghapusan manual oleh Pemilik/Petugas Registrasi menggunakan prosedur penghapusan aman di Admin. Jangan menjanjikan eksekusi otomatis.
- Penghapusan pendaftaran yang sudah memiliki KTA terkait membutuhkan pemeriksaan tambahan oleh Pemilik agar tautan KTA tidak terputus tanpa sengaja. Jangan menghapus lewat SQL langsung atau menghapus berkas di luar alur audit.

Catatan ini untuk operasi internal, bukan nasihat hukum. Perpanjangan retensi selain batas di atas harus memiliki alasan tercatat dan ditinjau pengurus; penerapan jadwal otomatis membutuhkan rancangan terpisah agar tidak menghapus data anggota aktif atau memutus tautan KTA.
