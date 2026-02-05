// Bulk upload with auto-processing
// No forms to fill - just drop files and go

// PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// IndexedDB setup
const DB_NAME = 'borges_user_library';
const DB_VERSION = 1;
const STORE_NAME = 'user_books';
let db = null;

// Open database
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('author', 'author', { unique: false });
            }
        };
    });
}

// Save book
async function saveBook(book) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        book.createdAt = new Date().toISOString();
        book.source = 'user_upload';
        const request = store.add(book);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get all books
async function getUserBooks() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Get single book
async function getUserBook(id) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete book
async function deleteBook(id) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Clear all books
async function clearAllBooks() {
    if (!confirm('Delete all books from your library?')) return;
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => {
            renderUserBooks();
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// Extract title from filename
function titleFromFilename(filename) {
    return filename
        .replace(/\.[^/.]+$/, '')  // Remove extension
        .replace(/[-_]/g, ' ')      // Replace dashes/underscores with spaces
        .replace(/\s+/g, ' ')       // Collapse multiple spaces
        .trim();
}

// Extract text from PDF
async function extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    let metadata = {};

    // Try to get metadata
    try {
        const meta = await pdf.getMetadata();
        if (meta.info) {
            metadata.title = meta.info.Title;
            metadata.author = meta.info.Author;
        }
    } catch (e) {}

    // Extract text from all pages
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n\n';
    }

    return { text: text.trim(), metadata };
}

// Extract text from EPUB
async function extractEpubText(file) {
    if (typeof JSZip === 'undefined') throw new Error('JSZip not loaded');

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    let text = '';
    const contentFiles = Object.keys(zip.files)
        .filter(name => name.endsWith('.xhtml') || name.endsWith('.html') || name.endsWith('.htm'))
        .sort();

    for (const fileName of contentFiles) {
        const content = await zip.files[fileName].async('text');
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        text += (doc.body ? doc.body.textContent : '') + '\n\n';
    }

    return { text: text.trim(), metadata: {} };
}

// Extract text from TXT
async function extractTxtText(file) {
    const text = await file.text();
    return { text: text.trim(), metadata: {} };
}

// Process a single file
async function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let result;

    if (ext === 'pdf') {
        result = await extractPdfText(file);
    } else if (ext === 'epub') {
        result = await extractEpubText(file);
    } else {
        result = await extractTxtText(file);
    }

    if (!result.text || result.text.length < 100) {
        throw new Error('No text extracted (or too short)');
    }

    // Build book object with auto-detected metadata
    const book = {
        title: result.metadata.title || titleFromFilename(file.name),
        author: result.metadata.author || 'Unknown',
        content: result.text,
        language: 'english',
        snippet: result.text.slice(0, 1000),
        filename: file.name
    };

    return book;
}

// Process multiple files
async function processFiles(files) {
    const statusDiv = document.getElementById('processing-status');
    const statusText = document.getElementById('status-text');
    const queueDiv = document.getElementById('upload-queue');
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');

    if (files.length === 0) return;

    statusDiv.classList.remove('hidden');
    queueDiv.classList.remove('hidden');
    queueCount.textContent = files.length;
    queueList.innerHTML = '';

    let processed = 0;
    let failed = 0;

    for (const file of files) {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'queue-item';
        itemDiv.innerHTML = `<span class="filename">${escapeHtml(file.name)}</span><span class="status">processing...</span>`;
        queueList.appendChild(itemDiv);

        statusText.textContent = `processing ${processed + 1} of ${files.length}...`;

        try {
            const book = await processFile(file);
            await saveBook(book);
            itemDiv.querySelector('.status').textContent = '✓';
            itemDiv.querySelector('.status').className = 'status success';
            processed++;
        } catch (error) {
            console.error(`Error processing ${file.name}:`, error);
            itemDiv.querySelector('.status').textContent = '✗ ' + error.message;
            itemDiv.querySelector('.status').className = 'status error';
            failed++;
        }
    }

    statusText.textContent = `done! ${processed} added${failed ? `, ${failed} failed` : ''}`;
    setTimeout(() => {
        statusDiv.classList.add('hidden');
        queueDiv.classList.add('hidden');
    }, 3000);

    await renderUserBooks();
}

// Render books list
async function renderUserBooks() {
    const listDiv = document.getElementById('user-books-list');
    const countSpan = document.getElementById('user-book-count');
    if (!listDiv) return;

    try {
        const books = await getUserBooks();
        if (countSpan) countSpan.textContent = `(${books.length})`;

        if (books.length === 0) {
            listDiv.innerHTML = '<p class="empty-state">no texts yet - drop some files above</p>';
            return;
        }

        listDiv.innerHTML = books.map(book => `
            <div class="user-book-card">
                <div class="user-book-info">
                    <a href="book.html?user=${book.id}" class="user-book-title">${escapeHtml(book.title)}</a>
                    <div class="user-book-author">${escapeHtml(book.author)}</div>
                </div>
                <button class="btn-delete" onclick="confirmDeleteBook(${book.id})" title="Delete">×</button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading books:', error);
        listDiv.innerHTML = '<p class="error">Error loading books</p>';
    }
}

// Confirm and delete
async function confirmDeleteBook(id) {
    if (confirm('Delete this book?')) {
        await deleteBook(id);
        await renderUserBooks();
    }
}

// GitHub integration
function getGitHubSettings() {
    return {
        token: localStorage.getItem('github_token') || '',
        repo: localStorage.getItem('github_repo') || ''
    };
}

function saveGitHubToken() {
    const token = document.getElementById('github-token').value.trim();
    const repo = document.getElementById('github-repo').value.trim();
    localStorage.setItem('github_token', token);
    localStorage.setItem('github_repo', repo);
    alert('Settings saved!');
}

function loadGitHubSettings() {
    const settings = getGitHubSettings();
    const tokenInput = document.getElementById('github-token');
    const repoInput = document.getElementById('github-repo');
    if (tokenInput && settings.token) tokenInput.value = settings.token;
    if (repoInput && settings.repo) repoInput.value = settings.repo;
}

// Publish library to GitHub
async function publishToGitHub() {
    const settings = getGitHubSettings();

    if (!settings.token || !settings.repo) {
        alert('Please configure GitHub settings first (click "GitHub settings" below)');
        document.querySelector('.github-settings').open = true;
        return;
    }

    const books = await getUserBooks();
    if (books.length === 0) {
        alert('No books to publish');
        return;
    }

    // Build library JSON
    const libraryData = {
        books: books.map((b, idx) => ({
            id: idx + 1,
            title: b.title,
            author: b.author,
            source: 'user_upload',
            language: b.language || 'english',
            snippet: (b.content || '').slice(0, 1000)
        })),
        texts: books.map((b, idx) => ({
            id: idx + 1,
            content: b.content
        })),
        publishedAt: new Date().toISOString(),
        totalBooks: books.length
    };

    const content = JSON.stringify(libraryData, null, 2);
    const contentBase64 = btoa(unescape(encodeURIComponent(content)));

    try {
        const statusHint = document.getElementById('publish-hint');
        statusHint.textContent = 'Publishing...';

        // Check if file exists (to get SHA for update)
        const [owner, repo] = settings.repo.split('/');
        const path = 'docs/data/shared-library.json';
        let sha = null;

        try {
            const existing = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
                headers: { 'Authorization': `token ${settings.token}` }
            });
            if (existing.ok) {
                const data = await existing.json();
                sha = data.sha;
            }
        } catch (e) {}

        // Create or update file
        const body = {
            message: `Update library (${books.length} books)`,
            content: contentBase64,
            branch: 'main'
        };
        if (sha) body.sha = sha;

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${settings.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to publish');
        }

        statusHint.textContent = `Published ${books.length} books! Everyone can see them now.`;
        statusHint.style.color = '#4a4';

    } catch (error) {
        console.error('Publish error:', error);
        alert('Publish failed: ' + error.message);
        document.getElementById('publish-hint').textContent = 'Publish failed. Check your GitHub settings.';
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    await renderUserBooks();
    loadGitHubSettings();

    // Drag and drop
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');

    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            await processFiles(Array.from(e.dataTransfer.files));
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            await processFiles(Array.from(e.target.files));
            e.target.value = '';
        });
    }
});

// Exports
window.getUserBooks = getUserBooks;
window.getUserBook = getUserBook;
window.confirmDeleteBook = confirmDeleteBook;
window.clearAllBooks = clearAllBooks;
window.publishToGitHub = publishToGitHub;
window.saveGitHubToken = saveGitHubToken;
