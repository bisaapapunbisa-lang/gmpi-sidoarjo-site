/* Best-effort deterrents only: browsers cannot reliably prevent OS/device screenshots. */
(() => {
  const init = () => {
    if (document.getElementById('capture-watermark-overlay')) return;
    const watermark = document.createElement('div');
    watermark.id = 'capture-watermark-overlay';
    watermark.setAttribute('aria-hidden', 'true');
    document.body.appendChild(watermark);

    const notice = document.createElement('div');
    notice.id = 'capture-guard-notice';
    notice.setAttribute('role', 'status');
    notice.hidden = true;
    notice.textContent = 'Konten GMPI Sidoarjo. Pengambilan layar tidak dapat diblokir sepenuhnya.';
    document.body.appendChild(notice);
    let hideTimer;
    const showNotice = () => {
      notice.hidden = false;
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { notice.hidden = true; }, 3200);
    };

    document.addEventListener('contextmenu', (event) => {
      if (event.target.closest('input, textarea, select, [contenteditable="true"], .allow-contextmenu')) return;
      event.preventDefault();
      showNotice();
    }, true);

    document.addEventListener('dragstart', (event) => {
      if (event.target.closest('img, video, canvas')) event.preventDefault();
    }, true);

    document.addEventListener('keydown', (event) => {
      const key = (event.key || '').toLowerCase();
      if (key === 'printscreen') {
        event.preventDefault();
        showNotice();
      }
      if ((event.ctrlKey || event.metaKey) && key === 's') {
        event.preventDefault();
        showNotice();
      }
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
