#!/usr/bin/env node
// Fetch all missing texts from Project Gutenberg
// Run: cd docs/data && node fetch-missing-texts.js

const fs = require('fs');
const https = require('https');
const path = require('path');

const manifest = JSON.parse(fs.readFileSync('corpus-manifest.json', 'utf8'));
const textsDir = 'texts';

// Ensure texts directory exists
if (!fs.existsSync(textsDir)) fs.mkdirSync(textsDir);

// Get existing text files
const existingTexts = new Set(
  fs.readdirSync(textsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
);

// Collect all texts with Gutenberg IDs that are missing
const toFetch = [];
for (const [catKey, category] of Object.entries(manifest.corpus || {})) {
  for (const doc of category.documents || []) {
    for (const [lang, langData] of Object.entries(doc.languages || {})) {
      if (langData.gutenberg_id && lang === 'en') {
        const textId = `${doc.id}_${lang}`;
        if (!existingTexts.has(textId)) {
          toFetch.push({
            id: textId,
            title: doc.title,
            gutenberg_id: langData.gutenberg_id
          });
        }
      }
    }
  }
}

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log(`  Found ${toFetch.length} missing texts with Gutenberg IDs`);
console.log(`═══════════════════════════════════════════════════════════════\n`);

function fetch(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetch(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function stripGutenbergBoilerplate(content) {
  // Find START and END markers
  const startMatch = content.match(/\*\*\* START OF (THE|THIS) PROJECT GUTENBERG/i);
  const endMatch = content.match(/\*\*\* END OF (THE|THIS) PROJECT GUTENBERG/i);

  if (startMatch && endMatch) {
    const startIdx = content.indexOf(startMatch[0]) + startMatch[0].length;
    const endIdx = content.indexOf(endMatch[0]);
    content = content.slice(startIdx, endIdx).trim();
  }

  return content;
}

async function fetchText(item) {
  const urls = [
    `https://www.gutenberg.org/cache/epub/${item.gutenberg_id}/pg${item.gutenberg_id}.txt`,
    `https://www.gutenberg.org/files/${item.gutenberg_id}/${item.gutenberg_id}-0.txt`,
    `https://www.gutenberg.org/files/${item.gutenberg_id}/${item.gutenberg_id}.txt`
  ];

  for (const url of urls) {
    try {
      let content = await fetch(url);
      if (content && content.length > 1000 && !content.includes('404 Not Found')) {
        content = stripGutenbergBoilerplate(content);
        return { success: true, content, url };
      }
    } catch (e) {
      // Try next URL
    }
  }
  return { success: false };
}

async function main() {
  let success = 0, failed = 0;

  for (const item of toFetch) {
    process.stdout.write(`[fetch] ${item.id} (${item.title.slice(0, 40)})...`);

    try {
      const result = await fetchText(item);

      if (result.success) {
        const json = {
          id: item.id,
          source: 'gutenberg',
          gutenberg_id: item.gutenberg_id,
          char_count: result.content.length,
          content: result.content
        };

        fs.writeFileSync(
          path.join(textsDir, `${item.id}.json`),
          JSON.stringify(json),
          'utf8'
        );

        const sizeKB = Math.round(result.content.length / 1024);
        console.log(` OK (${sizeKB}KB)`);
        success++;
      } else {
        console.log(' FAILED');
        failed++;
      }
    } catch (e) {
      console.log(` ERROR: ${e.message}`);
      failed++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Done: ${success} fetched, ${failed} failed`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
}

main().catch(console.error);
