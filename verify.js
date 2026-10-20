(() => {
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const box = document.querySelector('#vf-result');
  const icon = box.querySelector('.vf-icon');
  const title = document.querySelector('#vf-title');
  const desc = document.querySelector('#vf-desc');
  const details = document.querySelector('#vf-details');
  const checked = document.querySelector('#vf-checked');
  const form = document.querySelector('#vf-form');
  const input = document.querySelector('#vf-code');
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function formatDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '—';
  }
  function todayJakarta() {
    // Tanggal hari ini di WIB (YYYY-MM-DD) untuk membandingkan masa berlaku.
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function setState(kind, symbol, heading, text) {
    box.className = `vf-result is-${kind}`;
    icon.textContent = symbol;
    title.textContent = heading;
    desc.textContent = text;
  }
  function cleanToken(raw) {
    return String(raw || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 20);
  }
  function tokenFromUrl() {
    const path = /\/v\/([0-9A-Za-z]{6,20})\/?$/i.exec(location.pathname);
    if (path) return cleanToken(path[1]);
    return cleanToken(new URLSearchParams(location.search).get('k'));
  }

  async function verify(token) {
    details.hidden = true;
    checked.hidden = true;
    if (!token || token.length < 6) {
      setState('idle', '?', 'Menunggu kode kartu', 'Pindai QR pada kartu atau ketik kodenya di bawah.');
      return;
    }
    if (!config.url || !config.publishableKey) {
      setState('warning', '!', 'Verifikasi belum aktif', 'Situs belum terhubung ke basis data. Hubungi pengurus DPD.');
      return;
    }
    setState('loading', '◌', 'Memeriksa…', 'Mencocokkan kode dengan basis data resmi DPD.');
    try {
      const root = config.url.endsWith('/') ? config.url.slice(0, -1) : config.url;
      const response = await fetch(`${root}/rest/v1/rpc/verify_member_card`, {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.publishableKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ p_token: token })
      });
      if (!response.ok) throw new Error(String(response.status));
      const rows = await response.json();
      const card = Array.isArray(rows) ? rows[0] : null;
      if (!card) {
        setState('invalid', '✕', 'Kartu tidak terdaftar', 'Kode ini tidak ditemukan di basis data GMPI DPD Sidoarjo. Kartu kemungkinan palsu atau kodenya salah ketik.');
        return;
      }
      document.querySelector('#vf-name').textContent = card.full_name;
      document.querySelector('#vf-number').textContent = card.member_number;
      document.querySelector('#vf-district').textContent = card.district;
      document.querySelector('#vf-jabatan').textContent = card.jabatan;
      document.querySelector('#vf-valid').textContent = formatDate(card.valid_until);
      details.hidden = false;
      const expired = String(card.valid_until) < todayJakarta();
      if (card.is_sample) {
        setState('sample', 'i', 'Ini kartu contoh', 'QR ini berasal dari contoh kartu di situs. Bukan kartu anggota sungguhan dan tidak berlaku sebagai identitas.');
      } else if (card.status === 'dicabut') {
        setState('invalid', '✕', 'Kartu dicabut', 'Kartu ini terdaftar tetapi sudah dicabut oleh DPD dan tidak berlaku.');
      } else if (card.status === 'nonaktif') {
        setState('warning', '!', 'Keanggotaan nonaktif', 'Kartu ini terdaftar, tetapi status anggota sedang nonaktif.');
      } else if (expired) {
        setState('warning', '!', 'Kartu kedaluwarsa', 'Kartu ini asli dan terdaftar, tetapi masa berlakunya sudah habis. Silakan perpanjang di DPD.');
      } else {
        setState('valid', '✓', 'Kartu asli & aktif', 'Kartu ini terdaftar resmi di GMPI DPD Sidoarjo. Cocokkan nama dan nomor dengan yang tercetak di kartu.');
      }
      const now = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long', timeStyle: 'short' }).format(new Date());
      checked.textContent = `Diperiksa ${now} WIB · kode ••••${token.slice(-6)}`;
      checked.hidden = false;
    } catch (error) {
      setState('warning', '!', 'Tidak dapat memeriksa', 'Koneksi ke basis data gagal. Periksa internet Anda lalu coba lagi.');
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const token = cleanToken(input.value);
    input.value = token;
    if (token) history.replaceState(null, '', `/v/${token}`);
    verify(token);
  });

  const initial = tokenFromUrl();
  if (initial) input.value = initial;
  verify(initial);
})();
