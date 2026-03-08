// aleph - universal catalog
// Client-side search and browsing

const DB_NAME = 'aleph_library';
const STORE_NAME = 'texts';
let db = null;

const library = {
    books: [],
    userBooks: [],
    loaded: false,
    textCache: {},
    graph: null
};

// Favorites & Reading Progress (localStorage)
const userPrefs = {
    favorites: JSON.parse(localStorage.getItem('aleph_favorites') || '[]'),
    readingProgress: JSON.parse(localStorage.getItem('aleph_progress') || '{}'),
    darkMode: localStorage.getItem('aleph_dark') === 'true'
};

function saveFavorites() {
    localStorage.setItem('aleph_favorites', JSON.stringify(userPrefs.favorites));
}

function saveProgress() {
    localStorage.setItem('aleph_progress', JSON.stringify(userPrefs.readingProgress));
}

function isFavorite(bookId) {
    return userPrefs.favorites.includes(String(bookId));
}

function toggleFavorite(bookId) {
    const id = String(bookId);
    const idx = userPrefs.favorites.indexOf(id);
    if (idx > -1) {
        userPrefs.favorites.splice(idx, 1);
    } else {
        userPrefs.favorites.push(id);
    }
    saveFavorites();
    return isFavorite(id);
}
window.toggleFavorite = toggleFavorite;

function setReadingProgress(bookId, progress) {
    userPrefs.readingProgress[String(bookId)] = progress;
    saveProgress();
}

function getReadingProgress(bookId) {
    return userPrefs.readingProgress[String(bookId)] || 0;
}

// Dark mode toggle
function initDarkMode() {
    if (localStorage.getItem('aleph_dark') === 'true') {
        document.body.classList.add('dark-mode');
    }
    updateThemeButton();
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('aleph_dark', isDark);
    updateThemeButton();
}
window.toggleTheme = toggleTheme;

function updateThemeButton() {
    const btn = document.querySelector('.theme-toggle-fixed');
    if (btn) {
        btn.textContent = document.body.classList.contains('dark-mode') ? '○' : '●';
    }
}

// Initialize dark mode immediately
initDarkMode();

// IndexedDB
async function openDB() {
    if (db) return db;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { db = req.result; resolve(db); };
        req.onupgradeneeded = e => {
            const store = e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('title', 'title');
            store.createIndex('author', 'author');
        };
    });
}

async function loadUserBooks() {
    try {
        await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE_NAME], 'readonly');
            const req = tx.objectStore(STORE_NAME).getAll();
            req.onsuccess = () => {
                library.userBooks = (req.result || []).map(b => ({
                    ...b,
                    id: 'user_' + b.id,
                    source: 'local',
                    isUserBook: true
                }));
                resolve(library.userBooks);
            };
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        library.userBooks = [];
        return [];
    }
}

async function loadUserBookText(bookId) {
    const id = parseInt(String(bookId).replace('user_', ''));
    try {
        await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        return null;
    }
}

async function loadLibrary() {
    if (library.loaded) return;
    library.loaded = true;  // Set immediately to prevent race condition

    // Load shared library (published via GitHub)
    try {
        const resp = await fetch('data/shared-library.json');
        if (resp.ok) {
            const data = await resp.json();
            const books = (data.books || []).map(b => ({ ...b, id: 'shared_' + b.id, source: 'shared' }));
            library.books = books;
            (data.texts || []).forEach(t => {
                library.textCache['shared_' + t.id] = { content: t.content };
            });
        }
    } catch (e) {}

    // Load main library index
    try {
        const resp = await fetch('data/library-index.json');
        if (resp.ok) {
            const data = await resp.json();
            library.books = [...library.books, ...(data.books || [])];
            if (data.graph) library.graph = data.graph;
        }
    } catch (e) {}

    // Load corpus manifest documents into browse library
    try {
        const resp = await fetch('data/corpus-manifest.json');
        if (resp.ok) {
            const data = await resp.json();
            bookViewState.corpus = data;
            const corpusBooks = [];
            if (data.corpus) {
                for (const [catKey, category] of Object.entries(data.corpus)) {
                    const type = catKey.startsWith('legal')       ? 'droit'
                        : catKey.startsWith('business_economics') ? 'économie'
                        : catKey.startsWith('business')           ? 'gestion'
                        : catKey.startsWith('philosophy')         ? 'philosophie'
                        : catKey.startsWith('literature')         ? 'littérature'
                        : catKey.startsWith('science')            ? 'sciences'
                        : catKey.startsWith('history')            ? 'histoire'
                        : catKey.startsWith('sacred')             ? 'textes sacrés'
                        : 'autre';
                    (category.documents || []).forEach(doc => {
                        const langs = Object.keys(doc.languages || {});
                        const yearStr = doc.year ? ` (${doc.year})` : '';
                        corpusBooks.push({
                            id: 'corpus_' + doc.id,
                            corpusId: doc.id,
                            title: doc.title,
                            author: doc.author || '',
                            period: doc.period || '',
                            year: doc.year || null,
                            tags: doc.tags || [],
                            source: category.name,
                            type,
                            snippet: `${category.name}${yearStr}. Disponible en : ${langs.join(', ')}.`,
                            isCorpus: true
                        });
                    });
                }
            }
            library.books = [...library.books, ...corpusBooks];
        }
    } catch (e) {}

    // Load texts (for full text search)
    try {
        const resp = await fetch('data/library-texts.json');
        if (resp.ok) {
            const data = await resp.json();
            (data.texts || []).forEach(t => {
                library.textCache[t.id] = { content: t.content };
            });
        }
    } catch (e) {}

    await loadUserBooks();
    updateStats();
    populateFilters();
}

async function loadBookText(bookId) {
    if (library.textCache[bookId]) return library.textCache[bookId];
    if (String(bookId).startsWith('shared_')) return null;

    try {
        const resp = await fetch(`data/texts/${bookId}.json`);
        if (!resp.ok) return null;
        const book = await resp.json();
        library.textCache[bookId] = book;
        return book;
    } catch (e) {
        return null;
    }
}

function getAllBooks() {
    return [...library.books, ...library.userBooks];
}

function updateStats() {
    const all = getAllBooks();
    const bookCount = document.getElementById('book-count');
    const authorCount = document.getElementById('author-count');
    if (bookCount) bookCount.textContent = all.length;
    if (authorCount) authorCount.textContent = new Set(all.map(b => b.author)).size;
}

function populateFilters() {
    const all = getAllBooks();
    const types = TYPE_ORDER.filter(t => all.some(b => b.type === t));
    const filters = {
        'type-filter':   types,
        'author-filter': [...new Set(all.map(b => b.author).filter(Boolean))].sort(),
        'source-filter': [...new Set(all.map(b => b.source).filter(Boolean))].sort()
    };

    for (const [id, values] of Object.entries(filters)) {
        const el = document.getElementById(id);
        if (el) {
            while (el.options.length > 1) el.remove(1);
            values.forEach(v => el.add(new Option(v, v)));
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBookLink(book, query = '') {
    const q = query ? `&q=${encodeURIComponent(query)}` : '';
    if (book.isUserBook || String(book.id).startsWith('user_')) {
        return `book.html?user=${String(book.id).replace('user_', '')}${q}`;
    }
    if (book.isCorpus || String(book.id).startsWith('corpus_')) {
        const corpusId = book.corpusId || String(book.id).replace('corpus_', '');
        return `book.html?corpus=${corpusId}${q}`;
    }
    return `book.html?id=${book.id}${q}`;
}

// Search
function search(query, author = '', source = '') {
    if (!query.trim()) return [];
    const term = query.toLowerCase();
    const all = getAllBooks();

    let results = all.filter(b => {
        if (author && b.author !== author) return false;
        if (source && b.source !== source) return false;
        const text = `${b.title} ${b.author} ${b.snippet || ''}`.toLowerCase();
        return text.includes(term);
    });

    return results.slice(0, 100).map(b => ({
        ...b,
        highlightedSnippet: highlightSnippet(b.snippet || '', term)
    }));
}

function highlightSnippet(snippet, term) {
    if (!snippet) return '';
    const lower = snippet.toLowerCase();
    const idx = lower.indexOf(term);

    let text = snippet;
    if (idx !== -1) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(snippet.length, idx + term.length + 80);
        text = (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < snippet.length ? '...' : '');
    } else {
        text = snippet.slice(0, 200) + (snippet.length > 200 ? '...' : '');
    }

    return text.replace(new RegExp(`(${escapeRegex(term)})`, 'gi'), '<mark>$1</mark>');
}

function showResults(results, query) {
    const div = document.getElementById('results');
    if (!div) return;

    if (results.length === 0) {
        div.innerHTML = `<div class="no-results">aucun résultat pour « ${escapeHtml(query)} »</div>`;
        return;
    }

    div.innerHTML = `
        <div class="results-header"><h3>${results.length} résultat${results.length !== 1 ? 's' : ''} pour « ${escapeHtml(query)} »</h3></div>
        ${results.map(b => `
            <div class="result-card">
                <div class="result-header">
                    <a href="${getBookLink(b, query)}" class="result-title">${escapeHtml(b.title)}</a>
                    <div class="result-author">${escapeHtml(b.author)}</div>
                </div>
                <div class="result-snippet">${b.highlightedSnippet}</div>
                <div class="result-meta">
                    <span class="result-source">${b.source}</span>
                    <a href="${getBookLink(b, query)}" class="read-more">lire</a>
                </div>
            </div>
        `).join('')}
    `;
}

// ── CORPUS SEARCH (index.html) ────────────────────────────────────────────────

let corpusIndex = null;
const corpusTextCache = {};

async function loadCorpusIndex() {
    if (corpusIndex) return corpusIndex;
    try {
        const resp = await fetch('corpus/index.json');
        if (resp.ok) {
            corpusIndex = await resp.json();
            return corpusIndex;
        }
    } catch (e) {}
    return null;
}

async function loadCorpusText(entry) {
    if (!entry.file) return null;
    if (corpusTextCache[entry.id]) return corpusTextCache[entry.id];
    try {
        const resp = await fetch(`corpus/${entry.file}`);
        if (!resp.ok) return null;
        const text = await resp.text();
        corpusTextCache[entry.id] = text;
        return text;
    } catch (e) {
        return null;
    }
}

function extractExcerpt(text, keyword) {
    const lower = text.toLowerCase();
    const term  = keyword.toLowerCase();
    const matchIdx = lower.indexOf(term);
    if (matchIdx === -1) return null;

    // Walk backward to find a sentence start
    let start = Math.max(0, matchIdx - 300);
    for (let i = matchIdx - 1; i >= start; i--) {
        if (('.!?'.includes(text[i])) && i + 1 < text.length && text[i + 1] === ' ') {
            start = i + 2;
            break;
        }
    }

    // Walk forward to capture 3-4 sentences after the match
    let end = matchIdx + term.length;
    let dots = 0;
    while (end < text.length && dots < 3 && (end - start) < 700) {
        if ('.!?'.includes(text[end])) dots++;
        end++;
    }

    let excerpt = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (start > 0) excerpt = '\u2026' + excerpt;
    if (end < text.length) excerpt += '\u2026';

    return escapeHtml(excerpt).replace(
        new RegExp('(' + escapeRegex(escapeHtml(keyword)) + ')', 'gi'),
        '<mark>$1</mark>'
    );
}

function fmtYear(y) {
    if (!y) return '';
    const n = parseInt(y, 10);
    return n < 0 ? Math.abs(n) + '\u202fBCE' : y;
}

const CAT_FR = {
    philosophy: 'philosophie', poetry: 'poésie', drama: 'théâtre', prose: 'prose',
    'non-western': 'non-occidental', portuguese: 'portugais', economics: 'économie',
    treaty: 'traité', case: 'jurisprudence', constitution: 'constitution',
    czech: 'tchèque', hungarian: 'hongrois', italian: 'italien', french: 'français',
    japanese: 'japonais', mitteleuropa: 'mitteleuropa',
    français: 'français', allemand: 'allemand', italien: 'italien'
};

function renderCorpusResult(r, query) {
    const e = r.entry;
    const year = e.year ? ` (${fmtYear(e.year)})` : '';
    const catLabel = CAT_FR[e.category] || e.category;
    const byline = `${escapeHtml(e.author)}${year} \u00b7 <em>${escapeHtml(catLabel)}</em>`;

    if (!e.file && e.url) {
        return `<div class="search-result">
            <div class="search-result-byline">${byline}</div>
            <div class="search-result-title">${escapeHtml(e.title)}</div>
            <div class="search-result-extern">\u2192 <a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">lire à la source externe \u2197</a> <span class="search-result-note">(référence uniquement \u2014 non stocké localement)</span></div>
        </div>`;
    }

    const href = `book.html?corpus=${e.id}&q=${encodeURIComponent(query)}`;
    return `<div class="search-result">
        <div class="search-result-byline">${byline}</div>
        <a href="${href}" class="search-result-title">${escapeHtml(e.title)}</a>
        ${r.excerpt ? `<div class="search-result-excerpt">${r.excerpt}</div>` : ''}
    </div>`;
}

function showCorpusResults(results, query, searchingMore = false) {
    const div = document.getElementById('results');
    if (!div) return;
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.style.display = 'none';

    let html = '';
    if (searchingMore) {
        html += `<div class="search-status">recherche en cours\u2026</div>`;
    }
    if (results.length === 0 && !searchingMore) {
        html += `<div class="no-results">aucun résultat pour \u00ab\u202f${escapeHtml(query)}\u202f\u00bb</div>`;
    } else {
        if (!searchingMore) {
            html += `<div class="results-header"><h3>${results.length} résultat${results.length !== 1 ? 's' : ''}</h3></div>`;
        }
        html += results.map(r => renderCorpusResult(r, query)).join('');
    }
    div.innerHTML = html;
}

async function doCorpusSearch(query, authorFilter, categoryFilter) {
    if (!corpusIndex || !query.trim()) return;

    const term = query.toLowerCase();
    let entries = corpusIndex.filter(e => {
        if (authorFilter && e.author !== authorFilter) return false;
        if (categoryFilter && e.category !== categoryFilter) return false;
        return true;
    });

    // Reference-only: match title/author only
    const refResults = entries
        .filter(e => !e.file && e.url)
        .filter(e => `${e.title} ${e.author}`.toLowerCase().includes(term))
        .map(e => ({ entry: e, excerpt: null }));

    const fileEntries = entries.filter(e => e.file);
    const fileResults = [];

    showCorpusResults(refResults, query, fileEntries.length > 0);

    const BATCH = 6;
    for (let i = 0; i < fileEntries.length; i += BATCH) {
        const batch = fileEntries.slice(i, i + BATCH);
        const hits = await Promise.all(batch.map(async entry => {
            const text = await loadCorpusText(entry);
            if (!text) {
                // No local file yet: fall back to title/author match
                if (`${entry.title} ${entry.author}`.toLowerCase().includes(term)) {
                    return { entry, excerpt: null };
                }
                return null;
            }
            const excerpt = extractExcerpt(text, query);
            const titleMatch = `${entry.title} ${entry.author}`.toLowerCase().includes(term);
            if (!excerpt && !titleMatch) return null;
            return { entry, excerpt };
        }));
        for (const h of hits) {
            if (h) fileResults.push(h);
        }
        const remaining = fileEntries.length - i - BATCH;
        showCorpusResults([...refResults, ...fileResults], query, remaining > 0);
    }

    showCorpusResults([...refResults, ...fileResults], query, false);
}

// Init search page
document.addEventListener('DOMContentLoaded', async () => {
    // Apply saved dark mode
    if (localStorage.getItem('aleph_dark') === 'true') {
        document.body.classList.add('dark-mode');
    }
    updateThemeButton();

    // Only run on the search page (index.html)
    const input = document.getElementById('search-input');
    if (!input) return;

    // Load corpus index
    await loadCorpusIndex();

    // URL-based search state
    function updateURL(query) {
        const url = new URL(window.location);
        query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
        window.history.replaceState({}, '', url);
    }

    // Read ?q= on load
    const urlParams = new URLSearchParams(window.location.search);
    const urlQuery = urlParams.get('q');
    if (urlQuery) {
        input.value = urlQuery;
        doCorpusSearch(urlQuery, '', '');
    }

    // Populate stats
    if (corpusIndex) {
        const bookCount   = document.getElementById('book-count');
        const authorCount = document.getElementById('author-count');
        if (bookCount)   bookCount.textContent   = corpusIndex.length;
        if (authorCount) authorCount.textContent = new Set(corpusIndex.map(e => e.author)).size;
    }

    // Search handler - no filters, just query
    const doSearch = () => {
        const q = input.value.trim();
        if (!q) return;
        updateURL(q);
        doCorpusSearch(q, '', '');
    };

    input.addEventListener('keypress', e => e.key === 'Enter' && doSearch());

    // Keyboard shortcuts: / to focus search, Escape to blur
    document.addEventListener('keydown', e => {
        if (e.key === '/' && document.activeElement !== input) {
            e.preventDefault();
            input.focus();
        }
        if (e.key === 'Escape' && document.activeElement === input) {
            input.blur();
        }
    });

    // Seed term clicks
    document.querySelectorAll('.quick-search').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const q = link.dataset.query;
            input.value = q;
            updateURL(q);
            doCorpusSearch(q, '', '');
        });
    });
});

// Browse page
let browsePage = 1;
const perPage = 20;

function initBrowse() {
    loadLibrary().then(() => {
        renderStats();
        renderList();

        ['author-filter', 'source-filter', 'type-filter', 'fav-filter', 'sort-filter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => { browsePage = 1; renderList(); });
        });

    });
}

function renderStats() {
    const all = getAllBooks();
    const totalBooks = document.getElementById('total-books');
    const totalSources = document.getElementById('total-sources');

    if (totalBooks) totalBooks.textContent = all.length;

    const sources = {};
    all.forEach(b => sources[b.source] = (sources[b.source] || 0) + 1);

    if (totalSources) totalSources.textContent = Object.keys(sources).length;
}

function filterBySource(source) {
    const el = document.getElementById('source-filter');
    if (el) { el.value = source; browsePage = 1; renderList(); }
}
window.filterBySource = filterBySource;

function filterByTag(tag) {
    const el = document.getElementById('browse-search');
    if (el) { el.value = tag; browsePage = 1; renderList(); }
}
window.filterByTag = filterByTag;

// Type display order and labels for grouped view
const TYPE_ORDER = ['droit', 'économie', 'gestion', 'philosophie', 'littérature', 'sciences', 'histoire', 'textes sacrés', 'autre'];

function renderList() {
    const listDiv = document.getElementById('book-list');
    const pagDiv = document.getElementById('pagination');
    if (!listDiv) return;

    const authorF = document.getElementById('author-filter')?.value || '';
    const sourceF = document.getElementById('source-filter')?.value || '';
    const typeF   = document.getElementById('type-filter')?.value || '';
    const favF    = document.getElementById('fav-filter')?.value || '';
    const sortBy  = document.getElementById('sort-filter')?.value || 'title';

    let books = getAllBooks();
    if (authorF) books = books.filter(b => b.author === authorF);
    if (sourceF) books = books.filter(b => b.source === sourceF);
    if (typeF)   books = books.filter(b => b.type === typeF);
    if (favF === 'favorites') books = books.filter(b => isFavorite(b.id));
    books.sort((a, b) => (a[sortBy] || '').localeCompare(b[sortBy] || ''));

    const total = Math.ceil(books.length / perPage);
    const page  = books.slice((browsePage - 1) * perPage, browsePage * perPage);

    if (page.length === 0) {
        listDiv.innerHTML = '<div class="no-books">no texts found</div>';
        if (pagDiv) pagDiv.innerHTML = '';
        return;
    }

    listDiv.innerHTML = page.map(b => `
            <div class="search-result">
                <div class="search-result-byline">
                    ${escapeHtml(b.author)} · ${b.type || 'text'} · ${b.source}
                    <button class="fav-btn ${isFavorite(b.id) ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavBtn(this, '${b.id}')" title="Add to favorites">★</button>
                </div>
                <a href="${getBookLink(b)}" class="search-result-title">${escapeHtml(b.title)}</a>
                ${b.snippet ? `<div class="search-result-excerpt">${escapeHtml((b.snippet || '').slice(0, 200))}${b.snippet?.length > 200 ? '...' : ''}</div>` : ''}
            </div>
        `).join('');

    if (pagDiv && total > 1) {
        pagDiv.innerHTML = `
            ${browsePage > 1 ? `<a href="#" onclick="gotoPage(${browsePage - 1}); return false;">prev</a>` : ''}
            <span class="current">page ${browsePage} of ${total}</span>
            ${browsePage < total ? `<a href="#" onclick="gotoPage(${browsePage + 1}); return false;">next</a>` : ''}
        `;
    } else if (pagDiv) {
        pagDiv.innerHTML = `<span class="current">${books.length} texts</span>`;
    }
}

function gotoPage(p) {
    browsePage = p;
    renderList();
    window.scrollTo(0, 0);
}
window.gotoPage = gotoPage;

function toggleFavBtn(btn, bookId) {
    const isNowFav = toggleFavorite(bookId);
    btn.classList.toggle('active', isNowFav);
}
window.toggleFavBtn = toggleFavBtn;

// Get related books using graph or shared tags
function getRelatedBooks(book) {
    if (!book) return [];
    const all = getAllBooks();
    const related = [];

    // Use relationship graph if available
    if (library.graph?.edges) {
        const edges = library.graph.edges.filter(e =>
            e.source === book.id || e.target === book.id
        );
        for (const edge of edges) {
            const otherId = edge.source === book.id ? edge.target : edge.source;
            const other = all.find(b => b.id === otherId);
            if (other && !related.find(r => r.id === other.id)) {
                related.push({ ...other, relationship: edge.type });
            }
        }
    }

    // Also find by shared tags
    if (book.tags?.length && related.length < 5) {
        const byTags = all.filter(b =>
            b.id !== book.id &&
            !related.find(r => r.id === b.id) &&
            b.tags?.some(t => book.tags.includes(t))
        ).slice(0, 5 - related.length);
        related.push(...byTags);
    }

    // Also find by same author
    if (related.length < 5) {
        const byAuthor = all.filter(b =>
            b.id !== book.id &&
            b.author === book.author &&
            !related.find(r => r.id === b.id)
        ).slice(0, 5 - related.length);
        related.push(...byAuthor);
    }

    return related.slice(0, 5);
}

// Language names for display
const LANG_NAMES = {
    en: 'English', fr: 'Français', de: 'Deutsch', es: 'Español',
    it: 'Italiano', pt: 'Português', nl: 'Nederlands', pl: 'Polski',
    ru: 'Русский', grc: 'Ἑλληνικά', la: 'Latina', he: 'עברית',
    ar: 'العربية', zh: '中文', sa: 'संस्कृत', ja: '日本語',
    ko: '한국어', pi: 'Pāli', akk: 'Akkadian'
};

// Book view state
const bookViewState = {
    book: null,
    languages: {},
    selectedLangs: [],
    viewMode: 'single',
    corpus: null
};

// Load corpus manifest
async function loadCorpus() {
    if (bookViewState.corpus) return bookViewState.corpus;
    try {
        const resp = await fetch('data/corpus-manifest.json');
        if (resp.ok) {
            bookViewState.corpus = await resp.json();
            return bookViewState.corpus;
        }
    } catch (e) {}
    return null;
}

// Find document in corpus by ID
function findInCorpus(docId) {
    const corpus = bookViewState.corpus;
    if (!corpus?.corpus) return null;

    for (const category of Object.values(corpus.corpus)) {
        const doc = category.documents?.find(d => d.id === docId);
        if (doc) return { ...doc, category: category.name };
    }
    return null;
}

// Book view
async function initBookView() {
    await loadLibrary();
    await loadCorpus();

    const params = new URLSearchParams(location.search);
    const userId = params.get('user');
    const bookId = params.get('id');
    const corpusId = params.get('corpus');
    const query = params.get('q');
    const lang = params.get('lang') || 'en';

    const contentDiv = document.getElementById('book-content');
    const headerDiv = document.getElementById('book-header');
    const titleEl = document.getElementById('book-title');
    const authorEl = document.getElementById('book-author');
    const tagsEl = document.getElementById('book-tags');
    const langControls = document.getElementById('language-controls');
    const viewToggle = document.getElementById('view-toggle');

    let book = null;
    let corpusDoc = null;

    // Check if it's a corpus document (multilingual)
    if (corpusId) {
        corpusDoc = findInCorpus(corpusId);
        if (corpusDoc) {
            book = {
                id: corpusId,
                title: corpusDoc.title,
                author: corpusDoc.author,
                period: corpusDoc.period,
                tags: corpusDoc.tags,
                languages: corpusDoc.languages,
                isCorpus: true
            };
            bookViewState.languages = corpusDoc.languages || {};
            bookViewState.selectedLangs = [lang];
        }
    } else if (userId) {
        book = await loadUserBookText('user_' + userId);
    } else if (bookId) {
        const id = bookId.startsWith('shared_') ? bookId : parseInt(bookId);
        const indexBook = library.books.find(b => b.id === id);
        if (indexBook) {
            document.title = `aleph - ${indexBook.title}`;
        }
        book = await loadBookText(id);
    }

    if (!book) {
        contentDiv.innerHTML = '<div class="error">text not found</div>';
        return;
    }

    bookViewState.book = book;
    document.title = `aleph - ${book.title}`;

    // Update header
    if (titleEl) titleEl.textContent = book.title;
    if (authorEl) authorEl.textContent = book.author;
    if (tagsEl && book.tags?.length) {
        tagsEl.innerHTML = book.tags.map(t =>
            `<a href="browse.html?tag=${encodeURIComponent(t)}" class="tag">${escapeHtml(t)}</a>`
        ).join('');
    }

    // Corpus docs: just show external links — hide language selector and view toggle
    if (book.isCorpus) {
        if (langControls) langControls.classList.add('hidden');
        if (viewToggle) viewToggle.classList.add('hidden');
    // Local multilingual docs: show language selector and view toggle
    } else if (book.languages && Object.keys(book.languages).length > 1 && langControls) {
        const langs = Object.keys(book.languages);
        langControls.innerHTML = langs.map(l => `
            <button class="lang-btn ${bookViewState.selectedLangs.includes(l) ? 'selected' : ''}"
                    data-lang="${l}" onclick="toggleLanguage('${l}')">
                ${l.toUpperCase()}
                <span class="lang-name">${LANG_NAMES[l] || l}</span>
            </button>
        `).join('');
        langControls.classList.remove('hidden');

        if (viewToggle) {
            viewToggle.querySelectorAll('.view-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    viewToggle.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    bookViewState.viewMode = btn.dataset.view;
                    renderBookContent();
                });
            });
        }
    } else if (langControls) {
        langControls.classList.add('hidden');
        if (viewToggle) viewToggle.classList.add('hidden');
    }

    // Render content
    renderBookContent(query);
}

function toggleLanguage(lang) {
    const idx = bookViewState.selectedLangs.indexOf(lang);
    if (idx > -1) {
        if (bookViewState.selectedLangs.length > 1) {
            bookViewState.selectedLangs.splice(idx, 1);
        }
    } else {
        if (bookViewState.viewMode === 'single') {
            bookViewState.selectedLangs = [lang];
        } else {
            if (bookViewState.selectedLangs.length < 3) {
                bookViewState.selectedLangs.push(lang);
            }
        }
    }

    // Update button states
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('selected', bookViewState.selectedLangs.includes(btn.dataset.lang));
    });

    renderBookContent();
}
window.toggleLanguage = toggleLanguage;

function getSourceUrl(source, langInfo, lang, book) {
    const title = encodeURIComponent(langInfo.title || book.title);
    const sourceUrls = {
        gutenberg: langInfo.gutenberg_id
            ? `https://www.gutenberg.org/ebooks/${langInfo.gutenberg_id}`
            : `https://www.gutenberg.org/ebooks/search/?query=${title}`,
        eurlex: book.celex
            ? `https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/?uri=CELEX:${book.celex}`
            : `https://eur-lex.europa.eu`,
        wikisource: `https://${lang === 'grc' ? 'el' : lang}.wikisource.org/wiki/Special:Search?search=${title}`,
        perseus: `https://www.perseus.tufts.edu/hopper/search?q=${title}`,
        archive: `https://archive.org/search?query=${title}`,
        ctext: `https://ctext.org/search.pl?if=gb&search=${title}`,
        un: `https://www.un.org/en/search/index.html?q=${title}`,
        uncitral: `https://uncitral.un.org`,
        wto: `https://docs.wto.org`,
        sec: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=10-K`,
        echr: `https://hudoc.echr.coe.int`,
        icj: `https://www.icj-cij.org`,
        avalon: `https://avalon.law.yale.edu`,
        bis: `https://www.bis.org/basel_framework/`,
        'legislation.gov.uk': `https://www.legislation.gov.uk`,
        'ifrs.org': `https://www.ifrs.org/issued-standards/`,
        'fsb-tcfd.org': `https://www.fsb-tcfd.org/recommendations/`,
        worldbank: `https://icsid.worldbank.org`,
        'latin-library': `https://thelatinlibrary.com`,
        'constitution.org': `https://constitution.org`,
        'frc.org.uk': `https://www.frc.org.uk/library/standards-codes-policy/corporate-governance/`
    };
    return sourceUrls[source] || null;
}

function renderCorpusLinks(langs, book) {
    return langs.map(lang => {
        const langInfo = book.languages[lang] || {};
        const url = getSourceUrl(langInfo.source, langInfo, lang, book);
        const title = escapeHtml(langInfo.title || book.title);
        const sourceName = langInfo.source || 'unknown';
        return `
            <div class="corpus-lang-row">
                <span class="corpus-lang-label">${LANG_NAMES[lang] || lang.toUpperCase()}</span>
                <span class="corpus-lang-title">${title}</span>
                ${url
                    ? `<a href="${url}" target="_blank" class="corpus-source-link">${sourceName} ↗</a>`
                    : `<span class="corpus-source-label">${sourceName}</span>`}
            </div>
        `;
    }).join('');
}

async function renderBookContent(query = null) {
    const contentDiv = document.getElementById('book-content');
    const book = bookViewState.book;

    if (!book) return;

    // For corpus documents, show source links per language
    if (book.isCorpus && book.languages) {
        const allLangs = Object.keys(book.languages);
        const yearStr = book.period ? ` · ${book.period}${book.year ? ' (' + book.year + ')' : ''}` : '';
        contentDiv.className = 'book-content single-view';
        contentDiv.innerHTML = `
            <div class="corpus-links-view">
                <p class="corpus-note">
                    ${escapeHtml(book.title)}${yearStr}<br>
                    Texte non stocké localement — lire à la source :
                </p>
                <div class="corpus-lang-list">
                    ${renderCorpusLinks(allLangs, book)}
                </div>
                ${book.tags?.length ? `<div class="corpus-tags">${book.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            </div>
        `;
    } else if (book.isPdf && book.pdfData) {
        // PDF - render with PDF.js
        contentDiv.classList.add('hidden');
        const pdfContainer = document.getElementById('pdf-container');
        const pdfControls = document.getElementById('pdf-controls');
        if (pdfContainer) pdfContainer.classList.remove('hidden');
        if (pdfControls) pdfControls.classList.remove('hidden');

        initPdfViewer(book.pdfData, book.pageCount);
    } else {
        // Regular book (user uploaded or single language)
        // Check both direct content and content nested in languages
        let rawContent = book.content || (book.languages?.en?.content) || '';
        let content = escapeHtml(rawContent);
        if (query) {
            let first = true;
            content = content.replace(new RegExp(`(${escapeRegex(query)})`, 'gi'), (m) => {
                const id = first ? ' id="first-match"' : '';
                first = false;
                return `<span class="highlight"${id}>${m}</span>`;
            });
        }

        contentDiv.className = 'book-content single-view';
        contentDiv.innerHTML = `<div class="text-body">${content}</div>`;

        if (query) {
            setTimeout(() => {
                document.getElementById('first-match')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        } else {
            // Restore reading progress
            const savedProgress = getReadingProgress(book.id);
            if (savedProgress > 0) {
                setTimeout(() => {
                    window.scrollTo(0, savedProgress);
                }, 100);
            }
        }

        // Track reading progress on scroll
        initReadingProgressTracker(book.id);
    }
}

let progressDebounce = null;
function initReadingProgressTracker(bookId) {
    window.removeEventListener('scroll', window._progressHandler);
    window._progressHandler = () => {
        clearTimeout(progressDebounce);
        progressDebounce = setTimeout(() => {
            setReadingProgress(bookId, window.scrollY);
        }, 500);
    };
    window.addEventListener('scroll', window._progressHandler);
}

// PDF Viewer
const pdfState = {
    pdf: null,
    currentPage: 1,
    totalPages: 1,
    scale: 1.5,
    initialized: false
};

async function initPdfViewer(base64Data, pageCount) {
    if (typeof pdfjsLib === 'undefined') {
        console.error('PDF.js not loaded');
        return;
    }

    const pdfContainer = document.getElementById('pdf-container');
    pdfContainer.innerHTML = '<canvas id="pdf-canvas"></canvas><div class="pdf-loading">loading PDF...</div>';

    try {
        // Decode base64 to array buffer
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        pdfState.pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        pdfState.totalPages = pdfState.pdf.numPages;
        pdfState.currentPage = 1;

        // Remove loading indicator
        const loadingEl = pdfContainer.querySelector('.pdf-loading');
        if (loadingEl) loadingEl.remove();

        // Setup controls only once
        if (!pdfState.initialized) {
            document.getElementById('pdf-prev')?.addEventListener('click', () => changePage(-1));
            document.getElementById('pdf-next')?.addEventListener('click', () => changePage(1));
            document.getElementById('pdf-zoom-in')?.addEventListener('click', () => changeZoom(0.25));
            document.getElementById('pdf-zoom-out')?.addEventListener('click', () => changeZoom(-0.25));

            // Setup search
            const searchInput = document.getElementById('pdf-search');
            const searchBtn = document.getElementById('pdf-search-btn');
            if (searchInput && searchBtn) {
                searchBtn.addEventListener('click', () => searchPdf(searchInput.value));
                searchInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') searchPdf(searchInput.value);
                });
            }
            pdfState.initialized = true;
        }

        renderPdfPage();
    } catch (e) {
        console.error('PDF load error:', e);
        pdfContainer.innerHTML = '<div class="error">Failed to load PDF</div>';
    }
}

// Expose functions globally for button onclick
window.changePage = function(delta) {
    const newPage = pdfState.currentPage + delta;
    if (newPage >= 1 && newPage <= pdfState.totalPages) {
        pdfState.currentPage = newPage;
        renderPdfPage();
    }
};

window.changeZoom = function(delta) {
    const newScale = pdfState.scale + delta;
    if (newScale >= 0.5 && newScale <= 3) {
        pdfState.scale = newScale;
        renderPdfPage();
    }
};

function changePage(delta) { window.changePage(delta); }
function changeZoom(delta) { window.changeZoom(delta); }

async function renderPdfPage() {
    if (!pdfState.pdf) return;

    try {
        const page = await pdfState.pdf.getPage(pdfState.currentPage);
        const canvas = document.getElementById('pdf-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Adjust scale for mobile
        let scale = pdfState.scale;
        if (window.innerWidth < 600) {
            scale = Math.min(scale, (window.innerWidth - 40) / 612);
        }

        const viewport = page.getViewport({ scale });
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: ctx, viewport }).promise;

        // Update controls
        const pageInfo = document.getElementById('pdf-page-info');
        const zoomInfo = document.getElementById('pdf-zoom-info');
        if (pageInfo) pageInfo.textContent = `${pdfState.currentPage} / ${pdfState.totalPages}`;
        if (zoomInfo) zoomInfo.textContent = `${Math.round(pdfState.scale * 100)}%`;
    } catch (e) {
        console.error('Render error:', e);
    }
}

// PDF Search
const pdfSearchState = {
    query: '',
    matches: [], // {page, text, index}
    currentMatch: -1
};

async function searchPdf(query) {
    if (!pdfState.pdf || !query.trim()) return;

    pdfSearchState.query = query.toLowerCase();
    pdfSearchState.matches = [];
    pdfSearchState.currentMatch = -1;

    const resultsDiv = document.getElementById('pdf-search-results');

    // Search through all pages
    for (let i = 1; i <= pdfState.totalPages; i++) {
        const page = await pdfState.pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ');
        const lower = text.toLowerCase();

        let idx = 0;
        while ((idx = lower.indexOf(pdfSearchState.query, idx)) !== -1) {
            const context = text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + query.length + 20));
            pdfSearchState.matches.push({
                page: i,
                text: context,
                position: idx
            });
            idx += query.length;
        }
    }

    // Show results
    if (pdfSearchState.matches.length > 0) {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = `
            <div class="search-summary">${pdfSearchState.matches.length} correspondance${pdfSearchState.matches.length !== 1 ? 's' : ''} pour « ${escapeHtml(query)} »</div>
            <div class="match-list">
                ${pdfSearchState.matches.map((m, i) => `
                    <button class="pdf-match-btn" onclick="goToMatch(${i})">p.${m.page}</button>
                `).join('')}
            </div>
        `;
        goToMatch(0);
    } else {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = `<div class="search-summary">aucun résultat pour « ${escapeHtml(query)} »</div>`;
    }
}

async function goToMatch(index) {
    if (index < 0 || index >= pdfSearchState.matches.length) return;

    pdfSearchState.currentMatch = index;
    const match = pdfSearchState.matches[index];

    // Update button states
    document.querySelectorAll('.pdf-match-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    // Go to page
    if (pdfState.currentPage !== match.page) {
        pdfState.currentPage = match.page;
        await renderPdfPage();
    }

    // Highlight on canvas
    await highlightPdfMatches();
}
window.goToMatch = goToMatch;

async function highlightPdfMatches() {
    if (!pdfState.pdf || !pdfSearchState.query) return;

    const page = await pdfState.pdf.getPage(pdfState.currentPage);
    const content = await page.getTextContent();
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');

    // Re-render page first
    const viewport = page.getViewport({ scale: pdfState.scale });
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Find and highlight matches on current page
    const query = pdfSearchState.query;
    ctx.fillStyle = 'rgba(255, 243, 205, 0.6)';

    for (const item of content.items) {
        const text = item.str.toLowerCase();
        let idx = 0;
        while ((idx = text.indexOf(query, idx)) !== -1) {
            // Calculate position
            const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
            const x = tx[4] + (idx / item.str.length) * item.width * pdfState.scale;
            const width = (query.length / item.str.length) * item.width * pdfState.scale;
            const height = item.height * pdfState.scale;
            const y = tx[5] - height;

            ctx.fillRect(x, y, width, height);
            idx += query.length;
        }
    }
}

// Translation feature
const translateState = {
    selectedText: '',
    targetLang: 'pt',
    dismissed: false
};

function initTranslation() {
    const popup = document.getElementById('translate-popup');
    const langSelect = document.getElementById('translate-lang');
    const closeBtn = document.getElementById('translate-close');

    if (!popup) return;

    // Set default language
    if (langSelect) langSelect.value = 'pt';

    // Listen for text selection (with delay to avoid flickering)
    let selectionTimeout;
    document.addEventListener('mouseup', (e) => {
        // Don't trigger if clicking inside popup
        if (popup.contains(e.target)) return;

        clearTimeout(selectionTimeout);
        selectionTimeout = setTimeout(() => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (text && text.length > 2 && text.length < 500) {
                translateState.selectedText = text;
                translateState.dismissed = false;
                showTranslatePopup(text);
            }
        }, 300);
    });

    // Hide on click outside
    document.addEventListener('mousedown', (e) => {
        if (!popup.contains(e.target) && !popup.classList.contains('hidden')) {
            const selection = window.getSelection();
            if (!selection.toString().trim()) {
                popup.classList.add('hidden');
            }
        }
    });

    // Language change
    if (langSelect) {
        langSelect.addEventListener('change', () => {
            translateState.targetLang = langSelect.value;
            if (translateState.selectedText) {
                translateText(translateState.selectedText, translateState.targetLang);
            }
        });
    }

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            popup.classList.add('hidden');
            translateState.dismissed = true;
        });
    }
}

function showTranslatePopup(text) {
    if (translateState.dismissed) return;

    const popup = document.getElementById('translate-popup');
    const originalDiv = document.getElementById('translate-original');
    const resultDiv = document.getElementById('translate-result');

    if (!popup) return;

    popup.classList.remove('hidden');
    originalDiv.textContent = text.length > 100 ? text.slice(0, 100) + '...' : text;
    resultDiv.textContent = 'traduction en cours...';
    resultDiv.className = 'translate-result loading';

    translateText(text, translateState.targetLang);
}

async function translateText(text, targetLang) {
    const resultDiv = document.getElementById('translate-result');

    try {
        const sourceLang = detectLanguage(text);
        // Don't translate if same language
        if (sourceLang === targetLang) {
            resultDiv.textContent = text;
            resultDiv.className = 'translate-result';
            return;
        }

        const pair = `${sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${pair}`;

        const resp = await fetch(url);
        const data = await resp.json();

        if (data.responseStatus === 200 && data.responseData?.translatedText) {
            let result = data.responseData.translatedText;
            // Clean up common API artifacts
            result = result.replace(/MYMEMORY WARNING.*$/i, '').trim();
            resultDiv.textContent = result || text;
            resultDiv.className = 'translate-result';
        } else {
            throw new Error(data.responseDetails || 'failed');
        }
    } catch (e) {
        resultDiv.textContent = 'erreur : ' + e.message;
        resultDiv.className = 'translate-result error';
    }
}

function detectLanguage(text) {
    // Non-Latin scripts
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\u0600-\u06ff]/.test(text)) return 'ar';
    if (/[\u0400-\u04ff]/.test(text)) return 'ru';
    if (/[\u0370-\u03ff]/.test(text)) return 'el';
    if (/[\u0590-\u05ff]/.test(text)) return 'he';
    if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';

    // Latin scripts - check for language-specific patterns
    const lower = text.toLowerCase();

    // Portuguese indicators
    if (/\b(não|são|está|também|você|então|até|já|só|há|às|é)\b/.test(lower)) return 'pt';
    if (/[ãõ]/.test(lower)) return 'pt';

    // Spanish indicators
    if (/\b(está|pero|muy|tiene|años|también|puede|después)\b/.test(lower)) return 'es';
    if (/[ñ¿¡]/.test(lower)) return 'es';

    // French indicators
    if (/\b(est|sont|dans|avec|pour|cette|être|très|même)\b/.test(lower)) return 'fr';
    if (/[œæ]/.test(lower) || /\b(qu'|l'|d'|n'|c')\b/.test(lower)) return 'fr';

    // German indicators
    if (/\b(und|ist|das|die|der|nicht|sich|mit|auch)\b/.test(lower)) return 'de';
    if (/[äöüß]/.test(lower)) return 'de';

    // Italian indicators
    if (/\b(che|non|della|sono|questo|anche|essere|stato)\b/.test(lower)) return 'it';

    // English indicators
    if (/\b(the|and|that|have|for|not|with|you|this|but|from|they|would|there|their)\b/.test(lower)) return 'en';

    // Default
    return 'en';
}

// Initialize translation on page load
document.addEventListener('DOMContentLoaded', () => {
    initTranslation();
});
