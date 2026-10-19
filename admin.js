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
    if (canSeeReports()) tabs.push(['reports', 'Aduan LBH']);
    if (canSeeMembers()) tabs.push(['members', 'Pendaftaran anggota']);
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
    if (key === 'reports' && canSeeReports()) return renderReports();
    if (key === 'members' && canSeeMembers()) return renderMembers();
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

  function showWorkspaceError(text) {
    workspace.replaceChildren(make('div', 'admin-message is-error', text));
  }

  restoreSession();
})();
