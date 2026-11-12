(() => {
  'use strict';
  const root = 'https://iapwzhlcwprzojeruymm.supabase.co';
  const key = 'sb_publishable_R8Ua9s93ZK88kcFpTY7Tng_pQyapURb';
  const canvas = document.querySelector('#poster');
  const ctx = canvas.getContext('2d');
  const status = document.querySelector('#status');
  const missing = document.querySelector('#missing');
  const download = document.querySelector('#download');
  const retry = document.querySelector('#retry');
  let busy = false;
  function image(url, crossOrigin = false) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gambar tidak dapat dimuat; periksa koneksi.'));
      img.src = url;
    });
  }
  function nameKey(name) { return name.split(',')[0].replace(/[^a-z0-9]/gi, '').toLowerCase(); }
  function cover(img, x, y, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale, sh = h / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }
  function paintBackground(bg, logo) {
    cover(bg, 0, 0, canvas.width, canvas.height);
    const shade = ctx.createLinearGradient(0, 0, 0, 2250);
    shade.addColorStop(0, 'rgba(13,7,11,.75)');
    shade.addColorStop(.28, 'rgba(28,9,11,.10)');
    shade.addColorStop(.62, 'rgba(25,7,8,.25)');
    shade.addColorStop(1, 'rgba(15,5,8,.78)');
    ctx.fillStyle = shade; ctx.fillRect(0, 0, 1800, 2250);
    ctx.save(); ctx.beginPath(); ctx.arc(130, 125, 66, 0, Math.PI * 2); ctx.clip(); cover(logo, 64, 59, 132, 132); ctx.restore();
    ctx.textAlign = 'center'; ctx.fillStyle = '#f7e6c1'; ctx.font = 'bold 34px Arial'; ctx.fillText('DPD GMPI SIDOARJO', 900, 105);
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 14;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 84px Arial'; ctx.fillText('SELAMAT HARI', 900, 205);
    ctx.fillStyle = '#f5ca76'; ctx.font = 'bold 140px Arial'; ctx.fillText('PAHLAWAN', 900, 345);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 39px Arial'; ctx.fillText('10 NOVEMBER', 900, 402);
    ctx.fillStyle = '#ffe1a5'; ctx.shadowColor = '#8d1717'; ctx.shadowBlur = 18;
    ctx.font = 'bold 30px Arial'; ctx.fillText('SEMANGAT PAHLAWAN TAK PERNAH PADAM', 900, 466);
    ctx.shadowBlur = 0;
  }
  // Preserve the original pixels of the person. No generative faces or fabricated bodies.
  function extract(results, input) {
    const w = input.width, h = input.height;
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h;
    const c = tmp.getContext('2d', { willReadFrequently: true });
    c.drawImage(results.segmentationMask, 0, 0, w, h);
    c.globalCompositeOperation = 'source-in'; c.drawImage(input, 0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    const px = c.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (px[(y * w + x) * 4 + 3] > 96) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count++; }
    }
    if (maxX < 0 || count < (w * h / 4) * .015) return null;
    // Crop only empty transparent edges, leaving a few pixels around the subject.
    minX = Math.max(0, minX - 4); minY = Math.max(0, minY - 4);
    maxX = Math.min(w, maxX + 5); maxY = Math.min(h, maxY + 5);
    return { image: tmp, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  function drawPeople(people) {
    const cols = Math.min(9, Math.max(1, people.length));
    const rows = Math.ceil(people.length / cols);
    const spacing = 1780 / cols;
    const step = Math.min(205, 900 / Math.max(1, rows - 1));
    const height = Math.min(430, step * 1.8);
    const top = 960;
    people.forEach((p, i) => {
      const row = Math.floor(i / cols), index = i % cols;
      const rowCount = Math.min(cols, people.length - row * cols);
      const left = (1800 - rowCount * spacing) / 2;
      const x = left + (index + .5) * spacing;
      const y = top + row * step;
      let w = Math.min(height * p.width / p.height, spacing * 1.38);
      // Fade the lower edge of each cutout into the crowd rather than making a rectangular tile.
      const layer = document.createElement('canvas'); layer.width = Math.ceil(w); layer.height = Math.ceil(height);
      const c = layer.getContext('2d');
      // Crop the sides of very wide photos rather than squeezing faces horizontally.
      const sourceWidth = Math.min(p.width, p.height * layer.width / layer.height);
      c.drawImage(p.image, p.x + (p.width - sourceWidth) / 2, p.y, sourceWidth, p.height, 0, 0, layer.width, layer.height);
      const fade = c.createLinearGradient(0, layer.height * .77, 0, layer.height);
      fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in'; c.fillStyle = fade; c.fillRect(0, 0, layer.width, layer.height);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 12; ctx.drawImage(layer, x - w / 2, y); ctx.restore();
    });
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff1d4'; ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
    ctx.font = 'bold 28px Arial'; ctx.fillText('SETIA BERSAUDARA SAMPAI URAT NADI', 900, 2195); ctx.shadowBlur = 0;
  }
  async function render() {
    if (busy) return;
    busy = true; download.disabled = true; retry.hidden = true; missing.hidden = true;
    let model;
    try {
      status.textContent = 'Memuat foto dan alat pemisah latar…';
      if (typeof SelfieSegmentation === 'undefined') throw new Error('Alat pemisah foto tidak dapat dimuat. Periksa koneksi dan coba lagi.');
      const [bg, logo, response] = await Promise.all([
        image('/poster-pahlawan/kolosal-latar.png'), image('/poster-pahlawan/logo.webp'),
        fetch(root + '/rest/v1/org_structure?select=person_name,photo_path,sort_order&order=sort_order.asc', { headers: { apikey: key, Authorization: `Bearer ${key}` } })
      ]);
      if (!response.ok) throw new Error('Struktur organisasi tidak dapat diakses.');
      const rows = await response.json(), seen = new Set();
      const people = rows.filter(p => { if (!p.person_name?.trim() || !p.photo_path) return false; const k = nameKey(p.person_name); if (seen.has(k)) return false; seen.add(k); return true; });
      if (!people.length) throw new Error('Tidak ada foto pengurus pada struktur.');
      paintBackground(bg, logo);
      model = new SelfieSegmentation({ locateFile: file => '/poster-pahlawan/mediapipe/' + file });
      model.setOptions({ modelSelection: 1 });
      let result;
      model.onResults(r => { result = r; });
      const subjects = [], skipped = [];
      for (let i = 0; i < people.length; i++) {
        const p = people[i]; status.textContent = `Menyiapkan foto ${i + 1} dari ${people.length}… Mohon tunggu.`;
        await new Promise(resolve => setTimeout(resolve, 0));
        try {
          const path = p.photo_path.split('/').map(encodeURIComponent).join('/');
          const img = await image(root + '/storage/v1/object/public/site-assets/' + path, true);
          const size = Math.min(1, 640 / Math.max(img.width, img.height));
          const input = document.createElement('canvas'); input.width = Math.max(1, Math.round(img.width * size)); input.height = Math.max(1, Math.round(img.height * size));
          input.getContext('2d').drawImage(img, 0, 0, input.width, input.height);
          result = null; await model.send({ image: input });
          const cut = result && extract(result, input);
          if (!cut) { skipped.push(p.person_name); continue; }
          subjects.push(cut);
        } catch (error) { console.error('Foto gagal disiapkan:', p.person_name, error); skipped.push(p.person_name); }
      }
      if (!subjects.length) {
        if (skipped.length) { missing.textContent = `Foto belum dapat diproses: ${skipped.join('; ')}. Periksa sumber fotonya di struktur website.`; missing.hidden = false; }
        throw new Error('Tidak ada foto yang dapat dipisahkan. Coba lagi atau gunakan desain sebelumnya.');
      }
      drawPeople(subjects);
      // Explicitly test whether browser security permits export.
      canvas.toDataURL('image/png');
      download.disabled = false;
      status.textContent = `Poster siap diperiksa: ${subjects.length} dari ${people.length} foto diproses. Tekan Unduh untuk menyimpan PNG.`;
      if (skipped.length) { missing.textContent = `${skipped.length} foto belum dapat diproses: ${skipped.join('; ')}. Periksa sumber fotonya di struktur website.`; missing.hidden = false; }
    } catch (err) {
      console.error(err); status.textContent = 'Poster belum dapat disiapkan: ' + (err.message || 'Periksa koneksi dan coba lagi.'); retry.hidden = false;
    } finally {
      if (model) { try { await model.close(); } catch (_) {} }
      busy = false;
    }
  }
  download.addEventListener('click', () => canvas.toBlob(blob => {
    if (!blob) { status.textContent = 'Gagal membuat PNG. Coba lagi.'; return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'poster-kolosal-hari-pahlawan-gmpi.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }, 'image/png'));
  retry.addEventListener('click', render);
  render();
})();
