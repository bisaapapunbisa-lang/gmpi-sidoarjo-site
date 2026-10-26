MENYAMBUNGKAN PENDAFTARAN ANGGOTA DENGAN KTA
GMPI DPD Sidoarjo

Paket ini menambahkan kolom “Status KTA” di tabel Pendaftaran anggota, terpisah dari status pendaftaran. Baris yang sudah bertaut menampilkan nomor dan status kartu (Menunggu persetujuan KTA, Aktif/disetujui, Ditolak, Nonaktif, atau Dicabut).

Koneksi
- KTA baru yang dipilih dari “Pendaftar tersimpan” tetap tertaut menggunakan `member_cards.registration_id`.
- KTA baru yang diisi manual akan otomatis ditautkan bila tepat ada satu pendaftar aktif dengan nama+kecamatan yang sama.
- KTA lama yang belum bertaut akan menawarkan tombol “Hubungkan KTA” bila ada tepat satu kecocokan kartu dan pendaftar. Bila nama/kecamatan ganda, sistem tidak menautkan otomatis demi mencegah salah orang; buka kartu melalui modul Kartu anggota, pilih pendaftar tersimpan yang benar, lalu simpan.
- `registration_id` sudah tersedia dari migration inti `202610200004_member_cards.sql`, jadi pembaruan ini tidak memerlukan migration Supabase baru.

Pemasangan
1. Ganti `admin.js` dan `admin.css` di repo/branch produksi dengan file dari paket.
2. Commit/push dan tunggu deploy Vercel.
3. Muat ulang Admin dengan Ctrl+Shift+R. Buka Pendaftaran anggota dan periksa kolom Status KTA.

Uji lokal: `node --check admin.js` berhasil; arsip lulus `unzip -t`. Browser live belum diuji setelah pembaruan lokal ini.
