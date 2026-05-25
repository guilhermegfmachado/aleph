#!/usr/bin/env node
/**
 * Aleph Text Fetcher
 * Fetches texts from Gutenberg, EUR-Lex, and other sources
 * Run: node scripts/fetch-texts.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const DATA_DIR = path.join(DOCS_DIR, 'data');
const TEXTS_DIR = path.join(DATA_DIR, 'texts');

// Ensure directories exist
if (!fs.existsSync(TEXTS_DIR)) {
    fs.mkdirSync(TEXTS_DIR, { recursive: true });
}

// Rate limiting - be polite to avoid blocks
const DELAY_MS = 2000; // 2 seconds between requests
const sleep = ms => new Promise(r => setTimeout(r, ms));

// HTTP fetch with retries
function fetchUrl(url, retries = 3) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; AlephCatalog/1.0; +https://github.com/guilhermegfmachado/aleph)',
                'Accept': 'text/html,text/plain,*/*',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, response => {
            // Handle redirects
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return fetchUrl(response.headers.location, retries).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                return;
            }

            let data = '';
            response.setEncoding('utf8');
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
            response.on('error', reject);
        });

        request.on('error', err => {
            if (retries > 0) {
                console.log(`  Retry ${4 - retries}/3 for ${url}`);
                setTimeout(() => {
                    fetchUrl(url, retries - 1).then(resolve).catch(reject);
                }, 2000);
            } else {
                reject(err);
            }
        });

        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Timeout'));
        });
    });
}

// Gutenberg text cleaner - removes headers/footers
function cleanGutenbergText(text) {
    // Find start of actual content
    const startMarkers = [
        '*** START OF THE PROJECT GUTENBERG EBOOK',
        '*** START OF THIS PROJECT GUTENBERG EBOOK',
        '*END*THE SMALL PRINT',
        '***START OF THE PROJECT GUTENBERG EBOOK'
    ];

    const endMarkers = [
        '*** END OF THE PROJECT GUTENBERG EBOOK',
        '*** END OF THIS PROJECT GUTENBERG EBOOK',
        '***END OF THE PROJECT GUTENBERG EBOOK',
        'End of the Project Gutenberg EBook',
        'End of Project Gutenberg'
    ];

    let startIdx = 0;
    for (const marker of startMarkers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
            startIdx = text.indexOf('\n', idx + marker.length) + 1;
            break;
        }
    }

    let endIdx = text.length;
    for (const marker of endMarkers) {
        const idx = text.indexOf(marker);
        if (idx !== -1 && idx > startIdx) {
            endIdx = idx;
            break;
        }
    }

    return text.slice(startIdx, endIdx).trim();
}

// Fetch from Project Gutenberg
async function fetchGutenberg(gutenbergId, docId) {
    const urls = [
        `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`,
        `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}-0.txt`,
        `https://www.gutenberg.org/files/${gutenbergId}/${gutenbergId}.txt`
    ];

    for (const url of urls) {
        try {
            console.log(`  Trying: ${url}`);
            const text = await fetchUrl(url);
            const cleaned = cleanGutenbergText(text);

            if (cleaned.length < 1000) {
                console.log(`  Warning: Text very short (${cleaned.length} chars)`);
            }

            return {
                id: docId,
                source: 'gutenberg',
                gutenberg_id: gutenbergId,
                content: cleaned,
                char_count: cleaned.length,
                fetched_at: new Date().toISOString()
            };
        } catch (err) {
            console.log(`  Failed: ${err.message}`);
        }
    }

    throw new Error(`Could not fetch Gutenberg ID ${gutenbergId}`);
}

// Fetch from EUR-Lex (HTML to text extraction)
async function fetchEurLex(celexId, docId, lang = 'EN') {
    // EUR-Lex REST API for document content
    const url = `https://eur-lex.europa.eu/legal-content/${lang}/TXT/HTML/?uri=CELEX:${celexId}`;

    try {
        console.log(`  Trying EUR-Lex: ${celexId} (${lang})`);
        const html = await fetchUrl(url);

        // Basic HTML to text conversion
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#\d+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (text.length < 500) {
            throw new Error('Content too short - likely blocked or error page');
        }

        return {
            id: docId,
            source: 'eurlex',
            celex: celexId,
            lang: lang.toLowerCase(),
            content: text,
            char_count: text.length,
            fetched_at: new Date().toISOString()
        };
    } catch (err) {
        throw new Error(`EUR-Lex fetch failed: ${err.message}`);
    }
}

// Main execution
async function main() {
    console.log('=== Aleph Text Fetcher ===\n');

    // Load corpus manifest
    const manifestPath = path.join(DATA_DIR, 'corpus-manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error('corpus-manifest.json not found!');
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const results = { success: [], failed: [], skipped: [] };

    // Collect all documents with fetchable sources
    const toFetch = [];

    for (const [catKey, category] of Object.entries(manifest.corpus || {})) {
        for (const doc of category.documents || []) {
            const languages = doc.languages || {};

            for (const [lang, langInfo] of Object.entries(languages)) {
                const textId = `${doc.id}_${lang}`;
                const textPath = path.join(TEXTS_DIR, `${textId}.json`);

                // Skip if already fetched
                if (fs.existsSync(textPath)) {
                    results.skipped.push(textId);
                    continue;
                }

                if (langInfo.source === 'gutenberg' && langInfo.gutenberg_id) {
                    toFetch.push({
                        type: 'gutenberg',
                        docId: doc.id,
                        textId,
                        gutenbergId: langInfo.gutenberg_id,
                        title: doc.title,
                        lang
                    });
                } else if (langInfo.source === 'eurlex' && doc.celex) {
                    toFetch.push({
                        type: 'eurlex',
                        docId: doc.id,
                        textId,
                        celex: doc.celex,
                        title: doc.title,
                        lang
                    });
                }
            }
        }
    }

    console.log(`Found ${toFetch.length} texts to fetch`);
    console.log(`Already have ${results.skipped.length} texts\n`);

    // Process queue
    for (let i = 0; i < toFetch.length; i++) {
        const item = toFetch[i];
        console.log(`[${i + 1}/${toFetch.length}] ${item.title} (${item.lang})`);

        try {
            let result;

            if (item.type === 'gutenberg') {
                result = await fetchGutenberg(item.gutenbergId, item.textId);
            } else if (item.type === 'eurlex') {
                result = await fetchEurLex(item.celex, item.textId, item.lang.toUpperCase());
            }

            if (result) {
                const textPath = path.join(TEXTS_DIR, `${item.textId}.json`);
                fs.writeFileSync(textPath, JSON.stringify(result, null, 2));
                console.log(`  Saved: ${result.char_count} chars\n`);
                results.success.push(item.textId);
            }
        } catch (err) {
            console.log(`  ERROR: ${err.message}\n`);
            results.failed.push({ id: item.textId, error: err.message });
        }

        // Rate limiting
        if (i < toFetch.length - 1) {
            await sleep(DELAY_MS);
        }
    }

    // Summary
    console.log('\n=== Summary ===');
    console.log(`Success: ${results.success.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped (already have): ${results.skipped.length}`);

    if (results.failed.length > 0) {
        console.log('\nFailed items:');
        results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    }

    // Save results log
    const logPath = path.join(DATA_DIR, 'fetch-log.json');
    fs.writeFileSync(logPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        ...results
    }, null, 2));
    console.log(`\nLog saved to: ${logPath}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    // Don't exit with error code if we have some texts already
    // This prevents CI from failing when external sources are down
    const textsExist = fs.existsSync(TEXTS_DIR) && fs.readdirSync(TEXTS_DIR).length > 0;
    process.exit(textsExist ? 0 : 1);
});
