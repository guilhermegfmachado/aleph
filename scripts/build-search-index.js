#!/usr/bin/env node
/**
 * Aleph Search Index Builder
 * Builds a lunr.js search index from fetched texts
 * Run: node scripts/build-search-index.js
 */

const fs = require('fs');
const path = require('path');

// We'll use a simple inverted index since lunr.js needs to be installed
// This creates a lightweight search index that can be loaded in the browser

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const DATA_DIR = path.join(DOCS_DIR, 'data');
const TEXTS_DIR = path.join(DATA_DIR, 'texts');

// Tokenize text into words
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Keep letters and numbers
        .split(/\s+/)
        .filter(w => w.length > 2)  // Min 3 chars
        .filter(w => !STOP_WORDS.has(w));
}

// Common stop words (English + French)
const STOP_WORDS = new Set([
    'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
    'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
    'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
    'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
    'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est',
    'que', 'qui', 'dans', 'ce', 'il', 'ne', 'sur', 'se', 'pas', 'plus',
    'par', 'je', 'avec', 'tout', 'faire', 'son', 'mais', 'nous', 'comme', 'ou',
    'si', 'leur', 'y', 'en', 'on', 'ses', 'aux', 'cette', 'sont', 'aussi'
]);

// Build term frequency index
function buildIndex(docs) {
    const index = {
        terms: {},      // term -> [{docId, freq, positions}]
        docs: {},       // docId -> {title, author, snippet, charCount}
        meta: {
            totalDocs: 0,
            totalTerms: 0,
            builtAt: new Date().toISOString()
        }
    };

    for (const doc of docs) {
        index.meta.totalDocs++;
        index.docs[doc.id] = {
            title: doc.title,
            author: doc.author,
            snippet: doc.content.slice(0, 300).replace(/\s+/g, ' '),
            charCount: doc.content.length
        };

        // Tokenize and count
        const tokens = tokenize(doc.content);
        const termFreq = {};

        for (let i = 0; i < tokens.length; i++) {
            const term = tokens[i];
            if (!termFreq[term]) {
                termFreq[term] = { count: 0, positions: [] };
            }
            termFreq[term].count++;
            if (termFreq[term].positions.length < 5) {  // Store first 5 positions
                termFreq[term].positions.push(i);
            }
        }

        // Add to global index
        for (const [term, data] of Object.entries(termFreq)) {
            if (!index.terms[term]) {
                index.terms[term] = [];
                index.meta.totalTerms++;
            }
            index.terms[term].push({
                doc: doc.id,
                freq: data.count,
                pos: data.positions
            });
        }
    }

    // Sort term entries by frequency (most relevant first)
    for (const term of Object.keys(index.terms)) {
        index.terms[term].sort((a, b) => b.freq - a.freq);
    }

    return index;
}

// Search function (will be included in output for browser use)
const SEARCH_FN = `
// Aleph search function
function alephSearch(query, maxResults = 50) {
    if (!window.alephIndex) return [];
    const idx = window.alephIndex;

    const terms = query.toLowerCase()
        .replace(/[^\\p{L}\\p{N}\\s]/gu, ' ')
        .split(/\\s+/)
        .filter(w => w.length > 2);

    if (terms.length === 0) return [];

    const scores = {};

    for (const term of terms) {
        const matches = idx.terms[term] || [];
        for (const match of matches) {
            if (!scores[match.doc]) {
                scores[match.doc] = { score: 0, termMatches: 0 };
            }
            // TF-IDF-ish scoring
            const tf = Math.log(1 + match.freq);
            const idf = Math.log(idx.meta.totalDocs / matches.length);
            scores[match.doc].score += tf * idf;
            scores[match.doc].termMatches++;
        }
    }

    // Boost docs matching more terms
    for (const docId of Object.keys(scores)) {
        scores[docId].score *= (1 + scores[docId].termMatches * 0.5);
    }

    // Sort by score
    const results = Object.entries(scores)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, maxResults)
        .map(([docId, data]) => ({
            id: docId,
            score: data.score,
            ...idx.docs[docId]
        }));

    return results;
}
`;

async function main() {
    console.log('=== Aleph Search Index Builder ===\n');

    // Load corpus manifest for metadata
    const manifestPath = path.join(DATA_DIR, 'corpus-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Build document metadata lookup
    const docMeta = {};
    for (const [catKey, category] of Object.entries(manifest.corpus || {})) {
        for (const doc of category.documents || []) {
            docMeta[doc.id] = {
                title: doc.title,
                author: doc.author || '',
                tags: doc.tags || []
            };
        }
    }

    // Load all fetched texts
    if (!fs.existsSync(TEXTS_DIR)) {
        console.log('No texts directory found. Run fetch-texts.js first.');
        process.exit(1);
    }

    const textFiles = fs.readdirSync(TEXTS_DIR).filter(f => f.endsWith('.json'));
    console.log(`Found ${textFiles.length} text files\n`);

    if (textFiles.length === 0) {
        console.log('No texts to index. Run fetch-texts.js first.');
        process.exit(1);
    }

    const docs = [];
    for (const file of textFiles) {
        try {
            const textData = JSON.parse(fs.readFileSync(path.join(TEXTS_DIR, file), 'utf8'));
            const baseId = textData.id.replace(/_[a-z]{2}$/, '');  // Remove lang suffix
            const meta = docMeta[baseId] || {};

            docs.push({
                id: textData.id,
                title: meta.title || textData.id,
                author: meta.author || '',
                content: textData.content,
                tags: meta.tags || []
            });

            console.log(`  Loaded: ${textData.id} (${textData.char_count} chars)`);
        } catch (err) {
            console.log(`  Error loading ${file}: ${err.message}`);
        }
    }

    console.log(`\nBuilding index for ${docs.length} documents...`);
    const index = buildIndex(docs);

    console.log(`Index built: ${index.meta.totalTerms} unique terms`);

    // Save index
    const indexPath = path.join(DATA_DIR, 'search-index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index));
    console.log(`Index saved to: ${indexPath}`);

    // Also save a minified version
    const indexMinPath = path.join(DATA_DIR, 'search-index.min.json');
    fs.writeFileSync(indexMinPath, JSON.stringify(index));

    // Calculate size
    const stats = fs.statSync(indexPath);
    console.log(`Index size: ${(stats.size / 1024).toFixed(1)} KB`);

    // Save search function as separate JS file
    const searchJsPath = path.join(DOCS_DIR, 'search-engine.js');
    fs.writeFileSync(searchJsPath, `// Aleph Search Engine - Auto-generated
${SEARCH_FN}

// Load index on page load
(function() {
    fetch('data/search-index.json')
        .then(r => r.json())
        .then(idx => {
            window.alephIndex = idx;
            console.log('Search index loaded:', idx.meta.totalDocs, 'docs,', idx.meta.totalTerms, 'terms');
            if (typeof onSearchIndexLoaded === 'function') onSearchIndexLoaded();
        })
        .catch(err => console.error('Failed to load search index:', err));
})();
`);
    console.log(`Search engine saved to: ${searchJsPath}`);

    console.log('\n=== Done ===');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
