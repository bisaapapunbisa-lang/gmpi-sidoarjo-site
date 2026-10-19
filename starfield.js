/*
  Latar bintang 3D GMPI DPC Sidoarjo.
  Bintang melaju dari kejauhan ke arah layar (efek keluar layar), sedikit mengikuti arah
  kursor/kemiringan, dan melesat lebih cepat saat halaman digulir.
  Hemat daya: berhenti saat tab tidak aktif, jumlah bintang menyesuaikan ukuran layar,
  dan diam (statis) bila pengguna memilih "kurangi animasi".
*/
(() => {
  const canvas = document.getElementById('starfield');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = [
    [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 250, 235],
    [243, 214, 133], [243, 214, 133], // emas
    [100, 244, 255], // cyan (warna ring logo)
    [255, 120, 120] // merah lembut
  ];
  const DEPTH = 1000;
  const NEAR = 2;

  let w = 0, h = 0, dpr = 1, focal = 0;
  let stars = [];
  let running = false;
  let last = 0;
  let boost = 0; // tambahan kecepatan dari gulir
  let lastScroll = window.scrollY;
  const center = { x: 0, y: 0, tx: 0, ty: 0 };

  function makeStar(randomDepth) {
    const c = COLORS[(Math.random() * COLORS.length) | 0];
    return {
      x: (Math.random() * 2 - 1) * w,
      y: (Math.random() * 2 - 1) * h,
      z: randomDepth ? NEAR + Math.random() * DEPTH : DEPTH,
      px: null, py: null,
      r: c[0], g: c[1], b: c[2],
      size: 0.6 + Math.random() * 1.1,
      tw: Math.random() * Math.PI * 2
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    focal = Math.max(w, h) * 0.55;
    const count = Math.round(Math.min(700, Math.max(220, (w * h) / 2400)));
    if (stars.length > count) stars.length = count;
    while (stars.length < count) stars.push(makeStar(true));
    stars.forEach(s => { s.px = null; });
    if (!running) drawFrame(0);
  }

  function drawFrame(dt) {
    ctx.clearRect(0, 0, w, h);
    center.x += (center.tx - center.x) * 0.04;
    center.y += (center.ty - center.y) * 0.04;
    const cx = w / 2 + center.x;
    const cy = h / 2 + center.y;
    const dz = (0.12 + boost) * dt; // kedalaman per ms: ± 8 detik dari jauh sampai melewati layar
    boost *= 0.94;
    ctx.lineCap = 'round';

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.z -= dz;
      if (s.z <= NEAR) { Object.assign(s, makeStar(false)); continue; }
      const k = focal / s.z;
      const sx = cx + s.x * k / 2;
      const sy = cy + s.y * k / 2;
      if (sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) { Object.assign(s, makeStar(false)); continue; }
      const nearness = 1 - s.z / DEPTH; // 0 jauh … 1 dekat
      s.tw += dt * 0.004;
      const alpha = (0.28 + 0.72 * Math.min(1, nearness * 1.4)) * (0.72 + 0.28 * Math.sin(s.tw));
      const radius = Math.max(0.55, s.size * (0.45 + nearness * nearness * 2.8));
      const color = `rgba(${s.r},${s.g},${s.b},${alpha.toFixed(3)})`;

      if (nearness > 0.45 && dt > 0) {
        // jejak cahaya pendek: makin dekat & makin cepat, makin panjang → kesan melesat keluar layar
        const tz = Math.min(DEPTH, s.z + 18 + boost * 220);
        const tk = focal / tz;
        const tx = cx + s.x * tk / 2;
        const ty = cy + s.y * tk / 2;
        const grad = ctx.createLinearGradient(tx, ty, sx, sy);
        grad.addColorStop(0, `rgba(${s.r},${s.g},${s.b},0)`);
        grad.addColorStop(1, color);
        ctx.strokeStyle = grad;
        ctx.lineWidth = radius * 1.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      if (nearness > 0.82) {
        // kilau silang pada bintang yang sangat dekat
        ctx.strokeStyle = `rgba(${s.r},${s.g},${s.b},${(alpha * 0.35).toFixed(3)})`;
        ctx.lineWidth = 0.8;
        const f = radius * 4;
        ctx.beginPath();
        ctx.moveTo(sx - f, sy); ctx.lineTo(sx + f, sy);
        ctx.moveTo(sx, sy - f); ctx.lineTo(sx, sy + f);
        ctx.stroke();
      }
      s.px = sx; s.py = sy;
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = last ? Math.min(50, now - last) : 16;
    last = now;
    drawFrame(dt);
    requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduceMotion) return;
    running = true;
    last = 0;
    requestAnimationFrame(loop);
  }
  function stop() { running = false; }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('pointermove', e => {
    center.tx = (e.clientX / w - 0.5) * -60;
    center.ty = (e.clientY / h - 0.5) * -40;
  }, { passive: true });
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    const delta = Math.abs(y - lastScroll);
    lastScroll = y;
    boost = Math.min(1.6, boost + delta * 0.004);
  }, { passive: true });

  resize();
  if (reduceMotion) {
    // tampilan statis: sebar bintang tanpa gerak
    stars.forEach(s => { s.px = null; });
    drawFrame(0);
  } else {
    start();
  }
})();
