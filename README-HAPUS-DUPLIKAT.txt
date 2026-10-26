FITUR HAPUS PENDAFTARAN DUPLIKAT — GMPI DPD SIDOARJO

Isi paket:
- admin.js — menambah aksi Hapus duplikat dengan modal konfirmasi.
- admin.css — gaya modal dan pesan pembersihan dokumen tertunda.
- supabase/migrations/202610260022_hapus_pendaftaran_duplikat_aman.sql — RPC, audit, dan kebijakan RLS/Storage.

Pemasangan (belum diterapkan ke situs live):
1. Jalankan file SQL migration di Supabase SQL Editor pada proyek yang benar.
2. Ganti admin.js dan admin.css pada repo situs dengan file dari paket ini.
3. Deploy situs seperti proses deploy yang biasa.
4. Pastikan akun yang mengelola data memiliki peran Petugas Registrasi (registrar). Owner saja tidak cukup, sesuai kebijakan akses dokumen sensitif.

Alur aman di Admin > Pendaftaran Anggota:
1. Tandai pendaftaran duplikat berstatus Ditolak.
2. Klik Hapus duplikat… pada baris yang benar.
3. Ketik nama lengkap, empat digit terakhir NIK, dan alasan.
4. Penghapusan permanen menghapus baris pendaftaran serta foto KTP dan foto profil di bucket privat member-documents.
5. Catatan audit menyimpan ID registrasi, email petugas, waktu, alasan, dan status pembersihan—tanpa nama/NIK.
6. Jika pendaftaran sudah terhubung ke KTA, sistem menolak penghapusan.
7. Jika penghapusan foto Storage tertunda, panel menampilkan tombol pembersihan ulang. Berkas yang tertunda tetap di bucket privat dan hanya dapat dibersihkan oleh registrar yang sama.

Keamanan:
- Tidak menggunakan service_role key di browser.
- Aksi dibatasi server-side oleh role registrar; RLS dan RPC memeriksa izin.
- Status harus Ditolak; konfirmasi nama dan 4 digit terakhir NIK diwajibkan.
- Pendaftaran yang sudah terkait KTA diblokir agar tidak meninggalkan kartu yatim.
- Foto hanya dihapus melalui Storage API setelah ada catatan audit pending; aplikasi tidak menghapus langsung baris storage.objects.

Jangan menghapus pendaftaran produksi tanpa memverifikasi tanggal, kecamatan, empat digit akhir NIK, dan alasan duplikat.
