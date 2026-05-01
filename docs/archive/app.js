// app.js - Shared functionality across all pages
// Split into sections: THEME, NAV, SEARCH, BROWSE

// ============================================================
// THEME
// ============================================================
// One function, used by all pages. Reads/writes localStorage key "aleph-theme"
// Applies data-theme to document.documentElement

function initTheme() {
    const stored = localStorage.getItem('aleph-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', stored);
}

function updateThemeBtnSymbol() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const theme = document.documentElement.getAttribute('data-theme');
    btn.textContent = theme === 'light' ? '◐' : '◑';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('aleph-theme', next);
    updateThemeBtnSymbol();
}

function setupThemeToggle() {
    const btn = document.getElementById('themeToggle');
    if (btn) {
        btn.addEventListener('click', toggleTheme);
    }
    updateThemeBtnSymbol();
}

// ============================================================
// NAV
// ============================================================
// Mark current page link as active based on window.location.pathname

function setupNav() {
    const path = window.location.pathname;
    const currentPage = path.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav-links a').forEach(link => {
        const href = link.getAttribute('href');
        link.classList.remove('active');
        if (href === currentPage ||
            (currentPage === '' && href === 'index.html') ||
            (currentPage === 'index.html' && href === 'index.html')) {
            link.classList.add('active');
        }
    });
}

// ============================================================
// SEARCH (chercher page - index.html)
// ============================================================
// Load search-index.json. On query, show results split into two columns:
// Terms (from glossary) and Texts (from corpus). Each result is clickable.

let corpusIndex = null;
let glossaryData = null;

async function loadSearchIndex() {
    try {
        const [indexRes, glossaryRes] = await Promise.all([
            fetch('../corpus/index.json'),
            fetch('../data/glossary.json')
        ]);

        if (indexRes.ok) {
            corpusIndex = await indexRes.json();
        }
        if (glossaryRes.ok) {
            glossaryData = await glossaryRes.json();
        }
    } catch (e) {
        console.error('Failed to load search index:', e);
    }
}

function searchAll(query) {
    if (!query.trim()) return { terms: [], texts: [] };

    const q = query.toLowerCase().trim();
    const terms = [];
    const texts = [];

    // Search glossary terms
    if (glossaryData && glossaryData.terms) {
        glossaryData.terms.forEach(term => {
            const searchable = [
                term.term,
                term.definition,
                term.etymology,
                term.native
            ].filter(Boolean).join(' ').toLowerCase();

            if (searchable.includes(q)) {
                terms.push({
                    id: term.id,
                    term: term.term,
                    lang: term.lang,
                    definition: term.definition
                });
            }
        });
    }

    // Search corpus/texts from corpus index
    if (corpusIndex && Array.isArray(corpusIndex)) {
        corpusIndex.forEach(entry => {
            const searchable = [
                entry.title,
                entry.author,
                entry.category
            ].filter(Boolean).join(' ').toLowerCase();

            if (searchable.includes(q)) {
                texts.push({
                    id: entry.id,
                    title: entry.title,
                    author: entry.author,
                    url: entry.url,
                    file: entry.file,
                    category: entry.category
                });
            }
        });
    }

    return { terms: terms.slice(0, 20), texts: texts.slice(0, 20) };
}

function renderSearchResults(results, query) {
    const container = document.getElementById('searchResults');
    if (!container) return;

    if (results.terms.length === 0 && results.texts.length === 0) {
        container.innerHTML = '';
        container.classList.remove('open');
        return;
    }

    let html = '';

    if (results.terms.length > 0) {
        html += '<div class="search-section"><div class="search-section-title">Termes</div>';
        results.terms.forEach(t => {
            html += `<div class="search-result-item" data-href="glossaire.html?id=${encodeURIComponent(t.id)}">
                <div class="sri-term">${escapeHtml(t.term)}</div>
                <div class="sri-meta">${escapeHtml(t.lang || '')} - ${escapeHtml(truncate(t.definition || '', 60))}</div>
            </div>`;
        });
        html += '</div>';
    }

    if (results.texts.length > 0) {
        html += '<div class="search-section"><div class="search-section-title">Textes</div>';
        results.texts.forEach(t => {
            // If file exists, link to local reader; otherwise use external URL
            const href = t.file ? `book.html?corpus=${encodeURIComponent(t.id)}` : (t.url || '#');
            const isExternal = !t.file && t.url;
            html += `<div class="search-result-item" data-href="${escapeHtml(href)}"${isExternal ? ' data-external="true"' : ''}>
                <div class="sri-term">${escapeHtml(t.title)}</div>
                <div class="sri-meta">${escapeHtml(t.author || '')} - ${escapeHtml(t.category || '')}</div>
            </div>`;
        });
        html += '</div>';
    }

    container.innerHTML = html;
    container.classList.add('open');

    // Add click handlers
    container.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.dataset.external === 'true') {
                window.open(item.dataset.href, '_blank');
            } else {
                window.location.href = item.dataset.href;
            }
        });
    });
}

function setupHomeSearch() {
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('searchResults');
    if (!input) return;

    // Load search data
    loadSearchIndex();

    // Live search as user types
    input.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length < 2) {
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('open');
            }
            return;
        }

        const results = searchAll(query);
        renderSearchResults(results, query);
    });

    // Enter key navigates to glossaire with search
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && input.value.trim()) {
            window.location.href = 'glossaire.html?q=' + encodeURIComponent(input.value.trim());
        }
        if (e.key === 'Escape') {
            input.value = '';
            if (resultsContainer) {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.remove('open');
            }
        }
    });

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsContainer?.contains(e.target)) {
            if (resultsContainer) {
                resultsContainer.classList.remove('open');
            }
        }
    });
}

// ============================================================
// BROWSE (browse.html)
// ============================================================
// Load from docs/data/corpus-manifest.json
// Render cards with title, author, source, domain, year, language
// Filters work on all fields. Count updates live.

const browseState = {
    corpus: null,
    books: [],
    page: 1,
    perPage: 20,
    filters: {
        type: '',
        author: '',
        source: '',
        favorites: ''
    },
    sortBy: 'title'
};

const userPrefs = {
    favorites: JSON.parse(localStorage.getItem('aleph_favorites') || '[]')
};

function saveFavorites() {
    localStorage.setItem('aleph_favorites', JSON.stringify(userPrefs.favorites));
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

async function loadCorpusManifest() {
    try {
        const resp = await fetch('../data/corpus-manifest.json');
        if (!resp.ok) return;

        browseState.corpus = await resp.json();
        browseState.books = [];

        if (browseState.corpus.corpus) {
            for (const [catKey, category] of Object.entries(browseState.corpus.corpus)) {
                const domain = catKey.startsWith('legal') ? 'droit'
                    : catKey.startsWith('business_economics') ? 'économie'
                    : catKey.startsWith('business') ? 'gestion'
                    : catKey.startsWith('philosophy') ? 'philosophie'
                    : catKey.startsWith('literature') ? 'littérature'
                    : catKey.startsWith('science') ? 'sciences'
                    : catKey.startsWith('history') ? 'histoire'
                    : catKey.startsWith('sacred') ? 'textes sacrés'
                    : 'autre';

                (category.documents || []).forEach(doc => {
                    const langs = Object.keys(doc.languages || {});
                    browseState.books.push({
                        id: 'corpus_' + doc.id,
                        corpusId: doc.id,
                        title: doc.title,
                        author: doc.author || '',
                        source: category.name,
                        domain: domain,
                        year: doc.year || null,
                        language: langs.join(', '),
                        tags: doc.tags || []
                    });
                });
            }
        }
    } catch (e) {
        console.error('Failed to load corpus manifest:', e);
    }
}

function populateCustomDropdown(el, options, selectedValue, onChange) {
    if (!el) return;
    const trigger = el.querySelector('.cd-trigger');
    const menu = el.querySelector('.cd-menu');
    const label = el.querySelector('.cd-label');
    if (!trigger || !menu || !label) return;

    menu.innerHTML = '';
    options.forEach(opt => {
        const li = document.createElement('li');
        li.className = 'cd-item';
        li.dataset.value = opt.value;
        li.textContent = opt.label;
        if (opt.value === selectedValue) li.classList.add('selected');
        li.addEventListener('click', () => {
            label.textContent = opt.label;
            el.dataset.value = opt.value;
            menu.querySelectorAll('.cd-item').forEach(i => i.classList.remove('selected'));
            li.classList.add('selected');
            menu.hidden = true;
            trigger.classList.remove('open');
            if (onChange) onChange(opt.value);
        });
        menu.appendChild(li);
    });

    if (!trigger.dataset.cdBound) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !menu.hidden;
            document.querySelectorAll('.custom-dropdown .cd-menu').forEach(m => { m.hidden = true; });
            document.querySelectorAll('.custom-dropdown .cd-trigger').forEach(t => t.classList.remove('open'));
            menu.hidden = isOpen;
            trigger.classList.toggle('open', !isOpen);
        });
        trigger.dataset.cdBound = '1';
    }
}

function setupCustomDropdownsOutsideClick() {
    if (window.__cdOutsideBound) return;
    document.addEventListener('click', (e) => {
        if (e.target.closest('.custom-dropdown')) return;
        document.querySelectorAll('.custom-dropdown .cd-menu').forEach(m => { m.hidden = true; });
        document.querySelectorAll('.custom-dropdown .cd-trigger').forEach(t => t.classList.remove('open'));
    });
    window.__cdOutsideBound = true;
}

function populateBrowseFilters() {
    const books = browseState.books;

    const types = [...new Set(books.map(b => b.domain).filter(Boolean))].sort();
    populateCustomDropdown(
        document.getElementById('type-filter'),
        [{ value: '', label: 'tous les types' }, ...types.map(t => ({ value: t, label: t }))],
        '',
        (val) => { browseState.filters.type = val; browseState.page = 1; renderBrowseList(); }
    );

    const authors = [...new Set(books.map(b => b.author).filter(Boolean))].sort();
    populateCustomDropdown(
        document.getElementById('author-filter'),
        [{ value: '', label: 'tous les auteurs' }, ...authors.map(a => ({ value: a, label: a }))],
        '',
        (val) => { browseState.filters.author = val; browseState.page = 1; renderBrowseList(); }
    );

    const sources = [...new Set(books.map(b => b.source).filter(Boolean))].sort();
    populateCustomDropdown(
        document.getElementById('source-filter'),
        [{ value: '', label: 'toutes les sources' }, ...sources.map(s => ({ value: s, label: s }))],
        '',
        (val) => { browseState.filters.source = val; browseState.page = 1; renderBrowseList(); }
    );

    populateCustomDropdown(
        document.getElementById('fav-filter'),
        [{ value: '', label: 'tous les textes' }, { value: 'favorites', label: 'favoris' }],
        '',
        (val) => { browseState.filters.favorites = val; browseState.page = 1; renderBrowseList(); }
    );

    populateCustomDropdown(
        document.getElementById('sort-filter'),
        [
            { value: 'title', label: 'trier : titre' },
            { value: 'author', label: 'trier : auteur' },
            { value: 'domain', label: 'trier : type' }
        ],
        'title',
        (val) => { browseState.sortBy = val; renderBrowseList(); }
    );

    setupCustomDropdownsOutsideClick();
}

function getFilteredBooks() {
    let books = browseState.books;

    if (browseState.filters.type) {
        books = books.filter(b => b.domain === browseState.filters.type);
    }
    if (browseState.filters.author) {
        books = books.filter(b => b.author === browseState.filters.author);
    }
    if (browseState.filters.source) {
        books = books.filter(b => b.source === browseState.filters.source);
    }
    if (browseState.filters.favorites === 'favorites') {
        books = books.filter(b => isFavorite(b.id));
    }

    // Sort
    books.sort((a, b) => {
        const aVal = a[browseState.sortBy] || '';
        const bVal = b[browseState.sortBy] || '';
        return String(aVal).localeCompare(String(bVal));
    });

    return books;
}

function renderBrowseList() {
    const listDiv = document.getElementById('book-list');
    const pagDiv = document.getElementById('pagination');
    if (!listDiv) return;

    const filtered = getFilteredBooks();
    const total = Math.ceil(filtered.length / browseState.perPage);
    const page = filtered.slice(
        (browseState.page - 1) * browseState.perPage,
        browseState.page * browseState.perPage
    );

    // Update count
    const totalBooksEl = document.getElementById('total-books');
    if (totalBooksEl) totalBooksEl.textContent = filtered.length;

    const totalSourcesEl = document.getElementById('total-sources');
    if (totalSourcesEl) {
        const sources = new Set(filtered.map(b => b.source));
        totalSourcesEl.textContent = sources.size;
    }

    if (page.length === 0) {
        listDiv.innerHTML = '<div class="no-books">aucun texte trouvé</div>';
        if (pagDiv) pagDiv.innerHTML = '';
        return;
    }

    listDiv.innerHTML = page.map(b => {
        const yearStr = b.year ? formatYear(b.year) : '';
        const href = `../book.html?corpus=${b.corpusId}`;
        const metaParts = [b.domain, b.source].filter(Boolean).map(escapeHtml).join(' · ');
        const authorLine = [b.author, yearStr].filter(Boolean).map(escapeHtml).join(', ');
        const starred = isFavorite(b.id);
        return `
            <article class="browse-card" data-id="${escapeHtml(String(b.id))}">
                <div class="bc-meta">${metaParts}</div>
                <div class="bc-title"><a href="${href}">${escapeHtml(b.title)}</a></div>
                ${authorLine ? `<div class="bc-author">${authorLine}</div>` : ''}
                ${b.language ? `<div class="bc-detail">${escapeHtml(b.language)}</div>` : ''}
                <button class="bc-star ${starred ? 'starred' : ''}"
                        onclick="event.stopPropagation(); toggleFavBtn(this, '${escapeHtml(String(b.id))}')"
                        title="favoris" aria-label="favori">${starred ? '★' : '☆'}</button>
            </article>
        `;
    }).join('');

    // Pagination
    if (pagDiv && total > 1) {
        pagDiv.innerHTML = `
            ${browseState.page > 1 ? `<a href="#" onclick="gotoPage(${browseState.page - 1}); return false;">précédent</a>` : ''}
            <span class="current">page ${browseState.page} / ${total}</span>
            ${browseState.page < total ? `<a href="#" onclick="gotoPage(${browseState.page + 1}); return false;">suivant</a>` : ''}
        `;
    } else if (pagDiv) {
        pagDiv.innerHTML = `<span class="current">${filtered.length} textes</span>`;
    }
}

function gotoPage(p) {
    browseState.page = p;
    renderBrowseList();
    window.scrollTo(0, 0);
}
window.gotoPage = gotoPage;

function toggleFavBtn(btn, bookId) {
    const isNowFav = toggleFavorite(bookId);
    btn.classList.toggle('starred', isNowFav);
    btn.textContent = isNowFav ? '★' : '☆';
}
window.toggleFavBtn = toggleFavBtn;

async function initBrowse() {
    await loadCorpusManifest();
    populateBrowseFilters();
    renderBrowseList();
}
window.initBrowse = initBrowse;

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
}

function formatYear(year) {
    if (!year) return '';
    const n = parseInt(year, 10);
    if (n < 0) {
        return Math.abs(n) + ' av. J.-C.';
    }
    return String(year);
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupThemeToggle();
    setupNav();

    // Setup home search if on index.html
    if (document.getElementById('search-input') && document.getElementById('searchResults')) {
        setupHomeSearch();
    }
});
