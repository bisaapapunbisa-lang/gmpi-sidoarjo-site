# Panduan Iuran Keanggotaan GMPI DPD Sidoarjo

Panduan ini untuk **pengurus** (Pemilik situs / Bendahara / Petugas Registrasi).
Anggota cukup membuka **`/iuran`** dan mengikuti 3 langkah di halaman itu.

---

## 1. Apa yang sudah disiapkan di situs

| Bagian | Fungsi |
| --- | --- |
| Halaman **`/iuran`** | Tagihan (nominal, periode, jatuh tempo), QRIS otomatis, e-wallet, transfer bank, tunai, formulir konfirmasi, dan cek status. |
| Bagian **Iuran Anggota** di beranda | Ringkasan nominal + QRIS yang bisa langsung dipindai. Otomatis disembunyikan bila pengurus belum mengisi pengaturan. |
| Tab **Iuran** di Admin | Atur nominal/periode/kanal, verifikasi pembayaran, daftar anggota belum lunas, rekap CSV, dan pembuat teks pengumuman WhatsApp. |
| Peran baru **Bendahara** | Bisa mengurus iuran **tanpa** akses NIK/KTP. |

Cara bayar yang didukung (semua tanpa biaya tambahan, tanpa payment gateway):

1. **QRIS** — kode QR dibuat langsung di halaman dengan **nominal terisi otomatis**
   (anggota tinggal pindai lalu konfirmasi di aplikasi m-banking/e-wallet).
2. **E-wallet** — nomor DANA/OVO/GoPay/ShopeePay yang diisi pengurus.
3. **Transfer bank** — rekening atas nama organisasi.
4. **Tunai** — ke bendahara, lalu dicatat bendahara di panel Admin.

---

## 2. Aktivasi (sekali saja, ± 5 menit)

1. **Jalankan SQL** — buka Supabase → **SQL Editor** → **New query**, salin seluruh isi
   `supabase/migrations/202610270028_iuran_keanggotaan.sql`, lalu **Run**.
   Muncul “Success” berarti tabel, pengaturan, dan fungsi iuran sudah dibuat.
2. **Unggah berkas** (bila belum lewat Vercel): `iuran.html`, `iuran.js`, `iuran.css`,
   `index.html`, `admin.js`, dan folder `supabase/migrations/`.
3. **Beri peran Bendahara** (opsional, bila bendahara punya akun sendiri):
   Supabase → SQL Editor, ganti email di bawah, lalu Run:

   ```sql
   insert into public.admin_profiles (email, role, active)
   select lower(email), 'bendahara', true
   from auth.users
   where lower(email) = lower('EMAIL-BENDAHARA@CONTOH.ID')
   on conflict (email, role) do update set active = true;
   ```

   Peran `bendahara` **tidak** bisa melihat NIK/KTP. Pemilik dan Petugas Registrasi
   otomatis juga bisa membuka tab Iuran.
4. Masuk **Admin → tab “Iuran”**, isi:
   - **Status periode iuran** → *Buka* (setelah nominal benar),
   - **Nama iuran** (mis. “Iuran Keanggotaan 2026”),
   - **Periode** — `2026` untuk tahunan, `2026-10` untuk bulanan,
   - **Nominal** — angka saja, tanpa titik (mis. `60000`),
   - **Jatuh tempo** — tanggal (boleh dikosongkan),
   - **E-wallet** dan **rekening bank** resmi organisasi,
   - **WhatsApp bendahara** — format `62…` (mis. `6281235911689`),
   - **Catatan untuk anggota**.
5. Klik **Simpan pengaturan iuran**, lalu buka `https://www.gmpisidoarjo.com/iuran`
   untuk memastikan nominal dan QRIS tampil benar.
6. Klik **Buat teks pengumuman WhatsApp** → **Salin teks** → tempel di grup anggota.
   Tersedia juga file `wa-iuran.txt` untuk diubah manual.

> Selama status masih **Tutup**, halaman `/iuran` tetap bisa dibuka tetapi formulir
> pembayaran disembunyikan, jadi tidak ada anggota yang salah bayar.

---

## 3. Alur harian bendahara

1. Anggota membayar (QRIS/e-wallet/transfer/tunai) lalu mengisi **formulir konfirmasi**
   di `/iuran`. Data masuk sebagai **Menunggu**.
2. Cocokkan dengan **mutasi QRIS/rekening** atau bukti yang dikirim anggota ke WhatsApp.
3. Di **Admin → Iuran**, pada baris yang cocok klik **Verifikasi** → status menjadi
   **Terverifikasi** dan otomatis dihitung lunas untuk periode tersebut.
   - Tidak ditemukan di mutasi? Klik **Tolak** dan tulis alasannya.
   - Salah klik? Klik **Batalkan verifikasi** (data tetap tersimpan).
4. Gunakan tombol **WA anggota** untuk mengonfirmasi atau meminta bukti bayar.
5. **Anggota aktif yang belum lunas** tampil di bagian bawah tab Iuran.
   Tombol **Ingatkan via WA** mengirim pesan pribadi berisi tautan pembayaran.
6. **Unduh rekap (CSV)** untuk laporan rapat/audit kas.

Catatan: satu anggota hanya boleh punya **satu** pembayaran terverifikasi per periode.
Bila nama yang sama sudah lunas, sistem menolak verifikasi baris kedua.

---

## 4. Yang dilihat anggota (tanpa login)

- Nominal, periode, dan jatuh tempo (dengan hitung mundur).
- QRIS **dengan nominal otomatis**; jumlah periode bisa ditambah (1–6) sehingga
  nominal ikut menyesuaikan.
- Nomor e-wallet & rekening (tombol **Salin**), panduan tunai.
- Formulir konfirmasi: nama, nomor anggota (opsional), kecamatan, WhatsApp, cara bayar,
  periode, jumlah, tanggal bayar, catatan. **Tanpa unggah KTP/foto.**
- Setelah kirim: tombol WhatsApp berisi rincian pembayaran untuk dikirim ke bendahara.
- **Cek status**: isi nomor anggota + nama persis seperti kartu anggota → tampil daftar
  periode beserta status *Lunas* / *Menunggu*. Tidak ada data pribadi yang terbuka.

---

## 5. Privasi & keamanan

- Anggota (publik) **tidak bisa membaca** tabel `dues_payments`. Data hanya masuk lewat
  fungsi `submit_dues_payment` dan hanya bisa dibaca akun berperan Pemilik/Registrasi/Bendahara.
- Cek status hanya membalas bila **nomor anggota + nama** cocok dengan kartu anggota.
- Tidak ada NIK, foto KTP, atau data kartu pembayaran yang disimpan di modul ini.
- Hanya **Pemilik** yang dapat menghapus catatan pembayaran.
- Jangan mengekspor CSV berisi nomor WhatsApp ke luar kepengurusan.

---

## 6. Mengganti QRIS organisasi

Kode QRIS “dinamis” dibuat dari teks payload QRIS statis organisasi yang tersimpan di
`iuran.js` (konstanta `QRIS_STATIC_PAYLOAD`). Bila organisasi mengganti akun QRIS
(mis. ganti rekening merchant), payload lama **tidak boleh** dipakai lagi:

1. Minta gambar QRIS baru dari bank/penyedia (format teks payload idealnya ikut diberikan).
2. Bila hanya ada gambar: pindai gambar itu dengan aplikasi pembaca QR (mis. aplikasi
   “QR & Barcode Scanner”), salin teks hasilnya (diawali `000201...`).
3. Buka `iuran.js`, ganti isi `QRIS_STATIC_PAYLOAD` dengan teks tersebut, simpan, unggah.
4. Buka `/iuran`, pindai QR yang muncul dengan nominal percobaan kecil (mis. Rp1.000),
   pastikan nama merchant benar, lalu batalkan sebelum membayar.
5. Ganti juga gambar cadangan `assets/payment/qris-gmpi-dpd-sidoarjo.jpg` dan NMID yang
   tertulis di `iuran.html` (bagian catatan kaki) serta kartu Legalitas di beranda.

Bila ingin nominal diketik manual saja (tanpa QRIS otomatis), kosongkan **Nominal** di
Admin → Iuran; halaman otomatis meminta anggota mengetik jumlahnya.

---

## 7. Bila ada masalah

| Gejala | Penyebab & solusi |
| --- | --- |
| Halaman `/iuran` menulis “modul belum diaktifkan” | Migrasi belum dijalankan, atau pengaturan belum diisi. Ulangi langkah 2. |
| Blok Iuran tidak muncul di beranda | Normal bila pengaturan iuran belum diisi pengurus (blok disembunyikan). |
| Tab “Iuran” tidak ada di Admin | Akun belum berperan `owner`, `registrar`, atau `bendahara`. Minta Pemilik menambah peran, lalu keluar–masuk lagi. |
| Pengaturan gagal disimpan | Akun bukan Pemilik/Editor Situs/Bendahara, atau migrasi belum jalan. |
| “Fitur iuran belum diaktifkan di server” saat anggota mengirim | Migrasi `202610270028_iuran_keanggotaan.sql` belum dijalankan. |
| QRIS ditolak aplikasi pembayaran | Pakai tautan **Perbesar / simpan QRIS resmi** di halaman iuran (QRIS statis), lalu ketik nominal manual. |
| Anggota bilang sudah bayar tapi tidak tercatat | Cek baris **Menunggu**; bila tidak ada, minta anggota mengisi formulir konfirmasi atau catat manual. |

---

## 8. Dasar aturan

Sesuai AD/ART GMPI 2021 Pasal 23, iuran anggota merupakan kewajiban anggota dan menjadi
sumber kas organisasi; besaran serta periodisasinya ditetapkan pengurus melalui PO.
Nominal di panel Admin **wajib** mengikuti keputusan rapat pengurus — jangan diubah
sendiri oleh petugas.
