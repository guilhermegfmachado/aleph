// glossaire.js — read-only reference, fully expanded cards

const glossaire = {
    terms: [],
    quotes: [],
    activeLang: null,
    searchQuery: '',
    selectedCategory: ''
};

// Fix 1: paths are ../data/ since this file is inside archive/
const FEEDS = {
    glossary: '../data/glossary.json',
    quotes:   '../data/quotes.json'
};

const LANG_NAMES = {
    de: 'Deutsch', fr: 'Français', it: 'Italiano', pt: 'Português',
    en: 'English', ja: '日本語', zh: '中文', el: 'Ελληνικά',
    'el-anc': 'Ελληνικά (Classical)', 'el-mod': 'Ελληνικά (Modern)',
    la: 'Latina', es: 'Español', ru: 'Русский', ar: 'العربية',
    he: 'עברית', fa: 'فارسی', sa: 'संस्कृत', tr: 'Türkçe',
    ml: 'മലയാളം', ta: 'தமிழ்', zu: 'Zulu / Bantu', sw: 'Swahili'
};

// ── INIT ─────────────────────────────────────────────────────────
async function init() {
    await loadData();          // Fix 1: await so data is ready before rendering
    buildLangPills();
    buildCatFilter();
    renderTerms();
    updateStats();             // Fix 5: called after data loads
    setupSearch();
    setupUrlParams();
}
document.addEventListener('DOMContentLoaded', init);

// ── DATA LOADING ─────────────────────────────────────────────────
async function loadData() {
    try {
        const [glossaryRes, quotesRes] = await Promise.all([
            fetch(FEEDS.glossary),
            fetch(FEEDS.quotes)
        ]);

        if (glossaryRes.ok) {
            const data = await glossaryRes.json();
            glossaire.terms = data.terms || [];
        }

        if (quotesRes.ok) {
            const data = await quotesRes.json();
            glossaire.quotes = data.quotes || [];
        }
    } catch (err) {
        console.error('Failed to load glossary data:', err);
    }
}

// ── LANG PILLS ───────────────────────────────────────────────────
function buildLangPills() {
    const container = document.getElementById('langPills');
    if (!container) return;

    const langs = new Set();
    glossaire.terms.forEach(t => { if (t.lang) langs.add(t.lang); });

    container.innerHTML = '';
    Array.from(langs).sort().forEach(lang => {
        const pill = document.createElement('button');
        pill.className = 'lang-pill';
        pill.dataset.lang = lang;
        pill.textContent = LANG_NAMES[lang] || lang;
        pill.addEventListener('click', () => {
            if (glossaire.activeLang === lang) {
                glossaire.activeLang = null;
                pill.classList.remove('active');
            } else {
                document.querySelectorAll('.lang-pill').forEach(p => p.classList.remove('active'));
                glossaire.activeLang = lang;
                pill.classList.add('active');
            }
            renderTerms();
            updateStats();
        });
        container.appendChild(pill);
    });
}

// ── CATEGORY FILTER ──────────────────────────────────────────────
function buildCatFilter() {
    const select = document.getElementById('catFilter');
    if (!select) return;

    const cats = new Set();
    glossaire.terms.forEach(t => {
        const c = Array.isArray(t.category) ? t.category : (t.category ? [t.category] : []);
        c.forEach(x => cats.add(x));
    });

    select.innerHTML = '<option value="">toutes catégories</option>';
    Array.from(cats).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        select.appendChild(opt);
    });

    select.addEventListener('change', () => {
        glossaire.selectedCategory = select.value;
        renderTerms();
        updateStats();
    });
}

// ── SEARCH ───────────────────────────────────────────────────────
// Fix 4: search stays, filters client-side on rendered DOM
function setupSearch() {
    const input = document.getElementById('glossSearch');
    if (!input) return;
    input.addEventListener('input', e => {
        glossaire.searchQuery = e.target.value.toLowerCase().trim();
        renderTerms();
        updateStats();
    });
}

// ── FILTERING ────────────────────────────────────────────────────
function getFilteredTerms() {
    return glossaire.terms.filter(term => {
        if (glossaire.activeLang && term.lang !== glossaire.activeLang) return false;

        if (glossaire.selectedCategory) {
            const cats = Array.isArray(term.category) ? term.category : (term.category ? [term.category] : []);
            if (!cats.includes(glossaire.selectedCategory)) return false;
        }

        if (glossaire.searchQuery) {
            const haystack = [
                term.term, term.native, term.definition,
                term.gloss, term.etymology
            ].filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(glossaire.searchQuery)) return false;
        }

        return true;
    });
}

// ── RENDER TERMS — Fix 2: fully expanded cards, no accordion ────
function renderTerms() {
    const container = document.getElementById('termsList');
    if (!container) return;

    const terms = getFilteredTerms();
    terms.sort((a, b) => (a.term || '').localeCompare(b.term || ''));

    if (terms.length === 0) {
        container.innerHTML = '<p class="no-results">Aucun terme trouvé.</p>';
        return;
    }

    container.innerHTML = '';

    terms.forEach(term => {
        const id = 'term-' + (term.id || term.term.replace(/\s+/g, '-').toLowerCase());
        const card = document.createElement('div');
        card.className = 'term-card';
        card.id = id;

        // 1. Term name
        let html = '<div class="tc-name">' + escapeHtml(term.term) + '</div>';

        // 2. Native script (only if different from term)
        if (term.native && term.native !== term.term) {
            html += '<div class="tc-native">' + escapeHtml(term.native) + '</div>';
        }

        // 3. Language badge
        const langLabel = LANG_NAMES[term.lang] || term.lang || '';
        if (langLabel) {
            html += '<span class="tc-lang">' + escapeHtml(langLabel) + '</span>';
        }

        // 4. Definition
        const def = term.definition || term.gloss || '';
        if (def) {
            html += '<div class="tc-definition">' + escapeHtml(def) + '</div>';
        }

        // 5. Etymology
        if (term.etymology) {
            html += '<div class="tc-etym">' +
                '<span class="tc-etym-label">étym.</span>' +
                '<span class="tc-etym-text">' + escapeHtml(term.etymology) + '</span>' +
                '</div>';
        }

        // 6. Domain tags
        const cats = Array.isArray(term.category) ? term.category : (term.category ? [term.category] : []);
        if (cats.length > 0) {
            html += '<div class="tc-tags">' +
                cats.map(c => '<span class="tc-tag">' + escapeHtml(c) + '</span>').join('') +
                '</div>';
        }

        // 7. Period tag
        if (term.period) {
            html += '<div class="tc-tags"><span class="tc-tag">' + escapeHtml(term.period) + '</span></div>';
        }

        // 8. Voir aussi — anchor links to other term cards on same page
        if (term.related && term.related.length > 0) {
            const links = term.related.map(rel => {
                const relId = 'term-' + rel.replace(/\s+/g, '-').toLowerCase();
                return '<a class="tc-related-link" href="#' + relId + '">' + escapeHtml(rel) + '</a>';
            }).join(' ');
            html += '<div class="tc-related">' +
                '<span class="tc-related-label">voir aussi</span>' + links +
                '</div>';
        }

        card.innerHTML = html;
        container.appendChild(card);
    });
}

// ── STATS — Fix 5: updates after data loads ──────────────────────
function updateStats() {
    const termCountEl  = document.getElementById('term-count');
    const quoteCountEl = document.getElementById('quote-count');
    const langCountEl  = document.getElementById('lang-count');

    if (termCountEl)  termCountEl.textContent  = getFilteredTerms().length;
    if (quoteCountEl) quoteCountEl.textContent = glossaire.quotes.length;

    if (langCountEl) {
        const langs = new Set();
        glossaire.terms.forEach(t => { if (t.lang) langs.add(t.lang); });
        langCountEl.textContent = langs.size;
    }
}

// ── URL PARAMS ───────────────────────────────────────────────────
function setupUrlParams() {
    const params = new URLSearchParams(window.location.search);

    const q = params.get('q');
    if (q) {
        const input = document.getElementById('glossSearch');
        if (input) {
            input.value = q;
            glossaire.searchQuery = q.toLowerCase().trim();
            renderTerms();
            updateStats();
        }
    }

    // ?id= scrolls to the term card instead of opening a modal
    const id = params.get('id');
    if (id) {
        const el = document.getElementById('term-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ── UTILITIES ────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
