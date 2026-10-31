(() => {
  const section = document.querySelector('.poster-cinema');
  const frame = section?.querySelector('.cinema-frame');
  const button = section?.querySelector('.cinema-play');
  const label = section?.querySelector('.cinema-play-label');
  const audio = section?.querySelector('.cinema-voiceover');
  const status = section?.querySelector('.cinema-status');
  if (!section || !frame || !button || !audio || !label) return;

  let voiceTimer;
  const reset = () => {
    window.clearTimeout(voiceTimer);
    audio.pause();
    audio.currentTime = 0;
    section.classList.remove('is-playing');
    button.setAttribute('aria-pressed', 'false');
    label.textContent = 'Putar adegan & narasi';
  };

  button.addEventListener('click', () => {
    if (section.classList.contains('is-playing')) {
      reset();
      return;
    }
    status.textContent = '';
    reset();
    void section.offsetWidth;
    section.classList.add('is-playing');
    button.setAttribute('aria-pressed', 'true');
    label.textContent = 'Hentikan adegan';

    // Keep the first two seconds silent and dark, matching the supplied storyboard.
    voiceTimer = window.setTimeout(() => {
      audio.currentTime = 0;
      audio.play().catch(() => {
        status.textContent = 'Narasi tidak dapat diputar. Coba tekan tombol putar lagi.';
        reset();
      });
    }, 2000);
  });

  audio.addEventListener('ended', reset);
  audio.addEventListener('error', () => {
    status.textContent = 'Narasi tidak dapat dimuat. Periksa koneksi lalu coba lagi.';
    reset();
  });

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    frame.addEventListener('pointermove', (event) => {
      if (!section.classList.contains('is-playing')) return;
      const bounds = frame.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * -8;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -8;
      frame.style.setProperty('--cinema-x', `${x.toFixed(1)}px`);
      frame.style.setProperty('--cinema-y', `${y.toFixed(1)}px`);
    }, { passive: true });
    frame.addEventListener('pointerleave', () => {
      frame.style.setProperty('--cinema-x', '0px');
      frame.style.setProperty('--cinema-y', '0px');
    }, { passive: true });
  }
})();
