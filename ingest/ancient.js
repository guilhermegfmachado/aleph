#!/usr/bin/env node
// Ancient texts ingestion module
// Fetches classical texts from Gutenberg, Perseus, etc.

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Curated list of important ancient texts on Project Gutenberg
const GUTENBERG_TEXTS = {
    greek_philosophy: [
        { id: 1497, title: 'The Republic', author: 'Plato' },
        { id: 1656, title: 'Apology', author: 'Plato' },
        { id: 1726, title: 'Symposium', author: 'Plato' },
        { id: 1636, title: 'Phaedo', author: 'Plato' },
        { id: 1600, title: 'Nicomachean Ethics', author: 'Aristotle' },
        { id: 6762, title: 'Politics', author: 'Aristotle' },
        { id: 1974, title: 'Poetics', author: 'Aristotle' },
        { id: 2680, title: 'Meditations', author: 'Marcus Aurelius' },
        { id: 10661, title: 'Discourses', author: 'Epictetus' },
        { id: 57342, title: 'Letters from a Stoic', author: 'Seneca' },
    ],
    greek_history: [
        { id: 2707, title: 'The History of the Peloponnesian War', author: 'Thucydides' },
        { id: 2456, title: 'The Histories', author: 'Herodotus' },
        { id: 674, title: 'Parallel Lives', author: 'Plutarch' },
    ],
    greek_literature: [
        { id: 6130, title: 'The Iliad', author: 'Homer' },
        { id: 1727, title: 'The Odyssey', author: 'Homer' },
        { id: 1636, title: 'Oedipus Rex', author: 'Sophocles' },
        { id: 31, title: 'Antigone', author: 'Sophocles' },
        { id: 35, title: 'The Oresteia', author: 'Aeschylus' },
        { id: 8714, title: 'Medea', author: 'Euripides' },
    ],
    roman: [
        { id: 17650, title: 'The Aeneid', author: 'Virgil' },
        { id: 21765, title: 'Metamorphoses', author: 'Ovid' },
        { id: 10048, title: 'De Officiis (On Duties)', author: 'Cicero' },
        { id: 14140, title: 'On the Nature of Things', author: 'Lucretius' },
        { id: 10195, title: 'Annals', author: 'Tacitus' },
        { id: 10195, title: 'The Gallic Wars', author: 'Julius Caesar' },
    ],
    religious: [
        { id: 10, title: 'The King James Bible', author: 'Various' },
        { id: 8438, title: 'The Quran', author: 'Various' },
        { id: 17, title: 'The Tao Te Ching', author: 'Lao Tzu' },
        { id: 2500, title: 'Siddhartha', author: 'Hermann Hesse' },
        { id: 4363, title: 'Bhagavad Gita', author: 'Various' },
    ],
    medieval: [
        { id: 8800, title: 'The Divine Comedy', author: 'Dante Alighieri' },
        { id: 2000, title: 'Don Quixote', author: 'Cervantes' },
        { id: 7849, title: 'The Canterbury Tales', author: 'Chaucer' },
        { id: 3332, title: 'Confessions', author: 'Augustine' },
        { id: 17611, title: 'Summa Theologica', author: 'Thomas Aquinas' },
    ]
};

// Fetch with retry
function fetch(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, { headers: { 'User-Agent': 'aleph-ingestion/1.0' } }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return fetch(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// Get text from Project Gutenberg
async function getGutenbergText(id) {
    // Try plain text UTF-8 first
    const urls = [
        `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
        `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
        `https://www.gutenberg.org/files/${id}/${id}.txt`,
    ];

    for (const url of urls) {
        try {
            const text = await fetch(url);
            // Clean up Gutenberg header/footer
            return cleanGutenbergText(text);
        } catch (e) {
            continue;
        }
    }
    return null;
}

// Remove Gutenberg boilerplate
function cleanGutenbergText(text) {
    // Find start marker
    const startMarkers = [
        '*** START OF THIS PROJECT GUTENBERG',
        '*** START OF THE PROJECT GUTENBERG',
        '*END*THE SMALL PRINT',
    ];

    let start = 0;
    for (const marker of startMarkers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
            start = text.indexOf('\n', idx) + 1;
            break;
        }
    }

    // Find end marker
    const endMarkers = [
        '*** END OF THIS PROJECT GUTENBERG',
        '*** END OF THE PROJECT GUTENBERG',
        'End of Project Gutenberg',
        'End of the Project Gutenberg',
    ];

    let end = text.length;
    for (const marker of endMarkers) {
        const idx = text.indexOf(marker);
        if (idx !== -1 && idx > start) {
            end = idx;
            break;
        }
    }

    return text.slice(start, end).trim();
}

// Fetch all texts in a category
async function fetchCategory(category, texts) {
    console.log(`\nFetching ${category}...`);
    const results = [];

    for (const item of texts) {
        console.log(`  ${item.author} - ${item.title}...`);
        try {
            const content = await getGutenbergText(item.id);
            if (content && content.length > 1000) {
                results.push({
                    id: `gutenberg-${item.id}`,
                    gutenbergId: item.id,
                    title: item.title,
                    author: item.author,
                    content,
                    snippet: content.slice(0, 1000),
                    type: getTypeFromCategory(category),
                    period: getPeriodFromCategory(category),
                    category,
                    tags: getTagsFromCategory(category, item),
                    source: 'Project Gutenberg'
                });
                console.log(`    ✓ ${content.length} chars`);
            } else {
                console.log(`    ✗ not found or too short`);
            }
        } catch (e) {
            console.log(`    ✗ ${e.message}`);
        }
        await sleep(500); // Rate limit
    }

    return results;
}

function getTypeFromCategory(category) {
    const map = {
        greek_philosophy: 'ancient/greek',
        greek_history: 'ancient/greek',
        greek_literature: 'ancient/greek',
        roman: 'ancient/roman',
        religious: 'religious',
        medieval: 'literary'
    };
    return map[category] || 'literary';
}

function getPeriodFromCategory(category) {
    const map = {
        greek_philosophy: 'ancient',
        greek_history: 'ancient',
        greek_literature: 'ancient',
        roman: 'ancient',
        religious: 'ancient',
        medieval: 'medieval'
    };
    return map[category] || 'unknown';
}

function getTagsFromCategory(category, item) {
    const tags = [category.replace('_', '-')];

    if (category.startsWith('greek')) tags.push('greek', 'classical');
    if (category === 'roman') tags.push('latin', 'roman', 'classical');
    if (category === 'religious') tags.push('scripture', 'sacred');
    if (category === 'medieval') tags.push('medieval');

    // Author-specific tags
    if (['Plato', 'Aristotle', 'Seneca', 'Epictetus', 'Marcus Aurelius'].includes(item.author)) {
        tags.push('philosophy');
    }
    if (['Homer', 'Virgil', 'Ovid', 'Sophocles', 'Euripides', 'Aeschylus'].includes(item.author)) {
        tags.push('poetry', 'epic');
    }
    if (['Thucydides', 'Herodotus', 'Plutarch', 'Tacitus'].includes(item.author)) {
        tags.push('history');
    }

    return [...new Set(tags)];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main ingestion function
async function ingest(options = {}) {
    const {
        categories = Object.keys(GUTENBERG_TEXTS),
        outputDir = './docs/data'
    } = options;

    let allDocs = [];

    for (const category of categories) {
        if (GUTENBERG_TEXTS[category]) {
            const docs = await fetchCategory(category, GUTENBERG_TEXTS[category]);
            allDocs = allDocs.concat(docs);
        }
    }

    // Create output
    const output = {
        source: 'Ancient Texts Collection',
        fetchedAt: new Date().toISOString(),
        count: allDocs.length,
        documents: allDocs
    };

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    const outPath = path.join(outputDir, 'ancient-corpus.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nWritten ${allDocs.length} documents to ${outPath}`);

    return output;
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);

    let categories = Object.keys(GUTENBERG_TEXTS);
    const catArg = args.find(a => a.startsWith('--categories='));
    if (catArg) {
        categories = catArg.split('=')[1].split(',');
    }

    console.log('Ancient Texts Ingestion');
    console.log('Categories:', categories);

    ingest({ categories }).then(() => {
        console.log('\nDone!');
    }).catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });
}

module.exports = { ingest, GUTENBERG_TEXTS, getGutenbergText };
