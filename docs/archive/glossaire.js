// glossaire.js - Complete rewrite

const glossaire = {
    terms: [],
    quotes: [],
    userTerms: [],
    userQuotes: [],
    activeLang: null,
    searchQuery: '',
    selectedCategory: ''
};

// Data feeds (paths relative to docs/archive/, served from docs/)
const FEEDS = {
    glossary: '../data/glossary.json',
    quotes: '../data/quotes.json'
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
    'el-mod': 'Ελληνικά (Modern)',
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

// ============ INIT ============
async function init() {
    glossaire.userTerms  = JSON.parse(localStorage.getItem('aleph_user_terms')  || '[]');
    glossaire.userQuotes = JSON.parse(localStorage.getItem('aleph_user_quotes') || '[]');
    await loadData();
    buildLangPills();
    buildCatFilter();
    renderTerms();
    updateStats();

    // Setup event listeners
    setupSearch();
    setupAddEntryForm();
    setupUrlParams();
}
document.addEventListener('DOMContentLoaded', init);

// ============ DATA LOADING ============
async function loadData() {
    try {
        const [glossaryRes, quotesRes] = await Promise.all([
            fetch(FEEDS.glossary),
            fetch(FEEDS.quotes)
        ]);

        if (glossaryRes.ok) {
            const glossaryData = await glossaryRes.json();
            glossaire.terms = glossaryData.terms || [];
        }

        if (quotesRes.ok) {
            const quotesData = await quotesRes.json();
            glossaire.quotes = quotesData.quotes || [];
        }

        // Merge user-added entries
        glossaire.terms = [...glossaire.terms, ...glossaire.userTerms];
        glossaire.quotes = [...glossaire.quotes, ...glossaire.userQuotes];

    } catch (err) {
        console.error('Failed to load glossary data:', err);
        glossaire.terms = [...glossaire.userTerms];
        glossaire.quotes = [...glossaire.userQuotes];
    }
}

// ============ LANG PILLS ============
function buildLangPills() {
    const container = document.getElementById('langPills');
    if (!container) return;

    // Get unique languages from loaded data
    const langs = new Set();
    glossaire.terms.forEach(t => { if (t.lang) langs.add(t.lang); });
    glossaire.quotes.forEach(q => { if (q.lang) langs.add(q.lang); });

    const sortedLangs = Array.from(langs).sort();
    container.innerHTML = '';

    sortedLangs.forEach(lang => {
        const pill = document.createElement('button');
        pill.className = 'lang-pill';
        pill.dataset.lang = lang;
        pill.textContent = LANG_NAMES[lang] || lang;
        pill.addEventListener('click', () => handleLangPillClick(lang, pill));
        container.appendChild(pill);
    });
}

function handleLangPillClick(lang, pill) {
    if (glossaire.activeLang === lang) {
        // Clicking active pill deselects it (shows all)
        glossaire.activeLang = null;
        pill.classList.remove('active');
    } else {
        // Deactivate all, activate this one
        document.querySelectorAll('.lang-pill').forEach(p => p.classList.remove('active'));
        glossaire.activeLang = lang;
        pill.classList.add('active');
    }
    renderTerms();
    updateStats();
}

// ============ CATEGORY FILTER ============
function buildCatFilter() {
    const select = document.getElementById('catFilter');
    if (!select) return;

    // Get unique categories
    const categories = new Set();
    glossaire.terms.forEach(t => {
        if (t.category) {
            const cats = Array.isArray(t.category) ? t.category : [t.category];
            cats.forEach(c => categories.add(c));
        }
    });

    const sortedCats = Array.from(categories).sort();

    select.innerHTML = '<option value="">toutes catégories</option>';
    sortedCats.forEach(cat => {
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

// ============ SEARCH ============
function setupSearch() {
    const searchInput = document.getElementById('glossSearch');
    if (!searchInput) return;

    // Live filter on every keystroke using input event
    searchInput.addEventListener('input', (e) => {
        glossaire.searchQuery = e.target.value.toLowerCase().trim();
        renderTerms();
        updateStats();
    });
}

// ============ FILTERING ============
function getFilteredTerms() {
    return glossaire.terms.filter(term => {
        // Language filter
        if (glossaire.activeLang && term.lang !== glossaire.activeLang) {
            return false;
        }

        // Category filter
        if (glossaire.selectedCategory) {
            const cats = Array.isArray(term.category) ? term.category : [term.category];
            if (!cats.includes(glossaire.selectedCategory)) {
                return false;
            }
        }

        // Search filter - filter against term, native, gloss (definition), etymology
        if (glossaire.searchQuery) {
            const query = glossaire.searchQuery;
            const searchable = [
                term.term,
                term.native,
                term.definition,  // gloss
                term.gloss,
                term.etymology
            ].filter(Boolean).join(' ').toLowerCase();

            if (!searchable.includes(query)) {
                return false;
            }
        }

        return true;
    });
}

// ============ RENDER TERMS ============
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
        const row = document.createElement('div');
        row.className = 'term-row';
        row.dataset.id = term.id;

        row.innerHTML = `
            <span class="term-lang-tag">${escapeHtml(LANG_NAMES[term.lang] || term.lang || '')}</span>
            <span class="term-word-name">${escapeHtml(term.term)}</span>
            <span class="term-def-preview">${escapeHtml(truncate(term.definition || term.gloss || '', 80))}</span>
        `;

        const expanded = document.createElement('div');
        expanded.className = 'term-expanded';
        expanded.innerHTML = renderExpandedContent(term);

        row.addEventListener('click', () => toggleTermRow(row, expanded));
        container.appendChild(row);
        container.appendChild(expanded);
    });
}

function toggleTermRow(row, expanded) {
    const isOpen = row.classList.contains('expanded');
    document.querySelectorAll('.term-row.expanded').forEach(r => {
        r.classList.remove('expanded');
        const exp = r.nextElementSibling;
        if (exp && exp.classList.contains('term-expanded')) exp.classList.remove('open');
    });
    if (!isOpen) {
        row.classList.add('expanded');
        expanded.classList.add('open');
    }
}

function renderExpandedContent(term) {
    const native = term.native || term.pronunciation || '';
    const definition = term.definition || term.gloss || '';
    const etymology = term.etymology || '';
    const domain = formatCategories(term.category);
    const period = term.period || '';

    const fields = [];
    if (native) fields.push(`<div class="te-native">${escapeHtml(native)}</div>`);
    if (definition) fields.push(`<div class="te-gloss">${escapeHtml(definition)}</div>`);

    const facts = [];
    if (etymology) facts.push(`<div class="te-fact"><span class="te-label">étymologie</span><span class="te-val">${escapeHtml(etymology)}</span></div>`);
    if (domain)    facts.push(`<div class="te-fact"><span class="te-label">domaine</span><span class="te-val">${escapeHtml(domain)}</span></div>`);
    if (period)    facts.push(`<div class="te-fact"><span class="te-label">période</span><span class="te-val">${escapeHtml(period)}</span></div>`);
    if (facts.length) fields.push(`<div class="te-facts">${facts.join('')}</div>`);

    if (term.related && term.related.length > 0) {
        const links = term.related.map(r =>
            `<a class="te-related-link" href="#" data-related="${escapeHtml(r)}">${escapeHtml(r)}</a>`
        ).join('');
        fields.push(`<div class="te-related"><span class="te-label">voir aussi</span><span class="te-val">${links}</span></div>`);
    }

    const termQuotes = glossaire.quotes.filter(q =>
        q.relatedTerm === term.id ||
        q.relatedTerm === term.term ||
        (q.tags && q.tags.includes(term.term))
    );
    if (termQuotes.length > 0) {
        const quotesHtml = termQuotes.map(q => `
            <blockquote class="te-quote">${escapeHtml(q.text)}<footer>— ${escapeHtml(q.author || '')}</footer></blockquote>
        `).join('');
        fields.push(`<div class="te-quotes"><span class="te-label">citations</span>${quotesHtml}</div>`);
    }

    return fields.join('');
}

document.addEventListener('click', (e) => {
    const link = e.target.closest('.te-related-link');
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    const name = link.dataset.related;
    const target = glossaire.terms.find(t =>
        t.term === name ||
        t.id === name ||
        (t.term && t.term.toLowerCase() === name.toLowerCase())
    );
    if (!target) return;
    const row = document.querySelector(`.term-row[data-id="${CSS.escape(String(target.id))}"]`);
    if (row) {
        const exp = row.nextElementSibling;
        if (!row.classList.contains('expanded')) toggleTermRow(row, exp);
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

// ============ STATS ============
function updateStats() {
    const termCountEl = document.getElementById('term-count');
    const quoteCountEl = document.getElementById('quote-count');
    const langCountEl = document.getElementById('lang-count');

    // Show count of VISIBLE terms, not total
    const visibleTerms = getFilteredTerms();

    if (termCountEl) termCountEl.textContent = visibleTerms.length;
    if (quoteCountEl) quoteCountEl.textContent = glossaire.quotes.length;

    if (langCountEl) {
        const langs = new Set();
        glossaire.terms.forEach(t => { if (t.lang) langs.add(t.lang); });
        glossaire.quotes.forEach(q => { if (q.lang) langs.add(q.lang); });
        langCountEl.textContent = langs.size;
    }
}

function formatCategories(category) {
    if (!category) return '';
    const cats = Array.isArray(category) ? category : [category];
    return cats.join(', ');
}

// ============ ADD ENTRY FORM ============
function setupAddEntryForm() {
    const toggleBtn = document.getElementById('addToggle');
    const formSection = document.getElementById('addEntrySection');
    const termForm = document.getElementById('addTermForm');

    if (toggleBtn && formSection) {
        toggleBtn.addEventListener('click', () => {
            formSection.classList.toggle('collapsed');
            const isCollapsed = formSection.classList.contains('collapsed');
            toggleBtn.textContent = isCollapsed ? 'ajouter une entrée' : 'masquer le formulaire';
        });
    }

    if (termForm) {
        termForm.addEventListener('submit', handleAddTerm);
    }
}

function handleAddTerm(e) {
    e.preventDefault();

    const form = e.target;
    const term = {
        id: 'user_' + Date.now(),
        term: form.querySelector('#termWord')?.value.trim() || '',
        lang: form.querySelector('#termLang')?.value || '',
        native: form.querySelector('#termNative')?.value.trim() || undefined,
        definition: form.querySelector('#termDefinition')?.value.trim() || '',
        etymology: form.querySelector('#termEtymology')?.value.trim() || undefined,
        category: form.querySelector('#termCategory')?.value.trim()
            ? form.querySelector('#termCategory').value.split(',').map(c => c.trim())
            : undefined,
        period: form.querySelector('#termPeriod')?.value.trim() || undefined,
        related: form.querySelector('#termRelated')?.value.trim()
            ? form.querySelector('#termRelated').value.split(',').map(r => r.trim())
            : undefined,
        userAdded: true
    };

    if (!term.term || !term.definition) {
        alert('Veuillez remplir les champs obligatoires.');
        return;
    }

    // Add to arrays
    glossaire.userTerms.push(term);
    glossaire.terms.push(term);

    // Save to localStorage
    localStorage.setItem('aleph_user_terms', JSON.stringify(glossaire.userTerms));

    // Reset form
    form.reset();

    // Re-render immediately without page reload
    buildLangPills();
    buildCatFilter();
    renderTerms();
    updateStats();

    showNotification('Terme ajouté');
}

// ============ URL PARAMS ============
function setupUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);

    // Check for ?q= parameter
    const q = urlParams.get('q');
    if (q) {
        const searchInput = document.getElementById('glossSearch');
        if (searchInput) {
            searchInput.value = q;
            glossaire.searchQuery = q.toLowerCase().trim();
            renderTerms();
            updateStats();
        }
    }

    // Check for ?id= parameter and expand that entry inline
    const id = urlParams.get('id');
    if (id) {
        const row = document.querySelector(`.term-row[data-id="${CSS.escape(id)}"]`);
        if (row) {
            const exp = row.nextElementSibling;
            if (exp && !row.classList.contains('expanded')) toggleTermRow(row, exp);
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

// ============ UTILITIES ============
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '…';
}

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
