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
    registrar: 'Petugas registrasi (data sensitif)',
    media_partner: 'Mitra media (berita)'
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
  function canManageNews() { return canEditContent() || roles.includes('media_partner'); }
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
    if (canManageNews()) tabs.push(['news', 'Berita']);
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
  const JABATAN_SUGGESTIONS = ['Anggota', 'Pengurus DPD', 'Pengurus PAC', 'Satgas Brigade', 'LBH GMPI', 'MPI Sidoarjo', 'SB GMPI', 'Ketua PAC', 'Ketua DPD'];
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
    ['name', 'title'].forEach(k => { if (typeof savedSigner[k] === 'string') savedSigner[k] = savedSigner[k].replace(/\bDPC\b/g, 'DPD'); });
    const signerNameIn = input('card-signer-name', 'text', { maxLength: 80, placeholder: 'Nama Ketua DPD', value: savedSigner.name || '' });
    const signerTitleIn = input('card-signer-title', 'text', { maxLength: 60, value: savedSigner.title || 'Ketua DPD GMPI Sidoarjo' });
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
      signerTitleIn.value = savedSigner.title || 'Ketua DPD GMPI Sidoarjo';
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
