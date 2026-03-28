/* ========================================
   CycleIQ Promo Site — Interactions
   ======================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ===== NAVBAR SCROLL =====
  const navbar = document.getElementById('navbar');
  let lastScroll = 0;

  const handleScroll = () => {
    const scrollY = window.scrollY;
    if (scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
    lastScroll = scrollY;
  };

  window.addEventListener('scroll', handleScroll, { passive: true });

  // ===== SCROLL REVEAL =====
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');

        // Trigger stream line animations
        const streamPaths = entry.target.querySelectorAll('.stream-path');
        streamPaths.forEach((path, i) => {
          setTimeout(() => path.classList.add('animated'), i * 300);
        });

        // Trigger counter animations
        const counters = entry.target.querySelectorAll('[data-target]');
        counters.forEach(counter => animateCounter(counter));
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -40px 0px'
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ===== NUMBER COUNTER ANIMATION =====
  function animateCounter(el) {
    const target = parseInt(el.dataset.target, 10);
    if (el.dataset.animated) return;
    el.dataset.animated = 'true';

    const duration = 1500;
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);

      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ===== SMOOTH SCROLL FOR NAV LINKS =====
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#') return;

      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        const offset = 70;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ===== CARD TILT EFFECT =====
  const tiltCards = document.querySelectorAll('[data-tilt]');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion) {
    tiltCards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;

        card.style.transform = `
          perspective(800px)
          rotateY(${x * 6}deg)
          rotateX(${-y * 6}deg)
          translateY(-4px)
        `;

        // Move glow toward cursor
        const glow = card.querySelector('.bento-glow');
        if (glow) {
          glow.style.left = `${e.clientX - rect.left - 100}px`;
          glow.style.top = `${e.clientY - rect.top - 100}px`;
          glow.style.opacity = '1';
        }
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
        const glow = card.querySelector('.bento-glow');
        if (glow) {
          glow.style.opacity = '0';
        }
      });
    });
  }

  // ===== SCRUBBER ANIMATION =====
  const scrubberThumb = document.querySelector('.scrubber-thumb');
  const scrubberValue = document.querySelector('.scrubber-value');

  if (scrubberThumb && scrubberValue) {
    let scrubberPos = 50;
    let direction = 1;

    function animateScrubber() {
      scrubberPos += direction * 0.3;
      if (scrubberPos > 75 || scrubberPos < 25) direction *= -1;

      scrubberThumb.style.left = scrubberPos + '%';

      const wattage = Math.round(120 + (scrubberPos - 25) * 2.6);
      const valueSpan = scrubberValue.querySelector('span');
      scrubberValue.textContent = wattage;
      scrubberValue.appendChild(valueSpan || Object.assign(document.createElement('span'), { textContent: 'W' }));

      // Color based on zone
      if (wattage < 150) {
        scrubberValue.style.color = '#4ecdc4';
      } else if (wattage < 180) {
        scrubberValue.style.color = '#00e5a0';
      } else if (wattage < 210) {
        scrubberValue.style.color = '#ff9f43';
      } else {
        scrubberValue.style.color = '#ff6b6b';
      }

      requestAnimationFrame(animateScrubber);
    }

    animateScrubber();
  }

  // ===== PARALLAX GLOW ON HERO =====
  if (!prefersReducedMotion) {
    const heroGlow = document.querySelector('.hero-glow');
    window.addEventListener('mousemove', (e) => {
      if (heroGlow) {
        const x = (e.clientX / window.innerWidth - 0.5) * 60;
        const y = (e.clientY / window.innerHeight - 0.5) * 40;
        heroGlow.style.transform = `translateX(calc(-50% + ${x}px)) translateY(${y}px)`;
      }
    }, { passive: true });
  }

  // ===== BATTERY FILL ANIMATION =====
  const batteryObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const segments = entry.target.querySelectorAll('.battery-segment.filled');
        segments.forEach((seg, i) => {
          seg.style.opacity = '0';
          seg.style.transition = `opacity 0.3s ${i * 150}ms`;
          requestAnimationFrame(() => { seg.style.opacity = '1'; });
        });
        batteryObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.battery-demo').forEach(el => batteryObserver.observe(el));

});
