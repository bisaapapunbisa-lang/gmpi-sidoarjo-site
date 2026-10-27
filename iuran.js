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
    const statusChip = field('status');

    function paint(settings) {
      const nominalNode = field('nominal');
      const periodNode = field('period');
      const dueNode = field('due');
      const noteNode = field('note');
      if (nominalNode) nominalNode.textContent = settings.nominal > 0 ? rupiah(settings.nominal) : 'Sesuai ketetapan';
      if (periodNode) periodNode.textContent = periodLabel(settings.periode);
      if (dueNode) dueNode.textContent = settings.jatuhTempo ? prettyDate(settings.jatuhTempo) : 'Sesuai pengumuman';
      if (noteNode) {
        noteNode.textContent = settings.aktif
          ? `${settings.nama} sudah dibuka. Bayar lewat QRIS — nominal terisi otomatis, tinggal pindai.`
          : `${settings.nama} belum dibuka — pantau pengumuman grup WhatsApp anggota.`;
      }
      if (statusChip) {
        statusChip.textContent = settings.aktif ? 'DIBUKA' : 'BELUM DIBUKA';
        statusChip.classList.toggle('is-open', settings.aktif);
      }
      if (cta) {
        cta.textContent = settings.aktif ? 'Bayar iuran sekarang' : 'Lihat rincian iuran';
      }
      if (canvas) {
        const payload = settings.nominal > 0 ? qrisWithAmount(settings.nominal) : null;
        const ok = payload ? drawQris(canvas, payload) : false;
        canvas.hidden = !ok;
        const fallback = $('[data-dues-qr-fallback]', root);
        if (fallback) fallback.hidden = ok;
      }
    }

    paint(normalizeSettings(FALLBACK));
    loadSettings().then(({ settings, online, configured }) => {
      // Modul belum dijalankan/diisi pengurus: jangan tampilkan blok kosong di beranda.
      if (!configured) { root.hidden = true; return; }
      paint(normalizeSettings(settings));
      const warn = $('[data-dues-teaser-warning]', root);
      if (warn) warn.hidden = online;
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

    function total() {
      const nominal = state.settings.nominal;
      const result = nominal > 0 ? nominal * state.qty : 0;
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
      const nominalNode = $('#dues-nominal');
      const periodNode = $('#dues-period');
      const dueNode = $('#dues-due');
      const dueItem = $('#dues-due-item');
      const countdown = $('#dues-countdown');
      const kicker = $('#dues-kicker');
      const catatan = $('#dues-catatan');

      if (nominalNode) nominalNode.textContent = s.nominal > 0 ? rupiah(s.nominal) : 'Sesuai ketetapan';
      if (periodNode) periodNode.textContent = periodLabel(s.periode);
      if (kicker) {
        const name = s.nama.toUpperCase();
        const period = periodLabel(s.periode).toUpperCase();
        kicker.textContent = (name.includes(String(s.periode)) ? name : `${name} · ${period}`).slice(0, 70);
      }
      if (catatan) {
        catatan.textContent = s.catatan ||
          'Iuran dipakai untuk kas organisasi: advokasi warga, kegiatan sosial, dan operasional sekretariat DPD.';
      }

      const days = s.jatuhTempo ? daysUntil(s.jatuhTempo) : null;
      if (dueNode && dueItem) {
        if (s.jatuhTempo) {
          dueNode.textContent = prettyDate(s.jatuhTempo);
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
        const message = `Assalamualaikum, saya anggota GMPI DPD Sidoarjo. Saya ingin menanyakan ${s.nama} periode ${periodLabel(s.periode)}.`;
        waNode.href = waLink(s.wa, message);
      }
      const footWa = $('#dues-foot-wa');
      if (footWa && s.wa) {
        footWa.href = waLink(s.wa, `Assalamualaikum, saya ingin menanyakan ${s.nama}.`);
      }

      const ewalletNode = $('#dues-ewallet-text');
      if (ewalletNode) ewalletNode.textContent = s.ewallet || 'Belum diatur pengurus — gunakan QRIS atau transfer bank.';
      const bankNode = $('#dues-bank-text');
      if (bankNode) bankNode.textContent = s.bank || 'Belum diatur pengurus.';

      // Status buka/tutup
      const main = $('#bayar');
      const konfirmasi = $('#konfirmasi');
      if (!s.aktif) {
        if (main) main.hidden = true;
        if (konfirmasi) konfirmasi.hidden = true;
        if (closedBox) {
          closedBox.hidden = false;
          closedBox.textContent = (!state.configured
            ? 'Modul iuran belum diaktifkan pengurus. '
            : '') + `${s.nama} periode ${periodLabel(s.periode)} belum dibuka pengurus. ` +
            'Halaman ini otomatis bisa dipakai begitu bendahara membuka periode iuran. ' +
            'Sementara itu, cek status pembayaran sebelumnya di bawah atau hubungi bendahara.';
        }
      } else {
        if (main) main.hidden = false;
        if (konfirmasi) konfirmasi.hidden = false;
        if (closedBox) closedBox.hidden = true;
      }
    }

    // ---------- QRIS ----------
    function paintQris() {
      const amount = total();
      const amountNode = $('#dues-qris-amount');
      const manualNode = $('#dues-qris-manual');
      const qtyNode = $('#dues-qty');
      const totalNode = $('#dues-total');

      if (qtyNode) qtyNode.textContent = String(state.qty);
      if (totalNode) totalNode.textContent = amount > 0 ? rupiah(amount) : 'sesuai ketetapan';
      if (manualNode) manualNode.textContent = amount > 0 ? rupiah(amount) : 'sesuai ketetapan';
      if (amountNode) {
        amountNode.textContent = amount > 0
          ? `Nominal otomatis: ${rupiah(amount)}`
          : 'Nominal diketik manual di aplikasi pembayaran';
      }

      const minus = $('#dues-qty-minus');
      const plus = $('#dues-qty-plus');
      if (minus) minus.disabled = state.qty <= 1;
      if (plus) plus.disabled = state.qty >= 6;

      if (!canvas) return;
      const payload = amount > 0 ? qrisWithAmount(amount) : null;
      const drawn = payload ? drawQris(canvas, payload) : false;
      canvas.hidden = !drawn;
      canvas.setAttribute('aria-label', amount > 0
        ? `QRIS pembayaran iuran sebesar ${rupiah(amount)}`
        : 'QRIS pembayaran iuran');
      const fallback = $('#dues-qris-fallback');
      if (fallback) fallback.hidden = drawn;

      const hiddenAmount = $('#f-jumlah');
      if (hiddenAmount && amount > 0) hiddenAmount.value = String(amount);

      const jumlahHelp = $('#dues-jumlah-help');
      if (jumlahHelp) {
        jumlahHelp.textContent = state.qty > 1
          ? `Total ${state.qty} periode${amount > 0 ? ` (${rupiah(amount)})` : ''}. Tulis periode mana saja yang dibayar di kolom catatan agar bendahara mencatat dengan benar.`
          : 'Otomatis terisi dari total di atas. Ubah bila memang berbeda.';
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
        `Periode: ${periodLabel(payload.periode)}`,
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
        text.textContent = `Iuran ${periodLabel(payload.periode)} sebesar ${rupiah(payload.jumlah)} ` +
          `atas nama ${payload.nama} sudah masuk daftar tunggu verifikasi bendahara.`;
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
        periode: String(form.elements.periode.value || ''),
        jumlah: parseDigits(form.elements.jumlah.value),
        tanggal: String(form.elements.tanggal.value || ''),
        catatan: String(form.elements.catatan.value || '').trim()
      };

      if (payload.nama.length < 2) return setFormMessage('Nama lengkap wajib diisi minimal 2 huruf.', 'error');
      if (!DISTRICT_LIST.includes(payload.kecamatan)) return setFormMessage('Pilih kecamatan domisili terlebih dulu.', 'error');
      if (payload.wa.length < 9 || payload.wa.length > 15) return setFormMessage('Nomor WhatsApp belum benar. Contoh: 081234567890.', 'error');
      if (!payload.periode) return setFormMessage('Periode iuran belum dipilih.', 'error');
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
          p_note: payload.catatan || null
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
        ['Periode', 'Jumlah', 'Status', 'Tanggal bayar'].forEach(title => {
          const th = document.createElement('th');
          th.textContent = title;
          headRow.append(th);
        });
        thead.append(headRow);
        const tbody = document.createElement('tbody');
        rows.forEach(row => {
          const tr = document.createElement('tr');
          const period = document.createElement('td');
          period.textContent = periodLabel(row.period);
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
          tr.append(period, amount, status, paid);
          tbody.append(tr);
        });
        table.append(thead, tbody);
        wrap.append(table);
        const summary = document.createElement('p');
        summary.className = 'dues-help';
        const verifiedPeriods = rows.filter(row => row.status === 'terverifikasi').map(row => row.period);
        const currentPaid = verifiedPeriods.includes(state.settings.periode);
        summary.textContent = currentPaid
          ? `Terima kasih — iuran ${periodLabel(state.settings.periode)} sudah lunas.`
          : `Iuran ${periodLabel(state.settings.periode)} belum tercatat lunas. Bila sudah membayar, isi formulir konfirmasi di atas.`;
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
    loadSettings().then(({ settings, online, configured }) => {
      applySettings(normalizeSettings(settings), online, configured);
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
