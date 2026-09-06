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

// BM25 ranking. Plain TF-IDF has no document-length normalisation, so a
// 450k-word novel that mentions a common word in passing outranked the
// 234-word Universal Declaration on its own subject. BM25's `b` term divides
// by document length relative to the corpus average, which fixes that.
const BM25_K1 = 1.2;
const BM25_B = 0.75;

function alephSearch(query, maxResults = 50) {
    if (!window.alephIndex) return [];
    const idx = window.alephIndex;

    const terms = query.toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);

    if (terms.length === 0) return [];

    const docIds = idx.docIds || null;
    const docLen = idx.docLen || null;
    const avgLen = (idx.meta && idx.meta.avgDocLen) || 0;
    const N = idx.meta.totalDocs;
    const scores = {};

    for (const term of terms) {
        const entry = idx.terms[term];
        if (!entry) continue;

        // v2 stores postings as a flat [docIndex, freq, ...] array; older
        // builds used [{doc, freq}] objects.
        const flat = docIds && typeof entry[0] === 'number';
        const postings = flat ? entry.length / 2 : entry.length;
        const idf = Math.log(1 + (N - postings + 0.5) / (postings + 0.5));

        for (let i = 0; i < postings; i++) {
            const di = flat ? entry[i * 2] : -1;
            const docId = flat ? docIds[di] : entry[i].doc;
            const freq = flat ? entry[i * 2 + 1] : entry[i].freq;
            if (docId === undefined) continue;

            // Length normalisation; falls back to plain TF when lengths are absent.
            const len = (docLen && di >= 0) ? docLen[di] : avgLen;
            const norm = avgLen > 0
                ? (1 - BM25_B + BM25_B * (len / avgLen))
                : 1;
            const contribution = idf * (freq * (BM25_K1 + 1)) / (freq + BM25_K1 * norm);

            if (!scores[docId]) scores[docId] = { score: 0, termMatches: 0, hits: 0 };
            scores[docId].score += contribution;
            scores[docId].termMatches++;
            scores[docId].hits += freq;
        }
    }

    // Favour documents that match more of the query, not just one term often.
    for (const docId of Object.keys(scores)) {
        scores[docId].score *= (1 + (scores[docId].termMatches - 1) * 0.3);
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
