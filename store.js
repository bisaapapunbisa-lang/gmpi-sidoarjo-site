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
    grid.replaceChildren(...list.map(p => {
      const card = el('article', 'product-card');
      const media = el('div', 'product-media');
      const url = imageUrl(p.image_path);
      if (url) {
        const img = el('img');
        img.src = url; img.alt = p.name; img.loading = 'lazy'; img.decoding = 'async';
        media.append(img);
      } else {
        const ph = el('div', 'product-placeholder');
        const logo = el('img');
        logo.src = 'assets/logo-gmpi-sidoarjo-crop.webp'; logo.alt = '';
        ph.append(logo, el('span', '', 'FOTO SEGERA'));
        media.append(ph);
      }
      if (p.stock_status !== 'tersedia') media.append(el('span', `product-badge is-${p.stock_status}`, p.stock_status === 'habis' ? 'Stok habis' : 'Pre-order'));
      media.append(el('span', 'product-cat', p.category));

      const body = el('div', 'product-body');
      body.append(el('h3', '', p.name));
      if (p.description) body.append(el('p', 'product-desc', p.description));
      const price = el('div', 'product-price', p.price > 0 ? rupiah(p.price) : 'Harga segera diumumkan');
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
      card.append(media, body);
      return card;
    }));
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
    if (!root || !config.publishableKey) {
      grid.replaceChildren(el('div', 'shop-empty', 'Katalog belum terhubung ke basis data.'));
      return;
    }
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${root}/rest/v1/shop_products?select=id,name,category,description,price,sizes,image_path,stock_status,sort_order&is_active=eq.true&order=sort_order.asc,created_at.asc`, { headers }),
        fetch(`${root}/rest/v1/site_content?select=key,value&key=in.(shop_whatsapp,shop_bank,legal_npwp)`, { headers })
      ]);
      products = pRes.ok ? await pRes.json() : [];
      const rows = sRes.ok ? await sRes.json() : [];
      rows.forEach(r => { if (r.value && typeof r.value.text === 'string') settings[r.key] = r.value.text.trim(); });
    } catch (e) {
      products = [];
    }
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
