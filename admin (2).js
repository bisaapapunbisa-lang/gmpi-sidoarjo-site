(() => {
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const setupMessage = document.querySelector('#setup-message');
  const globalMessage = document.querySelector('#global-message');
  const loginPanel = document.querySelector('#login-panel');
  const dashboardPanel = document.querySelector('#dashboard-panel');
  const loginForm = document.querySelector('#login-form');
  const workspace = document.querySelector('#admin-workspace');
  const tabsContainer = document.querySelector('#admin-tabs');
  const roleList = document.querySelector('#role-list');
  const CMS_FIELDS = [
    { key: 'hero_lead', label: 'Pengantar hero', help: 'Ringkasan singkat di bagian pembuka situs.' },
    { key: 'voice_intro', label: 'Pengantar Posko Digital', help: 'Teks pembuka formulir pengaduan.' },
    { key: 'gallery_note', label: 'Catatan galeri', help: 'Pastikan keterangan foto sesuai dokumentasi nyata.' },
    { key: 'footer_slogan', label: 'Slogan footer', help: 'Teks slogan di bagian bawah situs.' }
  ];
  const ROLE_LABELS = {
    owner: 'Pemilik / akses penuh',
    content_editor: 'Editor situs',
    lbh_officer: 'Petugas LBH',
    registrar: 'Petugas registrasi (data sensitif)',
    media_partner: 'Mitra media (berita)',
    card_approver: 'Penyetuju kartu anggota',
    siaga: 'Tim Siaga (darurat)'
  };
  const REPORT_STATUSES = ['diterima', 'ditinjau', 'ditindaklanjuti', 'ditutup'];
  const MEMBER_STATUSES = ['menunggu_verifikasi', 'ditinjau', 'diterima', 'ditolak'];
  let client = null;
  let currentUser = null;
  let roles = [];

  function setMessage(text, type = 'ok') {
    globalMessage.textContent = text;
    globalMessage.hidden = !text;
    globalMessage.classList.toggle('is-error', type === 'error');
    globalMessage.classList.toggle('is-warning', type === 'warning');
  }
  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function canSeeReports() { return roles.includes('owner') || roles.includes('lbh_officer'); }
  function canEditContent() { return roles.includes('owner') || roles.includes('content_editor'); }
  function canSeeMembers() { return roles.includes('owner') || roles.includes('registrar'); }
  function isOwner() { return roles.includes('owner'); }
  function canManageNews() { return canEditContent() || roles.includes('media_partner'); }
  function canManageCards() { return roles.includes('owner') || roles.includes('registrar') || roles.includes('card_approver'); }
  function canIssueCards() { return roles.includes('owner') || roles.includes('registrar'); }
  function canApproveCards() { return roles.includes('owner') || roles.includes('card_approver'); }
  function canEditSebaran() { return roles.includes('owner') || roles.includes('content_editor') || roles.includes('registrar'); }
  function canSeeSiaga() { return roles.includes('owner') || roles.includes('siaga'); }
  function canSeeRsvp() { return roles.includes('owner') || roles.includes('content_editor') || roles.includes('registrar') || roles.includes('siaga'); }
  function myEmail() { return String(currentUser?.email || '').toLowerCase(); }

  if (!config.url || !config.publishableKey) {
    setupMessage.textContent = 'Admin belum dikonfigurasi. Pemilik situs perlu mengisi URL dan publishable key Supabase di supabase-config.js, menjalankan migrasi hak akses, lalu mengundang dan memberi peran akun. Jangan pernah menaruh service_role key di file browser.';
    setupMessage.hidden = false;
    loginForm.querySelector('button[type="submit"]').disabled = true;
  } else if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    setupMessage.textContent = 'Library Supabase tidak termuat. Pastikan koneksi internet tersedia, lalu muat ulang halaman.';
    setupMessage.hidden = false;
    loginForm.querySelector('button[type="submit"]').disabled = true;
  } else {
    client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  function showDashboard() {
    loginPanel.hidden = true;
    dashboardPanel.hidden = false;
    document.querySelector('#signed-in-email').textContent = currentUser.email || 'Akun Admin';
    roleList.replaceChildren(...roles.map(role => make('span', 'role-chip', ROLE_LABELS[role] || role)));
    buildTabs();
    startSiagaPolling();
  }

  async function loadAuthorizedUser(user) {
    currentUser = user;
    const email = (user.email || '').toLowerCase();
    const { data, error } = await client
      .from('admin_profiles')
      .select('role,active')
      .eq('email', email)
      .eq('active', true);
    if (error || !data || data.length === 0) {
      await client.auth.signOut();
      currentUser = null;
      roles = [];
      loginPanel.hidden = false;
      dashboardPanel.hidden = true;
      setMessage('Akun berhasil masuk, tetapi belum memiliki peran Admin aktif. Minta pemilik panel mengundang dan menetapkan peran untuk email ini.', 'error');
      return;
    }
    roles = [...new Set(data.map(row => row.role))];
    showDashboard();
    setMessage('Berhasil masuk. Hak akses Anda dibatasi sesuai peran yang diberikan.');
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client) return;
    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('Memeriksa akun…');
    const formData = new FormData(loginForm);
    const { data, error } = await client.auth.signInWithPassword({
      email: String(formData.get('email') || '').trim().toLowerCase(),
      password: String(formData.get('password') || '')
    });
    button.disabled = false;
    if (error || !data.user) {
      setMessage('Tidak bisa masuk. Periksa email/kata sandi dan pastikan akun sudah diundang oleh pemilik Admin.', 'error');
      return;
    }
    await loadAuthorizedUser(data.user);
  });

  async function restoreSession() {
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (!error && data.session?.user) await loadAuthorizedUser(data.session.user);
  }

  document.querySelector('#logout-button').addEventListener('click', async () => {
    stopSiagaPolling();
    if (client) await client.auth.signOut();
    currentUser = null;
    roles = [];
    dashboardPanel.hidden = true;
    loginPanel.hidden = false;
    setMessage('Anda sudah keluar.');
  });

  function buildTabs() {
    const tabs = [];
    if (canEditContent()) tabs.push(['content', 'Isi situs']);
    if (canEditContent()) tabs.push(['shop', 'Toko']);
    if (canSeeSiaga()) tabs.push(['siaga', 'Siaga']);
    if (canEditContent()) tabs.push(['sos', 'Darurat']);
    if (canEditContent()) tabs.push(['struktur', 'Struktur']);
    if (canEditSebaran()) tabs.push(['sebaran', 'Sebaran']);
    if (canSeeRsvp()) tabs.push(['rsvp', 'Kehadiran']);
    if (canManageNews()) tabs.push(['news', 'Berita']);
    if (canSeeReports()) tabs.push(['reports', 'Aduan LBH']);
    if (canSeeMembers()) tabs.push(['members', 'Pendaftaran anggota']);
    if (canManageCards()) tabs.push(['cards', 'Kartu anggota']);
    if (isOwner()) tabs.push(['access', 'Hak akses']);
    tabsContainer.replaceChildren();
    tabs.forEach(([key, label], index) => {
      const button = make('button', `admin-tab${index === 0 ? ' is-active' : ''}`, label);
      button.type = 'button';
      button.dataset.tab = key;
      button.addEventListener('click', () => {
        tabsContainer.querySelectorAll('.admin-tab').forEach(tab => tab.classList.toggle('is-active', tab === button));
        openTab(key);
      });
      tabsContainer.append(button);
    });
    if (tabs.length) openTab(tabs[0][0]);
    else workspace.replaceChildren(make('div', 'table-empty', 'Akun belum memiliki modul yang dapat dibuka. Minta pemilik Admin memeriksa peran Anda.'));
  }

  async function openTab(key) {
    if (key !== 'siaga') siaga.mounted = null;
    workspace.replaceChildren(make('div', 'table-empty', 'Memuat…'));
    if (key === 'content' && canEditContent()) return renderContentEditor();
    if (key === 'shop' && canEditContent()) return renderShop();
    if (key === 'siaga' && canSeeSiaga()) return renderSiaga();
    if (key === 'sos' && canEditContent()) return renderSos();
    if (key === 'struktur' && canEditContent()) return renderStruktur();
    if (key === 'sebaran' && canEditSebaran()) return renderSebaran();
    if (key === 'rsvp' && canSeeRsvp()) return renderRsvp();
    if (key === 'news' && canManageNews()) return renderNews();
    if (key === 'reports' && canSeeReports()) return renderReports();
    if (key === 'members' && canSeeMembers()) return renderMembers();
    if (key === 'cards' && canManageCards()) return renderCards();
    if (key === 'access' && isOwner()) return renderAccessManager();
    workspace.replaceChildren(make('div', 'table-empty', 'Akses tidak diizinkan.'));
  }

  async function renderContentEditor() {
    const { data, error } = await client.from('site_content').select('key,value,updated_at').in('key', CMS_FIELDS.map(field => field.key));
    if (error) return showWorkspaceError('Isi situs tidak bisa dimuat. Pastikan migrasi admin sudah dijalankan.');
    const values = new Map((data || []).map(row => [row.key, row.value?.text || '']));
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Teks situs yang dapat diedit'));
    titleBlock.append(make('p', '', 'Perubahan disimpan ke Supabase dan akan tampil di halaman publik setelah dimuat ulang. Gunakan teks yang telah disetujui DPD.'));
    heading.append(titleBlock);
    const form = make('form', 'content-form');
    CMS_FIELDS.forEach(field => {
      const group = make('div', 'content-field');
      const label = make('label', '', field.label);
      label.htmlFor = `cms-${field.key}`;
      const help = make('small', 'privacy-mini', field.help);
      const textarea = make('textarea');
      textarea.id = `cms-${field.key}`;
      textarea.name = field.key;
      textarea.maxLength = 1200;
      textarea.value = values.get(field.key) || '';
      group.append(label, textarea, help);
      form.append(group);
    });
    const save = make('button', 'admin-button admin-button-gold', 'Simpan perubahan isi situs');
    save.type = 'submit';
    form.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      const updates = CMS_FIELDS.map(field => ({
        key: field.key,
        value: { text: form.elements[field.key].value.trim() },
        updated_at: new Date().toISOString()
      }));
      const { error: saveError } = await client.from('site_content').upsert(updates, { onConflict: 'key' });
      save.disabled = false;
      setMessage(saveError ? 'Perubahan tidak tersimpan. Pastikan migrasi dan peran Editor Situs sudah aktif.' : 'Perubahan tersimpan. Muat ulang beranda untuk melihat hasilnya.', saveError ? 'error' : 'ok');
    });
    const logoSection = await buildLogoManager();
    workspace.replaceChildren(logoSection, heading, form);
  }

  // ---- Toko perlengkapan: pengaturan pembayaran/legalitas + katalog barang ----
  const SHOP_SETTINGS = [
    { key: 'shop_whatsapp', label: 'Nomor WhatsApp penerima pesanan', help: 'Format 62…, contoh 6281234567890 (tanpa +, spasi, atau 0 di depan). Pesanan & bukti bayar dikirim ke nomor ini.', placeholder: '6281234567890' },
    { key: 'shop_bank', label: 'Rekening untuk transfer', help: 'Tampil sebagai alternatif QRIS dan di bagian Legalitas. Hanya rekening atas nama organisasi.', placeholder: 'Bank bjb · 0163336219100 · a.n. GMPI DPD SIDOARJO' },
    { key: 'legal_npwp', label: 'NPWP organisasi', help: 'Kosongkan bila belum ada; kartu NPWP di bagian Legalitas otomatis disembunyikan.', placeholder: '00.000.000.0-000.000' }
  ];
  const PRODUCT_CATEGORIES = ['Seragam', 'Kaos', 'Jaket', 'Atribut', 'Perlengkapan', 'Keanggotaan'];
  const ANGLE_LABELS = ['Depan', 'Samping kiri', 'Samping kanan'];
  const STOCK_LABELS = { tersedia: 'Tersedia', 'pre-order': 'Pre-order', habis: 'Habis' };
  const rupiahAdmin = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

  function productImageUrl(path) {
    return path ? client.storage.from('site-assets').getPublicUrl(path).data.publicUrl : '';
  }

  async function compressProductImage(file, maxSize = 1000) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const max = maxSize;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }

  // ---- Tombol darurat anggota: nomor piket siaga ----
  async function renderSos() {
    const { data: rows, error } = await client.from('site_content').select('key,value').in('key', ['sos_whatsapp', 'shop_whatsapp']);
    if (error) return showWorkspaceError('Pengaturan darurat belum bisa dibuka. Muat ulang halaman.');
    const vals = new Map((rows || []).map(r => [r.key, r.value?.text || '']));
    const ready = vals.has('sos_whatsapp');
    const heading = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', 'Tombol Darurat (SOS)'), make('p', '', 'Anggota menekan tombol SOS di website → memilih masalah → WhatsApp terbuka dengan pesan berisi lokasi persis (link Google Maps). Pesan dikirim ke nomor piket di bawah atau ke grup WA pilihan anggota. Bila migrasi 0010 sudah dijalankan, permintaan juga tercatat di tab “Siaga” untuk Tim Siaga (dihapus otomatis setelah 7 hari).'));
    heading.append(hb);
    const box = make('form', 'content-form shop-settings');
    if (!ready) box.append(make('div', 'admin-message is-error', 'Jalankan migrasi 202610200009_sos_piket.sql di Supabase SQL Editor agar nomor piket bisa disimpan. Sementara ini tombol darurat memakai nomor WhatsApp toko.'));
    const inp = input('sos-whatsapp', 'text', { placeholder: '6281234567890', maxLength: 20 });
    inp.value = vals.get('sos_whatsapp') || '';
    const fallback = vals.get('shop_whatsapp') || '';
    box.append(field('Nomor WhatsApp piket siaga', inp, `Format 62…, contoh 6281234567890. Pilih nomor yang selalu aktif dan dipegang piket bergiliran. Bila dikosongkan, dipakai nomor toko${fallback ? ` (${fallback})` : ''}.`));
    const save = make('button', 'admin-button admin-button-red', 'Simpan nomor piket');
    save.type = 'submit'; save.disabled = !ready;
    const open = make('a', 'admin-link-button', 'Buka halaman darurat ↗');
    open.href = 'darurat.html'; open.target = '_blank'; open.rel = 'noopener';
    const row = make('div', 'card-buttons'); row.append(save, open);
    box.append(row);
    box.addEventListener('submit', async event => {
      event.preventDefault();
      let wa = inp.value.replace(/\D/g, '');
      if (wa.startsWith('0')) wa = '62' + wa.slice(1);
      if (wa && !/^62\d{8,13}$/.test(wa)) { setMessage('Nomor WhatsApp tidak valid. Contoh: 6281234567890.', 'error'); return; }
      inp.value = wa;
      save.disabled = true;
      const { error: e } = await client.from('site_content').upsert({ key: 'sos_whatsapp', value: { text: wa }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      save.disabled = false;
      setMessage(e ? 'Nomor piket tidak tersimpan. Pastikan migrasi 0009 sudah dijalankan.' : (wa ? 'Nomor piket siaga tersimpan. Tombol darurat langsung memakai nomor ini.' : 'Nomor piket dikosongkan — tombol darurat memakai nomor toko.'), e ? 'error' : 'ok');
    });
    const tips = make('div', 'admin-message');
    tips.append(make('b', '', 'Saran pemakaian: '), make('span', '', 'bagikan alamat website/darurat ke grup WA anggota dan minta setiap anggota memasangnya di layar HP (menu ⋮ → Tambahkan ke layar utama). Buat juga grup WA “Siaga GMPI” per DPC agar pesan darurat cepat sampai ke saudara terdekat.'));
    workspace.replaceChildren(heading, box, tips);
  }

  // ================= TIM SIAGA (Tahap 2 darurat) =================
  const SOS_COLS = 'id,created_at,name,member_number,phone,kind,note,lat,lng,accuracy,location_updated_at,member_verified,status,handled_by,handler_note,resolved_at,updated_at';
  const SOS_ACTIVE = ['baru', 'diterima', 'menuju'];
  const SOS_LABEL = { baru: 'BARU — belum ditangani', diterima: 'Diterima', menuju: 'Menuju lokasi', selesai: 'Selesai', palsu: 'Palsu / iseng', dibatalkan: 'Dibatalkan (sudah aman)' };
  const siaga = { alerts: [], known: null, timer: 0, selected: null, filter: 'aktif', ready: true, map: null, layer: null, flash: 0, audio: null, mounted: null, fitted: false };

  function sosAgo(iso) {
    if (!iso) return '-';
    const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s} dtk lalu`;
    if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
    if (s < 86400) return `${Math.floor(s / 3600)} jam ${Math.floor((s % 3600) / 60)} mnt lalu`;
    return `${Math.floor(s / 86400)} hari lalu`;
  }
  function sosTime(iso) {
    return iso ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) + ' WIB' : '-';
  }
  function sosHasLoc(a) { return typeof a.lat === 'number' && typeof a.lng === 'number'; }
  function sosLatLng(a) { return `${a.lat.toFixed(6)},${a.lng.toFixed(6)}`; }

  function siagaBeep() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      siaga.audio = siaga.audio || new Ctx();
      const ctx = siaga.audio;
      if (ctx.state === 'suspended') ctx.resume();
      [0, 0.35, 0.7].forEach(t => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.27);
      });
    } catch (e) { /* abaikan */ }
  }
  const baseTitle = document.title;
  function siagaFlash(on) {
    clearInterval(siaga.flash);
    document.title = baseTitle;
    if (!on) return;
    let t = false;
    siaga.flash = setInterval(() => { t = !t; document.title = t ? '🆘 DARURAT BARU!' : baseTitle; }, 900);
  }
  window.addEventListener('focus', () => { if (siaga.mounted) siagaFlash(false); });
  document.addEventListener('pointerdown', () => { if (siaga.flash) siagaFlash(false); });

  function siagaTabLabel() {
    const tab = tabsContainer.querySelector('[data-tab="siaga"]');
    if (!tab) return;
    const n = siaga.alerts.filter(a => a.status === 'baru').length;
    tab.textContent = n ? `🆘 Siaga (${n} baru)` : 'Siaga';
    tab.classList.toggle('is-alert', n > 0);
  }

  async function siagaFetch() {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await client.from('sos_alerts').select(SOS_COLS).gte('created_at', since).order('created_at', { ascending: false }).limit(300);
    if (error) { siaga.ready = false; return false; }
    siaga.ready = true;
    const fresh = (data || []).filter(a => a.status === 'baru' && siaga.known && !siaga.known.has(a.id));
    siaga.known = new Set((data || []).map(a => a.id));
    siaga.alerts = data || [];
    if (fresh.length) {
      siagaBeep();
      siagaFlash(true);
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const a = fresh[0];
          const n = new Notification('🆘 DARURAT — Saudara GMPI butuh bantuan', { body: `${a.name}: ${a.kind}${a.note ? ' — ' + a.note : ''}`, tag: 'gmpi-sos-' + a.id, requireInteraction: true });
          n.onclick = () => { window.focus(); const t = tabsContainer.querySelector('[data-tab="siaga"]'); if (t) t.click(); siaga.selected = a.id; n.close(); };
        } catch (e) { /* abaikan */ }
      }
      if (!siaga.selected) siaga.selected = fresh[0].id;
    }
    siagaTabLabel();
    return true;
  }
  function startSiagaPolling() {
    stopSiagaPolling();
    if (!canSeeSiaga()) return;
    siagaFetch();
    siaga.timer = setInterval(async () => {
      await siagaFetch();
      if (siaga.mounted && siaga.mounted.isConnected) siaga.refresh();
    }, 15000);
  }
  function stopSiagaPolling() {
    clearInterval(siaga.timer); siaga.timer = 0; siaga.known = null; siaga.alerts = []; siaga.mounted = null; siaga.selected = null; siaga.fitted = false;
    siagaFlash(false);
  }

  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(true);
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise(resolve => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
      document.head.append(css);
      const s = document.createElement('script');
      s.src = 'vendor/leaflet/leaflet.js';
      s.onload = () => resolve(Boolean(window.L));
      s.onerror = () => resolve(false);
      document.head.append(s);
      setTimeout(() => resolve(Boolean(window.L)), 8000);
    });
    return leafletLoading;
  }

  async function renderSiaga() {
    client.rpc('purge_old_sos').then(() => {}, () => {});
    await siagaFetch();
    siagaFlash(false);
    const rootEl = make('div', 'siaga');
    const heading = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', 'Tim Siaga — permintaan darurat'), make('p', '', 'Permintaan dari tombol DARURAT anggota muncul di sini otomatis (diperbarui tiap 15 detik). Lokasi anggota ikut bergerak selama HP-nya membuka halaman darurat. Data dihapus otomatis setelah 7 hari. Jangan sebarkan lokasi/nomor anggota di luar penanganan.'));
    heading.append(hb);
    const bell = make('button', 'admin-button admin-button-gold siaga-bell', '🔔 Aktifkan bunyi & notifikasi');
    bell.type = 'button';
    const bellState = () => {
      const granted = 'Notification' in window && Notification.permission === 'granted';
      bell.textContent = granted ? '🔔 Notifikasi aktif — tes bunyi' : '🔔 Aktifkan bunyi & notifikasi';
    };
    bellState();
    bell.addEventListener('click', async () => {
      siagaBeep();
      if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) { /* abaikan */ } }
      bellState();
      setMessage('Bunyi aktif. Biarkan halaman Admin ini terbuka (boleh di tab lain) agar peringatan darurat terdengar.');
    });
    heading.append(bell);
    rootEl.append(heading);

    if (!siaga.ready) {
      rootEl.append(make('div', 'admin-message is-error', 'Data darurat belum bisa dibuka. Jalankan migrasi 202610200010_sos_alerts.sql di Supabase SQL Editor, lalu pastikan akun Anda punya peran “Tim Siaga (darurat)” atau Pemilik.'));
      workspace.replaceChildren(rootEl);
      return;
    }

    const filters = make('div', 'news-admin-filters');
    const mapBox = make('div', 'siaga-map');
    const mapNote = make('p', 'privacy-mini siaga-map-note', 'Titik merah = belum ditangani · kuning = sedang ditangani · abu-abu = selesai. Klik titik untuk membuka detail.');
    const detail = make('div', 'siaga-detail');
    const list = make('div', 'siaga-list');
    rootEl.append(filters, mapBox, mapNote, detail, list);
    workspace.replaceChildren(rootEl);
    siaga.mounted = rootEl;
    siaga.map = null; siaga.layer = null; siaga.fitted = false;

    const visible = () => siaga.filter === 'aktif' ? siaga.alerts.filter(a => SOS_ACTIVE.includes(a.status)) : siaga.alerts;
    const sorted = arr => [...arr].sort((a, b) => {
      const ra = SOS_ACTIVE.includes(a.status) ? (a.status === 'baru' ? 0 : 1) : 2;
      const rb = SOS_ACTIVE.includes(b.status) ? (b.status === 'baru' ? 0 : 1) : 2;
      return ra - rb || new Date(b.created_at) - new Date(a.created_at);
    });

    function renderFilters() {
      const nActive = siaga.alerts.filter(a => SOS_ACTIVE.includes(a.status)).length;
      filters.replaceChildren(...[['aktif', `Perlu ditangani (${nActive})`], ['semua', `Semua 7 hari (${siaga.alerts.length})`]].map(([k, label]) => {
        const b = make('button', `admin-tab${siaga.filter === k ? ' is-active' : ''}${k === 'aktif' && nActive ? ' is-alert' : ''}`, label);
        b.type = 'button';
        b.addEventListener('click', () => { siaga.filter = k; siaga.fitted = false; refresh(); });
        return b;
      }));
    }

    async function setStatus(a, status, btn) {
      if (status === 'palsu' && !window.confirm('Tandai sebagai palsu / iseng?')) return;
      if (btn) btn.disabled = true;
      const { error } = await client.from('sos_alerts').update({ status }).eq('id', a.id);
      if (btn) btn.disabled = false;
      if (error) return setMessage('Status tidak tersimpan. Periksa koneksi atau peran Anda.', 'error');
      setMessage(`Status diperbarui: ${SOS_LABEL[status]}.${status === 'diterima' || status === 'menuju' ? ' Anggota melihat status ini di HP-nya.' : ''}`);
      await siagaFetch();
      refresh();
    }

    function statusButtons(a) {
      const row = make('div', 'siaga-actions');
      const add = (label, status, cls) => {
        const b = make('button', `admin-button ${cls}`, label); b.type = 'button';
        b.addEventListener('click', e => { e.stopPropagation(); setStatus(a, status, b); });
        row.append(b);
      };
      if (a.status === 'baru') add('✓ Terima', 'diterima', 'admin-button-red');
      if (a.status === 'baru' || a.status === 'diterima') add('🚗 Menuju lokasi', 'menuju', 'admin-button-gold');
      if (SOS_ACTIVE.includes(a.status)) { add('Selesai', 'selesai', 'admin-button-outline'); add('Palsu', 'palsu', 'admin-button-outline'); }
      return row;
    }
    function contactButtons(a) {
      const row = make('div', 'siaga-contact');
      if (a.phone) {
        const tel = make('a', 'siaga-link', `📞 Telepon ${a.phone}`); tel.href = `tel:+${a.phone}`;
        const wa = make('a', 'siaga-link', '💬 WhatsApp');
        wa.href = `https://wa.me/${a.phone}?text=${encodeURIComponent(`Assalamualaikum/salam, saya dari Tim Siaga GMPI DPD Sidoarjo. Permintaan darurat Anda (${a.kind}) sudah kami terima. Bagaimana kondisi Anda sekarang?`)}`;
        wa.target = '_blank'; wa.rel = 'noopener';
        row.append(tel, wa);
      }
      if (sosHasLoc(a)) {
        const g = make('a', 'siaga-link', '📍 Google Maps'); g.href = `https://www.google.com/maps/search/?api=1&query=${sosLatLng(a)}`; g.target = '_blank'; g.rel = 'noopener';
        const r = make('a', 'siaga-link is-strong', '🧭 Rute ke lokasi'); r.href = `https://www.google.com/maps/dir/?api=1&destination=${sosLatLng(a)}&travelmode=driving`; r.target = '_blank'; r.rel = 'noopener';
        row.append(r, g);
      }
      return row;
    }
    function badges(a) {
      const wrap = make('div', 'siaga-badges');
      wrap.append(make('span', `siaga-state is-${a.status}`, SOS_LABEL[a.status] || a.status));
      wrap.append(make('span', `siaga-verified${a.member_verified ? ' is-yes' : ''}`, a.member_verified ? '✓ Anggota terverifikasi' : 'Belum terverifikasi'));
      return wrap;
    }

    let detailKey = '';
    function renderDetail() {
      const a = siaga.alerts.find(x => x.id === siaga.selected);
      if (!a) { detail.replaceChildren(); detail.hidden = true; detailKey = ''; return; }
      const key = `${a.id}|${a.updated_at}|${a.location_updated_at}`;
      if (key === detailKey) { const ago = detail.querySelector('.siaga-ago'); if (ago) ago.textContent = sosAgo(a.created_at); return; }
      if (detail.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return; // jangan ganggu yang sedang mengetik
      detailKey = key;
      detail.hidden = false;
      const top = make('div', 'siaga-detail-top');
      const info = make('div', 'siaga-detail-info');
      const title = make('h4', '', `${a.name}${a.member_number ? ' · ' + a.member_number : ''}`);
      info.append(badges(a), title, make('p', 'siaga-kind', a.kind));
      if (a.note) info.append(make('p', 'siaga-note', `“${a.note}”`));
      const meta = make('p', 'siaga-meta');
      meta.append(make('span', '', `Masuk ${sosTime(a.created_at)} · `), make('span', 'siaga-ago', sosAgo(a.created_at)));
      info.append(meta);
      if (sosHasLoc(a)) info.append(make('p', 'siaga-meta', `Lokasi ± ${Math.round(a.accuracy || 0)} m · diperbarui ${sosAgo(a.location_updated_at || a.created_at)}`));
      else info.append(make('div', 'admin-message is-warning', 'Lokasi tidak terbaca otomatis. Hubungi anggota lewat telepon/WA dan minta “Bagikan lokasi terkini”.'));
      if (a.handled_by) info.append(make('p', 'siaga-meta', `Ditangani: ${a.handled_by}${a.resolved_at ? ' · ditutup ' + sosTime(a.resolved_at) : ''}`));
      info.append(contactButtons(a), statusButtons(a));
      const noteForm = make('form', 'siaga-note-form');
      const ta = make('textarea'); ta.maxLength = 300; ta.rows = 2; ta.placeholder = 'Catatan penanganan (siapa berangkat, kondisi, tindak lanjut)…'; ta.value = a.handler_note || '';
      const sv = make('button', 'admin-button admin-button-outline', 'Simpan catatan'); sv.type = 'submit';
      noteForm.append(ta, sv);
      noteForm.addEventListener('submit', async e => {
        e.preventDefault(); sv.disabled = true;
        const { error } = await client.from('sos_alerts').update({ handler_note: ta.value.trim() || null }).eq('id', a.id);
        sv.disabled = false; ta.blur();
        setMessage(error ? 'Catatan tidak tersimpan.' : 'Catatan penanganan tersimpan.', error ? 'error' : 'ok');
        if (!error) { await siagaFetch(); refresh(); }
      });
      info.append(noteForm);
      if (isOwner()) {
        const del = make('button', 'admin-link-button siaga-del', 'Hapus permanen'); del.type = 'button';
        del.addEventListener('click', async () => {
          if (!window.confirm('Hapus permintaan ini permanen?')) return;
          const { error } = await client.from('sos_alerts').delete().eq('id', a.id);
          if (error) return setMessage('Gagal menghapus.', 'error');
          siaga.selected = null; await siagaFetch(); refresh();
        });
        info.append(del);
      }
      top.append(info);
      if (sosHasLoc(a)) {
        const frame = make('iframe', 'siaga-gmap');
        frame.title = `Lokasi ${a.name} di Google Maps`;
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer-when-downgrade';
        frame.src = `https://maps.google.com/maps?q=${sosLatLng(a)}&z=17&output=embed`;
        top.append(frame);
      }
      detail.replaceChildren(top);
    }

    function renderList() {
      const rows = sorted(visible());
      if (!rows.length) {
        list.replaceChildren(make('div', 'table-empty', siaga.filter === 'aktif' ? 'Tidak ada permintaan darurat yang perlu ditangani. Alhamdulillah, semua aman. Biarkan halaman ini terbuka agar peringatan baru terdengar.' : 'Belum ada permintaan darurat dalam 7 hari terakhir.'));
        return;
      }
      list.replaceChildren(...rows.map(a => {
        const item = make('div', `siaga-row is-${a.status}${a.id === siaga.selected ? ' is-selected' : ''}`);
        item.tabIndex = 0;
        const main = make('div', 'siaga-row-main');
        main.append(badges(a), make('b', '', `${a.name}${a.member_number ? ' · ' + a.member_number : ''}`), make('span', 'siaga-kind', `${a.kind}${a.note ? ' — ' + a.note : ''}`));
        const side = make('div', 'siaga-row-side');
        side.append(make('span', '', sosAgo(a.created_at)), make('small', '', sosHasLoc(a) ? `📍 ± ${Math.round(a.accuracy || 0)} m` : '📍 tanpa lokasi'));
        item.append(main, side);
        const pick = () => { siaga.selected = a.id; refresh(); detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        item.addEventListener('click', pick);
        item.addEventListener('keydown', e => { if (e.key === 'Enter') pick(); });
        return item;
      }));
    }

    async function renderMap() {
      const ok = await loadLeaflet();
      if (!rootEl.isConnected) return;
      if (!ok) { mapBox.classList.add('is-off'); mapBox.textContent = 'Peta tidak dapat dimuat (periksa koneksi). Gunakan tombol Google Maps / Rute pada tiap permintaan.'; return; }
      const L = window.L;
      if (!siaga.map) {
        siaga.map = L.map(mapBox, { scrollWheelZoom: false }).setView([-7.45, 112.7], 11); // Sidoarjo
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(siaga.map);
        siaga.layer = L.layerGroup().addTo(siaga.map);
      }
      siaga.layer.clearLayers();
      const pts = [];
      visible().filter(sosHasLoc).forEach(a => {
        const color = a.status === 'baru' ? '#e51c24' : SOS_ACTIVE.includes(a.status) ? '#e0a92b' : '#8f897f';
        const m = L.circleMarker([a.lat, a.lng], { radius: a.id === siaga.selected ? 12 : 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 });
        if (a.accuracy && SOS_ACTIVE.includes(a.status)) L.circle([a.lat, a.lng], { radius: Math.min(a.accuracy, 2000), color, weight: 1, fillOpacity: 0.08 }).addTo(siaga.layer);
        m.bindTooltip(`${a.name} — ${a.kind}`);
        m.on('click', () => { siaga.selected = a.id; refresh(); });
        m.addTo(siaga.layer);
        pts.push([a.lat, a.lng]);
      });
      const sel = siaga.alerts.find(x => x.id === siaga.selected && sosHasLoc(x));
      if (!siaga.fitted && pts.length) {
        if (pts.length === 1) siaga.map.setView(pts[0], 15); else siaga.map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
        siaga.fitted = true;
      } else if (sel && siaga.lastPanned !== sel.id) siaga.map.panTo([sel.lat, sel.lng]);
      siaga.lastPanned = sel ? sel.id : null;
      setTimeout(() => siaga.map && siaga.map.invalidateSize(), 50);
    }

    function refresh() {
      if (!rootEl.isConnected) return;
      siagaTabLabel();
      renderFilters();
      renderDetail();
      renderList();
      renderMap();
    }
    siaga.refresh = refresh;
    if (!siaga.selected) { const first = sorted(visible())[0]; if (first) siaga.selected = first.id; }
    refresh();
  }

  // ================= STRUKTUR ORGANISASI =================
  async function renderStruktur() {
    const heading = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', 'Struktur organisasi DPD'), make('p', '', 'Isi nama dan foto pengurus. Bagan langsung tampil di beranda (bagian "Struktur organisasi"). Susunan mengikuti AD/ART Pasal 9: Dewan Penasihat & Pembina, Ketua, satu Wakil Ketua, Sekretaris, Ketua Harian, Humas, Bendahara (tanpa wakil), dan Departemen. Kosongkan nama bila belum ditetapkan — tampil "Segera diisi".'));
    heading.append(hb);
    const { data, error } = await client.from('org_structure').select('id,section,jabatan,department,person_name,photo_path,sort_order').order('sort_order', { ascending: true });
    if (error) {
      workspace.replaceChildren(heading, make('div', 'admin-message is-error', 'Struktur belum bisa dibuka. Jalankan migrasi 202610200013_struktur_organisasi.sql di Supabase SQL Editor, lalu muat ulang halaman.'));
      return;
    }
    let rows = (data || []).map(r => ({ ...r }));
    const removed = [];
    const photoUrl = path => client.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
    const SECTIONS = [
      ['penasihat', 'Dewan Penasihat'], ['pembina', 'Dewan Pembina'], ['ketua', 'Ketua'], ['wakil_ketua', 'Wakil Ketua'],
      ['sekretaris', 'Sekretaris'], ['ketua_harian', 'Ketua Harian'], ['humas', 'Humas'], ['bendahara', 'Bendahara'],
      ['departemen', 'Departemen (dipimpin Wakil Ketua Departemen)']
    ];
    const layout = make('div', 'org-admin');
    const formEl = make('form', 'org-admin-form');
    const preview = make('div', 'org-admin-preview');
    const previewHost = make('div');
    preview.append(make('b', '', 'Pratinjau bagan di beranda'), previewHost);
    let timer = 0;
    const refreshPreview = () => { clearTimeout(timer); timer = setTimeout(() => window.GMPIStruktur && window.GMPIStruktur.render(previewHost, rows, photoUrl), 150); };

    function rowEditor(r) {
      const line = make('div', 'org-admin-row');
      const thumb = make('div', 'org-admin-thumb');
      const paintThumb = () => {
        thumb.replaceChildren();
        if (r.photo_path) { const img = new Image(); img.src = photoUrl(r.photo_path); img.alt = ''; thumb.append(img); }
        else thumb.textContent = 'FOTO';
      };
      paintThumb();
      const tools = make('div', 'org-admin-phototools');
      const pick = make('label', 'file-button', r.photo_path ? 'Ganti foto' : 'Unggah foto');
      const file = make('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true;
      pick.append(file);
      const clear = make('button', 'shop-photo-clear', 'Hapus foto'); clear.type = 'button'; clear.hidden = !r.photo_path;
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0]; if (!f) return;
        thumb.classList.add('is-loading');
        try {
          r.photo_path = await uploadImage(f, 'pengurus', 600);
          paintThumb(); clear.hidden = false; pick.firstChild.textContent = 'Ganti foto';
          setMessage('Foto terunggah. Tekan "Simpan struktur" agar tampil di beranda.', 'warning');
          refreshPreview();
        } catch (e) { setMessage('Foto gagal diunggah: ' + (e.message || 'periksa koneksi/ukuran file (maks. 15 MB).'), 'error'); }
        thumb.classList.remove('is-loading'); file.value = '';
      });
      clear.addEventListener('click', () => { r.photo_path = null; paintThumb(); clear.hidden = true; pick.firstChild.textContent = 'Unggah foto'; refreshPreview(); });
      tools.append(pick, clear);
      const fields = make('div', 'org-admin-fields');
      if (r.section === 'departemen') {
        const dep = make('input'); dep.maxLength = 80; dep.placeholder = 'Nama departemen, mis. Hukum & Advokasi'; dep.value = r.department || '';
        dep.setAttribute('aria-label', 'Nama departemen');
        dep.addEventListener('input', () => { r.department = dep.value; refreshPreview(); });
        fields.append(dep);
      }
      const jab = make('input'); jab.maxLength = 80; jab.value = r.jabatan; jab.setAttribute('aria-label', 'Jabatan'); jab.className = 'org-admin-jabatan';
      jab.addEventListener('input', () => { r.jabatan = jab.value; refreshPreview(); });
      const nm = make('input'); nm.maxLength = 120; nm.placeholder = 'Nama lengkap (kosong = "Segera diisi")'; nm.value = r.person_name || '';
      nm.setAttribute('aria-label', `Nama ${r.jabatan}`);
      nm.addEventListener('input', () => { r.person_name = nm.value; refreshPreview(); });
      fields.append(jab, nm);
      line.append(thumb, fields, tools);
      if (r.section === 'departemen') {
        const del = make('button', 'admin-link-button org-admin-del', 'Hapus departemen'); del.type = 'button';
        del.addEventListener('click', () => {
          if (!window.confirm('Hapus departemen ini dari bagan?')) return;
          if (r.id) removed.push(r.id);
          rows = rows.filter(x => x !== r); build(); refreshPreview();
        });
        tools.append(del);
      }
      return line;
    }

    const groupsHost = make('div', 'org-admin-groups');
    function build() {
      groupsHost.replaceChildren(...SECTIONS.map(([key, label]) => {
        const fs = make('fieldset', 'org-admin-group');
        fs.append(make('legend', '', label));
        rows.filter(r => r.section === key).forEach(r => fs.append(rowEditor(r)));
        if (key === 'departemen') {
          const add = make('button', 'admin-button admin-button-outline', '＋ Tambah departemen'); add.type = 'button';
          add.addEventListener('click', () => {
            const maxSort = rows.reduce((m, x) => Math.max(m, x.sort_order || 0), 90);
            rows.push({ section: 'departemen', jabatan: 'Wakil Ketua Departemen', department: '', person_name: '', photo_path: null, sort_order: maxSort + 1 });
            build(); refreshPreview();
            const last = groupsHost.querySelector('.org-admin-group:last-child .org-admin-row:last-of-type input'); if (last) last.focus();
          });
          fs.append(add);
        }
        return fs;
      }));
    }
    build();
    const save = make('button', 'admin-button admin-button-red', 'Simpan struktur'); save.type = 'submit';
    const view = make('a', 'admin-link-button', 'Lihat di beranda ↗'); view.href = 'index.html#struktur'; view.target = '_blank'; view.rel = 'noopener';
    const btnRow = make('div', 'card-buttons org-admin-actions'); btnRow.append(save, view);
    formEl.append(groupsHost, btnRow);
    formEl.addEventListener('submit', async event => {
      event.preventDefault();
      const bad = rows.find(r => (r.jabatan || '').trim().length < 2 || (r.section === 'departemen' && !(r.department || '').trim()));
      if (bad) { setMessage(bad.section === 'departemen' ? 'Isi nama setiap departemen (atau hapus departemen yang kosong).' : 'Jabatan tidak boleh kosong.', 'error'); return; }
      const pick = r => ({ section: r.section, jabatan: r.jabatan.trim(), department: r.section === 'departemen' ? (r.department || '').trim() : null, person_name: (r.person_name || '').trim() || null, photo_path: r.photo_path || null, sort_order: r.sort_order || 0 });
      save.disabled = true;
      const existing = rows.filter(r => r.id).map(r => ({ id: r.id, ...pick(r) }));
      const fresh = rows.filter(r => !r.id).map(pick);
      const results = [];
      if (existing.length) results.push(await client.from('org_structure').upsert(existing, { onConflict: 'id' }));
      if (fresh.length) results.push(await client.from('org_structure').insert(fresh));
      if (removed.length) results.push(await client.from('org_structure').delete().in('id', removed));
      save.disabled = false;
      const err = results.find(r => r.error);
      if (err) { setMessage('Struktur tidak tersimpan. Pastikan peran Anda Pemilik/Editor situs dan migrasi 0013 sudah dijalankan.', 'error'); return; }
      setMessage('Struktur organisasi tersimpan dan langsung tampil di beranda.');
      renderStruktur();
    });
    layout.append(formEl, preview);
    workspace.replaceChildren(heading, layout);
    refreshPreview();
  }

  // ================= SEBARAN ANGGOTA (Tahap 3) =================
  async function renderSebaran() {
    const heading = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', 'Sebaran anggota per kecamatan'), make('p', '', 'Angka ini tampil di beranda (peta 18 kecamatan). Isi jumlah anggota sebenarnya per kecamatan. Bila kolom dikosongkan, website memakai jumlah Kartu Anggota AKTIF di kecamatan itu. Hanya angka yang tampil — tanpa nama atau data pribadi.'));
    heading.append(hb);
    const [{ data: dist, error: e1 }, { data: manual, error: e2 }] = await Promise.all([
      client.rpc('member_distribution'),
      client.from('district_members').select('district,manual_count,updated_at,updated_by')
    ]);
    if (e1 || e2) {
      workspace.replaceChildren(heading, make('div', 'admin-message is-error', 'Data sebaran belum bisa dibuka. Jalankan migrasi 202610200011_sebaran_anggota.sql di Supabase SQL Editor, lalu muat ulang halaman.'));
      return;
    }
    const names = (window.GMPISebaran && window.GMPISebaran.names) || (dist || []).map(r => r.district);
    const cards = new Map((dist || []).map(r => [r.district, r.card_count || 0]));
    const man = new Map((manual || []).map(r => [r.district, r]));
    const fmt = n => new Intl.NumberFormat('id-ID').format(n || 0);
    const body = make('div', 'sebaran-admin');
    const form = make('form', 'sebaran-admin-form');
    const { wrap, body: tbody } = makeTable(['Kecamatan', 'Kartu aktif (otomatis)', 'Jumlah anggota (isi manual)', 'Tampil di website']);
    const inputs = new Map();
    const shown = new Map();
    [...names].sort((a, b) => a.localeCompare(b)).forEach(name => {
      const tr = make('tr');
      tr.append(make('td', 'mono-cell', name), make('td', '', fmt(cards.get(name))));
      const td = make('td');
      const inp = make('input'); inp.type = 'number'; inp.min = '0'; inp.max = '1000000'; inp.step = '1'; inp.inputMode = 'numeric';
      inp.placeholder = `kosong = ${cards.get(name) || 0}`;
      const m = man.get(name);
      inp.value = m && m.manual_count !== null && m.manual_count !== undefined ? m.manual_count : '';
      inp.setAttribute('aria-label', `Jumlah anggota ${name}`);
      td.append(inp);
      if (m && m.updated_by) td.append(make('small', 'card-note', `Diubah ${m.updated_by} · ${new Date(m.updated_at).toLocaleDateString('id-ID')}`));
      const out = make('td', 'sebaran-admin-out');
      tr.append(td, out);
      tbody.append(tr);
      inputs.set(name, inp); shown.set(name, out);
    });
    const totalLine = make('div', 'admin-message');
    const preview = make('div', 'sebaran-admin-preview');
    const previewMap = make('div');
    preview.append(make('b', '', 'Pratinjau peta di beranda'), previewMap);
    function value(name) {
      const raw = inputs.get(name).value.trim();
      return raw === '' ? (cards.get(name) || 0) : Math.max(0, Math.floor(Number(raw) || 0));
    }
    function update() {
      let total = 0, reached = 0;
      const rows = names.map(name => { const v = value(name); total += v; if (v) reached++; shown.get(name).textContent = fmt(v) + (inputs.get(name).value.trim() === '' ? ' (otomatis)' : ''); return { district: name, total: v }; });
      totalLine.textContent = `Total tampil di website: ${fmt(total)} anggota · ${reached}/18 kecamatan terjangkau.`;
      if (window.GMPISebaran) window.GMPISebaran.draw(previewMap, rows);
    }
    inputs.forEach(inp => inp.addEventListener('input', update));
    const save = make('button', 'admin-button admin-button-red', 'Simpan angka sebaran'); save.type = 'submit';
    const view = make('a', 'admin-link-button', 'Lihat di beranda ↗'); view.href = 'index.html#sebaran'; view.target = '_blank'; view.rel = 'noopener';
    const row = make('div', 'card-buttons'); row.append(save, view);
    form.append(wrap, totalLine, row);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = names.map(name => {
        const raw = inputs.get(name).value.trim();
        return { district: name, manual_count: raw === '' ? null : Math.max(0, Math.floor(Number(raw) || 0)) };
      });
      save.disabled = true;
      const { error } = await client.from('district_members').upsert(payload, { onConflict: 'district' });
      save.disabled = false;
      setMessage(error ? 'Angka sebaran tidak tersimpan. Pastikan peran Anda Pemilik, Editor situs, atau Petugas registrasi.' : 'Angka sebaran tersimpan dan langsung tampil di beranda.', error ? 'error' : 'ok');
    });
    body.append(form, preview);
    workspace.replaceChildren(heading, body);
    update();
  }

  async function renderShop() {
    const [{ data: settingRows, error: settingError }, { data: productRows, error: productError }] = await Promise.all([
      client.from('site_content').select('key,value').in('key', SHOP_SETTINGS.map(s => s.key)),
      client.from('shop_products').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    ]);
    if (settingError || productError) return showWorkspaceError('Toko belum aktif. Jalankan migrasi 202610200005_shop_legal.sql di Supabase (SQL Editor) terlebih dahulu.');
    const values = new Map((settingRows || []).map(r => [r.key, r.value?.text || '']));
    let products = productRows || [];

    // Pengaturan
    const settingsHead = make('div', 'workspace-heading');
    const sh = make('div');
    sh.append(make('h3', '', 'Pembayaran & legalitas'), make('p', '', 'QRIS resmi GMPI DPD SIDOARJO (NMID ID1026605146624) sudah terpasang di situs. Isi nomor WhatsApp pengurus agar pembeli bisa mengirim pesanan.'));
    settingsHead.append(sh);
    const settingsForm = make('form', 'content-form shop-settings');
    SHOP_SETTINGS.forEach(s => {
      const inp = input(`shop-${s.key}`, 'text', { placeholder: s.placeholder, maxLength: 120 });
      inp.name = s.key;
      inp.value = values.get(s.key) || '';
      settingsForm.append(field(s.label, inp, s.help));
    });
    const saveSettings = make('button', 'admin-button admin-button-gold', 'Simpan pengaturan');
    saveSettings.type = 'submit';
    settingsForm.append(saveSettings);
    settingsForm.addEventListener('submit', async event => {
      event.preventDefault();
      let wa = settingsForm.elements.shop_whatsapp.value.replace(/\D/g, '');
      if (wa.startsWith('0')) wa = '62' + wa.slice(1);
      if (wa && !/^62\d{8,13}$/.test(wa)) { setMessage('Nomor WhatsApp tidak valid. Contoh: 6281234567890.', 'error'); return; }
      settingsForm.elements.shop_whatsapp.value = wa;
      saveSettings.disabled = true;
      const now = new Date().toISOString();
      const updates = SHOP_SETTINGS.map(s => ({ key: s.key, value: { text: settingsForm.elements[s.key].value.trim() }, updated_at: now }));
      const { error } = await client.from('site_content').upsert(updates, { onConflict: 'key' });
      saveSettings.disabled = false;
      setMessage(error ? 'Pengaturan toko tidak tersimpan. Pastikan migrasi 0005 sudah dijalankan.' : 'Pengaturan toko tersimpan.', error ? 'error' : 'ok');
    });

    // Katalog
    const listHead = make('div', 'workspace-heading');
    const lh = make('div');
    lh.append(make('h3', '', 'Katalog barang'), make('p', '', 'Barang tampil di situs bila “Tampilkan di situs” dicentang. Barang berharga 0 tetap tampil dengan tulisan “Harga segera diumumkan”. Isi harga agar bisa dipesan & dibayar via QRIS.'));
    const addButton = make('button', 'admin-button admin-button-gold', '+ Tambah barang');
    addButton.type = 'button';
    listHead.append(lh, addButton);
    const list = make('div', 'shop-admin-list');
    const editorSlot = make('div');

    function renderList() {
      if (!products.length) { list.replaceChildren(make('div', 'table-empty', 'Belum ada barang. Klik “Tambah barang”.')); return; }
      list.replaceChildren(...products.map(p => {
        const row = make('div', `shop-admin-row${p.is_active ? '' : ' is-draft'}`);
        const thumb = make('div', 'shop-admin-thumb');
        const mainPhoto = (Array.isArray(p.images) && p.images.find(Boolean)) || p.image_path;
        if (mainPhoto) { const im = make('img'); im.src = productImageUrl(mainPhoto); im.alt = ''; thumb.append(im); }
        else thumb.textContent = 'FOTO';
        const info = make('div', 'shop-admin-info');
        info.append(make('b', '', p.name));
        const photoCount = Array.isArray(p.images) && p.images.some(Boolean) ? p.images.filter(Boolean).length : (p.image_path ? 1 : 0);
        info.append(make('small', '', `${p.category} · ${rupiahAdmin(p.price)} · ${STOCK_LABELS[p.stock_status]}${p.sizes?.length ? ` · ${p.sizes.join('/')}` : ''} · ${photoCount}/3 foto`));
        const state = make('span', `shop-admin-state${p.is_active ? ' is-on' : ''}`, p.is_active ? (p.price > 0 ? 'Tampil' : 'Tampil · harga menyusul') : 'Disembunyikan');
        const edit = make('button', 'admin-button admin-button-outline', 'Ubah');
        edit.type = 'button';
        edit.addEventListener('click', () => openEditor(p));
        row.append(thumb, info, state, edit);
        return row;
      }));
    }

    function openEditor(product) {
      const isNew = !product;
      const p = product || { name: '', category: 'Atribut', description: '', price: 0, sizes: [], image_path: null, images: [], stock_status: 'tersedia', is_active: false, sort_order: (products.length + 1) * 10 };
      const box = make('form', 'admin-card shop-editor content-form');
      box.append(make('h4', 'shop-editor-title', isNew ? 'Barang baru' : `Ubah: ${p.name}`));
      const nameIn = input('sp-name', 'text', { required: true, maxLength: 80, value: p.name });
      const catIn = make('select'); catIn.id = 'sp-cat';
      [...new Set([...PRODUCT_CATEGORIES, p.category])].forEach(c => catIn.append(new Option(c, c, false, c === p.category)));
      const priceIn = input('sp-price', 'number', { min: 0, max: 100000000, step: 500, value: p.price, required: true });
      const stockIn = make('select'); stockIn.id = 'sp-stock';
      Object.entries(STOCK_LABELS).forEach(([v, l]) => stockIn.append(new Option(l, v, false, v === p.stock_status)));
      const sizesIn = input('sp-sizes', 'text', { maxLength: 80, value: (p.sizes || []).join(', '), placeholder: 'S, M, L, XL, XXL' });
      const descIn = make('textarea'); descIn.id = 'sp-desc'; descIn.maxLength = 600; descIn.value = p.description || '';
      const orderIn = input('sp-order', 'number', { min: 0, max: 9999, value: p.sort_order });
      const activeWrap = make('label', 'shop-admin-check');
      const activeIn = make('input'); activeIn.type = 'checkbox'; activeIn.checked = p.is_active;
      activeWrap.append(activeIn, document.createTextNode(' Tampilkan di situs'));

      // Tiga sudut foto: [depan, samping kiri, samping kanan]
      const slots = ['', '', ''];
      if (Array.isArray(p.images) && p.images.length) p.images.slice(0, 3).forEach((v, i) => { slots[i] = v || ''; });
      else if (p.image_path) slots[0] = p.image_path;
      const imgTools = make('div', 'shop-photo-slots');
      const imgNote = make('small', 'privacy-mini', 'Unggah hingga 3 foto: depan, samping kiri, samping kanan. Foto persegi berlatar polos paling rapi; otomatis diperkecil ke maks. 1000 px.');
      ANGLE_LABELS.forEach((labelText, i) => {
        const slot = make('div', 'shop-photo-slot');
        const prev = make('div', 'shop-admin-thumb shop-admin-thumb-lg');
        const cap = make('b', '', labelText);
        const pick = make('label', 'file-button', 'Pilih foto');
        const fileIn = make('input'); fileIn.type = 'file'; fileIn.accept = 'image/png,image/jpeg,image/webp'; fileIn.hidden = true;
        fileIn.setAttribute('aria-label', `Foto ${labelText}`);
        pick.append(fileIn);
        const clear = make('button', 'shop-photo-clear', 'Hapus'); clear.type = 'button';
        const render = () => {
          prev.replaceChildren();
          if (slots[i]) { const im = make('img'); im.src = productImageUrl(slots[i]); im.alt = labelText; prev.append(im); }
          else prev.textContent = 'Belum ada foto';
          pick.firstChild.nodeValue = slots[i] ? 'Ganti foto' : 'Pilih foto';
          clear.hidden = !slots[i];
        };
        fileIn.addEventListener('change', async () => {
          const file = fileIn.files && fileIn.files[0];
          fileIn.value = '';
          if (!file) return;
          if (file.size > 15 * 1024 * 1024) { imgNote.textContent = 'File terlalu besar (maks. 15 MB).'; return; }
          imgNote.textContent = `Mengunggah foto ${labelText.toLowerCase()}…`;
          prev.classList.add('is-loading');
          try {
            const blob = await compressProductImage(file);
            const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
            const { error } = await client.storage.from('site-assets').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
            if (error) throw error;
            slots[i] = path; render();
            imgNote.textContent = `Foto ${labelText.toLowerCase()} terunggah. Klik “Simpan barang” untuk memakainya.`;
          } catch (e) {
            imgNote.textContent = 'Foto gagal diunggah. Pastikan migrasi 0005 sudah dijalankan.';
          } finally { prev.classList.remove('is-loading'); }
        });
        clear.addEventListener('click', () => { slots[i] = ''; render(); imgNote.textContent = 'Foto dilepas. Klik “Simpan barang” untuk menyimpan perubahan.'; });
        render();
        slot.append(prev, cap, pick, clear);
        imgTools.append(slot);
      });

      const rowA = make('div', 'card-form-row'); rowA.append(field('Kategori', catIn), field('Harga (Rp)', priceIn, 'Isi angka saja, contoh 150000.'));
      const rowB = make('div', 'card-form-row'); rowB.append(field('Status stok', stockIn), field('Urutan tampil', orderIn, 'Angka kecil tampil lebih dulu.'));
      box.append(field('Nama barang', nameIn), rowA, rowB, field('Ukuran (pisahkan dengan koma)', sizesIn, 'Kosongkan bila barang tidak berukuran.'), field('Deskripsi singkat', descIn), field('Foto barang (3 sudut)', imgTools, null), imgNote, activeWrap);

      const actions = make('div', 'shop-editor-actions');
      const save = make('button', 'admin-button admin-button-gold', 'Simpan barang'); save.type = 'submit';
      const cancel = make('button', 'admin-button admin-button-outline', 'Batal'); cancel.type = 'button';
      actions.append(save, cancel);
      if (!isNew) {
        const del = make('button', 'admin-button admin-button-red', 'Hapus barang'); del.type = 'button';
        del.addEventListener('click', async () => {
          if (!window.confirm(`Hapus “${p.name}” dari katalog?`)) return;
          const { error } = await client.from('shop_products').delete().eq('id', p.id);
          if (error) { setMessage('Barang gagal dihapus.', 'error'); return; }
          products = products.filter(x => x.id !== p.id);
          editorSlot.replaceChildren(); renderList(); setMessage('Barang dihapus.');
        });
        actions.append(del);
      }
      box.append(actions);
      cancel.addEventListener('click', () => editorSlot.replaceChildren());
      box.addEventListener('submit', async event => {
        event.preventDefault();
        if (!box.reportValidity()) return;
        const sizes = sizesIn.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);
        const payload = {
          name: nameIn.value.trim(), category: catIn.value, description: descIn.value.trim(),
          price: Math.max(0, Math.round(Number(priceIn.value) || 0)), sizes, images: slots.some(Boolean) ? slots.slice() : [], image_path: slots.find(Boolean) || null,
          stock_status: stockIn.value, is_active: activeIn.checked, sort_order: Math.round(Number(orderIn.value) || 0),
          updated_at: new Date().toISOString()
        };
                save.disabled = true;
        const query = isNew ? client.from('shop_products').insert(payload).select().single() : client.from('shop_products').update(payload).eq('id', p.id).select().single();
        const { data, error } = await query;
        save.disabled = false;
        if (error) { setMessage('Barang tidak tersimpan. Periksa isian dan peran Editor Situs.', 'error'); return; }
        if (isNew) products.push(data); else products = products.map(x => x.id === data.id ? data : x);
        products.sort((a, b) => a.sort_order - b.sort_order);
        editorSlot.replaceChildren(); renderList();
        setMessage(`“${data.name}” tersimpan.${data.is_active ? ' Muat ulang beranda untuk melihatnya.' : ' (masih draf)'}`);
      });
      editorSlot.replaceChildren(box);
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameIn.focus({ preventScroll: true });
    }

    addButton.addEventListener('click', () => openEditor(null));
    renderList();
    workspace.replaceChildren(settingsHead, settingsForm, listHead, editorSlot, list);
  }

  // ---- Berita media mitra ----
  const NEWS_STATUS = { draft: 'Draf', review: 'Menunggu persetujuan', published: 'Tayang', hidden: 'Disembunyikan pengurus' };
  const fmtDateAdmin = iso => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  function assetUrlAdmin(path) { return path ? client.storage.from('site-assets').getPublicUrl(path).data.publicUrl : ''; }

  async function uploadImage(file, folder, max) {
    if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran file lebih dari 15 MB.');
    const blob = await compressProductImage(file, max);
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await client.storage.from('site-assets').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return path;
  }

  async function renderNews() {
    const editor = canEditContent();
    const email = (currentUser?.email || '').toLowerCase();
    const [{ data: partnerRows, error: pErr }, memberRes] = await Promise.all([
      client.from('media_partners').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
      editor ? client.from('media_partner_members').select('email,partner_id') : client.from('media_partner_members').select('email,partner_id').eq('email', email)
    ]);
    if (pErr || memberRes.error) return showWorkspaceError('Kolom berita belum aktif. Jalankan migrasi 202610200006_media_news.sql di Supabase (SQL Editor) terlebih dahulu.');
    const allPartners = partnerRows || [];
    const members = memberRes.data || [];
    const myPartnerIds = new Set(members.filter(m => m.email === email).map(m => m.partner_id));
    const partners = editor ? allPartners : allPartners.filter(p => myPartnerIds.has(p.id) && p.is_active);
    const partnerName = id => (id ? (allPartners.find(p => p.id === id)?.name || 'Media') : 'Redaksi GMPI Sidoarjo');

    if (!editor && !partners.length) {
      return workspace.replaceChildren(make('div', 'admin-message is-warning', 'Akun Anda belum dihubungkan ke media mitra mana pun, atau medianya sedang dinonaktifkan. Hubungi pengurus GMPI Sidoarjo.'));
    }

    let query = client.from('news_posts').select('id,partner_id,title,summary,body,cover_path,source_url,status,published_at,created_by,updated_at').order('updated_at', { ascending: false }).limit(200);
    if (!editor) query = query.in('partner_id', [...myPartnerIds]);
    const { data: postRows, error: nErr } = await query;
    if (nErr) return showWorkspaceError('Daftar berita tidak dapat dimuat.');
    let posts = postRows || [];

    const heading = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', editor ? 'Berita' : `Berita ${partners.map(p => p.name).join(', ')}`),
      make('p', '', editor
        ? 'Kelola semua berita dari media mitra. Berita berstatus “Menunggu persetujuan” perlu Anda terbitkan. Pengurus dapat menyembunyikan berita apa pun.'
        : 'Tulis dan kelola berita media Anda. Berita yang diterbitkan tampil di kolom “Berita” website GMPI Sidoarjo.'));
    const newBtn = make('button', 'admin-button admin-button-gold', '+ Tulis berita');
    newBtn.type = 'button';
    heading.append(hb, newBtn);

    const filterBar = make('div', 'news-admin-filters');
    let statusFilter = '';
    const editorSlot = make('div');
    const list = make('div', 'news-admin-list');

    function renderFilterBar() {
      const counts = posts.reduce((a, p) => { a[p.status] = (a[p.status] || 0) + 1; return a; }, {});
      const opts = [['', `Semua (${posts.length})`], ...Object.entries(NEWS_STATUS).filter(([k]) => counts[k]).map(([k, l]) => [k, `${l} (${counts[k]})`])];
      filterBar.replaceChildren(...opts.map(([k, l]) => {
        const b = make('button', `admin-tab${statusFilter === k ? ' is-active' : ''}${k === 'review' ? ' is-alert' : ''}`, l);
        b.type = 'button';
        b.addEventListener('click', () => { statusFilter = k; renderFilterBar(); renderList(); });
        return b;
      }));
    }

    function renderList() {
      const rows = posts.filter(p => !statusFilter || p.status === statusFilter);
      if (!rows.length) { list.replaceChildren(make('div', 'table-empty', posts.length ? 'Tidak ada berita dengan status ini.' : 'Belum ada berita. Klik “Tulis berita”.')); return; }
      list.replaceChildren(...rows.map(p => {
        const row = make('div', `news-admin-row is-${p.status}`);
        const thumb = make('div', 'shop-admin-thumb news-admin-thumb');
        if (p.cover_path) { const im = make('img'); im.src = assetUrlAdmin(p.cover_path); im.alt = ''; thumb.append(im); } else thumb.textContent = 'TANPA FOTO';
        const info = make('div', 'shop-admin-info');
        info.append(make('b', '', p.title));
        info.append(make('small', '', `${partnerName(p.partner_id)} · ${p.status === 'published' ? `tayang ${fmtDateAdmin(p.published_at)}` : `diubah ${fmtDateAdmin(p.updated_at)}`}${editor && p.created_by ? ` · ${p.created_by}` : ''}`));
        const state = make('span', `news-state is-${p.status}`, NEWS_STATUS[p.status]);
        const actions = make('div', 'news-admin-actions');
        const edit = make('button', 'admin-button admin-button-outline', p.status === 'hidden' && !editor ? 'Lihat' : 'Ubah');
        edit.type = 'button';
        edit.addEventListener('click', () => openEditor(p));
        actions.append(edit);
        if (editor && p.status === 'review') {
          const ok = make('button', 'admin-button admin-button-gold', 'Terbitkan'); ok.type = 'button';
          ok.addEventListener('click', () => quickStatus(p, 'published'));
          actions.append(ok);
        }
        if (p.status === 'published') {
          const view = make('a', 'admin-link-button', 'Lihat ↗'); view.href = `index.html#berita/${p.id}`; view.target = '_blank'; view.rel = 'noopener';
          actions.append(view);
        }
        row.append(thumb, info, state, actions);
        return row;
      }));
    }

    async function quickStatus(p, status) {
      const { data, error } = await client.from('news_posts').update({ status }).eq('id', p.id).select().single();
      if (error) return setMessage(`Status gagal diubah: ${error.message || ''}`, 'error');
      posts = posts.map(x => (x.id === data.id ? data : x));
      renderFilterBar(); renderList();
      setMessage(`“${data.title}” sekarang: ${NEWS_STATUS[data.status]}.`);
    }

    function openEditor(post) {
      const isNew = !post;
      const p = post || { partner_id: partners[0]?.id || null, title: '', summary: '', body: '', cover_path: null, source_url: '', status: 'draft' };
      const locked = !editor && p.status === 'hidden';
      const box = make('form', 'admin-card shop-editor content-form news-editor');
      box.noValidate = true;
      box.append(make('h4', 'shop-editor-title', isNew ? 'Tulis berita baru' : (locked ? 'Berita disembunyikan pengurus' : 'Ubah berita')));
      if (locked) box.append(make('div', 'admin-message is-warning', 'Berita ini disembunyikan oleh pengurus GMPI Sidoarjo sehingga tidak dapat diubah. Hubungi pengurus bila ada pertanyaan.'));

      const partnerSel = make('select'); partnerSel.id = 'nw-partner';
      if (editor) partnerSel.append(new Option('Redaksi GMPI Sidoarjo (tanpa media)', ''));
      partners.forEach(m => partnerSel.append(new Option(`${m.name}${m.is_active ? '' : ' (nonaktif)'}`, m.id)));
      partnerSel.value = p.partner_id || '';
      partnerSel.disabled = !isNew && !editor;
      const titleIn = input('nw-title', 'text', { maxLength: 160, value: p.title, required: true, placeholder: 'Judul berita' });
      const summaryIn = make('textarea'); summaryIn.id = 'nw-summary'; summaryIn.maxLength = 400; summaryIn.rows = 3; summaryIn.value = p.summary || ''; summaryIn.placeholder = 'Ringkasan 1–2 kalimat yang tampil di kartu berita.';
      const bodyIn = make('textarea'); bodyIn.id = 'nw-body'; bodyIn.maxLength = 20000; bodyIn.rows = 14; bodyIn.value = p.body || ''; bodyIn.placeholder = 'Isi berita. Pisahkan paragraf dengan satu baris kosong.';
      const srcIn = input('nw-src', 'text', { maxLength: 500, value: p.source_url || '', placeholder: 'https://namamedia.com/berita/...' });

      let coverPath = p.cover_path;
      const coverPrev = make('div', 'shop-admin-thumb news-cover-prev');
      const coverPick = make('label', 'file-button', 'Pilih foto sampul');
      const coverIn = make('input'); coverIn.type = 'file'; coverIn.accept = 'image/png,image/jpeg,image/webp'; coverIn.hidden = true;
      coverPick.append(coverIn);
      const coverClear = make('button', 'shop-photo-clear', 'Hapus foto'); coverClear.type = 'button';
      const coverNote = make('small', 'privacy-mini', 'Foto mendatar (16:9) paling bagus. Otomatis diperkecil.');
      const renderCover = () => {
        coverPrev.replaceChildren();
        if (coverPath) { const im = make('img'); im.src = assetUrlAdmin(coverPath); im.alt = ''; coverPrev.append(im); } else coverPrev.textContent = 'Belum ada foto';
        coverClear.hidden = !coverPath;
      };
      renderCover();
      coverIn.addEventListener('change', async () => {
        const file = coverIn.files && coverIn.files[0]; coverIn.value = '';
        if (!file) return;
        coverNote.textContent = 'Mengunggah foto…'; coverPrev.classList.add('is-loading');
        try { coverPath = await uploadImage(file, 'news', 1600); renderCover(); coverNote.textContent = 'Foto terunggah. Jangan lupa simpan berita.'; }
        catch (e) { coverNote.textContent = `Foto gagal diunggah. ${e.message || ''}`; }
        finally { coverPrev.classList.remove('is-loading'); }
      });
      coverClear.addEventListener('click', () => { coverPath = null; renderCover(); });
      const coverTools = make('div', 'shop-admin-imgtools');
      const coverSide = make('div', 'news-cover-side'); coverSide.append(coverPick, coverClear, coverNote);
      coverTools.append(coverPrev, coverSide);

      const counter = make('small', 'privacy-mini', '');
      const updCount = () => { counter.textContent = `${bodyIn.value.length.toLocaleString('id-ID')} / 20.000 karakter`; };
      bodyIn.addEventListener('input', updCount); updCount();

      box.append(
        field('Media', partnerSel, editor ? 'Pilih media penulis berita. “Redaksi GMPI Sidoarjo” untuk berita dari pengurus sendiri.' : null),
        field('Judul', titleIn),
        field('Ringkasan', summaryIn),
        field('Isi berita', bodyIn), counter,
        field('Foto sampul', coverTools),
        field('Tautan berita asli (opsional)', srcIn, 'Bila berita juga tayang di situs media Anda, tempel tautannya. Pembaca akan melihat tombol “Baca di …”.')
      );
      if (locked) box.querySelectorAll('input,textarea,select,button,label.file-button').forEach(n => { n.disabled = true; n.style.pointerEvents = 'none'; });

      const actions = make('div', 'shop-editor-actions');
      const selectedPartner = () => allPartners.find(m => m.id === partnerSel.value);
      const needsReview = () => !editor && !!selectedPartner()?.requires_review;
      const draftBtn = make('button', 'admin-button admin-button-outline', 'Simpan draf'); draftBtn.type = 'button';
      const pubBtn = make('button', 'admin-button admin-button-gold', ''); pubBtn.type = 'button';
      const refreshPubLabel = () => { pubBtn.textContent = needsReview() ? 'Kirim untuk ditinjau' : (p.status === 'published' ? 'Simpan & tetap tayang' : 'Terbitkan'); };
      refreshPubLabel();
      partnerSel.addEventListener('change', refreshPubLabel);
      const cancel = make('button', 'admin-button admin-button-outline', 'Tutup'); cancel.type = 'button';
      cancel.addEventListener('click', () => editorSlot.replaceChildren());
      if (!locked) actions.append(pubBtn, draftBtn);
      actions.append(cancel);
      if (!isNew && editor) {
        const hideBtn = make('button', 'admin-button admin-button-outline', p.status === 'hidden' ? 'Tampilkan lagi (tayang)' : 'Sembunyikan'); hideBtn.type = 'button';
        hideBtn.addEventListener('click', async () => { await save(p.status === 'hidden' ? 'published' : 'hidden'); });
        actions.append(hideBtn);
      }
      if (!isNew && !locked) {
        const del = make('button', 'admin-button admin-button-red', 'Hapus'); del.type = 'button';
        del.addEventListener('click', async () => {
          if (!window.confirm(`Hapus berita “${p.title}”? Tindakan ini tidak bisa dibatalkan.`)) return;
          const { error } = await client.from('news_posts').delete().eq('id', p.id);
          if (error) return setMessage('Berita gagal dihapus.', 'error');
          posts = posts.filter(x => x.id !== p.id);
          editorSlot.replaceChildren(); renderFilterBar(); renderList(); setMessage('Berita dihapus.');
        });
        actions.append(del);
      }
      box.append(actions);

      async function save(status) {
        const title = titleIn.value.trim();
        if (title.length < 5) { titleIn.focus(); return setMessage('Judul minimal 5 karakter.', 'error'); }
        let src = srcIn.value.trim();
        if (src && !/^https?:\/\//i.test(src)) src = `https://${src}`;
        if (src && !/^https?:\/\/[^\s]{3,500}$/.test(src)) { srcIn.focus(); return setMessage('Tautan berita tidak valid.', 'error'); }
        if (status === 'published' && !bodyIn.value.trim() && !src) { bodyIn.focus(); return setMessage('Isi berita masih kosong. Tulis isi berita atau tempel tautan berita asli.', 'error'); }
        const payload = {
          title, summary: summaryIn.value.trim(), body: bodyIn.value.replace(/\r/g, '').trim(),
          cover_path: coverPath || null, source_url: src || null, status
        };
        if (isNew || editor) payload.partner_id = partnerSel.value || null;
        [pubBtn, draftBtn].forEach(b => { b.disabled = true; });
        const q = isNew ? client.from('news_posts').insert(payload).select().single() : client.from('news_posts').update(payload).eq('id', p.id).select().single();
        const { data, error } = await q;
        [pubBtn, draftBtn].forEach(b => { b.disabled = false; });
        if (error) return setMessage(`Berita tidak tersimpan. ${error.message || ''}`, 'error');
        if (isNew) posts.unshift(data); else posts = posts.map(x => (x.id === data.id ? data : x));
        editorSlot.replaceChildren(); renderFilterBar(); renderList();
        const msg = { draft: 'disimpan sebagai draf', review: 'dikirim dan menunggu persetujuan pengurus', published: 'tayang di website', hidden: 'disembunyikan dari website' }[data.status];
        setMessage(`“${data.title}” ${msg}.`);
      }
      pubBtn.addEventListener('click', () => save('published'));
      draftBtn.addEventListener('click', () => save('draft'));

      editorSlot.replaceChildren(box);
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    newBtn.addEventListener('click', () => openEditor(null));
    renderFilterBar(); renderList();
    const nodes = [heading, filterBar, editorSlot, list];
    if (editor) nodes.push(await buildPartnerManager(allPartners, members));
    workspace.replaceChildren(...nodes);
  }

  async function buildPartnerManager(partners, members) {
    const owner = isOwner();
    const section = make('section', 'news-partner-manager');
    const head = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', 'Media mitra & akun redaksi'),
      make('p', '', owner
        ? 'Tambahkan media yang bekerja sama, lalu hubungkan email redaksinya. Akun media hanya bisa mengelola berita medianya sendiri. Undang email tersebut lebih dulu di Supabase → Authentication → Users → Invite user.'
        : 'Daftar media mitra. Hanya Pemilik yang dapat menambah atau mencabut akun redaksi media.'));
    head.append(hb);
    section.append(head);

    // Tambah media
    const addForm = make('form', 'admin-inline-form news-partner-add');
    const nameIn = input('mp-name', 'text', { maxLength: 80, required: true, placeholder: 'Nama media, contoh: Sidoarjo Terkini' });
    const webIn = input('mp-web', 'text', { maxLength: 300, placeholder: 'https://situsmedia.com (opsional)' });
    const addBtn = make('button', 'admin-button admin-button-gold', '+ Tambah media'); addBtn.type = 'submit';
    const l1 = make('label', '', 'Nama media'); l1.append(nameIn);
    const l2 = make('label', '', 'Situs web'); l2.append(webIn);
    addForm.append(l1, l2, addBtn);
    addForm.addEventListener('submit', async e => {
      e.preventDefault();
      const name = nameIn.value.trim();
      if (name.length < 2) return;
      let web = webIn.value.trim(); if (web && !/^https?:\/\//i.test(web)) web = `https://${web}`;
      addBtn.disabled = true;
      const { error } = await client.from('media_partners').insert({ name, website_url: web || null, sort_order: (partners.length + 1) * 10 });
      addBtn.disabled = false;
      if (error) return setMessage(`Media gagal ditambahkan. ${error.message || ''}`, 'error');
      setMessage(`Media “${name}” ditambahkan.`); renderNews();
    });
    section.append(addForm);

    if (!partners.length) { section.append(make('div', 'table-empty', 'Belum ada media mitra.')); return section; }
    const grid = make('div', 'news-partner-list');
    partners.forEach(mp => {
      const cardEl = make('div', `news-partner-card${mp.is_active ? '' : ' is-off'}`);
      const top = make('div', 'news-partner-top');
      const logo = make('div', 'shop-admin-thumb news-partner-logo');
      const renderLogo = () => { logo.replaceChildren(); if (mp.logo_path) { const im = make('img'); im.src = assetUrlAdmin(mp.logo_path); im.alt = ''; logo.append(im); } else logo.textContent = 'LOGO'; };
      renderLogo();
      const info = make('div', 'shop-admin-info');
      info.append(make('b', '', mp.name), make('small', '', mp.website_url || 'Tanpa situs web'));
      top.append(logo, info);

      const opts = make('div', 'news-partner-opts');
      const mkCheck = (labelText, checked, onChange) => {
        const l = make('label', 'shop-admin-check'); const c = make('input'); c.type = 'checkbox'; c.checked = checked;
        c.addEventListener('change', () => onChange(c)); l.append(c, document.createTextNode(` ${labelText}`)); return l;
      };
      const upd = async (patch, c) => {
        const { error } = await client.from('media_partners').update(patch).eq('id', mp.id);
        if (error) { c.checked = !c.checked; return setMessage('Pengaturan media gagal disimpan.', 'error'); }
        Object.assign(mp, patch); cardEl.classList.toggle('is-off', !mp.is_active); setMessage(`Pengaturan “${mp.name}” disimpan.`);
      };
      opts.append(
        mkCheck('Aktif (berita tampil di website)', mp.is_active, c => upd({ is_active: c.checked }, c)),
        mkCheck('Berita perlu persetujuan pengurus', mp.requires_review, c => upd({ requires_review: c.checked }, c))
      );
      const logoPick = make('label', 'file-button', mp.logo_path ? 'Ganti logo' : 'Unggah logo');
      const logoIn = make('input'); logoIn.type = 'file'; logoIn.accept = 'image/png,image/jpeg,image/webp'; logoIn.hidden = true; logoPick.append(logoIn);
      logoIn.addEventListener('change', async () => {
        const file = logoIn.files && logoIn.files[0]; logoIn.value = ''; if (!file) return;
        try {
          const path = await uploadImage(file, 'media', 600);
          const { error } = await client.from('media_partners').update({ logo_path: path }).eq('id', mp.id);
          if (error) throw error;
          mp.logo_path = path; renderLogo(); setMessage(`Logo “${mp.name}” diperbarui.`);
        } catch (e) { setMessage(`Logo gagal diunggah. ${e.message || ''}`, 'error'); }
      });
      opts.append(logoPick);

      // Akun redaksi
      const accounts = make('div', 'news-partner-accounts');
      accounts.append(make('b', 'news-acc-title', 'Akun redaksi'));
      const mine = members.filter(m => m.partner_id === mp.id);
      if (!mine.length) accounts.append(make('small', 'privacy-mini', 'Belum ada akun.'));
      mine.forEach(m => {
        const row = make('div', 'news-acc-row');
        row.append(make('span', '', m.email));
        if (owner) {
          const rm = make('button', 'admin-link-button', 'Cabut'); rm.type = 'button';
          rm.addEventListener('click', async () => {
            if (!window.confirm(`Cabut akses ${m.email} dari ${mp.name}?`)) return;
            const { error } = await client.from('media_partner_members').delete().eq('email', m.email).eq('partner_id', mp.id);
            if (error) return setMessage('Akses gagal dicabut.', 'error');
            if (!members.some(x => x.email === m.email && x.partner_id !== mp.id)) {
              await client.from('admin_profiles').delete().eq('email', m.email).eq('role', 'media_partner');
            }
            setMessage(`Akses ${m.email} dicabut.`); renderNews();
          });
          row.append(rm);
        }
        accounts.append(row);
      });
      if (owner) {
        const f = make('form', 'news-acc-add');
        const em = input(`mp-email-${mp.id}`, 'email', { placeholder: 'email redaksi', required: true });
        const b = make('button', 'admin-button admin-button-outline', 'Hubungkan'); b.type = 'submit';
        f.append(em, b);
        f.addEventListener('submit', async e => {
          e.preventDefault();
          const mail = em.value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setMessage('Email tidak valid.', 'error');
          b.disabled = true;
          const { error: e1 } = await client.from('admin_profiles').upsert({ email: mail, role: 'media_partner', active: true }, { onConflict: 'email,role' });
          const { error: e2 } = e1 ? { error: e1 } : await client.from('media_partner_members').upsert({ email: mail, partner_id: mp.id }, { onConflict: 'email,partner_id' });
          b.disabled = false;
          if (e2) return setMessage(`Akun gagal dihubungkan. ${e2.message || ''}`, 'error');
          setMessage(`${mail} terhubung ke ${mp.name}. Pastikan email ini sudah diundang di Supabase → Authentication → Users → Invite user.`);
          renderNews();
        });
        accounts.append(f);
      }

      cardEl.append(top, opts, accounts);
      if (owner) {
        const del = make('button', 'admin-link-button news-partner-del', 'Hapus media'); del.type = 'button';
        del.addEventListener('click', async () => {
          if (!window.confirm(`Hapus media “${mp.name}”? SEMUA berita dari media ini juga ikut terhapus. Untuk sementara, lebih aman hapus centang “Aktif”.`)) return;
          const emails = mine.map(m => m.email);
          const { error } = await client.from('media_partners').delete().eq('id', mp.id);
          if (error) return setMessage('Media gagal dihapus.', 'error');
          for (const mail of emails) {
            if (!members.some(x => x.email === mail && x.partner_id !== mp.id)) await client.from('admin_profiles').delete().eq('email', mail).eq('role', 'media_partner');
          }
          setMessage(`Media “${mp.name}” dihapus.`); renderNews();
        });
        cardEl.append(del);
      }
      grid.append(cardEl);
    });
    section.append(grid);
    return section;
  }

  // ---- Logo situs: unggah, pilih dari riwayat, kembalikan bawaan ----
  const LOGO_BUCKET = 'site-assets';
  const LOGO_FOLDER = 'logos';
  const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  const DEFAULT_LOGO = 'assets/logo-gmpi-sidoarjo.webp';

  function logoPublicUrl(path) {
    return client.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function readImageSize(file) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight, url }); };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function setActiveLogo(path) {
    const { error } = await client.from('site_content').upsert({
      key: 'site_logo',
      value: { text: path },
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
    return error;
  }

  async function buildLogoManager() {
    const section = make('section', 'logo-manager');
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Logo situs'));
    titleBlock.append(make('p', '', 'Logo ini dipakai di header, lingkaran hero (dengan ring berputar), dan footer. Gunakan gambar persegi dengan lambang di tengah. Format PNG, JPG, atau WebP, maksimal 2 MB.'));
    heading.append(titleBlock);
    section.append(heading);

    const { data: logoRow, error: logoError } = await client.from('site_content').select('value').eq('key', 'site_logo').maybeSingle();
    if (logoError) {
      section.append(make('div', 'admin-message is-error', 'Pengaturan logo belum aktif. Jalankan migrasi 202610200003_site_logo.sql di Supabase terlebih dahulu.'));
      return section;
    }
    let activePath = logoRow?.value?.text || '';

    const current = make('div', 'logo-current');
    const currentFrame = make('div', 'logo-frame');
    const currentImg = make('img');
    currentImg.alt = 'Logo yang sedang dipakai';
    currentFrame.append(currentImg);
    const currentInfo = make('div', 'logo-current-info');
    const currentLabel = make('b');
    const resetButton = make('button', 'admin-button admin-button-outline', 'Kembalikan logo bawaan');
    resetButton.type = 'button';
    currentInfo.append(make('span', 'admin-kicker', 'SEDANG DIPAKAI'), currentLabel, resetButton);
    current.append(currentFrame, currentInfo);

    const upload = make('form', 'logo-upload');
    const fileLabel = make('label', 'file-button', 'Pilih gambar logo baru');
    const fileInput = make('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png,image/jpeg,image/webp';
    fileInput.className = 'sr-only';
    fileLabel.append(fileInput);
    const previewFrame = make('div', 'logo-frame logo-frame-preview');
    previewFrame.hidden = true;
    const previewImg = make('img');
    previewImg.alt = 'Pratinjau logo baru';
    previewFrame.append(previewImg);
    const uploadNote = make('small', 'privacy-mini', 'Belum ada file dipilih.');
    const uploadButton = make('button', 'admin-button admin-button-gold', 'Unggah & pakai logo ini');
    uploadButton.type = 'submit';
    uploadButton.disabled = true;
    upload.append(fileLabel, previewFrame, uploadNote, uploadButton);

    const libraryTitle = make('h4', 'logo-library-title', 'Logo tersimpan');
    const library = make('div', 'logo-grid');

    function renderCurrent() {
      currentImg.src = activePath ? logoPublicUrl(activePath) : DEFAULT_LOGO;
      currentLabel.textContent = activePath ? 'Logo unggahan Admin' : 'Logo bawaan situs';
      resetButton.disabled = !activePath;
    }

    async function refreshLibrary() {
      library.replaceChildren(make('div', 'table-empty', 'Memuat…'));
      const { data, error } = await client.storage.from(LOGO_BUCKET).list(LOGO_FOLDER, { limit: 60, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) { library.replaceChildren(make('div', 'admin-message is-error', 'Daftar logo tidak dapat dimuat.')); return; }
      const files = (data || []).filter(item => item.name && item.id && !item.name.startsWith('.'));
      if (!files.length) { library.replaceChildren(make('div', 'table-empty', 'Belum ada logo yang diunggah. Logo bawaan masih dipakai.')); return; }
      library.replaceChildren(...files.map(item => {
        const path = `${LOGO_FOLDER}/${item.name}`;
        const card = make('div', `logo-card${path === activePath ? ' is-active' : ''}`);
        const frame = make('div', 'logo-frame');
        const img = make('img');
        img.alt = '';
        img.loading = 'lazy';
        img.src = logoPublicUrl(path);
        frame.append(img);
        const date = item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const actions = make('div', 'logo-card-actions');
        const useButton = make('button', 'admin-link-button', path === activePath ? 'Dipakai' : 'Pakai');
        useButton.type = 'button';
        useButton.disabled = path === activePath;
        useButton.addEventListener('click', async () => {
          useButton.disabled = true;
          const error = await setActiveLogo(path);
          if (error) { useButton.disabled = false; setMessage('Logo gagal dipasang. Pastikan peran Pemilik/Editor Situs aktif.', 'error'); return; }
          activePath = path; renderCurrent(); refreshLibrary();
          setMessage('Logo diganti. Muat ulang beranda untuk melihat hasilnya.');
        });
        const deleteButton = make('button', 'admin-link-button is-danger', 'Hapus');
        deleteButton.type = 'button';
        deleteButton.disabled = path === activePath;
        deleteButton.title = path === activePath ? 'Ganti ke logo lain dulu sebelum menghapus.' : '';
        deleteButton.addEventListener('click', async () => {
          if (!window.confirm('Hapus logo ini dari penyimpanan? Tindakan ini tidak bisa dibatalkan.')) return;
          deleteButton.disabled = true;
          const { error } = await client.storage.from(LOGO_BUCKET).remove([path]);
          if (error) { deleteButton.disabled = false; setMessage('Logo gagal dihapus.', 'error'); return; }
          setMessage('Logo dihapus dari penyimpanan.');
          refreshLibrary();
        });
        actions.append(useButton, deleteButton);
        card.append(frame, make('small', '', date), actions);
        return card;
      }));
    }

    let chosenFile = null;
    fileInput.addEventListener('change', async () => {
      chosenFile = null;
      uploadButton.disabled = true;
      previewFrame.hidden = true;
      const file = fileInput.files && fileInput.files[0];
      if (!file) { uploadNote.textContent = 'Belum ada file dipilih.'; return; }
      if (!LOGO_TYPES[file.type]) { uploadNote.textContent = 'Format tidak didukung. Gunakan PNG, JPG, atau WebP.'; return; }
      if (file.size > LOGO_MAX_BYTES) { uploadNote.textContent = 'Ukuran file lebih dari 2 MB. Perkecil gambar terlebih dahulu.'; return; }
      const size = await readImageSize(file);
      if (!size) { uploadNote.textContent = 'File tidak dapat dibaca sebagai gambar.'; return; }
      previewImg.src = size.url;
      previewFrame.hidden = false;
      const ratio = size.width / size.height;
      const notes = [`${size.width}×${size.height} px, ${(file.size / 1024).toFixed(0)} KB.`];
      if (Math.min(size.width, size.height) < 300) notes.push('Resolusi kecil; logo bisa tampak buram. Disarankan minimal 500×500 px.');
      if (ratio < 0.9 || ratio > 1.1) notes.push('Gambar tidak persegi; bagian tepi bisa terpotong oleh bingkai lingkaran.');
      uploadNote.textContent = notes.join(' ');
      chosenFile = file;
      uploadButton.disabled = false;
    });

    upload.addEventListener('submit', async event => {
      event.preventDefault();
      if (!chosenFile) return;
      uploadButton.disabled = true;
      setMessage('Mengunggah logo…');
      const random = Math.random().toString(36).slice(2, 8);
      const path = `${LOGO_FOLDER}/${Date.now()}-${random}.${LOGO_TYPES[chosenFile.type]}`;
      const { error: uploadError } = await client.storage.from(LOGO_BUCKET).upload(path, chosenFile, {
        contentType: chosenFile.type,
        cacheControl: '31536000',
        upsert: false
      });
      if (uploadError) {
        uploadButton.disabled = false;
        setMessage('Logo gagal diunggah. Pastikan migrasi logo sudah dijalankan dan peran Pemilik/Editor Situs aktif.', 'error');
        return;
      }
      const saveError = await setActiveLogo(path);
      if (saveError) { setMessage('Logo terunggah, tetapi belum dipasang. Klik “Pakai” pada daftar logo tersimpan.', 'warning'); }
      else { activePath = path; setMessage('Logo baru terpasang. Muat ulang beranda untuk melihat hasilnya.'); }
      upload.reset();
      chosenFile = null;
      previewFrame.hidden = true;
      uploadNote.textContent = 'Belum ada file dipilih.';
      renderCurrent();
      refreshLibrary();
    });

    resetButton.addEventListener('click', async () => {
      if (!window.confirm('Kembalikan ke logo bawaan situs? Logo unggahan tetap tersimpan dan bisa dipakai lagi.')) return;
      resetButton.disabled = true;
      const error = await setActiveLogo('');
      if (error) { resetButton.disabled = false; setMessage('Gagal mengembalikan logo bawaan.', 'error'); return; }
      activePath = ''; renderCurrent(); refreshLibrary();
      setMessage('Logo bawaan dipakai kembali. Muat ulang beranda untuk melihat hasilnya.');
    });

    renderCurrent();
    section.append(current, upload, libraryTitle, library);
    refreshLibrary();
    return section;
  }

  function makeTable(headers) {
    const wrap = make('div', 'table-wrap');
    const table = make('table', 'admin-table');
    const thead = make('thead');
    const headRow = make('tr');
    headers.forEach(label => headRow.append(make('th', '', label)));
    thead.append(headRow);
    table.append(thead, make('tbody'));
    wrap.append(table);
    return { wrap, body: table.querySelector('tbody') };
  }

  // ================= KONFIRMASI KEHADIRAN (RSVP undangan digital) =================
  async function renderRsvp() {
    const heading = make('div', 'workspace-heading');
    const hb = make('div');
    hb.append(make('h3', '', 'Kehadiran Rapat'), make('p', '', 'Jawaban dari undangan digital. Bagikan tautan situs ini + /rsvp ke grup WA anggota. Nama yang sama hanya dihitung satu kali — jawaban terakhir yang dipakai.'));
    const open = make('a', 'admin-link-button', 'Buka halaman undangan ↗');
    open.href = 'rsvp.html';
    open.target = '_blank';
    open.rel = 'noopener';
    heading.append(hb, open);

    const { data: rows, error } = await client.from('rsvp').select('id,nama,kehadiran,alasan,created_at').order('created_at', { ascending: false }).limit(1000);
    if (error) {
      workspace.replaceChildren(heading, make('div', 'table-empty', 'Daftar kehadiran belum bisa dibuka. Minta Pemilik menjalankan migrasi 202610210015_rsvp_rapat.sql di Supabase SQL Editor, lalu muat ulang halaman ini.'));
      return;
    }
    const list = rows || [];
    const STATUS = { hadir: 'HADIR', tidak: 'TIDAK HADIR', belum: 'BELUM PASTI' };
    const counts = { hadir: 0, tidak: 0, belum: 0 };
    list.forEach(r => { if (counts[r.kehadiran] !== undefined) counts[r.kehadiran]++; });

    const chips = make('div', 'role-list');
    chips.append(
      make('span', 'role-chip', `HADIR: ${counts.hadir}`),
      make('span', 'role-chip', `TIDAK HADIR: ${counts.tidak}`),
      make('span', 'role-chip', `BELUM PASTI: ${counts.belum}`),
      make('span', 'role-chip', `TOTAL: ${list.length} orang`));
    chips.style.margin = '6px 0 16px';

    let filter = 'semua';
    const listBox = make('div');
    const PILL_STYLE = {
      hadir: 'background:#dff0d8;color:#2f5d2a',
      tidak: 'background:#f7e0e0;color:#8a1f1f',
      belum: 'background:#efe7d2;color:#6b5a2a'
    };

    function renderList() {
      const shown = list.filter(r => filter === 'semua' || r.kehadiran === filter);
      if (!list.length) {
        listBox.replaceChildren(make('div', 'table-empty', 'Belum ada jawaban masuk. Bagikan tautan undangan digital (rsvp) ke grup WA anggota.'));
        return;
      }
      if (!shown.length) {
        listBox.replaceChildren(make('div', 'table-empty', 'Tidak ada jawaban dengan status ini.'));
        return;
      }
      const wrap = make('div', 'table-wrap');
      const table = make('table', 'admin-table');
      const thead = make('thead');
      const headRow = make('tr');
      ['Waktu', 'Nama', 'Kehadiran', 'Alasan', ...(isOwner() ? [''] : [])].forEach(t => headRow.append(make('th', '', t)));
      thead.append(headRow);
      const tbody = make('tbody');
      shown.forEach(r => {
        const tr = make('tr');
        tr.append(make('td', '', sosTime(r.created_at)), make('td', '', r.nama));
        const pill = make('span', 'status-pill', STATUS[r.kehadiran] || r.kehadiran);
        pill.style.cssText = PILL_STYLE[r.kehadiran] || '';
        const tdPill = make('td');
        tdPill.append(pill);
        tr.append(tdPill);
        tr.append(make('td', '', r.alasan || '—'));
        if (isOwner()) {
          const td = make('td');
          const del = make('button', 'admin-link-button', 'Hapus');
          del.type = 'button';
          del.addEventListener('click', async () => {
            del.disabled = true;
            const { error: e } = await client.from('rsvp').delete().eq('id', r.id);
            if (e) { setMessage('Baris tidak terhapus. Muat ulang dan coba lagi.', 'error'); del.disabled = false; return; }
            const i = list.indexOf(r); if (i >= 0) list.splice(i, 1);
            counts[r.kehadiran] = Math.max(0, counts[r.kehadiran] - 1);
            refreshChips(); renderList();
          });
          td.append(del);
          tr.append(td);
        }
        tbody.append(tr);
      });
      table.append(thead); table.append(tbody);
      wrap.append(table);
      listBox.replaceChildren(wrap);
    }
    function refreshChips() {
      chips.replaceChildren(
        make('span', 'role-chip', `HADIR: ${counts.hadir}`),
        make('span', 'role-chip', `TIDAK HADIR: ${counts.tidak}`),
        make('span', 'role-chip', `BELUM PASTI: ${counts.belum}`),
        make('span', 'role-chip', `TOTAL: ${list.length} orang`));
    }

    const bar = make('div', 'card-buttons');
    const FILTERS = [['semua', 'Semua'], ['hadir', 'Hadir'], ['tidak', 'Tidak'], ['belum', 'Belum pasti']];
    const filterBtns = [];
    FILTERS.forEach(([key, label]) => {
      const b = make('button', 'admin-button admin-button-outline', label);
      b.type = 'button';
      b.addEventListener('click', () => {
        filter = key;
        filterBtns.forEach(([k, x]) => { x.style.cssText = k === filter ? 'background:#171715;color:#fff' : ''; });
        renderList();
      });
      filterBtns.push([key, b]);
      bar.append(b);
    });
    filterBtns[0][1].style.cssText = 'background:#171715;color:#fff';
    const reload = make('button', 'admin-button admin-button-outline', 'Muat ulang');
    reload.type = 'button';
    reload.addEventListener('click', () => renderRsvp());
    bar.append(reload);
    const csv = make('button', 'admin-button admin-button-gold', 'Unduh daftar (CSV)');
    csv.type = 'button';
    csv.addEventListener('click', () => {
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const head = 'Waktu;Nama;Kehadiran;Alasan';
      const body = list.map(r => [sosTime(r.created_at), r.nama, STATUS[r.kehadiran] || r.kehadiran, r.alasan || ''].map(esc).join(';'));
      const blob = new Blob(['﻿' + head + '\n' + body.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = make('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kehadiran-rapat-gmpi.csv';
      document.body.append(a);
      a.click();
      a.remove();
    });
    bar.append(csv);
    if (isOwner()) {
      const reset = make('button', 'admin-button admin-button-red', 'Kosongkan daftar (acara baru)');
      reset.type = 'button';
      reset.style.marginTop = '0';
      reset.addEventListener('click', async () => {
        if (!window.confirm('Kosongkan seluruh daftar kehadiran? Pakai ini saat mengumumkan acara berikutnya. Tindakan tidak bisa dibatalkan.')) return;
        reset.disabled = true;
        const { error: e } = await client.rpc('reset_rsvp');
        reset.disabled = false;
        if (e) { setMessage('Daftar gagal dikosongkan. Muat ulang dan coba lagi.', 'error'); return; }
        setMessage('Daftar kehadiran dikosongkan. Acara berikutnya bisa dimulai.');
        renderRsvp();
      });
      bar.append(reset);
    }
    bar.style.flexWrap = 'wrap';
    bar.style.margin = '0 0 14px';

    const note = make('div', 'privacy-mini', 'Kolom yang terlihat: waktu jawab, nama, status, alasan. Pengunjung situs hanya melihat rekap angka (tanpa nama). Hanya Pemilik yang dapat menghapus baris atau mengosongkan daftar.');
    renderList();
    workspace.replaceChildren(heading, chips, bar, listBox, note);
  }

  async function renderReports() {
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Aduan warga'));
    titleBlock.append(make('p', '', 'Hanya petugas LBH dan pemilik Admin yang diberi peran ini dapat membaca laporan. Tidak ada pengaduan yang masuk sampai formulir publik diaktifkan dengan persetujuan DPD.'));
    heading.append(titleBlock);
    const { data, error } = await client.from('citizen_reports').select('id,created_at,name,contact,district,topic,summary,status').order('created_at', { ascending: false }).limit(100);
    if (error) return showWorkspaceError('Daftar aduan tidak dapat dibuka. Periksa migrasi dan peran LBH.');
    const { wrap, body } = makeTable(['Diterima', 'Pelapor / kontak', 'Kecamatan / topik', 'Ringkasan', 'Status']);
    (data || []).forEach(report => {
      const row = make('tr');
      row.append(make('td', '', new Date(report.created_at).toLocaleString('id-ID')));
      row.append(make('td', '', `${report.name} · ${report.contact}`));
      row.append(make('td', '', `${report.district} · ${report.topic}`));
      row.append(make('td', '', report.summary));
      const statusCell = make('td');
      const select = make('select');
      REPORT_STATUSES.forEach(value => {
        const option = make('option', '', value);
        option.value = value;
        option.selected = value === report.status;
        select.append(option);
      });
      select.addEventListener('change', async () => {
        select.disabled = true;
        const { error: updateError } = await client.from('citizen_reports').update({ status: select.value }).eq('id', report.id);
        select.disabled = false;
        setMessage(updateError ? 'Status aduan tidak berhasil diperbarui.' : 'Status aduan diperbarui.', updateError ? 'error' : 'ok');
      });
      statusCell.append(select);
      row.append(statusCell);
      body.append(row);
    });
    if (!data?.length) body.append(emptyRow(5, 'Belum ada aduan masuk. Formulir aduan publik sudah aktif di bagian #posko situs.'));
    workspace.replaceChildren(heading, wrap, make('p', 'privacy-mini', 'Hindari menyalin rincian laporan ke perangkat atau kanal pribadi.'));
  }

  async function renderMembers() {
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Pendaftaran anggota'));
    titleBlock.append(make('p', '', 'Modul ini tersedia untuk Pemilik situs dan Petugas Registrasi. Status pendaftaran dan status persetujuan KTA ditampilkan terpisah. NIK tersamar; KTA yang cocok otomatis ditautkan bila nama+kecamatan unik, atau dapat dihubungkan manual dari kolom Status KTA.'));
    heading.append(titleBlock);
    const { data, error } = await client.from('member_registrations').select('id,created_at,full_name,nik,birth_place,birth_date,gender,phone,district,address,kelurahan,rt,rw,kode_pos,kota_luar,jabatan,division,status,ktp_object_key,profile_object_key').order('created_at', { ascending: false }).limit(100);
    if (error) return showWorkspaceError('Data anggota tidak bisa dimuat. Pastikan akun memiliki role Pemilik (Owner) atau Petugas Registrasi dan migration akses pendaftaran sudah diterapkan.');
    const cardResult = await client.from('member_cards')
      .select('id,registration_id,member_number,full_name,district,status')
      .eq('is_sample', false).order('created_at', { ascending: false }).limit(500);
    const memberCardRows = cardResult.data || [];
    const memberCardLoadError = cardResult.error;
    const cardsByRegistration = new Map();
    memberCardRows.forEach(card => {
      if (!card.registration_id) return;
      const bucket = cardsByRegistration.get(card.registration_id) || [];
      bucket.push(card); cardsByRegistration.set(card.registration_id, bucket);
    });
    const memberStatusLabel = { menunggu_verifikasi: 'Menunggu verifikasi', ditinjau: 'Ditinjau', diterima: 'Diterima', ditolak: 'Ditolak' };
    const cardStatusLabel = { menunggu: 'Menunggu persetujuan KTA', aktif: 'Aktif / disetujui', ditolak: 'Ditolak', nonaktif: 'Nonaktif', dicabut: 'Dicabut' };
    const { data: pendingCleanup } = await client.from('member_registration_deletion_audit')
      .select('id,deleted_at,reason,ktp_object_key,profile_object_key')
      .eq('storage_cleanup_status', 'pending').order('deleted_at', { ascending: true }).limit(20);
    // Judul jabatan tunggal yang sudah terisi agar tidak dapat dipilih dua kali.
    const { data: takenCards } = await client.from('member_cards').select('jabatan,status').eq('is_sample', false).in('status', ['aktif', 'menunggu']).limit(500);
    const jabatanTaken = jabatanTakenSet(data, takenCards);
    const { wrap, body } = makeTable(['Tanggal', 'Nama / NIK', 'Kontak / kecamatan', 'Bidang', 'Jabatan pengurus', 'Dokumen', 'Status pendaftaran', 'Status KTA', 'Aksi']);
    (data || []).forEach(member => {
      const row = make('tr');
      row.append(make('td', '', new Date(member.created_at).toLocaleDateString('id-ID')));
      const nameCell = make('td');
      nameCell.append(make('div', '', member.full_name));
      const maskedNik = make('span', 'status-pill', `••••••••••••${String(member.nik || '').slice(-4)}`);
      const reveal = make('button', 'admin-link-button', 'Tampilkan NIK');
      reveal.type = 'button';
      reveal.addEventListener('click', () => {
        const showing = reveal.dataset.showing === 'true';
        maskedNik.textContent = showing ? `••••••••••••${String(member.nik || '').slice(-4)}` : String(member.nik || '');
        reveal.textContent = showing ? 'Tampilkan NIK' : 'Sembunyikan NIK';
        reveal.dataset.showing = String(!showing);
      });
      nameCell.append(maskedNik, make('br'), reveal);
      row.append(nameCell);
      const kontakCell = make('td');
      kontakCell.append(make('div', '', `${member.phone} · ${member.district}`));
      if (member.address) {
        const ad = make('div', 'privacy-mini', member.address);
        ad.style.cssText = 'font-size:10px;color:#706a5f;margin-top:4px';
        kontakCell.append(ad);
      }
      row.append(kontakCell);
      row.append(make('td', '', member.division));
      const jabatanCell = make('td');
      const jabSel = make('select');
      jabSel.className = 'member-jabatan-pick';
      jabSel.setAttribute('aria-label', `Jabatan pengurus ${member.full_name}`);
      fillJabatanOptions(jabSel, jabatanTaken, member.district, member.jabatan, '— Anggota biasa (tanpa jabatan) —');
      jabSel.addEventListener('change', async () => {
        const previous = member.jabatan || '';
        const written = jabSel.value ? jabatanWritten(jabSel.value, member.district) : null;
        jabSel.disabled = true;
        let jabErr = null;
        if (isOwner()) {
          const result = await client.rpc('owner_update_member_registration', { p_registration_id: member.id, p_values: { jabatan: written } });
          jabErr = result.error;
        } else {
          const result = await client.from('member_registrations').update({ jabatan: written }).eq('id', member.id);
          jabErr = result.error;
        }
        jabSel.disabled = false;
        if (jabErr) { jabSel.value = previous; setMessage(`Jabatan tidak berhasil disimpan: ${jabErr.message || 'izin database belum diterapkan.'}`, 'error'); return; }
        setMessage(written ? `Jabatan “${written}” diberikan kepada ${member.full_name}.` : `Jabatan ${member.full_name} dikosongkan.`, 'ok');
        await renderMembers();
      });
      jabatanCell.append(jabSel);
      row.append(jabatanCell);
      const documents = make('td');
      addDocumentButton(documents, 'KTP', member.ktp_object_key);
      addDocumentButton(documents, 'Profil', member.profile_object_key);
      row.append(documents);
      const statusCell = make('td');
      const select = make('select');
      MEMBER_STATUSES.forEach(value => {
        const option = make('option', '', memberStatusLabel[value] || value);
        option.value = value;
        option.selected = value === member.status;
        select.append(option);
      });
      select.addEventListener('change', async () => {
        select.disabled = true;
        let updateError = null;
        if (isOwner()) {
          const result = await client.rpc('owner_update_member_registration', { p_registration_id: member.id, p_values: { status: select.value } });
          updateError = result.error;
        } else {
          const result = await client.from('member_registrations').update({ status: select.value }).eq('id', member.id);
          updateError = result.error;
        }
        select.disabled = false;
        if (updateError) { setMessage(`Status anggota tidak berhasil diperbarui: ${updateError.message || 'izin database belum diterapkan.'}`, 'error'); return; }
        setMessage('Status anggota diperbarui. Muat ulang daftar bila ingin melakukan tindakan berikutnya.');
        await renderMembers();
      });
      statusCell.append(select);
      row.append(statusCell);
      const ktaCell = make('td', 'member-kta-cell');
      if (memberCardLoadError) {
        ktaCell.append(make('small', 'privacy-mini', 'Status KTA tidak dapat dimuat.'));
      } else {
        const linkedCards = cardsByRegistration.get(member.id) || [];
        if (linkedCards.length) {
          linkedCards.forEach(card => {
            const item = make('div', 'member-kta-item');
            item.append(make('strong', '', card.member_number || 'KTA'), make('small', '', cardStatusLabel[card.status] || card.status));
            ktaCell.append(item);
          });
        } else if (member.status !== 'ditolak') {
          const regMatches = (data || []).filter(r => r.status !== 'ditolak' && normalizeMemberConfirmation(r.full_name) === normalizeMemberConfirmation(member.full_name) && r.district === member.district);
          const possibleCards = memberCardRows.filter(card => !card.registration_id && normalizeMemberConfirmation(card.full_name) === normalizeMemberConfirmation(member.full_name) && card.district === member.district);
          const unlinkedCards = memberCardRows.filter(card => !card.registration_id);
          if (regMatches.length === 1 && possibleCards.length === 1) {
            const card = possibleCards[0];
            const item = make('div', 'member-kta-item');
            item.append(make('strong', '', card.member_number || 'KTA'), make('small', '', `${cardStatusLabel[card.status] || card.status} · belum tertaut`));
            const linkButton = make('button', 'admin-link-button', 'Hubungkan KTA');
            linkButton.type = 'button';
            linkButton.addEventListener('click', () => openMemberKtaLinkDialog(member, unlinkedCards, card.id));
            item.append(linkButton); ktaCell.append(item);
          } else {
            const text = possibleCards.length || regMatches.length > 1
              ? 'Ada kemungkinan kecocokan, tetapi tidak unik. Pilih kartu yang benar secara manual.'
              : 'Belum ada KTA tertaut. Jika kartunya sudah dibuat, pilih untuk menautkannya.';
            ktaCell.append(make('small', 'privacy-mini', text));
            if (unlinkedCards.length) {
              const linkButton = make('button', 'admin-link-button', 'Pilih KTA…');
              linkButton.type = 'button';
              linkButton.addEventListener('click', () => openMemberKtaLinkDialog(member, unlinkedCards));
              ktaCell.append(linkButton);
            } else {
              ktaCell.append(make('small', 'privacy-mini', 'Tidak ada KTA tanpa tautan. Buat kartu terlebih dahulu jika anggota ini belum memiliki KTA.'));
            }
          }
        } else {
          ktaCell.append(make('small', 'privacy-mini', 'Pendaftaran ditolak.'));
        }
      }
      row.append(ktaCell);
      const actions = make('td', 'member-actions-cell');
      if (isOwner()) {
        const editButton = make('button', 'admin-link-button member-action-button', 'Edit data…');
        editButton.type = 'button';
        editButton.title = 'Pemilik dapat mengubah seluruh data pendaftaran anggota.';
        editButton.addEventListener('click', () => openOwnerMemberEditor(member));
        actions.append(editButton, make('br'));
      }
      const deleteButton = make('button', 'admin-link-button is-danger member-action-button', 'Hapus duplikat…');
      deleteButton.type = 'button';
      deleteButton.title = 'Permanen; hanya tersedia setelah status Ditolak.';
      deleteButton.addEventListener('click', () => {
        if (member.status !== 'ditolak') {
          setMessage('Untuk keamanan, ubah Status pendaftaran menjadi Ditolak terlebih dahulu. Setelah daftar dimuat ulang, hapus duplikat dapat dilanjutkan.', 'warning');
          select.focus();
          return;
        }
        openMemberDeleteDialog(member);
      });
      actions.append(deleteButton);
      if (member.status !== 'ditolak') actions.append(make('small', 'member-delete-hint', 'Tandai Ditolak dulu'));
      row.append(actions);
      body.append(row);
    });
    if (!data?.length) body.append(emptyRow(9, 'Belum ada pendaftar. Saat ada yang mengisi formulir di situs (#gabung), datanya tampil di sini.'));
    const cleanupBox = makePendingMemberCleanupBox(pendingCleanup || []);
    const privacyNote = make('p', 'privacy-mini', 'KTP dan foto profil berada di bucket privat member-documents. Penghapusan dicatat tanpa nama/NIK. Jika terhubung ke KTA, hanya Pemilik yang dapat melanjutkan dengan konfirmasi pelepasan tautan; KTA tetap aktif.');
    workspace.replaceChildren(heading, ...(cleanupBox ? [cleanupBox] : []), wrap, privacyNote);
  }

  function normalizeMemberConfirmation(value) {
    return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
  }

  function openMemberKtaLinkDialog(member, unlinkedCards, suggestedCardId = '') {
    const overlay = make('div', 'member-delete-overlay');
    overlay.setAttribute('role', 'presentation');
    const dialog = make('section', 'member-delete-dialog member-kta-link-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'member-kta-link-title');
    const title = make('h3', '', 'Hubungkan KTA ke pendaftaran');
    title.id = 'member-kta-link-title';
    const note = make('p', 'member-delete-warning', `Pilih KTA yang benar untuk ${member.full_name} · ${member.district}. Tautan ini hanya menghubungkan kedua data—nomor, data, dan status KTA tidak berubah.`);
    const form = make('form');
    const label = make('label');
    label.append(make('span', '', 'Kartu KTA yang akan ditautkan'));
    const select = make('select'); select.required = true;
    select.append(new Option('— Pilih nomor dan nama KTA —', ''));
    const statusLabels = { menunggu: 'Menunggu persetujuan', aktif: 'Aktif/disetujui', ditolak: 'Ditolak', nonaktif: 'Nonaktif', dicabut: 'Dicabut' };
    unlinkedCards.forEach(card => select.append(new Option(`${card.member_number} · ${card.full_name} · ${card.district} · ${statusLabels[card.status] || card.status}`, card.id)));
    if (suggestedCardId && unlinkedCards.some(card => card.id === suggestedCardId)) select.value = suggestedCardId;
    label.append(select);
    form.append(label);
    const actions = make('div', 'member-delete-actions');
    const cancel = make('button', 'admin-button admin-button-outline', 'Batal'); cancel.type = 'button';
    const submit = make('button', 'admin-button admin-button-red', 'Hubungkan KTA'); submit.type = 'submit';
    submit.disabled = !unlinkedCards.length;
    actions.append(cancel, submit); form.append(actions);
    if (!unlinkedCards.length) form.prepend(make('p', 'privacy-mini', 'Belum ada KTA yang tersedia untuk ditautkan. Buat kartu terlebih dahulu melalui modul Kartu anggota.'));
    dialog.append(title, note, form); overlay.append(dialog); document.body.append(overlay);
    const close = () => overlay.remove();
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const card = unlinkedCards.find(item => item.id === select.value);
      if (!card) { setMessage('Pilih KTA yang akan dihubungkan.', 'error'); return; }
      const confirmed = window.confirm(`Tautkan ${card.member_number} (${card.full_name}, ${card.district}) ke pendaftaran ${member.full_name} (${member.district})? Pastikan ini orang yang sama.`);
      if (!confirmed) return;
      submit.disabled = true; cancel.disabled = true;
      const { data: linked, error } = await client.from('member_cards')
        .update({ registration_id: member.id }).eq('id', card.id).is('registration_id', null).select('id').maybeSingle();
      if (error || !linked) {
        submit.disabled = false; cancel.disabled = false;
        setMessage(`KTA tidak berhasil dihubungkan: ${error?.message || 'tautan mungkin sudah berubah.'}`, 'error');
        return;
      }
      close();
      setMessage(`KTA ${card.member_number} berhasil ditautkan ke ${member.full_name}. Status KTA tidak berubah.`, 'ok');
      await renderMembers();
    });
  }

  function openOwnerMemberEditor(member) {
    if (!isOwner()) { setMessage('Form edit lengkap hanya untuk Pemilik situs.', 'error'); return; }
    const overlay = make('div', 'member-edit-overlay');
    overlay.setAttribute('role', 'presentation');
    const dialog = make('section', 'member-edit-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'member-edit-title');
    const title = make('h3', '', `Edit data pendaftaran — ${member.full_name}`);
    title.id = 'member-edit-title';
    const note = make('p', 'privacy-mini', 'Khusus Pemilik. Perubahan dicatat pada audit dengan daftar kolom saja (nilai NIK/alamat tidak disalin ke audit). Dokumen KTP dan foto profil tetap privat dan dikelola melalui tombol dokumen.');
    const form = make('form', 'member-edit-form');
    const grid = make('div', 'member-edit-grid');
    const controls = {};
    const addField = (key, labelText, type = 'text', attrs = {}) => {
      const wrap = make('label', 'member-edit-field');
      wrap.append(make('span', '', labelText));
      const el = make('input');
      el.name = key; el.type = type;
      Object.entries(attrs).forEach(([name, value]) => { el[name] = value; });
      el.value = member[key] == null ? '' : String(member[key]);
      wrap.append(el); grid.append(wrap); controls[key] = el;
      return wrap;
    };
    const addSelect = (key, labelText, values) => {
      const wrap = make('label', 'member-edit-field');
      wrap.append(make('span', '', labelText));
      const el = make('select'); el.name = key;
      values.forEach(([label, value]) => el.append(new Option(label, value)));
      el.value = member[key] == null ? '' : String(member[key]);
      wrap.append(el); grid.append(wrap); controls[key] = el;
      return wrap;
    };
    addField('full_name', 'Nama lengkap', 'text', { required: true, maxLength: 160, autocomplete: 'off' });
    addField('nik', 'NIK (16 digit)', 'text', { required: true, maxLength: 16, inputMode: 'numeric', pattern: '[0-9]{16}', autocomplete: 'off' });
    addField('birth_place', 'Tempat lahir', 'text', { required: true, maxLength: 120 });
    addField('birth_date', 'Tanggal lahir', 'date', { required: true });
    addSelect('gender', 'Jenis kelamin', [['Laki-laki','Laki-laki'],['Perempuan','Perempuan']]);
    addField('phone', 'Nomor kontak/WhatsApp', 'tel', { required: true, maxLength: 40, autocomplete: 'off' });
    const districtChoices = [...DISTRICTS, 'Di luar Kab. Sidoarjo'].map(value => [value, value]);
    addSelect('district', 'Kecamatan/domisili', districtChoices);
    addField('kelurahan', 'Kelurahan/desa', 'text', { maxLength: 80 });
    addField('rt', 'RT', 'text', { maxLength: 3, inputMode: 'numeric' });
    addField('rw', 'RW', 'text', { maxLength: 3, inputMode: 'numeric' });
    addField('kode_pos', 'Kode pos', 'text', { maxLength: 5, inputMode: 'numeric' });
    addField('kota_luar', 'Kota/kabupaten luar Sidoarjo (bila berlaku)', 'text', { maxLength: 80 });
    const addressWrap = make('label', 'member-edit-field member-edit-field-wide');
    addressWrap.append(make('span', '', 'Alamat lengkap'));
    const addressIn = make('textarea'); addressIn.name = 'address'; addressIn.required = true; addressIn.maxLength = 1000; addressIn.rows = 3;
    addressIn.value = member.address || ''; addressWrap.append(addressIn); grid.append(addressWrap); controls.address = addressIn;
    const divisions = [
      ['Lembaga Bantuan Hukum / Advokasi Hukum Rakyat', 'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat'],
      ['Squad Militansi — Pengamanan & Solidaritas', 'Squad Militansi — Pengamanan & Solidaritas'],
      ['Militansi Perempuan Indonesia (MPI Sidoarjo)', 'Militansi Perempuan Indonesia (MPI Sidoarjo)'],
      ['Serikat Buruh, Tani & Nelayan (SB GMPI)', 'Serikat Buruh, Tani & Nelayan (SB GMPI)'],
      ['Tagana — Tanggap Bencana', 'Tagana — Tanggap Bencana'],
      ['Pemberdayaan Ekonomi & Sosial Masyarakat Desa', 'Pemberdayaan Ekonomi & Sosial Masyarakat Desa'],
      ['Seluruh bidang (Ketua DPD)', 'Seluruh bidang (Ketua DPD)']
    ];
    const divisionField = addSelect('division', 'Bidang', divisions);
    divisionField.append(make('small', 'privacy-mini', 'Untuk Ketua DPD yang membawahi semua divisi, pilih “Seluruh bidang (Ketua DPD)”.'));
    addField('jabatan', 'Jabatan pengurus (kosongkan untuk anggota biasa)', 'text', { maxLength: 60 });
    addSelect('status', 'Status pendaftaran', MEMBER_STATUSES.map(value => [value.replaceAll('_',' '), value]));
    form.append(grid);
    const buttons = make('div', 'member-edit-buttons');
    const cancel = make('button', 'admin-button admin-button-outline', 'Batal'); cancel.type = 'button';
    const save = make('button', 'admin-button admin-button-red', 'Simpan semua perubahan'); save.type = 'submit';
    buttons.append(cancel, save); form.append(buttons);
    dialog.append(title, note, form); overlay.append(dialog); document.body.append(overlay);
    const close = () => overlay.remove();
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const values = {};
      Object.entries(controls).forEach(([key, control]) => {
        const value = control.value.trim();
        const next = ['jabatan','kelurahan','rt','rw','kode_pos','kota_luar'].includes(key) ? (value || null) : value;
        const old = member[key] == null ? null : String(member[key]);
        if (String(next ?? '') !== String(old ?? '')) values[key] = next;
      });
      if (!Object.keys(values).length) { close(); setMessage('Tidak ada perubahan data.', 'warning'); return; }
      save.disabled = true; cancel.disabled = true; save.textContent = 'Menyimpan…';
      const { error: saveError } = await client.rpc('owner_update_member_registration', {
        p_registration_id: member.id,
        p_values: values
      });
      if (saveError) {
        save.disabled = false; cancel.disabled = false; save.textContent = 'Simpan semua perubahan';
        setMessage(`Data gagal disimpan: ${saveError.message || 'pastikan migration Owner edit sudah diterapkan.'}`, 'error');
        return;
      }
      close();
      setMessage('Seluruh perubahan data tersimpan. Audit perubahan sudah dicatat.', 'ok');
      await renderMembers();
    });
  }

  async function openMemberDeleteDialog(member) {
    if (member.status !== 'ditolak') {
      setMessage('Untuk mencegah salah hapus, ubah status pendaftaran menjadi Ditolak terlebih dahulu, lalu buka kembali daftar.', 'warning');
      return;
    }
    const { data: linkedCards, error: linkedError } = await client.from('member_cards')
      .select('id').eq('registration_id', member.id).eq('is_sample', false).limit(1);
    if (linkedError) {
      setMessage('Status keterkaitan KTA tidak dapat diperiksa. Penghapusan dibatalkan demi keamanan.', 'error');
      return;
    }
    const hasLinkedCard = Boolean(linkedCards?.length);
    const ownerCanUnlink = isOwner();
    const overlay = make('div', 'member-delete-overlay');
    overlay.setAttribute('role', 'presentation');
    const dialog = make('section', 'member-delete-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'member-delete-title');
    const title = make('h3', '', 'Hapus pendaftaran permanen?');
    title.id = 'member-delete-title';
    const warning = make('p', 'member-delete-warning', 'Tindakan permanen: data pendaftaran beserta foto KTP dan profil privatnya akan dihapus. Periksa tanggal, kecamatan, dan 4 digit NIK sebelum melanjutkan.');
    const memberInfo = make('div', 'member-delete-info');
    memberInfo.append(make('strong', '', member.full_name));
    memberInfo.append(make('span', '', `${new Date(member.created_at).toLocaleDateString('id-ID')} · ${member.district} · NIK berakhir ••••${String(member.nik || '').slice(-4)}`));
    let unlinkCheckbox = null;
    if (hasLinkedCard) {
      const ktaWarning = make('p', 'member-delete-warning', ownerCanUnlink
        ? 'Pendaftaran ini terhubung ke KTA. Jika Pemilik melanjutkan, data pendaftaran dan foto dihapus, tetapi KTA tetap aktif dan tautan ke pendaftaran dilepas.'
        : 'Pendaftaran ini terhubung ke KTA. Petugas Registrasi tidak dapat menghapusnya. Minta Pemilik situs meninjau dan mengonfirmasi pelepasan tautan KTA.');
      dialog.append(title, warning, memberInfo, ktaWarning);
    } else {
      dialog.append(title, warning, memberInfo);
    }
    if (hasLinkedCard && ownerCanUnlink) {
      const unlinkLabel = make('label', 'member-kta-override');
      unlinkCheckbox = make('input'); unlinkCheckbox.type = 'checkbox';
      unlinkLabel.append(unlinkCheckbox, make('span', '', 'Saya memahami KTA akan tetap aktif, tetapi tautannya ke pendaftaran ini akan dilepas.'));
      dialog.append(unlinkLabel);
    }
    const nameLabel = make('label', '', 'Ketik nama lengkap untuk konfirmasi');
    const nameInput = make('input');
    nameInput.type = 'text'; nameInput.autocomplete = 'off'; nameInput.spellcheck = false;
    nameInput.placeholder = member.full_name;
    nameLabel.append(nameInput);
    const last4Label = make('label', '', 'Masukkan 4 digit terakhir NIK yang tampil di baris ini');
    const last4Input = make('input');
    last4Input.type = 'text'; last4Input.inputMode = 'numeric'; last4Input.maxLength = 4; last4Input.autocomplete = 'off'; last4Input.placeholder = '••••';
    last4Label.append(last4Input);
    const reasonLabel = make('label', '', 'Alasan penghapusan (wajib)');
    const reasonInput = make('textarea');
    reasonInput.rows = 2; reasonInput.maxLength = 300; reasonInput.value = 'Duplikat pendaftaran';
    reasonLabel.append(reasonInput);
    const feedback = make('small', 'member-delete-feedback', 'Konfirmasi nama dan empat digit NIK untuk mengaktifkan tombol hapus.');
    const actions = make('div', 'member-delete-actions');
    const cancel = make('button', 'admin-button admin-button-outline', 'Batal'); cancel.type = 'button';
    const confirm = make('button', 'admin-button admin-button-red', 'Hapus permanen'); confirm.type = 'button'; confirm.disabled = true;
    actions.append(cancel, confirm);
    dialog.append(nameLabel, last4Label, reasonLabel, feedback, actions);
    overlay.append(dialog);
    document.body.append(overlay);
    const close = () => overlay.remove();
    cancel.addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    const expectedLast4 = String(member.nik || '').slice(-4);
    const validate = () => {
      const nameOk = normalizeMemberConfirmation(nameInput.value) === normalizeMemberConfirmation(member.full_name);
      const last4Ok = /^\d{4}$/.test(last4Input.value.trim()) && last4Input.value.trim() === expectedLast4;
      const reasonOk = reasonInput.value.trim().length >= 5;
      const ktaOk = !hasLinkedCard || (ownerCanUnlink && Boolean(unlinkCheckbox?.checked));
      confirm.disabled = !(nameOk && last4Ok && reasonOk && ktaOk);
      feedback.textContent = !ktaOk && hasLinkedCard && !ownerCanUnlink
        ? 'Tindakan diblokir untuk Registrar; Pemilik dapat meninjau pelepasan tautan KTA.'
        : (confirm.disabled ? 'Nama, empat digit NIK, alasan, dan konfirmasi KTA wajib cocok/lengkap.' : 'Konfirmasi cocok. Data dan dokumen privat akan dihapus.');
      feedback.classList.toggle('is-ready', !confirm.disabled);
    };
    [nameInput, last4Input, reasonInput].forEach(input => input.addEventListener('input', validate));
    unlinkCheckbox?.addEventListener('change', validate);
    confirm.addEventListener('click', async () => {
      confirm.disabled = true; cancel.disabled = true;
      confirm.textContent = 'Menghapus…';
      const ok = await permanentlyDeleteMember(member, nameInput.value, last4Input.value.trim(), reasonInput.value.trim(), hasLinkedCard && ownerCanUnlink && Boolean(unlinkCheckbox?.checked));
      if (ok) close();
      else { confirm.disabled = false; cancel.disabled = false; confirm.textContent = 'Hapus permanen'; }
    });
    nameInput.focus();
  }

  async function permanentlyDeleteMember(member, typedName, typedLast4, reason, allowKtaUnlink) {
    setMessage('Memverifikasi izin dan menghapus data pendaftaran…', 'warning');
    const { data, error } = await client.rpc('delete_member_registration_safe', {
      p_registration_id: member.id,
      p_confirm_name: typedName.trim(),
      p_confirm_nik_last4: typedLast4,
      p_reason: reason,
      p_allow_kta_unlink: Boolean(allowKtaUnlink)
    });
    if (error || !data?.audit_id) {
      const msg = String(error?.message || 'Prosedur aman belum tersedia. Pastikan migrasi penghapusan duplikat telah diterapkan.');
      setMessage(msg.includes('KTA') || msg.includes('Ditolak') || msg.includes('Konfirmasi') || msg.includes('NIK') ? msg : 'Penghapusan dibatalkan. Pastikan akun Pemilik atau Petugas Registrasi dan migration akses penuh/penghapusan aman sudah diterapkan.', 'error');
      return false;
    }
    const keys = [data.ktp_object_key, data.profile_object_key].filter(Boolean);
    if (keys.length) {
      const { error: storageError } = await client.storage.from('member-documents').remove(keys);
      if (storageError) {
        setMessage('Data pendaftaran terhapus, tetapi pembersihan foto tertunda. Catatan pembersihan aman tersimpan; gunakan tombol “Bersihkan dokumen tertunda” di atas daftar untuk mencoba lagi.', 'warning');
        await renderMembers();
        return true;
      }
    }
    const { error: completeError } = await client.rpc('complete_member_registration_cleanup', { p_audit_id: data.audit_id });
    if (completeError) {
      setMessage('Data dan foto sudah dihapus, tetapi penutupan catatan audit tertunda. Muat ulang daftar untuk menyelesaikannya.', 'warning');
      await renderMembers();
      return true;
    }
    setMessage(`Pendaftaran duplikat ${member.full_name} dan dokumen privatnya berhasil dihapus. Catatan audit tanpa nama/NIK tersimpan.`, 'ok');
    await renderMembers();
    return true;
  }

  function makePendingMemberCleanupBox(rows) {
    if (!rows.length) return null;
    const box = make('div', 'member-cleanup-warning');
    box.append(make('strong', '', `${rows.length} pembersihan dokumen tertunda`));
    box.append(make('p', '', 'Data pendaftaran sudah dihapus, tetapi Storage belum mengonfirmasi penghapusan semua foto. Coba bersihkan di sini; berkas tetap berada di bucket privat sampai berhasil dibersihkan.'));
    rows.forEach(item => {
      const button = make('button', 'admin-button admin-button-outline', `Bersihkan dokumen tertunda · ${new Date(item.deleted_at).toLocaleDateString('id-ID')}`);
      button.type = 'button';
      button.addEventListener('click', async () => {
        button.disabled = true;
        const keys = [item.ktp_object_key, item.profile_object_key].filter(Boolean);
        const { error: storageError } = keys.length ? await client.storage.from('member-documents').remove(keys) : { error: null };
        if (storageError) {
          button.disabled = false;
          setMessage('Foto belum berhasil dibersihkan. Dokumen tetap privat; coba lagi nanti atau minta pemilik sistem memeriksa Storage.', 'error');
          return;
        }
        const { error: completeError } = await client.rpc('complete_member_registration_cleanup', { p_audit_id: item.id });
        if (completeError) {
          button.disabled = false;
          setMessage('Foto telah dibersihkan, tetapi status audit belum tertutup. Muat ulang dan coba lagi.', 'warning');
          return;
        }
        setMessage('Foto sisa telah dibersihkan dan catatan audit ditutup.');
        await renderMembers();
      });
      box.append(button);
    });
    return box;
  }

  function addDocumentButton(parent, label, key) {
    if (!key) {
      parent.append(make('span', 'status-pill', `${label}: belum ada`));
      return;
    }
    const button = make('button', 'file-button', `Buka ${label}`);
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { data, error } = await client.storage.from('member-documents').createSignedUrl(key, 60);
      button.disabled = false;
      if (error || !data?.signedUrl) return setMessage('Dokumen tidak dapat dibuka. Periksa akses bucket privat.', 'error');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    });
    parent.append(button);
  }

  async function renderAccessManager() {
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Akun dan peran'));
    titleBlock.append(make('p', '', 'Undang akun melalui Supabase Authentication, lalu tetapkan peran. Pemilik memiliki akses penuh ke panel; peran Registrar dapat dipakai untuk petugas yang memang perlu menangani data pendaftaran dan dokumen sensitif.'));
    heading.append(titleBlock);
    const form = make('form', 'admin-inline-form');
    const emailLabel = make('label', '', 'Email akun');
    const emailInput = make('input');
    emailInput.type = 'email';
    emailInput.required = true;
    emailInput.placeholder = 'petugas@organisasi.id';
    emailLabel.append(emailInput);
    const roleLabel = make('label', '', 'Peran');
    const roleSelect = make('select');
    Object.entries(ROLE_LABELS).forEach(([value, label]) => {
      const option = make('option', '', label);
      option.value = value;
      roleSelect.append(option);
    });
    roleLabel.append(roleSelect);
    const addButton = make('button', 'admin-button admin-button-gold', 'Tambah peran');
    addButton.type = 'submit';
    form.append(emailLabel, roleLabel, addButton);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = emailInput.value.trim().toLowerCase();
      if (!email) return;
      addButton.disabled = true;
      const { error } = await client.from('admin_profiles').upsert({ email, role: roleSelect.value, active: true }, { onConflict: 'email,role' });
      addButton.disabled = false;
      if (error) return setMessage('Peran tidak berhasil disimpan. Pastikan Anda adalah Owner dan migrasi Admin sudah dijalankan.', 'error');
      emailInput.value = '';
      setMessage('Peran ditambahkan. Akun harus sudah diundang melalui Supabase Authentication agar dapat masuk.');
      renderAccessManager();
    });
    const { data, error } = await client.from('admin_profiles').select('email,role,active').order('email');
    if (error) return showWorkspaceError('Daftar peran tidak dapat dimuat. Pastikan akun Anda memiliki peran Owner.');
    const { wrap, body } = makeTable(['Email', 'Peran', 'Status', 'Tindakan']);
    (data || []).forEach(profile => {
      const row = make('tr');
      row.append(make('td', '', profile.email));
      row.append(make('td', '', ROLE_LABELS[profile.role] || profile.role));
      row.append(make('td', '', profile.active ? 'Aktif' : 'Nonaktif'));
      const actionCell = make('td');
      const remove = make('button', 'admin-link-button', profile.active ? 'Cabut peran' : 'Hapus peran');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        if (profile.role === 'owner') {
          const { count, error: countError } = await client.from('admin_profiles').select('email', { count: 'exact', head: true }).eq('role', 'owner').eq('active', true);
          if (countError || count <= 1) return setMessage('Peran Owner terakhir tidak dapat dicabut. Tambahkan Owner lain terlebih dahulu.', 'error');
        }
        const { error: deleteError } = await client.from('admin_profiles').delete().eq('email', profile.email).eq('role', profile.role);
        if (deleteError) return setMessage('Peran tidak berhasil dicabut.', 'error');
        setMessage('Peran dicabut. Akun tersebut tetap tidak dapat mengakses bagian ini.');
        renderAccessManager();
      });
      actionCell.append(remove);
      row.append(actionCell);
      body.append(row);
    });
    if (!data?.length) body.append(emptyRow(4, 'Belum ada akun Admin. Pemilik pertama perlu dibuat melalui SQL Editor sesuai panduan penyiapan.'));
    workspace.replaceChildren(heading, form, wrap, make('p', 'privacy-mini', 'Pemilik memiliki akses penuh ke panel termasuk pendaftaran dan dokumen sensitif. Batasi akses akun Pemilik dan Registrar; KTP tetap privat dan semua akses perlu untuk tugas resmi.'));
  }

  function emptyRow(colspan, text) {
    const row = make('tr');
    const cell = make('td', 'table-empty', text);
    cell.colSpan = colspan;
    row.append(cell);
    return row;
  }

  // ---- Kartu Tanda Anggota (KTA) dengan QR verifikasi ----
  const DISTRICTS = ['Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik','Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'];
  const JABATAN_GROUPS = [
    ['Dewan DPD', ['Dewan Penasihat DPD', 'Dewan Pembina DPD']],
    ['Pengurus harian DPD', ['Ketua DPD', 'Wakil Ketua DPD', 'Sekretaris DPD', 'Ketua Harian DPD', 'Kepala Humas DPD', 'Bendahara DPD']],
    ['Departemen DPD', ['Wakil Ketua Departemen DPD', 'Pengurus Departemen DPD']],
    ['Ranting (desa)', ['Korja Ranting', 'Wakil Korja Ranting', 'Sekretaris Ranting']],
    ['Organisasi otonom', ['LBH GMPI', 'Squad Militansi', 'MPI Sidoarjo', 'SB GMPI', 'Tagana']],
    ['Keanggotaan', ['Anggota', 'Warga GMPI']]
  ];
  const JABATAN_SUGGESTIONS = JABATAN_GROUPS.flatMap(([, items]) => items);
  // Jabatan yang boleh dipegang banyak orang sekaligus — tidak pernah disembunyikan dari daftar.
  const JABATAN_MULTI_SEAT = new Set([
    'Dewan Penasihat DPD', 'Dewan Pembina DPD',
    'Wakil Ketua Departemen DPD', 'Pengurus Departemen DPD',
    'Korja Ranting', 'Wakil Korja Ranting', 'Sekretaris Ranting',
    'LBH GMPI', 'Squad Militansi', 'MPI Sidoarjo', 'SB GMPI', 'Tagana',
    'Anggota', 'Warga GMPI'
  ]);
  const JABATAN_UNIQUE = JABATAN_SUGGESTIONS.filter(j => !JABATAN_MULTI_SEAT.has(j));
  const normJabatan = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  // Judul tertulis tergolong jabatan tunggal? Tepat sama, atau varian dengan tambahan nama (mis. "Ketua DPC Candi").
  function jabatanUniqueTitle(v) {
    const n = normJabatan(v);
    if (!n) return '';
    return JABATAN_UNIQUE.filter(j => n === normJabatan(j) || n.startsWith(normJabatan(j) + ' ')).sort((a, b) => b.length - a.length)[0] || '';
  }
  // Kumpulan judul jabatan tunggal yang sudah terisi: dari pendaftaran (selain ditolak) + kartu menunggu/aktif.
  function jabatanTakenSet(registrations, cardList) {
    const taken = new Set();
    (registrations || []).forEach(r => { if (r && r.status !== 'ditolak' && jabatanUniqueTitle(r.jabatan)) taken.add(normJabatan(r.jabatan)); });
    (cardList || []).forEach(c => { if (c && (c.status === 'aktif' || c.status === 'menunggu') && jabatanUniqueTitle(c.jabatan)) taken.add(normJabatan(c.jabatan)); });
    return taken;
  }
  // Judul tertulis: judul DPC/Ranting otomatis ditambah nama kecamatan (persis seperti formulir kartu).
  const jabatanWritten = (j, district) => (/(DPC|Ranting)$/.test(j) && district ? `${j} ${district}` : j);
  // Isi <select> dengan daftar jabatan; judul tunggal yang sudah terisi (dan bukan miliknya sendiri) disembunyikan.
  function fillJabatanOptions(sel, taken, district, ownValue, placeholder) {
    const own = normJabatan(ownValue);
    let ownListed = !ownValue;
    sel.replaceChildren(new Option(placeholder, ''));
    JABATAN_GROUPS.forEach(([label, items]) => {
      const g = document.createElement('optgroup');
      g.label = label;
      let used = 0;
      items.forEach(j => {
        const written = jabatanWritten(j, district);
        if (jabatanUniqueTitle(written) && taken.has(normJabatan(written)) && normJabatan(written) !== own) return;
        const opt = new Option(j === written ? j : `${j} · ${district}`, j);
        if (normJabatan(written) === own) { opt.selected = true; ownListed = true; }
        g.append(opt);
        used += 1;
      });
      if (used) sel.append(g);
    });
    if (!ownListed) sel.append(Object.assign(new Option(`Tidak baku: “${ownValue}”`, ownValue), { selected: true }));
    return sel;
  }
  const CARD_STATUS_LABELS = { menunggu: 'Menunggu persetujuan', ditolak: 'Ditolak', aktif: 'Aktif', nonaktif: 'Nonaktif', dicabut: 'Dicabut' };
  const CARD_COLS_BASE = 'id,registration_id,card_token,member_number,full_name,district,jabatan,status,issued_at,valid_until';
  const CARD_COLS = CARD_COLS_BASE + ',submitted_by,approved_by,approved_at,review_note';

  function isoDate(date) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  function addYears(iso, years) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
  }
  function field(labelText, control, hint) {
    const wrap = make('div', 'content-field');
    const label = make('label', '', labelText);
    if (control.id) label.htmlFor = control.id;
    wrap.append(label, control);
    if (hint) wrap.append(make('small', 'privacy-mini', hint));
    return wrap;
  }
  function input(id, type = 'text', attrs = {}) {
    const el = make('input');
    el.id = id; el.name = id; el.type = type;
    Object.entries(attrs).forEach(([k, v]) => { el[k] = v; });
    return el;
  }

  async function cardLogo() {
    const fallback = 'assets/logo-gmpi-sidoarjo.webp';
    try {
      const { data } = await client.from('site_content').select('value').eq('key', 'site_logo').maybeSingle();
      const path = data?.value?.text || '';
      if (path) {
        const url = client.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
        const img = await window.GMPICard.loadImage(url, true);
        if (img) return img;
      }
    } catch (e) { /* pakai logo bawaan */ }
    return window.GMPICard.loadImage(fallback);
  }

  async function renderCards() {
    if (!window.GMPICard) return showWorkspaceError('Komponen kartu (member-card.js) tidak termuat. Pastikan file sudah diunggah ke GitHub.');
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Kartu Tanda Anggota'));
    titleBlock.append(make('p', '', 'Petugas Registrasi menginput kartu → Penyetuju Kartu memeriksa dan menyetujui → baru QR berlaku dan kartu bisa diunduh untuk dicetak. Pembuat kartu tidak bisa menyetujui kartunya sendiri. NIK tidak pernah dicantumkan.'));
    heading.append(titleBlock);

    let cols = CARD_COLS;
    let approvalReady = true;
    let { data: cardRows, error } = await client.from('member_cards')
      .select(cols).eq('is_sample', false).order('created_at', { ascending: false }).limit(500);
    if (error) {
      approvalReady = false; cols = CARD_COLS_BASE;
      ({ data: cardRows, error } = await client.from('member_cards')
        .select(cols).eq('is_sample', false).order('created_at', { ascending: false }).limit(500));
    }
    if (error) return showWorkspaceError('Data kartu belum bisa dibuka. Jalankan migrasi 202610200004_member_cards.sql di Supabase, lalu muat ulang halaman.');
    let cards = cardRows || [];
    const me = myEmail();
    const issuer = canIssueCards();
    const approver = canApproveCards() && approvalReady;
    const setupNote = approvalReady ? null : make('div', 'admin-message is-error', 'Fitur persetujuan kartu belum aktif. Jalankan migrasi 202610200008_card_approval.sql di Supabase SQL Editor, lalu muat ulang halaman.');
    function cardError(err, fallback) {
      const msg = String(err?.message || '');
      if (/sendiri|membuat atau mengubah/i.test(msg)) return 'Kartu ini Anda yang membuat/mengubah — harus disetujui oleh Penyetuju Kartu lain.';
      if (/Hanya Penyetuju/i.test(msg)) return 'Hanya Penyetuju Kartu atau Pemilik yang dapat menyetujui/menolak kartu.';
      if (/Ajukan ulang/i.test(msg)) return 'Kartu ini harus diajukan ulang dulu sebelum bisa diaktifkan.';
      if (/nomor khusus/i.test(msg)) return 'Nomor 0001–0100 adalah nomor khusus anggota terpilih dan hanya bisa diberikan oleh Pemilik. Gunakan nomor 0101 ke atas.';
      return fallback;
    }

    await window.GMPICard.ready();
    await window.GMPICard.defaultSignatureReady();
    const logo = await cardLogo();

    const today = isoDate(new Date());
    const year = today.slice(0, 4);
    const RESERVED_MAX = 100;
    const isReservedNumber = n => /^GMPI-SDA-[0-9]{4}-0*([1-9][0-9]?|100)$/.test(String(n || '').toUpperCase());
    function suggestNumber() {
      const prefix = `GMPI-SDA-${year}-`;
      const max = cards.reduce((acc, c) => {
        const m = c.member_number.startsWith(prefix) ? Number(c.member_number.slice(prefix.length)) : 0;
        return Number.isFinite(m) && m > acc ? m : acc;
      }, RESERVED_MAX);
      return prefix + String(max + 1).padStart(4, '0');
    }
    // Nomor 0001–0100 tiap tahun = jatah khusus anggota terpilih (hanya Pemilik).
    function freeReservedNumbers() {
      const used = new Set(cards.map(c => c.member_number));
      const out = [];
      for (let i = 1; i <= RESERVED_MAX; i += 1) {
        const n = `GMPI-SDA-${year}-${String(i).padStart(4, '0')}`;
        if (!used.has(n)) out.push(n);
      }
      return out;
    }

    // --- Formulir & pratinjau ---
    const designer = make('div', 'card-designer');
    const formEl = make('form', 'content-form card-form');
    const nameIn = input('card-name', 'text', { required: true, maxLength: 120, placeholder: 'Nama sesuai KTP', autocomplete: 'off' });
    const numberIn = input('card-number', 'text', { required: true, maxLength: 40, placeholder: 'GMPI-SDA-2026-0001', autocomplete: 'off' });
    const districtIn = make('select'); districtIn.id = 'card-district'; districtIn.required = true;
    districtIn.append(new Option('Pilih kecamatan', ''));
    DISTRICTS.forEach(d => districtIn.append(new Option(d, d)));
    const jabatanIn = input('card-jabatan', 'text', { required: true, maxLength: 60, value: 'Anggota' });
    const list = make('select'); list.id = 'card-jabatan-pick'; list.className = 'card-jabatan-pick';
    list.setAttribute('aria-label', 'Pilih jabatan');
    // Read saved registration profile photos only for Owner/Registrar, never KTP images.
    let regRows = [];
    let regLoadError = null;
    if (canSeeMembers()) {
      const regResult = await client.from('member_registrations')
        .select('id,full_name,district,jabatan,status,profile_object_key,created_at')
        .order('created_at', { ascending: false }).limit(500);
      if (regResult.error) regLoadError = regResult.error;
      else regRows = regResult.data || [];
    }
    const memberPick = make('select');
    memberPick.id = 'card-saved-member';
    memberPick.setAttribute('aria-label', 'Pilih anggota terdaftar');
    memberPick.append(new Option('— Pilih nama dari pendaftaran tersimpan —', ''));
    regRows.forEach(reg => {
      const dateLabel = reg.created_at ? new Date(reg.created_at).toLocaleDateString('id-ID') : '';
      const photoLabel = reg.profile_object_key ? 'foto tersimpan' : 'tanpa foto profil';
      const rejected = reg.status === 'ditolak';
      const option = new Option(`${reg.full_name} · ${reg.district} · ${photoLabel}${dateLabel ? ` · ${dateLabel}` : ''}${rejected ? ' · ditolak (kartu lama)' : ''}`, reg.id);
      if (rejected) option.disabled = true;
      memberPick.append(option);
    });
    const memberPickField = field('Pendaftar tersimpan (opsional)', memberPick,
      'Pilih orang yang sudah terdaftar untuk mengisi nama, kecamatan, jabatan, dan memuat foto profil tersimpan. Foto KTP tidak dipakai.');
    memberPickField.hidden = !canSeeMembers();
    const refillJabatanPick = () => fillJabatanOptions(list, jabatanTakenSet(regRows, cards), districtIn.value, jabatanIn.value, '— Pilih jabatan dari daftar —');
    refillJabatanPick();
    districtIn.addEventListener('change', refillJabatanPick);
    const syncPick = () => {
      const v = jabatanIn.value.trim();
      const hit = JABATAN_SUGGESTIONS.filter(j => v === j || v.startsWith(j + ' ')).sort((a, b) => b.length - a.length)[0];
      if (hit) { list.value = hit; return; }
      // Custom department wording should not clear the generic role selector.
      const lower = v.toLocaleLowerCase('id-ID');
      const deptRole = lower.startsWith('wakil ketua departemen ') ? 'Wakil Ketua Departemen DPD'
        : (lower.startsWith('pengurus departemen ') ? 'Pengurus Departemen DPD' : '');
      if (deptRole && Array.from(list.options).some(option => option.value === deptRole)) list.value = deptRole;
    };
    list.addEventListener('change', () => { if (!list.value) return; let v = list.value; if (/(DPC|Ranting)$/.test(v) && districtIn.value) v = `${v} ${districtIn.value}`; jabatanIn.value = v; jabatanIn.dispatchEvent(new Event('input')); });
    jabatanIn.addEventListener('input', syncPick);
    const issuedIn = input('card-issued', 'date', { required: true, value: today });
    const validIn = input('card-valid', 'date', { required: true, value: addYears(today, 2) });
    const photoIn = input('card-photo', 'file', { accept: 'image/png,image/jpeg,image/webp' });
    const zoomIn = input('card-zoom', 'range', { min: 100, max: 250, value: 100 });
    const xIn = input('card-x', 'range', { min: -100, max: 100, value: 0 });
    const yIn = input('card-y', 'range', { min: -100, max: 100, value: 0 });
    const SIGNER_KEY = 'gmpi-card-signer';
    const savedSigner = (() => { try { return JSON.parse(localStorage.getItem(SIGNER_KEY) || '{}'); } catch (e) { return {}; } })();
    ['name', 'title'].forEach(k => { if (typeof savedSigner[k] === 'string') savedSigner[k] = savedSigner[k].replace(/\bDPC\b/g, 'DPD'); });
    if (/^Ketua DP[CD] GMPI Sidoarjo$/i.test(savedSigner.title || '')) delete savedSigner.title; // bawaan lama → ikuti ART Pasal 4f (Ketua Umum)
    const signerNameIn = input('card-signer-name', 'text', { maxLength: 80, placeholder: 'Nama Ketua Umum GMPI', value: savedSigner.name || '' });
    const signerTitleIn = input('card-signer-title', 'text', { maxLength: 60, value: savedSigner.title || 'Ketua Umum GMPI' });
    const signatureIn = input('card-signature', 'file', { accept: 'image/png,image/webp' });

    const reservedPick = make('select'); reservedPick.id = 'card-number-kind'; reservedPick.className = 'card-number-kind';
    reservedPick.setAttribute('aria-label', 'Jenis nomor anggota');
    function fillReservedPick() {
      reservedPick.replaceChildren(new Option(`Nomor biasa (otomatis mulai 0101)`, ''));
      if (!isOwner()) return;
      const g = document.createElement('optgroup'); g.label = `★ Nomor khusus anggota terpilih (${year})`;
      const free = freeReservedNumbers();
      free.forEach(n => g.append(new Option(`★ ${n.slice(-4)}`, n)));
      if (!free.length) g.append(Object.assign(new Option('Semua nomor 0001–0100 sudah terpakai', ''), { disabled: true }));
      reservedPick.append(g);
    }
    reservedPick.addEventListener('change', () => { numberIn.value = reservedPick.value || suggestNumber(); numberIn.dispatchEvent(new Event('input')); });
    const numberHint = isOwner()
      ? 'Nomor 0001–0100 khusus anggota terpilih — pilih dari daftar di atas. Anggota biasa otomatis mulai 0101.'
      : 'Nomor otomatis mulai 0101. Nomor 0001–0100 khusus anggota terpilih dan hanya bisa diberikan Pemilik.';
    const numberBox = make('div', 'card-number-box'); numberBox.append(reservedPick, numberIn);
    const rowA = make('div', 'card-form-row'); rowA.append(field('Nomor anggota', numberBox, numberHint), field('Kecamatan', districtIn));
    const rowB = make('div', 'card-form-row'); rowB.append(field('Tanggal terbit', issuedIn), field('Berlaku sampai', validIn));
    const photoTools = make('div', 'card-photo-tools');
    photoTools.append(field('Perbesar foto', zoomIn), field('Geser kiri–kanan', xIn), field('Geser atas–bawah', yIn));
    photoTools.hidden = true;
    const backTools = make('details', 'card-back-tools');
    backTools.append(make('summary', '', 'Pengaturan sisi belakang (penanda tangan)'));
    const rowC = make('div', 'card-form-row'); rowC.append(field('Nama penanda tangan', signerNameIn), field('Jabatan penanda tangan', signerTitleIn));
    backTools.append(rowC, field('Tanda tangan (PNG latar transparan, opsional)', signatureIn, 'Hanya di perangkat ini selama halaman terbuka. Bila kosong, otomatis dipakai tanda tangan bawaan pusat (bila sudah diunggah Pemilik). Nama & jabatan penanda tangan diingat di browser ini.'));
    if (isOwner()) {
      const centralIn = input('card-signature-central', 'file', { accept: 'image/png,image/webp' });
      const centralBtn = make('button', 'admin-button admin-button-outline', 'Unggah sebagai tanda tangan bawaan semua kartu');
      centralBtn.type = 'button';
      const centralState = make('small', 'privacy-mini', 'Memeriksa tanda tangan bawaan…');
      window.GMPICard.defaultSignatureReady().then(sig => {
        centralState.textContent = sig
          ? 'Tanda tangan bawaan: ✔ TERPASANG — semua unduhan kartu sudah memakainya (pratinjau belakang menampilkannya).'
          : 'Tanda tangan bawaan: ⚠ BELUM terunggah — pilih file lalu klik tombol di bawah ini.';
      }).catch(() => { centralState.textContent = 'Tanda tangan bawaan: tidak bisa diperiksa (jaringan).'; });
      centralBtn.addEventListener('click', async () => {
        const f = centralIn.files && centralIn.files[0];
        if (!f) { setMessage('Pilih dulu file tanda tangan (PNG/WebP latar transparan).', 'error'); return; }
        if (f.size > 2 * 1024 * 1024) { setMessage('File tanda tangan maksimal 2 MB.', 'error'); return; }
        centralBtn.disabled = true;
        const { error: upErr } = await client.storage.from('site-assets').upload('kartu/ttd-ketua.png', f, { upsert: true, contentType: f.type || 'image/png', cacheControl: '60' });
        centralBtn.disabled = false;
        if (upErr) { setMessage('Tanda tangan gagal diunggah: ' + (upErr.message || 'coba lagi.'), 'error'); return; }
        window.GMPICard.clearDefaultSignature();
        await window.GMPICard.defaultSignatureReady();
        centralState.textContent = 'Tanda tangan bawaan: ✔ baru saja terunggah — mulai berlaku di unduhan sekarang.';
        setSide('back');
        setMessage('Tanda tangan bawaan tersimpan. Semua kartu yang diunduh mulai sekarang otomatis memakainya.', 'ok');
      });
      backTools.append(
        field('Tanda tangan Ketua — bawaan pusat (khusus Pemilik)', centralIn, 'Simpan SEKALI di sini; berlaku untuk semua kartu yang diunduh setelahnya, di perangkat mana pun, tanpa pasang ulang.'),
        centralState,
        centralBtn
      );
    }

    const statusLine = make('div', 'card-mode');
    const saveBtn = make('button', 'admin-button admin-button-red', 'Simpan & terbitkan kartu');
    saveBtn.type = 'submit';
    const downloadBtn = make('button', 'admin-button admin-button-gold', 'Unduh depan (PNG)');
    downloadBtn.type = 'button';
    downloadBtn.disabled = true;
    const downloadBackBtn = make('button', 'admin-button admin-button-gold', 'Unduh belakang (PNG)');
    downloadBackBtn.type = 'button';
    downloadBackBtn.disabled = true;
    const newBtn = make('button', 'admin-button admin-button-outline', 'Kartu baru');
    newBtn.type = 'button';
    const btnRow = make('div', 'card-buttons'); btnRow.append(saveBtn, downloadBtn, downloadBackBtn, newBtn);

    const photoField = field('Foto anggota (opsional; unggah manual/pengganti)', photoIn, 'Jika memilih pendaftar tersimpan, foto profil privat dimuat otomatis—tidak perlu memilih file lagi. Foto manual hanya digunakan di sesi/perangkat ini; foto KTP tidak pernah dipakai.');
    const photoSourceStatus = make('small', 'privacy-mini', canSeeMembers()
      ? (regLoadError ? 'Daftar/foto pendaftar tersimpan tidak dapat dimuat. Periksa izin Pemilik/Petugas Registrasi.' : 'Pilih pendaftar tersimpan agar foto profil otomatis dimuat.')
      : 'Pilih foto manual untuk kartu ini.');
    photoField.append(photoSourceStatus);
    const formFields = [statusLine];
    if (canSeeMembers()) formFields.push(memberPickField);
    formFields.push(field('Nama lengkap', nameIn), rowA, field('Jabatan', list, 'Pilih dari daftar sesuai AD/ART. Untuk jabatan Ranting, nama kecamatan ikut ditambahkan otomatis.'), field('Jabatan tertulis di kartu', jabatanIn, 'Ini tulisan yang dicetak pada KTA. Boleh menambahkan bidang, mis. “Wakil Ketua Departemen Pemberdayaan Ekonomi”. Pilihan kategori Jabatan di atas tetap dipertahankan.'), rowB,
      photoField, photoTools, backTools, btnRow);
    formEl.append(...formFields);

    const preview = make('div', 'card-preview');
    const sideSwitch = make('div', 'card-side-switch');
    const frontTab = make('button', 'is-active', 'Depan');
    const backTab = make('button', '', 'Belakang');
    frontTab.type = 'button'; backTab.type = 'button';
    sideSwitch.append(frontTab, backTab);
    const canvas = make('canvas');
    canvas.title = 'Klik untuk membalik kartu';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Pratinjau kartu anggota');
    const verifyLink = make('a', 'admin-link-button card-verify-link', '');
    verifyLink.target = '_blank';
    verifyLink.rel = 'noopener';
    verifyLink.hidden = true;
    preview.append(sideSwitch, canvas, verifyLink, make('small', 'privacy-mini', 'Ukuran cetak: 54 × 85,6 mm (ukuran KTP/ATM), resolusi ± 600 dpi. Cetak di kertas PVC/art carton, tanpa diperkecil.'));
    designer.append(formEl, preview);

    let editing = null; // kartu yang sedang dibuka (sudah terbit)
    let photo = null;
    let signature = null;
    let side = 'front';
    let selectedRegistrationId = null;
    let registrationPhotoId = null;
    let registrationSelectionTouched = false;
    let applyingRegistration = false;
    let photoLoadSequence = 0;
    const normalizeName = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');

    function data() {
      return {
        name: nameIn.value, number: numberIn.value, district: districtIn.value, jabatan: jabatanIn.value,
        issued: issuedIn.value, validUntil: validIn.value, token: editing?.card_token || '',
        photo, photoZoom: Number(zoomIn.value) / 100, photoX: Number(xIn.value) / 100, photoY: Number(yIn.value) / 100, logo,
        signerName: signerNameIn.value, signerTitle: signerTitleIn.value, signature,
        stamp: approvalReady && (!editing || editing.status !== 'aktif') && !(editing && ['nonaktif', 'dicabut'].includes(editing.status)) ? 'DRAF' : ''
      };
    }
    let raf = 0;
    function render(target, which) { return which === 'back' ? window.GMPICard.drawBack(target, data()) : window.GMPICard.draw(target, data()); }
    function redraw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(canvas, side)); }
    async function loadRegistrationPhoto(reg) {
      const sequence = ++photoLoadSequence;
      photo = null;
      registrationPhotoId = null;
      photoIn.value = '';
      photoTools.hidden = true;
      if (!reg?.profile_object_key) {
        photoSourceStatus.textContent = 'Pendaftar ini belum memiliki foto profil tersimpan. Pilih foto secara manual bila tersedia.';
        redraw();
        return false;
      }
      photoSourceStatus.textContent = 'Memuat foto profil tersimpan…';
      redraw();
      const { data, error } = await client.storage.from('member-documents').createSignedUrl(reg.profile_object_key, 60);
      if (sequence !== photoLoadSequence) return false;
      if (error || !data?.signedUrl) {
        photoSourceStatus.textContent = 'Foto profil tersimpan tidak dapat dibuka. Pastikan akun Pemilik/Registrar memiliki akses dokumen.';
        setMessage('Foto profil privat tidak dapat dimuat. Kartu tidak memakai foto KTP; pilih foto manual atau periksa izin akses.', 'error');
        return false;
      }
      const img = await window.GMPICard.loadImage(data.signedUrl, true);
      if (sequence !== photoLoadSequence) return false;
      if (!img) {
        photoSourceStatus.textContent = 'Foto profil tidak berhasil dimuat. Anda dapat memilih foto manual.';
        setMessage('Foto profil tidak berhasil dibaca. Pilih foto manual atau coba lagi.', 'error');
        return false;
      }
      photo = img;
      registrationPhotoId = reg.id;
      photoTools.hidden = false;
      photoSourceStatus.textContent = 'Foto profil tersimpan berhasil dimuat otomatis—tidak perlu memilih ulang.';
      redraw();
      return true;
    }
    function clearSelectedRegistrationIfMismatch() {
      if (applyingRegistration || !selectedRegistrationId) return;
      const reg = regRows.find(r => r.id === selectedRegistrationId);
      if (reg && normalizeName(nameIn.value) === normalizeName(reg.full_name) && districtIn.value === reg.district) return;
      const oldId = selectedRegistrationId;
      selectedRegistrationId = null;
      registrationSelectionTouched = true;
      memberPick.value = '';
      if (registrationPhotoId === oldId) {
        photoLoadSequence += 1;
        registrationPhotoId = null;
        photo = null;
        photoTools.hidden = true;
        photoSourceStatus.textContent = 'Nama/kecamatan diubah; foto otomatis dilepas. Pilih kembali pendaftar atau foto manual.';
        redraw();
      }
    }
    memberPick.addEventListener('change', async () => {
      const reg = regRows.find(r => r.id === memberPick.value);
      registrationSelectionTouched = true;
      if (!reg || reg.status === 'ditolak') {
        selectedRegistrationId = null;
        photoLoadSequence += 1;
        registrationPhotoId = null;
        photo = null;
        photoTools.hidden = true;
        photoSourceStatus.textContent = 'Pilih pendaftar tersimpan untuk memuat foto profil.';
        redraw();
        return;
      }
      selectedRegistrationId = reg.id;
      applyingRegistration = true;
      nameIn.value = reg.full_name || '';
      districtIn.value = reg.district || '';
      jabatanIn.value = reg.jabatan || 'Anggota';
      syncPick();
      refillJabatanPick();
      applyingRegistration = false;
      await loadRegistrationPhoto(reg);
    });
    nameIn.addEventListener('input', clearSelectedRegistrationIfMismatch);
    districtIn.addEventListener('change', clearSelectedRegistrationIfMismatch);
    function setSide(next) {
      side = next;
      frontTab.classList.toggle('is-active', side === 'front');
      backTab.classList.toggle('is-active', side === 'back');
      canvas.classList.remove('is-flipping');
      void canvas.offsetWidth;
      canvas.classList.add('is-flipping');
      setTimeout(redraw, 160);
    }
    frontTab.addEventListener('click', () => setSide('front'));
    backTab.addEventListener('click', () => setSide('back'));
    canvas.addEventListener('click', () => setSide(side === 'front' ? 'back' : 'front'));
    function saveSigner() { try { localStorage.setItem(SIGNER_KEY, JSON.stringify({ name: signerNameIn.value.trim(), title: signerTitleIn.value.trim() })); } catch (e) { /* abaikan */ } }
    [signerNameIn, signerTitleIn].forEach(el => el.addEventListener('input', () => { saveSigner(); if (side !== 'back') setSide('back'); else redraw(); }));
    signatureIn.addEventListener('change', async () => {
      const file = signatureIn.files && signatureIn.files[0];
      if (!file) return;
      const img = await window.GMPICard.loadImage(URL.createObjectURL(file));
      if (!img) { setMessage('File tanda tangan tidak bisa dibaca.', 'error'); return; }
      signature = img;
      setSide('back');
    });

    function setMode() {
      if (editing) {
        const st = editing.status;
        const ok = st === 'aktif';
        statusLine.replaceChildren(make('b', '', ok ? 'Kartu disetujui' : (st === 'menunggu' ? 'Menunggu persetujuan' : 'Kartu tersimpan')), make('span', '', ` · ${editing.member_number} · status ${CARD_STATUS_LABELS[st] || st}${st === 'menunggu' ? ' — QR belum berlaku, kartu belum bisa diunduh' : ''}${st === 'ditolak' && editing.review_note ? ` — catatan: ${editing.review_note}` : ''}`));
        statusLine.classList.toggle('is-pending', !ok);
        saveBtn.textContent = st === 'menunggu' ? 'Simpan perubahan' : 'Simpan perubahan & ajukan ulang';
        saveBtn.hidden = false;
        downloadBtn.disabled = !ok && approvalReady;
        downloadBackBtn.disabled = !ok && approvalReady;
        downloadBtn.title = downloadBtn.disabled ? 'Kartu bisa diunduh setelah disetujui' : '';
        downloadBackBtn.title = downloadBtn.title;
        verifyLink.hidden = false;
        verifyLink.href = `verifikasi.html?k=${encodeURIComponent(editing.card_token)}`;
        verifyLink.textContent = `Cek halaman verifikasi kartu ini ↗`;
      } else {
        statusLine.replaceChildren(make('b', '', 'Kartu baru'), make('span', '', issuer ? ' · setelah disimpan, kartu menunggu persetujuan Penyetuju Kartu' : ' · hanya Petugas Registrasi/Pemilik yang dapat menginput kartu baru'));
        statusLine.classList.remove('is-pending');
        saveBtn.textContent = approvalReady ? 'Simpan & ajukan persetujuan' : 'Simpan & terbitkan kartu';
        saveBtn.hidden = !issuer;
        downloadBtn.disabled = true;
        downloadBackBtn.disabled = true;
        verifyLink.hidden = true;
      }
      numberIn.readOnly = Boolean(editing) && !isOwner();
      reservedPick.hidden = Boolean(editing) || !isOwner();
      redraw();
    }

    function resetForm() {
      editing = null;
      formEl.reset();
      signerNameIn.value = savedSigner.name || signerNameIn.defaultValue || '';
      signerTitleIn.value = savedSigner.title || 'Ketua Umum GMPI';
      try { const s2 = JSON.parse(localStorage.getItem(SIGNER_KEY) || '{}'); if (s2.name) signerNameIn.value = s2.name; if (s2.title) signerTitleIn.value = s2.title; } catch (e) { /* abaikan */ }
      fillReservedPick(); reservedPick.value = '';
      numberIn.value = suggestNumber();
      jabatanIn.value = 'Anggota'; syncPick();
      issuedIn.value = today;
      validIn.value = addYears(today, 2);
      photoLoadSequence += 1;
      photo = null; photoTools.hidden = true; photoIn.value = '';
      selectedRegistrationId = null; registrationPhotoId = null; registrationSelectionTouched = false;
      applyingRegistration = false; memberPick.value = '';
      photoSourceStatus.textContent = canSeeMembers() ? 'Pilih pendaftar tersimpan agar foto profil otomatis dimuat.' : 'Pilih foto manual untuk kartu ini.';
      zoomIn.value = 100; xIn.value = 0; yIn.value = 0;
      setMode();
    }

    async function openCard(card) {
      editing = card;
      photoLoadSequence += 1;
      photo = null; registrationPhotoId = null; photoTools.hidden = true; photoIn.value = '';
      selectedRegistrationId = null; registrationSelectionTouched = false; memberPick.value = '';
      nameIn.value = card.full_name;
      numberIn.value = card.member_number;
      districtIn.value = card.district;
      jabatanIn.value = card.jabatan || 'Anggota';
      // Refresh options against the opened card so its current unique role remains selectable.
      refillJabatanPick(); syncPick();
      issuedIn.value = card.issued_at;
      validIn.value = card.valid_until;
      let reg = card.registration_id ? regRows.find(r => r.id === card.registration_id) : null;
      let ambiguous = false;
      // Kartu lama/tertaut mungkin menunjuk pendaftaran yang lebih lama dari 500 entri awal.
      if (!reg && card.registration_id && canSeeMembers()) {
        const linked = await client.from('member_registrations')
          .select('id,full_name,district,jabatan,status,profile_object_key,created_at')
          .eq('id', card.registration_id).maybeSingle();
        if (!linked.error && linked.data) {
          reg = linked.data;
          regRows.unshift(reg);
          const dateLabel = reg.created_at ? new Date(reg.created_at).toLocaleDateString('id-ID') : '';
          const photoLabel = reg.profile_object_key ? 'foto tersimpan' : 'tanpa foto profil';
          const rejected = reg.status === 'ditolak';
          const option = new Option(`${reg.full_name} · ${reg.district} · ${photoLabel}${dateLabel ? ` · ${dateLabel}` : ''}${rejected ? ' · ditolak (kartu lama)' : ''}`, reg.id);
          if (rejected) option.disabled = true;
          memberPick.append(option);
        }
      }
      if (!reg && canSeeMembers()) {
        const matches = regRows.filter(r => r.status !== 'ditolak' && normalizeName(r.full_name) === normalizeName(card.full_name) && r.district === card.district);
        if (matches.length === 1) reg = matches[0];
        else if (matches.length > 1) ambiguous = true;
      }
      if (reg) {
        selectedRegistrationId = reg.id;
        memberPick.value = reg.id;
        await loadRegistrationPhoto(reg);
      } else {
        photoSourceStatus.textContent = ambiguous
          ? 'Ada beberapa pendaftar dengan nama/kecamatan sama. Pilih entri yang benar di daftar pendaftar tersimpan.'
          : (canSeeMembers() ? 'Belum ada foto profil tersimpan yang cocok. Pilih pendaftar atau foto manual.' : 'Pilih foto manual untuk kartu ini.');
      }
      setMode();
      setMessage(reg && photo ? 'Kartu dibuka. Foto profil tersimpan dimuat otomatis.' : (ambiguous ? 'Kartu dibuka. Pilih pendaftar yang tepat agar foto tersimpan dimuat.' : 'Kartu dibuka. Foto belum tersedia; pilih pendaftar tersimpan atau foto manual.'));
      designer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    [nameIn, numberIn, districtIn, jabatanIn, issuedIn, validIn, zoomIn, xIn, yIn].forEach(el => el.addEventListener('input', redraw));
    numberIn.addEventListener('input', () => { const pos = numberIn.selectionStart; numberIn.value = numberIn.value.toUpperCase().replace(/\s+/g, ''); numberIn.setSelectionRange(pos, pos); });

    photoIn.addEventListener('change', async () => {
      const file = photoIn.files && photoIn.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setMessage('Format foto harus JPG, PNG, atau WebP.', 'error'); return; }
      const url = URL.createObjectURL(file);
      const img = await window.GMPICard.loadImage(url);
      if (!img) { setMessage('Foto tidak bisa dibaca.', 'error'); return; }
      photoLoadSequence += 1;
      photo = img;
      registrationPhotoId = null;
      photoSourceStatus.textContent = 'Foto manual dipilih dari perangkat. Foto ini tidak disimpan ulang ke server.';
      zoomIn.value = 100; xIn.value = 0; yIn.value = 0;
      photoTools.hidden = false;
      redraw();
    });

    formEl.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        full_name: nameIn.value.trim().replace(/\s+/g, ' '),
        district: districtIn.value,
        jabatan: jabatanIn.value.trim() || 'Anggota',
        issued_at: issuedIn.value,
        valid_until: validIn.value
      };
      if (!editing && !selectedRegistrationId && !registrationSelectionTouched && canSeeMembers()) {
        const matches = regRows.filter(r => r.status !== 'ditolak' && normalizeName(r.full_name) === normalizeName(payload.full_name) && r.district === payload.district);
        if (matches.length === 1) selectedRegistrationId = matches[0].id;
      }
      if (!editing || selectedRegistrationId || registrationSelectionTouched) payload.registration_id = selectedRegistrationId || null;
      if (payload.full_name.length < 2) { setMessage('Isi nama lengkap anggota.', 'error'); return; }
      if (!payload.district) { setMessage('Pilih kecamatan.', 'error'); return; }
      if (payload.valid_until < payload.issued_at) { setMessage('Tanggal berlaku harus setelah tanggal terbit.', 'error'); return; }
      if (editing && approvalReady && isOwner()) {
        const newNumber = numberIn.value.trim().toUpperCase();
        if (newNumber !== editing.member_number) {
          if (!/^[A-Z0-9][A-Z0-9./-]{2,39}$/.test(newNumber)) { setMessage('Nomor anggota hanya boleh huruf besar, angka, titik, garis miring, atau strip (3–40 karakter).', 'error'); return; }
          payload.member_number = newNumber;
        }
      }
      if (editing && approvalReady && editing.status !== 'menunggu') {
        const changed = payload.full_name !== editing.full_name || payload.district !== editing.district || payload.jabatan !== editing.jabatan || payload.issued_at !== editing.issued_at || payload.valid_until !== editing.valid_until || Boolean(payload.member_number);
        if (!changed && editing.status !== 'ditolak') { setMessage('Tidak ada perubahan data kartu.'); return; }
        if (editing.status === 'aktif' && !window.confirm('Kartu ini sudah disetujui. Jika datanya diubah, kartu kembali MENUNGGU PERSETUJUAN dan hasil pindai QR berstatus “belum disetujui” sampai disetujui ulang. Lanjutkan?')) return;
      }
      saveBtn.disabled = true;
      let result;
      if (editing) {
        const unchangedRejected = editing.status === 'ditolak' && payload.full_name === editing.full_name && payload.district === editing.district && payload.jabatan === editing.jabatan && payload.issued_at === editing.issued_at && payload.valid_until === editing.valid_until && !payload.member_number;
        result = await client.from('member_cards').update(unchangedRejected ? { status: 'menunggu' } : payload).eq('id', editing.id)
          .select(cols).single();
      } else {
        const number = numberIn.value.trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9./-]{2,39}$/.test(number)) { saveBtn.disabled = false; setMessage('Nomor anggota hanya boleh huruf besar, angka, titik, garis miring, atau strip (3–40 karakter).', 'error'); return; }
        if (isReservedNumber(number) && !isOwner()) { saveBtn.disabled = false; setMessage('Nomor 0001–0100 adalah nomor khusus anggota terpilih dan hanya bisa diberikan oleh Pemilik. Gunakan nomor 0101 ke atas.', 'error'); return; }
        result = await client.from('member_cards').insert({ ...payload, member_number: number })
          .select(cols).single();
      }
      saveBtn.disabled = false;
      if (result.error) {
        const duplicate = String(result.error.code) === '23505';
        setMessage(duplicate ? 'Nomor anggota sudah dipakai kartu lain. Gunakan nomor berbeda.' : cardError(result.error, 'Kartu gagal disimpan. Pastikan migrasi kartu sudah dijalankan dan peran Anda Pemilik/Petugas Registrasi.'), 'error');
        return;
      }
      const wasNew = !editing;
      editing = result.data;
      cards = [editing, ...cards.filter(c => c.id !== editing.id)];
      renderList();
      refillJabatanPick();
      setMode();
      if (editing.status === 'menunggu') setMessage(wasNew ? 'Kartu tersimpan dan MENUNGGU PERSETUJUAN. QR belum berlaku; kartu bisa diunduh setelah disetujui Penyetuju Kartu.' : 'Perubahan tersimpan. Kartu menunggu persetujuan ulang dari Penyetuju Kartu.');
      else setMessage(wasNew ? 'Kartu terbit dan QR sudah aktif. Unduh sisi depan dan belakang (PNG) untuk dicetak.' : 'Perubahan kartu tersimpan. QR tetap sama, jadi kartu lama yang sudah dicetak tetap bisa diverifikasi.');
    });

    function downloadSide(which) {
      if (!editing) return;
      if (approvalReady && editing.status !== 'aktif') { setMessage('Kartu hanya bisa diunduh setelah disetujui dan berstatus Aktif.', 'error'); return; }
      if (which === 'front' && !photo && !window.confirm('Belum ada foto. Unduh sisi depan tanpa foto?')) return;
      const out = document.createElement('canvas');
      render(out, which);
      out.toBlob(blob => {
        if (!blob) { setMessage('Gagal membuat file kartu.', 'error'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `KTA-${editing.member_number.replace(/[^A-Z0-9-]/gi, '_')}-${which === 'back' ? 'belakang' : 'depan'}.png`;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    }
    downloadBtn.addEventListener('click', () => downloadSide('front'));
    downloadBackBtn.addEventListener('click', () => downloadSide('back'));
    newBtn.addEventListener('click', resetForm);

    // --- Daftar kartu ---
    const listHeading = make('div', 'workspace-heading card-list-heading');
    const listTitle = make('div');
    listTitle.append(make('h3', '', 'Daftar kartu'));
    listTitle.append(make('p', '', 'Ubah status menjadi Nonaktif atau Dicabut bila kartu hilang, disalahgunakan, atau anggota keluar — hasil pindai QR langsung berubah.'));
    listHeading.append(listTitle);
    const search = input('card-search', 'search', { placeholder: 'Cari nama / nomor…' });
    search.className = 'card-search';
    listHeading.append(search);
    const listWrap = make('div');

    const pendingBox = make('div', 'card-pending');
    async function decide(card, status) {
      let note = null;
      if (status === 'ditolak') {
        note = window.prompt(`Alasan menolak kartu ${card.member_number} (${card.full_name})? Catatan ini terlihat oleh Petugas Registrasi.`, '');
        if (note === null) return;
        note = note.trim().slice(0, 300) || null;
      } else if (!window.confirm(`Setujui kartu ${card.member_number} atas nama ${card.full_name} (${card.district} · ${card.jabatan})? Setelah disetujui, QR langsung berlaku.`)) return;
      const { data: upd, error: e } = await client.from('member_cards').update(status === 'ditolak' ? { status, review_note: note } : { status }).eq('id', card.id).select(cols).single();
      if (e) { setMessage(cardError(e, 'Keputusan gagal disimpan.'), 'error'); return; }
      Object.assign(card, upd);
      if (editing?.id === card.id) { editing = card; setMode(); }
      renderList();
      refillJabatanPick();
      setMessage(status === 'aktif' ? `Kartu ${card.member_number} DISETUJUI. QR sudah berlaku dan kartu bisa diunduh untuk dicetak.` : `Kartu ${card.member_number} ditolak.`);
    }
    function renderPending() {
      if (!approvalReady) { pendingBox.replaceChildren(); return; }
      const waiting = cards.filter(c => c.status === 'menunggu');
      const mine = waiting.filter(c => approver && (c.submitted_by !== me || isOwner()));
      if (!waiting.length) { pendingBox.replaceChildren(); pendingBox.hidden = true; return; }
      pendingBox.hidden = false;
      const text = approver
        ? (mine.length ? `${mine.length} kartu menunggu persetujuan Anda.` : `${waiting.length} kartu menunggu persetujuan Penyetuju Kartu lain (Anda pembuatnya).`)
        : `${waiting.length} kartu menunggu persetujuan Penyetuju Kartu.`;
      pendingBox.replaceChildren(make('b', '', '⏳ '), make('span', '', text + ' Kartu yang menunggu ada di bagian atas daftar.'));
    }

    function renderList() {
      renderPending();
      const q = search.value.trim().toLowerCase();
      const rank = c => (c.status === 'menunggu' ? 0 : c.status === 'ditolak' ? 1 : 2);
      const shown = cards.filter(c => !q || c.full_name.toLowerCase().includes(q) || c.member_number.toLowerCase().includes(q))
        .slice().sort((a, b) => rank(a) - rank(b));
      const { wrap, body } = makeTable(['No. anggota', 'Nama', 'Kecamatan / jabatan', 'Berlaku s/d', 'Status', 'Aksi']);
      if (!shown.length) {
        listWrap.replaceChildren(make('div', 'table-empty', cards.length ? 'Tidak ada kartu yang cocok.' : 'Belum ada kartu yang diterbitkan.'));
        return;
      }
      shown.forEach(card => {
        const row = make('tr');
        const numCell = make('td', 'mono-cell', card.member_number);
        if (isReservedNumber(card.member_number)) numCell.append(make('span', 'card-reserved-tag', '★ khusus'));
        row.append(numCell);
        row.append(make('td', '', card.full_name));
        row.append(make('td', '', `${card.district} · ${card.jabatan}`));
        const expired = card.valid_until < today;
        row.append(make('td', expired ? 'is-expired' : '', `${window.GMPICard.formatDate(card.valid_until)}${expired ? ' (habis)' : ''}`));
        const statusCell = make('td');
        if (approvalReady && ['menunggu', 'ditolak', 'dicabut'].includes(card.status)) {
          statusCell.append(make('span', `card-state is-${card.status}`, CARD_STATUS_LABELS[card.status]));
          if (card.status === 'ditolak' && card.review_note) statusCell.append(make('small', 'card-note', card.review_note));
          if (card.status === 'menunggu' && card.submitted_by) statusCell.append(make('small', 'card-note', `diajukan ${card.submitted_by}`));
          row.append(statusCell);
        } else {
        const select = make('select');
        const allowed = !approvalReady ? Object.keys(CARD_STATUS_LABELS).filter(k => !['menunggu', 'ditolak'].includes(k))
          : card.status === 'aktif' ? ['aktif', 'nonaktif', 'dicabut']
          : ['nonaktif', 'dicabut', ...(approver && (card.submitted_by !== me || isOwner()) ? ['aktif'] : [])];
        allowed.forEach(value => { const o = new Option(CARD_STATUS_LABELS[value], value); o.selected = card.status === value; select.append(o); });
        if (card.status === 'aktif' && card.approved_by && card.approved_by !== 'sebelum-fitur-persetujuan') statusCell.title = `Disetujui ${card.approved_by}`;
        select.addEventListener('change', async () => {
          if (select.value === 'dicabut' && !window.confirm(`Cabut kartu ${card.member_number}? Hasil pindai QR akan menampilkan “Kartu dicabut”.`)) { select.value = card.status; return; }
          select.disabled = true;
          const { error: updateError } = await client.from('member_cards').update({ status: select.value }).eq('id', card.id);
          select.disabled = false;
          if (updateError) { select.value = card.status; setMessage(cardError(updateError, 'Status kartu gagal diubah.'), 'error'); return; }
          card.status = select.value;
          if (editing?.id === card.id) { editing.status = card.status; setMode(); }
          setMessage(`Status kartu ${card.member_number} menjadi ${CARD_STATUS_LABELS[card.status]}.`);
          renderList();
          refillJabatanPick();
        });
        statusCell.append(select);
        row.append(statusCell);
        }
        const actions = make('td', 'card-actions');
        const openBtn = make('button', 'admin-link-button', !approvalReady || card.status === 'aktif' ? 'Buka & unduh' : 'Buka');
        openBtn.type = 'button';
        openBtn.addEventListener('click', () => openCard(card));
        if (approvalReady && card.status === 'menunggu' && approver) {
          if (card.submitted_by === me && !isOwner()) actions.append(make('small', 'card-note', 'Perlu penyetuju lain'));
          else {
            const okBtn = make('button', 'admin-button admin-button-red card-approve', 'Setujui');
            okBtn.type = 'button';
            okBtn.addEventListener('click', () => decide(card, 'aktif'));
            const noBtn = make('button', 'admin-button admin-button-outline card-reject', 'Tolak');
            noBtn.type = 'button';
            noBtn.addEventListener('click', () => decide(card, 'ditolak'));
            actions.append(okBtn, noBtn);
          }
        }
        if (approvalReady && issuer && ['ditolak', 'dicabut'].includes(card.status)) {
          const again = make('button', 'admin-link-button', 'Ajukan ulang');
          again.type = 'button';
          again.addEventListener('click', async () => {
            if (card.status === 'dicabut' && !window.confirm(`Ajukan ulang kartu ${card.member_number} yang sudah dicabut? Kartu perlu disetujui lagi sebelum berlaku.`)) return;
            const { data: upd, error: e } = await client.from('member_cards').update({ status: 'menunggu' }).eq('id', card.id).select(cols).single();
            if (e) { setMessage(cardError(e, 'Kartu gagal diajukan ulang.'), 'error'); return; }
            Object.assign(card, upd);
            if (editing?.id === card.id) { editing = card; setMode(); }
            renderList();
            setMessage(`Kartu ${card.member_number} diajukan ulang dan menunggu persetujuan.`);
          });
          actions.append(again);
        }
        const checkLink = make('a', 'admin-link-button', 'Cek QR ↗');
        checkLink.href = `verifikasi.html?k=${encodeURIComponent(card.card_token)}`;
        checkLink.target = '_blank'; checkLink.rel = 'noopener';
        actions.append(openBtn, checkLink);
        row.append(actions);
        body.append(row);
      });
      listWrap.replaceChildren(wrap);
    }
    search.addEventListener('input', renderList);

    workspace.replaceChildren(...[heading, setupNote, pendingBox, designer, listHeading, listWrap].filter(Boolean));
    resetForm();
    renderList();
  }

  function showWorkspaceError(text) {
    workspace.replaceChildren(make('div', 'admin-message is-error', text));
  }

  restoreSession();
})();
