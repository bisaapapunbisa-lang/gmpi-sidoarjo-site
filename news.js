/*
  Kolom berita dari media mitra GMPI Sidoarjo.
  Data dibaca dari Supabase (hanya berita "published" dari media aktif).
  Isi berita ditampilkan sebagai teks biasa (tanpa HTML) agar aman.
*/
(() => {
  const grid = document.getElementById('news-grid');
  if (!grid) return;
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const root = config.url ? config.url.replace(/\/$/, '') : '';
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` };
  const filtersEl = document.getElementById('news-filters');
  const moreBtn = document.getElementById('news-more');
  const partnersEl = document.getElementById('news-partners');
  const reader = document.getElementById('news-reader');
  const section = grid.closest('[data-news-mode]');
  const HOME = section && section.dataset.newsMode === 'home';
  const PAGE = HOME ? 3 : 9;
  const articleLink = id => `${new URL('berita.html', location.href).href}#berita/${id}`;
  const SITE_NAME = 'Redaksi GMPI Sidoarjo';
  const PATH_RE = /^(news|media)\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
  const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let partners = new Map();
  let posts = [];
  let activePartner = '';
  let offset = 0;
  let lastFocus = null;
  let currentId = '';

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const assetUrl = path => (path && PATH_RE.test(path) ? `${root}/storage/v1/object/public/site-assets/${path}` : '');
  const safeUrl = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch (e) { return ''; } };
  const fmtDate = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const partnerOf = post => partners.get(post.partner_id) || null;

  async function api(path) {
    const res = await fetch(`${root}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  function sourceBadge(post, small) {
    const partner = partnerOf(post);
    const wrap = el('span', `news-source${small ? ' is-small' : ''}`);
    const logo = partner && assetUrl(partner.logo_path);
    if (logo) { const img = el('img'); img.src = logo; img.alt = ''; img.loading = 'lazy'; wrap.append(img); }
    else wrap.append(el('i', '', (partner ? partner.name : 'G').trim().charAt(0).toUpperCase()));
    wrap.append(el('b', '', partner ? partner.name : SITE_NAME));
    return wrap;
  }

  function card(post, featured) {
    const a = el('a', `news-card${featured ? ' is-featured' : ''}`);
    a.href = `#berita/${post.id}`;
    a.addEventListener('click', e => { e.preventDefault(); openReader(post.id, true); });
    const media = el('div', 'news-cover');
    const cover = assetUrl(post.cover_path);
    if (cover) { const img = el('img'); img.src = cover; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; media.append(img); }
    else { media.classList.add('is-empty'); const logo = el('img'); logo.src = 'assets/logo-gmpi-sidoarjo-crop.webp'; logo.alt = ''; media.append(logo); }
    const body = el('div', 'news-body');
    const meta = el('div', 'news-meta');
    meta.append(sourceBadge(post, true), el('time', '', fmtDate(post.published_at)));
    body.append(meta, el('h3', '', post.title));
    if (post.summary) body.append(el('p', '', post.summary));
    body.append(el('span', 'news-read', 'Baca selengkapnya →'));
    a.append(media, body);
    return a;
  }

  function render() {
    if (!posts.length) {
      grid.replaceChildren(el('div', 'news-empty', activePartner ? 'Media ini belum menerbitkan berita.' : 'Belum ada berita. Kabar dari media mitra akan tampil di sini.'));
      return;
    }
    grid.replaceChildren(...posts.map((p, i) => card(p, i === 0 && !activePartner)));
  }

  function renderFilters() {
    const list = [...partners.values()];
    if (HOME || list.length < 2) { filtersEl.hidden = true; return; }
    const make = (id, label) => {
      const b = el('button', `news-filter${activePartner === id ? ' is-active' : ''}`, label);
      b.type = 'button';
      b.addEventListener('click', () => { if (activePartner === id) return; activePartner = id; renderFilters(); loadPosts(true); });
      return b;
    };
    filtersEl.replaceChildren(make('', 'Semua media'), ...list.map(p => make(p.id, p.name)));
    filtersEl.hidden = false;
  }

  function renderPartners() {
    const list = [...partners.values()];
    if (!list.length) { partnersEl.hidden = true; return; }
    const logos = partnersEl.querySelector('.news-partner-logos');
    logos.replaceChildren(...list.map(p => {
      const href = safeUrl(p.website_url);
      const item = el(href ? 'a' : 'span', 'news-partner');
      if (href) { item.href = href; item.target = '_blank'; item.rel = 'noopener'; }
      const logo = assetUrl(p.logo_path);
      if (logo) { const img = el('img'); img.src = logo; img.alt = p.name; img.loading = 'lazy'; item.append(img); item.title = p.name; }
      else item.append(el('b', '', p.name));
      return item;
    }));
    partnersEl.hidden = false;
  }

  async function loadPosts(reset) {
    if (reset) { offset = 0; posts = []; grid.replaceChildren(el('div', 'news-empty', 'Memuat berita…')); }
    const limit = HOME ? PAGE : (offset === 0 && !activePartner ? PAGE + 1 : PAGE);
    let q = `news_posts?select=id,partner_id,title,summary,cover_path,published_at&status=eq.published&order=published_at.desc&limit=${limit}&offset=${offset}`;
    if (activePartner) q += `&partner_id=eq.${activePartner}`;
    try {
      const rows = await api(q);
      posts = posts.concat(rows);
      offset += rows.length;
      moreBtn.hidden = HOME || rows.length < limit;
      const all = document.getElementById('news-all');
      if (all) all.hidden = !HOME || !posts.length;
    } catch (e) {
      moreBtn.hidden = true;
    }
    render();
  }

  // ---------- Pembaca berita ----------
  function paragraphs(text) {
    return String(text || '').replace(/\r/g, '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
      .map(chunk => { const p = el('p'); chunk.split('\n').forEach((line, i) => { if (i) p.append(el('br')); p.append(document.createTextNode(line)); }); return p; });
  }

  async function openReader(id, push) {
    if (!ID_RE.test(id)) return;
    if (currentId === id && !reader.hidden) return;
    currentId = id;
    if (reader.hidden) lastFocus = document.activeElement;
    const art = reader.querySelector('.news-article');
    art.replaceChildren(el('div', 'news-empty', 'Memuat berita…'));
    reader.hidden = false;
    document.body.classList.add('news-open');
    reader.querySelector('.news-close').focus();
    if (push && location.hash !== `#berita/${id}`) history.pushState(null, '', `#berita/${id}`);
    let post;
    try {
      const rows = await api(`news_posts?select=id,partner_id,title,summary,body,cover_path,source_url,published_at&status=eq.published&id=eq.${id}&limit=1`);
      post = rows[0];
    } catch (e) { post = null; }
    if (!post) { art.replaceChildren(el('div', 'news-empty', 'Berita tidak ditemukan atau sudah tidak tersedia.')); return; }

    const nodes = [];
    const cover = assetUrl(post.cover_path);
    if (cover) { const fig = el('figure', 'news-article-cover'); const img = el('img'); img.src = cover; img.alt = ''; fig.append(img); nodes.push(fig); }
    const meta = el('div', 'news-meta');
    meta.append(sourceBadge(post), el('time', '', fmtDate(post.published_at)));
    nodes.push(meta, el('h2', '', post.title));
    if (post.summary) nodes.push(el('p', 'news-lead', post.summary));
    const body = el('div', 'news-article-body');
    body.append(...paragraphs(post.body));
    nodes.push(body);

    const actions = el('div', 'news-article-actions');
    const src = safeUrl(post.source_url);
    const partner = partnerOf(post);
    if (src) {
      const a = el('a', 'news-btn news-btn-gold', `Baca di ${partner ? partner.name : 'sumber'} ↗`);
      a.href = src; a.target = '_blank'; a.rel = 'noopener';
      actions.append(a);
    }
    const link = articleLink(post.id);
    const wa = el('a', 'news-btn', 'Bagikan ke WhatsApp');
    wa.href = `https://wa.me/?text=${encodeURIComponent(`${post.title}\n${link}`)}`; wa.target = '_blank'; wa.rel = 'noopener';
    const copy = el('button', 'news-btn', 'Salin tautan'); copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(link); copy.textContent = '✓ Tautan disalin'; } catch (e) { window.prompt('Salin tautan berita:', link); }
      setTimeout(() => { copy.textContent = 'Salin tautan'; }, 1800);
    });
    actions.append(wa, copy);
    nodes.push(actions);
    nodes.push(el('p', 'news-disclaimer', partner
      ? `Berita ini ditulis dan dikelola oleh ${partner.name} sebagai media mitra GMPI Sidoarjo.`
      : 'Berita ini diterbitkan oleh pengurus GMPI Sidoarjo.'));
    art.replaceChildren(...nodes);
    reader.querySelector('.news-scroll').scrollTop = 0;
    document.title = `${post.title} · GMPI Sidoarjo`;
  }

  const baseTitle = document.title;
  function closeReader(fromHistory) {
    if (reader.hidden) return;
    reader.hidden = true;
    currentId = '';
    document.body.classList.remove('news-open');
    document.title = baseTitle;
    if (!fromHistory && location.hash.startsWith('#berita/')) history.pushState(null, '', '#berita');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  reader.querySelector('.news-close').addEventListener('click', () => closeReader(false));
  reader.addEventListener('click', e => { if (e.target === reader) closeReader(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !reader.hidden) closeReader(false); });
  function fromHash() {
    const m = location.hash.match(/^#berita\/([0-9a-f-]{36})$/i);
    if (m) openReader(m[1], false); else closeReader(true);
  }
  window.addEventListener('popstate', fromHash);
  window.addEventListener('hashchange', fromHash);

  moreBtn.addEventListener('click', () => loadPosts(false));

  // Halaman berita.html: logo dari Admin & menu HP
  async function pageExtras() {
    if (document.body.dataset.page !== 'berita') return;
    const toggle = document.querySelector('.menu-toggle');
    const nav = document.querySelector('.main-nav');
    if (toggle && nav) toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open);
    });
    const year = document.getElementById('year'); if (year) year.textContent = new Date().getFullYear();
    if (!root || !config.publishableKey) return;
    try {
      const rows = await api('site_content?select=value&key=eq.site_logo');
      const path = rows[0]?.value?.text || '';
      if (/^logos\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(path)) {
        const url = `${root}/storage/v1/object/public/site-assets/${path}`;
        document.querySelectorAll('img[data-site-logo]').forEach(img => { img.src = url; });
      }
    } catch (e) { /* pakai logo bawaan */ }
  }
  pageExtras();

  async function init() {
    if (!root || !config.publishableKey) {
      grid.replaceChildren(el('div', 'news-empty', 'Belum ada berita. Kabar dari media mitra akan tampil di sini.'));
      return;
    }
    try {
      const rows = await api('media_partners?select=id,name,website_url,logo_path&is_active=eq.true&order=sort_order.asc,name.asc');
      partners = new Map(rows.map(r => [r.id, r]));
    } catch (e) { partners = new Map(); }
    renderFilters();
    renderPartners();
    await loadPosts(true);
    fromHash();
  }
  init();
})();
