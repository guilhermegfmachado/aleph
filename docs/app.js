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

    // Load corpus manifest documents into browse library
    try {
        const resp = await fetch('data/corpus-manifest.json');
        if (resp.ok) {
            const data = await resp.json();
            bookViewState.corpus = data;
            const corpusBooks = [];
            if (data.corpus) {
                for (const [catKey, category] of Object.entries(data.corpus)) {
                    const type = catKey.startsWith('legal') ? 'legal'
                        : catKey.startsWith('business') ? 'business'
                        : 'philosophy';
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
                            snippet: `${category.name}${yearStr}. Available in: ${langs.join(', ')}.`,
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
        }
    }
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
            <div class="search-summary">${pdfSearchState.matches.length} matches for "${escapeHtml(query)}"</div>
            <div class="match-list">
                ${pdfSearchState.matches.map((m, i) => `
                    <button class="pdf-match-btn" onclick="goToMatch(${i})">p.${m.page}</button>
                `).join('')}
            </div>
        `;
        goToMatch(0);
    } else {
        resultsDiv.classList.remove('hidden');
        resultsDiv.innerHTML = `<div class="search-summary">no matches for "${escapeHtml(query)}"</div>`;
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
    resultDiv.textContent = 'translating...';
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
        resultDiv.textContent = 'error: ' + e.message;
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
