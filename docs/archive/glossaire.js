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

// Data feeds
const FEEDS = {
    glossary: 'data/glossary.json',
    quotes: 'data/quotes.json'
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
    setupModal();
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
            <span class="term-word">${escapeHtml(term.term)}</span>
            <span class="term-lang">${LANG_NAMES[term.lang] || term.lang || ''}</span>
            <span class="term-def">${escapeHtml(truncate(term.definition || term.gloss || '', 80))}</span>
        `;

        row.addEventListener('click', () => openModal(term));
        container.appendChild(row);
    });
}

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

// ============ MODAL ============
function setupModal() {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;

    // Close button
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // Click on overlay background closes modal
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
}

function openModal(term) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;

    // Populate modal fields
    setModalField('modalTerm', term.term);
    setModalField('modalNative', term.native || term.pronunciation || '');
    setModalField('modalLang', LANG_NAMES[term.lang] || term.lang || '');
    setModalField('modalEtymology', term.etymology || '');
    setModalField('modalDomain', formatCategories(term.category));
    setModalField('modalPeriod', term.period || '');
    setModalField('modalGloss', term.definition || term.gloss || '');

    // Show/hide labels based on content
    toggleLabelVisibility('modalEtymologyLabel', 'modalEtymology');
    toggleLabelVisibility('modalDomainLabel', 'modalDomain');
    toggleLabelVisibility('modalPeriodLabel', 'modalPeriod');

    // Voir aussi links (clickable)
    const relatedContainer = document.getElementById('modalRelated');
    const relatedLabel = document.getElementById('modalRelatedLabel');
    if (relatedContainer) {
        if (term.related && term.related.length > 0) {
            relatedContainer.innerHTML = '';
            term.related.forEach(relatedTerm => {
                const link = document.createElement('span');
                link.className = 'related-link';
                link.textContent = relatedTerm;
                link.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openRelatedEntry(relatedTerm);
                });
                relatedContainer.appendChild(link);
            });
            relatedContainer.style.display = '';
            if (relatedLabel) relatedLabel.style.display = '';
        } else {
            relatedContainer.innerHTML = '';
            relatedContainer.style.display = 'none';
            if (relatedLabel) relatedLabel.style.display = 'none';
        }
    }

    // Quotes section
    const quotesContainer = document.getElementById('modalQuotes');
    if (quotesContainer) {
        const termQuotes = glossaire.quotes.filter(q =>
            q.relatedTerm === term.id ||
            q.relatedTerm === term.term ||
            (q.tags && q.tags.includes(term.term))
        );
        if (termQuotes.length > 0) {
            quotesContainer.innerHTML = '<div class="modal-field-label">citations</div>' +
                termQuotes.map(q => `
                    <blockquote class="modal-quote">
                        ${escapeHtml(q.text)}
                        <footer>— ${escapeHtml(q.author || '')}</footer>
                    </blockquote>
                `).join('');
            quotesContainer.style.display = '';
        } else {
            quotesContainer.innerHTML = '';
            quotesContainer.style.display = 'none';
        }
    }

    // Show modal
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function openRelatedEntry(termName) {
    // Find the term by name or id
    const term = glossaire.terms.find(t =>
        t.term === termName ||
        t.id === termName ||
        (t.term && t.term.toLowerCase() === termName.toLowerCase())
    );
    if (term) {
        openModal(term);
    }
}

function setModalField(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value || '';
        el.style.display = value ? '' : 'none';
    }
}

function toggleLabelVisibility(labelId, valueId) {
    const label = document.getElementById(labelId);
    const value = document.getElementById(valueId);
    if (label && value) {
        label.style.display = value.textContent ? '' : 'none';
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

    // Check for ?id= parameter and open that entry's modal
    const id = urlParams.get('id');
    if (id) {
        const term = glossaire.terms.find(t => t.id === id);
        if (term) {
            openModal(term);
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
