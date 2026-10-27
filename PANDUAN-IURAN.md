# Panduan Iuran Keanggotaan GMPI DPD Sidoarjo

Panduan ini untuk **pengurus** (Pemilik situs / Bendahara / Petugas Registrasi).
Anggota cukup membuka **`/iuran`** dan mengikuti 3 langkah di halaman itu.

---

## 1. Apa yang sudah disiapkan di situs

| Bagian | Fungsi |
| --- | --- |
| Halaman **`/iuran`** | Tagihan (nominal, periode, jatuh tempo), **pilihan bulan yang dibayar (boleh satu bulan saja)**, QRIS otomatis, e-wallet, transfer bank, tunai, formulir konfirmasi, dan cek status. |
| Bagian **Iuran Anggota** di beranda | Ringkasan nominal + QRIS yang bisa langsung dipindai. Otomatis disembunyikan bila pengurus belum mengisi pengaturan. |
| Tab **Iuran** di Admin | **Tagihan** (draf → luncurkan → jadwalkan → tutup), pengaturan kanal pembayaran, verifikasi pembayaran, daftar anggota belum lunas, **rekap bulanan & kedisiplinan anggota**, rekap CSV, dan pembuat teks pengumuman WhatsApp. |
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
   `supabase/migrations/202610270028_iuran_keanggotaan.sql`, lalu **Run** → “Success”.
   Lalu ulangi untuk `supabase/migrations/202610280029_tagihan_iuran.sql`
   (tagihan draf/jadwal) dan `supabase/migrations/202610290030_iuran_per_bulan.sql`
   (pembayaran boleh dicicil per bulan + rekap bulanan). Semuanya cukup sekali.
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
   Teksnya dibuat langsung dari pengaturan yang aktif, jadi tidak ada berkas terpisah
   yang perlu disunting — cukup sunting kalimatnya di WhatsApp sebelum dikirim.

> Selama status masih **Tutup**, halaman `/iuran` tetap bisa dibuka tetapi formulir
> pembayaran disembunyikan, jadi tidak ada anggota yang salah bayar.

---

## 3. Tagihan: draf, luncurkan kapan saja, atau jadwalkan

Pengurus **tidak harus** menagih setiap bulan. Tagihan bisa disiapkan jauh hari
dan baru dibuka setelah rapat memutuskan.

**Alur di Admin → tab Iuran → kartu “Tagihan iuran”:**

1. Klik **+ Buat tagihan baru**.
2. Isi:
   - **Nama tagihan** — mis. `Iuran Bulanan November 2026`
   - **Periode** — bulan pertama, mis. `2026-11` (bisa juga `2026` untuk tahunan)
   - **Jumlah bulan** — `1` bulanan, `3` triwulan, `12` setahun
   - **Nominal per bulan** — mis. `10000` (total dihitung otomatis)
   - **Jatuh tempo** (opsional) — mis. `2026-11-10`
   - **Catatan untuk anggota** (opsional)
3. Pilih salah satu tombol:

| Tombol | Akibat |
| --- | --- |
| **Simpan sebagai draf** | Tersimpan, **tidak terlihat anggota**. Aman untuk bahan rapat. |
| **Simpan & luncurkan sekarang** | Langsung tampil di `/iuran`, anggota bisa membayar detik itu juga. |
| **Jadwalkan** | Tampil otomatis pada tanggal & jam yang Anda isi. Cocok untuk menagih tiap awal bulan tanpa perlu buka panel. |

**Aturan penting:** hanya ada **satu tagihan berjalan** pada satu waktu. Saat tagihan
baru diluncurkan, tagihan sebelumnya otomatis **DITUTUP** — ini mencegah anggota
membayar dua kali untuk periode yang sama. Data pembayaran lama tetap tersimpan.

Di tabel tagihan tersedia tombol **Luncurkan sekarang**, **Tutup tagihan**, **Ubah**,
dan **Hapus** (khusus Pemilik). Tagihan yang sudah punya pembayaran tidak bisa dihapus.

Selama **belum ada tagihan yang dibuka**, halaman `/iuran` hanya menampilkan
“Belum ada tagihan iuran yang dibuka pengurus” + kolom cek status. Tidak ada
tombol bayar, jadi tidak ada risiko anggota salah bayar.

Saklar lama **“Status periode iuran”** (di kartu *Kanal pembayaran & pengaturan lama*)
hanya dipakai bila organisasi belum pernah membuat tagihan sama sekali. Begitu Anda
memakai tagihan, saklar itu diabaikan.

**Contoh: iuran bulanan otomatis sepanjang tahun**

Buat 12 tagihan sekaligus (Januari–Desember), masing-masing dijadwalkan pada
tanggal 1 bulan bersangkutan. Anggota selalu melihat tagihan bulan berjalan tanpa
pengurus perlu membuka panel.

**Mengubah nominal di tengah jalan**

Nominal pada tagihan yang **sudah diluncurkan** ikut berubah bila Anda menekan
**Ubah** lalu menyimpan. Karena itu, tetapkan nominal final sebelum meluncurkan.
Untuk perubahan resmi, sebaiknya tutup tagihan lama dan luncurkan tagihan baru
dengan nominal baru agar jejak keputusan rapat tercatat.

---

## 4. Bayar per bulan (tidak wajib sekaligus)

Aturan penting: **anggota tidak diwajibkan melunasi sekaligus.** Satu tagihan boleh
berjalan beberapa bulan (mis. 12 bulan), tetapi anggota bebas membayar berapa bulan
pun setiap kali — **satu bulan pun sah**.

**Di halaman `/iuran`, anggota:**

1. Melihat daftar bulan pada tagihan berjalan (mis. Januari–Desember 2026).
2. Mencentang bulan yang ingin dibayar sekarang — bisa satu bulan, bisa beberapa.
   Total dan QRIS menyesuaikan otomatis (mis. 1 bulan → Rp10.000, 3 bulan → Rp30.000).
3. Mengirim konfirmasi. Sistem mencatat **bulan-bulan** yang dibayar, bukan sekadar
   "sudah bayar".

**Yang perlu dijaga pengurus:**

- Satu pembayaran yang sudah **diverifikasi** tidak bisa menabrak bulan yang sudah
  lunas. Bila ada anggota membayar bulan yang sama dua kali, verifikasi kedua akan
  ditolak dengan pesan bulan mana yang bentrok.
- Anggota yang membayar 3 bulan sekaligus tetap tercatat per bulan, jadi
  rekap bulanan tetap rapi.
- Bulan yang belum jatuh tempo tidak dihitung sebagai tunggakan.

---

## 5. Menilai kesungguhan anggota

Admin → tab Iuran → **Rekap bulanan & kedisiplinan anggota**.

- Tabel **anggota × bulan**: ✓ lunas, ⏳ menunggu verifikasi, · belum dibayar,
  – belum jatuh tempo.
- Kolom **Lunas** (mis. `3/10`) dan **Tunggakan** (mis. `7 bulan · Rp70.000`)
  hanya menghitung bulan yang sudah jatuh tempo.
- Urutan tabel dimulai dari **yang paling sedikit membayar**, sehingga yang perlu
  ditegur langsung terlihat di atas.
- Tombol **Ingatkan via WA** mengirim pesan pribadi berisi daftar bulan yang belum
  dibayar + perkiraan nominal + tautan pembayaran. Untuk yang sudah rutin, tombol
  berubah menjadi **WA apresiasi**.
- Filter **Hanya yang menunggak**, pilihan **rentang bulan**, dan **Salin rekap**
  (tempel ke Excel/WhatsApp) untuk laporan rapat.

Anggota sendiri bisa melihat rekornya di `/iuran` bagian **Cek status iuran**:
"3 dari 10 bulan (jatuh tempo) sudah lunas · bulan Mei–Oktober belum dibayar".

> Catatan: data yang dipakai adalah pembayaran yang sudah **diverifikasi**. Selama
> bendahara belum memverifikasi, bulan tersebut tampil sebagai ⏳ (menunggu), bukan
> lunas — jadi lakukan verifikasi rutin agar penilaian akurat.

---

## 6. Alur harian bendahara

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

## 7. Yang dilihat anggota (tanpa login)

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

## 8. Privasi & keamanan

- Anggota (publik) **tidak bisa membaca** tabel `dues_payments`. Data hanya masuk lewat
  fungsi `submit_dues_payment` dan hanya bisa dibaca akun berperan Pemilik/Registrasi/Bendahara.
- Cek status hanya membalas bila **nomor anggota + nama** cocok dengan kartu anggota.
- Tidak ada NIK, foto KTP, atau data kartu pembayaran yang disimpan di modul ini.
- Hanya **Pemilik** yang dapat menghapus catatan pembayaran.
- Jangan mengekspor CSV berisi nomor WhatsApp ke luar kepengurusan.

---

## 9. Mengganti QRIS organisasi

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

## 10. Bila ada masalah

| Gejala | Penyebab & solusi |
| --- | --- |
| Halaman `/iuran` menulis “modul belum diaktifkan” / “belum ada tagihan” | Normal bila belum ada tagihan yang diluncurkan. **Nominal tidak ditampilkan** sampai tagihan dibuka, agar tidak ada anggota yang membayar tanpa tagihan resmi. |
| Dulu halaman menampilkan nominal besar padahal belum ada tagihan | Sudah diperbaiki: kartu tagihan hanya menampilkan angka setelah tagihan diluncurkan. Nominal yang tersimpan di pengaturan tidak lagi ditampilkan ke publik. |
| Blok Iuran tidak muncul di beranda | Normal bila pengaturan iuran belum diisi pengurus (blok disembunyikan). |
| Tab “Iuran” tidak ada di Admin | Akun belum berperan `owner`, `registrar`, atau `bendahara`. Minta Pemilik menambah peran, lalu keluar–masuk lagi. |
| Pengaturan gagal disimpan | Akun bukan Pemilik/Editor Situs/Bendahara, atau migrasi belum jalan. |
| “Fitur iuran belum diaktifkan di server” saat anggota mengirim | Migrasi `202610270028_iuran_keanggotaan.sql` belum dijalankan. |
| QRIS ditolak aplikasi pembayaran | Pakai tautan **Perbesar / simpan QRIS resmi** di halaman iuran (QRIS statis), lalu ketik nominal manual. |
| Anggota bilang sudah bayar tapi tidak tercatat | Cek baris **Menunggu**; bila tidak ada, minta anggota mengisi formulir konfirmasi atau catat manual. |
| Anggota bilang halaman iuran tidak ada tombol bayar | Belum ada tagihan yang diluncurkan. Buka Admin → Iuran → **Luncurkan sekarang** pada tagihan yang dimaksud. |
| Tagihan yang lama hilang dari halaman | Normal: hanya satu tagihan berjalan. Tagihan lama berstatus **DITUTUP** dan masih terlihat di tabel Admin beserta pembayarannya. |
| Tagihan berjadwal tidak muncul di jam yang diharapkan | Jam mengikuti waktu perangkat pengurus. Periksa kembali kolom **Jadwal peluncuran**, lalu simpan ulang. |
| Mau membatalkan tagihan yang sudah telanjur diluncurkan | Klik **Tutup tagihan**. Anggota tidak bisa mengirim konfirmasi baru; pembayaran yang sudah masuk tetap ada. |
| Anggota mengeluh diminta bayar setahun sekaligus | Tidak perlu. Di `/iuran` ia tinggal mencentang **satu bulan** saja. Bila di layarnya tidak ada pilihan bulan, pastikan migrasi `202610290030` sudah dijalankan. |
| Rekap bulanan kosong / “belum bisa dimuat” | Migrasi `202610290030_iuran_per_bulan.sql` belum dijalankan, atau belum ada kartu anggota aktif. |
| Anggota membayar bulan yang sama dua kali | Verifikasi kedua ditolak sistem dengan menyebut bulan yang bentrok. Tolak catatan duplikatnya agar rekap bersih. |
| Angka “Tunggakan” terasa terlalu besar | Hanya bulan yang sudah jatuh tempo yang dihitung. Bulan mendatang bertanda – dan tidak masuk tunggakan. |

---

## 11. Dasar aturan

Sesuai AD/ART GMPI 2021 Pasal 23, iuran anggota merupakan kewajiban anggota dan menjadi
sumber kas organisasi; besaran serta periodisasinya ditetapkan pengurus melalui PO.
Nominal di panel Admin **wajib** mengikuti keputusan rapat pengurus — jangan diubah
sendiri oleh petugas.
