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
    terms: [],
    favorites: JSON.parse(localStorage.getItem('aleph-favorites') || '[]'),
    filters: {
        lang: null,
        type: null,
        category: null
    },
    sort: 'year',
    selectedTerm: null,
    sourcesView: 'list'
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

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    updateFavoritesCount();
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────────────────────
async function loadData() {
    try {
        const [corpusRes, glossaryRes, refsRes] = await Promise.all([
            fetch('data/corpus-manifest.json'),
            fetch('data/glossary.json'),
            fetch('data/references.json')
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
        const pron = t.pronunciation ? `/${t.pronunciation}/` : '';
        const etymology = t.etymology ? `<div class="entry-etymology"><strong>Étymologie:</strong> ${escapeHtml(t.etymology)}</div>` : '';
        const usage = t.usage ? `<div class="entry-usage"><strong>Exemple:</strong> <em>${escapeHtml(t.usage)}</em></div>` : '';
        const related = t.related && t.related.length ? `
            <div class="entry-related">
                <strong>Voir aussi:</strong>
                ${t.related.map(r => `<a href="#" onclick="selectGlossaryTermByName('${escapeHtml(r)}'); return false;">${escapeHtml(r)}</a>`).join(', ')}
            </div>
        ` : '';

        return `
            <article class="glossary-entry" data-id="${t.id}" onclick="toggleGlossaryEntry(this)">
                <header class="glossary-entry-header">
                    <span class="glossary-dropcap">${firstLetter}</span>
                    <span class="glossary-term">${escapeHtml(t.term)}</span>
                    <span class="glossary-lang">${LANG_NAMES[t.lang] || t.lang}</span>
                    <span class="glossary-expand">+</span>
                </header>
                <div class="glossary-entry-body">
                    <div class="entry-meta">
                        ${cats.map(c => `<span class="entry-tag">${escapeHtml(c)}</span>`).join('')}
                        ${pron ? `<span class="entry-pron">${pron}</span>` : ''}
                    </div>
                    <p class="entry-definition">${escapeHtml(t.definition || '')}</p>
                    ${etymology}
                    ${usage}
                    ${related}
                </div>
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
    const entry = document.querySelector(`.glossary-entry[data-id="${id}"]`);
    if (entry) {
        toggleGlossaryEntry(entry);
        entry.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    networkState.expandedNodes.clear();
    networkState.nodePositions = {};

    const rect = container.getBoundingClientRect();
    networkState.width = rect.width || 800;
    networkState.height = Math.max(500, rect.height || 500);

    container.innerHTML = '';

    networkState.svg = d3.select(container)
        .append('svg')
        .attr('width', networkState.width)
        .attr('height', networkState.height)
        .attr('viewBox', `0 0 ${networkState.width} ${networkState.height}`);

    networkState.g = networkState.svg.append('g');

    const zoom = d3.zoom()
        .scaleExtent([0.2, 4])
        .on('zoom', e => networkState.g.attr('transform', e.transform));
    networkState.svg.call(zoom);

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
                if (sr >= 12 || tr >= 12) return 90;
                if (sr >= 8 || tr >= 8) return 55;
                return 30;
            })
            .strength(0.5))
        .force('charge', d3.forceManyBody().strength(d => -20 * nodeRadius(d)))
        .force('collide', d3.forceCollide().radius(d => nodeRadius(d) + 3).iterations(2))
        .force('x', d3.forceX(cx).strength(0.03))
        .force('y', d3.forceY(cy).strength(0.03))
        .alphaDecay(0.015)
        .velocityDecay(0.3);

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
        .attr('dx', d => nodeRadius(d) + 5)
        .style('font-size', d => d.depth === 0 ? '14px' : d.depth === 1 ? '11px' : d.depth === 2 ? '9px' : '8px')
        .style('fill', isDark ? '#d0c8b8' : '#5a4a3a')
        .style('opacity', d => d.depth <= 1 ? 1 : d.depth === 2 ? 0.7 : 0)
        .style('pointer-events', 'none')
        .style('font-family', 'var(--mono)')
        .text(d => d.label);

    node.on('mouseover', (event, d) => {
        if (d.depth >= 2) {
            labels.filter(l => l === d).style('opacity', 1);
        }
    }).on('mouseout', (event, d) => {
        if (d.depth >= 2) {
            labels.filter(l => l === d).style('opacity', d.depth === 2 ? 0.7 : 0);
        }
    });

    node.on('click', (e, d) => {
        e.stopPropagation();
        if (d.group === 'resource' && d.url) {
            window.open(d.url, '_blank');
        } else if (hasNetworkChildren(d.id)) {
            toggleNetworkNode(d.id);
        }
    });

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
