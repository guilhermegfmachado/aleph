// aleph - upload handling

var UPLOAD_DB_NAME = 'aleph_library';
var UPLOAD_STORE_NAME = 'texts';
var uploadDb = null;

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

async function openUploadDB() {
    if (uploadDb) return uploadDb;
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(UPLOAD_DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { uploadDb = req.result; resolve(uploadDb); };
        req.onupgradeneeded = e => {
            const store = e.target.result.createObjectStore(UPLOAD_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('title', 'title');
            store.createIndex('author', 'author');
        };
    });
}

async function saveBook(book) {
    await openUploadDB();
    return new Promise((resolve, reject) => {
        const tx = uploadDb.transaction([UPLOAD_STORE_NAME], 'readwrite');
        book.createdAt = new Date().toISOString();
        const req = tx.objectStore(UPLOAD_STORE_NAME).add(book);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getUserBooks() {
    await openUploadDB();
    return new Promise((resolve, reject) => {
        const req = uploadDb.transaction([UPLOAD_STORE_NAME], 'readonly').objectStore(UPLOAD_STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

async function deleteBook(id) {
    await openUploadDB();
    return new Promise((resolve, reject) => {
        const req = uploadDb.transaction([UPLOAD_STORE_NAME], 'readwrite').objectStore(UPLOAD_STORE_NAME).delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function clearAllBooks() {
    if (!confirm('Supprimer tous les textes ?')) return;
    await openUploadDB();
    return new Promise((resolve, reject) => {
        const req = uploadDb.transaction([UPLOAD_STORE_NAME], 'readwrite').objectStore(UPLOAD_STORE_NAME).clear();
        req.onsuccess = () => { renderUserBooks(); resolve(); };
        req.onerror = () => reject(req.error);
    });
}

function titleFromFilename(name) {
    return name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim();
}

// Normalize text for consistent readability
function normalizeText(text) {
    return text
        // Normalize line endings
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Fix common OCR/PDF artifacts
        .replace(/\s*-\s*\n\s*/g, '')  // Remove hyphenation at line breaks
        .replace(/(\w)\s*\n\s*(\w)/g, '$1 $2')  // Join broken words
        // Normalize whitespace
        .replace(/[ \t]+/g, ' ')  // Multiple spaces/tabs to single space
        .replace(/\n{3,}/g, '\n\n')  // Max 2 newlines (1 blank line)
        .replace(/^\s+|\s+$/gm, '')  // Trim each line
        // Normalize quotes and dashes
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/…/g, '...')
        // Remove page numbers (common patterns)
        .replace(/\n\s*\d+\s*\n/g, '\n\n')
        .replace(/\n\s*-\s*\d+\s*-\s*\n/g, '\n\n')
        .replace(/\n\s*Page\s+\d+\s*\n/gi, '\n\n')
        // Clean up common header/footer patterns
        .replace(/\n\s*(Chapter|Section|Part)\s+(\d+|[IVXLC]+)\s*\n/gi, '\n\n$1 $2\n\n')
        // Final cleanup
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    // Make a copy for base64 conversion (PDF.js may detach the original buffer)
    const uint8Array = new Uint8Array(arrayBuffer);
    const uint8Copy = new Uint8Array(uint8Array);

    const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
    let text = '', meta = {};

    try {
        const m = await pdf.getMetadata();
        if (m.info) { meta.title = m.info.Title; meta.author = m.info.Author; }
    } catch (e) {}

    // Extract some text for search/classification (first few pages)
    const maxPages = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n\n';
    }

    // Store original PDF as base64 for proper rendering (using the copy)
    const base64 = btoa(uint8Copy.reduce((data, byte) => data + String.fromCharCode(byte), ''));

    return {
        text: text.trim(),
        meta,
        pdfData: base64,
        pageCount: pdf.numPages,
        isPdf: true
    };
}

async function extractEpubText(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let text = '';
    const files = Object.keys(zip.files).filter(n => /\.(x?html?)$/.test(n)).sort();

    for (const f of files) {
        const content = await zip.files[f].async('text');
        const doc = new DOMParser().parseFromString(content, 'text/html');
        text += (doc.body?.textContent || '') + '\n\n';
    }
    return { text: text.trim(), meta: {} };
}

async function extractTxtText(file) {
    return { text: (await file.text()).trim(), meta: {} };
}

async function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let result;

    try {
        if (ext === 'pdf') {
            if (typeof pdfjsLib === 'undefined') throw new Error('bibliothèque PDF non chargée');
            result = await extractPdfText(file);
        } else if (ext === 'epub') {
            if (typeof JSZip === 'undefined') throw new Error('bibliothèque EPUB non chargée');
            result = await extractEpubText(file);
        } else {
            result = await extractTxtText(file);
        }
    } catch (e) {
        console.error('Extraction error:', e);
        throw new Error('extraction échouée : ' + e.message);
    }

    if (!result.text || result.text.length < 50) throw new Error('texte trop court ou vide');

    // Normalize text for consistent formatting
    const normalizedText = normalizeText(result.text);

    // Run classification
    const classification = window.Classifier ? Classifier.classify(normalizedText, result.meta) : null;

    return {
        title: result.meta.title || titleFromFilename(file.name),
        author: result.meta.author || 'Unknown',
        content: normalizedText,
        snippet: normalizedText.slice(0, 1000),
        filename: file.name,
        // PDF data for rendering
        pdfData: result.pdfData || null,
        pageCount: result.pageCount || null,
        isPdf: result.isPdf || false,
        // Classification data
        classification: classification,
        type: classification?.type?.primary || 'unclassified',
        period: classification?.period?.period || 'unknown',
        tags: classification?.tags || [],
        metadata: classification?.metadata || {}
    };
}

async function processFiles(files) {
    if (!files.length) return;

    const status = document.getElementById('processing-status');
    const statusText = document.getElementById('status-text');
    const queue = document.getElementById('upload-queue');
    const queueList = document.getElementById('queue-list');
    const queueCount = document.getElementById('queue-count');

    status.classList.remove('hidden');
    queue.classList.remove('hidden');
    queueCount.textContent = files.length;
    queueList.innerHTML = '';

    let ok = 0, fail = 0;

    for (const file of files) {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `<span class="filename">${escapeHtml(file.name)}</span><span class="status">...</span>`;
        queueList.appendChild(item);
        statusText.textContent = `${ok + fail + 1} sur ${files.length}`;

        try {
            await saveBook(await processFile(file));
            item.querySelector('.status').textContent = 'ok';
            item.querySelector('.status').className = 'status success';
            ok++;
        } catch (e) {
            item.querySelector('.status').textContent = e.message;
            item.querySelector('.status').className = 'status error';
            fail++;
        }
    }

    statusText.textContent = `terminé : ${ok} ajouté${ok > 1 ? 's' : ''}` + (fail ? `, ${fail} échoué${fail > 1 ? 's' : ''}` : '');
    await renderUserBooks();
    if (ok > 0) await autoPublish();

    setTimeout(() => {
        status.classList.add('hidden');
        queue.classList.add('hidden');
    }, 3000);
}

async function renderUserBooks() {
    const list = document.getElementById('user-books-list');
    const count = document.getElementById('user-book-count');
    if (!list) return;

    const books = await getUserBooks();
    if (count) count.textContent = books.length;

    if (!books.length) {
        list.innerHTML = '<p class="empty-state">aucun texte pour l\'instant</p>';
        return;
    }

    list.innerHTML = books.map(b => `
        <div class="user-book-card">
            <div class="user-book-info">
                <a href="book.html?user=${b.id}" class="user-book-title">${escapeHtml(b.title)}</a>
                <div class="user-book-author">${escapeHtml(b.author)}</div>
                ${b.tags && b.tags.length ? `<div class="user-book-tags">${b.tags.slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            </div>
            <button class="btn-delete" onclick="confirmDeleteBook(${b.id})">x</button>
        </div>
    `).join('');
}

async function confirmDeleteBook(id) {
    if (confirm('Supprimer ce texte ?')) {
        await deleteBook(id);
        await renderUserBooks();
    }
}

// GitHub
function getGitHubSettings() {
    return {
        token: localStorage.getItem('github_token') || '',
        repo: localStorage.getItem('github_repo') || ''
    };
}

function saveGitHubToken() {
    localStorage.setItem('github_token', document.getElementById('github-token').value.trim());
    localStorage.setItem('github_repo', document.getElementById('github-repo').value.trim());
    alert('Enregistré');
}

function loadGitHubSettings() {
    const s = getGitHubSettings();
    const t = document.getElementById('github-token');
    const r = document.getElementById('github-repo');
    if (t && s.token) t.value = s.token;
    if (r && s.repo) r.value = s.repo;
}

async function autoPublish() {
    const s = getGitHubSettings();
    if (s.token && s.repo) await publishToGitHub(true);
}

async function publishToGitHub(silent = false) {
    const hint = document.getElementById('publish-hint');
    const s = getGitHubSettings();
    if (!s.token || !s.repo) {
        if (!silent) {
            if (hint) hint.textContent = 'configurez les paramètres ci-dessous';
            document.querySelector('.github-settings').open = true;
        }
        return;
    }

    const books = await getUserBooks();
    if (!books.length) {
        if (!silent) alert('Aucun texte à publier');
        return;
    }

    const data = {
        books: books.map((b, i) => ({
            id: i + 1,
            title: b.title,
            author: b.author,
            source: 'shared',
            snippet: (b.content || '').slice(0, 1000)
        })),
        texts: books.map((b, i) => ({ id: i + 1, content: b.content })),
        publishedAt: new Date().toISOString(),
        count: books.length
    };

    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const [owner, repo] = s.repo.split('/');
    const path = 'docs/data/shared-library.json';

    try {
        if (!silent && hint) hint.textContent = 'publication en cours...';

        let sha = null;
        try {
            const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
                headers: { Authorization: `token ${s.token}` }
            });
            if (res.ok) sha = (await res.json()).sha;
        } catch (e) {}

        const body = { message: `Update library (${books.length})`, content, branch: 'main' };
        if (sha) body.sha = sha;

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: { Authorization: `token ${s.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error((await res.json()).message || 'Failed');

        if (hint) { hint.textContent = `${books.length} texte(s) publié(s)`; hint.style.color = '#4a4'; }
    } catch (e) {
        if (!silent) alert('Publication échouée : ' + e.message);
        if (hint) hint.textContent = 'publication échouée';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Init
console.log('upload.js: script loaded');
document.addEventListener('DOMContentLoaded', async () => {
    console.log('upload.js: DOMContentLoaded fired');
    try {
        await openUploadDB();
        await renderUserBooks();
    } catch (e) {
        console.error('upload.js: init error', e);
    }

    const drop = document.getElementById('dropzone');
    const input = document.getElementById('file-input');

    if (drop) {
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
        drop.addEventListener('drop', async e => {
            e.preventDefault();
            drop.classList.remove('dragover');
            await processFiles(Array.from(e.dataTransfer.files));
        });
        // Make entire dropzone clickable
        drop.addEventListener('click', e => {
            if (e.target.tagName !== 'BUTTON' && input) input.click();
        });
    }

    if (input) {
        console.log('upload.js: file input found, attaching listener');
        input.addEventListener('change', async e => {
            console.log('upload.js: file change event fired', e.target.files);
            await processFiles(Array.from(e.target.files));
            e.target.value = '';
        });
    } else {
        console.error('upload.js: file-input element not found!');
    }
});

window.getUserBooks = getUserBooks;
window.confirmDeleteBook = confirmDeleteBook;
window.clearAllBooks = clearAllBooks;
window.publishToGitHub = publishToGitHub;
window.saveGitHubToken = saveGitHubToken;
