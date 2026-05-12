/* Aleph search engine — TF-IDF over pre-built positional index. */

let indexLoadPromise = null;
let textCache = new Map();

function ensureSearchIndex() {
    if (window.alephIndex) return Promise.resolve(window.alephIndex);
    if (indexLoadPromise) return indexLoadPromise;
    indexLoadPromise = fetch('data/search-index.min.json')
        .then(r => r.json())
        .then(idx => {
            window.alephIndex = idx;
            return idx;
        })
        .catch(err => {
            indexLoadPromise = null;
            throw err;
        });
    return indexLoadPromise;
}

function alephSearch(query, maxResults = 50) {
    if (!window.alephIndex) return [];
    const idx = window.alephIndex;

    const terms = query.toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    if (terms.length === 0) return [];

    const scores = {};

    for (const term of terms) {
        const matches = idx.terms[term] || [];
        for (const match of matches) {
            if (!scores[match.doc]) {
                scores[match.doc] = { score: 0, termMatches: 0, hits: 0, positions: [] };
            }
            const tf = Math.log(1 + match.freq);
            const idf = Math.log(idx.meta.totalDocs / matches.length);
            scores[match.doc].score += tf * idf;
            scores[match.doc].termMatches++;
            scores[match.doc].hits += match.freq;
            scores[match.doc].positions.push(...(match.pos || []));
        }
    }

    for (const docId of Object.keys(scores)) {
        scores[docId].score *= (1 + scores[docId].termMatches * 0.5);
    }

    return Object.entries(scores)
        .sort((a, b) => b[1].score - a[1].score)
        .slice(0, maxResults)
        .map(([docId, data]) => ({
            id: docId,
            score: data.score,
            hits: data.hits,
            positions: data.positions.sort((a, b) => a - b).slice(0, 5),
            ...idx.docs[docId]
        }));
}

async function loadTextContent(textId) {
    if (textCache.has(textId)) return textCache.get(textId);
    const res = await fetch(`data/texts/${textId}.json`);
    if (!res.ok) throw new Error(`text not found: ${textId}`);
    const data = await res.json();
    textCache.set(textId, data);
    return data;
}

window.ensureSearchIndex = ensureSearchIndex;
window.alephSearch = alephSearch;
window.loadTextContent = loadTextContent;
