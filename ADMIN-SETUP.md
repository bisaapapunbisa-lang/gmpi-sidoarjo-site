# Panel Admin GMPI DPC Sidoarjo

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

**Catatan:** migrasi kedua mengatur hak akses panel, tetapi belum membuat API untuk menerima aduan/pendaftaran. Draf privasi `PRIVACY-NOTICE-DRAFT.md` masih harus diperiksa dan disetujui DPC; email resmi LBH juga belum tersedia. Jangan masukkan data nyata saat uji coba.

## Logo situs (dapat diganti dari Admin)

1. Jalankan sekali `supabase/migrations/202610200003_site_logo.sql` di Supabase SQL Editor.
2. Masuk Admin → tab **Isi situs** → bagian **Logo situs**.
3. **Pilih gambar logo baru** (PNG/JPG/WebP, maks. 2 MB, sebaiknya persegi ≥ 500×500 px) → **Unggah & pakai logo ini**.
4. Logo lama tetap tersimpan di **Logo tersimpan**; klik **Pakai** untuk kembali ke logo itu, atau **Hapus** jika tidak diperlukan.
5. **Kembalikan logo bawaan** memakai file `assets/logo-gmpi-sidoarjo-crop.webp` dari repo.

Hanya peran Pemilik dan Editor Situs yang boleh mengganti logo. Bucket `site-assets` bersifat publik dan **tidak boleh** dipakai untuk data pribadi.
