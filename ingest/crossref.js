#!/usr/bin/env node
// Cross-reference detection system
// Finds relationships between documents in the corpus

const fs = require('fs');
const path = require('path');

// Known relationships and influences
const KNOWN_INFLUENCES = {
    // Author influences
    'Plato': ['Socrates', 'Pythagoras'],
    'Aristotle': ['Plato', 'Socrates'],
    'Seneca': ['Plato', 'Aristotle', 'Zeno', 'Chrysippus'],
    'Marcus Aurelius': ['Epictetus', 'Seneca', 'Plato'],
    'Epictetus': ['Socrates', 'Zeno', 'Chrysippus'],
    'Cicero': ['Plato', 'Aristotle', 'Zeno'],
    'Augustine': ['Plato', 'Cicero', 'Paul'],
    'Thomas Aquinas': ['Aristotle', 'Augustine', 'Plato'],
    'Dante Alighieri': ['Virgil', 'Aristotle', 'Thomas Aquinas'],
};

// Conceptual connections
const CONCEPTS = {
    justice: ['Republic', 'Nicomachean Ethics', 'Politics', 'De Officiis', 'Charter of Fundamental Rights'],
    virtue: ['Nicomachean Ethics', 'Meditations', 'Letters from a Stoic', 'Republic'],
    governance: ['Politics', 'Republic', 'TFEU', 'TEU', 'The Prince'],
    rights: ['Charter of Fundamental Rights', 'GDPR', 'Universal Declaration'],
    data_protection: ['GDPR', 'Digital Services Act', 'AI Act'],
    markets: ['Digital Markets Act', 'MiCA', 'TFEU'],
    war: ['Peloponnesian War', 'Iliad', 'Gallic Wars', 'Art of War'],
    soul: ['Phaedo', 'Republic', 'Meditations', 'Confessions'],
    death: ['Phaedo', 'Meditations', 'Apology', 'Bhagavad Gita'],
    love: ['Symposium', 'Song of Solomon', 'Divine Comedy'],
    law: ['Republic', 'Politics', 'TFEU', 'De Officiis', 'Summa Theologica'],
};

// Citation patterns
const CITATION_PATTERNS = {
    eurlex: [
        /\b(Regulation|Directive|Decision)\s*\(?(EU|EC|EEC)\)?\s*(\d{4})\/(\d+)/gi,
        /\b(CELEX|celex)[:\s]*(\d{5}[A-Z]\d+)/gi,
        /Article\s+(\d+)\s*(?:of\s+)?(TEU|TFEU|Charter|Regulation|Directive)/gi,
    ],
    classical: [
        /\b(Plato|Aristotle|Socrates|Homer|Virgil|Cicero|Seneca)\b/gi,
        /\b(Republic|Politics|Ethics|Meditations|Iliad|Odyssey|Aeneid)\b/gi,
        /\b(Book\s+[IVX]+|Chapter\s+\d+)/gi,
    ],
    biblical: [
        /\b(\d*\s*[A-Z][a-z]+)\s+(\d+):(\d+)/g, // Book Chapter:Verse
        /\b(Genesis|Exodus|Psalms|Proverbs|Isaiah|Matthew|John|Romans|Revelation)\s+\d+/gi,
    ]
};

// Extract citations from text
function extractCitations(text, docType) {
    const citations = [];
    const sample = text.slice(0, 50000); // First 50k chars

    // Select patterns based on document type
    let patterns = [];
    if (docType?.includes('legal/eu')) {
        patterns = CITATION_PATTERNS.eurlex;
    } else if (docType?.includes('ancient') || docType?.includes('religious')) {
        patterns = [...CITATION_PATTERNS.classical, ...CITATION_PATTERNS.biblical];
    } else {
        patterns = [...CITATION_PATTERNS.classical];
    }

    for (const pattern of patterns) {
        const regex = new RegExp(pattern);
        let match;
        while ((match = regex.exec(sample)) !== null) {
            citations.push({
                text: match[0],
                index: match.index
            });
        }
    }

    return citations;
}

// Find author references
function findAuthorReferences(text, allAuthors) {
    const refs = [];
    const sample = text.toLowerCase().slice(0, 50000);

    for (const author of allAuthors) {
        const pattern = new RegExp(`\\b${author.toLowerCase()}\\b`, 'g');
        const matches = sample.match(pattern);
        if (matches && matches.length > 0) {
            refs.push({ author, count: matches.length });
        }
    }

    return refs.sort((a, b) => b.count - a.count);
}

// Find conceptual links
function findConceptualLinks(text, title) {
    const links = [];
    const sample = text.toLowerCase().slice(0, 50000);

    for (const [concept, relatedDocs] of Object.entries(CONCEPTS)) {
        // Check if this document discusses the concept
        const conceptPatterns = getConceptPatterns(concept);
        let mentionCount = 0;

        for (const pattern of conceptPatterns) {
            const matches = sample.match(new RegExp(pattern, 'gi'));
            if (matches) mentionCount += matches.length;
        }

        if (mentionCount > 5) {
            // Find related documents
            const related = relatedDocs.filter(doc =>
                !title.toLowerCase().includes(doc.toLowerCase())
            );
            if (related.length > 0) {
                links.push({
                    concept,
                    strength: Math.min(mentionCount / 20, 1),
                    relatedDocuments: related
                });
            }
        }
    }

    return links.sort((a, b) => b.strength - a.strength);
}

function getConceptPatterns(concept) {
    const patterns = {
        justice: ['justice', 'just', 'unjust', 'fair', 'fairness', 'righteous'],
        virtue: ['virtue', 'virtuous', 'moral', 'ethical', 'excellence', 'good life'],
        governance: ['govern', 'state', 'political', 'citizen', 'democracy', 'republic'],
        rights: ['rights', 'freedom', 'liberty', 'entitled', 'human rights'],
        data_protection: ['data', 'privacy', 'personal data', 'processing', 'consent'],
        markets: ['market', 'competition', 'monopoly', 'trade', 'economic'],
        war: ['war', 'battle', 'army', 'siege', 'military', 'soldier'],
        soul: ['soul', 'psyche', 'spirit', 'immortal', 'afterlife'],
        death: ['death', 'die', 'dying', 'mortal', 'mortality'],
        love: ['love', 'beloved', 'eros', 'desire', 'passion'],
        law: ['law', 'legal', 'statute', 'legislat', 'jurisprudence'],
    };
    return patterns[concept] || [concept];
}

// Build relationship graph for a corpus
function buildRelationshipGraph(documents) {
    const graph = {
        nodes: [],
        edges: [],
        clusters: {}
    };

    // Get all authors
    const allAuthors = [...new Set(documents.map(d => d.author).filter(Boolean))];

    // Process each document
    for (const doc of documents) {
        // Add node
        graph.nodes.push({
            id: doc.id,
            title: doc.title,
            author: doc.author,
            type: doc.type,
            period: doc.period
        });

        // Extract relationships
        const citations = extractCitations(doc.content || '', doc.type);
        const authorRefs = findAuthorReferences(doc.content || '', allAuthors);
        const conceptLinks = findConceptualLinks(doc.content || '', doc.title);

        // Store for later
        doc.relationships = {
            citations: citations.slice(0, 20),
            authorReferences: authorRefs.slice(0, 10),
            conceptualLinks: conceptLinks.slice(0, 5)
        };
    }

    // Build edges between documents
    for (const doc of documents) {
        // Known influence edges
        if (doc.author && KNOWN_INFLUENCES[doc.author]) {
            for (const influencer of KNOWN_INFLUENCES[doc.author]) {
                const influencerDoc = documents.find(d =>
                    d.author === influencer ||
                    d.title?.includes(influencer)
                );
                if (influencerDoc) {
                    graph.edges.push({
                        source: influencerDoc.id,
                        target: doc.id,
                        type: 'influences',
                        weight: 1
                    });
                }
            }
        }

        // Author reference edges
        for (const ref of (doc.relationships?.authorReferences || [])) {
            const refDocs = documents.filter(d => d.author === ref.author && d.id !== doc.id);
            for (const refDoc of refDocs) {
                graph.edges.push({
                    source: doc.id,
                    target: refDoc.id,
                    type: 'references',
                    weight: Math.min(ref.count / 10, 1)
                });
            }
        }

        // Conceptual edges
        for (const link of (doc.relationships?.conceptualLinks || [])) {
            for (const relatedTitle of link.relatedDocuments) {
                const relatedDoc = documents.find(d =>
                    d.title?.toLowerCase().includes(relatedTitle.toLowerCase())
                );
                if (relatedDoc && relatedDoc.id !== doc.id) {
                    // Check if edge already exists
                    const existing = graph.edges.find(e =>
                        (e.source === doc.id && e.target === relatedDoc.id) ||
                        (e.source === relatedDoc.id && e.target === doc.id)
                    );
                    if (!existing) {
                        graph.edges.push({
                            source: doc.id,
                            target: relatedDoc.id,
                            type: 'conceptual',
                            concept: link.concept,
                            weight: link.strength
                        });
                    }
                }
            }
        }
    }

    // Build clusters by type/period
    for (const doc of documents) {
        const cluster = doc.type || 'other';
        if (!graph.clusters[cluster]) {
            graph.clusters[cluster] = [];
        }
        graph.clusters[cluster].push(doc.id);
    }

    return graph;
}

// Process corpus files and add relationships
async function processCorpus(inputDir = './docs/data', outputDir = './docs/data') {
    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('-corpus.json'));

    let allDocuments = [];

    // Load all corpus files
    for (const file of files) {
        const filePath = path.join(inputDir, file);
        console.log(`Loading ${file}...`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.documents) {
            allDocuments = allDocuments.concat(data.documents);
        }
    }

    console.log(`Processing ${allDocuments.length} documents...`);

    // Build relationship graph
    const graph = buildRelationshipGraph(allDocuments);

    console.log(`Found ${graph.edges.length} relationships`);

    // Write graph
    const graphPath = path.join(outputDir, 'relationship-graph.json');
    fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2));
    console.log(`Written graph to ${graphPath}`);

    // Write enhanced documents with relationships
    const enhancedPath = path.join(outputDir, 'corpus-enhanced.json');
    fs.writeFileSync(enhancedPath, JSON.stringify({
        processedAt: new Date().toISOString(),
        count: allDocuments.length,
        documents: allDocuments.map(d => ({
            ...d,
            content: undefined, // Remove full content from this file
            relationships: d.relationships
        }))
    }, null, 2));
    console.log(`Written enhanced corpus to ${enhancedPath}`);

    return { graph, documents: allDocuments };
}

// CLI
if (require.main === module) {
    console.log('Cross-Reference Detection');
    console.log('');

    processCorpus().then(({ graph }) => {
        console.log('\nSummary:');
        console.log(`  Nodes: ${graph.nodes.length}`);
        console.log(`  Edges: ${graph.edges.length}`);
        console.log(`  Clusters: ${Object.keys(graph.clusters).length}`);
        console.log('\nDone!');
    }).catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });
}

module.exports = {
    extractCitations,
    findAuthorReferences,
    findConceptualLinks,
    buildRelationshipGraph,
    processCorpus
};
