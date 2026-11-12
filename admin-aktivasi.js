(() => {
  const message = document.querySelector('#activation-message');
  const form = document.querySelector('#activation-form');
  const password = document.querySelector('#new-password');
  const confirmation = document.querySelector('#confirm-password');
  const button = document.querySelector('#save-password');
  const config = window.GMPI_SUPABASE_CONFIG || {};

  function showMessage(text, type = '') {
    message.textContent = text;
    message.className = `admin-message${type ? ` is-${type}` : ''}`;
  }
  function invalidLink() {
    form.hidden = true;
    showMessage('Tautan tidak valid, sudah dipakai, atau kedaluwarsa. Buka halaman masuk Admin dan minta tautan pengaturan kata sandi yang baru.', 'error');
  }

  // Hanya terima tautan undangan/pemulihan, bukan sesi Admin yang sudah login.
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (!['invite', 'recovery'].includes(fragment.get('type')) || !fragment.get('access_token') || !fragment.get('refresh_token')) {
    invalidLink();
    return;
  }
  if (!config.url || !config.publishableKey || !window.supabase || typeof window.supabase.createClient !== 'function') {
    showMessage('Halaman tidak dapat terhubung. Periksa koneksi internet dan coba buka tautan lagi.', 'error');
    return;
  }

  // Sesi sementara di memori terpisah dari sesi Admin yang mungkin sedang aktif.
  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true, storageKey: 'gmpi-password-setup' }
  });

  async function initialize() {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user) return invalidLink();
      document.querySelector('#activation-email').textContent = `Akun: ${data.session.user.email || 'email yang diundang'}`;
      showMessage('Tautan diterima. Buat kata sandi baru untuk akun ini.');
      form.hidden = false;
    } catch (_) {
      invalidLink();
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (password.value.length < 8) return showMessage('Kata sandi harus sedikitnya 8 karakter.', 'error');
    if (password.value !== confirmation.value) return showMessage('Kedua kata sandi belum sama.', 'error');
    button.disabled = true;
    showMessage('Menyimpan kata sandi…', 'warning');
    try {
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) {
        showMessage('Kata sandi belum berhasil disimpan. Coba lagi atau minta tautan baru jika tautan sudah kedaluwarsa.', 'error');
        return;
      }
      form.reset();
      form.hidden = true;
      // Jangan ubah sesi Admin lain pada perangkat ini.
      await client.auth.signOut({ scope: 'local' }).catch(() => {});
      showMessage('Kata sandi berhasil disimpan. Silakan masuk melalui halaman Admin dengan email undangan dan kata sandi yang baru dibuat.');
    } catch (_) {
      showMessage('Kata sandi belum berhasil disimpan. Periksa koneksi dan coba lagi.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  initialize();
})();
