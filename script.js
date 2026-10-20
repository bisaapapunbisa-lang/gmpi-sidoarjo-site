(() => {
  // Set these to the verified organizational inboxes before publishing.
  // Mailto opens the visitor's email app; it does not submit silently.
  const SITE_CONFIG = {
    lbhEmail: ''
  };

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const navLinks = [...document.querySelectorAll('.nav-link')];

  menuButton.addEventListener('click', () => {
    const expanded = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open', !expanded);
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    nav.classList.remove('open');
  }));

  const sections = [...document.querySelectorAll('main section[id]')];
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const match = navLinks.find(link => link.getAttribute('href') === `#${entry.target.id}`);
        if (match) navLinks.forEach(link => link.classList.toggle('active', link === match));
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    sections.forEach(section => observer.observe(section));
  }

  // Load real footage only when the supplied DPD video file is present.
  const video = document.querySelector('.hero-video');
  const videoPath = 'assets/hero-aksi.mp4';
  fetch(videoPath, { method: 'HEAD' }).then(response => {
    if (!response.ok) return;
    video.src = videoPath;
    video.addEventListener('loadeddata', () => video.classList.add('is-ready'), { once: true });
    video.addEventListener('error', () => video.classList.remove('is-ready'), { once: true });
    video.load();
  }).catch(() => {});

  // Optional official gallery photos; the designed fallback remains if files are absent.
  document.querySelectorAll('.gallery-photo').forEach(image => {
    image.addEventListener('load', () => image.parentElement.classList.add('has-photo'), { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
  });

  // Masonry category filters.
  document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      document.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('selected', item === button));
      document.querySelectorAll('.gallery-tile').forEach(tile => {
        tile.classList.toggle('is-hidden', filter !== 'semua' && tile.dataset.category !== filter);
      });
    });
  });

  const buildMailto = (address, subject, lines) => {
    const body = lines.map(([label, value]) => `${label}: ${value}`).join('\n');
    return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const reportForm = document.querySelector('#report-form');
  const reportStatus = document.querySelector('#report-status');
  reportForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!SITE_CONFIG.lbhEmail) {
      reportStatus.textContent = 'Alamat surel resmi LBH belum dikonfigurasi. Data tidak dikirim; lengkapi lbhEmail di script.js sebelum formulir dipublikasikan.';
      return;
    }
    const data = new FormData(reportForm);
    const mail = buildMailto(SITE_CONFIG.lbhEmail, `Pengaduan warga GMPI — ${data.get('area')}`, [
      ['Nama', data.get('name')], ['Kontak', data.get('contact')], ['Kecamatan', data.get('area')],
      ['Topik', data.get('type')], ['Ringkasan', data.get('message')]
    ]);
    reportStatus.textContent = 'Aplikasi email akan dibuka. Tinjau isi pesan, lalu tekan Kirim untuk meneruskan laporan.';
    window.location.href = mail;
  });

  const joinForm = document.querySelector('#join-form');
  const joinStatus = document.querySelector('#join-status');
  const nikInput = document.querySelector('#join-nik');
  nikInput.addEventListener('input', () => {
    nikInput.value = nikInput.value.replace(/\D/g, '').slice(0, 16);
  });
  const birthDate = document.querySelector('#join-birthdate');
  birthDate.max = new Date().toISOString().slice(0, 10);

  const fileLimits = [
    { input: document.querySelector('#join-ktp'), status: document.querySelector('#ktp-status') },
    { input: document.querySelector('#join-profile'), status: document.querySelector('#profile-status') }
  ];
  fileLimits.forEach(({ input, status }) => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      status.classList.remove('is-error');
      input.setCustomValidity('');
      if (!file) {
        status.textContent = 'Belum ada file dipilih';
        return;
      }
      const validType = ['image/jpeg', 'image/png'].includes(file.type);
      const validSize = file.size <= 5 * 1024 * 1024;
      if (!validType || !validSize) {
        input.value = '';
        input.setCustomValidity(!validType ? 'Pilih gambar JPG atau PNG.' : 'Ukuran file maksimal 5 MB.');
        status.textContent = !validType ? 'Format tidak sesuai. Pilih JPG atau PNG.' : 'File melebihi batas 5 MB.';
        status.classList.add('is-error');
        return;
      }
      status.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    });
  });

  joinForm.addEventListener('submit', event => {
    event.preventDefault();
    joinStatus.textContent = 'Pendaftaran belum dikirim. Ini hanya prototipe: data pribadi dan file tidak diunggah maupun disimpan. DPD perlu mengaktifkan sistem registrasi aman dan menerbitkan pemberitahuan privasi terlebih dahulu.';
  });

  // Public CMS fields are read-only for visitors; Supabase RLS controls all writes.
  const DEFAULT_LOGO = 'assets/logo-gmpi-sidoarjo-crop.webp';
  let resolveLogo;
  const logoReady = new Promise(resolve => { resolveLogo = resolve; });
  const supabaseConfig = window.GMPI_SUPABASE_CONFIG || {};
  if (supabaseConfig.url && supabaseConfig.publishableKey) {
    const apiRoot = supabaseConfig.url.endsWith('/') ? supabaseConfig.url.slice(0, -1) : supabaseConfig.url;
    const apiBase = `${apiRoot}/rest/v1/site_content?select=key,value`;
    fetch(apiBase, { headers: { apikey: supabaseConfig.publishableKey, Authorization: `Bearer ${supabaseConfig.publishableKey}` } })
      .then(response => response.ok ? response.json() : [])
      .then(rows => {
        let logoHandled = false;
        rows.forEach(row => {
          const text = row.value && typeof row.value.text === 'string' ? row.value.text : null;
          if (row.key === 'site_logo') {
            // Only accept files from the public logo folder; empty value keeps the built-in logo.
            if (text && /^logos\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(text)) {
              logoHandled = true;
              const logoUrl = `${apiRoot}/storage/v1/object/public/site-assets/${text}`;
              const probe = new Image();
              probe.onload = () => {
                document.querySelectorAll('[data-site-logo]').forEach(img => { img.src = logoUrl; });
                resolveLogo(logoUrl);
              };
              probe.onerror = () => resolveLogo(DEFAULT_LOGO);
              probe.src = logoUrl;
            }
            return;
          }
          const target = document.querySelector(`[data-cms-key="${row.key}"]`);
          if (target && text !== null) target.textContent = text;
        });
        if (!logoHandled) resolveLogo(DEFAULT_LOGO);
      })
      .catch(() => resolveLogo(DEFAULT_LOGO));
  } else {
    resolveLogo(DEFAULT_LOGO);
  }

  // Contoh Kartu Tanda Anggota (data fiktif, ditandai CONTOH). QR mengarah ke kode CONTOH.
  const sampleCanvas = document.querySelector('#kta-sample');
  const sampleBack = document.querySelector('#kta-sample-back');
  if (sampleCanvas && window.GMPICard) {
    const sampleData = {
      name: 'Nama Anggota', number: 'GMPI-SDA-2026-0000', district: 'Sidoarjo', jabatan: 'Anggota',
      issued: '2026-10-20', validUntil: '2028-10-20', token: 'CONTOH', sample: true
    };
    const drawSample = logo => {
      window.GMPICard.draw(sampleCanvas, { ...sampleData, logo });
      if (sampleBack) window.GMPICard.drawBack(sampleBack, { ...sampleData, logo });
    };
    Promise.all([window.GMPICard.ready(), window.GMPICard.loadImage(DEFAULT_LOGO)])
      .then(([, logo]) => {
        drawSample(logo);
        sampleCanvas.closest('.kta-card-wrap')?.classList.add('is-ready');
        return logoReady.then(url => (url !== DEFAULT_LOGO ? window.GMPICard.loadImage(url, true) : null));
      })
      .then(customLogo => { if (customLogo) drawSample(customLogo); })
      .catch(() => {});

    // Klik / ketuk kartu (atau tombol petunjuk) untuk membalik.
    const flipper = document.querySelector('#kta-flipper');
    const hint = document.querySelector('#kta-hint');
    const flip = () => {
      const flipped = !flipper.classList.contains('is-flipped');
      flipper.classList.toggle('is-flipped', flipped);
      hint?.classList.toggle('is-flipped', flipped);
      flipper.setAttribute('aria-pressed', String(flipped));
      flipper.setAttribute('aria-label', flipped ? 'Balik kartu untuk melihat sisi depan' : 'Balik kartu untuk melihat sisi belakang');
      if (hint) hint.lastChild.textContent = flipped ? ' Klik untuk lihat sisi depan' : ' Klik kartu untuk membalik';
    };
    flipper?.addEventListener('click', flip);
    hint?.addEventListener('click', flip);
  }

  document.querySelector('#year').textContent = new Date().getFullYear();
})();
