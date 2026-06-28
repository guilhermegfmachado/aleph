#!/usr/bin/env node
// Fetch missing texts via GITenberg GitHub mirror (raw.githubusercontent.com is allowed)
// Resolves each Gutenberg ID -> GITenberg repo via GitHub API, downloads the .txt.
// Run: cd docs/data && node fetch-via-github.js

const fs = require('fs');
const https = require('https');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync('corpus-manifest.json', 'utf8'));
const textsDir = 'texts';
if (!fs.existsSync(textsDir)) fs.mkdirSync(textsDir);

const existing = new Set(fs.readdirSync(textsDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')));

// Collect missing EN texts with gutenberg_id
const toFetch = [];
for (const cat of Object.values(manifest.corpus || {})) {
  for (const doc of cat.documents || []) {
    for (const [lang, ld] of Object.entries(doc.languages || {})) {
      if (lang === 'en' && ld.gutenberg_id && !existing.has(`${doc.id}_${lang}`)) {
        toFetch.push({ id: `${doc.id}_${lang}`, title: doc.title, gid: ld.gutenberg_id });
      }
    }
  }
}

function get(url, asJson = false) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'aleph-corpus-fetcher', 'Accept': asJson ? 'application/vnd.github+json' : '*/*' }
    }, res => {
      if ([301, 302, 307].includes(res.statusCode) && res.headers.location) {
        return get(res.headers.location, asJson).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Resolve gutenberg id -> GITenberg repo full_name.
// Strategy: search by title words (reliable), filter for repo ending in _<gid>.
// Fall back to raw id search.
async function resolveRepo(gid, title) {
  // Clean title into search terms: drop parentheticals, punctuation, short words
  const terms = title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4)
    .join('+');

  const queries = [
    `${terms}+user:GITenberg`,
    `${gid}+user:GITenberg`
  ];

  for (const q of queries) {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q).replace(/%2B/g, '+')}&per_page=50`;
    let res;
    try { res = await get(url, true); } catch { continue; }
    if (res.status === 403) { await new Promise(r => setTimeout(r, 8000)); continue; } // rate limited
    if (res.status !== 200) continue;
    let json;
    try { json = JSON.parse(res.body); } catch { continue; }
    const exact = (json.items || []).find(r => r.name.endsWith(`_${gid}`));
    if (exact) return { full: exact.full_name, branch: exact.default_branch || 'master' };
    await new Promise(r => setTimeout(r, 2500));
  }
  return null;
}

async function fetchContent(repo, gid) {
  // Candidate filenames in priority order
  const candidates = [`${gid}-0.txt`, `${gid}.txt`, `${gid}-8.txt`];
  for (const fn of candidates) {
    const url = `https://raw.githubusercontent.com/${repo.full}/${repo.branch}/${fn}`;
    const res = await get(url);
    if (res.status === 200 && res.body.length > 1000) return res.body;
  }
  return null;
}

function stripBoilerplate(content) {
  const s = content.match(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  const e = content.match(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (s && e) {
    const si = content.indexOf(s[0]) + s[0].length;
    const ei = content.indexOf(e[0]);
    if (ei > si) content = content.slice(si, ei);
  }
  // Drop leading "Produced by..." line
  return content.replace(/^\s*Produced by[^\n]*\n/i, '').trim();
}

async function main() {
  console.log(`\n  Fetching ${toFetch.length} texts via GITenberg mirror\n${'─'.repeat(55)}`);
  let ok = 0, fail = 0;
  const failed = [];

  for (const item of toFetch) {
    process.stdout.write(`[${item.gid}] ${item.title.slice(0, 38).padEnd(38)} `);
    try {
      const repo = await resolveRepo(item.gid, item.title);
      if (!repo) { console.log('✗ no repo'); fail++; failed.push(item); continue; }

      const raw = await fetchContent(repo, item.gid);
      if (!raw) { console.log('✗ no txt'); fail++; failed.push(item); continue; }

      const content = stripBoilerplate(raw);
      const json = { id: item.id, source: 'gutenberg', gutenberg_id: item.gid, char_count: content.length, content };
      fs.writeFileSync(path.join(textsDir, `${item.id}.json`), JSON.stringify(json));
      console.log(`✓ ${Math.round(content.length / 1024)}KB`);
      ok++;
    } catch (e) {
      console.log(`✗ ${e.message}`);
      fail++; failed.push(item);
    }
    await new Promise(r => setTimeout(r, 2500)); // stay under unauthenticated search limit (30/min)
  }

  console.log(`${'─'.repeat(55)}\n  Done: ${ok} fetched, ${fail} failed`);
  if (failed.length) console.log('  Failed:', failed.map(f => f.gid).join(', '));
}

main().catch(console.error);
