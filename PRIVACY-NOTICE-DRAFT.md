# DRAF PEMBERITAHUAN PRIVASI — GMPI DPD SIDOARJO

**Status: DRAF UNTUK DITINJAU DPD — JANGAN DIPUBLIKASIKAN ATAU DIPAKAI UNTUK MENGUMPULKAN DATA SEBELUM DISETUJUI.**

Tanggal revisi: 20 Oktober 2026  
Pengendali yang diusulkan: GMPI DPD Sidoarjo  
Kontak resmi LBH/privasi: **[ISI DENGAN EMAIL RESMI LBH DPD]**

## 1. Status situs saat ini

Formulir pada situs GMPI DPD Sidoarjo saat ini masih prototipe dan belum mengirim atau menyimpan data. Migrasi Supabase telah menyiapkan tabel dan bucket privat, tetapi endpoint server yang menerima formulir belum dibuat atau diaktifkan. Jangan memasukkan NIK, foto KTP, atau informasi perkara nyata sampai DPD menyetujui pemberitahuan ini dan sistem penerimaan diuji.

## 2. Data yang direncanakan

Jika formulir kelak diaktifkan, DPD dapat meminta:

- **Aduan warga:** nama, kontak, kecamatan, topik, dan ringkasan persoalan.
- **Pendaftaran anggota:** nama lengkap, NIK, tempat/tanggal lahir, jenis kelamin, nomor telepon, kecamatan, alamat, jabatan pengurus (bila pendaftar mengisi), pernyataan pledge, foto KTP, dan foto profil. Bidang pergerakan tidak lagi ditanyakan saat pendaftaran; bila pengurus mencatatnya untuk keperluan internal, data itu ikut dilindungi ketentuan ini.

NIK dan foto KTP merupakan data berisiko tinggi. DPD harus memastikan setiap data memang diperlukan dan tidak meminta dokumen tambahan tanpa tujuan yang jelas.

## 3. Tujuan penggunaan yang diusulkan

- Meninjau aduan warga dan menghubungi pelapor untuk tindak lanjut LBH DPD.
- Memverifikasi pendaftaran anggota dan membantu penempatan ke basis/PAC atau bidang yang diminati.
- Menjaga keamanan, mencegah penyalahgunaan, serta memenuhi kewajiban organisasi yang berlaku.

DPD perlu mengonfirmasi dasar pemrosesan yang sesuai dan menghapus tujuan yang tidak diperlukan sebelum menerbitkan pemberitahuan final.

## 4. Akses dan penyimpanan yang direncanakan

- Akses awal dibatasi pada **pemilik project Supabase**; petugas lain tidak boleh diberi akses sebelum ditetapkan secara resmi.
- Data direncanakan disimpan di Supabase dan situs/API disajikan melalui Vercel. DPD perlu meninjau pengaturan lokasi, syarat layanan, akses, cadangan, dan penghapusan dari penyedia tersebut sebelum formulir aktif.
- Tabel database menggunakan Row Level Security dan bucket dokumen disiapkan sebagai privat. Kontrol ini tidak dengan sendirinya membuat formulir siap menerima data: endpoint server, pengamanan anti-spam, dan pengujian akses masih harus dibuat.
- Kunci `service_role` Supabase hanya boleh berada sebagai secret server-side di Vercel; jangan pernah meletakkannya di HTML/JavaScript publik, GitHub, atau pesan.

## 5. Rencana masa simpan dan penghapusan

Pilihan sementara yang diberikan: **maksimal satu tahun** untuk aduan maupun pendaftaran, dihitung dari tanggal diterima. DPD harus mengonfirmasi apakah hitungan ini dimulai dari penerimaan atau penutupan penanganan, serta prosedur penghapusan dari tabel, bucket, dan cadangan. Jika data tidak lagi diperlukan atau permintaan penghapusan sah diajukan, DPD perlu menilai dan memprosesnya sesuai aturan yang berlaku.

## 6. Hak dan kontak

Pelapor atau calon anggota dapat meminta informasi, koreksi, atau penghapusan data melalui **[EMAIL RESMI LBH DPD]**. DPD perlu menetapkan cara memverifikasi identitas pemohon tanpa meminta data berlebihan dan menetapkan waktu tanggapan.

## 7. Persetujuan dan perubahan

Pemberitahuan final harus menjelaskan dengan bahasa mudah data apa yang wajib/opsional, siapa penerimanya, tujuan, dasar pemrosesan, masa simpan, hak pemilik data, serta cara menghubungi DPD. Persetujuan tidak boleh dianggap diberikan hanya karena seseorang membuka situs. DPD harus menetapkan versi dan tanggal berlaku, meninjau perubahan, dan memperoleh persetujuan yang sesuai sebelum mengumpulkan data.

---

**Catatan:** Dokumen ini adalah draf kerja teknis, bukan nasihat hukum dan bukan kebijakan yang sudah berlaku. DPD perlu memeriksa isi, mengisi email resmi, mengonfirmasi masa simpan dan dasar pemrosesan, serta memperoleh tinjauan yang sesuai sebelum publikasi. Sampai itu dilakukan, formulir harus tetap nonaktif untuk pengiriman data.
