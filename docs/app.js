/* ═══════════════════════════════════════════════════════════════════════════
   ALEPH — Application JavaScript
   ═══════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────
const state = {
    corpus: null,
    glossary: null,
    references: null,
    books: [],
    bookIndex: {},
    terms: [],
    filters: {
        lang: null,
        type: null,
        category: null,
        query: '',
        glossaryLang: ''
    },
    sort: 'year',
    selectedTerm: null,
    sourcesView: 'list',
    reader: {
        bookId: null,
        lang: null,
        text: null,
        query: '',
        previousPage: 'browse'
    }
};

// Language names for display
const LANG_NAMES = {
    de: 'Deutsch', fr: 'Français', it: 'Italiano', pt: 'Português',
    en: 'English', ja: '日本語', zh: '中文', el: 'Ελληνικά',
    la: 'Latina', es: 'Español', ru: 'Русский', ar: 'العربية',
    he: 'עברית', fa: 'فارسی', sa: 'संस्कृत', tr: 'Türkçe'
};

// Network visualization state
let networkState = {
    simulation: null,
    svg: null,
    g: null,
    width: 800,
    height: 500,
    expandedNodes: new Set(),
    nodePositions: {},
    allNodes: [],
    subtopicNodes: [],
    resourceNodes: []
};

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
    renderAuthorsPage();
    setupSearchPage();
    setupReaderPage();

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────────────────────
async function loadData() {
    try {
        const [corpusRes, glossaryRes, refsRes, crosslinksRes, listsRes] = await Promise.all([
            fetch('data/corpus-manifest.json'),
            fetch('data/glossary.json'),
            fetch('data/references.json'),
            fetch('data/crosslinks.json'),
            fetch('data/reading-lists.json')
        ]);

        if (corpusRes.ok) {
            state.corpus = await corpusRes.json();
            processCorpus();
        }

        if (glossaryRes.ok) {
            state.glossary = await glossaryRes.json();
            state.terms = state.glossary.terms || [];
        }

        if (refsRes.ok) {
            state.references = await refsRes.json();
        }

        if (crosslinksRes.ok) {
            state.crosslinks = await crosslinksRes.json();
        }

        if (listsRes.ok) {
            state.readingLists = await listsRes.json();
        }

        const authorsRes = await fetch('data/authors.json');
        if (authorsRes.ok) {
            state.authors = await authorsRes.json();
        }
    } catch (err) {
        console.error('Failed to load data:', err);
    }
}

function processCorpus() {
    if (!state.corpus || !state.corpus.corpus) return;

    state.books = [];
    state.bookIndex = {};
    let codeNum = 1;

    const sources = state.corpus.sources || {};

    for (const [catKey, category] of Object.entries(state.corpus.corpus)) {
        const type = catKey.includes('legal') ? 'droit'
            : catKey.includes('philosophy') ? 'philosophie'
            : catKey.includes('literature') ? 'littérature'
            : catKey.includes('sacred') ? 'sacré'
            : catKey.includes('science') ? 'sciences'
            : 'autre';

        (category.documents || []).forEach(doc => {
            const langs = Object.keys(doc.languages || {});
            const firstLang = langs[0] || 'en';
            const langData = doc.languages?.[firstLang] || {};

            let externalUrl = doc.url || null;
            if (!externalUrl && doc.celex) {
                externalUrl = `https://eur-lex.europa.eu/legal-content/${firstLang.toUpperCase()}/TXT/?uri=CELEX:${doc.celex}`;
            } else if (!externalUrl && langData.source && sources[langData.source]) {
                externalUrl = sources[langData.source];
            }

            const book = {
                id: doc.id,
                code: `AL.${String(codeNum++).padStart(4, '0')}`,
                title: doc.title,
                author: doc.author || 'Anonyme',
                year: doc.year || null,
                type: type,
                lang: firstLang,
                langs: langs,
                tags: doc.tags || [],
                source: category.name,
                celex: doc.celex || null,
                externalUrl: externalUrl,
                languages: doc.languages || {}
            };

            state.books.push(book);
            state.bookIndex[doc.id] = book;
        });
    }
}

function externalUrlFor(book, lang) {
    if (!book) return null;
    lang = lang || book.lang;
    if (book.celex) {
        return `https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/?uri=CELEX:${book.celex}`;
    }
    const sources = (state.corpus && state.corpus.sources) || {};
    const langData = book.languages?.[lang] || {};
    if (langData.source && sources[langData.source]) return sources[langData.source];
    return book.externalUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────────────────
function setupTheme() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;

    updateThemeIcon();

    toggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const themes = ['light', 'sepia', 'dark'];
        const idx = themes.indexOf(current);
        const next = themes[(idx + 1) % themes.length];
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('aleph-theme', next);
        updateThemeIcon();
    });
}

function updateThemeIcon() {
    const toggle = document.getElementById('themeToggle');
    if (!toggle) return;
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const icons = { light: '◑', sepia: '◒', dark: '◐' };
    toggle.textContent = icons[theme] || '◑';
    toggle.title = `Thème: ${theme}`;
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

    // Handle read URLs: #read/bookId or #read/bookId/lang or #read/bookId/lang/p5
    if (hash.startsWith('read/')) {
        const parts = hash.split('/');
        const bookId = parts[1];
        const lang = parts[2] || null;
        const paraMatch = parts[3]?.match(/^p(\d+)$/);
        const paraIdx = paraMatch ? paraMatch[1] : null;

        if (bookId && state.bookIndex?.[bookId]) {
            const opts = {};
            if (lang) opts.lang = lang;
            if (paraIdx) opts.scrollToPara = `para-${paraIdx}`;
            openReader(bookId, opts);
        }
        return;
    }

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
                <div class="command-palette-item" onclick="openReader('${b.id}'); document.getElementById('commandPalette').classList.remove('active');">
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
                    <span class="command-palette-item-meta">${t.lang.toUpperCase()}</span>
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

        const currentPage = document.querySelector('.page.active')?.id;

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

        // Reader-specific shortcuts
        if (currentPage === 'reader') {
            // j/k to scroll paragraphs
            if (e.key === 'j' || e.key === 'k') {
                e.preventDefault();
                scrollReaderParagraph(e.key === 'j' ? 1 : -1);
                return;
            }
            // n/p or arrow keys for next/previous text
            if (e.key === 'n' || e.key === 'ArrowRight') {
                e.preventDefault();
                navigateToAdjacentText(1);
                return;
            }
            if (e.key === 'p' || e.key === 'ArrowLeft') {
                e.preventDefault();
                navigateToAdjacentText(-1);
                return;
            }
            // b to go back to browse
            if (e.key === 'b') {
                navigateTo('browse');
                return;
            }
        }

        // Browse-specific shortcuts
        if (currentPage === 'browse') {
            // Arrow keys to navigate book grid
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                navigateBookGrid(e.key);
                return;
            }
            // Enter to open selected book
            if (e.key === 'Enter') {
                const selected = document.querySelector('.book-card.keyboard-selected');
                if (selected) {
                    selected.click();
                    return;
                }
            }
        }

        // Theme toggle: t
        if (e.key === 't') {
            document.getElementById('themeToggle')?.click();
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
                case 'r': navigateTo('search'); break;
            }
        }
    });
}

function scrollReaderParagraph(direction) {
    const paras = document.querySelectorAll('.reader-para');
    if (!paras.length) return;

    const viewportCenter = window.innerHeight / 2;
    let closestIdx = 0;
    let closestDist = Infinity;

    paras.forEach((p, i) => {
        const rect = p.getBoundingClientRect();
        const dist = Math.abs(rect.top - viewportCenter);
        if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
        }
    });

    const nextIdx = Math.max(0, Math.min(paras.length - 1, closestIdx + direction));
    paras[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function navigateToAdjacentText(direction) {
    const currentId = state.currentText?.id;
    if (!currentId || !state.corpus?.texts) return;

    const texts = state.corpus.texts;
    const idx = texts.findIndex(t => t.id === currentId);
    if (idx === -1) return;

    const nextIdx = idx + direction;
    if (nextIdx >= 0 && nextIdx < texts.length) {
        const nextText = texts[nextIdx];
        window.location.hash = `#read/${nextText.id}`;
    }
}

function navigateBookGrid(key) {
    const grid = document.getElementById('booksGrid');
    if (!grid) return;

    const cards = [...grid.querySelectorAll('.book-card')];
    if (!cards.length) return;

    let selected = grid.querySelector('.book-card.keyboard-selected');
    let currentIdx = selected ? cards.indexOf(selected) : -1;

    // Calculate grid columns
    const gridStyle = getComputedStyle(grid);
    const cols = gridStyle.gridTemplateColumns.split(' ').length || 1;

    let nextIdx = currentIdx;
    switch (key) {
        case 'ArrowRight': nextIdx = Math.min(cards.length - 1, currentIdx + 1); break;
        case 'ArrowLeft': nextIdx = Math.max(0, currentIdx - 1); break;
        case 'ArrowDown': nextIdx = Math.min(cards.length - 1, currentIdx + cols); break;
        case 'ArrowUp': nextIdx = Math.max(0, currentIdx - cols); break;
    }

    if (nextIdx === -1) nextIdx = 0;

    cards.forEach(c => c.classList.remove('keyboard-selected'));
    cards[nextIdx].classList.add('keyboard-selected');
    cards[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderHomePage() {
    renderQuickStats();
    renderMotDuJour();
    renderLangPills();
    renderReadingLists();
    renderFeaturedAuthors();
    renderRecentlyRead();
    setupSurpriseButton();
    setupRandomPassage();
}

function renderReadingLists() {
    const container = document.getElementById('listsGrid');
    if (!container || !state.readingLists?.lists) return;

    container.innerHTML = state.readingLists.lists.map(list => {
        const textCount = list.texts.filter(id => state.bookIndex[id]).length;
        return `
            <button class="list-card" onclick="openReadingList('${list.id}')">
                <span class="list-icon">${list.icon}</span>
                <div class="list-info">
                    <h3 class="list-name">${escapeHtml(list.name)}</h3>
                    <p class="list-desc">${escapeHtml(list.description)}</p>
                    <span class="list-count">${textCount} textes</span>
                </div>
            </button>
        `;
    }).join('');
}

function openReadingList(listId) {
    const list = state.readingLists?.lists?.find(l => l.id === listId);
    if (!list) return;

    state.currentList = list;
    state.browseFilter = '';

    // Filter books to only those in the list
    const listBookIds = new Set(list.texts);
    const filteredBooks = state.books.filter(b => listBookIds.has(b.id));

    // Render with custom header
    const container = document.getElementById('booksGrid');
    const countEl = document.getElementById('browseCount');
    const totalEl = document.getElementById('browseTotal');

    if (countEl) countEl.textContent = filteredBooks.length;
    if (totalEl) totalEl.innerHTML = `<em>${escapeHtml(list.name)}</em>`;

    container.innerHTML = filteredBooks.map(renderBookCard).join('');

    navigateTo('browse');
}
window.openReadingList = openReadingList;

function renderFeaturedAuthors() {
    const container = document.getElementById('featuredAuthors');
    if (!container || !state.authors?.authors) return;

    // Show 4 random featured authors
    const shuffled = [...state.authors.authors].sort(() => Math.random() - 0.5);
    const featured = shuffled.slice(0, 4);

    container.innerHTML = featured.map(author => `
        <button class="author-card-small" onclick="openAuthorPage('${author.id}')">
            <span class="author-name">${escapeHtml(author.name)}</span>
            <span class="author-dates">${escapeHtml(author.dates)}</span>
        </button>
    `).join('');
}

function renderAuthorsPage() {
    const container = document.getElementById('authorsGrid');
    const countEl = document.getElementById('authorCount');
    if (!container || !state.authors?.authors) return;

    if (countEl) countEl.textContent = state.authors.authors.length;

    container.innerHTML = state.authors.authors.map(author => {
        const workCount = author.works.filter(id => state.bookIndex[id]).length;
        return `
            <article class="author-card" id="author-${author.id}">
                <header class="author-card-header">
                    <h2 class="author-card-name">${escapeHtml(author.name)}</h2>
                    ${author.name_original ? `<span class="author-card-original">${escapeHtml(author.name_original)}</span>` : ''}
                </header>
                <div class="author-card-meta">
                    <span class="author-dates">${escapeHtml(author.dates)}</span>
                    <span class="author-origin">${escapeHtml(author.origin)}</span>
                </div>
                <p class="author-card-bio">${escapeHtml(author.bio)}</p>
                <div class="author-card-works">
                    <span class="works-label">${workCount} œuvre${workCount > 1 ? 's' : ''} :</span>
                    ${author.works.map(workId => {
                        const book = state.bookIndex[workId];
                        if (!book) return '';
                        return `<a href="#" class="work-link" onclick="openReader('${workId}'); return false;">${escapeHtml(book.title)}</a>`;
                    }).filter(Boolean).join(' · ')}
                </div>
                <div class="author-card-tags">
                    ${author.tags.map(t => `<span class="author-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            </article>
        `;
    }).join('');
}

function openAuthorPage(authorId) {
    navigateTo('authors');
    setTimeout(() => {
        const el = document.getElementById(`author-${authorId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}
window.openAuthorPage = openAuthorPage;

function renderQuickStats() {
    const statTerms = document.getElementById('statTerms');
    const statLangs = document.getElementById('statLangs');
    const statTexts = document.getElementById('statTexts');
    const statSources = document.getElementById('statSources');

    if (statTerms) statTerms.textContent = state.terms.length;
    if (statLangs) {
        const langs = new Set(state.terms.map(t => t.lang));
        statLangs.textContent = langs.size;
    }
    if (statTexts) statTexts.textContent = state.books.length;
    if (statSources && state.references) {
        let total = 0;
        (state.references.sections || []).forEach(sec => {
            sec.groups.forEach(g => { total += g.resources.length; });
        });
        statSources.textContent = total;
    }
}

function renderMotDuJour() {
    const termEl = document.getElementById('mdjTerm');
    const langEl = document.getElementById('mdjLang');
    const defEl = document.getElementById('mdjDefinition');
    const linkBtn = document.getElementById('mdjLink');
    const refreshBtn = document.getElementById('mdjRefresh');

    if (!termEl || !state.terms.length) return;

    function showRandomTerm() {
        const term = state.terms[Math.floor(Math.random() * state.terms.length)];
        termEl.textContent = term.term;
        langEl.textContent = term.lang.toUpperCase();
        defEl.textContent = term.definition || '';
        linkBtn.onclick = () => selectGlossaryTerm(term.id);
    }

    showRandomTerm();
    refreshBtn?.addEventListener('click', showRandomTerm);
}

function renderLangPills() {
    const container = document.getElementById('langPills');
    if (!container) return;

    // Count terms per language
    const langCounts = {};
    state.terms.forEach(t => {
        langCounts[t.lang] = (langCounts[t.lang] || 0) + 1;
    });

    // Sort by count and take top languages
    const topLangs = Object.entries(langCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);

    container.innerHTML = topLangs.map(([lang, count]) => `
        <button class="lang-pill" data-lang="${lang}" onclick="filterByLang('${lang}')">
            <span class="lang-pill-code">${lang.toUpperCase()}</span>
            <span class="lang-pill-count">${count}</span>
        </button>
    `).join('');
}

function filterByLang(lang) {
    navigateTo('glossary');
    setTimeout(() => {
        state.filters.glossaryLang = lang;
        state.filters.category = null;
        const langSelect = document.getElementById('glossaryLangFilter');
        if (langSelect) langSelect.value = lang;
        renderGlossarySidebar();
        document.getElementById('glossaryContent').innerHTML =
            '<div class="glossary-welcome"><p>Sélectionnez une catégorie à gauche.</p></div>';
    }, 50);
}
window.filterByLang = filterByLang;

function setupSurpriseButton() {
    const btn = document.getElementById('surpriseBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        // 50% chance term, 50% chance book
        if (Math.random() > 0.5 && state.terms.length) {
            const term = state.terms[Math.floor(Math.random() * state.terms.length)];
            selectGlossaryTerm(term.id);
        } else if (state.books.length) {
            const book = state.books[Math.floor(Math.random() * state.books.length)];
            navigateTo('browse');
            setTimeout(() => {
                const card = document.querySelector(`.book-card[data-id="${book.id}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlight');
                    setTimeout(() => card.classList.remove('highlight'), 2000);
                }
            }, 100);
        }
    });
}

function renderRecentlyRead() {
    const container = document.getElementById('recentlyRead');
    const list = document.getElementById('recentList');
    if (!container || !list) return;

    const recent = JSON.parse(localStorage.getItem('aleph-recent') || '[]');
    const validRecent = recent.filter(id => state.bookIndex[id]).slice(0, 5);

    if (!validRecent.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    list.innerHTML = validRecent.map(id => {
        const book = state.bookIndex[id];
        return `
            <a href="#reader" class="recent-item" onclick="openReader('${id}'); return false;">
                <span class="recent-title">${escapeHtml(book.title)}</span>
                <span class="recent-author">${escapeHtml(book.author)}</span>
            </a>
        `;
    }).join('');
}

function setupRandomPassage() {
    const btn = document.getElementById('randomPassageBtn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        if (!state.books.length) return;

        // Pick random book with text available
        const booksWithTexts = state.books.filter(b => b.langs?.length);
        if (!booksWithTexts.length) return;

        const book = booksWithTexts[Math.floor(Math.random() * booksWithTexts.length)];
        const lang = book.langs[0];
        const textId = `${book.id}_${lang}`;

        try {
            const text = await loadTextContent(textId);
            const paragraphs = (text.content || '')
                .replace(/\r\n/g, '\n')
                .split(/\n{2,}/)
                .filter(p => p.trim().length > 100);

            if (paragraphs.length) {
                const paraIndex = Math.floor(Math.random() * paragraphs.length);
                openReader(book.id, { lang, scrollToPara: `para-${paraIndex}` });
            } else {
                openReader(book.id, { lang });
            }
        } catch {
            openReader(book.id);
        }
    });
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
            ${lang.toUpperCase()}
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

    if (state.filters.lang) {
        books = books.filter(b => b.lang === state.filters.lang || b.langs.includes(state.filters.lang));
    }

    if (state.filters.type) {
        books = books.filter(b => state.filters.type.includes(b.type));
    }

    const q = (state.filters.query || '').toLowerCase().trim();
    if (q) {
        books = books.filter(b => {
            const hay = [b.title, b.author, b.code, b.source, ...(b.tags || [])].join(' ').toLowerCase();
            return hay.includes(q);
        });
    }

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
        <a href="#reader" class="book-card" data-id="${b.id}" onclick="openReader('${b.id}'); return false;">
            <div class="book-cover" data-lang="${b.lang}">
                <span class="book-cover-code">${escapeHtml(b.code)}</span>
                <span class="book-cover-lang">${b.lang.toUpperCase()}</span>
            </div>
            <h3 class="book-title">${escapeHtml(b.title)}</h3>
            <p class="book-author">${escapeHtml(b.author)}</p>
            <p class="book-meta">${b.year || '—'}${b.langs.length > 1 ? ` · ${b.langs.length} langues` : ''}</p>
        </a>
    `).join('');
}

function setupBrowseControls() {
    const sortSelect = document.getElementById('sortSelect');
    const viewToggles = document.querySelectorAll('.view-toggle');
    const grid = document.getElementById('booksGrid');
    const timeline = document.getElementById('timelineContainer');
    const filterInput = document.getElementById('browseFilter');

    sortSelect?.addEventListener('change', () => {
        state.sort = sortSelect.value;
        renderBooksGrid();
    });

    const mapContainer = document.getElementById('mapContainer');

    viewToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            viewToggles.forEach(t => t.classList.remove('active'));
            toggle.classList.add('active');
            const view = toggle.dataset.view;

            if (grid) grid.style.display = (view === 'timeline' || view === 'map') ? 'none' : '';
            if (grid) grid.classList.toggle('list-view', view === 'list');
            if (timeline) timeline.style.display = view === 'timeline' ? 'block' : 'none';
            if (mapContainer) mapContainer.style.display = view === 'map' ? 'block' : 'none';

            if (view === 'timeline') renderTimeline();
            if (view === 'map') renderMap();
        });
    });

    filterInput?.addEventListener('input', () => {
        state.filters.query = filterInput.value;
        renderBooksGrid();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE VIEW
// ─────────────────────────────────────────────────────────────────────────────
function renderTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container || !state.books.length) return;

    container.innerHTML = '';

    const margin = { top: 40, right: 40, bottom: 60, left: 40 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Filter books with valid years
    const booksWithYears = state.books.filter(b => b.year && !isNaN(b.year));

    // Create scales
    const minYear = Math.min(...booksWithYears.map(b => b.year));
    const maxYear = Math.max(...booksWithYears.map(b => b.year));

    const x = d3.scaleLinear()
        .domain([minYear - 100, maxYear + 100])
        .range([0, width]);

    // Group books by era to avoid overlap
    const eras = {};
    booksWithYears.forEach(b => {
        const era = Math.floor(b.year / 100) * 100;
        if (!eras[era]) eras[era] = [];
        eras[era].push(b);
    });

    // Draw axis
    const xAxis = d3.axisBottom(x)
        .tickFormat(d => d < 0 ? `${Math.abs(d)} av. J.-C.` : d)
        .ticks(10);

    svg.append('g')
        .attr('class', 'timeline-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

    // Draw era backgrounds
    const eraColors = {
        ancient: 'rgba(193, 77, 44, 0.1)',
        classical: 'rgba(139, 69, 19, 0.1)',
        medieval: 'rgba(70, 130, 180, 0.1)',
        early_modern: 'rgba(85, 107, 47, 0.1)',
        modern: 'rgba(128, 128, 128, 0.1)'
    };

    // Draw books as circles
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'timeline-tooltip')
        .style('opacity', 0);

    svg.selectAll('.timeline-dot')
        .data(booksWithYears)
        .enter()
        .append('circle')
        .attr('class', 'timeline-dot')
        .attr('cx', d => x(d.year))
        .attr('cy', (d, i) => {
            const era = Math.floor(d.year / 100) * 100;
            const idx = eras[era].indexOf(d);
            return height / 2 + (idx % 5 - 2) * 35;
        })
        .attr('r', 8)
        .attr('fill', d => {
            const langColors = { el: '#8b5cf6', la: '#ef4444', en: '#3b82f6', de: '#22c55e', fr: '#f59e0b', zh: '#ec4899', sa: '#f97316', ja: '#06b6d4' };
            return langColors[d.lang] || 'var(--ink-3)';
        })
        .attr('stroke', 'var(--paper)')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('r', 12);
            tooltip.transition().duration(100).style('opacity', 1);
            tooltip.html(`<strong>${d.title}</strong><br>${d.author}<br><em>${d.year < 0 ? Math.abs(d.year) + ' av. J.-C.' : d.year}</em>`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 60) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).attr('r', 8);
            tooltip.transition().duration(100).style('opacity', 0);
        })
        .on('click', (event, d) => openReader(d.id));

    // Add legend
    const legend = svg.append('g')
        .attr('class', 'timeline-legend')
        .attr('transform', `translate(0, -25)`);

    const langs = [
        { code: 'el', name: 'Grec', color: '#8b5cf6' },
        { code: 'la', name: 'Latin', color: '#ef4444' },
        { code: 'en', name: 'Anglais', color: '#3b82f6' },
        { code: 'de', name: 'Allemand', color: '#22c55e' },
        { code: 'fr', name: 'Français', color: '#f59e0b' }
    ];

    langs.forEach((lang, i) => {
        legend.append('circle')
            .attr('cx', i * 90)
            .attr('cy', 0)
            .attr('r', 5)
            .attr('fill', lang.color);
        legend.append('text')
            .attr('x', i * 90 + 10)
            .attr('y', 4)
            .attr('class', 'timeline-legend-text')
            .text(lang.name);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP VIEW
// ─────────────────────────────────────────────────────────────────────────────
function renderMap() {
    const container = document.getElementById('mapContainer');
    if (!container || !state.books.length) return;

    // Define regions and their texts based on language/origin
    const regions = [
        { id: 'greece', name: 'Grèce', langs: ['el', 'grc'], color: '#8b5cf6', x: 55, y: 35 },
        { id: 'rome', name: 'Rome', langs: ['la'], color: '#ef4444', x: 45, y: 38 },
        { id: 'britain', name: 'Îles Britanniques', langs: ['en', 'ang'], color: '#3b82f6', x: 35, y: 25 },
        { id: 'france', name: 'France', langs: ['fr'], color: '#f59e0b', x: 40, y: 32 },
        { id: 'germany', name: 'Germanie', langs: ['de', 'gmh'], color: '#22c55e', x: 48, y: 28 },
        { id: 'iberia', name: 'Ibérie', langs: ['es', 'pt'], color: '#ec4899', x: 32, y: 40 },
        { id: 'italy', name: 'Italie', langs: ['it'], color: '#f97316', x: 48, y: 42 },
        { id: 'persia', name: 'Perse', langs: ['fa'], color: '#14b8a6', x: 70, y: 38 },
        { id: 'india', name: 'Inde', langs: ['sa', 'pi'], color: '#f97316', x: 78, y: 48 },
        { id: 'china', name: 'Chine', langs: ['zh'], color: '#ec4899', x: 88, y: 38 },
        { id: 'japan', name: 'Japon', langs: ['ja'], color: '#06b6d4', x: 95, y: 35 },
        { id: 'arabia', name: 'Arabie', langs: ['ar'], color: '#84cc16', x: 65, y: 48 },
        { id: 'mesopotamia', name: 'Mésopotamie', langs: ['akk', 'sux'], color: '#a855f7', x: 68, y: 42 },
        { id: 'egypt', name: 'Égypte', langs: ['egy'], color: '#eab308', x: 58, y: 50 },
        { id: 'scandinavia', name: 'Scandinavie', langs: ['non', 'no'], color: '#0ea5e9', x: 48, y: 18 }
    ];

    // Count books per region
    const regionBooks = {};
    regions.forEach(r => { regionBooks[r.id] = []; });

    state.books.forEach(book => {
        const region = regions.find(r => r.langs.includes(book.lang));
        if (region) {
            regionBooks[region.id].push(book);
        }
    });

    container.innerHTML = `
        <div class="map-world">
            ${regions.map(r => {
                const books = regionBooks[r.id];
                if (books.length === 0) return '';
                return `
                    <div class="map-region" style="left: ${r.x}%; top: ${r.y}%;">
                        <button class="map-pin" style="background: ${r.color};" onclick="showRegionBooks('${r.id}')" title="${r.name}: ${books.length} textes">
                            <span class="map-pin-count">${books.length}</span>
                        </button>
                        <span class="map-label">${r.name}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="map-books-panel" id="mapBooksPanel">
            <p class="map-hint">Cliquez sur une région pour voir ses textes</p>
        </div>
    `;

    // Store for click handler
    window.mapRegions = regions;
    window.mapRegionBooks = regionBooks;
}

window.showRegionBooks = function(regionId) {
    const region = window.mapRegions.find(r => r.id === regionId);
    const books = window.mapRegionBooks[regionId];
    const panel = document.getElementById('mapBooksPanel');

    if (!panel || !region || !books.length) return;

    panel.innerHTML = `
        <h3 class="map-panel-title">${region.name} <span class="map-panel-count">${books.length} textes</span></h3>
        <div class="map-books-list">
            ${books.map(b => `
                <button class="map-book-item" onclick="openReader('${b.id}')">
                    <span class="map-book-title">${escapeHtml(b.title)}</span>
                    <span class="map-book-author">${escapeHtml(b.author)}</span>
                </button>
            `).join('')}
        </div>
    `;
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOSSARY PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderGlossaryPage() {
    renderGlossaryStats();
    renderGlossaryLangFilter();
    renderGlossarySidebar();
    setupGlossaryControls();
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

function renderGlossaryLangFilter() {
    const select = document.getElementById('glossaryLangFilter');
    if (!select) return;

    const langCounts = {};
    state.terms.forEach(t => {
        langCounts[t.lang] = (langCounts[t.lang] || 0) + 1;
    });

    const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);

    select.innerHTML = `<option value="">toutes les langues (${state.terms.length})</option>` +
        sorted.map(([lang, count]) => `<option value="${lang}">${lang.toUpperCase()} (${count})</option>`).join('');
}

function getGlossaryCategories() {
    const langFilter = state.filters.glossaryLang || '';
    let terms = langFilter ? state.terms.filter(t => t.lang === langFilter) : [...state.terms];

    const byCategory = {};
    terms.forEach(t => {
        const cats = Array.isArray(t.category) ? t.category : [t.category || 'autre'];
        const primary = cats[0] || 'autre';
        if (!byCategory[primary]) byCategory[primary] = [];
        byCategory[primary].push(t);
    });

    return Object.entries(byCategory).sort((a, b) => b[1].length - a[1].length);
}

function renderGlossarySidebar() {
    const sidebar = document.getElementById('glossarySidebar');
    if (!sidebar) return;

    const categories = getGlossaryCategories();
    const activeCategory = state.filters.category || '';

    sidebar.innerHTML = categories.map(([cat, terms]) => `
        <button class="glossary-cat-btn${cat === activeCategory ? ' active' : ''}"
                data-category="${escapeHtml(cat)}">
            <span class="cat-name">${escapeHtml(cat)}</span>
            <span class="cat-count">${terms.length}</span>
        </button>
    `).join('');

    sidebar.querySelectorAll('.glossary-cat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.category;
            state.filters.category = cat;
            sidebar.querySelectorAll('.glossary-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderGlossaryContent(cat);
        });
    });
}

function renderGlossaryContent(category) {
    const content = document.getElementById('glossaryContent');
    if (!content) return;

    const categories = getGlossaryCategories();
    const found = categories.find(([cat]) => cat === category);

    if (!found) {
        content.innerHTML = `<div class="glossary-welcome"><p>Sélectionnez une catégorie à gauche.</p></div>`;
        return;
    }

    const [cat, terms] = found;
    terms.sort((a, b) => a.term.localeCompare(b.term));

    content.innerHTML = `
        <header class="glossary-content-header">
            <h2 class="glossary-content-title">${escapeHtml(cat)}</h2>
            <span class="glossary-content-count">${terms.length} termes</span>
        </header>
        <div class="glossary-terms-list">
            ${terms.map(t => renderGlossaryTerm(t)).join('')}
        </div>
    `;
}

function renderGlossaryTerm(t) {
    const firstLetter = t.term.charAt(0).toUpperCase();
    const cats = Array.isArray(t.category) ? t.category : [t.category || ''];
    const pron = t.pronunciation ? `/${t.pronunciation}/` : '';
    const etymology = t.etymology ? `<div class="entry-etymology"><strong>Étymologie:</strong> ${escapeHtml(t.etymology)}</div>` : '';
    const usage = t.usage ? `<div class="entry-usage"><strong>Exemple:</strong> <em>${escapeHtml(t.usage)}</em></div>` : '';
    const validRelated = (t.related || []).filter(r =>
        state.terms.some(term => term.term.toLowerCase() === r.toLowerCase() || term.id === r.toLowerCase())
    );
    const related = validRelated.length ? `
        <div class="entry-related">
            <strong>Voir aussi:</strong>
            ${validRelated.map(r => `<a href="#" onclick="selectGlossaryTermByName('${escapeHtml(r)}'); return false;">${escapeHtml(r)}</a>`).join(', ')}
        </div>
    ` : '';

    // Cross-links to texts
    const textIds = state.crosslinks?.termToTexts?.[t.id] || [];
    const appearsIn = textIds.length ? `
        <div class="entry-appears">
            <strong>Apparaît dans:</strong>
            ${textIds.slice(0, 5).map(tid => {
                const book = state.bookIndex[tid.replace(/_[a-z]+$/, '')];
                const title = book?.title || tid;
                return `<a href="#" onclick="openReader('${tid.replace(/_[a-z]+$/, '')}', {query: '${escapeHtml(t.term)}'}); return false;">${escapeHtml(title)}</a>`;
            }).join(', ')}${textIds.length > 5 ? ` <span class="entry-more">+${textIds.length - 5}</span>` : ''}
        </div>
    ` : '';

    return `
        <article class="glossary-entry" data-id="${t.id}" data-lang="${t.lang}" onclick="toggleGlossaryEntry(this)">
            <header class="glossary-entry-header">
                <span class="glossary-dropcap">${firstLetter}</span>
                <span class="glossary-term">${escapeHtml(t.term)}</span>
                <span class="glossary-lang">${t.lang.toUpperCase()}</span>
                ${textIds.length ? `<span class="glossary-textcount" title="Apparaît dans ${textIds.length} textes">📖${textIds.length}</span>` : ''}
                <span class="glossary-expand">+</span>
            </header>
            <div class="glossary-entry-body">
                <div class="entry-meta">
                    ${cats.slice(1).map(c => `<span class="entry-tag">${escapeHtml(c)}</span>`).join('')}
                    ${pron ? `<span class="entry-pron">${pron}</span>` : ''}
                </div>
                <p class="entry-definition">${escapeHtml(t.definition || '')}</p>
                ${etymology}
                ${usage}
                ${related}
                ${appearsIn}
            </div>
        </article>
    `;
}

function setupGlossaryControls() {
    const searchInput = document.getElementById('glossarySearch');
    const langSelect = document.getElementById('glossaryLangFilter');

    searchInput?.addEventListener('input', () => {
        filterGlossaryBySearch(searchInput.value);
    });

    langSelect?.addEventListener('change', () => {
        state.filters.glossaryLang = langSelect.value;
        state.filters.category = null;
        renderGlossarySidebar();
        document.getElementById('glossaryContent').innerHTML =
            '<div class="glossary-welcome"><p>Sélectionnez une catégorie à gauche.</p></div>';
    });
}

function filterGlossaryBySearch(query) {
    const q = query.toLowerCase().trim();
    const content = document.getElementById('glossaryContent');
    const sidebar = document.getElementById('glossarySidebar');

    if (!q) {
        // Reset: show all entries and categories
        content.querySelectorAll('.glossary-entry').forEach(e => e.style.display = '');
        sidebar?.querySelectorAll('.glossary-cat-btn').forEach(b => b.style.display = '');
        return;
    }

    // Filter entries in current content view
    content.querySelectorAll('.glossary-entry').forEach(entry => {
        const term = entry.querySelector('.glossary-term')?.textContent.toLowerCase() || '';
        const def = entry.querySelector('.entry-definition')?.textContent.toLowerCase() || '';
        entry.style.display = term.includes(q) || def.includes(q) ? '' : 'none';
    });

    // Gray out sidebar categories with no matches
    const categories = getGlossaryCategories();
    categories.forEach(([cat, terms]) => {
        const hasMatch = terms.some(t => {
            const term = t.term.toLowerCase();
            const def = (t.definition || '').toLowerCase();
            return term.includes(q) || def.includes(q);
        });
        const btn = sidebar?.querySelector(`[data-category="${cat}"]`);
        if (btn) btn.classList.toggle('dimmed', !hasMatch);
    });
}

function toggleGlossaryEntry(el) {
    const wasOpen = el.classList.contains('open');

    // Close all entries
    document.querySelectorAll('.glossary-entry.open').forEach(e => {
        e.classList.remove('open');
        e.querySelector('.glossary-expand').textContent = '+';
    });

    // Open this one if it wasn't already open
    if (!wasOpen) {
        el.classList.add('open');
        el.querySelector('.glossary-expand').textContent = '−';
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function selectGlossaryTerm(id) {
    navigateTo('glossary');

    const searchInput = document.getElementById('glossarySearch');
    if (searchInput) searchInput.value = '';

    const langSelect = document.getElementById('glossaryLangFilter');
    if (langSelect) langSelect.value = '';
    state.filters.glossaryLang = '';

    // Find the term and its category
    const term = state.terms.find(t => t.id === id);
    if (!term) return;

    const cats = Array.isArray(term.category) ? term.category : [term.category || 'autre'];
    const category = cats[0];

    // Select the category and render content
    state.filters.category = category;
    renderGlossarySidebar();
    renderGlossaryContent(category);

    setTimeout(() => {
        const entry = document.querySelector(`.glossary-entry[data-id="${id}"]`);
        if (entry) {
            toggleGlossaryEntry(entry);
            entry.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 50);
}

function selectGlossaryTermByName(name) {
    const term = state.terms.find(t =>
        t.term.toLowerCase() === name.toLowerCase() ||
        t.id === name.toLowerCase() ||
        t.term.toLowerCase().includes(name.toLowerCase())
    );
    if (term) selectGlossaryTerm(term.id);
}

// Make it globally accessible
window.selectGlossaryTerm = selectGlossaryTerm;
window.selectGlossaryTermByName = selectGlossaryTermByName;
window.toggleGlossaryEntry = toggleGlossaryEntry;
window.navigateTo = navigateTo;

// ─────────────────────────────────────────────────────────────────────────────
// SOURCES PAGE
// ─────────────────────────────────────────────────────────────────────────────
function renderSourcesPage() {
    renderSourcesStats();
    renderSourcesToc();
    renderSourcesSections();
    setupSourcesViewToggle();
}

function renderSourcesStats() {
    const sourceCount = document.getElementById('sourceCount');
    const categoryCount = document.getElementById('categoryCount');

    if (!state.references) return;

    const sections = state.references.sections || [];
    let total = 0;
    sections.forEach(sec => {
        sec.groups.forEach(g => {
            total += g.resources.length;
        });
    });

    if (sourceCount) sourceCount.textContent = total;
    if (categoryCount) categoryCount.textContent = sections.length;
}

function renderSourcesToc() {
    const container = document.getElementById('sourcesToc');
    if (!container || !state.references) return;

    const sections = state.references.sections || [];

    container.innerHTML = sections.map(sec => {
        const count = sec.groups.reduce((sum, g) => sum + g.resources.length, 0);
        return `<a href="#section-${sec.id}" class="sources-toc-pill" onclick="scrollToSourceSection('${sec.id}'); return false;">${escapeHtml(sec.name)}<span class="count">${count}</span></a>`;
    }).join('');
}

function scrollToSourceSection(id) {
    if (state.sourcesView === 'network') {
        setSourcesView('list');
    }
    setTimeout(() => {
        const el = document.getElementById('section-' + id);
        if (el) {
            el.open = true;
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
}
window.scrollToSourceSection = scrollToSourceSection;

function renderSourcesSections() {
    const container = document.getElementById('sourcesSections');
    if (!container || !state.references) return;

    const sections = state.references.sections || [];

    container.innerHTML = sections.map((sec, i) => {
        const totalCount = sec.groups.reduce((sum, g) => sum + g.resources.length, 0);
        return `
            <details class="sources-section" id="section-${sec.id}">
                <summary class="sources-section-header">
                    <span class="sources-section-num">§ ${String(i + 1).padStart(2, '0')}</span>
                    <h2 class="sources-section-title">${escapeHtml(sec.name)}</h2>
                    <span class="sources-section-count">${totalCount} entrées</span>
                </summary>
                <div class="sources-section-content">
                    ${sec.groups.map(group => `
                        <div class="sources-group">
                            <h3 class="sources-group-title">${escapeHtml(group.name)}</h3>
                            <div class="sources-list">
                                ${group.resources.map(r => `
                                    <article class="source-item">
                                        <h4 class="source-name"><a href="${r.url}" target="_blank">${escapeHtml(r.name)}</a></h4>
                                        ${r.desc ? `<p class="source-desc">${escapeHtml(r.desc)}</p>` : ''}
                                    </article>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </details>
        `;
    }).join('');
}

function setupSourcesViewToggle() {
    const btns = document.querySelectorAll('.sources-view-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            setSourcesView(view);
        });
    });
}

function setSourcesView(view) {
    state.sourcesView = view;

    const btns = document.querySelectorAll('.sources-view-btn');
    btns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    const listContainer = document.getElementById('sourcesSections');
    const networkContainer = document.getElementById('networkContainer');

    if (view === 'network') {
        if (listContainer) listContainer.style.display = 'none';
        if (networkContainer) {
            networkContainer.style.display = 'block';
            initNetwork();
        }
    } else {
        if (listContainer) listContainer.style.display = '';
        if (networkContainer) networkContainer.style.display = 'none';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// NETWORK VISUALIZATION
// ─────────────────────────────────────────────────────────────────────────────
function buildNetworkNodes() {
    if (!state.references) return;

    const sections = state.references.sections || [];

    networkState.allNodes = [
        { id: 'root', label: 'א', group: 'root', depth: 0 }
    ];

    sections.forEach(sec => {
        networkState.allNodes.push({
            id: sec.id,
            label: sec.name.length > 12 ? sec.name.slice(0, 10) + '…' : sec.name,
            fullLabel: sec.name,
            group: 'section',
            depth: 1,
            parent: 'root'
        });
    });

    networkState.subtopicNodes = [];
    networkState.resourceNodes = [];

    sections.forEach(sec => {
        sec.groups.forEach((group, gi) => {
            const groupId = `${sec.id}_g${gi}`;
            networkState.subtopicNodes.push({
                id: groupId,
                label: group.name.length > 15 ? group.name.slice(0, 13) + '…' : group.name,
                fullLabel: group.name,
                group: 'subtopic',
                depth: 2,
                parent: sec.id
            });

            group.resources.forEach((res, ri) => {
                networkState.resourceNodes.push({
                    id: `${groupId}_r${ri}`,
                    label: res.name.length > 18 ? res.name.slice(0, 16) + '…' : res.name,
                    fullLabel: res.name,
                    group: 'resource',
                    depth: 3,
                    parent: groupId,
                    url: res.url
                });
            });
        });
    });
}

function getVisibleNetworkData() {
    const nodes = [];
    const links = [];
    const visibleIds = new Set();

    const rootNode = networkState.allNodes.find(n => n.id === 'root');
    if (rootNode) {
        nodes.push({ ...rootNode });
        visibleIds.add('root');
    }

    networkState.allNodes.forEach(node => {
        if (node.parent && networkState.expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    networkState.subtopicNodes.forEach(node => {
        if (networkState.expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    networkState.resourceNodes.forEach(node => {
        if (networkState.expandedNodes.has(node.parent)) {
            nodes.push({ ...node });
            visibleIds.add(node.id);
            links.push({ source: node.parent, target: node.id });
        }
    });

    return { nodes, links };
}

function nodeRadius(d) {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const scale = isTouch ? 1.5 : 1;
    if (d.depth === 0) return 28 * scale;
    if (d.depth === 1) return 14 * scale;
    if (d.depth === 2) return 9 * scale;
    return 5 * scale;
}

function hasNetworkChildren(nodeId) {
    if (networkState.allNodes.some(n => n.parent === nodeId)) return true;
    if (networkState.subtopicNodes.some(n => n.parent === nodeId)) return true;
    if (networkState.resourceNodes.some(n => n.parent === nodeId)) return true;
    return false;
}

function toggleNetworkNode(nodeId) {
    if (networkState.expandedNodes.has(nodeId)) {
        networkState.expandedNodes.delete(nodeId);
        collapseNetworkDescendants(nodeId);
    } else {
        networkState.expandedNodes.add(nodeId);
    }
    updateNetwork();
}

function collapseNetworkDescendants(nodeId) {
    networkState.allNodes.filter(n => n.parent === nodeId).forEach(child => {
        networkState.expandedNodes.delete(child.id);
        collapseNetworkDescendants(child.id);
    });
    networkState.subtopicNodes.filter(n => n.parent === nodeId).forEach(child => {
        networkState.expandedNodes.delete(child.id);
        collapseNetworkDescendants(child.id);
    });
}

function initNetwork() {
    const container = document.getElementById('networkContainer');
    if (!container || typeof d3 === 'undefined') {
        console.warn('D3 not loaded or container not found');
        return;
    }

    buildNetworkNodes();
    networkState.expandedNodes = new Set(['root']);
    networkState.nodePositions = {};
    networkState.highlight = '';

    const rect = container.getBoundingClientRect();
    networkState.width = rect.width || 800;
    networkState.height = Math.max(600, rect.height || 600);

    container.innerHTML = `
        <div class="network-toolbar">
            <input type="text" class="network-search" id="networkSearch" placeholder="filtrer les nœuds…">
            <button class="network-btn" id="networkExpandAll">Tout déplier</button>
            <button class="network-btn" id="networkCollapseAll">Tout replier</button>
            <button class="network-btn" id="networkReset">Recentrer</button>
        </div>
        <div class="network-hint">Cliquer pour déplier · Glisser pour déplacer · Molette pour zoomer</div>
        <div class="network-tooltip" id="networkTooltip"></div>
    `;

    networkState.svg = d3.select(container)
        .append('svg')
        .attr('width', '100%')
        .attr('height', networkState.height)
        .attr('viewBox', `0 0 ${networkState.width} ${networkState.height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    networkState.g = networkState.svg.append('g');

    const zoom = d3.zoom()
        .scaleExtent([0.2, 4])
        .on('zoom', e => networkState.g.attr('transform', e.transform));
    networkState.svg.call(zoom);
    networkState.zoom = zoom;

    document.getElementById('networkExpandAll')?.addEventListener('click', () => {
        networkState.allNodes.forEach(n => { if (hasNetworkChildren(n.id)) networkState.expandedNodes.add(n.id); });
        networkState.subtopicNodes.forEach(n => networkState.expandedNodes.add(n.id));
        updateNetwork();
    });
    document.getElementById('networkCollapseAll')?.addEventListener('click', () => {
        networkState.expandedNodes = new Set(['root']);
        updateNetwork();
    });
    document.getElementById('networkReset')?.addEventListener('click', () => {
        networkState.svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
    });
    document.getElementById('networkSearch')?.addEventListener('input', (e) => {
        networkState.highlight = e.target.value.toLowerCase().trim();
        if (networkState.highlight) {
            networkState.allNodes.forEach(n => {
                if ((n.fullLabel || n.label).toLowerCase().includes(networkState.highlight) && n.parent) {
                    networkState.expandedNodes.add(n.parent);
                }
            });
            networkState.subtopicNodes.forEach(n => {
                if ((n.fullLabel || n.label).toLowerCase().includes(networkState.highlight)) {
                    networkState.expandedNodes.add(n.parent);
                }
            });
            networkState.resourceNodes.forEach(n => {
                if ((n.fullLabel || n.label).toLowerCase().includes(networkState.highlight)) {
                    networkState.expandedNodes.add(n.parent);
                    const parent = networkState.subtopicNodes.find(s => s.id === n.parent);
                    if (parent) networkState.expandedNodes.add(parent.parent);
                }
            });
        }
        updateNetwork();
    });

    updateNetwork();
}

function updateNetwork() {
    if (!networkState.svg) return;

    const data = getVisibleNetworkData();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    const colors = {
        root: isDark ? '#c9a84c' : '#c14d2c',
        section: isDark ? '#8a7a5a' : '#5a4a3a',
        subtopic: isDark ? '#6a6a5a' : '#8a7a6a',
        resource: isDark ? '#5a5a4a' : '#a09080'
    };

    if (networkState.simulation) networkState.simulation.stop();

    const cx = networkState.width / 2;
    const cy = networkState.height / 2;

    data.nodes.forEach(n => {
        if (n.id === 'root') {
            n.fx = cx;
            n.fy = cy;
            n.x = cx;
            n.y = cy;
            return;
        }
        if (networkState.nodePositions[n.id]) {
            n.x = networkState.nodePositions[n.id].x;
            n.y = networkState.nodePositions[n.id].y;
        } else {
            const parent = data.nodes.find(p => p.id === n.parent);
            const px = parent?.x ?? cx;
            const py = parent?.y ?? cy;
            n.x = px + (Math.random() - 0.5) * 60;
            n.y = py + (Math.random() - 0.5) * 60;
        }
    });

    networkState.simulation = d3.forceSimulation(data.nodes)
        .force('link', d3.forceLink(data.links)
            .id(d => d.id)
            .distance(d => {
                const sr = nodeRadius(d.source);
                const tr = nodeRadius(d.target);
                if (sr >= 20 || tr >= 20) return 140;
                if (sr >= 12 || tr >= 12) return 100;
                if (sr >= 8 || tr >= 8) return 65;
                return 36;
            })
            .strength(0.45))
        .force('charge', d3.forceManyBody().strength(d => -30 * nodeRadius(d)))
        .force('collide', d3.forceCollide().radius(d => nodeRadius(d) + 8).iterations(2))
        .force('x', d3.forceX(cx).strength(0.04))
        .force('y', d3.forceY(cy).strength(0.04))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

    networkState.g.selectAll('*').remove();

    const link = networkState.g.append('g')
        .selectAll('line')
        .data(data.links)
        .join('line')
        .attr('stroke', isDark ? '#555' : '#c8b89a')
        .attr('stroke-opacity', 0.5)
        .attr('stroke-width', d => d.target.depth >= 3 ? 0.5 : 1);

    const node = networkState.g.append('g')
        .selectAll('g')
        .data(data.nodes)
        .join('g')
        .style('cursor', 'pointer')
        .call(d3.drag()
            .on('start', dragstart)
            .on('drag', dragging)
            .on('end', dragend));

    node.append('circle')
        .attr('r', d => nodeRadius(d))
        .attr('fill', d => colors[d.group])
        .attr('stroke', d => networkState.expandedNodes.has(d.id) ? (isDark ? '#fff' : '#1a1410') : 'none')
        .attr('stroke-width', 2);

    node.filter(d => hasNetworkChildren(d.id) && !networkState.expandedNodes.has(d.id))
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', d => d.depth <= 1 ? '12px' : '8px')
        .attr('font-weight', 'bold')
        .text('+');

    const labels = networkState.g.append('g')
        .selectAll('text')
        .data(data.nodes)
        .join('text')
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'central')
        .attr('dx', d => nodeRadius(d) + 6)
        .style('font-size', d => d.depth === 0 ? '14px' : d.depth === 1 ? '11px' : d.depth === 2 ? '9.5px' : '8.5px')
        .style('fill', d => labelOpacityForMatch(d) > 0 ? (isDark ? '#e8e0d0' : '#1a1410') : (isDark ? '#d0c8b8' : '#5a4a3a'))
        .style('font-weight', d => labelOpacityForMatch(d) > 0 ? 600 : 400)
        .style('opacity', d => baseLabelOpacity(d))
        .style('pointer-events', 'none')
        .style('font-family', 'var(--mono)')
        .text(d => d.label);

    const tooltip = document.getElementById('networkTooltip');

    function showTooltip(event, d) {
        if (!tooltip) return;
        const text = d.fullLabel || d.label;
        const extra = d.group === 'resource' && d.url ? `<br><span class="tip-url">${d.url}</span>` : '';
        tooltip.innerHTML = `<strong>${escapeHtml(text)}</strong>${extra}`;
        tooltip.style.opacity = '1';
        moveTooltip(event);
    }
    function hideTooltip() { if (tooltip) tooltip.style.opacity = '0'; }
    function moveTooltip(event) {
        if (!tooltip) return;
        const rect = networkState.svg.node().getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        tooltip.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
    }

    node.on('mouseover', (event, d) => {
        labels.filter(l => l === d).style('opacity', 1).style('font-weight', 600);
        showTooltip(event, d);
    }).on('mousemove', moveTooltip)
    .on('mouseout', (event, d) => {
        labels.filter(l => l === d).style('opacity', baseLabelOpacity(d)).style('font-weight', labelOpacityForMatch(d) > 0 ? 600 : 400);
        hideTooltip();
    });

    node.on('click', (e, d) => {
        e.stopPropagation();
        if (d.group === 'resource' && d.url) {
            window.open(d.url, '_blank', 'noopener');
        } else if (hasNetworkChildren(d.id)) {
            toggleNetworkNode(d.id);
        }
    });

    function baseLabelOpacity(d) {
        const matchOp = labelOpacityForMatch(d);
        if (matchOp > 0) return matchOp;
        if (d.depth <= 1) return 1;
        if (d.depth === 2) return 0.75;
        return 0;
    }

    function labelOpacityForMatch(d) {
        if (!networkState.highlight) return 0;
        return (d.fullLabel || d.label).toLowerCase().includes(networkState.highlight) ? 1 : 0;
    }

    const padding = 30;
    networkState.simulation.on('tick', () => {
        data.nodes.forEach(d => {
            if (!d.fx) {
                const r = nodeRadius(d);
                d.x = Math.max(r + padding, Math.min(networkState.width - r - padding, d.x));
                d.y = Math.max(r + padding, Math.min(networkState.height - r - padding, d.y));
            }
            networkState.nodePositions[d.id] = { x: d.x, y: d.y };
        });

        link.attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
        labels.attr('x', d => d.x).attr('y', d => d.y);
    });

    function dragstart(e) {
        if (e.subject.id === 'root') return;
        if (!e.active) networkState.simulation.alphaTarget(0.1).restart();
        e.subject.fx = e.subject.x;
        e.subject.fy = e.subject.y;
    }

    function dragging(e) {
        if (e.subject.id === 'root') return;
        const r = nodeRadius(e.subject);
        e.subject.fx = Math.max(r + padding, Math.min(networkState.width - r - padding, e.x));
        e.subject.fy = Math.max(r + padding, Math.min(networkState.height - r - padding, e.y));
    }

    function dragend(e) {
        if (e.subject.id === 'root') return;
        if (!e.active) networkState.simulation.alphaTarget(0);
        e.subject.fx = null;
        e.subject.fy = null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// READER PAGE — full text display
// ─────────────────────────────────────────────────────────────────────────────
function setupReaderPage() {
    document.getElementById('readerBack')?.addEventListener('click', () => {
        navigateTo(state.reader.previousPage || 'browse');
    });

    const searchInput = document.getElementById('readerSearchInput');
    searchInput?.addEventListener('input', () => {
        state.reader.query = searchInput.value;
        renderReaderBody();
    });

    // Font size controls
    let fontSize = parseFloat(localStorage.getItem('aleph-font-size') || '1.1');
    document.getElementById('fontIncrease')?.addEventListener('click', () => {
        fontSize = Math.min(fontSize + 0.1, 1.6);
        applyReaderFontSize(fontSize);
    });
    document.getElementById('fontDecrease')?.addEventListener('click', () => {
        fontSize = Math.max(fontSize - 0.1, 0.85);
        applyReaderFontSize(fontSize);
    });

    // Share paragraph link and notes
    document.getElementById('readerBody')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('para-share')) {
            const paraIdx = e.target.dataset.para;
            const url = `${window.location.origin}${window.location.pathname}#read/${state.reader.bookId}/${state.reader.lang}/p${paraIdx}`;
            navigator.clipboard.writeText(url).then(() => {
                e.target.textContent = '✓';
                setTimeout(() => { e.target.textContent = '§'; }, 1500);
            });
        }
        if (e.target.classList.contains('para-note')) {
            const paraIdx = e.target.dataset.para;
            openNoteEditor(paraIdx);
        }
    });

    // Save reading position on scroll
    let scrollTimer = null;
    document.getElementById('readerBody')?.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(saveReadingPosition, 500);
    }, { passive: true });
    window.addEventListener('scroll', () => {
        if (window.location.hash === '#reader') {
            clearTimeout(scrollTimer);
            scrollTimer = setTimeout(saveReadingPosition, 500);
        }
    }, { passive: true });
}

function applyReaderFontSize(size) {
    const body = document.getElementById('readerBody');
    if (body) body.style.fontSize = size + 'rem';
    localStorage.setItem('aleph-font-size', size.toString());
}

function saveReadingPosition() {
    if (!state.reader.bookId) return;
    const textId = `${state.reader.bookId}_${state.reader.lang}`;
    const body = document.getElementById('readerBody');
    const paras = body?.querySelectorAll('.reader-para');
    if (!paras?.length) return;

    // Find first visible paragraph
    const viewTop = window.scrollY;
    for (const p of paras) {
        const rect = p.getBoundingClientRect();
        if (rect.top >= 0 || rect.bottom > 100) {
            const pos = { para: p.id, scroll: window.scrollY };
            const positions = JSON.parse(localStorage.getItem('aleph-positions') || '{}');
            positions[textId] = pos;
            localStorage.setItem('aleph-positions', JSON.stringify(positions));
            break;
        }
    }
}

function restoreReadingPosition() {
    if (!state.reader.bookId) return;
    const textId = `${state.reader.bookId}_${state.reader.lang}`;
    const positions = JSON.parse(localStorage.getItem('aleph-positions') || '{}');
    const pos = positions[textId];
    if (pos?.para) {
        setTimeout(() => {
            const el = document.getElementById(pos.para);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

function trackRecentlyRead(bookId) {
    const recent = JSON.parse(localStorage.getItem('aleph-recent') || '[]');
    const filtered = recent.filter(id => id !== bookId);
    filtered.unshift(bookId);
    localStorage.setItem('aleph-recent', JSON.stringify(filtered.slice(0, 10)));
}

async function openReader(bookId, opts = {}) {
    const book = state.bookIndex[bookId];
    if (!book) return;

    state.reader.bookId = bookId;
    state.reader.lang = opts.lang || book.lang;
    state.reader.query = opts.query || '';
    state.reader.previousPage = opts.from || (window.location.hash.slice(1) || 'browse');

    const searchInput = document.getElementById('readerSearchInput');
    if (searchInput) searchInput.value = state.reader.query;

    trackRecentlyRead(bookId);
    renderReaderShell(book);
    navigateTo('reader');

    // Restore font size
    const fontSize = parseFloat(localStorage.getItem('aleph-font-size') || '1.1');
    applyReaderFontSize(fontSize);

    // Check for paragraph hash (permalink)
    const paraMatch = window.location.hash.match(/para-(\d+)/);
    if (paraMatch) {
        opts.scrollToPara = `para-${paraMatch[1]}`;
    }

    await loadReaderText();

    // Restore position or scroll to paragraph
    if (opts.scrollToPara) {
        setTimeout(() => {
            const el = document.getElementById(opts.scrollToPara);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else if (!opts.query) {
        restoreReadingPosition();
    } else {
        window.scrollTo(0, 0);
    }
}
window.openReader = openReader;

function renderReaderShell(book) {
    document.getElementById('readerCode').textContent = book.code;
    document.getElementById('readerYear').textContent = book.year || '—';
    document.getElementById('readerTitle').textContent = book.title;
    document.getElementById('readerAuthor').textContent = book.author;
    document.getElementById('readerLang').textContent = state.reader.lang.toUpperCase();

    const langSwitch = document.getElementById('readerLangSwitch');
    if (langSwitch) {
        langSwitch.innerHTML = book.langs.length > 1 ? book.langs.map(l => `
            <button class="reader-lang-btn${l === state.reader.lang ? ' active' : ''}" data-lang="${l}" onclick="openReader('${book.id}', {lang: '${l}', from: '${state.reader.previousPage}'})">${l.toUpperCase()}</button>
        `).join('') : '';
    }

    const external = document.getElementById('readerExternal');
    if (external) {
        const url = externalUrlFor(book, state.reader.lang);
        if (url) {
            external.href = url;
            external.style.display = '';
        } else {
            external.style.display = 'none';
        }
    }
}

async function loadReaderText() {
    const body = document.getElementById('readerBody');
    if (!body) return;
    body.innerHTML = '<p class="reader-loading">Chargement…</p>';
    state.reader.text = null;

    const book = state.bookIndex[state.reader.bookId];
    if (!book) return;
    const textId = `${book.id}_${state.reader.lang}`;
    const expectedId = textId;

    try {
        const data = await loadTextContent(textId);
        if (`${state.reader.bookId}_${state.reader.lang}` !== expectedId) return;
        state.reader.text = data;
        updateExternalLink(book, data);
        renderReaderBody();
    } catch (err) {
        if (`${state.reader.bookId}_${state.reader.lang}` !== expectedId) return;
        const url = externalUrlFor(book, state.reader.lang);
        body.innerHTML = `
            <div class="reader-unavailable">
                <p>Le texte intégral n'est pas disponible localement pour cette langue.</p>
                ${url ? `<p><a class="reader-external-link" href="${url}" target="_blank" rel="noopener">Consulter la source originale ↗</a></p>` : ''}
                <p class="reader-detail">Identifiant manquant : <code>${escapeHtml(textId)}</code></p>
            </div>
        `;
    }
}

function updateExternalLink(book, textData) {
    const external = document.getElementById('readerExternal');
    if (!external) return;
    let url = null;
    if (textData) {
        if (textData.source === 'gutenberg' && textData.gutenberg_id) {
            url = `https://www.gutenberg.org/ebooks/${textData.gutenberg_id}`;
        } else if (textData.source === 'eurlex' && book.celex) {
            url = `https://eur-lex.europa.eu/legal-content/${state.reader.lang.toUpperCase()}/TXT/?uri=CELEX:${book.celex}`;
        } else if (textData.source_url) {
            url = textData.source_url;
        }
    }
    if (!url) url = externalUrlFor(book, state.reader.lang);
    if (url) {
        external.href = url;
        external.style.display = '';
    } else {
        external.style.display = 'none';
    }
}

function renderReaderBody() {
    const body = document.getElementById('readerBody');
    const meta = document.getElementById('readerSearchMeta');
    if (!body || !state.reader.text) return;

    const content = state.reader.text.content || '';
    const query = (state.reader.query || '').trim();

    const paragraphs = content
        .replace(/\r\n/g, '\n')
        .split(/\n{2,}/)
        .map(p => p.trim())
        .filter(Boolean);

    let html = '';
    let totalHits = 0;

    if (query && query.length >= 2) {
        const rx = new RegExp(`(${escapeRegex(query)})`, 'gi');
        paragraphs.forEach((p, i) => {
            const matches = p.match(rx);
            if (!matches) return;
            totalHits += matches.length;
            const highlighted = escapeHtml(p).replace(rx, '<mark>$1</mark>');
            html += `<p class="reader-para reader-match" id="para-${i}" data-i="${i + 1}">${highlighted}</p>`;
        });
        if (!html) {
            html = `<p class="reader-empty-search">Aucune occurrence pour <em>${escapeHtml(query)}</em>.</p>`;
        }
        if (meta) meta.textContent = totalHits ? `${totalHits} occurrence${totalHits > 1 ? 's' : ''} dans ${html.match(/class="reader-para/g)?.length || 0} paragraphe${totalHits > 1 ? 's' : ''}` : '';
    } else {
        html = paragraphs.map((p, i) => {
            const noteKey = `${state.reader.bookId}_${state.reader.lang}_${i}`;
            const hasNote = getUserNote(noteKey);
            return `<p class="reader-para ${hasNote ? 'has-note' : ''}" id="para-${i}" data-i="${i + 1}">
                ${escapeHtml(p)}
                <span class="para-actions">
                    <button class="para-note ${hasNote ? 'active' : ''}" data-para="${i}" title="Ajouter une note">✎</button>
                    <button class="para-share" data-para="${i}" title="Copier le lien">§</button>
                </span>
                ${hasNote ? `<span class="para-note-preview">${escapeHtml(hasNote.substring(0, 100))}${hasNote.length > 100 ? '…' : ''}</span>` : ''}
            </p>`;
        }).join('');
        if (meta) meta.textContent = `${paragraphs.length} paragraphes · ${state.reader.text.char_count || content.length} caractères`;
    }

    body.innerHTML = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// USER NOTES
// ─────────────────────────────────────────────────────────────────────────────
function getUserNote(key) {
    const notes = JSON.parse(localStorage.getItem('aleph-notes') || '{}');
    return notes[key] || null;
}

function saveUserNote(key, text) {
    const notes = JSON.parse(localStorage.getItem('aleph-notes') || '{}');
    if (text && text.trim()) {
        notes[key] = text.trim();
    } else {
        delete notes[key];
    }
    localStorage.setItem('aleph-notes', JSON.stringify(notes));
}

function openNoteEditor(paraIdx) {
    const noteKey = `${state.reader.bookId}_${state.reader.lang}_${paraIdx}`;
    const existingNote = getUserNote(noteKey);

    // Create modal if it doesn't exist
    let modal = document.getElementById('noteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'noteModal';
        modal.className = 'note-modal-overlay';
        modal.innerHTML = `
            <div class="note-modal">
                <div class="note-modal-header">
                    <h3>Note — Paragraphe <span id="noteParaNum"></span></h3>
                    <button class="note-modal-close" onclick="closeNoteEditor()">×</button>
                </div>
                <textarea id="noteTextarea" class="note-textarea" placeholder="Écrivez votre note..."></textarea>
                <div class="note-modal-actions">
                    <button class="note-btn note-btn-delete" onclick="deleteNote()">Supprimer</button>
                    <button class="note-btn note-btn-save" onclick="saveNote()">Enregistrer</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Populate
    document.getElementById('noteParaNum').textContent = parseInt(paraIdx) + 1;
    document.getElementById('noteTextarea').value = existingNote || '';
    state.currentNoteKey = noteKey;
    state.currentNotePara = paraIdx;

    modal.classList.add('active');
    document.getElementById('noteTextarea').focus();
}

function closeNoteEditor() {
    const modal = document.getElementById('noteModal');
    if (modal) modal.classList.remove('active');
}

function saveNote() {
    const text = document.getElementById('noteTextarea').value;
    saveUserNote(state.currentNoteKey, text);
    closeNoteEditor();
    renderReaderBody();
}
window.saveNote = saveNote;

function deleteNote() {
    saveUserNote(state.currentNoteKey, null);
    closeNoteEditor();
    renderReaderBody();
}
window.deleteNote = deleteNote;

window.closeNoteEditor = closeNoteEditor;

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH PAGE — full-text concordance across all texts
// ─────────────────────────────────────────────────────────────────────────────
function setupSearchPage() {
    const input = document.getElementById('fulltextInput');
    const corpusCount = document.getElementById('searchCorpusCount');

    if (corpusCount) corpusCount.textContent = '146';

    let debounceTimer = null;
    input?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runFulltextSearch(input.value), 200);
    });

    document.querySelectorAll('.search-empty [data-suggest]').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const q = a.dataset.suggest;
            if (input) {
                input.value = q;
                runFulltextSearch(q);
            }
        });
    });
}

async function runFulltextSearch(query) {
    const results = document.getElementById('searchResults');
    const meta = document.getElementById('searchMeta');
    if (!results) return;

    const q = (query || '').trim();
    if (q.length < 3) {
        if (meta) meta.textContent = '';
        results.innerHTML = `
            <div class="search-empty">
                <p>Tapez au moins trois caractères pour commencer.</p>
                <p class="search-hint">Suggestions : <a href="#" data-suggest="virtue">virtue</a> · <a href="#" data-suggest="justice">justice</a> · <a href="#" data-suggest="natura">natura</a> · <a href="#" data-suggest="dharma">dharma</a> · <a href="#" data-suggest="république">république</a></p>
            </div>
        `;
        document.querySelectorAll('.search-empty [data-suggest]').forEach(a => {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('fulltextInput').value = a.dataset.suggest;
                runFulltextSearch(a.dataset.suggest);
            });
        });
        return;
    }

    if (meta) meta.textContent = 'Chargement de l\'index…';
    results.innerHTML = '<div class="search-loading">⋯</div>';

    try {
        await ensureSearchIndex();
    } catch (err) {
        results.innerHTML = `<div class="search-empty"><p>Impossible de charger l'index. ${escapeHtml(String(err))}</p></div>`;
        return;
    }

    const hits = alephSearch(q, 30);

    if (!hits.length) {
        if (meta) meta.textContent = '0 résultats';
        results.innerHTML = `<div class="search-empty"><p>Aucun texte ne contient <em>${escapeHtml(q)}</em>.</p></div>`;
        return;
    }

    if (meta) meta.textContent = `${hits.length} texte${hits.length > 1 ? 's' : ''} contiennent ${q}`;

    const html = await Promise.all(hits.map(async (hit, i) => {
        const parts = hit.id.split('_');
        const lang = parts[parts.length - 1];
        const bookId = parts.slice(0, -1).join('_');
        const book = state.bookIndex[bookId];
        const snippet = await buildSnippet(hit, q);

        const title = book?.title || hit.title || hit.id;
        const author = book?.author || hit.author || '';

        return `
            <article class="search-result" data-book="${escapeHtml(bookId)}" data-lang="${escapeHtml(lang)}" data-query="${escapeHtml(q)}">
                <header class="sr-head">
                    <h3 class="sr-title">${escapeHtml(title)}</h3>
                    <span class="sr-meta">${escapeHtml(author)} · ${lang.toUpperCase()} · ${hit.hits} occurrence${hit.hits > 1 ? 's' : ''}</span>
                </header>
                <p class="sr-snippet">${snippet}</p>
            </article>
        `;
    }));

    results.innerHTML = html.join('');

    results.querySelectorAll('.search-result').forEach(el => {
        el.addEventListener('click', () => {
            openReader(el.dataset.book, { lang: el.dataset.lang, query: el.dataset.query, from: 'search' });
        });
    });
}

async function buildSnippet(hit, query) {
    try {
        const data = await loadTextContent(hit.id);
        const content = data.content || '';
        const rx = new RegExp(escapeRegex(query), 'gi');
        const match = rx.exec(content);
        if (!match) return escapeHtml((hit.snippet || '').slice(0, 200) + '…');
        const start = Math.max(0, match.index - 80);
        const end = Math.min(content.length, match.index + query.length + 120);
        let excerpt = content.slice(start, end).replace(/\s+/g, ' ').trim();
        if (start > 0) excerpt = '…' + excerpt;
        if (end < content.length) excerpt = excerpt + '…';
        return escapeHtml(excerpt).replace(new RegExp(`(${escapeRegex(query)})`, 'gi'), '<mark>$1</mark>');
    } catch {
        return escapeHtml((hit.snippet || '').slice(0, 200) + '…');
    }
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
