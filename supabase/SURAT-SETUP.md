# Aktivasi Surat & Persetujuan Internal

## Status
Kode tersedia; bukan TTE tersertifikasi. Belum terhubung otomatis ke Google Sheets/Apps Script. Register baru memakai Supabase. Tidak mengubah surat/QR lama.

PDF Word/Docs harus sudah memiliki nomor dan tanggal yang benar. Sistem menambahkan **halaman persetujuan terpisah** agar tidak menutup isi/merusak layout. Belum mendukung penempatan gambar langsung pada blok tanda tangan halaman asal. Jangan gunakan PDF yang sudah bertanda tangan digital.

## Aktivasi oleh pengelola (bukan admin surat)
1. Backup database. Terapkan `migrations/202610310037_surat_internal.sql` setelah migrasi yang ada. Uji dahulu di proyek staging.
2. Undang akun Ketua melalui Supabase Auth. Identifikasi UUID akun sebenarnya. Di SQL Editor terpercaya, tambahkan akun tersebut ke `public.surat_signers(user_id,display_name)`. Jangan menggunakan UUID contoh. Akses owner di panel bukan otomatis akun Ketua. Untuk mencabut hak tanda tangan ubah `active=false`.
3. Petugas administrasi menggunakan peran existing `owner` atau `registrar` di `admin_profiles`; jangan memberi semua petugas akun Ketua.
4. Set secret `SURAT_SITE_ORIGIN` ke origin HTTPS situs tujuan, tanpa garis miring akhir (contoh: `https://gmpi-sidoarjo-site.vercel.app`). Bukan URL preview yang sementara. Jangan memasukkan service key ke frontend; Edge Function memakai secret server bawaan Supabase.
5. Deploy `supabase functions deploy surat --no-verify-jwt`. Gateway JWT dimatikan untuk kompatibilitas publishable key; **fungsi tetap wajib memverifikasi bearer token dengan auth.getUser sebelum semua operasi**. Jangan menghapus pemeriksaan itu.
6. Deploy `surat.html`, `surat.js`, `surat.css`, `surat-verifikasi.html`, `surat-verifikasi.js`, dan tautan admin. Library frontend mengikuti CDN Supabase existing.
7. Uji dengan akun nyata di staging, baru aktifkan produksi. Tidak ada kredensial deployment database pada sesi pembuatan ini sehingga migrasi/fungsi belum diterapkan jarak jauh.

## Uji penerimaan wajib
- Anon dan akun tanpa peran gagal membaca register, storage, mengajukan, dan menyetujui.
- Registrar dapat mengajukan dan membuka PDF; tidak dapat menyetujui/menolak/mencabut, termasuk lewat HTTP langsung.
- Owner tanpa penetapan signer tidak bisa menyetujui.
- Nomor ganda (termasuk perbedaan case/spasi luar), file bukan PDF, file rusak/enkripsi, ukuran >10 MB ditolak.
- Ketua melihat PDF sumber; memasukkan PNG dan persetujuan eksplisit; hasil memiliki halaman pengesahan, QR, nama, tanggal, serta label non-sertifikasi.
- Dua persetujuan bersamaan: hanya satu menang dengan filter status pending; final yang kalah dibersihkan.
- Tolak pending; cabut approved; download final yang dicabut ditolak. URL privat yang sudah terbit dapat berlaku hingga 60 detik; file terunduh tidak bisa ditarik dari perangkat penerima. QR menampilkan dicabut.
- Verifikasi publik hanya menampilkan nomor, tanggal, status, nama, waktu dan hash. Tidak ada penerima, perihal, URL storage, atau PDF publik.
- Pemeriksaan SHA-256 file asli cocok; file yang diedit tidak cocok. File tetap diproses lokal di browser.
- Audit tersimpan atomik via trigger bersama insert/perubahan status.

## Operasional
Admin: panel → Surat & Persetujuan → isi metadata sesuai PDF → unggah → Ajukan.
Ketua: masuk akun sendiri → Periksa PDF sumber → baca seluruh isi → unggah PNG pribadi → centang persetujuan → Setujui.
Admin: muat ulang → Buka/unduh PDF final → arsipkan/kirim. Surat ditolak perlu nomor pengganti sesuai kebijakan organisasi; nomor lama tidak digunakan ulang.

Tanda tangan PNG tidak disimpan sebagai aset terpisah, tetapi gambar tetap berada di PDF final dan bisa disalin penerima. Ini batasan tanda tangan gambar, bukan jaminan anti-pemalsuan. Verifikasi mengandalkan status server dan hash PDF. Lindungi akun Ketua (MFA sesuai kemampuan penyedia), jangan berbagi password/OTP. Batasi akses daftar signer di SQL/service-role.

Keterbatasan: daftar UI 200 surat terbaru; tidak ada sinkronisasi Sheets, notifikasi email, atau tanda tangan tersertifikasi. Belum ada pencatatan bukti kirim. Metadata memakai Unicode tetapi halaman pengesahan menggunakan font standar PDF (karakter non-ASCII diganti `?`). Perlu peninjauan tampilan nama bila bukan aksara Latin.
