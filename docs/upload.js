// Upload functionality for user-added texts
// Uses IndexedDB for local storage and PDF.js for PDF extraction

// Initialize PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// IndexedDB setup
const DB_NAME = 'borges_user_library';
const DB_VERSION = 1;
const STORE_NAME = 'user_books';

let db = null;
let extractedContent = '';
let currentTab = 'pdf';

// Open/create IndexedDB
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('author', 'author', { unique: false });
            }
        };
    });
}

// Save book to IndexedDB
async function saveUserBook(book) {
    if (!db) await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        book.createdAt = new Date().toISOString();
        book.source = 'user_upload';

        const request = store.add(book);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Get all user books
async function getUserBooks() {
    if (!db) await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Delete user book
async function deleteUserBook(id) {
    if (!db) await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Get single user book
async function getUserBook(id) {
    if (!db) await openDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Extract text from PDF using PDF.js
async function extractTextFromPDF(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js not loaded');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    const totalPages = pdf.numPages;

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';

        // Update status
        document.getElementById('pdf-status').textContent = `extracting page ${i} of ${totalPages}...`;
    }

    return fullText.trim();
}

// Fetch content from URL (via proxy to avoid CORS)
async function fetchURLContent(url) {
    // Use a CORS proxy or fetch directly if same-origin
    // For demo, we'll try direct fetch first, then show instructions
    try {
        const response = await fetch(url);
        const html = await response.text();

        // Parse HTML and extract text content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove scripts, styles, nav, footer
        ['script', 'style', 'nav', 'footer', 'header', 'aside'].forEach(tag => {
            doc.querySelectorAll(tag).forEach(el => el.remove());
        });

        // Get main content or body
        const main = doc.querySelector('main, article, .content, #content, .post, .entry') || doc.body;
        return main ? main.textContent.trim() : '';

    } catch (error) {
        // CORS error - show instructions
        throw new Error('Could not fetch URL due to CORS restrictions. Try copying the text manually.');
    }
}

// Tab switching
function switchTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // Clear extracted content when switching tabs
    extractedContent = '';
    updateSaveButton();
}

// Update save button state
function updateSaveButton() {
    const titleInput = document.getElementById('title-input');
    const authorInput = document.getElementById('author-input');
    const saveBtn = document.getElementById('save-btn');

    let hasContent = false;

    if (currentTab === 'pdf') {
        hasContent = extractedContent.length > 100;
    } else if (currentTab === 'url') {
        hasContent = extractedContent.length > 100;
    } else if (currentTab === 'text') {
        const textInput = document.getElementById('text-input');
        hasContent = textInput && textInput.value.trim().length > 100;
    }

    const hasMetadata = titleInput.value.trim() && authorInput.value.trim();
    saveBtn.disabled = !(hasContent && hasMetadata);
}

// Clear PDF preview
function clearPdfPreview() {
    document.getElementById('pdf-preview').classList.add('hidden');
    document.getElementById('pdf-input').value = '';
    extractedContent = '';
    updateSaveButton();
}

// Render user books list
async function renderUserBooks() {
    const listDiv = document.getElementById('user-books-list');
    const countSpan = document.getElementById('user-book-count');
    if (!listDiv) return;

    try {
        const books = await getUserBooks();
        countSpan.textContent = `(${books.length})`;

        if (books.length === 0) {
            listDiv.innerHTML = '<p class="empty-state">no uploaded texts yet</p>';
            return;
        }

        let html = '';
        books.forEach(book => {
            const snippet = book.content.slice(0, 100) + '...';
            html += `
                <div class="user-book-card">
                    <div class="user-book-info">
                        <a href="book.html?user=${book.id}" class="user-book-title">${escapeHtml(book.title)}</a>
                        <div class="user-book-author">${escapeHtml(book.author)}</div>
                        <div class="user-book-snippet">${escapeHtml(snippet)}</div>
                    </div>
                    <button class="btn-delete" onclick="confirmDeleteBook(${book.id})" title="Delete">×</button>
                </div>
            `;
        });

        listDiv.innerHTML = html;
    } catch (error) {
        console.error('Error loading user books:', error);
        listDiv.innerHTML = '<p class="error">Error loading your books</p>';
    }
}

// Confirm and delete book
async function confirmDeleteBook(id) {
    if (confirm('Delete this text from your library?')) {
        try {
            await deleteUserBook(id);
            await renderUserBooks();
            // Also update the main library if we're integrating
            if (typeof reloadLibraryWithUserBooks === 'function') {
                reloadLibraryWithUserBooks();
            }
        } catch (error) {
            console.error('Error deleting book:', error);
            alert('Failed to delete book');
        }
    }
}

// Save the current book
async function saveBook() {
    const titleInput = document.getElementById('title-input');
    const authorInput = document.getElementById('author-input');
    const languageInput = document.getElementById('language-input');
    const sourceUrlInput = document.getElementById('source-url-input');
    const saveStatus = document.getElementById('save-status');
    const saveBtn = document.getElementById('save-btn');

    let content = '';

    if (currentTab === 'pdf' || currentTab === 'url') {
        content = extractedContent;
    } else if (currentTab === 'text') {
        content = document.getElementById('text-input').value.trim();
    }

    if (!content || content.length < 100) {
        saveStatus.textContent = 'Content too short (min 100 chars)';
        saveStatus.className = 'save-status error';
        return;
    }

    const book = {
        title: titleInput.value.trim(),
        author: authorInput.value.trim(),
        content: content,
        language: languageInput.value,
        url: sourceUrlInput.value.trim() || null,
        snippet: content.slice(0, 1000)
    };

    try {
        saveBtn.disabled = true;
        saveStatus.textContent = 'saving...';
        saveStatus.className = 'save-status';

        await saveUserBook(book);

        saveStatus.textContent = 'saved!';
        saveStatus.className = 'save-status success';

        // Clear form
        titleInput.value = '';
        authorInput.value = '';
        sourceUrlInput.value = '';
        document.getElementById('text-input').value = '';
        extractedContent = '';
        clearPdfPreview();

        // Refresh list
        await renderUserBooks();

        // Reload main library integration
        if (typeof reloadLibraryWithUserBooks === 'function') {
            reloadLibraryWithUserBooks();
        }

    } catch (error) {
        console.error('Error saving book:', error);
        saveStatus.textContent = 'Error saving';
        saveStatus.className = 'save-status error';
    } finally {
        updateSaveButton();
    }
}

// Initialize upload page
document.addEventListener('DOMContentLoaded', async () => {
    await openDB();
    await renderUserBooks();

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // PDF drag and drop
    const dropzone = document.getElementById('pdf-dropzone');
    const pdfInput = document.getElementById('pdf-input');

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

            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/pdf') {
                await handlePDFFile(files[0]);
            }
        });
    }

    if (pdfInput) {
        pdfInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await handlePDFFile(e.target.files[0]);
            }
        });
    }

    // URL fetch button
    const fetchUrlBtn = document.getElementById('fetch-url-btn');
    if (fetchUrlBtn) {
        fetchUrlBtn.addEventListener('click', async () => {
            const urlInput = document.getElementById('url-input');
            const statusDiv = document.getElementById('url-status');
            const previewDiv = document.getElementById('url-preview');
            const textPreview = document.getElementById('url-text-preview');

            if (!urlInput.value.trim()) return;

            previewDiv.classList.remove('hidden');
            statusDiv.textContent = 'fetching...';

            try {
                const content = await fetchURLContent(urlInput.value.trim());
                extractedContent = content;

                if (content.length > 0) {
                    statusDiv.textContent = `extracted ${content.length.toLocaleString()} characters`;
                    textPreview.textContent = content.slice(0, 500) + '...';
                } else {
                    statusDiv.textContent = 'No content found';
                }
            } catch (error) {
                statusDiv.textContent = error.message;
                statusDiv.className = 'preview-status error';
            }

            updateSaveButton();
        });
    }

    // Text input change
    const textInput = document.getElementById('text-input');
    if (textInput) {
        textInput.addEventListener('input', updateSaveButton);
    }

    // Metadata input changes
    document.getElementById('title-input').addEventListener('input', updateSaveButton);
    document.getElementById('author-input').addEventListener('input', updateSaveButton);

    // Save button
    document.getElementById('save-btn').addEventListener('click', saveBook);
});

// Handle PDF file
async function handlePDFFile(file) {
    const preview = document.getElementById('pdf-preview');
    const filename = document.getElementById('pdf-filename');
    const status = document.getElementById('pdf-status');
    const textPreview = document.getElementById('pdf-text-preview');

    preview.classList.remove('hidden');
    filename.textContent = file.name;
    status.textContent = 'extracting text...';
    textPreview.textContent = '';

    try {
        const text = await extractTextFromPDF(file);
        extractedContent = text;

        if (text.length > 0) {
            status.textContent = `extracted ${text.length.toLocaleString()} characters`;
            textPreview.textContent = text.slice(0, 500) + '...';

            // Try to auto-fill title from filename
            const titleInput = document.getElementById('title-input');
            if (!titleInput.value) {
                titleInput.value = file.name.replace('.pdf', '').replace(/[-_]/g, ' ');
            }
        } else {
            status.textContent = 'No text found (might be scanned images)';
            status.className = 'preview-status error';
        }
    } catch (error) {
        console.error('PDF extraction error:', error);
        status.textContent = 'Error extracting text: ' + error.message;
        status.className = 'preview-status error';
    }

    updateSaveButton();
}

// Helper - escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export for integration with main app
window.getUserBooks = getUserBooks;
window.getUserBook = getUserBook;
window.confirmDeleteBook = confirmDeleteBook;
