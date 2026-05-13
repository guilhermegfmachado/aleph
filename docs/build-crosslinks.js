#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const glossary = JSON.parse(fs.readFileSync('./data/glossary.json', 'utf8'));
const textDir = './data/texts';
const textFiles = fs.readdirSync(textDir).filter(f => f.endsWith('.json'));

// Build term lookup: normalized term -> { id, term, lang }
const termLookup = new Map();
glossary.terms.forEach(t => {
  const normalized = t.term.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (normalized.length >= 3) {
    termLookup.set(normalized, { id: t.id, term: t.term, lang: t.lang });
  }
});

console.log(`Processing ${textFiles.length} texts for ${termLookup.size} terms...`);

// term id -> [text ids where it appears]
const termToTexts = {};
// text id -> [term ids that appear]
const textToTerms = {};

let processed = 0;
for (const file of textFiles) {
  const textId = file.replace('.json', '');
  const data = JSON.parse(fs.readFileSync(path.join(textDir, file), 'utf8'));
  const content = (data.content || '').toLowerCase();

  // Extract all words
  const words = new Set(content.match(/[\p{L}]{3,}/gu) || []);

  textToTerms[textId] = [];

  for (const [normalized, info] of termLookup) {
    if (words.has(normalized)) {
      if (!termToTexts[info.id]) termToTexts[info.id] = [];
      termToTexts[info.id].push(textId);
      textToTerms[textId].push(info.id);
    }
  }

  processed++;
  if (processed % 20 === 0) console.log(`  ${processed}/${textFiles.length}`);
}

// Save crosslinks
const crosslinks = {
  meta: {
    generated: new Date().toISOString(),
    termCount: Object.keys(termToTexts).length,
    textCount: Object.keys(textToTerms).length
  },
  termToTexts,
  textToTerms
};

fs.writeFileSync('./data/crosslinks.json', JSON.stringify(crosslinks));
console.log(`Done! ${Object.keys(termToTexts).length} terms found in texts.`);

// Stats
const termCounts = Object.values(termToTexts).map(arr => arr.length);
const avgAppearances = termCounts.reduce((a,b) => a+b, 0) / termCounts.length;
console.log(`Average term appears in ${avgAppearances.toFixed(1)} texts`);
