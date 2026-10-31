(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('film-canvas'), stage = $('film-stage'), consoleEl = $('film');
  const audio = $('film-audio'), timeline = $('timeline');
  const chapterButtons = [...document.querySelectorAll('[data-time]')];
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const state = { time: 0, playing: false, started: false, sound: false, gentle: motionQuery.matches, ready: false, pointerX: 0, pointerY: 0 };
  let renderer, frameId = 0, lastTick = 0, lastDraw = 0, resizeObserver;
  const format = t => `00:${String(Math.floor(t)).padStart(2, '0')}`;
  const announce = text => { $('player-status').textContent = text; };

  function paint() {
    if (!renderer) return;
    renderer.render(state.started ? state.time : 15, state);
    timeline.value = state.time;
    timeline.style.setProperty('--progress', `${state.time / 24 * 100}%`);
    timeline.setAttribute('aria-valuetext', `${state.time.toFixed(1)} detik dari 24 detik`);
    $('time-current').textContent = format(state.time);
    let current = 0;
    chapterButtons.forEach((button, i) => { if (state.time >= Number(button.dataset.time)) current = i; });
    chapterButtons.forEach((button, i) => button.setAttribute('aria-current', String(state.started && i === current)));
  }
  function updateControls() {
    $('play-symbol').textContent = state.playing ? 'Ⅱ' : '▶';
    $('play-toggle').setAttribute('aria-label', state.playing ? 'Jeda film' : 'Putar film');
    $('stage-overlay').classList.toggle('is-hidden', state.playing);
    $('hero-play-label').textContent = !state.ready ? 'Menyiapkan film…' : state.time >= 24 ? 'Putar ulang film' : state.started ? 'Lanjutkan film' : 'Putar film sinematik';
    $('sound-toggle').setAttribute('aria-pressed', String(state.sound));
    $('sound-toggle').setAttribute('aria-label', state.sound ? 'Matikan suara' : 'Aktifkan suara');
    $('sound-symbol').textContent = state.sound ? '🔊' : '🔇';
    $('gentle-toggle').setAttribute('aria-pressed', String(state.gentle));
  }
  function syncAudio() {
    audio.loop = false;
    if (state.playing && state.sound) {
      audio.currentTime = state.time;
      audio.play().catch(() => { state.sound = false; updateControls(); announce('Suara tidak dapat diputar. Film dilanjutkan tanpa suara.'); });
    } else audio.pause();
  }
  function stop() {
    state.playing = false;
    cancelAnimationFrame(frameId);
    syncAudio();updateControls();paint();
  }
  function tick(now) {
    if (!state.playing) return;
    const delta = Math.min((now - lastTick) / 1000, .1);
    lastTick = now;
    state.time = Math.min(24, state.time + delta);
    if (now - lastDraw >= 1000 / 30 || state.time >= 24) { paint(); lastDraw = now; }
    if (state.time >= 24) { stop(); announce('Film selesai. Putar ulang atau unduh versi 4K.'); return; }
    frameId = requestAnimationFrame(tick);
  }
  function play() {
    if (!state.ready) return;
    if (state.time >= 24) state.time = 0;
    if (!state.started) { state.started = true; state.time = 0; }
    state.playing = true;
    lastTick = performance.now();
    syncAudio();updateControls();paint();
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(tick);
    announce(state.gentle ? 'Film diputar dengan cahaya lembut.' : 'Film diputar.');
  }
  function toggle() { state.playing ? stop() : play(); }
  function seek(time, autoplay = false) {
    if (!state.ready) return;
    state.started = true;
    state.time = Math.max(0, Math.min(24, time));
    if (autoplay && !state.playing) play();
    else { syncAudio();paint(); if (state.time >= 24) stop(); }
  }
  function toggleSound() {
    if (!state.ready) return;
    state.sound = !state.sound;
    syncAudio();updateControls();
    announce(state.sound ? 'Suara sinematik aktif.' : 'Suara dimatikan.');
  }
  function resize() {
    if (!renderer) return;
    const width = Math.max(960, Math.min(1920, Math.round(stage.clientWidth * Math.min(devicePixelRatio || 1, 2))));
    canvas.width = width;
    canvas.height = Math.round(width * 9 / 16);
    paint();
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (consoleEl.requestFullscreen) await consoleEl.requestFullscreen();
      else consoleEl.classList.toggle('is-expanded');
    } catch { consoleEl.classList.toggle('is-expanded'); }
    $('fullscreen').setAttribute('aria-label', document.fullscreenElement || consoleEl.classList.contains('is-expanded') ? 'Keluar layar penuh' : 'Layar penuh');
    resize();
  }

  $('hero-play').addEventListener('click', play);
  $('play-toggle').addEventListener('click', toggle);
  $('replay').addEventListener('click', () => { seek(0); play(); });
  $('sound-toggle').addEventListener('click', toggleSound);
  $('gentle-toggle').addEventListener('click', () => {
    state.gentle = !state.gentle;
    state.pointerX = state.pointerY = 0;
    updateControls();paint();
    announce(state.gentle ? 'Cahaya lembut aktif. Kilat dan guncangan dikurangi.' : 'Cahaya sinematik penuh aktif.');
  });
  $('fullscreen').addEventListener('click', fullscreen);
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh');resize();
  });
  timeline.addEventListener('input', () => seek(Number(timeline.value)));
  chapterButtons.forEach(button => button.addEventListener('click', () => { seek(Number(button.dataset.time), true); }));
  stage.addEventListener('pointermove', event => {
    if (!state.playing || state.gentle || motionQuery.matches || event.pointerType === 'touch') return;
    const rect = stage.getBoundingClientRect();
    state.pointerX = (event.clientX - rect.left) / rect.width * 2 - 1;
    state.pointerY = (event.clientY - rect.top) / rect.height * 2 - 1;
  });
  stage.addEventListener('pointerleave', () => { state.pointerX = state.pointerY = 0; });
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,button,a,[contenteditable]')) return;
    if (event.code === 'Space' || event.key.toLowerCase() === 'k') { event.preventDefault(); toggle(); }
    else if (event.key.toLowerCase() === 'm') toggleSound();
    else if (event.key.toLowerCase() === 'f') fullscreen();
    else if (event.key === 'ArrowRight') { event.preventDefault(); seek(state.time + 2); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); seek(state.time - 2); }
    else if (event.key === 'Escape') consoleEl.classList.remove('is-expanded');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.playing) { stop(); announce('Film dijeda karena tab tidak aktif.'); } });
  motionQuery.addEventListener('change', event => {
    if (event.matches) { state.gentle = true; state.pointerX = state.pointerY = 0; if (state.playing) stop(); updateControls();paint(); }
  });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frameId);audio.pause(); });

  async function init() {
    try {
      const files = { stage: 'stage.webp', left: 'figure-sayegi.webp', right: 'figure-hasmin.webp', crest: 'crest.webp' };
      const assets = {};
      await Promise.all(Object.entries(files).map(async ([key, file]) => {
        const image = new Image(); image.src = `assets/cinema/${file}`;
        await image.decode(); assets[key] = image;
      }));
      await Promise.all([document.fonts.load('142px Anton'), document.fonts.load('800 27px Inter')]);
      renderer = GMPIFilm.createRenderer(canvas, assets);
      state.ready = true;
      resize();
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage);
      $('film-fallback').hidden = true; canvas.hidden = false;
      document.querySelectorAll('button:disabled,input:disabled').forEach(el => { el.disabled = false; });
      updateControls();paint();
      announce('Film siap. Tekan Putar film sinematik untuk mulai.');
      // Exposed for deterministic visual regression tests, not an autoplay hook.
      window.cinemaPlayer = { seek: time => { stop(); seek(time); }, getState: () => ({ ...state }), renderer };
    } catch (error) {
      console.error('Cinema initialization failed:', error);
      $('film-error').hidden = false;
      $('hero-play-label').textContent = 'Poster film';
      announce('Film interaktif tidak dapat dimuat. Poster dan unduhan tetap tersedia.');
    }
  }
  audio.removeAttribute('loop');
  updateControls();
  init();
})();
