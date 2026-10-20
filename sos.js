// GMPI DPD Sidoarjo — Tombol darurat anggota.
// Lokasi dibaca di HP (Geolocation API) lalu dimasukkan ke pesan WhatsApp.
// Tidak ada data yang dikirim/disimpan ke server website.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('sos-form');
  if (!form) return;
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const STORE_KEY = 'gmpi-sos-profile';

  const locBox = $('sos-loc');
  const locTitle = $('sos-loc-title');
  const locDesc = $('sos-loc-desc');
  const locMap = $('sos-loc-map');
  const retryBtn = $('sos-retry');
  const nameIn = $('sos-name');
  const numberIn = $('sos-number');
  const noteIn = $('sos-note');
  const piketBtn = $('sos-send-piket');
  const groupBtn = $('sos-send-group');
  const copyBtn = $('sos-copy');
  const msgEl = $('sos-msg');

  let best = null;       // posisi terbaik {lat, lng, acc, time}
  let watchId = null;
  let stopTimer = 0;
  let piketNumber = '';

  // ---------- Profil tersimpan ----------
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (saved.name) nameIn.value = saved.name;
    if (saved.number) numberIn.value = saved.number;
  } catch (e) { /* abaikan */ }
  function saveProfile() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ name: nameIn.value.trim(), number: numberIn.value.trim().toUpperCase() })); } catch (e) { /* abaikan */ }
  }
  [nameIn, numberIn].forEach(el => el.addEventListener('change', saveProfile));

  // ---------- Lokasi ----------
  const mapsUrl = p => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  function setLoc(state, title, desc) {
    locBox.className = `sos-loc is-${state}`;
    locTitle.textContent = title;
    locDesc.textContent = desc;
  }
  function showBest() {
    if (!best) return;
    const acc = Math.round(best.acc);
    const good = acc <= 50;
    setLoc(good ? 'ok' : 'rough', good ? 'Lokasi didapat ✓' : 'Lokasi kira-kira didapat', `Akurasi ± ${acc} m · ${best.lat.toFixed(5)}, ${best.lng.toFixed(5)}${good ? '' : ' — nyalakan GPS / pindah ke tempat terbuka agar lebih tepat'}`);
    locMap.href = mapsUrl(best);
    locMap.hidden = false;
  }
  function stopWatch() {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    clearTimeout(stopTimer);
  }
  function startLocation() {
    retryBtn.hidden = true;
    if (!('geolocation' in navigator)) {
      setLoc('err', 'HP/browser tidak mendukung lokasi', 'Tulis alamat atau patokan di kolom keterangan.');
      return;
    }
    if (!window.isSecureContext) {
      setLoc('err', 'Lokasi butuh alamat https', 'Buka halaman ini dari alamat resmi website (https).');
      return;
    }
    if (!best) setLoc('wait', 'Mengambil lokasi…', 'Izinkan akses lokasi bila HP meminta.');
    stopWatch();
    watchId = navigator.geolocation.watchPosition(pos => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy || 9999, time: pos.timestamp || Date.now() };
      if (!best || p.acc <= best.acc || Date.now() - best.time > 60000) best = p;
      showBest();
      if (best.acc <= 15) stopWatch();
    }, err => {
      if (best) return;
      const denied = err && err.code === 1;
      setLoc('err', denied ? 'Izin lokasi ditolak' : 'Lokasi belum didapat',
        denied ? 'Buka pengaturan browser → Izin situs → Lokasi → Izinkan, lalu tekan “Coba lagi”. Atau tulis alamat/patokan di keterangan.'
               : 'Nyalakan GPS/lokasi HP lalu tekan “Coba lagi”. Atau tulis alamat/patokan di keterangan.');
      retryBtn.hidden = false;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
    stopTimer = setTimeout(stopWatch, 90000);
  }
  retryBtn.addEventListener('click', startLocation);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!best || Date.now() - best.time > 120000)) startLocation();
  });

  // ---------- Pesan ----------
  function chosenType() {
    const r = form.querySelector('input[name="type"]:checked');
    return r ? r.value : '';
  }
  function buildMessage() {
    const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
    const name = nameIn.value.trim() || '(nama belum diisi)';
    const number = numberIn.value.trim().toUpperCase();
    const note = noteIn.value.trim();
    const lines = [
      '🆘 *DARURAT — SAUDARA GMPI BUTUH BANTUAN*',
      '',
      `*Nama:* ${name}${number ? ` (${number})` : ''}`,
      `*Masalah:* ${chosenType() || 'Belum dipilih'}`
    ];
    if (note) lines.push(`*Keterangan:* ${note}`);
    if (best) {
      lines.push(`📍 *Lokasi:* ${mapsUrl(best)}`);
      lines.push(`(akurasi ± ${Math.round(best.acc)} m)`);
    } else {
      lines.push('📍 *Lokasi:* belum terbaca otomatis — lihat keterangan / minta lokasi terkini.');
    }
    lines.push(`🕒 ${time} WIB`, '', 'Mohon segera dibantu. Setia Bersaudara Sampai Urat Nadi.');
    return lines.join('\n');
  }
  function ready() {
    if (!chosenType()) {
      msgEl.textContent = 'Pilih dulu apa yang terjadi (langkah 1).';
      msgEl.className = 'sos-msg is-err';
      form.querySelector('.sos-types').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    if (!best && !noteIn.value.trim()) {
      const go = window.confirm('Lokasi belum terbaca. Kirim tanpa lokasi? (Sebaiknya tulis alamat/patokan di kolom keterangan.)');
      if (!go) { noteIn.focus(); return false; }
    }
    saveProfile();
    return true;
  }
  function openWa(number) {
    const text = encodeURIComponent(buildMessage());
    const url = number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
    msgEl.textContent = 'WhatsApp dibuka — tekan tombol KIRIM di WhatsApp. Lalu bagikan lokasi terkini (lihat petunjuk di bawah).';
    msgEl.className = 'sos-msg is-ok';
    window.location.href = url;
  }
  piketBtn.addEventListener('click', () => { if (ready()) openWa(piketNumber); });
  groupBtn.addEventListener('click', () => { if (ready()) openWa(''); });
  copyBtn.addEventListener('click', async () => {
    if (!chosenType()) { ready(); return; }
    try {
      await navigator.clipboard.writeText(buildMessage());
      msgEl.textContent = 'Pesan disalin. Tempel di WhatsApp / SMS.';
      msgEl.className = 'sos-msg is-ok';
    } catch (e) {
      window.prompt('Salin pesan ini:', buildMessage());
    }
  });

  form.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => {
    if (msgEl.classList.contains('is-err')) { msgEl.textContent = ''; msgEl.className = 'sos-msg'; }
  }));

  // ---------- Nomor piket dari Admin ----------
  function applyPiket() {
    if (piketNumber) {
      piketBtn.hidden = false;
      groupBtn.textContent = 'Kirim ke grup WA / saudara lain';
    } else {
      piketBtn.hidden = true;
      groupBtn.classList.add('is-primary');
      groupBtn.textContent = '🆘 KIRIM KE GRUP WA / SAUDARA';
    }
  }
  async function loadPiket() {
    if (!config.url || !config.publishableKey) { applyPiket(); return; }
    try {
      const root = config.url.replace(/\/$/, '');
      const res = await fetch(`${root}/rest/v1/site_content?select=key,value&key=in.(sos_whatsapp,shop_whatsapp)`, {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` }
      });
      const rows = res.ok ? await res.json() : [];
      const map = new Map(rows.map(r => [r.key, String(r.value?.text || '')]));
      const pick = [map.get('sos_whatsapp'), map.get('shop_whatsapp')].find(v => /^62\d{8,13}$/.test(v || ''));
      piketNumber = pick || '';
    } catch (e) { piketNumber = ''; }
    applyPiket();
  }

  // ---------- Pasang di HP ----------
  let installEvt = null;
  const installBtn = $('sos-install');
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (installBtn) installBtn.hidden = false; });
  if (installBtn) installBtn.addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); installEvt = null; installBtn.hidden = true; });

  loadPiket();
  startLocation();
})();
