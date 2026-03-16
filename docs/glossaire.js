// glossaire.js - Glossary and Quotes viewer

const glossaire = {
    terms: [],
    quotes: [],
    userTerms: JSON.parse(localStorage.getItem('aleph_user_terms') || '[]'),
    userQuotes: JSON.parse(localStorage.getItem('aleph_user_quotes') || '[]'),
    currentView: 'terms',
    activeLangs: new Set(),
    searchQuery: '',
    selectedCategory: ''
};

// Language display names
const LANG_NAMES = {
    de: 'Deutsch',
    fr: 'Français',
    it: 'Italiano',
    pt: 'Português',
    en: 'English',
    ja: '日本語',
    zh: '中文',
    el: 'Ελληνικά',
    'el-anc': 'Ελληνικά (Classical)',
    'el-mod': 'Ελληνικά (Modern/Junta)',
    la: 'Latina',
    es: 'Español',
    ru: 'Русский',
    ar: 'العربية',
    he: 'עברית',
    fa: 'فارسی',
    sa: 'संस्कृत',
    tr: 'Türkçe',
    ml: 'മലയാളം',
    ta: 'தமிழ்',
    zu: 'Zulu / Bantu',
    sw: 'Swahili'
};

// Initialize
async function init() {
    await loadData();
    setupEventListeners();
    renderLanguageFilters();
    renderCategoryFilter();
    updateStats();
    render();
}

// Load glossary and quotes data
async function loadData() {
    const statsEl = document.querySelector('.glossaire-stats');
    try {
        const [glossaryRes, quotesRes] = await Promise.all([
            fetch('data/glossary.json'),
            fetch('data/quotes.json')
        ]);

        if (!glossaryRes.ok) throw new Error(`glossary.json: ${glossaryRes.status}`);
        if (!quotesRes.ok)   throw new Error(`quotes.json: ${quotesRes.status}`);

        const glossaryData = await glossaryRes.json();
        const quotesData   = await quotesRes.json();

        glossaire.terms  = glossaryData.terms  || [];
        glossaire.quotes = quotesData.quotes   || [];

        // Merge user-added entries from localStorage
        glossaire.terms  = [...glossaire.terms,  ...glossaire.userTerms];
        glossaire.quotes = [...glossaire.quotes, ...glossaire.userQuotes];

    } catch (err) {
        console.error('Failed to load glossary data:', err);
        // Show error in UI rather than silent failure
        if (statsEl) {
            statsEl.innerHTML = `<span style="color:var(--accent);opacity:0.6;font-size:0.6rem;letter-spacing:0.1em">
                erreur de chargement — ${err.message}
            </span>`;
        }
        // Fallback: use only user-added entries
        glossaire.terms  = [...glossaire.userTerms];
        glossaire.quotes = [...glossaire.userQuotes];
    }
}

// Event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            setView(view);
        });
    });

    // Search
    const searchInput = document.getElementById('glossary-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(e => {
            glossaire.searchQuery = e.target.value.toLowerCase();
            render();
        }, 200));
    }

    // Category filter
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        categorySelect.addEventListener('change', e => {
            glossaire.selectedCategory = e.target.value;
            render();
        });
    }

    // Entry type toggle (add form)
    document.querySelectorAll('.entry-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.entry-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const type = btn.dataset.type;
            document.getElementById('add-term-form').classList.toggle('hidden', type !== 'term');
            document.getElementById('add-quote-form').classList.toggle('hidden', type !== 'quote');
        });
    });

    // Add term form
    const termForm = document.getElementById('add-term-form');
    if (termForm) {
        termForm.addEventListener('submit', handleAddTerm);
    }

    // Add quote form
    const quoteForm = document.getElementById('add-quote-form');
    if (quoteForm) {
        quoteForm.addEventListener('submit', handleAddQuote);
    }
}

// Set view (terms or quotes)
function setView(view) {
    glossaire.currentView = view;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    document.getElementById('terms-view').classList.toggle('hidden', view !== 'terms');
    document.getElementById('quotes-view').classList.toggle('hidden', view !== 'quotes');

    render();
}

// Language filter handling
function toggleLang(lang) {
    if (glossaire.activeLangs.has(lang)) {
        glossaire.activeLangs.delete(lang);
    } else {
        glossaire.activeLangs.add(lang);
    }

    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', glossaire.activeLangs.has(btn.dataset.lang));
    });

    render();
}

// Render language filter buttons
function renderLanguageFilters() {
    const container = document.getElementById('lang-filters');
    if (!container) return;

    // Get all unique languages from terms and quotes
    const langs = new Set();
    glossaire.terms.forEach(t => langs.add(t.lang));
    glossaire.quotes.forEach(q => langs.add(q.lang));

    // Sort by language code
    const sortedLangs = Array.from(langs).sort();

    container.innerHTML = sortedLangs.map(lang => `
        <button class="lang-btn" data-lang="${lang}" onclick="toggleLang('${lang}')">
            ${LANG_NAMES[lang] || lang}
        </button>
    `).join('');
}

// Render category filter dropdown
function renderCategoryFilter() {
    const select = document.getElementById('category-select');
    if (!select) return;

    // Get all unique categories from terms
    const categories = new Set();
    glossaire.terms.forEach(t => {
        if (t.category) {
            (Array.isArray(t.category) ? t.category : [t.category]).forEach(c => categories.add(c));
        }
    });

    const sortedCategories = Array.from(categories).sort();

    select.innerHTML = `
        <option value="">toutes catégories</option>
        ${sortedCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
    `;
}

// Update stats display
function updateStats() {
    const termCount = document.getElementById('term-count');
    const quoteCount = document.getElementById('quote-count');
    const langCount = document.getElementById('lang-count');

    if (termCount) termCount.textContent = glossaire.terms.length;
    if (quoteCount) quoteCount.textContent = glossaire.quotes.length;

    if (langCount) {
        const langs = new Set();
        glossaire.terms.forEach(t => langs.add(t.lang));
        glossaire.quotes.forEach(q => langs.add(q.lang));
        langCount.textContent = langs.size;
    }
}

// Filter terms
function getFilteredTerms() {
    return glossaire.terms.filter(term => {
        // Language filter
        if (glossaire.activeLangs.size > 0 && !glossaire.activeLangs.has(term.lang)) {
            return false;
        }

        // Category filter
        if (glossaire.selectedCategory) {
            const cats = Array.isArray(term.category) ? term.category : [term.category];
            if (!cats.includes(glossaire.selectedCategory)) {
                return false;
            }
        }

        // Search filter
        if (glossaire.searchQuery) {
            const query = glossaire.searchQuery;
            const searchable = [
                term.term,
                term.definition,
                term.etymology,
                term.usage,
                ...(term.related || [])
            ].filter(Boolean).join(' ').toLowerCase();

            if (!searchable.includes(query)) {
                return false;
            }
        }

        return true;
    });
}

// Filter quotes
function getFilteredQuotes() {
    return glossaire.quotes.filter(quote => {
        // Language filter
        if (glossaire.activeLangs.size > 0 && !glossaire.activeLangs.has(quote.lang)) {
            return false;
        }

        // Search filter
        if (glossaire.searchQuery) {
            const query = glossaire.searchQuery;
            const searchable = [
                quote.text,
                quote.translation,
                quote.author,
                quote.source,
                ...(quote.tags || [])
            ].filter(Boolean).join(' ').toLowerCase();

            if (!searchable.includes(query)) {
                return false;
            }
        }

        return true;
    });
}

// Render main view
function render() {
    if (glossaire.currentView === 'terms') {
        renderTerms();
    } else {
        renderQuotes();
    }
}

// Render terms list
function renderTerms() {
    const container = document.getElementById('terms-list');
    if (!container) return;

    const terms = getFilteredTerms();

    if (terms.length === 0) {
        container.innerHTML = '<p class="no-results">Aucun terme trouvé.</p>';
        return;
    }

    // Sort by term alphabetically
    terms.sort((a, b) => a.term.localeCompare(b.term));

    container.innerHTML = terms.map(term => `
        <article class="term-card">
            <header class="term-header">
                <h3 class="term-word">${escapeHtml(term.term)}</h3>
                <span class="term-lang">${LANG_NAMES[term.lang] || term.lang}</span>
            </header>
            ${term.pronunciation ? `<div class="term-pronunciation">${escapeHtml(term.pronunciation)}</div>` : ''}
            <p class="term-definition">${escapeHtml(term.definition)}</p>
            ${term.etymology ? `<p class="term-etymology"><em>Étymologie :</em> ${escapeHtml(term.etymology)}</p>` : ''}
            ${term.usage ? `<p class="term-usage"><em>Usage :</em> ${escapeHtml(term.usage)}</p>` : ''}
            ${term.category ? `
                <div class="term-categories">
                    ${(Array.isArray(term.category) ? term.category : [term.category]).map(c =>
                        `<span class="category-tag">${escapeHtml(c)}</span>`
                    ).join('')}
                </div>
            ` : ''}
            ${term.related && term.related.length > 0 ? `
                <div class="term-related">
                    <em>Voir aussi :</em>
                    <div class="entry-links">${term.related.map(r => `<span class="link-chip" onclick="searchTerm('${escapeJs(r)}')">${escapeHtml(r)}</span>`).join('')}</div>
                </div>
            ` : ''}
            ${term.sources && term.sources.length > 0 ? `
                <div class="term-sources">
                    <em>Sources :</em> ${term.sources.map(s => escapeHtml(s)).join(' ; ')}
                </div>
            ` : ''}
        </article>
    `).join('');
}

// Render quotes list
function renderQuotes() {
    const container = document.getElementById('quotes-list');
    if (!container) return;

    const quotes = getFilteredQuotes();

    if (quotes.length === 0) {
        container.innerHTML = '<p class="no-results">Aucune citation trouvée.</p>';
        return;
    }

    // Sort by author, then year
    quotes.sort((a, b) => {
        const authorCmp = (a.author || '').localeCompare(b.author || '');
        if (authorCmp !== 0) return authorCmp;
        return (a.year || 0) - (b.year || 0);
    });

    container.innerHTML = quotes.map(quote => `
        <article class="quote-card">
            <blockquote class="quote-text">${escapeHtml(quote.text)}</blockquote>
            ${quote.translation ? `<p class="quote-translation">${escapeHtml(quote.translation)}</p>` : ''}
            <footer class="quote-footer">
                <cite class="quote-author">${escapeHtml(quote.author)}</cite>
                ${quote.source ? `<span class="quote-source">${escapeHtml(quote.source)}</span>` : ''}
                ${quote.year ? `<span class="quote-year">(${formatYear(quote.year)})</span>` : ''}
                <span class="quote-lang">${LANG_NAMES[quote.lang] || quote.lang}</span>
            </footer>
            ${quote.tags && quote.tags.length > 0 ? `
                <div class="quote-tags">
                    ${quote.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            ` : ''}
            ${quote.notes ? `<p class="quote-notes"><em>${escapeHtml(quote.notes)}</em></p>` : ''}
        </article>
    `).join('');
}

// Handle add term form
function handleAddTerm(e) {
    e.preventDefault();

    const term = {
        id: 'user_' + Date.now(),
        term: document.getElementById('term-word').value.trim(),
        lang: document.getElementById('term-lang').value,
        pronunciation: document.getElementById('term-pronunciation').value.trim() || undefined,
        definition: document.getElementById('term-definition').value.trim(),
        etymology: document.getElementById('term-etymology').value.trim() || undefined,
        category: document.getElementById('term-categories').value.trim()
            ? document.getElementById('term-categories').value.split(',').map(c => c.trim())
            : undefined,
        usage: document.getElementById('term-usage').value.trim() || undefined,
        sources: document.getElementById('term-sources').value.trim()
            ? [document.getElementById('term-sources').value.trim()]
            : undefined,
        userAdded: true
    };

    // Add to arrays
    glossaire.userTerms.push(term);
    glossaire.terms.push(term);

    // Save to localStorage
    localStorage.setItem('aleph_user_terms', JSON.stringify(glossaire.userTerms));

    // Reset form
    e.target.reset();

    // Update display
    renderCategoryFilter();
    renderLanguageFilters();
    updateStats();
    render();

    // Show confirmation
    showNotification('Terme ajouté');
}

// Handle add quote form
function handleAddQuote(e) {
    e.preventDefault();

    const quote = {
        id: 'user_' + Date.now(),
        text: document.getElementById('quote-text').value.trim(),
        translation: document.getElementById('quote-translation').value.trim() || undefined,
        author: document.getElementById('quote-author').value.trim(),
        lang: document.getElementById('quote-lang').value,
        source: document.getElementById('quote-source').value.trim() || undefined,
        year: document.getElementById('quote-year').value
            ? parseInt(document.getElementById('quote-year').value, 10)
            : undefined,
        tags: document.getElementById('quote-tags').value.trim()
            ? document.getElementById('quote-tags').value.split(',').map(t => t.trim())
            : undefined,
        notes: document.getElementById('quote-notes').value.trim() || undefined,
        userAdded: true
    };

    // Add to arrays
    glossaire.userQuotes.push(quote);
    glossaire.quotes.push(quote);

    // Save to localStorage
    localStorage.setItem('aleph_user_quotes', JSON.stringify(glossaire.userQuotes));

    // Reset form
    e.target.reset();

    // Update display
    renderLanguageFilters();
    updateStats();
    render();

    // Show confirmation
    showNotification('Citation ajoutée');
}

// Utility: format year (handle BCE)
function formatYear(year) {
    if (year < 0) {
        return Math.abs(year) + ' av. J.-C.';
    }
    return year.toString();
}

// Utility: escape HTML
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Utility: escape for JavaScript string in onclick attribute
function escapeJs(str) {
    if (!str) return '';
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Utility: debounce
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Utility: show notification
function showNotification(message) {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.className = 'notification';
    notif.textContent = message;
    document.body.appendChild(notif);

    setTimeout(() => notif.classList.add('show'), 10);
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 2000);
}

// Search for a specific term (used by link-chips)
function searchTerm(term) {
    const searchInput = document.getElementById('glossary-search');
    if (searchInput) {
        searchInput.value = term;
        glossaire.searchQuery = term.toLowerCase();
        render();
        // Scroll to top of results
        document.getElementById('terms-view')?.scrollIntoView({ behavior: 'smooth' });
    }
}

// Make toggleLang and searchTerm available globally
window.toggleLang = toggleLang;
window.searchTerm = searchTerm;

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', init);

// Theme toggle is handled by app.js
