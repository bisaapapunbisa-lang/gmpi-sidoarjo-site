PEMBARUAN — KETUA DPD BERLAKU UNTUK SELURUH BIDANG

Paket ini menambahkan opsi “Seluruh bidang (Ketua DPD)” pada form Owner → Edit data pendaftaran. Gunakan opsi tersebut untuk Ketua DPD agar tidak ditempatkan di salah satu bidang pergerakan saja.

Isi
- admin.js — opsi dan keterangan untuk klasifikasi Ketua lintas bidang.
- supabase/migrations/202610260025_ketua_seluruh_bidang.sql — memperbolehkan nilai baru di kolom division dan memperbarui RPC edit Owner.

Pemasangan
1. Ganti `admin.js` di repo/branch produksi dengan file paket, commit/push, lalu tunggu deploy Vercel.
2. Jalankan migration 025 di Supabase SQL Editor. Migration ini dijalankan setelah migration 024 (editor lengkap Owner).
3. Muat ulang Admin menggunakan Ctrl+Shift+R. Buka Pendaftaran anggota → Edit data… → Bidang → pilih “Seluruh bidang (Ketua DPD)” → Simpan semua perubahan.

Migration ini khusus klasifikasi bidang Ketua pada editor Admin. Daftar bidang yang dipilih pendaftar umum tidak berubah. Jangan jalankan migration lama 022 setelah migration 023.

Uji lokal: `node --check admin.js` lulus dan arsip diuji dengan `unzip -t`. Perilaku database/browser belum diuji langsung.
