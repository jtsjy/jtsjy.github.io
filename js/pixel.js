// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const navMenu = document.getElementById('navMenu');

navToggle.addEventListener('click', () => {
    navMenu.classList.toggle('open');
});

// Close menu when a link is clicked
navMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('open');
    });
});

// Scroll reveal animation
const revealElements = document.querySelectorAll(
    '.portfolio-card, .link-card, .about-content'
);

revealElements.forEach(el => el.classList.add('reveal'));

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.1 });

revealElements.forEach(el => observer.observe(el));

// Quotes typewriter rotation
(function () {
    const quoteText = document.getElementById('quoteText');
    const quoteAuthor = document.getElementById('quoteAuthor');
    if (!quoteText) return;

    const QUOTES = [
        { text: 'Talk is cheap. Show me the code.', author: 'Linus Torvalds' },
        { text: 'First, solve the problem. Then, write the code.', author: 'John Johnson' },
        { text: "Code is like humor. When you have to explain it, it's bad.", author: 'Cory House' },
        { text: 'Programs must be written for people to read, and only incidentally for machines to execute.', author: 'Harold Abelson' }
    ];

    let qi = 0;
    let ci = 0;
    let phase = 'typing';
    let started = false;

    function step() {
        const q = QUOTES[qi];

        if (phase === 'typing') {
            ci++;
            quoteText.textContent = q.text.slice(0, ci);
            if (ci >= q.text.length) {
                phase = 'hold';
                quoteAuthor.textContent = '— ' + q.author;
                setTimeout(step, 2400);
                return;
            }
            setTimeout(step, 36 + Math.random() * 28);
        } else if (phase === 'hold') {
            phase = 'erasing';
            setTimeout(step, 200);
        } else if (phase === 'erasing') {
            ci--;
            quoteText.textContent = q.text.slice(0, ci);
            if (ci <= 0) {
                quoteAuthor.textContent = '';
                qi = (qi + 1) % QUOTES.length;
                phase = 'typing';
                setTimeout(step, 400);
                return;
            }
            setTimeout(step, 14);
        }
    }

    // Start typing when the section scrolls into view
    const quotesIO = new IntersectionObserver((entries) => {
        entries.forEach(en => {
            if (en.isIntersecting && !started) {
                started = true;
                step();
                quotesIO.disconnect();
            }
        });
    }, { threshold: 0.3 });

    quotesIO.observe(document.getElementById('quotes'));
})();
