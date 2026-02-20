/**
 * Aleph Corpus Fetcher
 * Fetches all texts from docs/corpus/index.json and saves to docs/corpus/
 *
 * Run: node fetch_corpus.js
 * Requires: npm install node-fetch pdf-parse
 */

const fs = require('fs');
const path = require('path');

// Use dynamic import for node-fetch (ESM) or native fetch
let fetch;
(async () => {
  try {
    fetch = (await import('node-fetch')).default;
  } catch {
    fetch = globalThis.fetch;
  }
})();

// PDF parser
let pdfParse;
try {
  pdfParse = require('pdf-parse');
} catch {
  console.warn('pdf-parse not installed. PDF files will be skipped.');
}

const CORPUS_DIR = path.join(__dirname, 'docs', 'corpus');
const INDEX_PATH = path.join(CORPUS_DIR, 'index.json');
const MAX_PDF_CHARS = 80000;
const DELAY_MS = 1000;

// Source type detection
function getSourceType(url) {
  if (url.endsWith('.pdf')) return 'pdf';
  if (url.includes('gutenberg.org/cache/epub') && url.endsWith('.txt')) return 'gutenberg_txt';
  if (url.includes('gutenberg.net.au') || url.includes('gutenberg.ca')) return 'gutenberg_html';
  if (url.includes('un.org') && !url.endsWith('.pdf')) return 'html';
  if (url.includes('echr.coe.int') && !url.endsWith('.pdf')) return 'html';
  if (url.includes('hudoc.echr.coe.int')) return 'html';
  return 'html';
}

// Strip Gutenberg header/footer
function stripGutenbergTxt(text) {
  const startMatch = text.match(/\*\*\* START OF (THIS|THE) PROJECT GUTENBERG/i);
  const endMatch = text.match(/\*\*\* END OF (THIS|THE) PROJECT GUTENBERG/i);

  let result = text;
  if (startMatch) {
    const idx = text.indexOf(startMatch[0]);
    const lineEnd = text.indexOf('\n', idx);
    result = result.slice(lineEnd + 1);
  }
  if (endMatch) {
    const idx = result.search(/\*\*\* END OF (THIS|THE) PROJECT GUTENBERG/i);
    result = result.slice(0, idx);
  }
  return result.trim();
}

// Strip HTML tags
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch with retries
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AlephCorpusFetcher/1.0)',
          ...options.headers
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Fetch handlers by source type
async function fetchGutenbergTxt(url) {
  const response = await fetchWithRetry(url);
  const text = await response.text();
  return stripGutenbergTxt(text);
}

async function fetchGutenbergHtml(url) {
  const response = await fetchWithRetry(url);
  const html = await response.text();
  return stripHtml(html);
}

async function fetchHtml(url) {
  const response = await fetchWithRetry(url);
  const html = await response.text();
  return stripHtml(html);
}

async function fetchPdf(url) {
  if (!pdfParse) {
    throw new Error('pdf-parse not installed');
  }
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const data = await pdfParse(buffer);
  let text = data.text;

  if (text.length > MAX_PDF_CHARS) {
    text = text.slice(0, MAX_PDF_CHARS);
    // Try to end at sentence boundary
    const lastPeriod = text.lastIndexOf('.');
    if (lastPeriod > MAX_PDF_CHARS * 0.9) {
      text = text.slice(0, lastPeriod + 1);
    }
    text += '\n\n[EXCERPT — first section only]';
  }
  return text;
}

// Main fetch function
async function fetchEntry(entry) {
  const sourceType = getSourceType(entry.url);

  switch (sourceType) {
    case 'gutenberg_txt':
      return await fetchGutenbergTxt(entry.url);
    case 'gutenberg_html':
      return await fetchGutenbergHtml(entry.url);
    case 'pdf':
      return await fetchPdf(entry.url);
    case 'html':
    default:
      return await fetchHtml(entry.url);
  }
}

// Rate limit helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main
async function main() {
  // Wait for fetch to be available
  while (!fetch) {
    await delay(100);
  }

  console.log('=== Aleph Corpus Fetcher ===\n');

  // Read index
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('Error: docs/corpus/index.json not found');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));

  // Filter entries
  const toFetch = index.filter(e => e.file && e.url);
  const skipped = index.filter(e => !e.file);

  skipped.forEach(e => {
    console.log(`[skip] ${e.id} — reference-only, no local file`);
  });

  console.log(`\nTo fetch: ${toFetch.length}  |  Skipped: ${skipped.length}\n`);

  let successCount = 0;
  let failedCount = 0;
  const failed = [];

  for (let i = 0; i < toFetch.length; i++) {
    const entry = toFetch[i];
    const outPath = path.join(CORPUS_DIR, entry.file);

    // Skip if already exists
    if (fs.existsSync(outPath)) {
      console.log(`[${i + 1}/${toFetch.length}] ${entry.author} — ${entry.title}`);
      console.log(`  exists: ${entry.file}\n`);
      successCount++;
      continue;
    }

    console.log(`[${i + 1}/${toFetch.length}] ${entry.author} — ${entry.title}`);
    console.log(`  source: ${getSourceType(entry.url)}  url: ${entry.url.slice(0, 60)}...`);

    try {
      const text = await fetchEntry(entry);
      fs.writeFileSync(outPath, text, 'utf-8');
      console.log(`  OK: ${entry.file} (${text.length.toLocaleString()} chars)\n`);
      successCount++;
    } catch (err) {
      console.log(`  FAILED: ${entry.id} — ${err.message}\n`);
      failed.push({ id: entry.id, error: err.message });
      failedCount++;
    }

    // Rate limiting
    if (i < toFetch.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log('='.repeat(40));
  console.log(`Done. ${successCount}/${toFetch.length} files fetched. ${failedCount} failed.`);

  if (failed.length > 0) {
    console.log('\nFailed entries:');
    failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
