# Bahan Rapat dengan Ketua DPD — Website GMPI DPD Sidoarjo

## A. Sudah jadi & bisa didemokan
| Fitur | Cara menunjukkan |
|---|---|
| Website resmi (hero, 4 badan, Posko Digital, galeri, pendaftaran) | Buka `www.gmpisidoarjo.com` |
| Kartu Tanda Anggota vertikal + sisi belakang yang bisa diputar | Bagian **“Satu kartu, satu barisan.”** di beranda → klik kartunya |
| QR anti-palsu | Pindai QR kartu contoh dengan HP → muncul **“Ini kartu contoh”** |
| Panel Admin (khusus undangan) | Footer → **Admin** → masuk |
| Ganti logo dari Admin | Admin → **Isi situs** → **Logo situs** |
| Terbitkan & unduh kartu anggota | Admin → **Kartu anggota** → isi data → **Simpan & terbitkan** → unduh depan & belakang |
| Status kartu (aktif/nonaktif/dicabut) | Ubah status di daftar kartu → pindai ulang QR |

## B. Perlu keputusan Ketua
1. **Domain resmi:** `https://www.gmpisidoarjo.com` (sudah terhubung ke Vercel).
2. **Nama Ketua DPD** untuk tanda tangan di sisi belakang kartu (+ file tanda tangan PNG transparan bila mau).
3. **Format nomor anggota**: saran `GMPI-SDA-2026-0001`. Setuju atau pakai format DPP/NIA?
4. **Masa berlaku kartu**: saran 2 tahun.
5. **Siapa saja yang diberi akun Admin** dan perannya:
   - Editor Situs (ubah teks & logo)
   - Petugas LBH (baca aduan)
   - Petugas Registrasi (data anggota, NIK/KTP, terbitkan kartu)
6. **Surel resmi LBH DPD** untuk menerima aduan warga.
7. **Persetujuan draf Pemberitahuan Privasi** (`PRIVACY-NOTICE-DRAFT.md`) dan masa simpan data (saran: 1 tahun).
8. **Foto & video aksi asli DPD/PAC** (dengan izin) untuk hero dan galeri 18 kecamatan.

## C. Domain
- Domain resmi: `www.gmpisidoarjo.com`.
- Domain dan domain akar `gmpisidoarjo.com` sudah tersambung ke deployment Production di Vercel.
- QR pada KTA yang diterbitkan sekarang memakai `www.gmpisidoarjo.com`; QR kartu lama tetap dapat diverifikasi melalui alamat lama.

## D. Belum aktif (sengaja)
- **Formulir Pendaftaran & Posko Digital belum mengirim/menyimpan data.** Untuk mengaktifkan diperlukan poin B6 dan B7, lalu dibuatkan penghubung server yang aman (kunci rahasia hanya di Vercel, tidak di browser).

## E. Toko perlengkapan & legalitas (baru)
- [ ] Tetapkan **daftar barang + harga** (seragam PDH/PDL, kaos, jaket, topi, emblem, pin, bendera, stiker, cetak KTA).
- [ ] Tetapkan **nomor WhatsApp pengurus** penerima pesanan & bukti bayar (format 62…).
- [ ] Sepakati alamat/jam ambil barang di sekretariat & kebijakan ongkir.
- [ ] Foto barang (latar polos, persegi) untuk diunggah di Admin → tab **Toko**.
- [ ] **NPWP organisasi**: apakah sudah ada? Bila ada, isi di Admin → Toko.
- [ ] **DPD atau DPD?** Bank, QRIS, dan stempel bertuliskan *DPD Kabupaten Sidoarjo*, sedangkan website & kartu memakai *DPD Sidoarjo*. Putuskan satu nama agar seragam.
- [x] Nama badan ke-4: **ikut AD/ART → Squad Militansi** (bukan Satgas Brigade); Tagana masuk pilihan bidang. ✅ sudah diterapkan di website.
- [ ] Penanda tangan KTA: AD/ART menyebut KTA ditandatangani **Ketua Umum**; saat ini default kartu "Ketua DPD" (bisa diubah di Admin → Kartu anggota).

## F. Kolom berita media mitra (baru)
- [ ] Daftar media yang bekerja sama + email redaksi masing-masing.
- [ ] Apakah berita media perlu **persetujuan pengurus** sebelum tayang? (bisa diatur per media)
- [ ] Siapa pengurus yang bertugas memeriksa/menyetujui berita (peran Editor Situs).
- [ ] Logo tiap media (PNG/JPG) untuk ditampilkan di bagian "Media mitra".


## G. Persetujuan kartu anggota
- [ ] Tentukan siapa **Penyetuju Kartu** (mis. Ketua DPD dan/atau Sekretaris DPD).
- [ ] Tentukan siapa **Petugas Registrasi** (penginput kartu) — harus orang berbeda dari penyetuju.
- [ ] Jalankan SQL 0008, undang email penyetuju, beri peran di Admin → Hak akses.

## H. Tombol Darurat (SOS) anggota
- [ ] Tentukan **nomor WA piket siaga** (selalu aktif, dipegang bergiliran) → isi di Admin → tab Darurat.
- [ ] Buat grup WA **Siaga GMPI** (per DPC bila perlu) untuk pesan darurat.
- [ ] Sebarkan alamat **/darurat** ke anggota; minta dipasang di layar HP.
- [ ] Sepakati aturan: hanya untuk darurat sungguhan; siapa yang wajib merespons.
- [ ] Tunjuk **anggota Tim Siaga** (nama + email) → diberi peran "Tim Siaga (darurat)" di Admin. Siapa piket jam berapa?
- [ ] Sepakati alur: siapa menekan **Terima**, siapa berangkat (**Menuju lokasi**), kapan **Selesai**; kapan wajib lapor polisi/112.
- [ ] Setujui teks privasi: lokasi dicatat untuk Tim Siaga & dihapus otomatis 7 hari.
- [ ] **Peta sebaran (Tahap 3, sudah dibuat):** siapkan jumlah anggota per kecamatan (18 angka) dari data DPC → diisi di Admin → tab Sebaran. Setujui angka itu boleh dipublikasikan.

## I. Struktur organisasi DPD (baru)
Bagan di beranda sudah siap. Susunan mengikuti AD/ART Pasal 9 ayat 2, ditambah keputusan kita soal jumlah dewan dan wakil. Yang perlu dibawa pulang dari rapat:
- [ ] Nama lengkap + gelar: **Dewan Penasihat** (3 orang) dan **Dewan Pembina** (3 orang)
- [ ] **Ketua DPD**
- [ ] **Sekretaris** dan **Wakil Sekretaris I, II, III**
- [ ] **Bendahara** dan **Wakil Bendahara I, II, III**
- [ ] Daftar **Departemen** beserta nama Wakil Ketua Departemen masing-masing
- [ ] Pas foto tiap pengurus (foto HP cukup, wajah jelas, latar polos)
- [ ] Pastikan susunan sudah sesuai SK kepengurusan DPD yang sah
Cara mengisi: Admin → tab **Struktur** → ketik nama → **Unggah foto** → **Simpan struktur**. Jabatan yang namanya belum diisi tampil "Segera diisi".

## J. Nomor KTA khusus 0001–0100 (baru)
- [x] Nomor 0001–0100 setiap tahun disediakan untuk anggota terpilih dan hanya bisa diberikan oleh Pemilik
- [ ] Siapa yang mendapat nomor khusus? Usulan: 0001 untuk Ketua DPD, lalu Dewan Penasihat, Dewan Pembina, dan pengurus harian
- [ ] Siapkan daftar urutannya (nomor → nama) agar tidak berebut nomor
