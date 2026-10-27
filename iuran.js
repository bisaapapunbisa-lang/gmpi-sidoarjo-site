/* ==========================================================================
   GMPI DPD Sidoarjo — Iuran keanggotaan
   --------------------------------------------------------------------------
   Dipakai oleh dua halaman:
   - iuran.html  → halaman penuh (bayar QRIS/e-wallet/transfer/tunai + konfirmasi)
   - index.html  → ringkasan kecil ([data-dues-teaser])

   CARA KERJA
   1. Nominal, periode, jatuh tempo, rekening, nomor e-wallet, dan nomor WA
      bendahara dibaca dari tabel `site_content` (kunci berawalan `iuran_`).
      Pengurus mengubahnya dari Admin → tab "Iuran".
   2. QRIS memakai payload statis resmi (NMID ID1026605146624). Nominal
      disisipkan sebagai tag 54 lalu checksum CRC16 dihitung ulang, sehingga
      aplikasi pembayaran langsung menampilkan jumlah yang harus dibayar.
   3. Konfirmasi pembayaran dikirim lewat RPC `submit_dues_payment`. Publik
      tidak pernah bisa membaca tabel `dues_payments`.
   ========================================================================== */
(() => {
  'use strict';

  // ------------------------------------------------------------------------
  // Payload QRIS statis resmi GMPI DPD SIDOARJO
  // (dibaca dari assets/payment/qris-gmpi-dpd-sidoarjo.jpg — merchant Bank bjb)
  // GANTI baris ini bila organisasi berganti QRIS. Lihat PANDUAN-IURAN.md.
  // ------------------------------------------------------------------------
  const QRIS_STATIC_PAYLOAD =
    '00020101021126610017ID.CO.BANKBJB.WWW0118936001103002302881020733614040303UMI' +
    '51440014ID.CO.QRIS.WWW0215ID10266051466240303UMI5204864153033605802ID5917GMPI DPD ' +
    'SIDOARJO6008SIDOARJO61056121262070703A0163045B4D';

  const CONFIG_KEYS = [
    'iuran_aktif', 'iuran_nama', 'iuran_periode', 'iuran_nominal',
    'iuran_jatuh_tempo', 'iuran_ewallet', 'iuran_bank', 'iuran_wa', 'iuran_catatan'
  ];
  const DISTRICT_LIST = [
    'Sidoarjo', 'Buduran', 'Gedangan', 'Waru', 'Sukodono', 'Taman', 'Krian', 'Balongbendo',
    'Tarik', 'Prambon', 'Krembung', 'Porong', 'Jabon', 'Tanggulangin', 'Candi',
    'Tulangan', 'Wonoayu', 'Sedati'
  ];
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
    'September', 'Oktober', 'November', 'Desember'];

  const cfg = window.GMPI_SUPABASE_CONFIG || {};
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function rupiah(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(n);
  }
  function parseDigits(text) {
    const n = parseInt(String(text || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  }
  function todayIso() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function prettyDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  function periodLabel(period) {
    const text = String(period || '');
    if (/^\d{4}-\d{2}$/.test(text)) {
      const [y, m] = text.split('-').map(Number);
      return `${MONTHS[m - 1]} ${y}`;
    }
    if (/^\d{4}$/.test(text)) return `Tahun ${text}`;
    return text || '—';
  }
  // Daftar label bulan yang dicakup sebuah tagihan, contoh: ['Oktober 2026','November 2026'].
  function periodRangeLabels(period, months) {
    const count = Math.max(1, Math.min(12, Number(months) || 1));
    if (count === 1) return [periodLabel(period)];
    if (!/^\d{4}-\d{2}$/.test(String(period || ''))) return [periodLabel(period)];
    let [year, month] = period.split('-').map(Number);
    const labels = [];
    for (let i = 0; i < count; i++) {
      labels.push(`${MONTHS[month - 1]} ${year}`);
      month += 1;
      if (month === 13) { month = 1; year += 1; }
    }
    return labels;
  }
  function periodRangeShort(period, months) {
    const labels = periodRangeLabels(period, months);
    if (labels.length === 1) return labels[0];
    return `${labels[0]} – ${labels[labels.length - 1]}`;
  }

  // Daftar bulan (YYYY-MM) yang dicakup sebuah tagihan.
  function invoiceMonths(period, months) {
    const count = Math.max(1, Math.min(12, Number(months) || 1));
    if (!/^\d{4}-\d{2}$/.test(String(period || ''))) {
      // Periode tahunan '2026' → Januari..Desember.
      if (/^\d{4}$/.test(String(period || ''))) {
        return Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
      }
      return [String(period || '')];
    }
    let [year, month] = String(period).split('-').map(Number);
    const list = [];
    for (let i = 0; i < count; i++) {
      list.push(`${year}-${String(month).padStart(2, '0')}`);
      month += 1;
      if (month === 13) { month = 1; year += 1; }
    }
    return list;
  }
  function monthShortLabel(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    if (!year || !month) return monthKey;
    return `${MONTHS[month - 1].slice(0, 3)} ${year}`;
  }

  function daysUntil(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return null;
    const target = new Date(`${iso}T23:59:59`);
    if (Number.isNaN(target.getTime())) return null;
    const diff = target.getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  }

  // ------------------------------------------------------------------------
  // QRIS: sisipkan nominal + hitung ulang CRC16 (CCITT-FALSE)
  // ------------------------------------------------------------------------
  function crc16(text) {
    let crc = 0xFFFF;
    for (let i = 0; i < text.length; i++) {
      crc ^= text.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function parseTlv(payload) {
    const parts = [];
    let i = 0;
    while (i + 4 <= payload.length) {
      const id = payload.slice(i, i + 2);
      const len = parseInt(payload.slice(i + 2, i + 4), 10);
      if (!/^[0-9]{2}$/.test(id) || !Number.isFinite(len)) return null;
      const value = payload.slice(i + 4, i + 4 + len);
      if (value.length !== len) return null;
      parts.push([id, value]);
      i += 4 + len;
    }
    return i === payload.length ? parts : null;
  }

  function buildTlv(parts) {
    return parts.map(([id, value]) => id + String(value.length).padStart(2, '0') + value).join('');
  }

  function qrisWithAmount(amount) {
    const parts = parseTlv(QRIS_STATIC_PAYLOAD);
    if (!parts) return null;
    const clean = parts.filter(([id]) => id !== '54' && id !== '63');
    const body = [];
    let inserted = false;
    clean.forEach(entry => {
      if (!inserted && entry[0] === '58') {
        body.push(['54', String(Math.round(amount))]);
        inserted = true;
      }
      body.push(entry);
    });
    if (!inserted) body.push(['54', String(Math.round(amount))]);
    const head = buildTlv(body) + '6304';
    return head + crc16(head);
  }

  function drawQris(canvas, payload) {
    if (!canvas || !payload) return false;
    if (typeof window.qrcode !== 'function') return false;
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(payload);
      qr.make();
      const count = qr.getModuleCount();
      const quiet = 4;
      const total = count + quiet * 2;
      const size = 660;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000000';
      const cell = size / total;
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (!qr.isDark(row, col)) continue;
          ctx.fillRect(
            Math.round((col + quiet) * cell),
            Math.round((row + quiet) * cell),
            Math.ceil(cell),
            Math.ceil(cell)
          );
        }
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // ------------------------------------------------------------------------
  // Supabase
  // ------------------------------------------------------------------------
  let client = null;
  const supabaseReady = Boolean(
    cfg.url && cfg.publishableKey &&
    window.supabase && typeof window.supabase.createClient === 'function'
  );
  function ensureClient() {
    if (client) return client;
    if (!supabaseReady) return null;
    client = window.supabase.createClient(cfg.url, cfg.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    return client;
  }

  const FALLBACK = {
    iuran_aktif: '0',
    iuran_nama: 'Iuran Keanggotaan',
    iuran_periode: String(new Date().getFullYear()),
    iuran_nominal: '60000',
    iuran_jatuh_tempo: '',
    iuran_ewallet: '',
    iuran_bank: 'Bank bjb · 0163336219100 · a.n. GMPI DPD SIDOARJO',
    iuran_wa: '6281235911689',
    iuran_catatan: ''
  };

  async function loadSettings() {
    const supabase = ensureClient();
    if (!supabase) return { settings: { ...FALLBACK }, online: false, configured: false, reason: 'offline' };
    try {
      const { data, error } = await supabase
        .from('site_content')
        .select('key,value')
        .in('key', CONFIG_KEYS);
      if (error) throw error;
      const rows = data || [];
      const settings = { ...FALLBACK };
      rows.forEach(row => {
        const text = row && row.value && typeof row.value.text === 'string' ? row.value.text : '';
        if (CONFIG_KEYS.includes(row.key)) settings[row.key] = text;
      });
      return { settings, online: true, configured: rows.length > 0, reason: '' };
    } catch (error) {
      return { settings: { ...FALLBACK }, online: false, configured: false, reason: 'gagal' };
    }
  }

  function normalizeSettings(raw) {
    const settings = { ...FALLBACK, ...raw };
    return {
      aktif: String(settings.iuran_aktif) === '1',
      nama: String(settings.iuran_nama || FALLBACK.iuran_nama).trim() || FALLBACK.iuran_nama,
      periode: String(settings.iuran_periode || '').trim(),
      nominal: parseDigits(settings.iuran_nominal),
      jatuhTempo: /^\d{4}-\d{2}-\d{2}$/.test(settings.iuran_jatuh_tempo) ? settings.iuran_jatuh_tempo : '',
      ewallet: String(settings.iuran_ewallet || '').trim(),
      bank: String(settings.iuran_bank || '').trim(),
      wa: String(settings.iuran_wa || '').replace(/[^0-9]/g, ''),
      catatan: String(settings.iuran_catatan || '').trim()
    };
  }

  // Status tagihan yang diluncurkan pengurus (migration 202610280029).
  // Mengembalikan { hasInvoices, active } atau null bila fitur belum ada.
  async function loadInvoiceStatus() {
    const supabase = ensureClient();
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.rpc('dues_public_status');
      if (error) return null;
      const payload = data && typeof data === 'object' ? data : null;
      if (!payload) return null;
      const active = payload.active || null;
      return {
        hasInvoices: Boolean(payload.has_invoices),
        active: active && active.id ? {
          id: active.id,
          title: String(active.title || '').trim(),
          period: String(active.period || '').trim(),
          months: Math.max(1, Math.min(12, Number(active.months) || 1)),
          nominal: parseDigits(active.nominal),
          dueDate: /^\d{4}-\d{2}-\d{2}/.test(String(active.due_date || '')) ? String(active.due_date).slice(0, 10) : '',
          note: String(active.note || '').trim()
        } : null
      };
    } catch (error) {
      return null;
    }
  }

  function waLink(number, message) {
    const digits = String(number || '').replace(/[^0-9]/g, '');
    const target = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
    return message ? `${target}?text=${encodeURIComponent(message)}` : target;
  }

  // ========================================================================
  // MODE 1 — RINGKASAN DI BERANDA  ([data-dues-teaser])
  // ========================================================================
  function initTeaser(root) {
    const field = name => $(`[data-dues-field="${name}"]`, root);
    const canvas = $('[data-dues-qr]', root);
    const cta = $('[data-dues-cta]', root);

    function paint(model) {
      const nominalNode = field('nominal');
      const periodNode = field('period');
      const dueNode = field('due');
      const noteNode = field('note');
      const statusChip = field('status');

      if (nominalNode) {
        nominalNode.textContent = model.nominal > 0
          ? rupiah(model.nominal)
          : (model.open ? 'Sesuai ketetapan' : 'Belum ada tagihan');
      }
      if (periodNode) periodNode.textContent = model.periodText || '—';
      if (dueNode) {
        dueNode.textContent = model.dueDate
          ? prettyDate(model.dueDate)
          : (model.open ? 'Sesuai pengumuman' : 'Menunggu tagihan');
      }
      if (noteNode) noteNode.textContent = model.note;
      if (statusChip) {
        statusChip.textContent = model.open ? 'DIBUKA' : 'BELUM DIBUKA';
        statusChip.classList.toggle('is-open', model.open);
      }
      if (cta) cta.textContent = model.open ? 'Bayar iuran sekarang' : 'Lihat rincian iuran';
      if (canvas) {
        const payload = model.open && model.nominal > 0 ? qrisWithAmount(model.nominal) : null;
        const ok = payload ? drawQris(canvas, payload) : false;
        canvas.hidden = !ok;
        const fallback = $('[data-dues-qr-fallback]', root);
        if (fallback) fallback.hidden = ok;
      }
      const qrNote = $('[data-dues-qr-note]', root);
      if (qrNote) {
        qrNote.textContent = model.open
          ? 'Nominal terisi otomatis · semua e-wallet & m-banking'
          : 'QRIS muncul saat tagihan diluncurkan pengurus';
      }
    }

    function modelFromSettings(settings) {
      return {
        open: settings.aktif,
        nominal: settings.aktif ? settings.nominal : 0,
        periodText: settings.aktif ? periodLabel(settings.periode) : 'Menunggu keputusan pengurus',
        dueDate: settings.aktif ? settings.jatuhTempo : '',
        note: settings.aktif
          ? `${settings.nama} sudah dibuka. Bayar lewat QRIS — nominal terisi otomatis, tinggal pindai.`
          : `${settings.nama} belum dibuka — pantau pengumuman grup WhatsApp anggota.`
      };
    }

    function modelFromInvoice(invoice) {
      const months = invoice.months;
      return {
        open: true,
        nominal: invoice.nominal > 0 ? invoice.nominal * months : 0,
        periodText: periodRangeShort(invoice.period, months),
        dueDate: invoice.dueDate,
        note: months > 1
          ? `${invoice.title} — ${months} bulan sekaligus (${periodRangeShort(invoice.period, months)}).`
          : `${invoice.title} sudah dibuka. Bayar lewat QRIS — nominal terisi otomatis, tinggal pindai.`
      };
    }

    paint(modelFromSettings(normalizeSettings(FALLBACK)));

    Promise.all([loadSettings(), loadInvoiceStatus()]).then(([settingsRes, inv]) => {
      const settings = normalizeSettings(settingsRes.settings);

      if (inv && inv.hasInvoices) {
        // Pengurus memakai fitur Tagihan: tagihan yang menentukan.
        if (inv.active) {
          paint(modelFromInvoice(inv.active));
          const warn = $('[data-dues-teaser-warning]', root);
          if (warn) warn.hidden = true;
          return;
        }
        paint({
          open: false,
          nominal: 0,
          periodText: 'Menunggu keputusan pengurus',
          dueDate: '',
          note: 'Belum ada tagihan iuran yang dibuka. Tagihan muncul setelah pengurus rapat memutuskan dan meluncurkannya.'
        });
        const warn = $('[data-dues-teaser-warning]', root);
        if (warn) warn.hidden = true;
        return;
      }

      if (!inv && !settingsRes.configured) {
        root.hidden = true;
        return;
      }

      paint(modelFromSettings(settings));
      const warn = $('[data-dues-teaser-warning]', root);
      if (warn) warn.hidden = settingsRes.online;
    });
  }

  // ========================================================================
  // MODE 2 — HALAMAN PENUH IURAN
  // ========================================================================
  function initPage() {
    const form = $('#dues-form');
    const successPanel = $('#dues-success');
    const formMsg = $('#dues-form-msg');
    const checkForm = $('#dues-check-form');
    const checkMsg = $('#dues-check-msg');
    const checkResult = $('#dues-check-result');
    const closedBox = $('#dues-closed');
    const configWarning = $('#dues-config-warning');
    const canvas = $('#dues-qris-canvas');
    const lightbox = $('#dues-lightbox');

    const state = {
      settings: normalizeSettings(FALLBACK),
      online: false,
      qty: 1,
      method: 'qris',
      configured: false,
      invoice: null,        // tagihan yang sedang diluncurkan pengurus
      hasInvoices: false,   // sudah ada tagihan dibuat (mode tagihan aktif)
      selectedMonths: [],   // bulan yang dipilih anggota (mode tagihan)
      lastSubmit: null
    };

    // ---------- util UI ----------
    function setFormMessage(text, type) {
      formMsg.textContent = text || '';
      formMsg.hidden = !text;
      formMsg.classList.toggle('is-error', type === 'error');
      formMsg.classList.toggle('is-ok', type === 'ok');
    }
    function setCheckMessage(text, type) {
      checkMsg.textContent = text || '';
      checkMsg.hidden = !text;
      checkMsg.classList.toggle('is-error', type === 'error');
      checkMsg.classList.toggle('is-ok', type === 'ok');
    }

    // Jumlah bulan yang dibayar: mengikuti tagihan bila ada, atau pilihan anggota.
    function effectiveMonths() {
      if (!state.invoice) return state.qty;
      return Math.max(1, state.selectedMonths.length);
    }
    function selectedPeriods() {
      return state.invoice ? state.selectedMonths.slice().sort() : null;
    }
    function effectiveNominal() {
      return state.invoice ? state.invoice.nominal : state.settings.nominal;
    }
    function effectivePeriod() {
      return state.invoice ? state.invoice.period : state.settings.periode;
    }
    function total() {
      const nominal = effectiveNominal();
      const result = nominal > 0 ? nominal * effectiveMonths() : 0;
      return result > 0 ? result : 0;
    }

    // ---------- periode yang bisa dipilih ----------
    function periodOptions() {
      const base = state.settings.periode;
      const options = [];
      if (/^\d{4}-\d{2}$/.test(base)) {
        let [year, month] = base.split('-').map(Number);
        for (let i = 0; i < 6; i++) {
          options.push(`${year}-${String(month).padStart(2, '0')}`);
          month -= 1;
          if (month === 0) { month = 12; year -= 1; }
        }
      } else if (/^\d{4}$/.test(base)) {
        const year = Number(base);
        for (let i = 0; i < 4; i++) options.push(String(year - i));
      } else {
        options.push(String(new Date().getFullYear()));
      }
      return options;
    }

    function renderPeriodSelect() {
      const select = $('#f-periode');
      if (!select) return;
      if (state.invoice) {
        // Periode ditentukan pengurus lewat tagihan, bukan dipilih anggota.
        const option = document.createElement('option');
        option.value = state.invoice.period;
        option.textContent = periodRangeShort(state.invoice.period, state.invoice.months);
        select.replaceChildren(option);
        select.disabled = true;
        return;
      }
      select.disabled = false;
      const previous = select.value;
      const options = periodOptions();
      select.replaceChildren(...options.map(period => {
        const option = document.createElement('option');
        option.value = period;
        option.textContent = periodLabel(period);
        return option;
      }));
      select.value = options.includes(previous) ? previous : options[0];
    }

    // ---------- tangkapan informasi tagihan ----------
    function paintBill() {
      const s = state.settings;
      const inv = state.invoice;
      const nominalNode = $('#dues-nominal');
      const unitNode = $('#dues-unit');
      const periodNode = $('#dues-period');
      const dueNode = $('#dues-due');
      const dueItem = $('#dues-due-item');
      const countdown = $('#dues-countdown');
      const kicker = $('#dues-kicker');
      const catatan = $('#dues-catatan');

      const nominal = inv ? inv.nominal : s.nominal;
      const period = inv ? inv.period : s.periode;
      const months = inv ? inv.months : 1;
      const dueDate = inv ? inv.dueDate : s.jatuhTempo;

      const waiting = state.hasInvoices && !inv;
      if (nominalNode) {
        nominalNode.textContent = waiting
          ? 'Belum ada tagihan'
          : (nominal > 0 ? rupiah(nominal) : 'Sesuai ketetapan');
      }
      if (unitNode) unitNode.textContent = waiting ? '' : (months > 1 ? `/ bulan · ${months} bulan` : '/ anggota');
      if (periodNode) periodNode.textContent = waiting ? 'Menunggu peluncuran' : periodRangeShort(period, months);
      if (kicker) {
        const name = (inv ? inv.title : s.nama).toUpperCase();
        const periodText = periodRangeShort(period, months).toUpperCase();
        const alreadyMentions = name.includes(periodText) ||
          name.includes(periodLabel(period).toUpperCase()) ||
          (period && name.includes(String(period).slice(0, 4)));
        kicker.textContent = (alreadyMentions ? name : `${name} · ${periodText}`).slice(0, 70);
      }
      if (catatan) {
        catatan.textContent = (inv && inv.note) || s.catatan ||
          'Iuran dipakai untuk kas organisasi: advokasi warga, kegiatan sosial, dan operasional sekretariat DPD.';
      }

      const days = !waiting && dueDate ? daysUntil(dueDate) : null;
      if (dueNode && dueItem) {
        if (!waiting && dueDate) {
          dueNode.textContent = prettyDate(dueDate);
          dueItem.hidden = false;
        } else {
          dueItem.hidden = true;
        }
      }
      if (countdown) {
        if (days === null) {
          countdown.hidden = true;
        } else {
          countdown.hidden = false;
          countdown.classList.toggle('is-warn', days < 0);
          countdown.textContent = days < 0
            ? `Lewat ${Math.abs(days)} hari — mohon segera lunasi`
            : days === 0 ? 'Jatuh tempo hari ini'
              : `Sisa ${days} hari lagi`;
        }
      }

      const waNode = $('#dues-wa-bendahara');
      if (waNode) {
        const message = `Assalamualaikum, saya anggota GMPI DPD Sidoarjo. Saya ingin menanyakan ${inv ? inv.title : s.nama} periode ${periodRangeShort(period, months)}.`;
        waNode.href = waLink(s.wa, message);
      }
      const footWa = $('#dues-foot-wa');
      if (footWa && s.wa) {
        footWa.href = waLink(s.wa, `Assalamualaikum, saya ingin menanyakan ${inv ? inv.title : s.nama}.`);
      }

      const ewalletNode = $('#dues-ewallet-text');
      if (ewalletNode) ewalletNode.textContent = s.ewallet || 'Belum diatur pengurus — gunakan QRIS atau transfer bank.';
      const bankNode = $('#dues-bank-text');
      if (bankNode) bankNode.textContent = s.bank || 'Belum diatur pengurus.';

      // Status buka/tutup.
      // Bila pengurus sudah memakai fitur Tagihan, tagihan yang menentukan —
      // bukan saklar lama iuran_aktif. Tanpa tagihan sama sekali, saklar lama dipakai.
      const main = $('#bayar');
      const konfirmasi = $('#konfirmasi');
      const open = state.hasInvoices ? Boolean(state.invoice) : s.aktif;

      // Saat belum ada tagihan berjalan: JANGAN tampilkan nominal apa pun.
      // Nominal lama di pengaturan bisa menyesatkan anggota.
      const billAmount = $('#dues-bill-amount');
      const billMeta = $('#dues-bill-meta');
      const billSteps = $('#dues-bill-steps');
      const billPay = $('#dues-bill-pay');
      if (billAmount) billAmount.hidden = !open;
      if (billMeta) billMeta.hidden = !open;
      if (!open) {
        // Kosongkan angka agar tidak terbaca mesin pencari / pembaca layar
        // dan tidak menimbulkan kesan ada tagihan.
        if (nominalNode) nominalNode.textContent = '—';
        if (unitNode) unitNode.textContent = '';
        if (periodNode) periodNode.textContent = '—';
        if (dueNode) dueNode.textContent = '—';
        const qrisAmount = $('#dues-qris-amount');
        if (qrisAmount) qrisAmount.textContent = 'Belum ada tagihan';
        const totalNode = $('#dues-total');
        if (totalNode) totalNode.textContent = '—';
        const monthsTotal = $('#dues-months-total');
        if (monthsTotal) monthsTotal.textContent = '—';
      }
      if (billSteps) billSteps.hidden = !open;
      if (billPay) billPay.hidden = !open;
      if (kicker) kicker.textContent = open ? 'TAGIHAN ANGGOTA' : 'BELUM ADA TAGIHAN';
      const intro = $('#dues-intro');
      if (intro) {
        intro.textContent = open
          ? 'Menjaga barisan butuh kas. Bayar iuran anggota dengan cara paling gampang: pilih bulan yang mau dibayar (boleh satu bulan saja), pindai QRIS dengan nominal otomatis, atau bayar lewat e-wallet, transfer bank, maupun tunai ke bendahara.'
          : 'Belum ada tagihan iuran yang dibuka pengurus. Halaman ini aktif otomatis begitu bendahara meluncurkan tagihan. Sementara itu, Anda tetap bisa memeriksa status pembayaran sebelumnya di bagian bawah.';
      }

      if (!open && catatan) {
        catatan.textContent = 'Nominal dan jatuh tempo akan tampil di sini begitu pengurus meluncurkan tagihan. ' +
          'Sementara ini belum ada yang perlu dibayar — jangan mengirim uang tanpa tagihan resmi.';
      }

      if (!open) {
        if (main) main.hidden = true;
        if (konfirmasi) konfirmasi.hidden = true;
        if (closedBox) {
          closedBox.hidden = false;
          if (!state.online) {
            closedBox.textContent = 'Pengaturan iuran belum bisa dimuat dari server. Muat ulang halaman sebentar lagi, ' +
              'atau hubungi bendahara lewat WhatsApp untuk mengetahui tagihan yang sedang berjalan.';
          } else if (state.hasInvoices) {
            closedBox.textContent = 'Belum ada tagihan iuran yang dibuka pengurus. ' +
              'Tagihan hanya muncul setelah pengurus rapat memutuskan dan menekan tombol “Luncurkan tagihan”. ' +
              'Sementara itu, cek status pembayaran sebelumnya di bawah atau hubungi bendahara.';
          } else if (!state.configured) {
            closedBox.textContent = 'Modul iuran belum diaktifkan pengurus. ' +
              'Halaman ini otomatis bisa dipakai begitu bendahara menyiapkan tagihan.';
          } else {
            closedBox.textContent = `${s.nama} periode ${periodLabel(s.periode)} belum dibuka pengurus. ` +
              'Halaman ini otomatis bisa dipakai begitu bendahara membuka periode iuran atau meluncurkan tagihan. ' +
              'Sementara itu, cek status pembayaran sebelumnya di bawah atau hubungi bendahara.';
          }
        }
      } else {
        if (main) main.hidden = false;
        if (konfirmasi) konfirmasi.hidden = false;
        if (closedBox) closedBox.hidden = true;
      }
    }

    // ---------- pemilih bulan (iuran boleh dicicil per bulan) ----------
    function renderMonthPicker() {
      const wrap = $('#dues-months');
      const grid = $('#dues-months-grid');
      const qtyWrap = $('#dues-qty-wrap');
      if (!wrap || !grid) return;
      if (!state.invoice) {
        wrap.hidden = true;
        if (qtyWrap) qtyWrap.hidden = false;
        state.selectedMonths = [];
        return;
      }

      const months = invoiceMonths(state.invoice.period, state.invoice.months);
      // Bawaan: bulan berjalan bila termasuk tagihan, kalau tidak bulan pertama.
      if (!state.selectedMonths.length) {
        const now = new Date();
        const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        state.selectedMonths = [months.includes(current) ? current : months[0]].filter(Boolean);
      }
      state.selectedMonths = state.selectedMonths.filter(m => months.includes(m));
      if (!state.selectedMonths.length) state.selectedMonths = [months[0]];

      grid.replaceChildren(...months.map(monthKey => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = monthKey;
        input.checked = state.selectedMonths.includes(monthKey);
        input.addEventListener('change', () => {
          if (input.checked) {
            if (!state.selectedMonths.includes(monthKey)) state.selectedMonths.push(monthKey);
          } else {
            state.selectedMonths = state.selectedMonths.filter(m => m !== monthKey);
          }
          // Minimal satu bulan harus dipilih.
          if (!state.selectedMonths.length) {
            state.selectedMonths = [monthKey];
            input.checked = true;
            setFormMessage('Pilih minimal satu bulan. Boleh satu bulan saja.', 'error');
            return;
          }
          setFormMessage('');
          paintQris();
        });
        const box = document.createElement('span');
        const [year, month] = monthKey.split('-');
        box.append(document.createTextNode(MONTHS[Number(month) - 1] || monthKey));
        const small = document.createElement('small');
        small.textContent = year;
        box.append(small);
        label.append(input, box);
        return label;
      }));

      wrap.hidden = false;
      if (qtyWrap) qtyWrap.hidden = true;

      const help = $('#dues-months-help');
      if (help) {
        help.textContent = months.length > 1
          ? `Tagihan ini berlaku ${months.length} bulan (${periodRangeShort(state.invoice.period, state.invoice.months)}). ` +
            'Pilih bulan yang ingin dibayar sekarang — satu bulan pun tidak apa-apa, sisanya bisa menyusul kapan saja.'
          : 'Pilih bulan yang dibayar. Boleh satu bulan saja.';
      }
      const allButton = $('#dues-months-all');
      if (allButton) {
        allButton.hidden = months.length < 2;
        allButton.textContent = state.selectedMonths.length === months.length ? 'Kosongkan' : 'Pilih semua';
        allButton.onclick = () => {
          state.selectedMonths = state.selectedMonths.length === months.length ? [months[0]] : months.slice();
          renderMonthPicker();
          paintQris();
        };
      }
    }

    // ---------- QRIS ----------
    function paintQris() {
      const amount = total();
      const months = effectiveMonths();
      const fixedByInvoice = Boolean(state.invoice);
      const amountNode = $('#dues-qris-amount');
      const manualNode = $('#dues-qris-manual');
      const qtyNode = $('#dues-qty');
      const qtyLabel = $('#dues-qty-label');
      const totalNode = $('#dues-total');

      if (qtyNode) qtyNode.textContent = String(months);
      if (qtyLabel) qtyLabel.textContent = fixedByInvoice ? 'Jumlah bulan' : 'Jumlah periode';
      if (totalNode) totalNode.textContent = amount > 0 ? rupiah(amount) : 'sesuai ketetapan';
      if (manualNode) manualNode.textContent = amount > 0 ? rupiah(amount) : 'sesuai ketetapan';
      if (amountNode) {
        amountNode.textContent = amount > 0
          ? `Nominal otomatis: ${rupiah(amount)}${months > 1 ? ` (${months} bulan)` : ''}`
          : 'Nominal diketik manual di aplikasi pembayaran';
      }

      const minus = $('#dues-qty-minus');
      const plus = $('#dues-qty-plus');
      if (minus) { minus.hidden = fixedByInvoice; minus.disabled = state.qty <= 1; }
      if (plus) { plus.hidden = fixedByInvoice; plus.disabled = state.qty >= 6; }

      const monthsTotal = $('#dues-months-total');
      if (monthsTotal && fixedByInvoice) {
        monthsTotal.textContent = amount > 0
          ? `${rupiah(amount)} · ${months} bulan`
          : 'Rp—';
      }

      if (!canvas) return;
      const payload = amount > 0 ? qrisWithAmount(amount) : null;
      const drawn = payload ? drawQris(canvas, payload) : false;
      canvas.hidden = !drawn;
      const pickedLabel = fixedByInvoice && selectedPeriods() ? selectedPeriods().map(monthShortLabel).join(', ') : '';
      canvas.setAttribute('aria-label', amount > 0
        ? `QRIS pembayaran iuran sebesar ${rupiah(amount)}${pickedLabel ? ` untuk ${pickedLabel}` : ''}`
        : 'QRIS pembayaran iuran');
      const fallback = $('#dues-qris-fallback');
      if (fallback) fallback.hidden = drawn;

      const hiddenAmount = $('#f-jumlah');
      if (hiddenAmount && amount > 0) hiddenAmount.value = String(amount);

      const jumlahHelp = $('#dues-jumlah-help');
      if (jumlahHelp) {
        if (fixedByInvoice) {
          const picked = selectedPeriods() || [];
          const list = picked.map(monthShortLabel).join(', ');
          jumlahHelp.textContent = picked.length
            ? `Membayar ${picked.length} bulan: ${list}. Total ${rupiah(amount)}. ` +
              'Bisa juga membayar satu bulan dulu — sisa bulan menyusul kapan saja dan tetap tercatat.'
            : 'Pilih bulan yang ingin dibayar di atas.';
        } else if (state.qty > 1) {
          jumlahHelp.textContent = `Total ${state.qty} periode${amount > 0 ? ` (${rupiah(amount)})` : ''}. Tulis periode mana saja yang dibayar di kolom catatan agar bendahara mencatat dengan benar.`;
        } else {
          jumlahHelp.textContent = 'Otomatis terisi dari total di atas. Ubah bila memang berbeda.';
        }
      }
    }

    // ---------- metode ----------
    function setMethod(method) {
      state.method = method;
      $$('#panel-qris, #panel-ewallet, #panel-transfer, #panel-tunai').forEach(panel => {
        panel.hidden = panel.id !== `panel-${method}`;
      });
      const select = $('#f-metode');
      if (select) select.value = method;
    }

    // ---------- konfirmasi ----------
    function buildSubmitMessage(payload) {
      const s = state.settings;
      const lines = [
        `*KONFIRMASI ${s.nama.toUpperCase()}*`,
        `Nama: ${payload.nama}`,
        payload.nomor ? `No. anggota: ${payload.nomor}` : 'No. anggota: —',
        `Kecamatan: ${payload.kecamatan}`,
        `Bulan dibayar: ${(payload.periods && payload.periods.length ? payload.periods : [payload.periode]).map(monthShortLabel).join(', ')}`,
        `Jumlah: ${rupiah(payload.jumlah)}`,
        `Cara bayar: ${({ qris: 'QRIS', ewallet: 'E-wallet', transfer: 'Transfer bank', tunai: 'Tunai' })[payload.metode]}`,
        `Tanggal bayar: ${prettyDate(payload.tanggal)}`,
        payload.catatan ? `Catatan: ${payload.catatan}` : null,
        '',
        'Saya lampirkan bukti pembayaran di chat ini. Mohon dicatat, terima kasih.'
      ].filter(Boolean);
      return lines.join('\n');
    }

    function showSuccess(payload, duplicate) {
      form.hidden = true;
      successPanel.hidden = false;
      const text = $('#dues-success-text');
      if (text) {
        const monthsText = (payload.periods && payload.periods.length
          ? payload.periods.map(monthShortLabel).join(', ')
          : periodRangeShort(payload.periode, payload.months));
        text.textContent = `Iuran ${monthsText} sebesar ${rupiah(payload.jumlah)} ` +
          `atas nama ${payload.nama} sudah masuk daftar tunggu verifikasi bendahara. ` +
          'Bulan lain bisa dibayar menyusul kapan saja — tidak harus sekaligus.';
      }
      const note = $('#dues-success-note');
      if (note) {
        note.textContent = duplicate
          ? 'Catatan serupa sudah pernah dikirim, jadi sistem tidak membuat data ganda. Bila ingin mengubah rincian, hubungi bendahara.'
          : 'Bendahara memverifikasi maksimal 3 hari kerja. Simpan bukti bayar dan kirim lewat WhatsApp agar lebih cepat.';
      }
      const waBtn = $('#dues-success-wa');
      if (waBtn) {
        waBtn.href = waLink(state.settings.wa, buildSubmitMessage(payload));
      }
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function handleSubmit(event) {
      event.preventDefault();
      setFormMessage('');
      const supabase = ensureClient();
      if (!supabase) {
        setFormMessage('Koneksi ke server belum siap. Muat ulang halaman, lalu coba lagi — atau kirim bukti bayar langsung ke WhatsApp bendahara.', 'error');
        return;
      }
      const payload = {
        nama: String(form.elements.nama.value || '').trim().replace(/\s+/g, ' '),
        nomor: String(form.elements.nomor.value || '').trim().toUpperCase(),
        kecamatan: String(form.elements.kecamatan.value || '').trim(),
        wa: String(form.elements.wa.value || '').replace(/[^0-9]/g, ''),
        metode: String(form.elements.metode.value || 'qris'),
        periode: String(form.elements.periode.value || effectivePeriod() || ''),
        months: effectiveMonths(),
        periods: selectedPeriods(),
        jumlah: parseDigits(form.elements.jumlah.value),
        tanggal: String(form.elements.tanggal.value || ''),
        catatan: String(form.elements.catatan.value || '').trim()
      };

      if (payload.nama.length < 2) return setFormMessage('Nama lengkap wajib diisi minimal 2 huruf.', 'error');
      if (!DISTRICT_LIST.includes(payload.kecamatan)) return setFormMessage('Pilih kecamatan domisili terlebih dulu.', 'error');
      if (payload.wa.length < 9 || payload.wa.length > 15) return setFormMessage('Nomor WhatsApp belum benar. Contoh: 081234567890.', 'error');
      if (!payload.periode) return setFormMessage('Periode iuran belum dipilih.', 'error');
      if (state.invoice && !(payload.periods && payload.periods.length)) {
        return setFormMessage('Pilih minimal satu bulan yang ingin dibayar.', 'error');
      }
      if (payload.jumlah < 1000) return setFormMessage('Jumlah pembayaran minimal Rp1.000.', 'error');
      if (!payload.tanggal) return setFormMessage('Tanggal pembayaran wajib diisi.', 'error');
      if (payload.tanggal > todayIso()) return setFormMessage('Tanggal pembayaran tidak boleh di masa depan.', 'error');

      const button = $('#dues-submit');
      if (button) { button.disabled = true; button.textContent = 'Mengirim…'; }
      setFormMessage('Mengirim konfirmasi ke bendahara…');

      try {
        const { data, error } = await supabase.rpc('submit_dues_payment', {
          p_member_name: payload.nama,
          p_member_number: payload.nomor || null,
          p_district: payload.kecamatan,
          p_phone: payload.wa,
          p_method: payload.metode,
          p_amount: payload.jumlah,
          p_period: payload.periode,
          p_paid_at: payload.tanggal,
          p_note: payload.catatan || null,
          p_months: payload.months,
          p_invoice_id: state.invoice ? state.invoice.id : null,
          p_periods: payload.periods
        });
        if (error) throw error;
        const result = data && typeof data === 'object' ? data : {};
        state.lastSubmit = payload;
        setFormMessage('');
        showSuccess(payload, Boolean(result.duplicate));
        setFormMessage('');
      } catch (error) {
        const raw = String((error && error.message) || '');
        let message = 'Konfirmasi gagal dikirim. Periksa koneksi lalu coba lagi.';
        if (/function .*submit_dues_payment|does not exist|schema cache/i.test(raw)) {
          message = 'Fitur iuran belum diaktifkan di server. Minta Pemilik menjalankan migrasi 202610270028_iuran_keanggotaan.sql di Supabase, lalu muat ulang halaman ini.';
        } else if (/Tagihan ini belum dibuka|Tagihan tidak ditemukan/i.test(raw)) {
          message = raw.replace(/^.*?:\s*/, '') + ' Muat ulang halaman untuk melihat tagihan terbaru.';
        } else if (/Nama wajib|Kecamatan|Nomor WhatsApp|Jumlah|Periode|Tanggal|Nomor anggota|Alasan/i.test(raw)) {
          message = raw.replace(/^.*?:\s*/, '');
        }
        setFormMessage(message, 'error');
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Kirim konfirmasi pembayaran'; }
      }
    }

    // ---------- cek status ----------
    async function handleCheck(event) {
      event.preventDefault();
      setCheckMessage('');
      checkResult.hidden = true;
      checkResult.replaceChildren();
      const supabase = ensureClient();
      if (!supabase) {
        setCheckMessage('Koneksi ke server belum siap. Muat ulang halaman lalu coba lagi.', 'error');
        return;
      }
      const nomor = String(checkForm.elements.nomor.value || '').trim().toUpperCase();
      const nama = String(checkForm.elements.nama.value || '').trim();
      if (nomor.length < 3) return setCheckMessage('Nomor anggota belum diisi dengan benar.', 'error');
      if (nama.length < 2) return setCheckMessage('Nama lengkap wajib diisi.', 'error');

      const button = $('#dues-check-submit');
      if (button) { button.disabled = true; button.textContent = 'Mencari…'; }
      try {
        const { data, error } = await supabase.rpc('dues_status', { p_nomor: nomor, p_nama: nama });
        if (error) throw error;
        const rows = Array.isArray(data) ? data : [];
        if (!rows.length) {
          setCheckMessage('Belum ada pembayaran tercatat untuk nama dan nomor anggota ini. Bila sudah membayar, isi formulir konfirmasi di atas.', 'error');
          return;
        }
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        wrap.style.overflowX = 'auto';
        const table = document.createElement('table');
        table.className = 'dues-check-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['Periode', 'Lama', 'Jumlah', 'Status', 'Tanggal bayar'].forEach(title => {
          const th = document.createElement('th');
          th.textContent = title;
          headRow.append(th);
        });
        thead.append(headRow);
        const tbody = document.createElement('tbody');
        rows.forEach(row => {
          const tr = document.createElement('tr');
          const period = document.createElement('td');
          period.textContent = periodRangeShort(row.period, row.months);
          const length = document.createElement('td');
          length.textContent = `${Number(row.months) || 1} bulan`;
          const amount = document.createElement('td');
          amount.textContent = rupiah(row.amount);
          const status = document.createElement('td');
          const pill = document.createElement('span');
          const verified = row.status === 'terverifikasi';
          pill.className = `dues-pill ${verified ? 'is-ok' : 'is-wait'}`;
          pill.textContent = verified ? 'Lunas' : 'Menunggu';
          status.append(pill);
          const paid = document.createElement('td');
          paid.textContent = prettyDate(row.paid_at);
          tr.append(period, length, amount, status, paid);
          tbody.append(tr);
        });
        table.append(thead, tbody);
        wrap.append(table);
        const summary = document.createElement('p');
        summary.className = 'dues-help';
        // Kumpulkan bulan yang sudah lunas / menunggu dari semua baris.
        const paidMonths = [];
        const pendingMonths = [];
        rows.forEach(row => {
          const list = Array.isArray(row.periods) && row.periods.length
            ? row.periods
            : invoiceMonths(row.period, row.months);
          list.forEach(month => {
            if (row.status === 'terverifikasi' && !paidMonths.includes(month)) paidMonths.push(month);
            if (row.status !== 'terverifikasi' && !pendingMonths.includes(month)) pendingMonths.push(month);
          });
        });

        if (state.invoice) {
          const target = invoiceMonths(state.invoice.period, state.invoice.months);
          const now = new Date();
          const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const dueTarget = target.filter(month => month <= nowKey);
          const paidHere = dueTarget.filter(month => paidMonths.includes(month));
          const pendingHere = dueTarget.filter(month => pendingMonths.includes(month) && !paidMonths.includes(month));
          const missing = dueTarget.filter(month => !paidMonths.includes(month) && !pendingMonths.includes(month));
          const laterUnpaid = target.filter(month => month > nowKey && !paidMonths.includes(month));
          if (dueTarget.length && !missing.length && !pendingHere.length) {
            summary.textContent = `Luar biasa — seluruh ${dueTarget.length} bulan yang sudah jatuh tempo pada ${state.invoice.title} sudah lunas. ` +
              (laterUnpaid.length ? `${laterUnpaid.length} bulan berikutnya belum jatuh tempo. ` : '') +
              'Terima kasih atas kedisiplinan Anda.';
          } else {
            const parts = [
              `${paidHere.length} dari ${dueTarget.length} bulan (jatuh tempo) sudah lunas`,
              pendingHere.length ? `${pendingHere.length} bulan menunggu verifikasi` : '',
              missing.length ? `belum dibayar: ${missing.map(monthShortLabel).join(', ')}` : '',
              laterUnpaid.length ? `${laterUnpaid.length} bulan belum jatuh tempo` : ''
            ].filter(Boolean);
            summary.textContent = `${state.invoice.title}: ${parts.join(' · ')}. Boleh membayar satu bulan dulu — tidak harus sekaligus.`;
          }
        } else {
          const targetPeriod = effectivePeriod();
          const currentPaid = paidMonths.includes(targetPeriod);
          summary.textContent = currentPaid
            ? `Terima kasih — iuran ${periodRangeShort(targetPeriod, effectiveMonths())} sudah lunas.`
            : `Iuran ${periodRangeShort(targetPeriod, effectiveMonths())} belum tercatat lunas. Bila sudah membayar, isi formulir konfirmasi di atas.`;
        }
        checkResult.replaceChildren(summary, wrap);
        checkResult.hidden = false;
      } catch (error) {
        const raw = String((error && error.message) || '');
        if (/Data tidak cocok/i.test(raw)) {
          setCheckMessage('Nama dan nomor anggota tidak cocok dengan data kartu. Periksa ejaan nama persis seperti di kartu anggota.', 'error');
        } else if (/function .*dues_status|does not exist|schema cache/i.test(raw)) {
          setCheckMessage('Fitur cek status belum diaktifkan di server. Minta Pemilik menjalankan migrasi iuran di Supabase.', 'error');
        } else {
          setCheckMessage(raw.replace(/^.*?:\s*/, '') || 'Gagal memeriksa status. Coba lagi.', 'error');
        }
      } finally {
        if (button) { button.disabled = false; button.textContent = 'Cek status iuran'; }
      }
    }

    // ---------- pencarian teks di dalam elemen ----------
    function bindCopy() {
      $$('[data-copy]').forEach(button => {
        button.addEventListener('click', async () => {
          const target = document.getElementById(button.dataset.copy);
          const text = target ? target.textContent.trim() : '';
          if (!text) return;
          const original = button.textContent;
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(text);
            } else {
              const area = document.createElement('textarea');
              area.value = text;
              area.style.position = 'fixed';
              area.style.opacity = '0';
              document.body.append(area);
              area.select();
              document.execCommand('copy');
              area.remove();
            }
            button.textContent = 'Tersalin ✓';
          } catch (error) {
            button.textContent = 'Gagal salin';
          }
          setTimeout(() => { button.textContent = original; }, 1800);
        });
      });
    }

    function bindLightbox() {
      const zoom = $('#dues-qris-zoom');
      const close = $('#dues-lightbox-close');
      if (zoom && lightbox) {
        zoom.addEventListener('click', () => { lightbox.hidden = false; });
      }
      if (close && lightbox) {
        close.addEventListener('click', () => { lightbox.hidden = true; });
      }
      if (lightbox) {
        lightbox.addEventListener('click', event => {
          if (event.target === lightbox) lightbox.hidden = true;
        });
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') lightbox.hidden = true;
        });
      }
    }

    // ---------- pasang semua ----------
    function applySettings(settings, online, configured) {
      state.settings = settings;
      state.online = online;
      state.configured = configured;
      paintBill();
      renderPeriodSelect();
      renderMonthPicker();
      paintQris();
      if (configWarning) {
        if (!online) {
          configWarning.hidden = false;
          configWarning.textContent = 'Pengaturan iuran belum bisa dimuat dari server. Nominal di halaman ini adalah nilai bawaan dan mungkin belum sesuai ketetapan pengurus. ' +
            'Konfirmasi pembayaran tetap bisa dikirim setelah koneksi pulih — atau langsung ke bendahara lewat WhatsApp.';
        } else if (!configured) {
          configWarning.hidden = false;
          configWarning.textContent = 'Pengurus belum mengisi pengaturan iuran. Nominal dan kanal pembayaran di halaman ini masih nilai bawaan. ' +
            'Hubungi bendahara untuk memastikan jumlah dan tujuan pembayaran sebelum mengirim uang.';
        } else {
          configWarning.hidden = true;
        }
      }
    }

    applySettings(state.settings, false, false);
    Promise.all([loadSettings(), loadInvoiceStatus()]).then(([settingsRes, inv]) => {
      state.invoice = inv && inv.active ? inv.active : null;
      state.hasInvoices = Boolean(inv && inv.hasInvoices);
      applySettings(normalizeSettings(settingsRes.settings), settingsRes.online, settingsRes.configured);
    });

    $$('input[name="metode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        setMethod(radio.value);
      });
    });
    // Balik: bila anggota mengubah "Cara bayar" di formulir, kartu metode ikut menyesuaikan.
    $('#f-metode')?.addEventListener('change', event => {
      const value = event.target.value;
      const match = $(`input[name="metode"][value="${value}"]`);
      if (match) match.checked = true;
      setMethod(value);
    });
    setMethod('qris');

    $('#dues-qty-minus')?.addEventListener('click', () => {
      state.qty = Math.max(1, state.qty - 1);
      paintQris();
    });
    $('#dues-qty-plus')?.addEventListener('click', () => {
      state.qty = Math.min(6, state.qty + 1);
      paintQris();
    });

    const dateInput = $('#f-tanggal');
    if (dateInput) {
      dateInput.max = todayIso();
      dateInput.value = todayIso();
    }
    const amountInput = $('#f-jumlah');
    if (amountInput && state.settings.nominal > 0) amountInput.value = String(state.settings.nominal);

    form?.addEventListener('submit', handleSubmit);
    checkForm?.addEventListener('submit', handleCheck);

    $('#dues-success-again')?.addEventListener('click', () => {
      successPanel.hidden = true;
      form.hidden = false;
      setFormMessage('');
      state.qty = 1;
      state.selectedMonths = [];
      renderMonthPicker();
      paintQris();
      form.elements.nama.focus();
    });

    bindCopy();
    bindLightbox();
  }

  // ========================================================================
  // Mulai
  // ========================================================================
  function start() {
    const page = document.getElementById('dues-main');
    const teasers = $$('[data-dues-teaser]');
    teasers.forEach(initTeaser);
    if (page) initPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
