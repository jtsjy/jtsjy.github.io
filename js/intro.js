(function () {
    const terminal = document.getElementById('terminal');
    const termBar = terminal.querySelector('.terminal-bar');
    const bootLines = document.getElementById('bootLines');
    const title = document.getElementById('heroTitle');
    const subtitle = document.getElementById('heroSubtitle');
    const divider = document.getElementById('heroDivider');
    const hint = document.getElementById('scrollHint');
    const nav = document.querySelector('.navbar');
    const track = document.getElementById('heroTrack');

    const BOOT_LINES = [
        '> J.SCHWARZ BIOS v2.6',
        '> LOADING PROFILE ... OK',
        '> READY.'
    ];

    // Start-state constants (tweak these to adjust layout at p=0)
    const TERM_START_SCALE = 1.8;
    const TITLE_START_SCALE = 0.36;   // 28px title -> ~10px terminal line
    const SUB_START_SCALE = 0.9;      // 11px subtitle -> ~10px terminal line
    const TITLE_OFFSET_Y = 34;        // unscaled px below terminal center
    const SUB_OFFSET_Y = 58;

    let lineIdx = 0;
    let charIdx = 0;
    let typingDone = false;
    let currentLineEl = null;
    const lineEls = [];

    // Measured natural positions
    let m = null;

    function measure() {
        // Clear transforms to measure natural layout
        terminal.style.transform = '';
        title.style.transform = '';
        subtitle.style.transform = '';

        const tRect = terminal.getBoundingClientRect();
        const titleRect = title.getBoundingClientRect();
        const subRect = subtitle.getBoundingClientRect();
        const vcx = window.innerWidth / 2;
        const vcy = window.innerHeight / 2;

        // Responsive start scales: never overflow the screen / terminal body
        const bodyW = tRect.width - 24;
        const termStartScale = Math.min(TERM_START_SCALE, (window.innerWidth * 0.92) / tRect.width);
        const titleStartScale = Math.min(TITLE_START_SCALE, (bodyW * 0.95) / titleRect.width);
        const subStartScale = Math.min(SUB_START_SCALE, (bodyW * 0.95) / subRect.width);

        m = {
            vcx, vcy,
            termStartScale, titleStartScale, subStartScale,
            term: { cx: tRect.left + tRect.width / 2, cy: tRect.top + tRect.height / 2 },
            title: { cx: titleRect.left + titleRect.width / 2, cy: titleRect.top + titleRect.height / 2 },
            sub: { cx: subRect.left + subRect.width / 2, cy: subRect.top + subRect.height / 2 }
        };
    }

    function typeStep() {
        if (lineIdx >= BOOT_LINES.length) {
            typingDone = true;
            applyProgress();
            return;
        }
        if (charIdx === 0) {
            currentLineEl = document.createElement('div');
            bootLines.appendChild(currentLineEl);
            lineEls.push(currentLineEl);
        }
        charIdx++;
        currentLineEl.textContent = BOOT_LINES[lineIdx].slice(0, charIdx);
        if (charIdx >= BOOT_LINES[lineIdx].length) {
            lineIdx++;
            charIdx = 0;
            setTimeout(typeStep, 140);
        } else {
            setTimeout(typeStep, 14 + Math.random() * 20);
        }
    }

    function skipTyping() {
        bootLines.innerHTML = '';
        lineEls.length = 0;
        BOOT_LINES.forEach(line => {
            const el = document.createElement('div');
            el.textContent = line;
            bootLines.appendChild(el);
            lineEls.push(el);
        });
        lineIdx = BOOT_LINES.length;
        charIdx = 0;
        typingDone = true;
        applyProgress();
    }

    // ===== Split-flap reveal for section titles =====
    const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*<>/_';

    function flap(el) {
        const finalText = el.dataset.flapText || el.textContent;
        el.dataset.flapText = finalText;
        el.classList.add('flapping');
        const settle = finalText.split('').map((c, i) => 6 + i * 2 + Math.random() * 6);
        let frame = 0;
        (function tick() {
            let out = '';
            let done = true;
            for (let i = 0; i < finalText.length; i++) {
                const c = finalText[i];
                if (c === ' ') { out += ' '; continue; }
                if (frame >= settle[i]) {
                    out += c;
                } else {
                    out += FLAP_CHARS[(Math.random() * FLAP_CHARS.length) | 0];
                    done = false;
                }
            }
            el.textContent = out;
            frame++;
            if (!done) {
                requestAnimationFrame(tick);
            } else {
                el.textContent = finalText;
                el.classList.remove('flapping');
            }
        })();
    }

    function setupFlapObserver() {
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.isIntersecting && !en.target.dataset.flapped) {
                    en.target.dataset.flapped = '1';
                    flap(en.target);
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.6 });
        document.querySelectorAll('[data-flap-later]').forEach(el => io.observe(el));
    }

    // ===== Scroll-scrubbed morph (same elements, no fades) =====
    function getProgress() {
        const scrollable = track.offsetHeight - window.innerHeight;
        return Math.min(1, Math.max(0, window.scrollY / scrollable));
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function applyProgress() {
        if (!m) measure();
        const p = getProgress();

        if (p > 0.02 && !typingDone) skipTyping();

        hint.classList.toggle('visible', typingDone && p < 0.1);

        // Terminal: big & centered -> shrinks back to its avatar spot above the title
        const tScale = lerp(m.termStartScale, 1, p);
        const tTx = lerp(m.vcx - m.term.cx, 0, p);
        const tTy = lerp(m.vcy - m.term.cy, 0, p);
        terminal.style.transform =
            'translate(' + tTx + 'px,' + tTy + 'px) scale(' + tScale + ')';

        // Boot lines scroll up and out of the terminal window
        const bootOut = Math.min(1, p / 0.4);
        bootLines.style.transform = 'translateY(' + (-bootOut * 150) + '%)';

        // Title: small line inside the terminal -> grows to hero heading
        const titleScale = lerp(m.titleStartScale, 1, p);
        const titleStartX = m.vcx;
        const titleStartY = m.vcy + TITLE_OFFSET_Y * m.termStartScale;
        const titleTx = lerp(titleStartX - m.title.cx, 0, p);
        const titleTy = lerp(titleStartY - m.title.cy, 0, p);
        title.style.transform =
            'translate(' + titleTx + 'px,' + titleTy + 'px) scale(' + titleScale + ')';

        // Subtitle: same, just below the title line
        const subScale = lerp(m.subStartScale, 1, p);
        const subStartX = m.vcx;
        const subStartY = m.vcy + SUB_OFFSET_Y * m.termStartScale;
        const subTx = lerp(subStartX - m.sub.cx, 0, p);
        const subTy = lerp(subStartY - m.sub.cy, 0, p);
        subtitle.style.transform =
            'translate(' + subTx + 'px,' + subTy + 'px) scale(' + subScale + ')';

        // Divider fades in near the end
        divider.style.opacity = Math.min(1, Math.max(0, (p - 0.8) / 0.2));

        // Nav slides in near the end
        const navP = Math.min(1, Math.max(0, (p - 0.85) / 0.15));
        nav.style.transform = 'translateY(' + (-101 + navP * 101) + '%)';

        // Tell the game it can accept input
        if (p >= 0.99) {
            document.body.dataset.introDone = '1';
        } else {
            delete document.body.dataset.introDone;
        }
    }

    window.addEventListener('scroll', applyProgress, { passive: true });
    window.addEventListener('resize', () => {
        measure();
        applyProgress();
    });

    terminal.addEventListener('click', () => {
        if (!typingDone) skipTyping();
    });

    measure();
    setupFlapObserver();
    setTimeout(typeStep, 400);
    applyProgress();
})();
