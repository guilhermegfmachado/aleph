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
    library.loaded = true;
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
    const filters = {
        'author-filter': [...new Set(all.map(b => b.author).filter(Boolean))].sort(),
        'source-filter': [...new Set(all.map(b => b.source).filter(Boolean))].sort(),
        'type-filter': [...new Set(all.map(b => b.type).filter(Boolean))].sort(),
        'period-filter': [...new Set(all.map(b => b.period).filter(Boolean))].sort()
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
        div.innerHTML = `<div class="no-results">no results for "${escapeHtml(query)}"</div>`;
        return;
    }

    div.innerHTML = `
        <div class="results-header"><h3>${results.length} results for "${escapeHtml(query)}"</h3></div>
        ${results.map(b => `
            <div class="result-card">
                <div class="result-header">
                    <a href="${getBookLink(b, query)}" class="result-title">${escapeHtml(b.title)}</a>
                    <div class="result-author">${escapeHtml(b.author)}</div>
                </div>
                <div class="result-snippet">${b.highlightedSnippet}</div>
                <div class="result-meta">
                    <span class="result-source">${b.source}</span>
                    <a href="${getBookLink(b, query)}" class="read-more">read</a>
                </div>
            </div>
        `).join('')}
    `;
}

// Init search page
document.addEventListener('DOMContentLoaded', async () => {
    await loadLibrary();

    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');
    const authorFilter = document.getElementById('author-filter');

    if (btn && input) {
        const doSearch = () => {
            const q = input.value.trim();
            if (!q) return;
            const results = search(q, authorFilter?.value || '');
            showResults(results, q);
        };

        btn.addEventListener('click', doSearch);
        input.addEventListener('keypress', e => e.key === 'Enter' && doSearch());
    }

    document.querySelectorAll('.quick-search').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const q = link.dataset.query;
            if (input) input.value = q;
            showResults(search(q), q);
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

        ['author-filter', 'source-filter', 'type-filter', 'period-filter', 'sort-filter', 'view-filter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => { browsePage = 1; renderList(); });
        });
    });
}

function renderStats() {
    const all = getAllBooks();
    const totalBooks = document.getElementById('total-books');
    const totalSources = document.getElementById('total-sources');
    const breakdown = document.getElementById('stats-breakdown');

    if (totalBooks) totalBooks.textContent = all.length;

    const sources = {};
    all.forEach(b => sources[b.source] = (sources[b.source] || 0) + 1);

    if (totalSources) totalSources.textContent = Object.keys(sources).length;

    if (breakdown) {
        breakdown.innerHTML = Object.entries(sources)
            .sort((a, b) => b[1] - a[1])
            .map(([s, n]) => `<span class="stat-item" onclick="filterBySource('${s}')">${s}: ${n}</span>`)
            .join('');
    }
}

function filterBySource(source) {
    const el = document.getElementById('source-filter');
    if (el) { el.value = source; browsePage = 1; renderList(); }
}
window.filterBySource = filterBySource;

function renderList() {
    const listDiv = document.getElementById('book-list');
    const pagDiv = document.getElementById('pagination');
    if (!listDiv) return;

    const authorF = document.getElementById('author-filter')?.value || '';
    const sourceF = document.getElementById('source-filter')?.value || '';
    const typeF = document.getElementById('type-filter')?.value || '';
    const periodF = document.getElementById('period-filter')?.value || '';
    const sortBy = document.getElementById('sort-filter')?.value || 'title';
    const compact = document.getElementById('view-filter')?.value === 'compact';

    let books = getAllBooks();
    if (authorF) books = books.filter(b => b.author === authorF);
    if (sourceF) books = books.filter(b => b.source === sourceF);
    if (typeF) books = books.filter(b => b.type === typeF);
    if (periodF) books = books.filter(b => b.period === periodF);
    books.sort((a, b) => (a[sortBy] || '').localeCompare(b[sortBy] || ''));

    const total = Math.ceil(books.length / perPage);
    const page = books.slice((browsePage - 1) * perPage, browsePage * perPage);

    if (page.length === 0) {
        listDiv.innerHTML = '<div class="no-books">no texts found</div>';
        if (pagDiv) pagDiv.innerHTML = '';
        return;
    }

    if (compact) {
        listDiv.innerHTML = `
            <table class="book-table">
                <thead><tr><th>Title</th><th>Author</th><th>Source</th></tr></thead>
                <tbody>
                    ${page.map(b => `
                        <tr>
                            <td><a href="${getBookLink(b)}">${escapeHtml(b.title)}</a></td>
                            <td>${escapeHtml(b.author)}</td>
                            <td>${b.source}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } else {
        listDiv.innerHTML = page.map(b => `
            <div class="book-card">
                <h3><a href="${getBookLink(b)}">${escapeHtml(b.title)}</a></h3>
                <div class="book-meta">${escapeHtml(b.author)} <span class="source">[${b.source}]</span></div>
                ${b.tags?.length ? `<div class="book-tags">${b.tags.slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
                <div class="book-snippet">${escapeHtml((b.snippet || '').slice(0, 150))}...</div>
            </div>
        `).join('');
    }

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
        tagsEl.innerHTML = book.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    }

    // Setup language controls for multilingual docs
    if (book.languages && Object.keys(book.languages).length > 1 && langControls) {
        const langs = Object.keys(book.languages);
        langControls.innerHTML = langs.map(l => `
            <button class="lang-btn ${bookViewState.selectedLangs.includes(l) ? 'selected' : ''}"
                    data-lang="${l}" onclick="toggleLanguage('${l}')">
                ${l.toUpperCase()}
                <span class="lang-name">${LANG_NAMES[l] || l}</span>
            </button>
        `).join('');
        langControls.classList.remove('hidden');

        // Setup view toggle
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

async function renderBookContent(query = null) {
    const contentDiv = document.getElementById('book-content');
    const book = bookViewState.book;

    if (!book) return;

    // For corpus documents, show language-specific content
    if (book.isCorpus && book.languages) {
        const langs = bookViewState.selectedLangs;

        if (bookViewState.viewMode === 'parallel' && langs.length > 1) {
            // Parallel view
            contentDiv.className = `book-content parallel-view ${langs.length === 3 ? 'three-col' : ''}`;
            contentDiv.innerHTML = langs.map(lang => {
                const langInfo = book.languages[lang] || {};
                const title = langInfo.title || book.title;
                return `
                    <div class="text-column" data-lang="${lang}">
                        <div class="text-column-header">
                            <span class="lang-label">${LANG_NAMES[lang] || lang}</span>
                            <span class="lang-title">${escapeHtml(title)}</span>
                        </div>
                        <div class="text-body">
                            <div class="placeholder-text">
                                [${LANG_NAMES[lang] || lang} text from ${langInfo.source || 'source'}]
                                <br><br>
                                Full text will be loaded when corpus is populated.
                                <br><br>
                                Source: ${langInfo.source || 'unknown'}
                                ${langInfo.gutenberg_id ? `<br>Gutenberg ID: ${langInfo.gutenberg_id}` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Single view
            const lang = langs[0] || 'en';
            const langInfo = book.languages[lang] || {};
            contentDiv.className = 'book-content single-view';
            contentDiv.innerHTML = `
                <div class="text-body">
                    <div class="placeholder-text">
                        <strong>${LANG_NAMES[lang] || lang}</strong>: ${langInfo.title || book.title}
                        <br><br>
                        [Full text will be loaded when corpus is populated]
                        <br><br>
                        Source: ${langInfo.source || 'unknown'}
                        ${langInfo.gutenberg_id ? `<br>Gutenberg ID: ${langInfo.gutenberg_id}` : ''}
                    </div>
                </div>
            `;
        }
    } else {
        // Regular book (user uploaded or single language)
        let content = escapeHtml(book.content || '');
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
        }
    }
}
