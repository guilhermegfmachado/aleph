// Aleph Search Engine - Auto-generated

// Aleph search function
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
