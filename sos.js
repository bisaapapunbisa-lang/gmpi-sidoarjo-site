// GMPI DPD Sidoarjo — Tombol darurat anggota.
// Tahap 1: lokasi dibaca di HP lalu dikirim lewat WhatsApp.
// Tahap 2: permintaan juga dicatat untuk Tim Siaga (panel Admin), lokasi diperbarui otomatis
//          selama halaman terbuka, dan anggota bisa melihat status penanganan.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('sos-form');
  if (!form) return;
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const root = (config.url || '').replace(/\/$/, '');
  const hasDb = Boolean(root && config.publishableKey);
  const STORE_KEY = 'gmpi-sos-profile';
  const ACTIVE_KEY = 'gmpi-sos-active';
  const ACTIVE_HOURS = 3;

  const locBox = $('sos-loc');
  const locTitle = $('sos-loc-title');
  const locDesc = $('sos-loc-desc');
  const locMap = $('sos-loc-map');
  const retryBtn = $('sos-retry');
  const nameIn = $('sos-name');
  const numberIn = $('sos-number');
  const phoneIn = $('sos-phone');
  const noteIn = $('sos-note');
  const piketBtn = $('sos-send-piket');
  const groupBtn = $('sos-send-group');
  const copyBtn = $('sos-copy');
  const msgEl = $('sos-msg');
  const live = $('sos-live');
  const liveTitle = $('sos-live-title');
  const liveDesc = $('sos-live-desc');
  const liveLoc = $('sos-live-loc');
  const safeBtn = $('sos-safe');

  let best = null;       // posisi terbaik {lat, lng, acc, time}
  let watchId = null;
  let stopTimer = 0;
  let piketNumber = '';
  let active = null;     // {id, token, at}
  let lastSent = null;   // posisi terakhir yang dikirim ke Tim Siaga
  let statusTimer = 0;
  let submitting = null;

  // ---------- Profil tersimpan ----------
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (saved.name) nameIn.value = saved.name;
    if (saved.number) numberIn.value = saved.number;
    if (saved.phone && phoneIn) phoneIn.value = saved.phone;
  } catch (e) { /* abaikan */ }
  function saveProfile() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        name: nameIn.value.trim(), number: numberIn.value.trim().toUpperCase(), phone: phoneIn ? phoneIn.value.trim() : ''
      }));
    } catch (e) { /* abaikan */ }
  }
  [nameIn, numberIn, phoneIn].filter(Boolean).forEach(el => el.addEventListener('change', saveProfile));

  // ---------- Supabase RPC ----------
  async function rpc(fn, args, timeoutMs = 6000) {
    if (!hasDb) throw new Error('offline');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${root}/rest/v1/rpc/${fn}`, {
        method: 'POST', signal: ctrl.signal, keepalive: true,
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) { const err = new Error(body?.message || String(res.status)); err.status = res.status; throw err; }
      return body;
    } finally { clearTimeout(t); }
  }

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
      // Saat permintaan aktif, selalu pakai posisi terbaru (orangnya bisa berpindah).
      if (active || !best || p.acc <= best.acc || Date.now() - best.time > 60000) best = p;
      showBest();
      if (active) pushLocation();
      else if (best.acc <= 15) stopWatch();
    }, err => {
      if (best) return;
      const denied = err && err.code === 1;
      setLoc('err', denied ? 'Izin lokasi ditolak' : 'Lokasi belum didapat',
        denied ? 'Buka pengaturan browser → Izin situs → Lokasi → Izinkan, lalu tekan “Coba lagi”. Atau tulis alamat/patokan di keterangan.'
               : 'Nyalakan GPS/lokasi HP lalu tekan “Coba lagi”. Atau tulis alamat/patokan di keterangan.');
      retryBtn.hidden = false;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
    if (!active) stopTimer = setTimeout(stopWatch, 90000);
  }
  retryBtn.addEventListener('click', startLocation);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (active || !best || Date.now() - best.time > 120000) startLocation();
    if (active) pollStatus();
  });

  // ---------- Pesan ----------
  function chosenType() {
    const r = form.querySelector('input[name="type"]:checked');
    return r ? r.value : '';
  }
  form.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => {
    if (msgEl.classList.contains('is-err')) { msgEl.textContent = ''; msgEl.className = 'sos-msg'; }
  }));
  function buildMessage() {
    const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
    const name = nameIn.value.trim() || '(nama belum diisi)';
    const number = numberIn.value.trim().toUpperCase();
    const phone = phoneIn ? phoneIn.value.trim() : '';
    const note = noteIn.value.trim();
    const lines = [
      '🆘 *DARURAT — SAUDARA GMPI BUTUH BANTUAN*',
      '',
      `*Nama:* ${name}${number ? ` (${number})` : ''}`,
      `*Masalah:* ${chosenType() || 'Belum dipilih'}`
    ];
    if (phone) lines.push(`*HP:* ${phone}`);
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

  // ---------- Catat untuk Tim Siaga ----------
  function record() {
    if (!hasDb) return Promise.resolve(null);
    if (active) { pushLocation(true); return Promise.resolve(active); }
    if (submitting) return submitting;
    submitting = rpc('submit_sos', {
      p_name: nameIn.value.trim() || 'Tanpa nama',
      p_member_number: numberIn.value.trim() || null,
      p_phone: phoneIn ? (phoneIn.value.trim() || null) : null,
      p_kind: chosenType(),
      p_note: noteIn.value.trim() || null,
      p_lat: best ? best.lat : null,
      p_lng: best ? best.lng : null,
      p_accuracy: best ? Math.round(best.acc) : null
    }).then(rows => {
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row || !row.id) return null;
      active = { id: row.id, token: row.token, at: Date.now() };
      lastSent = best ? { ...best, sentAt: Date.now() } : null;
      try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(active)); } catch (e) { /* abaikan */ }
      showLive('baru');
      startLocation();
      schedulePoll();
      return active;
    }).catch(err => {
      if (err && err.status === 400 && /sudah tercatat|Terlalu banyak/i.test(err.message)) {
        msgEl.textContent = err.message;
        msgEl.className = 'sos-msg is-err';
      }
      return null;
    }).finally(() => { submitting = null; });
    return submitting;
  }

  function openWa(number) {
    const text = encodeURIComponent(buildMessage());
    const url = number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
    const saving = record(); // mulai mencatat sebelum WhatsApp dibuka
    msgEl.textContent = 'WhatsApp dibuka — tekan tombol KIRIM di WhatsApp. Lalu kembali ke halaman ini agar lokasi terus diperbarui untuk Tim Siaga.';
    msgEl.className = 'sos-msg is-ok';
    let win = null;
    try { win = window.open(url, '_blank'); if (win) win.opener = null; } catch (e) { win = null; }
    if (!win) {
      // Pop-up diblokir: tunggu pencatatan sebentar, lalu buka WhatsApp di tab ini.
      Promise.race([saving, new Promise(r => setTimeout(r, 2500))]).then(() => { window.location.href = url; });
    }
  }
  piketBtn.addEventListener('click', () => { if (ready()) openWa(piketNumber); });
  groupBtn.addEventListener('click', () => { if (ready()) openWa(''); });
  copyBtn.addEventListener('click', async () => {
    if (!chosenType()) { ready(); return; }
    record();
    try {
      await navigator.clipboard.writeText(buildMessage());
      msgEl.textContent = 'Pesan disalin. Tempel di WhatsApp / SMS.';
      msgEl.className = 'sos-msg is-ok';
    } catch (e) {
      window.prompt('Salin pesan ini:', buildMessage());
    }
  });

  // ---------- Lokasi terkini & status untuk anggota ----------
  function distanceM(a, b) {
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  let pushing = false;
  async function pushLocation(force = false) {
    if (!active || !best || pushing) return;
    const now = Date.now();
    if (!force && lastSent) {
      const moved = distanceM(lastSent, best);
      const age = now - lastSent.sentAt;
      if (!(moved > 15 && age > 15000) && age < 60000) return;
    }
    pushing = true;
    try {
      const status = await rpc('update_sos_location', { p_id: active.id, p_token: active.token, p_lat: best.lat, p_lng: best.lng, p_accuracy: Math.round(best.acc) });
      lastSent = { ...best, sentAt: now };
      const time = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }).format(new Date());
      liveLoc.textContent = `Lokasi terkirim ke Tim Siaga pukul ${time} WIB (± ${Math.round(best.acc)} m). Biarkan halaman ini terbuka.`;
      if (status) showLive(status); else if (status === null) checkEnded();
    } catch (e) { /* coba lagi pada pembaruan berikutnya */ }
    finally { pushing = false; }
  }
  const LIVE_TEXT = {
    baru: ['Tercatat untuk Tim Siaga', 'Menunggu Tim Siaga menanggapi… Tetap kirim pesan WhatsApp dan telepon 112 bila nyawa terancam.', ''],
    diterima: ['Tim Siaga sudah menerima', 'Permintaan Anda sedang ditangani. Tetap di tempat aman dan aktifkan HP.', ''],
    menuju: ['Bantuan menuju lokasi Anda', 'Saudara GMPI sedang dalam perjalanan. Biarkan halaman ini terbuka agar lokasi Anda terus terlihat.', 'is-coming'],
    selesai: ['Ditandai selesai', 'Tim Siaga menandai permintaan ini selesai. Semoga Anda selamat.', 'is-ended'],
    palsu: ['Permintaan ditutup', 'Tim Siaga menutup permintaan ini. Bila masih butuh bantuan, kirim permintaan baru.', 'is-ended'],
    dibatalkan: ['Permintaan diakhiri', 'Anda menyatakan sudah aman. Terima kasih.', 'is-ended']
  };
  function showLive(status) {
    const [title, desc, cls] = LIVE_TEXT[status] || LIVE_TEXT.baru;
    live.hidden = false;
    live.className = `sos-live ${cls}`;
    liveTitle.textContent = title;
    liveDesc.textContent = desc;
    const ended = ['selesai', 'palsu', 'dibatalkan'].includes(status);
    safeBtn.hidden = ended;
    if (ended) endActive(false);
  }
  async function pollStatus() {
    if (!active) return;
    try {
      const status = await rpc('sos_status', { p_id: active.id, p_token: active.token });
      if (status) showLive(status); else endActive(true);
    } catch (e) { /* abaikan */ }
  }
  function schedulePoll() {
    clearInterval(statusTimer);
    statusTimer = setInterval(() => { if (document.visibilityState === 'visible') pollStatus(); }, 20000);
  }
  async function checkEnded() { await pollStatus(); }
  function endActive(hide) {
    active = null;
    clearInterval(statusTimer);
    try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* abaikan */ }
    stopWatch();
    if (hide) live.hidden = true;
  }
  safeBtn.addEventListener('click', async () => {
    if (!active) return;
    if (!window.confirm('Akhiri permintaan bantuan? Tim Siaga akan melihat bahwa Anda sudah aman.')) return;
    safeBtn.disabled = true;
    try { await rpc('cancel_sos', { p_id: active.id, p_token: active.token }); } catch (e) { /* tetap akhiri di HP */ }
    safeBtn.disabled = false;
    showLive('dibatalkan');
  });

  // Lanjutkan permintaan yang masih aktif (mis. setelah kembali dari WhatsApp).
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
    if (saved && saved.id && saved.token && Date.now() - saved.at < ACTIVE_HOURS * 3600000) {
      active = saved;
      showLive('baru');
      pollStatus();
      schedulePoll();
    } else if (saved) localStorage.removeItem(ACTIVE_KEY);
  } catch (e) { /* abaikan */ }

  // ---------- Nomor piket dari Admin ----------
  function applyPiket() {
    if (piketNumber) {
      piketBtn.hidden = false;
      groupBtn.classList.remove('is-primary');
      groupBtn.textContent = 'Kirim ke grup WA / saudara lain';
    } else {
      piketBtn.hidden = true;
      groupBtn.classList.add('is-primary');
      groupBtn.textContent = '🆘 KIRIM KE GRUP WA / SAUDARA';
    }
  }
  async function loadPiket() {
    if (!hasDb) { applyPiket(); return; }
    try {
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
