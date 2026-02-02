// Borges - Client-side library application
// Split data architecture: index loads first, full texts load on demand

let library = {
    books: [],      // Index data (metadata + snippets)
    userBooks: [],  // User-uploaded books from IndexedDB
    loaded: false,
    textCache: {}   // Cache for loaded full texts
};

// IndexedDB for user books
const USER_DB_NAME = 'borges_user_library';
const USER_DB_VERSION = 1;
const USER_STORE_NAME = 'user_books';
let userDB = null;

async function openUserDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(USER_DB_NAME, USER_DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            userDB = request.result;
            resolve(userDB);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(USER_STORE_NAME)) {
                db.createObjectStore(USER_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function loadUserBooks() {
    try {
        if (!userDB) await openUserDB();
        return new Promise((resolve, reject) => {
            const tx = userDB.transaction([USER_STORE_NAME], 'readonly');
            const store = tx.objectStore(USER_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const books = request.result || [];
                // Mark as user books and add user_ prefix to IDs to avoid conflicts
                library.userBooks = books.map(b => ({
                    ...b,
                    id: 'user_' + b.id,
                    source: 'user_upload',
                    isUserBook: true
                }));
                resolve(library.userBooks);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.warn('Could not load user books:', e);
        library.userBooks = [];
        return [];
    }
}

// Get single user book
async function loadUserBookText(bookId) {
    const numericId = parseInt(bookId.replace('user_', ''));
    try {
        if (!userDB) await openUserDB();
        return new Promise((resolve, reject) => {
            const tx = userDB.transaction([USER_STORE_NAME], 'readonly');
            const store = tx.objectStore(USER_STORE_NAME);
            const request = store.get(numericId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('Error loading user book:', e);
        return null;
    }
}

// Reload library with fresh user books
async function reloadLibraryWithUserBooks() {
    await loadUserBooks();
    updateStats();
    populateFilters();
}

// Load library index
async function loadLibrary() {
    if (library.loaded) return;

    try {
        // Load main library
        const response = await fetch('data/library-index.json');
        if (!response.ok) throw new Error('Failed to load library index');

        const data = await response.json();
        library.books = data.books || [];

        // Also load user books
        await loadUserBooks();

        library.loaded = true;

        // Update UI counts
        updateStats();
        populateFilters();
        updateSourcesFooter();

    } catch (error) {
        console.error('Error loading library:', error);
        // Try to still load user books even if main library fails
        await loadUserBooks();
        library.loaded = true;
        updateStats();
        showError('Main library failed to load, but your uploaded books are available.');
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

function getAllBooks() {
    // Combine main library + user books
    return [...library.books, ...library.userBooks];
}

function updateStats() {
    const bookCount = document.getElementById('book-count');
    const authorCount = document.getElementById('author-count');
    const allBooks = getAllBooks();

    if (bookCount) {
        bookCount.textContent = allBooks.length.toLocaleString();
    }
    if (authorCount) {
        const authors = new Set(allBooks.map(b => b.author));
        authorCount.textContent = authors.size.toLocaleString();
    }
}

function updateSourcesFooter() {
    const footer = document.getElementById('sources-footer');
    if (footer) {
        const allBooks = getAllBooks();
        const sources = [...new Set(allBooks.map(b => b.source))];
        const sourceNames = sources.map(s => s.replace(/_/g, ' ')).join(' / ');
        footer.textContent = 'sources: ' + (sourceNames || 'none loaded');
    }
}

function populateFilters() {
    const authorFilter = document.getElementById('author-filter');
    const sourceFilter = document.getElementById('source-filter');
    const allBooks = getAllBooks();

    if (authorFilter) {
        // Clear existing options except first
        while (authorFilter.options.length > 1) {
            authorFilter.remove(1);
        }
        const authors = [...new Set(allBooks.map(b => b.author))].sort();
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            authorFilter.appendChild(option);
        });
    }

    if (sourceFilter) {
        // Clear existing options except first
        while (sourceFilter.options.length > 1) {
            sourceFilter.remove(1);
        }
        const sources = [...new Set(allBooks.map(b => b.source))].sort();
        sources.forEach(source => {
            const option = document.createElement('option');
            option.value = source;
            option.textContent = source.replace(/_/g, ' ');
            sourceFilter.appendChild(option);
        });
    }
}

// Search functionality - searches title, author, and snippet (including user books)
function search(query, authorFilter = '', sourceFilter = '') {
    if (!query.trim()) return [];

    const queryLower = query.toLowerCase();
    const isExact = query.startsWith('"') && query.endsWith('"');
    const searchTerm = isExact ? query.slice(1, -1).toLowerCase() : queryLower;

    const allBooks = getAllBooks();
    let results = allBooks.filter(book => {
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

    let books = [...getAllBooks()];

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
    const bookIdParam = params.get('id');
    const userIdParam = params.get('user');  // For user-uploaded books
    const searchQuery = params.get('q');

    const contentDiv = document.getElementById('book-content');

    let book = null;
    let indexBook = null;

    // Check if it's a user book
    if (userIdParam) {
        const userBook = await loadUserBookText('user_' + userIdParam);
        if (userBook) {
            book = userBook;
            indexBook = userBook;
        }
    } else if (bookIdParam) {
        const bookId = parseInt(bookIdParam);
        // Show loading state
        indexBook = library.books.find(b => b.id === bookId);
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
        book = await loadBookText(bookId);
    }

    // Legacy loading for non-user books if book not yet loaded
    if (!book && bookIdParam) {
        book = await loadBookText(parseInt(bookIdParam));
    }

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
