// GMPI DPD Sidoarjo — Bagan struktur organisasi (AD/ART 2021 Pasal 9 ayat 2).
(() => {
  const DEFAULT_ROWS = [
    ['penasihat', 'Dewan Penasihat'], ['penasihat', 'Dewan Penasihat'], ['penasihat', 'Dewan Penasihat'],
    ['pembina', 'Dewan Pembina'], ['pembina', 'Dewan Pembina'], ['pembina', 'Dewan Pembina'],
    ['ketua', 'Ketua DPD'],
    ['wakil_ketua', 'Wakil Ketua'],
    ['sekretaris', 'Sekretaris'],
    ['bendahara', 'Bendahara']
  ].map(([section, jabatan], i) => ({ section, jabatan, department: null, person_name: null, photo_path: null, sort_order: i }));

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  };
  const initials = name => String(name || '').replace(/^(h|hj|dr|ir|drs|kh)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  function person(row, photoUrl, size) {
    const card = el('div', `org-person${size ? ' is-' + size : ''}${row.person_name ? '' : ' is-empty'}`);
    const ph = el('div', 'org-photo');
    const url = row.photo_path ? photoUrl(row.photo_path) : '';
    if (url) {
      const img = new Image();
      img.src = url; img.alt = row.person_name ? `Foto ${row.person_name}` : ''; img.loading = 'lazy'; img.decoding = 'async';
      img.onerror = () => { img.remove(); ph.textContent = initials(row.person_name) || '★'; };
      ph.append(img);
    } else {
      ph.textContent = initials(row.person_name) || '★';
    }
    card.append(ph, el('b', 'org-name', row.person_name || 'Segera diisi'), el('span', 'org-role', row.jabatan));
    return card;
  }
  function people(rows, photoUrl, size) {
    const wrap = el('div', 'org-people');
    rows.forEach(r => wrap.append(person(r, photoUrl, size)));
    return wrap;
  }

  // rows: data dari tabel org_structure; photoUrl(path) -> URL publik
  function render(host, rows, photoUrl = () => '') {
    const list = (rows && rows.length ? rows : DEFAULT_ROWS).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const by = s => list.filter(r => r.section === s);
    const chart = el('div', 'org-chart');

    const advisors = el('div', 'org-advisors');
    [['penasihat', 'Dewan Penasihat'], ['pembina', 'Dewan Pembina']].forEach(([s, t]) => {
      const board = el('div', 'org-board');
      board.append(el('h4', 'org-title', t), people(by(s), photoUrl, 'sm'));
      advisors.append(board);
    });
    chart.append(advisors, el('div', 'org-link is-dashed'));

    const top = el('div', 'org-level org-top');
    by('ketua').forEach(r => top.append(person(r, photoUrl, 'lg')));
    chart.append(top, el('div', 'org-link'));

    const wk = el('div', 'org-level org-group');
    wk.append(el('h4', 'org-title', 'Wakil Ketua'), people(by('wakil_ketua'), photoUrl, 'md'));
    chart.append(wk, el('div', 'org-link'));

    const branches = el('div', 'org-branches');
    [['sekretaris', 'wakil_sekretaris', 'Sekretariat'], ['bendahara', 'wakil_bendahara', 'Kebendaharaan']].forEach(([head, deputies, title]) => {
      const br = el('div', 'org-branch');
      br.append(el('h4', 'org-title', title));
      by(head).forEach(r => br.append(person(r, photoUrl, 'md')));
      br.append(people(by(deputies), photoUrl, 'sm'));
      branches.append(br);
    });
    chart.append(branches, el('div', 'org-link'));

    const depts = el('div', 'org-depts');
    depts.append(el('h4', 'org-title', 'Departemen'));
    const deptRows = by('departemen');
    const grid = el('div', 'org-dept-grid');
    if (deptRows.length) {
      deptRows.forEach(r => {
        const d = el('div', 'org-dept');
        d.append(el('span', 'org-dept-name', r.department || 'Departemen'), person(r, photoUrl, 'sm'));
        grid.append(d);
      });
    } else {
      grid.append(el('div', 'org-dept is-placeholder', 'Susunan departemen segera diumumkan.'));
    }
    depts.append(grid);
    chart.append(depts);
    host.replaceChildren(chart);
  }

  window.GMPIStruktur = { render, DEFAULT_ROWS };

  // ---------- Bagian beranda ----------
  const host = document.getElementById('struktur-chart');
  if (!host) return;
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const root = (config.url || '').replace(/\/$/, '');
  const photoUrl = path => root ? `${root}/storage/v1/object/public/site-assets/${path.split('/').map(encodeURIComponent).join('/')}` : '';
  render(host, [], photoUrl);
  if (!root || !config.publishableKey) return;
  fetch(`${root}/rest/v1/org_structure?select=section,jabatan,department,person_name,photo_path,sort_order&order=sort_order.asc`, {
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` }
  }).then(r => (r.ok ? r.json() : [])).then(rows => {
    if (Array.isArray(rows) && rows.length) render(host, rows, photoUrl);
  }).catch(() => {});
})();
