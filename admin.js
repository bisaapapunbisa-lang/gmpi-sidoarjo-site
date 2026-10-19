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
    owner: 'Pemilik / pengelola',
    content_editor: 'Editor situs',
    lbh_officer: 'Petugas LBH',
    registrar: 'Petugas registrasi (data sensitif)'
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
  function canSeeMembers() { return roles.includes('registrar'); }
  function isOwner() { return roles.includes('owner'); }
  function canManageCards() { return roles.includes('owner') || roles.includes('registrar'); }

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
    if (canSeeReports()) tabs.push(['reports', 'Aduan LBH']);
    if (canSeeMembers()) tabs.push(['members', 'Pendaftaran anggota']);
    if (canManageCards()) tabs.push(['cards', 'Kartu anggota']);
    if (isOwner()) tabs.push(['access', 'Hak akses']);
    tabsContainer.replaceChildren();
    tabs.forEach(([key, label], index) => {
      const button = make('button', `admin-tab${index === 0 ? ' is-active' : ''}`, label);
      button.type = 'button';
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
    workspace.replaceChildren(make('div', 'table-empty', 'Memuat…'));
    if (key === 'content' && canEditContent()) return renderContentEditor();
    if (key === 'shop' && canEditContent()) return renderShop();
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
    titleBlock.append(make('p', '', 'Perubahan disimpan ke Supabase dan akan tampil di halaman publik setelah dimuat ulang. Gunakan teks yang telah disetujui DPC.'));
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
  const PRODUCT_CATEGORIES = ['Seragam', 'Kaos & Jaket', 'Atribut', 'Perlengkapan', 'Keanggotaan'];
  const STOCK_LABELS = { tersedia: 'Tersedia', 'pre-order': 'Pre-order', habis: 'Habis' };
  const rupiahAdmin = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0);

  function productImageUrl(path) {
    return path ? client.storage.from('site-assets').getPublicUrl(path).data.publicUrl : '';
  }

  async function compressProductImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const max = 1000;
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
    lh.append(make('h3', '', 'Katalog barang'), make('p', '', 'Barang hanya tampil di situs bila “Tampilkan di situs” dicentang dan harganya lebih dari 0. Draf barang awal sudah disiapkan; lengkapi harga & foto lalu aktifkan.'));
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
        if (p.image_path) { const im = make('img'); im.src = productImageUrl(p.image_path); im.alt = ''; thumb.append(im); }
        else thumb.textContent = 'FOTO';
        const info = make('div', 'shop-admin-info');
        info.append(make('b', '', p.name));
        info.append(make('small', '', `${p.category} · ${rupiahAdmin(p.price)} · ${STOCK_LABELS[p.stock_status]}${p.sizes?.length ? ` · ${p.sizes.join('/')}` : ''}`));
        const state = make('span', `shop-admin-state${p.is_active ? ' is-on' : ''}`, p.is_active ? (p.price > 0 ? 'Tampil' : 'Aktif, harga 0') : 'Draf');
        const edit = make('button', 'admin-button admin-button-outline', 'Ubah');
        edit.type = 'button';
        edit.addEventListener('click', () => openEditor(p));
        row.append(thumb, info, state, edit);
        return row;
      }));
    }

    function openEditor(product) {
      const isNew = !product;
      const p = product || { name: '', category: 'Atribut', description: '', price: 0, sizes: [], image_path: null, stock_status: 'tersedia', is_active: false, sort_order: (products.length + 1) * 10 };
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

      let imagePath = p.image_path;
      const imgPreview = make('div', 'shop-admin-thumb shop-admin-thumb-lg');
      const renderImg = () => {
        imgPreview.replaceChildren();
        if (imagePath) { const im = make('img'); im.src = productImageUrl(imagePath); im.alt = ''; imgPreview.append(im); }
        else imgPreview.textContent = 'Belum ada foto';
      };
      renderImg();
      const fileLabel = make('label', 'file-button', 'Pilih foto barang');
      const fileIn = make('input'); fileIn.type = 'file'; fileIn.accept = 'image/png,image/jpeg,image/webp'; fileIn.hidden = true;
      fileLabel.append(fileIn);
      const imgNote = make('small', 'privacy-mini', 'Foto persegi terlihat paling rapi. Otomatis diperkecil ke maks. 1000 px.');
      fileIn.addEventListener('change', async () => {
        const file = fileIn.files && fileIn.files[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) { imgNote.textContent = 'File terlalu besar (maks. 15 MB).'; return; }
        imgNote.textContent = 'Mengunggah foto…';
        try {
          const blob = await compressProductImage(file);
          const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
          const { error } = await client.storage.from('site-assets').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
          if (error) throw error;
          imagePath = path; renderImg();
          imgNote.textContent = 'Foto terunggah. Klik “Simpan barang” untuk memakainya.';
        } catch (e) {
          imgNote.textContent = 'Foto gagal diunggah. Pastikan migrasi 0005 sudah dijalankan.';
        }
      });
      const imgTools = make('div', 'shop-admin-imgtools');
      const imgSide = make('div'); imgSide.append(fileLabel, imgNote);
      imgTools.append(imgPreview, imgSide);

      const rowA = make('div', 'card-form-row'); rowA.append(field('Kategori', catIn), field('Harga (Rp)', priceIn, 'Isi angka saja, contoh 150000.'));
      const rowB = make('div', 'card-form-row'); rowB.append(field('Status stok', stockIn), field('Urutan tampil', orderIn, 'Angka kecil tampil lebih dulu.'));
      box.append(field('Nama barang', nameIn), rowA, rowB, field('Ukuran (pisahkan dengan koma)', sizesIn, 'Kosongkan bila barang tidak berukuran.'), field('Deskripsi singkat', descIn), field('Foto', imgTools), activeWrap);

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
          price: Math.max(0, Math.round(Number(priceIn.value) || 0)), sizes, image_path: imagePath || null,
          stock_status: stockIn.value, is_active: activeIn.checked, sort_order: Math.round(Number(orderIn.value) || 0),
          updated_at: new Date().toISOString()
        };
        if (payload.is_active && payload.price <= 0 && !window.confirm('Harga masih 0, barang akan tampil tetapi belum bisa dipesan. Lanjutkan?')) return;
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

  // ---- Logo situs: unggah, pilih dari riwayat, kembalikan bawaan ----
  const LOGO_BUCKET = 'site-assets';
  const LOGO_FOLDER = 'logos';
  const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const LOGO_MAX_BYTES = 2 * 1024 * 1024;
  const DEFAULT_LOGO = 'assets/logo-gmpi-sidoarjo-crop.webp';

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

  async function renderReports() {
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Aduan warga'));
    titleBlock.append(make('p', '', 'Hanya petugas LBH dan pemilik Admin yang diberi peran ini dapat membaca laporan. Tidak ada pengaduan yang masuk sampai formulir publik diaktifkan dengan persetujuan DPC.'));
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
    if (!data?.length) body.append(emptyRow(5, 'Belum ada aduan. Formulir publik masih nonaktif.'));
    workspace.replaceChildren(heading, wrap, make('p', 'privacy-mini', 'Hindari menyalin rincian laporan ke perangkat atau kanal pribadi.'));
  }

  async function renderMembers() {
    const heading = make('div', 'workspace-heading');
    const titleBlock = make('div');
    titleBlock.append(make('h3', '', 'Pendaftaran anggota'));
    titleBlock.append(make('p', '', 'Modul ini hanya tersedia untuk peran Petugas Registrasi. NIK ditampilkan tersamar; buka hanya saat benar-benar diperlukan untuk verifikasi.'));
    heading.append(titleBlock);
    const { data, error } = await client.from('member_registrations').select('id,created_at,full_name,nik,phone,district,division,status,ktp_object_key,profile_object_key').order('created_at', { ascending: false }).limit(100);
    if (error) return showWorkspaceError('Data anggota tidak dapat dibuka. Pastikan akun memiliki peran Petugas Registrasi.');
    const { wrap, body } = makeTable(['Tanggal', 'Nama / NIK', 'Kontak / kecamatan', 'Bidang', 'Dokumen', 'Status']);
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
      row.append(make('td', '', `${member.phone} · ${member.district}`));
      row.append(make('td', '', member.division));
      const documents = make('td');
      addDocumentButton(documents, 'KTP', member.ktp_object_key);
      addDocumentButton(documents, 'Profil', member.profile_object_key);
      row.append(documents);
      const statusCell = make('td');
      const select = make('select');
      MEMBER_STATUSES.forEach(value => {
        const option = make('option', '', value);
        option.value = value;
        option.selected = value === member.status;
        select.append(option);
      });
      select.addEventListener('change', async () => {
        select.disabled = true;
        const { error: updateError } = await client.from('member_registrations').update({ status: select.value }).eq('id', member.id);
        select.disabled = false;
        setMessage(updateError ? 'Status anggota tidak berhasil diperbarui.' : 'Status anggota diperbarui.', updateError ? 'error' : 'ok');
      });
      statusCell.append(select);
      row.append(statusCell);
      body.append(row);
    });
    if (!data?.length) body.append(emptyRow(6, 'Belum ada pendaftaran. Formulir publik masih nonaktif.'));
    workspace.replaceChildren(heading, wrap, make('p', 'privacy-mini', 'Dokumen KTP berada di bucket privat. Tautan dokumen berlaku singkat; jangan unduh atau teruskan tanpa dasar tugas.'));
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
    titleBlock.append(make('p', '', 'Undang akun terlebih dahulu melalui Supabase Authentication. Setelah itu, tetapkan peran di sini. Jangan berikan peran Registrar kecuali petugas memang perlu melihat NIK/KTP.'));
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
    workspace.replaceChildren(heading, form, wrap, make('p', 'privacy-mini', 'Peran Owner dapat mengelola isi situs dan daftar hak akses serta melihat aduan. Untuk melihat NIK/KTP, akun Owner juga harus diberi peran Registrar.'));
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
  const JABATAN_SUGGESTIONS = ['Anggota', 'Pengurus DPC', 'Pengurus PAC', 'Satgas Brigade', 'LBH GMPI', 'MPI Sidoarjo', 'SB GMPI', 'Ketua PAC', 'Ketua DPC'];
  const CARD_STATUS_LABELS = { aktif: 'Aktif', nonaktif: 'Nonaktif', dicabut: 'Dicabut' };

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
    const fallback = 'assets/logo-gmpi-sidoarjo-crop.webp';
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
    titleBlock.append(make('p', '', 'Terbitkan kartu vertikal ber-QR. Setiap kartu mendapat kode acak unik; saat dipindai, halaman verifikasi resmi menampilkan nama, nomor, kecamatan, jabatan, status, dan masa berlaku. NIK tidak pernah dicantumkan.'));
    heading.append(titleBlock);

    const { data: cardRows, error } = await client.from('member_cards')
      .select('id,card_token,member_number,full_name,district,jabatan,status,issued_at,valid_until')
      .eq('is_sample', false).order('created_at', { ascending: false }).limit(500);
    if (error) return showWorkspaceError('Data kartu belum bisa dibuka. Jalankan migrasi 202610200004_member_cards.sql di Supabase, lalu muat ulang halaman.');
    let cards = cardRows || [];

    await window.GMPICard.ready();
    const logo = await cardLogo();

    const today = isoDate(new Date());
    const year = today.slice(0, 4);
    function suggestNumber() {
      const prefix = `GMPI-SDA-${year}-`;
      const max = cards.reduce((acc, c) => {
        const m = c.member_number.startsWith(prefix) ? Number(c.member_number.slice(prefix.length)) : 0;
        return Number.isFinite(m) && m > acc ? m : acc;
      }, 0);
      return prefix + String(max + 1).padStart(4, '0');
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
    const list = make('datalist'); list.id = 'card-jabatan-list';
    JABATAN_SUGGESTIONS.forEach(j => list.append(new Option(j, j)));
    jabatanIn.setAttribute('list', list.id);
    const issuedIn = input('card-issued', 'date', { required: true, value: today });
    const validIn = input('card-valid', 'date', { required: true, value: addYears(today, 2) });
    const photoIn = input('card-photo', 'file', { accept: 'image/png,image/jpeg,image/webp' });
    const zoomIn = input('card-zoom', 'range', { min: 100, max: 250, value: 100 });
    const xIn = input('card-x', 'range', { min: -100, max: 100, value: 0 });
    const yIn = input('card-y', 'range', { min: -100, max: 100, value: 0 });
    const SIGNER_KEY = 'gmpi-card-signer';
    const savedSigner = (() => { try { return JSON.parse(localStorage.getItem(SIGNER_KEY) || '{}'); } catch (e) { return {}; } })();
    const signerNameIn = input('card-signer-name', 'text', { maxLength: 80, placeholder: 'Nama Ketua DPC', value: savedSigner.name || '' });
    const signerTitleIn = input('card-signer-title', 'text', { maxLength: 60, value: savedSigner.title || 'Ketua DPC GMPI Sidoarjo' });
    const signatureIn = input('card-signature', 'file', { accept: 'image/png,image/webp' });

    const rowA = make('div', 'card-form-row'); rowA.append(field('Nomor anggota', numberIn, 'Huruf besar, angka, titik, garis miring, atau strip.'), field('Kecamatan', districtIn));
    const rowB = make('div', 'card-form-row'); rowB.append(field('Tanggal terbit', issuedIn), field('Berlaku sampai', validIn));
    const photoTools = make('div', 'card-photo-tools');
    photoTools.append(field('Perbesar foto', zoomIn), field('Geser kiri–kanan', xIn), field('Geser atas–bawah', yIn));
    photoTools.hidden = true;
    const backTools = make('details', 'card-back-tools');
    backTools.append(make('summary', '', 'Pengaturan sisi belakang (penanda tangan)'));
    const rowC = make('div', 'card-form-row'); rowC.append(field('Nama penanda tangan', signerNameIn), field('Jabatan penanda tangan', signerTitleIn));
    backTools.append(rowC, field('Tanda tangan (PNG latar transparan, opsional)', signatureIn, 'Disimpan hanya di perangkat ini selama halaman terbuka; tidak diunggah. Nama & jabatan penanda tangan diingat di browser ini.'));

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

    formEl.append(statusLine, field('Nama lengkap', nameIn), rowA, field('Jabatan / keterangan', jabatanIn, 'Contoh: Anggota, Pengurus PAC, Satgas Brigade.'), list, rowB,
      field('Foto anggota (pas foto, latar polos)', photoIn, 'Foto hanya dipakai di perangkat ini untuk membuat gambar kartu — tidak diunggah atau disimpan di server. Simpan file kartu (PNG) hasil unduhan.'),
      photoTools, backTools, btnRow);

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

    function data() {
      return {
        name: nameIn.value, number: numberIn.value, district: districtIn.value, jabatan: jabatanIn.value,
        issued: issuedIn.value, validUntil: validIn.value, token: editing?.card_token || '',
        photo, photoZoom: Number(zoomIn.value) / 100, photoX: Number(xIn.value) / 100, photoY: Number(yIn.value) / 100, logo,
        signerName: signerNameIn.value, signerTitle: signerTitleIn.value, signature
      };
    }
    let raf = 0;
    function render(target, which) { return which === 'back' ? window.GMPICard.drawBack(target, data()) : window.GMPICard.draw(target, data()); }
    function redraw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(canvas, side)); }
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
        statusLine.replaceChildren(make('b', '', 'Kartu terbit'), make('span', '', ` · ${editing.member_number} · status ${CARD_STATUS_LABELS[editing.status] || editing.status}`));
        saveBtn.textContent = 'Simpan perubahan';
        downloadBtn.disabled = false;
        downloadBackBtn.disabled = false;
        verifyLink.hidden = false;
        verifyLink.href = `verifikasi.html?k=${encodeURIComponent(editing.card_token)}`;
        verifyLink.textContent = `Cek halaman verifikasi kartu ini ↗`;
      } else {
        statusLine.replaceChildren(make('b', '', 'Kartu baru'), make('span', '', ' · QR dibuat otomatis setelah disimpan'));
        saveBtn.textContent = 'Simpan & terbitkan kartu';
        downloadBtn.disabled = true;
        downloadBackBtn.disabled = true;
        verifyLink.hidden = true;
      }
      numberIn.readOnly = Boolean(editing);
      redraw();
    }

    function resetForm() {
      editing = null;
      formEl.reset();
      signerNameIn.value = savedSigner.name || signerNameIn.defaultValue || '';
      signerTitleIn.value = savedSigner.title || 'Ketua DPC GMPI Sidoarjo';
      try { const s2 = JSON.parse(localStorage.getItem(SIGNER_KEY) || '{}'); if (s2.name) signerNameIn.value = s2.name; if (s2.title) signerTitleIn.value = s2.title; } catch (e) { /* abaikan */ }
      numberIn.value = suggestNumber();
      jabatanIn.value = 'Anggota';
      issuedIn.value = today;
      validIn.value = addYears(today, 2);
      photo = null; photoTools.hidden = true;
      zoomIn.value = 100; xIn.value = 0; yIn.value = 0;
      setMode();
    }

    function openCard(card) {
      editing = card;
      nameIn.value = card.full_name;
      numberIn.value = card.member_number;
      districtIn.value = card.district;
      jabatanIn.value = card.jabatan;
      issuedIn.value = card.issued_at;
      validIn.value = card.valid_until;
      setMode();
      setMessage(photo ? 'Kartu dibuka. Periksa foto lalu unduh sisi depan dan belakang.' : 'Kartu dibuka. Pilih foto anggota, lalu unduh sisi depan dan belakang.');
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
      photo = img;
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
      if (payload.full_name.length < 2) { setMessage('Isi nama lengkap anggota.', 'error'); return; }
      if (!payload.district) { setMessage('Pilih kecamatan.', 'error'); return; }
      if (payload.valid_until < payload.issued_at) { setMessage('Tanggal berlaku harus setelah tanggal terbit.', 'error'); return; }
      saveBtn.disabled = true;
      let result;
      if (editing) {
        result = await client.from('member_cards').update(payload).eq('id', editing.id)
          .select('id,card_token,member_number,full_name,district,jabatan,status,issued_at,valid_until').single();
      } else {
        const number = numberIn.value.trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9./-]{2,39}$/.test(number)) { saveBtn.disabled = false; setMessage('Nomor anggota hanya boleh huruf besar, angka, titik, garis miring, atau strip (3–40 karakter).', 'error'); return; }
        result = await client.from('member_cards').insert({ ...payload, member_number: number })
          .select('id,card_token,member_number,full_name,district,jabatan,status,issued_at,valid_until').single();
      }
      saveBtn.disabled = false;
      if (result.error) {
        const duplicate = String(result.error.code) === '23505';
        setMessage(duplicate ? 'Nomor anggota sudah dipakai kartu lain. Gunakan nomor berbeda.' : 'Kartu gagal disimpan. Pastikan migrasi kartu sudah dijalankan dan peran Anda Pemilik/Petugas Registrasi.', 'error');
        return;
      }
      const wasNew = !editing;
      editing = result.data;
      cards = [editing, ...cards.filter(c => c.id !== editing.id)];
      renderList();
      setMode();
      setMessage(wasNew ? 'Kartu terbit dan QR sudah aktif. Unduh sisi depan dan belakang (PNG) untuk dicetak.' : 'Perubahan kartu tersimpan. QR tetap sama, jadi kartu lama yang sudah dicetak tetap bisa diverifikasi.');
    });

    function downloadSide(which) {
      if (!editing) return;
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
    listTitle.append(make('h3', '', 'Kartu yang sudah terbit'));
    listTitle.append(make('p', '', 'Ubah status menjadi Nonaktif atau Dicabut bila kartu hilang, disalahgunakan, atau anggota keluar — hasil pindai QR langsung berubah.'));
    listHeading.append(listTitle);
    const search = input('card-search', 'search', { placeholder: 'Cari nama / nomor…' });
    search.className = 'card-search';
    listHeading.append(search);
    const listWrap = make('div');

    function renderList() {
      const q = search.value.trim().toLowerCase();
      const shown = cards.filter(c => !q || c.full_name.toLowerCase().includes(q) || c.member_number.toLowerCase().includes(q));
      const { wrap, body } = makeTable(['No. anggota', 'Nama', 'Kecamatan / jabatan', 'Berlaku s/d', 'Status', 'Aksi']);
      if (!shown.length) {
        listWrap.replaceChildren(make('div', 'table-empty', cards.length ? 'Tidak ada kartu yang cocok.' : 'Belum ada kartu yang diterbitkan.'));
        return;
      }
      shown.forEach(card => {
        const row = make('tr');
        row.append(make('td', 'mono-cell', card.member_number));
        row.append(make('td', '', card.full_name));
        row.append(make('td', '', `${card.district} · ${card.jabatan}`));
        const expired = card.valid_until < today;
        row.append(make('td', expired ? 'is-expired' : '', `${window.GMPICard.formatDate(card.valid_until)}${expired ? ' (habis)' : ''}`));
        const statusCell = make('td');
        const select = make('select');
        Object.entries(CARD_STATUS_LABELS).forEach(([value, label]) => { const o = new Option(label, value); o.selected = card.status === value; select.append(o); });
        select.addEventListener('change', async () => {
          if (select.value === 'dicabut' && !window.confirm(`Cabut kartu ${card.member_number}? Hasil pindai QR akan menampilkan “Kartu dicabut”.`)) { select.value = card.status; return; }
          select.disabled = true;
          const { error: updateError } = await client.from('member_cards').update({ status: select.value }).eq('id', card.id);
          select.disabled = false;
          if (updateError) { select.value = card.status; setMessage('Status kartu gagal diubah.', 'error'); return; }
          card.status = select.value;
          if (editing?.id === card.id) { editing.status = card.status; setMode(); }
          setMessage(`Status kartu ${card.member_number} menjadi ${CARD_STATUS_LABELS[card.status]}.`);
        });
        statusCell.append(select);
        row.append(statusCell);
        const actions = make('td', 'card-actions');
        const openBtn = make('button', 'admin-link-button', 'Buka & unduh');
        openBtn.type = 'button';
        openBtn.addEventListener('click', () => openCard(card));
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

    workspace.replaceChildren(heading, designer, listHeading, listWrap);
    resetForm();
    renderList();
  }

  function showWorkspaceError(text) {
    workspace.replaceChildren(make('div', 'admin-message is-error', text));
  }

  restoreSession();
})();
