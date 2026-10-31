# Cahaya Perjuangan — studio film identitas

Film 24 detik, 3840×2160, 24 fps, H.264 + AAC. Figur diambil dari
`assets/posters/poster-dpd-gmpi-sidoarjo.webp` (poster asli pengguna); lambang
resmi transparan diambil dari `assets/logo-gmpi-sidoarjo.webp`. Latar
panggung kosong dibuat sebagai aset generatif; asap, bara, kilat, judul metalik,
kilau, dan gelombang cahaya dirender secara deterministik. Musik adalah sintesis
asli, bukan sampel/rekaman pihak ketiga.

Ini **parallax 2.5D** dari foto asli, bukan rekonstruksi tubuh/pose 3D baru.

## Hasil publik

- `sinematik.html` — pemutar interaktif: putar/jeda, ulang, timeline, bab, suara,
  cahaya lembut, layar penuh, unduh 4K. Tanpa autoplay; preferensi reduced-motion
  memulai dalam mode cahaya lembut dan diam.
- `index.html#pimpinan` — tautan "Putar Film Sinematik" di bawah poster asli.
- `assets/cinema/dpd-gmpi-cinematic-4k.mp4` — ekspor video.
- `assets/cinema/film-poster.jpg` — still 4K untuk fallback/metadata.
- `assets/cinema/score.m4a` — musik saja untuk pemutar web.
- `assets/cinema/score-vo.m4a` — musik + voiceover Indonesia untuk pemutar web.
- `assets/cinema/voiceover/` — take VO terpilih (0:02, 0:05, 0:08).

## Menjalankan situs

```sh
npm start
# http://localhost:3000/sinematik.html
```

Server statis mengikat `0.0.0.0`, menerima host preview, dan mendukung HTTP Range
untuk video. Tidak ada backend, CDN, atau kredensial.

## Render ulang

Node 22+ dan Python 3.11+:

```sh
npm ci
python -m venv .venv
.venv/bin/pip install -r scripts/cinema/requirements.txt

# Opsional: siapkan ulang lapisan foto. Model IS-Net harus tersedia di U2NET_HOME
# dengan nama isnet-general-use.onnx (tidak di-commit).
U2NET_HOME=/path/to/models .venv/bin/python scripts/cinema/prepare-assets.py

# Musik asli, mix voiceover, dan still.
.venv/bin/python scripts/cinema/make-score.py
.venv/bin/python scripts/cinema/mix-voiceover.py
node scripts/cinema/render.mjs --width 1920 --poster-only

# Ekspor 4K. Frame antara disimpan di .cache/cinema/frames.
node scripts/cinema/render.mjs --width 3840 --fps 24

# Jika frame sudah ada dan hanya encoding yang perlu diulang:
node scripts/cinema/render.mjs --width 3840 --fps 24 --encode-only
```

Renderer memakai preset veryfast, CRF 21, satu thread encoder, dan lookahead 0
agar hemat memori di sandbox kecil. Hasil akhir tetap 3840×2160.

## Uji

Dengan server berjalan:

```sh
npm run cinema:test
```

Menguji desktop/mobile, putar/jeda/ulang, timeline, bab, suara, cahaya lembut,
state akhir, unduhan Range 4K, tautan beranda, reduced-motion, dan error halaman.
Screenshot uji ada di `.cache/cinema/tests/` (diabaikan Git).

## Catatan aksesibilitas

- Peringatan kilatan terlihat sebelum pemutaran.
- Sakelar "Cahaya lembut" menurunkan intensitas kilat, mengguncang, dan parallax pointer.
- `prefers-reduced-motion` tidak memutar otomatis dan mengaktifkan cahaya lembut.
- Kontrol memiliki label, focus ring, status live region, dan shortcut Spasi/K,
  panah kiri/kanan, M, F.
- Poster fallback dan tautan unduh tetap tersedia bila JavaScript/canvas gagal.
