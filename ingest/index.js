#!/usr/bin/env node
// aleph ingestion pipeline
// Main entry point for building the corpus

const fs = require('fs');
const path = require('path');

const eurlex = require('./eurlex');
const ancient = require('./ancient');
const crossref = require('./crossref');

const OUTPUT_DIR = path.join(__dirname, '../docs/data');

async function main() {
    console.log('╔═══════════════════════════════════════╗');
    console.log('║     aleph - corpus ingestion          ║');
    console.log('╚═══════════════════════════════════════╝\n');

    const args = process.argv.slice(2);
    const command = args[0] || 'help';

    switch (command) {
        case 'eurlex':
            console.log('Ingesting EUR-Lex documents...\n');
            await eurlex.ingest({
                treaties: true,
                landmarks: true,
                regulations: parseInt(args[1]) || 0,
                directives: parseInt(args[2]) || 0,
                outputDir: OUTPUT_DIR
            });
            break;

        case 'ancient':
            console.log('Ingesting ancient texts...\n');
            const categories = args[1] ? args[1].split(',') : undefined;
            await ancient.ingest({
                categories,
                outputDir: OUTPUT_DIR
            });
            break;

        case 'crossref':
            console.log('Building cross-references...\n');
            await crossref.processCorpus(OUTPUT_DIR, OUTPUT_DIR);
            break;

        case 'all':
            console.log('Full ingestion pipeline...\n');

            console.log('\n[1/4] EUR-Lex treaties and landmarks');
            await eurlex.ingest({
                treaties: true,
                landmarks: true,
                outputDir: OUTPUT_DIR
            });

            console.log('\n[2/4] Ancient texts');
            await ancient.ingest({ outputDir: OUTPUT_DIR });

            console.log('\n[3/4] Building cross-references');
            await crossref.processCorpus(OUTPUT_DIR, OUTPUT_DIR);

            console.log('\n[4/4] Building unified index');
            await buildUnifiedIndex();

            console.log('\n✓ Complete!');
            break;

        case 'index':
            console.log('Building unified index...\n');
            await buildUnifiedIndex();
            break;

        default:
            console.log('Usage: node ingest/index.js <command>\n');
            console.log('Commands:');
            console.log('  eurlex [regulations] [directives]  Ingest EUR-Lex documents');
            console.log('  ancient [categories]               Ingest ancient texts from Gutenberg');
            console.log('  crossref                           Build cross-references between docs');
            console.log('  index                              Build unified search index');
            console.log('  all                                Run full pipeline');
            console.log('\nExamples:');
            console.log('  node ingest/index.js eurlex 50 20   # Treaties + 50 regulations + 20 directives');
            console.log('  node ingest/index.js ancient greek_philosophy,roman');
            console.log('  node ingest/index.js all            # Everything');
    }
}

async function buildUnifiedIndex() {
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('-corpus.json'));

    let allBooks = [];
    let allTexts = [];

    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, file), 'utf8'));
        if (data.documents) {
            for (const doc of data.documents) {
                const id = allBooks.length + 1;
                allBooks.push({
                    id,
                    title: doc.title,
                    author: doc.author,
                    type: doc.type,
                    period: doc.period,
                    tags: doc.tags || [],
                    source: doc.source || file.replace('-corpus.json', ''),
                    snippet: doc.snippet || (doc.content || '').slice(0, 1000),
                    celex: doc.celex,
                    relationships: doc.relationships
                });
                allTexts.push({
                    id,
                    content: doc.content
                });
            }
        }
    }

    // Load relationship graph if exists
    let graph = null;
    const graphPath = path.join(OUTPUT_DIR, 'relationship-graph.json');
    if (fs.existsSync(graphPath)) {
        graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    }

    // Write unified library index
    const indexData = {
        version: 2,
        generatedAt: new Date().toISOString(),
        count: allBooks.length,
        books: allBooks,
        graph: graph
    };

    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'library-index.json'),
        JSON.stringify(indexData)
    );
    console.log(`Written library index: ${allBooks.length} books`);

    // Write texts separately (large file)
    fs.writeFileSync(
        path.join(OUTPUT_DIR, 'library-texts.json'),
        JSON.stringify({ texts: allTexts })
    );
    console.log(`Written library texts`);

    // Generate stats
    const stats = {
        total: allBooks.length,
        byType: {},
        byPeriod: {},
        bySource: {}
    };

    for (const book of allBooks) {
        stats.byType[book.type] = (stats.byType[book.type] || 0) + 1;
        stats.byPeriod[book.period] = (stats.byPeriod[book.period] || 0) + 1;
        stats.bySource[book.source] = (stats.bySource[book.source] || 0) + 1;
    }

    console.log('\nCorpus Statistics:');
    console.log(`  Total documents: ${stats.total}`);
    console.log('  By type:', stats.byType);
    console.log('  By period:', stats.byPeriod);
    console.log('  By source:', stats.bySource);

    return stats;
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
