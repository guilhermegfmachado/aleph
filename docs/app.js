// Borges - Client-side library application
// Split data architecture: index loads first, full texts load on demand

let library = {
    books: [],      // Index data (metadata + snippets)
    loaded: false,
    textCache: {}   // Cache for loaded full texts
};

// Load library index
async function loadLibrary() {
    if (library.loaded) return;

    try {
        const response = await fetch('data/library-index.json');
        if (!response.ok) throw new Error('Failed to load library index');

        const data = await response.json();
        library.books = data.books || [];
        library.loaded = true;

        // Update UI counts
        updateStats();
        populateFilters();
        updateSourcesFooter();

    } catch (error) {
        console.error('Error loading library:', error);
        showError('Failed to load library. Make sure data/library-index.json exists.');
    }
}

// Load full text for a specific book
async function loadBookText(bookId) {
    // Check cache first
    if (library.textCache[bookId]) {
        return library.textCache[bookId];
    }

    try {
        const response = await fetch(`data/texts/${bookId}.json`);
        if (!response.ok) throw new Error('Failed to load book text');

        const book = await response.json();
        library.textCache[bookId] = book;
        return book;

    } catch (error) {
        console.error('Error loading book text:', error);
        return null;
    }
}

function updateStats() {
    const bookCount = document.getElementById('book-count');
    const authorCount = document.getElementById('author-count');

    if (bookCount) {
        bookCount.textContent = library.books.length.toLocaleString();
    }
    if (authorCount) {
        const authors = new Set(library.books.map(b => b.author));
        authorCount.textContent = authors.size.toLocaleString();
    }
}

function updateSourcesFooter() {
    const footer = document.getElementById('sources-footer');
    if (footer) {
        const sources = [...new Set(library.books.map(b => b.source))];
        const sourceNames = sources.map(s => s.replace(/_/g, ' ')).join(' / ');
        footer.textContent = 'sources: ' + (sourceNames || 'none loaded');
    }
}

function populateFilters() {
    const authorFilter = document.getElementById('author-filter');
    const sourceFilter = document.getElementById('source-filter');

    if (authorFilter) {
        const authors = [...new Set(library.books.map(b => b.author))].sort();
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorFilter.appendChild(option);
        });
    }

    if (sourceFilter) {
        const sources = [...new Set(library.books.map(b => b.source))].sort();
        sources.forEach(source => {
            const option = document.createElement('option');
            option.value = source;
            option.textContent = source.replace(/_/g, ' ');
            sourceFilter.appendChild(option);
        });
    }
}

// Search functionality - searches title, author, and snippet
function search(query, authorFilter = '', sourceFilter = '') {
    if (!query.trim()) return [];

    const queryLower = query.toLowerCase();
    const isExact = query.startsWith('"') && query.endsWith('"');
    const searchTerm = isExact ? query.slice(1, -1).toLowerCase() : queryLower;

    let results = library.books.filter(book => {
        // Apply filters
        if (authorFilter && book.author !== authorFilter) return false;
        if (sourceFilter && book.source !== sourceFilter) return false;

        // Search in title, author, and snippet
        const titleLower = (book.title || '').toLowerCase();
        const authorLower = (book.author || '').toLowerCase();
        const snippetLower = (book.snippet || '').toLowerCase();

        return titleLower.includes(searchTerm) ||
               authorLower.includes(searchTerm) ||
               snippetLower.includes(searchTerm);
    });

    // Add highlighted snippets
    results = results.map(book => {
        const snippet = getHighlightedSnippet(book.snippet || '', searchTerm);
        return { ...book, highlightedSnippet: snippet };
    });

    return results.slice(0, 100); // Limit results
}

function getHighlightedSnippet(snippet, term) {
    if (!snippet) return '';

    const lowerSnippet = snippet.toLowerCase();
    const index = lowerSnippet.indexOf(term);

    let displaySnippet = snippet;

    if (index !== -1) {
        // Show context around the match
        const start = Math.max(0, index - 80);
        const end = Math.min(snippet.length, index + term.length + 80);
        displaySnippet = snippet.slice(start, end);
        if (start > 0) displaySnippet = '...' + displaySnippet;
        if (end < snippet.length) displaySnippet = displaySnippet + '...';
    } else {
        // Just show first part of snippet
        displaySnippet = snippet.slice(0, 200);
        if (snippet.length > 200) displaySnippet += '...';
    }

    // Highlight the term
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    displaySnippet = displaySnippet.replace(regex, '<mark>$1</mark>');

    return displaySnippet;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showError(message) {
    const results = document.getElementById('results');
    if (results) {
        results.innerHTML = `<div class="error">${message}</div>`;
    }
}

function showResults(results, query) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return;

    if (results.length === 0) {
        resultsDiv.innerHTML = `
            <div class="no-results">
                no results found for "${escapeHtml(query)}"
            </div>
        `;
        return;
    }

    let html = `
        <div class="results-header">
            <h3>found ${results.length} result${results.length !== 1 ? 's' : ''} for "${escapeHtml(query)}"</h3>
        </div>
    `;

    results.forEach(book => {
        html += `
            <div class="result-card">
                <div class="result-header">
                    <a href="book.html?id=${book.id}&q=${encodeURIComponent(query)}" class="result-title">${escapeHtml(book.title)}</a>
                    <div class="result-author">${escapeHtml(book.author)}</div>
                </div>
                <div class="result-snippet">${book.highlightedSnippet}</div>
                <div class="result-meta">
                    <span class="result-source">${book.source.replace(/_/g, ' ')}</span>
                    <a href="book.html?id=${book.id}&q=${encodeURIComponent(query)}" class="read-more">read &rarr;</a>
                </div>
            </div>
        `;
    });

    resultsDiv.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize search page
document.addEventListener('DOMContentLoaded', async () => {
    await loadLibrary();

    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const authorFilter = document.getElementById('author-filter');
    const sourceFilter = document.getElementById('source-filter');

    if (searchBtn) {
        const doSearch = () => {
            const query = searchInput.value.trim();
            if (!query) return;

            const author = authorFilter ? authorFilter.value : '';
            const source = sourceFilter ? sourceFilter.value : '';

            const results = search(query, author, source);
            showResults(results, query);
        };

        searchBtn.addEventListener('click', doSearch);

        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') doSearch();
            });
        }
    }

    // Quick search links
    document.querySelectorAll('.quick-search').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const query = link.dataset.query;
            if (searchInput) searchInput.value = query;
            const results = search(query, '', '');
            showResults(results, query);
        });
    });
});

// Browse page
let browsePage = 1;
const booksPerPage = 20;

function initBrowse() {
    loadLibrary().then(() => {
        renderBrowseList();

        const authorFilter = document.getElementById('author-filter');
        const sourceFilter = document.getElementById('source-filter');
        const sortFilter = document.getElementById('sort-filter');

        [authorFilter, sourceFilter, sortFilter].forEach(filter => {
            if (filter) {
                filter.addEventListener('change', () => {
                    browsePage = 1;
                    renderBrowseList();
                });
            }
        });
    });
}

function renderBrowseList() {
    const listDiv = document.getElementById('book-list');
    const paginationDiv = document.getElementById('pagination');
    if (!listDiv) return;

    const authorFilter = document.getElementById('author-filter');
    const sourceFilter = document.getElementById('source-filter');
    const sortFilter = document.getElementById('sort-filter');

    let books = [...library.books];

    // Filter
    if (authorFilter && authorFilter.value) {
        books = books.filter(b => b.author === authorFilter.value);
    }
    if (sourceFilter && sourceFilter.value) {
        books = books.filter(b => b.source === sourceFilter.value);
    }

    // Sort
    const sortBy = sortFilter ? sortFilter.value : 'title';
    books.sort((a, b) => (a[sortBy] || '').localeCompare(b[sortBy] || ''));

    // Paginate
    const totalPages = Math.ceil(books.length / booksPerPage);
    const start = (browsePage - 1) * booksPerPage;
    const pageBooks = books.slice(start, start + booksPerPage);

    if (pageBooks.length === 0) {
        listDiv.innerHTML = '<div class="no-books">no books found</div>';
        if (paginationDiv) paginationDiv.innerHTML = '';
        return;
    }

    let html = '';
    pageBooks.forEach(book => {
        const snippet = (book.snippet || '').slice(0, 150) + '...';
        html += `
            <div class="book-card">
                <h3><a href="book.html?id=${book.id}">${escapeHtml(book.title)}</a></h3>
                <div class="book-meta">
                    ${escapeHtml(book.author)}
                    <span class="source">[${book.source.replace(/_/g, ' ')}]</span>
                </div>
                <div class="book-snippet">${escapeHtml(snippet)}</div>
            </div>
        `;
    });

    listDiv.innerHTML = html;

    // Pagination
    if (paginationDiv && totalPages > 1) {
        let pagHtml = '';
        if (browsePage > 1) {
            pagHtml += `<a href="#" onclick="gotoPage(${browsePage - 1}); return false;">&larr; prev</a>`;
        }
        pagHtml += `<span class="current">page ${browsePage} of ${totalPages}</span>`;
        if (browsePage < totalPages) {
            pagHtml += `<a href="#" onclick="gotoPage(${browsePage + 1}); return false;">next &rarr;</a>`;
        }
        paginationDiv.innerHTML = pagHtml;
    }
}

function gotoPage(page) {
    browsePage = page;
    renderBrowseList();
    window.scrollTo(0, 0);
}

// Book view page - loads full text on demand
async function initBookView() {
    await loadLibrary();

    const params = new URLSearchParams(window.location.search);
    const bookId = parseInt(params.get('id'));
    const searchQuery = params.get('q');

    const contentDiv = document.getElementById('book-content');

    // Show loading state
    const indexBook = library.books.find(b => b.id === bookId);
    if (indexBook) {
        document.title = `borges - ${indexBook.title}`;
        contentDiv.innerHTML = `
            <div class="book-header">
                <h1 class="book-title">${escapeHtml(indexBook.title)}</h1>
                <div class="book-author">${escapeHtml(indexBook.author)}</div>
            </div>
            <div class="loading">loading text...</div>
        `;
    }

    // Load full text
    const book = await loadBookText(bookId);

    if (!book) {
        contentDiv.innerHTML = '<div class="error">book not found or failed to load</div>';
        return;
    }

    document.title = `borges - ${book.title}`;

    let content = escapeHtml(book.content);

    // Highlight search term
    if (searchQuery) {
        const regex = new RegExp(`(${escapeRegex(searchQuery)})`, 'gi');
        content = content.replace(regex, '<span class="highlight" id="first-match">$1</span>');
        // Only mark first one
        let count = 0;
        content = content.replace(/id="first-match"/g, () => {
            count++;
            return count === 1 ? 'id="first-match"' : '';
        });
    }

    contentDiv.innerHTML = `
        <div class="book-header">
            <h1 class="book-title">${escapeHtml(book.title)}</h1>
            <div class="book-author">${escapeHtml(book.author)}</div>
            <div class="book-info">
                <span>source: ${book.source.replace(/_/g, ' ')}</span>
                ${book.url ? `<a href="${book.url}" target="_blank">original &rarr;</a>` : ''}
            </div>
        </div>
        <div class="book-content">
            <div class="text-body">${content}</div>
        </div>
        <div class="book-nav">
            <a href="browse.html">&larr; back to browse</a>
            ${searchQuery ? `<a href="index.html">new search</a>` : ''}
        </div>
    `;

    // Scroll to first match
    if (searchQuery) {
        setTimeout(() => {
            const firstMatch = document.getElementById('first-match');
            if (firstMatch) {
                firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }
}
