/*
  Toko perlengkapan GMPI Sidoarjo.
  - Katalog dibaca dari Supabase (hanya barang aktif).
  - Keranjang disimpan di perangkat pembeli (localStorage).
  - Pembayaran: QRIS statis resmi organisasi (nominal diketik pembeli) atau transfer bank.
  - Pesanan + bukti bayar dikirim ke WhatsApp admin. Website tidak menyimpan data pembeli.
*/
(() => {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const root = config.url ? (config.url.endsWith('/') ? config.url.slice(0, -1) : config.url) : '';
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` };
  const filtersEl = document.getElementById('shop-filters');
  const fab = document.getElementById('cart-fab');
  const fabCount = document.getElementById('cart-count');
  const drawer = document.getElementById('cart-drawer');
  const backdrop = document.getElementById('cart-backdrop');
  const CART_KEY = 'gmpi-cart-v1';
  const DISTRICTS = ['Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik','Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'];
  const rupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  const IMG_RE = /^products\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

  let products = [];

  // Daftar barang bawaan: tampil walau database belum diisi. Begitu pengurus
  // mengaktifkan barang di Admin → Toko, daftar dari database yang dipakai.
  const DEFAULT_PRODUCTS = [
    { id: 'default-seragam', name: 'Seragam GMPI', category: 'Seragam', description: 'Seragam resmi organisasi lengkap dengan atribut GMPI.', price: 0, sizes: ['S','M','L','XL','XXL','XXXL'], image_path: null, stock_status: 'tersedia' },
    { id: 'default-kaos', name: 'Kaos GMPI', category: 'Kaos', description: 'Kaos organisasi dengan lambang GMPI.', price: 0, sizes: ['S','M','L','XL','XXL','XXXL'], image_path: null, stock_status: 'tersedia' },
    { id: 'default-topi', name: 'Topi GMPI', category: 'Atribut', description: 'Topi dengan bordir lambang GMPI.', price: 0, sizes: [], image_path: null, stock_status: 'tersedia' },
    { id: 'default-logo', name: 'Logo GMPI', category: 'Atribut', description: 'Logo / lambang GMPI untuk seragam, kendaraan, dan sekretariat.', price: 0, sizes: [], image_path: null, stock_status: 'tersedia' },
    { id: 'default-emblem', name: 'Emblem GMPI', category: 'Atribut', description: 'Emblem bordir lambang GMPI untuk lengan seragam.', price: 0, sizes: [], image_path: null, stock_status: 'tersedia' }
  ];

  const ICONS = {
    seragam: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M44 20 60 30 76 20l22 10 10 26-16 6v42H28V62l-16-6 10-26Z"/><path d="M44 20 60 46 76 20M60 46v54M52 58h0M52 72h0M52 86h0"/><path d="M70 56h14v8H70z"/></svg>',
    kaos: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M46 20c3 8 25 8 28 0l26 12-8 20-12-5v55H40V47l-12 5-8-20Z"/><circle cx="60" cy="62" r="9"/></svg>',
    topi: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M22 74c0-24 16-40 38-40s38 16 38 40Z"/><path d="M22 74h76c6 0 12 4 12 9-20 4-60 4-88-9Z"/><path d="M60 34v40M60 34c-8 10-12 24-12 40M60 34c8 10 12 24 12 40"/><circle cx="60" cy="31" r="3"/></svg>',
    emblem: '<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 14 98 28v30c0 24-16 40-38 48-22-8-38-24-38-48V28Z"/><path d="M60 24 88 34v24c0 18-12 30-28 37-16-7-28-19-28-37V34Z" stroke-dasharray="3 4"/><path d="m60 42 5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1Z"/></svg>'
  };
  function iconFor(p) {
    const t = `${p.name} ${p.category}`.toLowerCase();
    if (/seragam|pdh|pdl|kemeja/.test(t)) return ICONS.seragam;
    if (/kaos|jaket|polo/.test(t)) return ICONS.kaos;
    if (/topi|cap/.test(t)) return ICONS.topi;
    if (/emblem|badge|bordir|pin/.test(t)) return ICONS.emblem;
    return '';
  }
  let settings = { shop_whatsapp: '', shop_bank: '', legal_npwp: '' };
  let activeCategory = 'Semua';
  let cart = loadCart();
  let lastOrder = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function loadCart() {
    try { const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* abaikan */ }
    updateFab();
  }
  function productById(id) { return products.find(p => p.id === id); }
  function cartLines() {
    return cart.map(item => ({ item, product: productById(item.id) }))
      .filter(l => l.product && l.product.price > 0 && l.product.stock_status !== 'habis');
  }
  function cartTotal() { return cartLines().reduce((sum, l) => sum + l.product.price * l.item.qty, 0); }
  function cartCount() { return cartLines().reduce((sum, l) => sum + l.item.qty, 0); }
  function imageUrl(path) { return path && IMG_RE.test(path) ? `${root}/storage/v1/object/public/site-assets/${path}` : ''; }

  const ANGLES = ['Depan', 'Samping kiri', 'Samping kanan'];
  // Foto barang: images = [depan, kiri, kanan] (slot kosong = ''); image_path = foto lama/utama.
  function productPhotos(p) {
    const list = [];
    if (Array.isArray(p.images) && p.images.length) {
      p.images.slice(0, 3).forEach((path, i) => { const url = imageUrl(path); if (url) list.push({ url, label: ANGLES[i] }); });
    }
    if (!list.length) { const url = imageUrl(p.image_path); if (url) list.push({ url, label: 'Depan' }); }
    if (!list.length && /seragam|pdh|kemeja/i.test(`${p.name} ${p.category}`)) {
      // Belum ada foto asli: pakai ilustrasi model seragam GMPI (hitam, kerah & tutup saku merah).
      ['depan', 'kiri', 'kanan'].forEach((k, i) => list.push({ url: `assets/products/seragam-${k}.svg`, label: ANGLES[i], illustration: true }));
    }
    return list;
  }

  function buildGallery(p, photos) {
    const wrap = el('div', 'product-gallery');
    const img = el('img');
    img.alt = `${p.name} — ${photos[0].label}`; img.loading = 'lazy'; img.decoding = 'async'; img.src = photos[0].url;
    const zoom = el('button', 'product-zoom'); zoom.type = 'button';
    zoom.setAttribute('aria-label', `Perbesar foto ${p.name}`);
    zoom.append(img);
    wrap.append(zoom);
    let index = 0;
    let tabs = [];
    const show = i => {
      index = (i + photos.length) % photos.length;
      img.src = photos[index].url; img.alt = `${p.name} — ${photos[index].label}`;
      tabs.forEach((t, k) => { t.classList.toggle('is-active', k === index); t.setAttribute('aria-pressed', String(k === index)); });
    };
    if (photos.length > 1) {
      const strip = el('div', 'product-angles');
      strip.setAttribute('role', 'group'); strip.setAttribute('aria-label', 'Pilih sudut foto');
      tabs = photos.map((ph, k) => {
        const t = el('button', `product-angle${k === 0 ? ' is-active' : ''}`);
        t.type = 'button'; t.setAttribute('aria-pressed', String(k === 0)); t.title = ph.label;
        const th = el('img'); th.src = ph.url; th.alt = ''; th.loading = 'lazy';
        t.append(th, el('span', '', ph.label.replace('Samping ', '')));
        t.addEventListener('click', e => { e.stopPropagation(); show(k); });
        return t;
      });
      strip.append(...tabs);
      wrap.append(strip);
      // Geser (swipe) di HP
      let startX = null;
      zoom.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
      zoom.addEventListener('touchend', e => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX; startX = null;
        if (Math.abs(dx) > 40) { show(index + (dx < 0 ? 1 : -1)); zoom.dataset.swiped = '1'; setTimeout(() => { delete zoom.dataset.swiped; }, 350); }
      });
    }
    zoom.addEventListener('click', () => { if (!zoom.dataset.swiped) openPhotoViewer(p, photos, index); });
    return wrap;
  }

  // Penampil foto besar
  const viewer = document.getElementById('photo-viewer');
  let viewerState = null;
  function renderViewer() {
    const { p, photos, index } = viewerState;
    viewer.querySelector('.pv-img').src = photos[index].url;
    viewer.querySelector('.pv-img').alt = `${p.name} — ${photos[index].label}`;
    viewer.querySelector('.pv-title').textContent = p.name;
    viewer.querySelector('.pv-label').textContent = `${photos[index].illustration ? 'Ilustrasi · ' : ''}${photos[index].label} · ${index + 1}/${photos.length}`;
    viewer.querySelectorAll('.pv-nav').forEach(b => { b.hidden = photos.length < 2; });
  }
  function openPhotoViewer(p, photos, index) {
    if (!viewer) return;
    viewerState = { p, photos, index };
    renderViewer();
    viewer.hidden = false;
    viewer.querySelector('.pv-close').focus();
  }
  function stepViewer(d) {
    if (!viewerState) return;
    viewerState.index = (viewerState.index + d + viewerState.photos.length) % viewerState.photos.length;
    renderViewer();
  }
  if (viewer) {
    viewer.querySelector('.pv-prev').addEventListener('click', () => stepViewer(-1));
    viewer.querySelector('.pv-next').addEventListener('click', () => stepViewer(1));
    viewer.querySelector('.pv-close').addEventListener('click', () => { viewer.hidden = true; });
    viewer.addEventListener('click', e => { if (e.target === viewer) viewer.hidden = true; });
    let sx = null;
    viewer.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    viewer.addEventListener('touchend', e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 40) stepViewer(dx < 0 ? 1 : -1); });
    document.addEventListener('keydown', e => {
      if (viewer.hidden) return;
      if (e.key === 'Escape') { viewer.hidden = true; e.stopImmediatePropagation(); }
      if (e.key === 'ArrowLeft') stepViewer(-1);
      if (e.key === 'ArrowRight') stepViewer(1);
    }, true);
  }

  function updateFab() {
    const count = cartCount();
    fabCount.textContent = count;
    fab.hidden = count === 0;
  }

  // ---------- Katalog ----------
  function renderFilters() {
    const cats = ['Semua', ...new Set(products.map(p => p.category))];
    filtersEl.replaceChildren(...cats.map(cat => {
      const b = el('button', `shop-filter${cat === activeCategory ? ' is-active' : ''}`, cat);
      b.type = 'button';
      b.addEventListener('click', () => { activeCategory = cat; renderFilters(); renderGrid(); });
      return b;
    }));
    filtersEl.hidden = cats.length <= 2;
  }

  function renderGrid() {
    const list = products.filter(p => activeCategory === 'Semua' || p.category === activeCategory);
    if (!list.length) {
      grid.replaceChildren(el('div', 'shop-empty', 'Katalog sedang disiapkan pengurus. Silakan cek kembali dalam waktu dekat.'));
      return;
    }
    const cards = list.map(p => {
      const card = el('article', 'product-card');
      const media = el('div', 'product-media');
      const photos = productPhotos(p);
      if (photos.length) {
        media.append(buildGallery(p, photos));
        if (photos[0].illustration) { media.append(el('span', 'product-illus', 'Ilustrasi model')); card.classList.add('has-illus'); }
      } else {
        const ph = el('div', 'product-placeholder');
        const icon = iconFor(p);
        if (icon) {
          const wrap = el('div', 'product-icon');
          wrap.innerHTML = icon; // SVG statis milik situs, bukan data pengguna
          ph.append(wrap);
        } else {
          const logo = el('img');
          logo.src = 'assets/logo-gmpi-sidoarjo-crop.webp'; logo.alt = '';
          ph.append(logo);
        }
        ph.append(el('span', '', 'FOTO MENYUSUL'));
        media.append(ph);
      }
      if (p.stock_status !== 'tersedia') media.append(el('span', `product-badge is-${p.stock_status}`, p.stock_status === 'habis' ? 'Stok habis' : 'Pre-order'));
      media.append(el('span', 'product-cat', p.category));

      const body = el('div', 'product-body');
      body.append(el('h3', '', p.name));
      if (p.description) body.append(el('p', 'product-desc', p.description));
      const orderable = p.price > 0 && p.stock_status !== 'habis';
      if (!(p.price > 0)) {
        if (Array.isArray(p.sizes) && p.sizes.length) body.append(el('div', 'product-sizes', `Ukuran: ${p.sizes.length > 2 ? `${p.sizes[0]}–${p.sizes[p.sizes.length - 1]}` : p.sizes.join(', ')}`));
        body.append(el('div', 'product-price is-soon', 'Harga segera diumumkan'));
        card.classList.add('is-soon');
        card.append(media, body);
        return card;
      }
      const price = el('div', 'product-price', rupiah(p.price));
      body.append(price);

      const controls = el('div', 'product-controls');
      let sizeSel = null;
      if (Array.isArray(p.sizes) && p.sizes.length) {
        sizeSel = el('select', 'product-size');
        sizeSel.setAttribute('aria-label', `Ukuran ${p.name}`);
        sizeSel.append(new Option('Ukuran', ''));
        p.sizes.forEach(s => sizeSel.append(new Option(s, s)));
        controls.append(sizeSel);
      }
      const qtyWrap = el('div', 'qty');
      const minus = el('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Kurangi jumlah');
      const qty = el('input'); qty.type = 'number'; qty.min = 1; qty.max = 99; qty.value = 1; qty.inputMode = 'numeric'; qty.setAttribute('aria-label', `Jumlah ${p.name}`);
      const plus = el('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Tambah jumlah');
      minus.addEventListener('click', () => { qty.value = Math.max(1, Number(qty.value) - 1); });
      plus.addEventListener('click', () => { qty.value = Math.min(99, Number(qty.value) + 1); });
      qtyWrap.append(minus, qty, plus);
      controls.append(qtyWrap);

      const add = el('button', 'product-add', p.stock_status === 'habis' ? 'Stok habis' : (p.price > 0 ? 'Tambah ke keranjang' : 'Belum bisa dipesan'));
      add.type = 'button';
      add.disabled = p.stock_status === 'habis' || !(p.price > 0);
      add.addEventListener('click', () => {
        const size = sizeSel ? sizeSel.value : '';
        if (sizeSel && !size) { sizeSel.focus(); sizeSel.classList.add('is-invalid'); setTimeout(() => sizeSel.classList.remove('is-invalid'), 1200); return; }
        const n = Math.max(1, Math.min(99, Math.round(Number(qty.value) || 1)));
        const existing = cart.find(c => c.id === p.id && c.size === size);
        if (existing) existing.qty = Math.min(99, existing.qty + n);
        else cart.push({ id: p.id, size, qty: n });
        saveCart();
        add.textContent = '✓ Masuk keranjang';
        add.classList.add('is-added');
        fab.classList.remove('is-bump'); void fab.offsetWidth; fab.classList.add('is-bump');
        setTimeout(() => { add.textContent = 'Tambah ke keranjang'; add.classList.remove('is-added'); }, 1400);
      });
      body.append(controls, add);
      if (!orderable) controls.hidden = true;
      card.append(media, body);
      return card;
    });
    if (activeCategory === 'Semua') {
      const more = el('article', 'product-card product-more');
      more.append(el('span', 'product-more-plus', '+'), el('h3', '', 'Barang lain menyusul'), el('p', '', 'Jaket, pin, bendera, stiker, dan perlengkapan lainnya akan ditambahkan pengurus.'));
      cards.push(more);
    }
    grid.replaceChildren(...cards);
    const how = document.querySelector('.shop-how');
    const anyOrderable = products.some(p => p.price > 0 && p.stock_status !== 'habis');
    if (how) how.hidden = !anyOrderable;
    const soon = document.getElementById('shop-soon-note');
    if (soon) soon.hidden = anyOrderable;
  }

  // ---------- Keranjang & checkout ----------
  const steps = {
    cart: drawer.querySelector('[data-step="cart"]'),
    form: drawer.querySelector('[data-step="form"]'),
    pay: drawer.querySelector('[data-step="pay"]')
  };
  const orderForm = steps.form;
  const districtSel = orderForm.querySelector('#order-district');
  DISTRICTS.forEach(d => districtSel.append(new Option(d, d)));

  function showStep(name) {
    Object.entries(steps).forEach(([k, node]) => { node.hidden = k !== name; });
    drawer.querySelector('.cart-steps').dataset.current = name;
    drawer.querySelector('.cart-scroll').scrollTop = 0;
  }
  function openDrawer() {
    renderCart();
    showStep(cartLines().length ? 'cart' : 'cart');
    drawer.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); });
    document.body.classList.add('cart-open');
    drawer.querySelector('.cart-close').focus();
  }
  function closeDrawer() {
    drawer.classList.remove('is-open'); backdrop.classList.remove('is-open');
    document.body.classList.remove('cart-open');
    setTimeout(() => { drawer.hidden = true; backdrop.hidden = true; }, 260);
    fab.focus();
  }

  function renderCart() {
    const list = steps.cart.querySelector('.cart-items');
    const lines = cartLines();
    if (!lines.length) {
      list.replaceChildren(el('div', 'cart-empty', 'Keranjang masih kosong.'));
    } else {
      list.replaceChildren(...lines.map(({ item, product }) => {
        const row = el('div', 'cart-item');
        const info = el('div', 'cart-item-info');
        info.append(el('b', '', product.name));
        info.append(el('small', '', `${item.size ? `Ukuran ${item.size} · ` : ''}${rupiah(product.price)}`));
        const q = el('div', 'qty qty-sm');
        const minus = el('button', '', '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Kurangi');
        const val = el('span', '', item.qty);
        const plus = el('button', '', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Tambah');
        minus.addEventListener('click', () => { item.qty -= 1; if (item.qty < 1) cart = cart.filter(c => c !== item); saveCart(); renderCart(); });
        plus.addEventListener('click', () => { item.qty = Math.min(99, item.qty + 1); saveCart(); renderCart(); });
        q.append(minus, val, plus);
        const sub = el('b', 'cart-item-sub', rupiah(product.price * item.qty));
        row.append(info, q, sub);
        return row;
      }));
    }
    steps.cart.querySelector('.cart-total-value').textContent = rupiah(cartTotal());
    steps.cart.querySelector('.to-form').disabled = !lines.length;
  }

  function orderCode() {
    const d = new Date();
    const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => abc[b % abc.length]).join('');
    return `GMPI-${ymd}-${rnd}`;
  }
  function normalizePhone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    if (d.startsWith('8')) d = '62' + d;
    return d;
  }

  function buildMessage(order) {
    const lines = [];
    lines.push('*PESANAN PERLENGKAPAN GMPI SIDOARJO*');
    lines.push(`Kode pesanan: ${order.code}`);
    lines.push('');
    order.items.forEach((it, i) => lines.push(`${i + 1}. ${it.name}${it.size ? ` (${it.size})` : ''} × ${it.qty} = ${rupiah(it.subtotal)}`));
    lines.push('');
    lines.push(`*Total barang: ${rupiah(order.total)}*`);
    lines.push(order.delivery === 'kirim' ? `Pengiriman: dikirim ke ${order.address} (ongkir mohon dikonfirmasi)` : 'Pengambilan: ambil di sekretariat');
    lines.push('');
    lines.push(`Nama: ${order.name}`);
    lines.push(`WhatsApp: ${order.phone}`);
    lines.push(`Kecamatan/PAC: ${order.district}`);
    if (order.note) lines.push(`Catatan: ${order.note}`);
    lines.push('');
    lines.push(order.delivery === 'kirim'
      ? 'Saya akan membayar via QRIS/transfer setelah total + ongkir dikonfirmasi.'
      : `Pembayaran: ${order.method === 'bank' ? 'transfer bank' : 'QRIS GMPI DPD SIDOARJO'} sebesar ${rupiah(order.total)}. Bukti bayar saya lampirkan.`);
    return lines.join('\n');
  }

  function renderPay(order) {
    const pay = steps.pay;
    pay.querySelector('.pay-code').textContent = order.code;
    pay.querySelector('.pay-total').textContent = rupiah(order.total);
    pay.querySelector('.pay-delivery-note').hidden = order.delivery !== 'kirim';
    const bank = pay.querySelector('.pay-bank');
    bank.hidden = !settings.shop_bank;
    pay.querySelector('.pay-bank-text').textContent = settings.shop_bank;
    const wa = pay.querySelector('.pay-wa');
    const warn = pay.querySelector('.pay-wa-missing');
    if (/^62\d{8,13}$/.test(settings.shop_whatsapp)) {
      wa.href = `https://wa.me/${settings.shop_whatsapp}?text=${encodeURIComponent(buildMessage(order))}`;
      wa.classList.remove('is-disabled'); wa.removeAttribute('aria-disabled'); warn.hidden = true;
    } else {
      wa.removeAttribute('href'); wa.classList.add('is-disabled'); wa.setAttribute('aria-disabled', 'true'); warn.hidden = false;
    }
  }

  steps.cart.querySelector('.to-form').addEventListener('click', () => showStep('form'));
  orderForm.querySelector('.to-cart').addEventListener('click', () => showStep('cart'));
  steps.pay.querySelector('.to-form-again').addEventListener('click', () => showStep('form'));
  orderForm.querySelectorAll('input[name="delivery"]').forEach(r => r.addEventListener('change', () => {
    const kirim = orderForm.elements.delivery.value === 'kirim';
    orderForm.querySelector('.order-address').hidden = !kirim;
    orderForm.elements.address.required = kirim;
  }));
  steps.pay.querySelectorAll('input[name="paymethod"]').forEach(r => r.addEventListener('change', () => {
    const method = steps.pay.querySelector('input[name="paymethod"]:checked').value;
    steps.pay.querySelector('.pay-qris').hidden = method !== 'qris';
    steps.pay.querySelector('.pay-bank-box').hidden = method !== 'bank';
    if (lastOrder) { lastOrder.method = method; renderPay(lastOrder); }
  }));

  orderForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!orderForm.reportValidity()) return;
    const f = orderForm.elements;
    const phone = normalizePhone(f.phone.value);
    if (!/^62\d{8,13}$/.test(phone)) { f.phone.setCustomValidity('Nomor WhatsApp tidak valid'); f.phone.reportValidity(); f.phone.setCustomValidity(''); return; }
    const lines = cartLines();
    if (!lines.length) { showStep('cart'); return; }
    lastOrder = {
      code: orderCode(),
      items: lines.map(({ item, product }) => ({ name: product.name, size: item.size, qty: item.qty, subtotal: product.price * item.qty })),
      total: cartTotal(),
      name: f.name.value.trim(),
      phone: `+${phone}`,
      district: f.district.value,
      delivery: f.delivery.value,
      address: f.address.value.trim(),
      note: f.note.value.trim(),
      method: (steps.pay.querySelector('input[name="paymethod"]:checked') || {}).value || 'qris'
    };
    renderPay(lastOrder);
    showStep('pay');
  });

  steps.pay.querySelector('.pay-done').addEventListener('click', () => {
    if (!window.confirm('Pesanan sudah dikirim ke WhatsApp admin? Keranjang akan dikosongkan.')) return;
    cart = []; saveCart(); orderForm.reset();
    orderForm.querySelector('.order-address').hidden = true;
    lastOrder = null;
    closeDrawer();
  });

  // Perbesar QRIS
  const lightbox = document.getElementById('qris-lightbox');
  drawer.querySelector('.pay-qris-zoom').addEventListener('click', () => { lightbox.hidden = false; lightbox.querySelector('button').focus(); });
  lightbox.addEventListener('click', e => { if (e.target === lightbox || e.target.closest('button')) lightbox.hidden = true; });

  fab.addEventListener('click', openDrawer);
  backdrop.addEventListener('click', closeDrawer);
  drawer.querySelector('.cart-close').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!lightbox.hidden) { lightbox.hidden = true; return; }
    if (!drawer.hidden) closeDrawer();
  });

  // ---------- Muat data ----------
  async function load() {
    try {
      if (!root || !config.publishableKey) throw new Error('not configured');
      const productUrl = cols => `${root}/rest/v1/shop_products?select=${cols}&is_active=eq.true&order=sort_order.asc,created_at.asc`;
      const baseCols = 'id,name,category,description,price,sizes,image_path,stock_status,sort_order';
      let [pRes, sRes] = await Promise.all([
        fetch(productUrl(`${baseCols},images`), { headers }),
        fetch(`${root}/rest/v1/site_content?select=key,value&key=in.(shop_whatsapp,shop_bank,legal_npwp)`, { headers })
      ]);
      // Database lama tanpa kolom "images": ulangi tanpa kolom itu.
      if (!pRes.ok && pRes.status === 400) pRes = await fetch(productUrl(baseCols), { headers });
      products = pRes.ok ? await pRes.json() : [];
      const rows = sRes.ok ? await sRes.json() : [];
      rows.forEach(r => { if (r.value && typeof r.value.text === 'string') settings[r.key] = r.value.text.trim(); });
    } catch (e) {
      products = [];
    }
    if (!Array.isArray(products) || !products.length) products = DEFAULT_PRODUCTS.slice();
    // Legalitas & kanal pembayaran resmi
    const npwpCard = document.getElementById('legal-npwp-card');
    if (npwpCard && settings.legal_npwp) { document.getElementById('legal-npwp').textContent = settings.legal_npwp; npwpCard.hidden = false; }
    const bankLegal = document.getElementById('legal-bank');
    if (bankLegal) { bankLegal.textContent = settings.shop_bank; bankLegal.hidden = !settings.shop_bank; }

    cart = cart.filter(c => productById(c.id));
    saveCart();
    renderFilters();
    renderGrid();
  }
  load();
})();
