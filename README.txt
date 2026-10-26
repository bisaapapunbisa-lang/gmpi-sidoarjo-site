PERBAIKAN — PILIHAN JABATAN KTA

“KEPALA HUMAS DPD” memang ada di daftar jabatan. Jabatan tunggal yang sudah dipakai disembunyikan saat membuat kartu baru agar tidak terpilih ganda. Pada form edit kartu lama, daftar belum diperbarui memakai jabatan kartu yang sedang dibuka, sehingga jabatan milik kartu tersebut ikut tersembunyi.

Patch ini memperbarui `admin.js` agar saat membuka kartu, pilihan jabatan dimuat ulang dan jabatan kartu itu sendiri tetap tampil/terpilih. Jika membuat KTA baru dari pendaftar yang sudah ada, pilih “Pendaftar tersimpan” dahulu agar jabatan pendaftar ikut terisi.

Pemasangan: ganti `admin.js` di repo/branch produksi, commit/push, tunggu deploy Vercel, lalu muat ulang Admin dengan Ctrl+Shift+R. Tidak memerlukan migration Supabase.

Uji lokal: `node --check admin.js` lulus. Browser live belum diuji setelah patch.
