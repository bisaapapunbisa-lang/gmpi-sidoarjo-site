# Catatan internal privasi pendaftaran — bukan pemberitahuan publik

Pemberitahuan yang ditampilkan kepada pendaftar berada di `privasi-pendaftaran.html` dan ditautkan langsung pada formulir pendaftaran di `index.html`.

## Kondisi implementasi yang sudah ada

- Formulir anggota aktif: browser mengunggah dokumen ke bucket Supabase privat `member-documents` dan mengirim data pendaftaran melalui RPC `submit_member_registration`.
- Kebijakan database dan storage pada migrasi membatasi akses petugas ke peran `owner` (Pemilik Admin) dan `registrar` (Petugas Registrasi). Dokumen KTP dan pas foto tidak ditaruh di bucket publik.
- Pemberitahuan publik menyebut tujuan pemrosesan pendaftaran, data yang diminta, akses terbatas, serta cara menghubungi pengurus melalui kanal resmi organisasi.

## Hal yang masih perlu keputusan DPD sebelum ditambahkan sebagai klaim publik

- Tetapkan jadwal retensi yang spesifik untuk pendaftaran yang diterima, ditolak, atau belum selesai, termasuk dokumen di storage dan proses penghapusan dari cadangan.
- Tetapkan kontak resmi khusus untuk pertanyaan/permintaan data dan proses verifikasi pemohon.
- Tinjau dasar pemrosesan, penyedia/infrastruktur yang menerima data, serta kalimat pemberitahuan bersama pihak yang berwenang.

Jangan mengubah pemberitahuan publik dengan masa retensi, alamat kontak, atau jaminan teknis yang belum ditetapkan dan diverifikasi. Dokumen ini adalah daftar tindak lanjut internal, bukan nasihat hukum.
