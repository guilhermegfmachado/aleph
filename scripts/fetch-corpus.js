#!/usr/bin/env node
/**
 * Aleph Corpus Fetcher
 * Fetches all texts listed in docs/corpus/index.json
 *
 * Handles:
 *   - Gutenberg plain text (strip *** START/END markers)
 *   - Gutenberg Australia HTML (strip tags)
 *   - HTML pages (UN, ECHR, etc.) — strip to plain text
 *   - PDFs — extract text via pdf-parse (first 50k chars for large docs)
 *   - Reference-only entries (file: null) — skipped
 *
 * Run: node scripts/fetch-corpus.js
 * Requires: npm install pdf-parse (in scripts/)
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const ROOT       = path.join(__dirname, '..');
const CORPUS_DIR = path.join(ROOT, 'docs', 'corpus');
const INDEX_PATH = path.join(CORPUS_DIR, 'index.json');

// Max characters to store (for large PDFs/documents)
const MAX_CHARS = 50000;

// Rate limiting
const DELAY_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Source URL map ────────────────────────────────────────────────────────────
// Maps entry id → { url, method }
// method: 'gutenberg-txt' | 'gutenberg-html' | 'html' | 'pdf'
const SOURCES = {
  // Philosophy — Greek & Latin
  'plato-symposium':             { url: 'https://www.gutenberg.org/cache/epub/1600/pg1600.txt',  method: 'gutenberg-txt' },
  'plato-phaedo':                { url: 'https://www.gutenberg.org/cache/epub/1658/pg1658.txt',  method: 'gutenberg-txt' },
  'aristotle-nicomachean-ethics':{ url: 'https://www.gutenberg.org/cache/epub/8438/pg8438.txt',  method: 'gutenberg-txt' },
  'marcus-aurelius-meditations': { url: 'https://www.gutenberg.org/cache/epub/2680/pg2680.txt',  method: 'gutenberg-txt' },
  'lucretius-de-rerum-natura':   { url: 'https://www.gutenberg.org/cache/epub/785/pg785.txt',    method: 'gutenberg-txt' },
  'seneca-letters-from-a-stoic': { url: 'https://www.gutenberg.org/cache/epub/1583/pg1583.txt',  method: 'gutenberg-txt' },
  'epictetus-enchiridion':       { url: 'https://www.gutenberg.org/cache/epub/45109/pg45109.txt',method: 'gutenberg-txt' },
  // Philosophy — Modern
  'nietzsche-beyond-good-and-evil':     { url: 'https://www.gutenberg.org/cache/epub/4363/pg4363.txt',  method: 'gutenberg-txt' },
  'nietzsche-thus-spoke-zarathustra':   { url: 'https://www.gutenberg.org/cache/epub/1998/pg1998.txt',  method: 'gutenberg-txt' },
  'nietzsche-birth-of-tragedy':         { url: 'https://www.gutenberg.org/cache/epub/51356/pg51356.txt',method: 'gutenberg-txt' },
  'pascal-pensees':                     { url: 'https://www.gutenberg.org/cache/epub/18269/pg18269.txt',method: 'gutenberg-txt' },
  'spinoza-ethics':                     { url: 'https://www.gutenberg.org/cache/epub/3800/pg3800.txt',  method: 'gutenberg-txt' },
  'hobbes-leviathan':                   { url: 'https://www.gutenberg.org/cache/epub/3207/pg3207.txt',  method: 'gutenberg-txt' },
  // Poetry
  'dante-inferno':            { url: 'https://www.gutenberg.org/cache/epub/1004/pg1004.txt',  method: 'gutenberg-txt' },
  'whitman-leaves-of-grass':  { url: 'https://www.gutenberg.org/cache/epub/1322/pg1322.txt',  method: 'gutenberg-txt' },
  'dickinson-poems':          { url: 'https://www.gutenberg.org/cache/epub/12242/pg12242.txt',method: 'gutenberg-txt' },
  'baudelaire-fleurs-du-mal': { url: 'https://www.gutenberg.org/cache/epub/36098/pg36098.txt',method: 'gutenberg-txt' },
  'rilke-duino-elegies':      { url: 'https://www.gutenberg.org/cache/epub/2726/pg2726.txt',  method: 'gutenberg-txt' },
  'yeats-collected-poems':    { url: 'https://www.gutenberg.org/cache/epub/33435/pg33435.txt',method: 'gutenberg-txt' },
  'khayyam-rubaiyat':         { url: 'https://www.gutenberg.org/cache/epub/246/pg246.txt',    method: 'gutenberg-txt' },
  // Drama
  'shakespeare-hamlet':         { url: 'https://www.gutenberg.org/cache/epub/1524/pg1524.txt',method: 'gutenberg-txt' },
  'shakespeare-king-lear':      { url: 'https://www.gutenberg.org/cache/epub/1532/pg1532.txt',method: 'gutenberg-txt' },
  'sophocles-antigone-oedipus': { url: 'https://www.gutenberg.org/cache/epub/31/pg31.txt',    method: 'gutenberg-txt' },
  'ibsen-master-builder':       { url: 'https://www.gutenberg.org/cache/epub/2879/pg2879.txt',method: 'gutenberg-txt' },
  // Prose & Essays
  'tolstoy-death-of-ivan-ilyich':      { url: 'https://www.gutenberg.org/cache/epub/689/pg689.txt',  method: 'gutenberg-txt' },
  'dostoevsky-notes-from-underground': { url: 'https://www.gutenberg.org/cache/epub/600/pg600.txt',  method: 'gutenberg-txt' },
  'kafka-the-trial':                   { url: 'https://www.gutenberg.org/cache/epub/7849/pg7849.txt',method: 'gutenberg-txt' },
  'montaigne-essays':                  { url: 'https://www.gutenberg.org/cache/epub/3600/pg3600.txt',method: 'gutenberg-txt' },
  'augustine-confessions':             { url: 'https://www.gutenberg.org/cache/epub/3296/pg3296.txt',method: 'gutenberg-txt' },
  // Non-Western
  'laozi-tao-te-ching':    { url: 'https://www.gutenberg.org/cache/epub/216/pg216.txt',    method: 'gutenberg-txt' },
  'confucius-analects':    { url: 'https://www.gutenberg.org/cache/epub/3330/pg3330.txt',  method: 'gutenberg-txt' },
  'bhagavad-gita':         { url: 'https://www.gutenberg.org/cache/epub/2388/pg2388.txt',  method: 'gutenberg-txt' },
  'book-of-job':           { url: 'https://www.gutenberg.org/cache/epub/8066/pg8066.txt',  method: 'gutenberg-txt' },
  'zhuangzi':              { url: 'https://www.gutenberg.org/cache/epub/56571/pg56571.txt',method: 'gutenberg-txt' },
  'yamamoto-hagakure':     { url: 'https://www.gutenberg.org/cache/epub/57852/pg57852.txt',method: 'gutenberg-txt' },
  // Portuguese
  'pessoa-mensagem':                { url: 'https://www.gutenberg.org/cache/epub/55682/pg55682.txt',method: 'gutenberg-txt' },
  'camoes-lusiadas':                { url: 'https://www.gutenberg.org/cache/epub/3333/pg3333.txt',  method: 'gutenberg-txt' },
  'pessoa-livro-do-desassossego':   { url: 'https://www.gutenberg.org/cache/epub/60098/pg60098.txt',method: 'gutenberg-txt' },
  // Economics
  'smith-wealth-of-nations':    { url: 'https://www.gutenberg.org/cache/epub/3300/pg3300.txt',  method: 'gutenberg-txt' },
  'ricardo-principles':         { url: 'https://www.gutenberg.org/cache/epub/33310/pg33310.txt',method: 'gutenberg-txt' },
  'marx-capital-vol-1':         { url: 'https://www.gutenberg.org/cache/epub/61935/pg61935.txt',method: 'gutenberg-txt' },
  'veblen-leisure-class':       { url: 'https://www.gutenberg.org/cache/epub/833/pg833.txt',   method: 'gutenberg-txt' },
  'weber-protestant-ethic':     { url: 'https://www.gutenberg.org/cache/epub/70895/pg70895.txt',method: 'gutenberg-txt' },
  'lenin-imperialism':          { url: 'https://www.gutenberg.org/cache/epub/34248/pg34248.txt',method: 'gutenberg-txt' },
  'keynes-economic-consequences':{ url: 'https://www.gutenberg.org/cache/epub/15776/pg15776.txt',method: 'gutenberg-txt' },
  'keynes-general-theory':      { url: 'https://gutenberg.net.au/ebooks03/0300071h.html',      method: 'gutenberg-html' },
  // hayek-road-to-serfdom → file: null, no fetch
  // International Treaties
  'un-charter':             { url: 'https://www.un.org/en/about-us/un-charter/full-text',                                         method: 'html' },
  'udhr':                   { url: 'https://www.un.org/en/about-us/universal-declaration-of-human-rights',                         method: 'html' },
  'vienna-convention-treaties': { url: 'https://legal.un.org/ilc/texts/instruments/english/conventions/1_1_1969.pdf',             method: 'pdf' },
  'unclos':                 { url: 'https://www.un.org/depts/los/convention_agreements/texts/unclos/unclos_e.pdf',                 method: 'pdf', maxChars: MAX_CHARS },
  'rome-statute':           { url: 'https://www.icc-cpi.int/sites/default/files/RS-Eng.pdf',                                      method: 'pdf' },
  'echr-convention':        { url: 'https://www.echr.coe.int/documents/d/echr/convention_eng',                                    method: 'html' },
  'gatt-1994':              { url: 'https://www.wto.org/english/docs_e/legal_e/06-gatt.pdf',                                      method: 'pdf' },
  'wto-marrakesh':          { url: 'https://www.wto.org/english/docs_e/legal_e/04-wto.pdf',                                       method: 'pdf' },
  'teu-2016':               { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:12016M/TXT',                    method: 'pdf' },
  'tfeu-2016':              { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:12016E/TXT',                    method: 'pdf', maxChars: MAX_CHARS },
  'constituicao-portuguesa':{ url: 'https://www.parlamento.pt/Legislacao/Documents/Legislacao_Anotada/ConstituicaoRepublicaPortuguesa_Simples.pdf', method: 'pdf' },
  // Landmark Cases
  'icj-nicaragua-v-us':      { url: 'https://www.icj-cij.org/public/files/case-related/70/070-19860627-JUD-01-00-EN.pdf',    method: 'pdf' },
  'icj-barcelona-traction':  { url: 'https://www.icj-cij.org/public/files/case-related/50/050-19700205-JUD-01-00-EN.pdf',    method: 'pdf' },
  'ussc-marbury-v-madison':  { url: 'https://tile.loc.gov/storage-services/service/ll/usrep/usrep005/usrep005137/usrep005137.pdf', method: 'pdf' },
  'ussc-brown-v-board':      { url: 'https://tile.loc.gov/storage-services/service/ll/usrep/usrep347/usrep347483/usrep347483.pdf', method: 'pdf' },
  'ussc-roe-v-wade':         { url: 'https://tile.loc.gov/storage-services/service/ll/usrep/usrep410/usrep410113/usrep410113.pdf', method: 'pdf' },
  'cjeu-van-gend-en-loos':   { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:61962CJ0026',             method: 'pdf' },
  'cjeu-costa-v-enel':       { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:61964CJ0006',             method: 'pdf' },
  'cjeu-factortame':         { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:61989CJ0213',             method: 'pdf' },
  'cjeu-kadi':               { url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:62005CJ0402',             method: 'pdf' },
  'ecthr-soering-v-uk':      { url: 'https://hudoc.echr.coe.int/eng?i=001-57619',                                            method: 'html' },
};

// ── HTTP fetch ────────────────────────────────────────────────────────────────
function fetchRaw(url, binary = false, retries = 3) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const opts = {
      headers: { 'User-Agent': 'AlephCatalog/2.0 (Educational/research; contact@example.com)' },
      timeout: 45000
    };

    const req = proto.get(url, opts, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchRaw(next, binary, retries).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      if (!binary) res.setEncoding('utf8');
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : chunks.join('')));
      res.on('error', reject);
    });

    req.on('error', err => {
      if (retries > 0) {
        console.log(`    retry (${retries} left) after error: ${err.message}`);
        setTimeout(() => fetchRaw(url, binary, retries - 1).then(resolve).catch(reject), 3000);
      } else reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        console.log(`    timeout — retrying (${retries} left)`);
        setTimeout(() => fetchRaw(url, binary, retries - 1).then(resolve).catch(reject), 3000);
      } else reject(new Error('timeout'));
    });
  });
}

// ── Gutenberg plain-text cleaner ──────────────────────────────────────────────
function cleanGutenbergTxt(raw) {
  const startRe = /\*{3}\s*START OF (THE |THIS )?PROJECT GUTENBERG EBOOK[^\n]*/i;
  const endRe   = /\*{3}\s*END OF (THE |THIS )?PROJECT GUTENBERG EBOOK/i;

  let start = 0;
  const sm = raw.match(startRe);
  if (sm) {
    const idx = raw.indexOf(sm[0]);
    start = raw.indexOf('\n', idx) + 1;
  }

  let end = raw.length;
  const em = raw.match(endRe);
  if (em) {
    end = raw.indexOf(em[0]);
  }

  return raw.slice(start, end).trim();
}

// ── HTML → plain text ─────────────────────────────────────────────────────────
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── PDF text extraction ───────────────────────────────────────────────────────
async function pdfToText(buffer) {
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (e) {
    throw new Error('pdf-parse not installed. Run: cd scripts && npm install pdf-parse');
  }
  const data = await pdfParse(buffer);
  return data.text;
}

// ── Fetch methods ─────────────────────────────────────────────────────────────
async function fetchGutenbergTxt(url) {
  const raw = await fetchRaw(url);
  return cleanGutenbergTxt(raw);
}

async function fetchGutenbergHtml(url) {
  const html = await fetchRaw(url);
  return htmlToText(html);
}

async function fetchHtml(url) {
  const html = await fetchRaw(url);
  return htmlToText(html);
}

async function fetchPdf(url) {
  const buf = await fetchRaw(url, true);
  return pdfToText(buf);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Aleph Corpus Fetcher ===\n');

  if (!fs.existsSync(INDEX_PATH)) {
    console.error('corpus/index.json not found at:', INDEX_PATH);
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const results = { ok: [], skipped: [], failed: [] };

  const toFetch = index.filter(entry => {
    if (!entry.file) {
      console.log(`[skip] ${entry.id} — reference-only, no local file`);
      results.skipped.push({ id: entry.id, reason: 'reference-only' });
      return false;
    }
    const dest = path.join(CORPUS_DIR, entry.file);
    if (fs.existsSync(dest)) {
      console.log(`[skip] ${entry.id} — already fetched`);
      results.skipped.push({ id: entry.id, reason: 'already exists' });
      return false;
    }
    if (!SOURCES[entry.id]) {
      console.warn(`[warn] ${entry.id} — no source URL defined`);
      results.failed.push({ id: entry.id, error: 'no source URL' });
      return false;
    }
    return true;
  });

  console.log(`\nTo fetch: ${toFetch.length}  |  Skipped: ${results.skipped.length}\n`);
  if (toFetch.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (let i = 0; i < toFetch.length; i++) {
    const entry = toFetch[i];
    const src   = SOURCES[entry.id];
    const dest  = path.join(CORPUS_DIR, entry.file);
    const limit = src.maxChars || null;

    console.log(`[${i + 1}/${toFetch.length}] ${entry.author} — ${entry.title}`);
    console.log(`  method: ${src.method}  url: ${src.url.slice(0, 70)}...`);

    try {
      let text = '';

      switch (src.method) {
        case 'gutenberg-txt':  text = await fetchGutenbergTxt(src.url); break;
        case 'gutenberg-html': text = await fetchGutenbergHtml(src.url); break;
        case 'html':           text = await fetchHtml(src.url);          break;
        case 'pdf':            text = await fetchPdf(src.url);           break;
        default: throw new Error(`Unknown method: ${src.method}`);
      }

      if (!text || text.length < 200) {
        throw new Error(`Content too short (${text?.length} chars) — possible block or error page`);
      }

      let finalText = text;
      let note = '';

      if (limit && text.length > limit) {
        finalText = text.slice(0, limit);
        // Try to end on a sentence boundary
        const lastPeriod = finalText.lastIndexOf('.');
        if (lastPeriod > limit * 0.9) finalText = finalText.slice(0, lastPeriod + 1);
        note = `\n\n[Excerpt — first ${Math.round(finalText.length / 1000)}k characters of a longer document]`;
        finalText += note;
        console.log(`  ✓ truncated to ${finalText.length} chars (excerpt from first section)`);
      } else {
        console.log(`  ✓ ${finalText.length.toLocaleString()} chars`);
      }

      fs.writeFileSync(dest, finalText, 'utf8');
      results.ok.push(entry.id);

    } catch (err) {
      console.log(`  ✗ FAILED: ${err.message}`);
      results.failed.push({ id: entry.id, error: err.message });
    }

    if (i < toFetch.length - 1) await sleep(DELAY_MS);
    console.log('');
  }

  // Summary
  console.log('\n══════════════════════════');
  console.log(`  OK:      ${results.ok.length}`);
  console.log(`  Skipped: ${results.skipped.length}`);
  console.log(`  Failed:  ${results.failed.length}`);
  if (results.failed.length) {
    console.log('\nFailed:');
    results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
  }
  console.log('══════════════════════════\n');

  // Write log
  const log = {
    timestamp: new Date().toISOString(),
    summary: { ok: results.ok.length, skipped: results.skipped.length, failed: results.failed.length },
    ...results
  };
  fs.writeFileSync(path.join(CORPUS_DIR, 'fetch-log.json'), JSON.stringify(log, null, 2));
  console.log('Log saved to corpus/fetch-log.json');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
