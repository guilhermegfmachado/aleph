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

    const docIds = idx.docIds || null;
    const scores = {};

    for (const term of terms) {
        const entry = idx.terms[term];
        if (!entry) continue;

        // v2 stores postings as a flat [docIndex, freq, ...] array; older
        // builds used [{doc, freq}] objects.
        const flat = docIds && !Array.isArray(entry[0]) && typeof entry[0] === 'number';
        const postings = flat ? entry.length / 2 : entry.length;
        const idf = Math.log(idx.meta.totalDocs / postings);

        for (let i = 0; i < postings; i++) {
            const docId = flat ? docIds[entry[i * 2]] : entry[i].doc;
            const freq = flat ? entry[i * 2 + 1] : entry[i].freq;
            if (docId === undefined) continue;
            if (!scores[docId]) scores[docId] = { score: 0, termMatches: 0, hits: 0 };
            scores[docId].score += Math.log(1 + freq) * idf;
            scores[docId].termMatches++;
            scores[docId].hits += freq;
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
