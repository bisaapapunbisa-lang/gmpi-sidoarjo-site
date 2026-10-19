/*
  GMPI DPC Sidoarjo — Kartu Tanda Anggota (KTA) vertikal.
  Satu renderer dipakai untuk: contoh kartu di beranda, pratinjau & unduhan di Admin.
  Ukuran kartu: standar ID card CR80 (54 × 85,6 mm) potret, diekspor 1276 × 2024 px (± 600 dpi).
  Butuh: vendor/qrcode-generator.js (global `qrcode`).
*/
(() => {
  const W = 638;
  const H = 1012;
  const SCALE = 2;
  // QR memakai huruf besar agar mode "alfanumerik" QR aktif: kode lebih sederhana & mudah dipindai.
  // Jika nanti memakai domain sendiri, ganti alamat ini lalu cetak ulang kartu.
  const VERIFY_BASE = 'HTTPS://GMPI-SIDOARJO-SITE.VERCEL.APP/V/';
  const VERIFY_LABEL = 'gmpi-sidoarjo-site.vercel.app/v';
  const C = {
    ink: '#0c0c0b', ink2: '#161614', line: 'rgba(255,255,255,.12)',
    red: '#e51c24', red2: '#8f0d12', gold: '#d7ac4c', goldHi: '#f3d685',
    white: '#fbf8f1', muted: '#9e9a90', cyan: '#64f4ff'
  };
  const F = {
    display: "'GMPI Anton', Impact, 'Arial Narrow', sans-serif",
    body: "'GMPI Inter', 'Segoe UI', Arial, sans-serif",
    mono: "'GMPI Mono', 'Consolas', 'Courier New', monospace"
  };
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

  const scriptSrc = document.currentScript && document.currentScript.src;
  const FONT_BASE = scriptSrc ? new URL('assets/fonts/', scriptSrc).href : 'assets/fonts/';

  let fontsPromise = null;
  function ready() {
    if (fontsPromise) return fontsPromise;
    if (typeof FontFace === 'undefined' || !document.fonts) return (fontsPromise = Promise.resolve());
    const list = [
      ['GMPI Anton', 'anton-latin-400-normal.woff2', '400'],
      ['GMPI Inter', 'inter-latin-600-normal.woff2', '600'],
      ['GMPI Inter', 'inter-latin-800-normal.woff2', '800'],
      ['GMPI Mono', 'jetbrains-mono-latin-700-normal.woff2', '700']
    ];
    fontsPromise = Promise.all(list.map(([family, file, weight]) =>
      new FontFace(family, `url(${FONT_BASE}${file}) format('woff2')`, { weight }).load()
        .then(face => { document.fonts.add(face); })
        .catch(() => {})
    ));
    return fontsPromise;
  }

  function loadImage(src, crossOrigin) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function verifyUrl(token) { return VERIFY_BASE + String(token || '').toUpperCase(); }

  function formatDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    if (!m) return '—';
    return `${m[3]} ${MONTHS[Number(m[2]) - 1] || ''} ${m[1]}`;
  }

  function rr(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // Teks dengan jarak huruf manual (ctx.letterSpacing belum didukung semua browser).
  function spaced(ctx, text, x, y, spacing, align = 'left') {
    const chars = [...String(text)];
    const widths = chars.map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    chars.forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += widths[i] + spacing; });
    ctx.textAlign = prevAlign;
    return total;
  }
  function spacedWidth(ctx, text, spacing) {
    const chars = [...String(text)];
    return chars.reduce((a, ch) => a + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
  }

  function drawCover(ctx, img, x, y, w, h, zoom = 1, offX = 0, offY = 0) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const base = Math.max(w / iw, h / ih) * Math.max(1, zoom);
    const dw = iw * base;
    const dh = ih * base;
    const maxX = (dw - w) / 2;
    const maxY = (dh - h) / 2;
    const dx = x - maxX + maxX * Math.max(-1, Math.min(1, offX));
    const dy = y - maxY + maxY * Math.max(-1, Math.min(1, offY));
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  function drawQr(ctx, text, x, y, size) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, size, size);
    if (!text || typeof window.qrcode !== 'function') {
      ctx.fillStyle = '#d9d4c7';
      for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if ((i + j) % 2 === 0) ctx.fillRect(x + 12 + i * ((size - 24) / 7), y + 12 + j * ((size - 24) / 7), (size - 24) / 7, (size - 24) / 7);
      ctx.fillStyle = '#5c584f';
      ctx.font = `800 11px ${F.body}`;
      ctx.textAlign = 'center';
      ctx.fillText('QR MUNCUL', x + size / 2, y + size / 2 - 4);
      ctx.fillText('SETELAH DISIMPAN', x + size / 2, y + size / 2 + 12);
      return;
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(text, /^[0-9A-Z $%*+\-./:]+$/.test(text) ? 'Alphanumeric' : 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 2;
    const cell = size / (count + quiet * 2);
    ctx.fillStyle = '#0c0c0b';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          // +0.35 menutup celah anti-alias antar modul
          ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.35, cell + 0.35);
        }
      }
    }
  }

  function silhouette(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#2b2a26');
    g.addColorStop(1, '#1b1a18');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#45433d';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h * 0.38, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.95, w * 0.36, h * 0.27, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.font = `800 10px ${F.body}`;
    ctx.textAlign = 'center';
    spaced(ctx, 'FOTO 3×4', x + w / 2, y + h - 18, 2, 'center');
  }

  function splitName(ctx, name, maxWidth, size) {
    ctx.font = `${size}px ${F.display}`;
    if (ctx.measureText(name).width <= maxWidth) return [name];
    const words = name.split(/\s+/);
    if (words.length < 2) return [name];
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const worst = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || worst < best.worst) best = { lines: [a, b], worst };
    }
    return best.lines;
  }

  function draw(canvas, data = {}) {
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';

    const name = String(data.name || 'NAMA ANGGOTA').trim().toUpperCase() || 'NAMA ANGGOTA';
    const number = String(data.number || 'GMPI-SDA-0000-0000').trim().toUpperCase();
    const district = String(data.district || '—').trim().toUpperCase();
    const jabatan = String(data.jabatan || 'ANGGOTA').trim().toUpperCase();
    const token = String(data.token || '').toUpperCase();
    const issuedYear = (/^(\d{4})/.exec(String(data.issued || '')) || [])[1] || String(new Date().getFullYear());

    // ---------- Dasar kartu ----------
    ctx.save();
    rr(ctx, 0, 0, W, H, 34);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, W * 0.35, H);
    bg.addColorStop(0, '#1a1a17');
    bg.addColorStop(0.55, '#0f0f0e');
    bg.addColorStop(1, '#090908');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // tekstur garis diagonal halus
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.028)';
    ctx.lineWidth = 1;
    for (let i = -H; i < W; i += 13) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
    ctx.restore();

    // cahaya merah lembut di belakang foto
    const glow = ctx.createRadialGradient(W / 2, 380, 20, W / 2, 380, 360);
    glow.addColorStop(0, 'rgba(229,28,36,.24)');
    glow.addColorStop(1, 'rgba(229,28,36,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // lambang besar transparan sebagai watermark keamanan
    if (data.logo) {
      ctx.save();
      ctx.globalAlpha = 0.055;
      ctx.beginPath();
      ctx.arc(W / 2, 470, 300, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, data.logo, W / 2 - 300, 170, 600, 600);
      ctx.restore();
    }

    // aksen sudut kanan atas: merah + garis emas + strip holografik
    ctx.save();
    const redG = ctx.createLinearGradient(W - 220, 0, W, 220);
    redG.addColorStop(0, C.red);
    redG.addColorStop(1, C.red2);
    ctx.fillStyle = redG;
    ctx.beginPath(); ctx.moveTo(W - 168, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 168); ctx.closePath(); ctx.fill();
    const holo = ctx.createLinearGradient(W - 220, 0, W, 220);
    holo.addColorStop(0, 'rgba(100,244,255,.0)');
    holo.addColorStop(0.25, 'rgba(100,244,255,.55)');
    holo.addColorStop(0.5, 'rgba(243,214,133,.6)');
    holo.addColorStop(0.75, 'rgba(255,86,93,.55)');
    holo.addColorStop(1, 'rgba(255,86,93,0)');
    ctx.fillStyle = holo;
    ctx.beginPath(); ctx.moveTo(W - 206, 0); ctx.lineTo(W - 186, 0); ctx.lineTo(W, 186); ctx.lineTo(W, 206); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(W - 232, 0); ctx.lineTo(W, 232); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `800 11px ${F.body}`;
    ctx.save();
    ctx.translate(W - 50, 50);
    ctx.rotate(Math.PI / 4);
    spaced(ctx, 'KTA', 0, 4, 3, 'center');
    ctx.restore();
    ctx.restore();

    // ---------- Header ----------
    const lx = 90, ly = 94, lr = 44;
    if (data.logo) {
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = '#10100f'; ctx.fill();
      ctx.clip();
      drawCover(ctx, data.logo, lx - lr, ly - lr, lr * 2, lr * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1f1e1b'; ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
    }
    // ring khas situs (segmen cyan / merah / emas)
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    [[C.cyan, -0.35, 0.25], [C.red, 1.6, 2.25], [C.goldHi, 3.6, 4.35], ['rgba(100,244,255,.25)', 0, Math.PI * 2]].forEach(([color, a, b]) => {
      ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(lx, ly, lr + 7, a, b); ctx.stroke();
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = `600 8.6px ${F.body}`;
    spaced(ctx, 'GERAKAN MILITANSI PEJUANG INDONESIA', 156, 62, 1.5);
    ctx.fillStyle = C.white;
    ctx.font = `58px ${F.display}`;
    spaced(ctx, 'GMPI', 154, 118, 3);
    ctx.fillStyle = C.gold;
    ctx.font = `800 13px ${F.body}`;
    spaced(ctx, 'DPC SIDOARJO', 157, 140, 4.2);

    // ---------- Label kartu ----------
    ctx.font = `800 11.5px ${F.body}`;
    const labelText = 'KARTU TANDA ANGGOTA';
    const labelW = spacedWidth(ctx, labelText, 3) + 32;
    ctx.fillStyle = C.red;
    rr(ctx, 40, 176, labelW, 30, 4); ctx.fill();
    ctx.fillStyle = '#fff';
    spaced(ctx, labelText, 56, 196, 3);
    ctx.fillStyle = C.gold;
    ctx.font = `700 12px ${F.mono}`;
    ctx.textAlign = 'right';
    ctx.fillText(`TERBIT ${issuedYear}`, W - 40, 196);
    const yearW = ctx.measureText(`TERBIT ${issuedYear}`).width;
    ctx.strokeStyle = 'rgba(215,172,76,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40 + labelW + 12, 191); ctx.lineTo(W - 52 - yearW, 191); ctx.stroke();

    // ---------- Foto ----------
    const pw = 246, ph = 304, px = (W - pw) / 2 - 7, py = 236;
    ctx.fillStyle = C.red;
    rr(ctx, px + 14, py + 14, pw, ph, 22); ctx.fill();
    ctx.save();
    rr(ctx, px, py, pw, ph, 22); ctx.clip();
    if (data.photo) drawCover(ctx, data.photo, px, py, pw, ph, data.photoZoom || 1, data.photoX || 0, data.photoY || 0);
    else silhouette(ctx, px, py, pw, ph);
    // kilau tipis di atas foto
    const sheen = ctx.createLinearGradient(px, py, px + pw, py + ph);
    sheen.addColorStop(0, 'rgba(255,255,255,.10)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen; ctx.fillRect(px, py, pw, ph);
    ctx.restore();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3;
    rr(ctx, px, py, pw, ph, 22); ctx.stroke();
    // braket sudut
    ctx.strokeStyle = 'rgba(243,214,133,.85)'; ctx.lineWidth = 2;
    const b = 18, o = 14;
    [[px - o, py - o, 1, 1], [px + pw + o, py - o, -1, 1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy * b); ctx.lineTo(x, y); ctx.lineTo(x + sx * b, y); ctx.stroke();
    });

    // ---------- Nama & jabatan ----------
    ctx.fillStyle = C.white;
    ctx.textAlign = 'center';
    let size = 50;
    ctx.font = `${size}px ${F.display}`;
    while (size > 34 && ctx.measureText(name).width > 556) { size -= 1; ctx.font = `${size}px ${F.display}`; }
    let lines = [name];
    if (ctx.measureText(name).width > 556) {
      size = 40;
      lines = splitName(ctx, name, 556, size);
      ctx.font = `${size}px ${F.display}`;
      while (size > 26 && Math.max(...lines.map(l => ctx.measureText(l).width)) > 556) { size -= 1; ctx.font = `${size}px ${F.display}`; }
    }
    const nameTop = lines.length > 1 ? 596 : 612;
    lines.forEach((line, i) => ctx.fillText(line, W / 2, nameTop + i * (size * 0.98)));
    const afterName = nameTop + (lines.length - 1) * size * 0.98;

    ctx.font = `800 12.5px ${F.body}`;
    const chipW = Math.min(520, spacedWidth(ctx, jabatan, 2.4) + 40);
    const chipY = afterName + 18;
    const chipG = ctx.createLinearGradient(W / 2 - chipW / 2, 0, W / 2 + chipW / 2, 0);
    chipG.addColorStop(0, C.gold); chipG.addColorStop(1, C.goldHi);
    ctx.fillStyle = chipG;
    rr(ctx, W / 2 - chipW / 2, chipY, chipW, 32, 16); ctx.fill();
    ctx.fillStyle = '#16130b';
    spaced(ctx, jabatan, W / 2, chipY + 21, 2.4, 'center');

    // ---------- Data ----------
    const infoY = 714;
    ctx.strokeStyle = C.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, infoY - 22); ctx.lineTo(W - 40, infoY - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, infoY + 44); ctx.lineTo(W - 40, infoY + 44); ctx.stroke();
    const cols = [
      [40, 'NO. ANGGOTA', number, F.mono, 700, 16.5, 236],
      [300, 'KECAMATAN', district, F.body, 800, 16, 152],
      [470, 'BERLAKU S/D', formatDate(data.validUntil).toUpperCase(), F.body, 800, 16, 128]
    ];
    cols.forEach(([x, label, value, family, weight, fs, maxW]) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = C.muted;
      ctx.font = `800 8.6px ${F.body}`;
      spaced(ctx, label, x, infoY, 2);
      ctx.fillStyle = C.white;
      let s = fs;
      ctx.font = `${weight} ${s}px ${family}`;
      while (s > 10 && ctx.measureText(value).width > maxW) { s -= 0.5; ctx.font = `${weight} ${s}px ${family}`; }
      ctx.fillText(value, x, infoY + 26);
    });
    [292, 462].forEach(x => { ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(x - 8, infoY - 10); ctx.lineTo(x - 8, infoY + 32); ctx.stroke(); });

    // ---------- QR verifikasi ----------
    const qx = 40, qy = 780, qs = 168;
    ctx.fillStyle = '#fff';
    rr(ctx, qx, qy, qs, qs, 16); ctx.fill();
    drawQr(ctx, token ? verifyUrl(token) : '', qx + 6, qy + 6, qs - 12);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
    rr(ctx, qx - 5, qy - 5, qs + 10, qs + 10, 20); ctx.stroke();

    const tx = qx + qs + 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold;
    ctx.font = `800 9px ${F.body}`;
    spaced(ctx, '● VERIFIKASI DIGITAL', tx, qy + 18, 2.2);
    ctx.fillStyle = C.white;
    ctx.font = `33px ${F.display}`;
    ctx.fillText('PINDAI UNTUK', tx, qy + 58);
    ctx.fillStyle = C.goldHi;
    ctx.fillText('CEK KEASLIAN', tx, qy + 94);
    ctx.fillStyle = '#c5c1b7';
    ctx.font = `600 11px ${F.body}`;
    ctx.fillText('Hasil resmi hanya tampil di situs:', tx, qy + 120);
    ctx.fillStyle = C.white;
    ctx.font = `800 11.5px ${F.body}`;
    ctx.fillText(VERIFY_LABEL, tx, qy + 137);
    ctx.fillStyle = C.gold;
    ctx.font = `700 11px ${F.mono}`;
    ctx.fillText(`KODE ${token ? '••••' + token.slice(-6) : '— — — —'}`, tx, qy + 160);

    // ---------- Pita slogan ----------
    const fy = H - 46;
    ctx.fillStyle = C.gold; ctx.fillRect(0, fy - 3, W, 3);
    const band = ctx.createLinearGradient(0, fy, W, H);
    band.addColorStop(0, C.red2); band.addColorStop(0.5, C.red); band.addColorStop(1, C.red2);
    ctx.fillStyle = band; ctx.fillRect(0, fy, W, 46);
    ctx.fillStyle = '#fff';
    ctx.font = `800 12.5px ${F.body}`;
    spaced(ctx, 'SETIA BERSAUDARA SAMPAI URAT NADI', W / 2, fy + 28, 3.4, 'center');

    // ---------- Tanda CONTOH ----------
    if (data.sample) {
      ctx.save();
      ctx.translate(W / 2, H / 2 + 20);
      ctx.rotate(-0.5);
      ctx.textAlign = 'center';
      ctx.font = `150px ${F.display}`;
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillText('CONTOH', 0, 50);
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 2;
      ctx.strokeText('CONTOH', 0, 50);
      ctx.restore();
    }

    // bingkai dalam tipis
    ctx.strokeStyle = 'rgba(255,255,255,.10)';
    ctx.lineWidth = 2;
    rr(ctx, 1, 1, W - 2, H - 2, 33); ctx.stroke();
    ctx.restore();
    return canvas;
  }

  window.GMPICard = { W, H, SCALE, VERIFY_BASE, ready, loadImage, verifyUrl, formatDate, draw };
})();
