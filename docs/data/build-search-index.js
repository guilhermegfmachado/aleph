#!/usr/bin/env node
// Incrementally add any un-indexed text files to search-index.json (+ .min.json).
// Preserves existing entries; only appends docs missing from idx.docs.
// Tokenizer matches search-engine.js exactly. v2 format: postings are flat
// [docIndex, freq, ...] arrays indexed into docIds.
// Run: cd docs/data && node build-search-index.js

const fs = require('fs');

const idx = JSON.parse(fs.readFileSync('search-index.json', 'utf8'));
if (!Array.isArray(idx.docIds)) {
  console.error('Index is not v2 (flat-pairs). Rebuild it before appending.');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync('corpus-manifest.json', 'utf8'));

// Map textId -> {title, author} from manifest
const metaById = {};
for (const cat of Object.values(manifest.corpus || {})) {
  for (const doc of cat.documents || []) {
    for (const lang of Object.keys(doc.languages || {})) {
      metaById[`${doc.id}_${lang}`] = { title: doc.title, author: doc.author || 'Anonyme' };
    }
  }
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 2);
}

function titleFromId(id) {
  return id.replace(/_[a-z]+$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const textFiles = fs.readdirSync('texts').filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
const missing = textFiles.filter(id => !idx.docs[id]);

console.log(`\n  Search index: ${Object.keys(idx.docs).length} docs indexed, ${missing.length} to add\n${'─'.repeat(55)}`);

let added = 0;
for (const id of missing) {
  let data;
  try { data = JSON.parse(fs.readFileSync(`texts/${id}.json`, 'utf8')); } catch { continue; }
  const content = data.content || '';
  if (content.length < 200) { console.log(`  skip ${id} (too short)`); continue; }

  const tokens = tokenize(content);
  // term -> freq  (positions are omitted: the renderer re-searches content for snippets)
  const local = new Map();
  for (const t of tokens) local.set(t, (local.get(t) || 0) + 1);

  // Append to global inverted index. v2 postings are a flat
  // [docIndex, freq, ...] array — 5x smaller than repeating the doc id string.
  // (Object.hasOwn guards prototype keys like "constructor".)
  const docIndex = idx.docIds.length;
  idx.docIds.push(id);
  for (const [term, freq] of local) {
    if (!Object.hasOwn(idx.terms, term)) idx.terms[term] = [];
    idx.terms[term].push(docIndex, freq);
  }

  const meta = metaById[id] || { title: titleFromId(id), author: 'Anonyme' };
  const snippet = content.replace(/\s+/g, ' ').trim().slice(0, 200);
  idx.docs[id] = { title: meta.title, author: meta.author, snippet };

  added++;
  if (added % 10 === 0) process.stdout.write(`  ${added}/${missing.length}\r`);
}

idx.v = 2;
idx.meta.format = 'flat-pairs';
idx.meta.totalDocs = Object.keys(idx.docs).length;
idx.meta.totalTerms = Object.keys(idx.terms).length;
idx.meta.builtAt = process.env.BUILD_TIME || idx.meta.builtAt;

const out = JSON.stringify(idx);
fs.writeFileSync('search-index.json', out);
fs.writeFileSync('search-index.min.json', out);

console.log(`${'─'.repeat(55)}\n  Done: added ${added} docs → ${idx.meta.totalDocs} total, ${idx.meta.totalTerms} terms`);
