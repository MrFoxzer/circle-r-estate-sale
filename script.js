// 98-Acre MN Estate — FSBO site script

document.addEventListener('DOMContentLoaded', () => {
    // ============================================
    // Mobile nav toggle
    // ============================================
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');
    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
        // close on link click (mobile)
        navLinks.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => navLinks.classList.remove('open'));
        });
    }

    // ============================================
    // Nav scroll effect (slight shadow on scroll)
    // ============================================
    const nav = document.getElementById('nav');
    if (nav) {
        const onScroll = () => {
            if (window.scrollY > 40) {
                nav.style.boxShadow = '0 2px 16px rgba(15, 36, 24, 0.25)';
            } else {
                nav.style.boxShadow = 'none';
            }
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    // ============================================
    // Reveal animation on scroll
    // ============================================
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    e.target.classList.add('in-view');
                    observer.unobserve(e.target);
                }
            });
        },
        { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('[data-animate]').forEach((el) => observer.observe(el));

    // ============================================
    // Stat counters
    // ============================================
    const counters = document.querySelectorAll('[data-count]');
    const counterObs = new IntersectionObserver(
        (entries) => {
            entries.forEach((e) => {
                if (e.isIntersecting) {
                    const el = e.target;
                    const target = parseInt(el.getAttribute('data-count'), 10);
                    if (Number.isNaN(target)) return;
                    const duration = 1400;
                    const start = performance.now();
                    const initial = el.textContent;
                    const suffix = /\+$/.test(initial) ? '+' : '';
                    const animate = (now) => {
                        const progress = Math.min(1, (now - start) / duration);
                        const eased = 1 - Math.pow(1 - progress, 3);
                        el.textContent = Math.round(target * eased).toLocaleString() + suffix;
                        if (progress < 1) requestAnimationFrame(animate);
                    };
                    requestAnimationFrame(animate);
                    counterObs.unobserve(el);
                }
            });
        },
        { threshold: 0.5 }
    );
    counters.forEach((c) => counterObs.observe(c));

    // ============================================
    // Gallery filters
    // ============================================
    const filterBtns = document.querySelectorAll('.filter-btn');
    const galleryItems = document.querySelectorAll('.gallery-item');
    filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            filterBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            galleryItems.forEach((item) => {
                const cat = item.getAttribute('data-category');
                if (filter === 'all' || cat === filter) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });
        });
    });

    // ============================================
    // Lightbox
    // ============================================
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCaption = document.getElementById('lightboxCaption');
    const lightboxCounter = document.getElementById('lightboxCounter');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');

    let lbIndex = 0;
    const getVisibleItems = () =>
        Array.from(document.querySelectorAll('.gallery-item:not(.hidden)'));

    function openLightbox(idx) {
        const visible = getVisibleItems();
        if (!visible.length) return;
        lbIndex = ((idx % visible.length) + visible.length) % visible.length;
        const item = visible[lbIndex];
        const img = item.querySelector('img');
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt || '';
        lightboxCaption.textContent = item.getAttribute('data-caption') || '';
        lightboxCounter.textContent = `${lbIndex + 1} / ${visible.length}`;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    galleryItems.forEach((item, i) => {
        item.addEventListener('click', () => {
            const visible = getVisibleItems();
            const visIdx = visible.indexOf(item);
            if (visIdx >= 0) openLightbox(visIdx);
        });
    });
    if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
    if (lightboxPrev) lightboxPrev.addEventListener('click', () => openLightbox(lbIndex - 1));
    if (lightboxNext) lightboxNext.addEventListener('click', () => openLightbox(lbIndex + 1));
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) closeLightbox();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (!lightbox || !lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
        if (e.key === 'ArrowRight') openLightbox(lbIndex + 1);
    });

    // ============================================
    // Hide gallery items that have no image (placeholder mode)
    // Once real photos are dropped in /images/, this becomes a no-op.
    // ============================================
    galleryItems.forEach((item) => {
        const img = item.querySelector('img');
        if (!img) return;
        img.addEventListener('error', () => {
            // Keep tile visible with gradient placeholder; just hide broken icon
            img.style.opacity = '0';
        });
    });
});
