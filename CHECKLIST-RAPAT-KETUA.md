# Bahan Rapat dengan Ketua DPD — Website GMPI DPD Sidoarjo

## A. Sudah jadi & bisa didemokan
| Fitur | Cara menunjukkan |
|---|---|
| Website resmi (hero, 4 badan, Posko Digital, galeri, pendaftaran) | Buka `gmpi-sidoarjo-site.vercel.app` |
| Kartu Tanda Anggota vertikal + sisi belakang yang bisa diputar | Bagian **“Satu kartu, satu barisan.”** di beranda → klik kartunya |
| QR anti-palsu | Pindai QR kartu contoh dengan HP → muncul **“Ini kartu contoh”** |
| Panel Admin (khusus undangan) | Footer → **Admin** → masuk |
| Ganti logo dari Admin | Admin → **Isi situs** → **Logo situs** |
| Terbitkan & unduh kartu anggota | Admin → **Kartu anggota** → isi data → **Simpan & terbitkan** → unduh depan & belakang |
| Status kartu (aktif/nonaktif/dicabut) | Ubah status di daftar kartu → pindai ulang QR |

## B. Perlu keputusan Ketua
1. **Nama domain** yang dibeli (lihat bagian C).
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
- Pilihan nama: `gmpisidoarjo.com`, `gmpisidoarjo.id`, `gmpisidoarjo.org`, atau `gmpisidoarjo.or.id`.
  - `.or.id` khusus organisasi dan biasanya meminta dokumen legal (mis. SK/akta).
  - `.com` / `.id` / `.org` cukup KTP/data pemilik, langsung aktif.
- Beli di registrar Indonesia (mis. Niagahoster, DomaiNesia, Rumahweb) atau langsung di Vercel (khusus ekstensi yang tersedia di sana).
- Perhatikan **harga perpanjangan** tahun berikutnya, bukan hanya harga promo tahun pertama.
- Daftarkan atas nama/email resmi organisasi, dan simpan data login registrar di tempat aman.
- Setelah dibeli: sambungkan di **Vercel → Settings → Domains** (dipandu langkah demi langkah), lalu QR kartu & halaman verifikasi diganti ke domain baru.
- **Cetak kartu anggota sungguhan setelah domain baru terpasang**, supaya QR memakai alamat resmi. (Alamat vercel.app tetap berfungsi, jadi kartu lama tidak rusak.)

## D. Belum aktif (sengaja)
- **Formulir Pendaftaran & Posko Digital belum mengirim/menyimpan data.** Untuk mengaktifkan diperlukan poin B6 dan B7, lalu dibuatkan penghubung server yang aman (kunci rahasia hanya di Vercel, tidak di browser).

## E. Toko perlengkapan & legalitas (baru)
- [ ] Tetapkan **daftar barang + harga** (seragam PDH/PDL, kaos, jaket, topi, emblem, pin, bendera, stiker, cetak KTA).
- [ ] Tetapkan **nomor WhatsApp pengurus** penerima pesanan & bukti bayar (format 62…).
- [ ] Sepakati alamat/jam ambil barang di sekretariat & kebijakan ongkir.
- [ ] Foto barang (latar polos, persegi) untuk diunggah di Admin → tab **Toko**.
- [ ] **NPWP organisasi**: apakah sudah ada? Bila ada, isi di Admin → Toko.
- [ ] **DPD atau DPD?** Bank, QRIS, dan stempel bertuliskan *DPD Kabupaten Sidoarjo*, sedangkan website & kartu memakai *DPD Sidoarjo*. Putuskan satu nama agar seragam.
- [ ] Penanda tangan KTA: AD/ART menyebut KTA ditandatangani **Ketua Umum**; saat ini default kartu "Ketua DPD" (bisa diubah di Admin → Kartu anggota).

## F. Kolom berita media mitra (baru)
- [ ] Daftar media yang bekerja sama + email redaksi masing-masing.
- [ ] Apakah berita media perlu **persetujuan pengurus** sebelum tayang? (bisa diatur per media)
- [ ] Siapa pengurus yang bertugas memeriksa/menyetujui berita (peran Editor Situs).
- [ ] Logo tiap media (PNG/JPG) untuk ditampilkan di bagian "Media mitra".
