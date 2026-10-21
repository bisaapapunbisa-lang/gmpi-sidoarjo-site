// ================================================================
// GMPI DPD Sidoarjo — Undangan digital + konfirmasi kehadiran.
// ================================================================
// UNTUK ACARA BERIKUTNYA: cukup ganti 5 baris di bawah ini, lalu
// minta Pemilik mengosongkan daftar di Admin → tab "Kehadiran".
const ACARA = {
  nama: 'Rapat DPD GMPI Sidoarjo',
  tanggal: 'Rabu, 21 Oktober 2026',
  waktu: 'Pukul 18.30 WIB — selesai',
  tempat: 'Graha Bougenville Kav. 22–23, Kel. Kemiri, Kec. Sidoarjo, Kab. Sidoarjo',
  agenda: 'Rapat Koordinasi & Konsolidasi Internal'
};
// ================================================================
(() => {
  const config = window.GMPI_SUPABASE_CONFIG || {};
  const $ = id => document.getElementById(id);
  const form = $('rsvp-form');
  const nama = $('f-nama');
  const alasanWrap = $('alasan-wrap');
  const alasan = $('f-alasan');
  const alasanLain = $('f-alasan-lain');
  const btn = $('btn-kirim');
  const msg = $('msg');
  const okPanel = $('ok-panel');
  const okText = $('ok-text');
  const okTitle = $('ok-title');

  $('ev-nama').textContent = ACARA.nama;
  $('ev-tgl').textContent = ACARA.tanggal;
  $('ev-wkt').textContent = ACARA.waktu;
  $('ev-tempat').textContent = ACARA.tempat;
  $('ev-agenda').textContent = ACARA.agenda;

  let client = null;
  const ready = Boolean(config.url && config.publishableKey && window.supabase && typeof window.supabase.createClient === 'function');
  if (ready) client = window.supabase.createClient(config.url, config.publishableKey);

  if (!ready) {
    $('cfg-warn').hidden = false;
    return;
  }
  form.hidden = false;
  $('counts').hidden = false;

  function kehadiran() {
    return (form.querySelector('input[name="keh"]:checked') || {}).value || 'hadir';
  }
  function syncAlasan() {
    const tidak = kehadiran() === 'tidak';
    alasanWrap.hidden = !tidak;
    alasanLain.hidden = !(tidak && alasan.value === '__lain');
  }
  form.querySelectorAll('input[name="keh"]').forEach(r => r.addEventListener('change', syncAlasan));
  alasan.addEventListener('change', syncAlasan);
  syncAlasan();

  function setMsg(text, isErr) {
    msg.textContent = text;
    msg.hidden = !text;
    msg.classList.toggle('err', Boolean(isErr));
  }

  async function refreshCounts() {
    try {
      const { data, error } = await client.rpc('rsvp_counts');
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) return;
      $('c-hadir').textContent = row.hadir || 0;
      $('c-tidak').textContent = row.tidak || 0;
      $('c-belum').textContent = row.belum || 0;
    } catch (e) { /* biarkan */ }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const nm = nama.value.trim().replace(/\s+/g, ' ');
    const keh = kehadiran();
    let al = '';
    if (keh === 'tidak') {
      al = alasan.value === '__lain' ? alasanLain.value.trim() : alasan.value;
      if (!al) { setMsg('Mohon pilih alasan tidak hadir.', true); alasan.focus(); return; }
    }
    if (nm.length < 2) { setMsg('Nama wajib diisi (minimal 2 huruf).', true); nama.focus(); return; }
    btn.disabled = true; btn.textContent = 'MENGIRIM…';
    setMsg('');
    try {
      const { error } = await client.rpc('submit_rsvp', { p_nama: nm, p_kehadiran: keh, p_alasan: al || null });
      btn.disabled = false; btn.textContent = 'KIRIM KONFIRMASI';
      if (error) throw error;
      form.hidden = true; okPanel.style.display = 'block';
      const kata = keh === 'hadir' ? 'HADIR' : (keh === 'tidak' ? 'TIDAK HADIR' : 'BELUM PASTI');
      okTitle.textContent = 'Terima kasih, ' + nm + '!';
      okText.textContent = 'Jawaban Anda (' + kata + (al ? ' — ' + al : '') + ') sudah tercatat di pengurus. Sampai jumpa di acara!';
      await refreshCounts();
      okPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      btn.disabled = false; btn.textContent = 'KIRIM KONFIRMASI';
      setMsg('Gagal mengirim: ' + (e && e.message ? e.message : 'koneksi bermasalah') + '. Coba lagi, atau balas langsung di grup WhatsApp.', true);
    }
  });

  $('btn-lagi').addEventListener('click', () => {
    okPanel.style.display = 'none';
    form.hidden = false;
    nama.value = ''; alasan.value = ''; alasanLain.value = '';
    form.querySelector('input[name="keh"][value="hadir"]').checked = true;
    syncAlasan(); setMsg(''); nama.focus();
  });

  refreshCounts();
  setInterval(refreshCounts, 45000);
})();
