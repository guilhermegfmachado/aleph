#!/usr/bin/env node
// EUR-Lex ingestion module
// Fetches EU law documents and prepares them for aleph

const https = require('https');
const fs = require('fs');
const path = require('path');

const EURLEX_API = 'https://eur-lex.europa.eu/eurlex-ws/rest';

// Document types to fetch
const DOC_TYPES = {
    treaties: { code: 'TREATY', label: 'Treaties' },
    regulations: { code: 'REG', label: 'Regulations' },
    directives: { code: 'DIR', label: 'Directives' },
    decisions: { code: 'DEC', label: 'Decisions' }
};

// Fetch with retry
async function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ status: res.statusCode, data, headers: res.headers });
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// Parse CELEX number
function parseCelex(celex) {
    // Format: SYYYYTNNNN (S=sector, YYYY=year, T=type, NNNN=number)
    const match = celex.match(/^(\d)(\d{4})([A-Z])(\d+)/);
    if (!match) return null;
    return {
        sector: match[1],
        year: parseInt(match[2]),
        type: match[3],
        number: match[4]
    };
}

// Search EUR-Lex for documents
async function searchEurLex(query, maxResults = 100) {
    // EUR-Lex SPARQL endpoint (public)
    const sparqlEndpoint = 'https://eur-lex.europa.eu/ELXWebSPARQL/sparql';

    const sparqlQuery = `
        PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

        SELECT DISTINCT ?celex ?title ?date ?type WHERE {
            ?work cdm:resource_legal_id_celex ?celex .
            ?work cdm:work_has_resource-type ?type .
            ?exp cdm:expression_belongs_to_work ?work .
            ?exp cdm:expression_title ?title .
            OPTIONAL { ?work cdm:work_date_document ?date }
            FILTER(LANG(?title) = "en" || LANG(?title) = "")
            ${query}
        }
        ORDER BY DESC(?date)
        LIMIT ${maxResults}
    `;

    const url = `${sparqlEndpoint}?query=${encodeURIComponent(sparqlQuery)}&format=application/json`;

    try {
        const res = await fetch(url, {
            headers: { 'Accept': 'application/sparql-results+json' }
        });
        return JSON.parse(res.data);
    } catch (e) {
        console.error('SPARQL query failed:', e.message);
        return null;
    }
}

// Get document content by CELEX
async function getDocumentContent(celex) {
    // Try HTML version first
    const htmlUrl = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}`;

    try {
        const res = await fetch(htmlUrl);
        // Strip HTML tags for plain text
        const text = res.data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\s+/g, ' ')
            .trim();
        return text;
    } catch (e) {
        console.error(`Failed to fetch ${celex}:`, e.message);
        return null;
    }
}

// Fetch key EU treaties
async function fetchTreaties() {
    const treaties = [
        { celex: '12012M/TXT', title: 'Treaty on European Union (TEU)' },
        { celex: '12012E/TXT', title: 'Treaty on the Functioning of the EU (TFEU)' },
        { celex: '12012P/TXT', title: 'Charter of Fundamental Rights' },
    ];

    const results = [];
    for (const t of treaties) {
        console.log(`Fetching ${t.title}...`);
        const content = await getDocumentContent(t.celex);
        if (content && content.length > 1000) {
            results.push({
                celex: t.celex,
                title: t.title,
                author: 'European Union',
                content: content,
                type: 'legal/eu',
                subtype: 'treaty',
                tags: ['eu', 'treaty', 'constitutional']
            });
        }
        await sleep(1000); // Rate limit
    }
    return results;
}

// Fetch recent regulations
async function fetchRegulations(limit = 50) {
    console.log(`Fetching up to ${limit} regulations...`);

    const query = `
        FILTER(CONTAINS(STR(?type), "REG"))
        FILTER(?date > "2020-01-01"^^xsd:date)
    `;

    const searchResults = await searchEurLex(query, limit);
    if (!searchResults?.results?.bindings) return [];

    const results = [];
    for (const item of searchResults.results.bindings.slice(0, limit)) {
        const celex = item.celex?.value;
        const title = item.title?.value;
        if (!celex || !title) continue;

        console.log(`  ${celex}: ${title.slice(0, 60)}...`);
        const content = await getDocumentContent(celex);

        if (content && content.length > 500) {
            results.push({
                celex,
                title,
                author: 'European Union',
                content,
                type: 'legal/eu',
                subtype: 'regulation',
                date: item.date?.value,
                tags: ['eu', 'regulation']
            });
        }
        await sleep(500);
    }
    return results;
}

// Fetch recent directives
async function fetchDirectives(limit = 50) {
    console.log(`Fetching up to ${limit} directives...`);

    const query = `
        FILTER(CONTAINS(STR(?type), "DIR"))
        FILTER(?date > "2020-01-01"^^xsd:date)
    `;

    const searchResults = await searchEurLex(query, limit);
    if (!searchResults?.results?.bindings) return [];

    const results = [];
    for (const item of searchResults.results.bindings.slice(0, limit)) {
        const celex = item.celex?.value;
        const title = item.title?.value;
        if (!celex || !title) continue;

        console.log(`  ${celex}: ${title.slice(0, 60)}...`);
        const content = await getDocumentContent(celex);

        if (content && content.length > 500) {
            results.push({
                celex,
                title,
                author: 'European Union',
                content,
                type: 'legal/eu',
                subtype: 'directive',
                date: item.date?.value,
                tags: ['eu', 'directive']
            });
        }
        await sleep(500);
    }
    return results;
}

// Fetch landmark/important regulations
async function fetchLandmarkRegulations() {
    const landmarks = [
        { celex: '32016R0679', title: 'GDPR - General Data Protection Regulation' },
        { celex: '32022R2065', title: 'Digital Services Act' },
        { celex: '32022R1925', title: 'Digital Markets Act' },
        { celex: '32024R1689', title: 'AI Act' },
        { celex: '32023R1114', title: 'Markets in Crypto-Assets (MiCA)' },
        { celex: '32019R0881', title: 'Cybersecurity Act' },
    ];

    const results = [];
    for (const doc of landmarks) {
        console.log(`Fetching ${doc.title}...`);
        const content = await getDocumentContent(doc.celex);
        if (content && content.length > 1000) {
            results.push({
                celex: doc.celex,
                title: doc.title,
                author: 'European Union',
                content,
                type: 'legal/eu',
                subtype: 'regulation',
                tags: ['eu', 'regulation', 'landmark'],
                important: true
            });
        }
        await sleep(1000);
    }
    return results;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Main ingestion function
async function ingest(options = {}) {
    const {
        treaties = true,
        landmarks = true,
        regulations = 0,
        directives = 0,
        outputDir = './docs/data'
    } = options;

    let allDocs = [];

    if (treaties) {
        const t = await fetchTreaties();
        allDocs = allDocs.concat(t);
        console.log(`Got ${t.length} treaties`);
    }

    if (landmarks) {
        const l = await fetchLandmarkRegulations();
        allDocs = allDocs.concat(l);
        console.log(`Got ${l.length} landmark regulations`);
    }

    if (regulations > 0) {
        const r = await fetchRegulations(regulations);
        allDocs = allDocs.concat(r);
        console.log(`Got ${r.length} regulations`);
    }

    if (directives > 0) {
        const d = await fetchDirectives(directives);
        allDocs = allDocs.concat(d);
        console.log(`Got ${d.length} directives`);
    }

    // Create output
    const output = {
        source: 'EUR-Lex',
        fetchedAt: new Date().toISOString(),
        count: allDocs.length,
        documents: allDocs.map((doc, i) => ({
            id: `eurlex-${i + 1}`,
            ...doc,
            snippet: doc.content.slice(0, 1000)
        }))
    };

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write output
    const outPath = path.join(outputDir, 'eurlex-corpus.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`\nWritten ${allDocs.length} documents to ${outPath}`);

    return output;
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {
        treaties: !args.includes('--no-treaties'),
        landmarks: !args.includes('--no-landmarks'),
        regulations: parseInt(args.find(a => a.startsWith('--regulations='))?.split('=')[1] || '0'),
        directives: parseInt(args.find(a => a.startsWith('--directives='))?.split('=')[1] || '0'),
    };

    console.log('EUR-Lex Ingestion');
    console.log('Options:', options);
    console.log('');

    ingest(options).then(() => {
        console.log('Done!');
    }).catch(e => {
        console.error('Error:', e);
        process.exit(1);
    });
}

module.exports = { ingest, fetchTreaties, fetchRegulations, fetchDirectives, fetchLandmarkRegulations };
