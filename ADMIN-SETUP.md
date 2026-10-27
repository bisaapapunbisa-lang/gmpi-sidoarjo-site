# Panel Admin GMPI DPD Sidoarjo

## Perilaku aman saat ini

- Tautan **Admin** ditambahkan di footer dan membuka halaman masuk `admin.html`.
- Tidak ada tombol daftar akun publik. Hanya akun Supabase Auth yang diundang dan diberi peran dapat masuk.
- Peran: `owner`, `content_editor`, `lbh_officer`, dan `registrar`.
- Editor situs hanya dapat mengubah empat teks publik yang ditentukan. Petugas LBH dapat melihat aduan. Hanya akun dengan peran `registrar` yang dapat melihat NIK/foto KTP. Pemilik tidak otomatis mendapat akses NIK/KTP kecuali juga diberi peran `registrar`.
- Supabase `publishable/anon` key boleh dipasang di `supabase-config.js`; **jangan pernah memasukkan `service_role` key ke browser atau repo**.
- Formulir publik masih prototipe dan tidak mengirim/merekam data. Jangan aktifkan sampai backend penerimaan, pemberitahuan privasi, kontak resmi LBH, dan pengujian selesai.

## Aktivasi panel Admin (pemilik project)

1. Pastikan migrasi `202610200001_private_intake.sql` sudah berhasil (sudah dikonfirmasi melalui SQL Editor).
2. Jalankan `supabase/migrations/202610200002_admin_panel_roles.sql` satu kali melalui **Supabase → SQL Editor → New query**.
3. Di Supabase, buka **Project Settings → API Keys** dan salin hanya **Publishable key** (atau key `anon` publik bila dashboard menampilkannya). Isi properti `publishableKey` di `supabase-config.js`. URL project sudah diisi. Key ini bukan `service_role`.
4. Pastikan pendaftaran publik Supabase Auth dimatikan. Undang email petugas melalui **Authentication → Users → Invite user**.
5. Jadikan satu akun sebagai Owner pertama melalui SQL Editor. Ganti alamat contoh dengan email akun Supabase Auth yang sudah diundang:

```sql
insert into public.admin_profiles (email, role, active)
select lower(email), 'owner', true
from auth.users
where lower(email) = lower('EMAIL-OWNER-ANDA');
```

6. Masuk melalui halaman Admin. Owner dapat menambahkan peran lain untuk email yang sudah diundang. Beri `registrar` hanya kepada petugas yang memang perlu melihat NIK/KTP. Untuk membatasi agar pemilik tidak melihat data itu, jangan beri peran `registrar` kepada akun pemilik.

## Sebelum mengunggah perubahan ke GitHub

Arsip perubahan harus mencakup `admin.html`, `admin.css`, `admin.js`, `supabase-config.js`, dan migrasi kedua. Setelah berkas-berkas baru masuk ke branch `main`, Vercel akan membuat deployment baru karena repo telah tersambung.

**Catatan:** migrasi kedua mengatur hak akses panel, tetapi belum membuat API untuk menerima aduan/pendaftaran. Draf privasi `PRIVACY-NOTICE-DRAFT.md` masih harus diperiksa dan disetujui DPD; email resmi LBH juga belum tersedia. Jangan masukkan data nyata saat uji coba.

## Logo situs (dapat diganti dari Admin)

1. Jalankan sekali `supabase/migrations/202610200003_site_logo.sql` di Supabase SQL Editor.
2. Masuk Admin → tab **Isi situs** → bagian **Logo situs**.
3. **Pilih gambar logo baru** (PNG/JPG/WebP, maks. 2 MB, sebaiknya persegi ≥ 500×500 px) → **Unggah & pakai logo ini**.
4. Logo lama tetap tersimpan di **Logo tersimpan**; klik **Pakai** untuk kembali ke logo itu, atau **Hapus** jika tidak diperlukan.
5. **Kembalikan logo bawaan** memakai file `assets/logo-gmpi-sidoarjo-crop.webp` dari repo.

Hanya peran Pemilik dan Editor Situs yang boleh mengganti logo. Bucket `site-assets` bersifat publik dan **tidak boleh** dipakai untuk data pribadi.

## Kartu Tanda Anggota (KTA) ber-QR

1. Jalankan sekali `supabase/migrations/202610200004_member_cards.sql` di Supabase SQL Editor.
2. Masuk Admin → tab **Kartu anggota** (hanya Pemilik & Petugas Registrasi).
3. Isi nama, nomor anggota (otomatis disarankan `GMPI-SDA-TAHUN-URUT`), kecamatan, jabatan, masa berlaku → **Simpan & terbitkan kartu**.
4. Pilih pas foto (hanya diproses di perangkat, tidak diunggah) → atur zoom/geser → **Unduh kartu (PNG)**. Ukuran cetak 54 × 85,6 mm.
5. QR kartu baru berisi `https://www.gmpisidoarjo.com/V/<kode acak 20 karakter>`. Pemindai melihat halaman `verifikasi.html` dengan status: Asli & aktif / Kedaluwarsa / Nonaktif / Dicabut / Tidak terdaftar.
6. Kartu hilang atau disalahgunakan → ubah status menjadi **Dicabut**. Kode QR tidak bisa diubah setelah terbit (dikunci trigger database).
7. QR kartu yang diterbitkan mulai sekarang memakai domain resmi `www.gmpisidoarjo.com`. QR pada kartu yang sudah tercetak sebelumnya tetap dapat diverifikasi melalui domain lama yang masih diarahkan ke situs GMPI.

Contoh kartu di beranda memakai kode `CONTOH` dan ditandai sebagai kartu contoh di halaman verifikasi.

### Sisi belakang kartu
- Di tab **Kartu anggota**, klik pratinjau (atau tombol **Depan/Belakang**) untuk membalik kartu.
- Buka **Pengaturan sisi belakang** untuk mengisi nama & jabatan penanda tangan (diingat di browser) dan, bila perlu, tanda tangan PNG transparan (tidak diunggah).
- Unduh **depan** dan **belakang** sebagai dua file PNG, lalu cetak bolak-balik. Area **CAP DPD** disediakan untuk stempel basah.
- Di beranda, pengunjung bisa mengklik contoh kartu untuk melihatnya berputar ke sisi belakang.

## Persetujuan Kartu Anggota (migration 0008)

Alur: **Petugas Registrasi menginput → Penyetuju Kartu menyetujui → QR berlaku & kartu bisa diunduh.**

1. Jalankan `supabase/migrations/202610200008_card_approval.sql` di Supabase SQL Editor.
2. Undang akun penyetuju (mis. Ketua/Sekretaris DPD): Supabase → Authentication → Users → Invite user.
3. Admin → tab **Hak akses** → isi email → pilih peran **Penyetuju kartu anggota** → simpan.

Aturan (dijaga oleh database):
- Kartu baru dan kartu yang datanya diubah berstatus **Menunggu persetujuan**; QR menampilkan "Kartu belum disetujui" tanpa nama/data.
- Hanya **Penyetuju Kartu** atau **Pemilik** yang bisa menyetujui/menolak.
- **Pembuat/pengubah kartu tidak bisa menyetujui kartunya sendiri.** Siapkan minimal 2 orang (mis. Petugas Registrasi + Ketua DPD).
- Kartu ditolak bisa diperbaiki lalu **Ajukan ulang**. Kartu dicabut harus diajukan ulang dan disetujui lagi.
- Kartu yang terbit sebelum fitur ini tetap Aktif (dianggap sudah disetujui).

## Tombol Darurat (SOS) & Tim Siaga (migration 0009 + 0010)

**Cara kerja untuk anggota** (`/darurat`, juga tombol SOS merah di kiri bawah situs):
1. Pilih masalah → lokasi HP terbaca otomatis → isi nama, no. anggota, no. HP (diingat di HP).
2. Tekan **Kirim ke Piket Siaga** → WhatsApp terbuka berisi pesan + link Google Maps.
   Sekaligus permintaan **tercatat untuk Tim Siaga** di Admin.
3. Selama halaman darurat terbuka, lokasi anggota diperbarui otomatis (maks. 3 jam) dan anggota melihat status: *Tercatat → Diterima → Bantuan menuju lokasi*.
4. Tombol **Saya sudah aman** mengakhiri permintaan.

**Langkah pemilik:**
1. Supabase → SQL Editor → jalankan `202610200009_sos_piket.sql`, lalu `202610200010_sos_alerts.sql` (harus *Success*).
2. Admin → tab **Darurat** → isi nomor WA piket siaga (format 62…).
3. Undang akun petugas lewat Supabase Authentication → Admin → **Hak akses** → peran **Tim Siaga (darurat)**.
4. Petugas siaga membuka Admin → tab **Siaga** → tekan **🔔 Aktifkan bunyi & notifikasi** → biarkan tab Admin terbuka.

**Panel Siaga:** peta semua permintaan (merah = baru, kuning = ditangani, abu = selesai), peta Google lokasi terpilih, tombol Telepon / WhatsApp / **Rute ke lokasi**, status *Terima → Menuju lokasi → Selesai/Palsu*, catatan penanganan. Ada bunyi + notifikasi + judul tab berkedip saat permintaan baru masuk (dicek tiap 15 detik).

**Privasi & keamanan:**
- Pengunjung tidak bisa membaca daftar permintaan; hanya Pemilik & Tim Siaga.
- Pembaruan lokasi/status/pembatalan hanya bisa dari HP pengirim (kode rahasia acak).
- Data dihapus otomatis 7 hari setelah dibuat. Hapus permanen manual: hanya Pemilik.
- Anti-iseng: maks. 3 kiriman per nomor HP per 5 menit, 40 kiriman per 10 menit total.
- Website **tidak** melacak anggota terus-menerus; lokasi hanya terkirim saat anggota sendiri menekan tombol darurat.
- `vercel.json` wajib berisi `geolocation=(self)` (bukan `geolocation=()`), kalau tidak lokasi selalu ditolak browser.

## Peta sebaran anggota per kecamatan (migration 0011)

Beranda punya bagian **"Barisan di 18 kecamatan"**: peta 18 kecamatan (warna makin terang = makin banyak anggota), total anggota, jumlah kecamatan terjangkau, dan peringkat per kecamatan.

**Angka yang tampil per kecamatan:**
- Bila pengurus mengisi angka manual → angka itu yang tampil.
- Bila dikosongkan → jumlah **Kartu Anggota AKTIF** (yang sudah disetujui dan belum kedaluwarsa) di kecamatan itu.
- Bila semua masih 0 → tampil "Data sebaran sedang dihimpun" (tidak menampilkan angka 0).

**Langkah:**
1. Supabase → SQL Editor → jalankan `202610200011_sebaran_anggota.sql` (harus *Success*).
2. Admin → tab **Sebaran** → isi jumlah anggota tiap kecamatan → **Simpan angka sebaran**.

Yang boleh mengisi: Pemilik, Editor situs, Petugas registrasi. Publik hanya melihat **angka** — tanpa nama, alamat, NIK, atau nomor HP.

Batas wilayah kecamatan: data GeoJSON publik 35.15 Sidoarjo (repo GitHub sigitttd/geojsanjson, bersumber dari batas administrasi resmi), disederhanakan ±11 KB dan ditanam di `sebaran.js` — tidak butuh Google Maps atau API key.

## Struktur organisasi DPD (migration 0013)
1. Jalankan `supabase/migrations/202610200013_struktur_organisasi.sql` di Supabase SQL Editor. Tabel `org_structure` akan dibuat beserta 18 slot awal: Penasihat ×3, Pembina ×3, Ketua, Wakil Ketua I–III, Sekretaris, Wakil Sekretaris I–III, Bendahara, dan Wakil Bendahara I–III. Aman dijalankan ulang karena slot tidak akan dobel.
2. Admin → tab **Struktur**. Tab ini hanya terlihat oleh Pemilik dan Editor situs. Isi nama, unggah foto (otomatis dikecilkan dan disimpan di `site-assets/pengurus/`), tambah departemen, lalu tekan **Simpan struktur**.
3. Pengunjung umum hanya bisa membaca bagan. Perubahan hanya bisa dilakukan oleh owner/content_editor.
4. KTA: kolom **Jabatan** kini berupa daftar pilihan sesuai AD/ART. Untuk jabatan DPC/Ranting, nama kecamatan ditambahkan otomatis. Teks tetap bisa diubah manual (maks. 60 karakter), dan jabatan yang panjang otomatis dikecilkan di kartu.

## Nomor KTA khusus 0001–0100 (migration 0014)
- Jalankan `supabase/migrations/202610200014_nomor_kta_khusus.sql` di SQL Editor. File ini aman dijalankan ulang.
- Nomor tetap berbentuk `GMPI-SDA-<TAHUN>-<URUT>`. Urutan **0001–0100** setiap tahun menjadi jatah khusus anggota terpilih.
- Hanya akun dengan peran **Pemilik** yang bisa memberikan nomor khusus. Caranya: Admin → Kartu anggota → kotak "Nomor anggota" → pilih **★ 0001…0100**. Nomor yang sudah terpakai tidak muncul lagi di daftar.
- Petugas Registrasi otomatis mendapat nomor mulai **0101**. Jika Petugas Registrasi mencoba memakai nomor 0001–0100, sistem akan menolaknya, baik di layar maupun di database.
- Tampilan kartu sama dengan kartu biasa. Di daftar Admin, nomor khusus diberi tanda "★ khusus".
- Kartu bernomor khusus tetap harus disetujui oleh **Penyetuju Kartu lain**, karena pembuat kartu tidak boleh menyetujui kartunya sendiri.
- Kartu yang terbit sebelum migrasi ini tidak diubah.

## Iuran keanggotaan (QRIS otomatis, e-wallet, transfer, tunai)

Fitur ini menagih iuran anggota lewat halaman publik `/iuran` dan memverifikasinya di panel Admin.

1. Jalankan sekali `supabase/migrations/202610270028_iuran_keanggotaan.sql` di Supabase SQL Editor.
2. Opsional: beri peran `bendahara` kepada akun bendahara (tanpa akses NIK/KTP):

```sql
insert into public.admin_profiles (email, role, active)
select lower(email), 'bendahara', true
from auth.users
where lower(email) = lower('EMAIL-BENDAHARA@CONTOH.ID')
on conflict (email, role) do update set active = true;
```

3. Masuk Admin → tab **Iuran** (Pemilik, Registrasi, atau Bendahara). Isi nama iuran, periode
   (`2026` tahunan atau `2026-10` bulanan), nominal, jatuh tempo, nomor e-wallet, rekening bank,
   dan WhatsApp bendahara. Ubah **Status periode iuran** menjadi *Buka* bila semuanya sudah benar.
4. Bagikan `https://www.gmpisidoarjo.com/iuran` + teks dari tombol **Buat teks pengumuman WhatsApp**.
5. Anggota mengirim konfirmasi dari halaman itu → muncul sebagai *Menunggu* → cocokkan dengan mutasi
   QRIS/rekening → **Verifikasi**.
6. QRIS di halaman iuran dibuat di browser dari payload QRIS statis resmi (NMID ID1026605146624)
   dengan nominal terisi otomatis dan checksum CRC16 dihitung ulang. Bila organisasi mengganti akun
   QRIS, ganti konstanta `QRIS_STATIC_PAYLOAD` di `iuran.js` — langkah rincinya ada di
   `PANDUAN-IURAN.md`.
7. Publik tidak bisa membaca tabel `dues_payments`. Cek status anggota hanya membalas bila nomor
   anggota + nama cocok dengan kartu anggota. Hanya Pemilik yang dapat menghapus catatan.

Panduan lengkap untuk pengurus: **`PANDUAN-IURAN.md`**. Teks pengumuman siap pakai: **`wa-iuran.txt`**.
