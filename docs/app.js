/* ═══════════════════════════════════════════════════════════════════════════
   ALEPH — Application JavaScript
   ═══════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
const state = {
    corpus: null,
    glossary: null,
    books: [],
    terms: [],
    favorites: JSON.parse(localStorage.getItem('aleph-favorites') || '[]'),
    filters: {
        lang: null,
        type: null,
        category: null
    },
    sort: 'year',
    selectedTerm: null
};

// Language names for display
const LANG_NAMES = {
    de: 'Deutsch', fr: 'Français', it: 'Italiano', pt: 'Português',
    en: 'English', ja: '日本語', zh: '中文', el: 'Ελληνικά',
    la: 'Latina', es: 'Español', ru: 'Русский', ar: 'العربية',
    he: 'עברית', fa: 'فارسی', sa: 'संस्कृत', tr: 'Türkçe'
};

// Source categories for references page
const SOURCE_CATEGORIES = [
    { id: 'classics', name: 'Textes Classiques', sources: [
        { name: 'Project Gutenberg', url: 'https://www.gutenberg.org', desc: 'Plus de 70 000 livres en domaine public, gratuits en ePub et texte brut.', year: 1971 },
        { name: 'Perseus Digital Library', url: 'https://www.perseus.tufts.edu', desc: 'Textes grecs et latins avec morphologie interactive et traductions parallèles.', year: 1987 },
        { name: 'Internet Archive', url: 'https://archive.org', desc: 'Bibliothèque numérique massive avec emprunt gratuit et 30+ millions de textes.', year: 1996 }
    ]},
    { id: 'national', name: 'Bibliothèques Nationales', sources: [
        { name: 'Gallica (BnF)', url: 'https://gallica.bnf.fr', desc: 'Bibliothèque numérique de la BnF : manuscrits, livres, journaux, cartes.', year: 1997 },
        { name: 'Deutsche Digitale Bibliothek', url: 'https://www.deutsche-digitale-bibliothek.de', desc: 'Portail culturel allemand unifié avec millions d\'objets numérisés.', year: 2012 },
        { name: 'British Library', url: 'https://www.bl.uk', desc: 'Collections numériques de la bibliothèque nationale du Royaume-Uni.', year: 1753 }
    ]},
    { id: 'manuscripts', name: 'Manuscrits', sources: [
        { name: 'Digital Vatican Library', url: 'https://digi.vatlib.it', desc: 'Manuscrits de la Bibliothèque Apostolique Vaticane numérisés.', year: 2014 },
        { name: 'e-codices', url: 'https://www.e-codices.unifr.ch', desc: 'Manuscrits médiévaux de bibliothèques suisses.', year: 2005 }
    ]},
    { id: 'sacred', name: 'Textes Sacrés', sources: [
        { name: 'Sacred Texts', url: 'https://www.sacred-texts.com', desc: 'Archive de textes religieux et mythologiques de toutes traditions.', year: 1999 },
        { name: 'GRETIL', url: 'http://gretil.sub.uni-goettingen.de', desc: 'Textes indiens en sanskrit, pali, prakrit et dravidien.', year: 2003 }
    ]},
    { id: 'academic', name: 'Études', sources: [
        { name: 'JSTOR', url: 'https://www.jstor.org', desc: 'Archive d\'articles académiques avec accès gratuit limité.', year: 1995 },
        { name: 'PhilPapers', url: 'https://philpapers.org', desc: 'Index complet de la littérature philosophique.', year: 2009 }
    ]}
];

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupTheme();
    setupNavigation();
    setupCommandPalette();
    setupKeyboardShortcuts();

    await loadData();

    renderHomePage();
    renderBrowsePage();
    renderGlossaryPage();
    renderSourcesPage();

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    updateFavoritesCount();
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────────────────────
async function loadData() {
    try {
        const [corpusRes, glossaryRes] = await Promise.all([
            fetch('data/corpus-manifest.json'),
            fetch('data/glossary.json')
        ]);

        if (corpusRes.ok) {
            state.corpus = await corpusRes.json();
            processCorpus();
        }

        if (glossaryRes.ok) {
            state.glossary = await glossaryRes.json();
            state.terms = state.glossary.terms || [];
        }
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function processCorpus() {
    if (!state.corpus || !state.corpus.corpus) return;

    state.books = [];
    let codeNum = 1;

    for (const [catKey, category] of Object.entries(state.corpus.corpus)) {
        const type = catKey.includes('legal') ? 'droit'
            : catKey.includes('philosophy') ? 'philosophie'
            : catKey.includes('literature') ? 'littérature'
            : catKey.includes('sacred') ? 'sacré'
            : catKey.includes('science') ? 'sciences'
            : 'autre';

        (category.documents || []).forEach(doc => {
            const langs = Object.keys(doc.languages || {});
            state.books.push({
                id: doc.id,
                code: `AL.${String(codeNum++).padStart(4, '0')}`,
                title: doc.title,
                author: doc.author || 'Anonyme',
                year: doc.year || null,
                type: type,
                lang: langs[0] || 'en',
                langs: langs,
                tags: doc.tags || [],
                source: category.name
            });
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────────────────
function setupTheme() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    updateThemeIcon();

    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('aleph-theme', next);
        updateThemeIcon();
    });
}

function updateThemeIcon() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    const theme = document.documentElement.getAttribute('data-theme');
    toggle.textContent = theme === 'dark' ? '◐' : '◑';
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.main-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.getAttribute('data-page');
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    window.location.hash = page;
}

function handleHashChange() {
    let hash = window.location.hash.slice(1) || 'home';

    // Update active nav link
    document.querySelectorAll('.main-nav a').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-page') === hash);
    });

    // Show active page
    document.querySelectorAll('.page').forEach(page => {
        page.classList.toggle('active', page.id === hash);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND PALETTE
// ─────────────────────────────────────────────────────────────────────────────
function setupCommandPalette() {
    const overlay = document.getElementById('commandPalette');
    const input = document.getElementById('commandInput');
    const results = document.getElementById('commandResults');
    const trigger = document.getElementById('searchTrigger');
    const footerTrigger = document.getElementById('openPaletteFooter');

    if (!overlay || !input) return;

    function openPalette() {
        overlay.classList.add('active');
        input.value = '';
        input.focus();
        renderPaletteResults('');
    }

    function closePalette() {
        overlay.classList.remove('active');
    }

    trigger?.addEventListener('click', openPalette);
    footerTrigger?.addEventListener('click', (e) => {
        e.preventDefault();
        openPalette();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePalette();
    });

    input.addEventListener('input', () => {
        renderPaletteResults(input.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePalette();
        if (e.key === 'Enter') {
            const selected = results.querySelector('.command-palette-item.selected');
            if (selected) selected.click();
        }
    });
}

function renderPaletteResults(query) {
    const results = document.getElementById('commandResults');
    if (!results) return;

    const q = query.toLowerCase().trim();

    if (!q) {
        results.innerHTML = `
            <div class="command-palette-section">
                <div class="command-palette-section-title">Navigation</div>
                <div class="command-palette-item" onclick="navigateTo('home'); document.getElementById('commandPalette').classList.remove('active');">
                    <span class="command-palette-item-title">Accueil</span>
                    <span class="command-palette-item-meta">g h</span>
                </div>
                <div class="command-palette-item" onclick="navigateTo('browse'); document.getElementById('commandPalette').classList.remove('active');">
                    <span class="command-palette-item-title">Parcourir</span>
                    <span class="command-palette-item-meta">g b</span>
                </div>
                <div class="command-palette-item" onclick="navigateTo('glossary'); document.getElementById('commandPalette').classList.remove('active');">
                    <span class="command-palette-item-title">Glossaire</span>
                    <span class="command-palette-item-meta">g l</span>
                </div>
                <div class="command-palette-item" onclick="navigateTo('sources'); document.getElementById('commandPalette').classList.remove('active');">
                    <span class="command-palette-item-title">Références</span>
                    <span class="command-palette-item-meta">g s</span>
                </div>
            </div>
        `;
        return;
    }

    // Search books
    const matchingBooks = state.books.filter(b => {
        const searchable = [b.title, b.author, b.code].join(' ').toLowerCase();
        return searchable.includes(q);
    }).slice(0, 5);

    // Search terms
    const matchingTerms = state.terms.filter(t => {
        const searchable = [t.term, t.definition || ''].join(' ').toLowerCase();
        return searchable.includes(q);
    }).slice(0, 5);

    let html = '';

    if (matchingBooks.length) {
        html += `<div class="command-palette-section">
            <div class="command-palette-section-title">Textes</div>
            ${matchingBooks.map(b => `
                <div class="command-palette-item" onclick="navigateTo('browse'); document.getElementById('commandPalette').classList.remove('active');">
                    <span class="command-palette-item-title">${escapeHtml(b.title)}</span>
                    <span class="command-palette-item-meta">${escapeHtml(b.author)}</span>
                </div>
            `).join('')}
        </div>`;
    }

    if (matchingTerms.length) {
        html += `<div class="command-palette-section">
            <div class="command-palette-section-title">Termes</div>
            ${matchingTerms.map(t => `
                <div class="command-palette-item" onclick="selectGlossaryTerm('${t.id}'); document.getElementById('commandPalette').classList.remove('active');">
                    <span class="command-palette-item-title">${escapeHtml(t.term)}</span>
                    <span class="command-palette-item-meta">${LANG_NAMES[t.lang] || t.lang}</span>
                </div>
            `).join('')}
        </div>`;
    }

    if (!html) {
        html = '<div class="command-palette-section"><div class="command-palette-section-title">Aucun résultat</div></div>';
    }

    results.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────────
function setupKeyboardShortcuts() {
    let gPressed = false;

    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Command palette: Cmd+K or /
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('searchTrigger')?.click();
            return;
        }

        if (e.key === '/') {
            e.preventDefault();
            document.getElementById('searchTrigger')?.click();
            return;
        }

        // Escape closes palette
        if (e.key === 'Escape') {
            document.getElementById('commandPalette')?.classList.remove('active');
            return;
        }

        // g + key navigation
        if (e.key === 'g') {
            gPressed = true;
            setTimeout(() => { gPressed = false; }, 500);
            return;
        }

        if (gPressed) {
            gPressed = false;
            switch (e.key) {
                case 'h': navigateTo('home'); break;
                case 'b': navigateTo('browse'); break;
                case 'l': navigateTo('glossary'); break;
                case 's': navigateTo('sources'); break;
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderHomePage() {
    renderConstellation();
    renderRecentTable();
}

function renderConstellation() {
    const grid = document.getElementById('constellationGrid');
    if (!grid) return;

    // Create concept clusters from terms
    const concepts = [
        { name: 'éternel retour', terms: ['Amor fati', 'Übermensch', 'Nihilisme'] },
        { name: 'mono no aware', terms: ['Wabi-sabi', 'Mujo', 'Iki'] },
        { name: 'ahiṃsā', terms: ['Dharma', 'Karma', 'Moksha'] },
        { name: 'Vermassung', terms: ['Entfremdung', 'Zeitgeist', 'Weltanschauung'] },
        { name: 'ressentiment', terms: ['Schadenfreude', 'Angst', 'Dasein'] },
        { name: 'saudade', terms: ['Duende', 'Querencia', 'Sobremesa'] }
    ];

    grid.innerHTML = concepts.map(c => `
        <div class="concept-cluster">
            <h3 class="concept-name">${escapeHtml(c.name)}</h3>
            <div class="concept-texts">
                ${c.terms.map((t, i) => `
                    <a href="#glossary" class="concept-text-link" onclick="selectGlossaryTermByName('${escapeHtml(t)}')">
                        <span class="code">§${i + 1}</span>
                        <span>${escapeHtml(t)}</span>
                    </a>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function renderRecentTable() {
    const tbody = document.getElementById('recentTableBody');
    if (!tbody) return;

    const recent = state.books.slice(0, 10);

    tbody.innerHTML = recent.map(b => `
        <tr>
            <td class="recent-code">${escapeHtml(b.code)}</td>
            <td class="recent-title">${escapeHtml(b.title)}</td>
            <td class="recent-author">${escapeHtml(b.author)}</td>
            <td class="recent-meta">${(LANG_NAMES[b.lang] || b.lang).substring(0, 2).toUpperCase()}</td>
            <td class="recent-meta">${b.year || '—'}</td>
        </tr>
    `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderBrowsePage() {
    renderLangFilters();
    renderTypeFilters();
    renderBooksGrid();
    setupBrowseControls();
}

function renderLangFilters() {
    const container = document.getElementById('langFilters');
    if (!container) return;

    const langs = [...new Set(state.books.map(b => b.lang))].sort();

    container.innerHTML = langs.map(lang => `
        <button class="filter-pill" data-lang="${lang}">
            ${(LANG_NAMES[lang] || lang).substring(0, 2).toUpperCase()}
        </button>
    `).join('');

    container.addEventListener('click', (e) => {
        const pill = e.target.closest('.filter-pill');
        if (!pill) return;

        const lang = pill.dataset.lang;

        if (pill.classList.contains('active')) {
            pill.classList.remove('active');
            state.filters.lang = null;
        } else {
            container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.filters.lang = lang;
        }

        renderBooksGrid();
    });
}

function renderTypeFilters() {
    const container = document.getElementById('typeFilters');
    if (!container) return;

    const types = [...new Set(state.books.map(b => b.type))].sort();
    const typeCounts = {};
    types.forEach(t => {
        typeCounts[t] = state.books.filter(b => b.type === t).length;
    });

    container.innerHTML = types.map(type => `
        <label class="filter-item">
            <input type="checkbox" data-type="${type}">
            <span>${type}</span>
            <span class="filter-count">${typeCounts[type]}</span>
        </label>
    `).join('');

    container.addEventListener('change', (e) => {
        const checkbox = e.target;
        if (!checkbox.matches('input[type="checkbox"]')) return;

        const checked = container.querySelectorAll('input:checked');
        state.filters.type = checked.length ? [...checked].map(c => c.dataset.type) : null;

        renderBooksGrid();
    });
}

function renderBooksGrid() {
    const grid = document.getElementById('booksGrid');
    const countEl = document.getElementById('browseCount');
    const totalEl = document.getElementById('browseTotal');
    if (!grid) return;

    let books = [...state.books];

    // Apply filters
    if (state.filters.lang) {
        books = books.filter(b => b.lang === state.filters.lang);
    }

    if (state.filters.type) {
        books = books.filter(b => state.filters.type.includes(b.type));
    }

    // Sort
    books.sort((a, b) => {
        switch (state.sort) {
            case 'year': return (b.year || 0) - (a.year || 0);
            case 'title': return a.title.localeCompare(b.title);
            case 'author': return a.author.localeCompare(b.author);
            default: return 0;
        }
    });

    if (countEl) countEl.textContent = books.length;
    if (totalEl) totalEl.textContent = state.books.length;

    grid.innerHTML = books.map(b => `
        <article class="book-card" data-id="${b.id}">
            <div class="book-cover" data-lang="${b.lang}">
                <span class="book-cover-code">${escapeHtml(b.code)}</span>
                <span class="book-cover-lang">${(LANG_NAMES[b.lang] || b.lang).substring(0, 2).toUpperCase()}</span>
            </div>
            <h3 class="book-title">${escapeHtml(b.title)}</h3>
            <p class="book-author">${escapeHtml(b.author)}</p>
            <p class="book-meta">${b.year || '—'} · ${b.source || ''}</p>
        </article>
    `).join('');
}

function setupBrowseControls() {
    const sortSelect = document.getElementById('sortSelect');
    const viewToggles = document.querySelectorAll('.view-toggle');

    sortSelect?.addEventListener('change', () => {
        state.sort = sortSelect.value;
        renderBooksGrid();
    });

    viewToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            viewToggles.forEach(t => t.classList.remove('active'));
            toggle.classList.add('active');
            // View toggle logic could switch between grid/list view
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOSSARY PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderGlossaryPage() {
    renderGlossaryStats();
    renderAlphabetIndex();
    renderCategoryPills();
    renderGlossaryList();
    setupGlossarySearch();
}

function renderGlossaryStats() {
    const termCount = document.getElementById('termCount');
    const langCount = document.getElementById('langCount');

    if (termCount) termCount.textContent = state.terms.length;
    if (langCount) {
        const langs = new Set(state.terms.map(t => t.lang));
        langCount.textContent = langs.size;
    }
}

function renderAlphabetIndex() {
    const container = document.getElementById('specimenIndex');
    if (!container) return;

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const specialChars = ['ה', '日', '物'];

    container.innerHTML = [...letters, ...specialChars].map(letter => `
        <a href="#" data-letter="${letter}">${letter}</a>
    `).join('');

    container.addEventListener('click', (e) => {
        e.preventDefault();
        const link = e.target.closest('a');
        if (!link) return;

        const letter = link.dataset.letter;
        container.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');

        // Scroll to first term starting with letter
        const firstTerm = state.terms.find(t =>
            t.term.toUpperCase().startsWith(letter)
        );
        if (firstTerm) {
            selectGlossaryTerm(firstTerm.id);
        }
    });
}

function renderCategoryPills() {
    const container = document.getElementById('categoryPills');
    if (!container) return;

    const categories = new Set();
    state.terms.forEach(t => {
        if (t.category) {
            (Array.isArray(t.category) ? t.category : [t.category]).forEach(c => categories.add(c));
        }
    });

    const catArray = [...categories].sort();

    container.innerHTML = `
        <button class="category-pill active" data-category="all">all</button>
        ${catArray.slice(0, 6).map(cat => `
            <button class="category-pill" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>
        `).join('')}
    `;

    container.addEventListener('click', (e) => {
        const pill = e.target.closest('.category-pill');
        if (!pill) return;

        container.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        state.filters.category = pill.dataset.category === 'all' ? null : pill.dataset.category;
        renderGlossaryList();
    });
}

function renderGlossaryList() {
    const container = document.getElementById('glossaryList');
    if (!container) return;

    let terms = [...state.terms];

    // Apply category filter
    if (state.filters.category) {
        terms = terms.filter(t => {
            const cats = Array.isArray(t.category) ? t.category : [t.category];
            return cats.includes(state.filters.category);
        });
    }

    // Sort alphabetically
    terms.sort((a, b) => a.term.localeCompare(b.term));

    container.innerHTML = terms.map(t => {
        const firstLetter = t.term.charAt(0).toUpperCase();
        const cats = Array.isArray(t.category) ? t.category : [t.category || ''];

        return `
            <article class="glossary-entry" data-id="${t.id}" onclick="selectGlossaryTerm('${t.id}')">
                <header class="glossary-entry-header">
                    <span class="glossary-dropcap">${firstLetter}</span>
                    <span class="glossary-term">${escapeHtml(t.term)}</span>
                    <span class="glossary-lang">${LANG_NAMES[t.lang] || t.lang}</span>
                    <span class="glossary-category">${cats.join(' · ')}</span>
                </header>
                <p class="glossary-definition">${escapeHtml(truncate(t.definition || '', 120))}</p>
            </article>
        `;
    }).join('');
}

function setupGlossarySearch() {
    const input = document.getElementById('glossarySearch');
    if (!input) return;

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();

        document.querySelectorAll('.glossary-entry').forEach(entry => {
            const term = entry.querySelector('.glossary-term')?.textContent.toLowerCase() || '';
            const def = entry.querySelector('.glossary-definition')?.textContent.toLowerCase() || '';
            const matches = !query || term.includes(query) || def.includes(query);
            entry.style.display = matches ? '' : 'none';
        });
    });
}

function selectGlossaryTerm(id) {
    const term = state.terms.find(t => t.id === id);
    if (!term) return;

    state.selectedTerm = term;
    navigateTo('glossary');

    // Update specimen pane
    const specimenTerm = document.getElementById('specimenTerm');
    const specimenMeta = document.getElementById('specimenMeta');
    const specimenRelatedList = document.getElementById('specimenRelatedList');

    if (specimenTerm) specimenTerm.textContent = term.term;

    if (specimenMeta) {
        const cats = Array.isArray(term.category) ? term.category : [term.category || ''];
        specimenMeta.innerHTML = `
            <span class="specimen-tag lang">${LANG_NAMES[term.lang] || term.lang}</span>
            ${cats.map(c => `<span class="specimen-tag">${escapeHtml(c)}</span>`).join('')}
        `;
    }

    if (specimenRelatedList && term.related) {
        specimenRelatedList.innerHTML = term.related.map(r => `
            <a href="#" onclick="selectGlossaryTermByName('${escapeHtml(r)}'); return false;">${escapeHtml(r)}</a>
        `).join('');
    }

    // Highlight entry
    document.querySelectorAll('.glossary-entry').forEach(e => e.classList.remove('selected'));
    document.querySelector(`.glossary-entry[data-id="${id}"]`)?.classList.add('selected');
}

function selectGlossaryTermByName(name) {
    const term = state.terms.find(t =>
        t.term.toLowerCase() === name.toLowerCase() ||
        t.id === name
    );
    if (term) selectGlossaryTerm(term.id);
}

// Make it globally accessible
window.selectGlossaryTerm = selectGlossaryTerm;
window.selectGlossaryTermByName = selectGlossaryTermByName;
window.navigateTo = navigateTo;

// ─────────────────────────────────────────────────────────────────────────────
// SOURCES PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderSourcesPage() {
    renderSourcesStats();
    renderSourcesToc();
    renderSourcesSections();
}

function renderSourcesStats() {
    const sourceCount = document.getElementById('sourceCount');
    const categoryCount = document.getElementById('categoryCount');

    let total = 0;
    SOURCE_CATEGORIES.forEach(cat => {
        total += cat.sources.length;
    });

    if (sourceCount) sourceCount.textContent = total;
    if (categoryCount) categoryCount.textContent = SOURCE_CATEGORIES.length;
}

function renderSourcesToc() {
    const container = document.getElementById('sourcesToc');
    if (!container) return;

    container.innerHTML = SOURCE_CATEGORIES.map((cat, i) => `
        <a href="#section-${cat.id}" class="sources-toc-item">
            <span class="num">${String(i + 1).padStart(2, '0')}</span>
            <span>${cat.name}</span>
            <span class="count">${cat.sources.length}</span>
        </a>
    `).join('');
}

function renderSourcesSections() {
    const container = document.getElementById('sourcesSections');
    if (!container) return;

    container.innerHTML = SOURCE_CATEGORIES.map((cat, i) => `
        <section class="sources-section" id="section-${cat.id}">
            <header class="sources-section-header">
                <span class="sources-section-num">§ ${String(i + 1).padStart(2, '0')}</span>
                <h2 class="sources-section-title">${cat.name}</h2>
                <span class="sources-section-count">${cat.sources.length} entrées</span>
            </header>
            <div class="sources-list">
                ${cat.sources.map(s => `
                    <article class="source-item">
                        <div>
                            <h3 class="source-name"><a href="${s.url}" target="_blank">${escapeHtml(s.name)}</a></h3>
                            <p class="source-desc">${escapeHtml(s.desc)}</p>
                        </div>
                        <div class="source-meta">
                            <span>Fondé ${s.year}</span>
                        </div>
                    </article>
                `).join('')}
            </div>
        </section>
    `).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// FAVORITES
// ─────────────────────────────────────────────────────────────────────────────
function toggleFavorite(id) {
    const idx = state.favorites.indexOf(id);
    if (idx > -1) {
        state.favorites.splice(idx, 1);
    } else {
        state.favorites.push(id);
    }
    localStorage.setItem('aleph-favorites', JSON.stringify(state.favorites));
    updateFavoritesCount();
}

function updateFavoritesCount() {
    const el = document.getElementById('favCount');
    if (el) el.textContent = state.favorites.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '…';
}
