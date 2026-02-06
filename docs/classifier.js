// aleph - universal document classifier
// Rule-based classification with optional LLM enhancement

const Classifier = {
    // Document type patterns
    patterns: {
        legal: {
            eu: [
                /\b(regulation|directive|decision)\s*\(?(eu|ec|eec)\)?/i,
                /\b(celex|eur-lex|official journal)/i,
                /\barticle\s+\d+\s*(of|paragraph|\()/i,
                /\b(european\s+(parliament|commission|council|court))/i,
                /\b(treaty\s+on|tfeu|teu|charter of fundamental)/i
            ],
            general: [
                /\b(plaintiff|defendant|appellant|respondent)\b/i,
                /\b(court|tribunal|judge|ruling|verdict|judgment)\b/i,
                /\b(statute|legislation|enacted|pursuant to)\b/i,
                /\b(section\s+\d+|§\s*\d+)/i,
                /\b(hereby|whereas|hereinafter|aforementioned)\b/i
            ]
        },
        ancient: {
            greek: [
                /\b(aristotle|plato|socrates|homer|herodotus|thucydides)\b/i,
                /\b(athens|sparta|greece|greek|hellenic|hellas)\b/i,
                /\b(philosophy|dialectic|rhetoric|polis|agora)\b/i,
                /\b(iliad|odyssey|republic|symposium|poetics)\b/i
            ],
            roman: [
                /\b(cicero|seneca|virgil|ovid|tacitus|livy|caesar)\b/i,
                /\b(rome|roman|latin|consul|senate|emperor)\b/i,
                /\b(aeneid|metamorphoses|de officiis)\b/i
            ],
            religious: [
                /\b(bible|gospel|psalm|genesis|exodus|revelation)\b/i,
                /\b(quran|surah|ayah|allah|prophet)\b/i,
                /\b(torah|talmud|midrash|rabbi)\b/i,
                /\b(vedas|upanishad|bhagavad|dharma|karma)\b/i,
                /\b(buddha|sutra|nirvana|enlightenment)\b/i
            ]
        },
        scientific: {
            patterns: [
                /\b(hypothesis|methodology|results|conclusion|abstract)\b/i,
                /\b(experiment|data|analysis|statistical|significant)\b/i,
                /\b(peer.?review|journal|citation|doi)\b/i,
                /\b(fig\.|figure\s+\d|table\s+\d|equation)\b/i
            ]
        },
        literary: {
            patterns: [
                /\bchapter\s+(one|two|three|\d+|[ivxlc]+)\b/i,
                /[""][^""]{20,}[""]\s*(said|asked|replied)/i,
                /\b(novel|story|tale|narrative|fiction)\b/i
            ]
        }
    },

    // Time period markers
    periods: {
        ancient: {
            range: [-3000, 500],
            markers: [
                /\b(ancient|classical|antiquity)\b/i,
                /\b(bc|bce|b\.c\.|before\s+christ)\b/i,
                /\b(hellenic|hellenistic|roman\s+empire)\b/i
            ]
        },
        medieval: {
            range: [500, 1500],
            markers: [
                /\b(medieval|middle\s+ages|feudal)\b/i,
                /\b(monastery|monk|crusade|knight)\b/i,
                /\b(scholastic|aquinas|augustine)\b/i
            ]
        },
        earlyModern: {
            range: [1500, 1800],
            markers: [
                /\b(renaissance|reformation|enlightenment)\b/i,
                /\b(colonial|revolution|monarchy)\b/i
            ]
        },
        modern: {
            range: [1800, 1950],
            markers: [
                /\b(industrial|victorian|19th\s+century)\b/i,
                /\b(world\s+war|modernist)\b/i
            ]
        },
        contemporary: {
            range: [1950, 2100],
            markers: [
                /\b(postmodern|digital|contemporary)\b/i,
                /\b(20th|21st)\s+century\b/i
            ]
        }
    },

    // Detect document type
    detectType(text) {
        const sample = text.slice(0, 15000); // First 15k chars
        const scores = {};

        // Check legal patterns
        let euScore = this.matchPatterns(sample, this.patterns.legal.eu);
        let legalScore = this.matchPatterns(sample, this.patterns.legal.general);
        if (euScore > 2) {
            scores['legal/eu'] = euScore + legalScore;
        } else if (legalScore > 3) {
            scores['legal/general'] = legalScore;
        }

        // Check ancient patterns
        let greekScore = this.matchPatterns(sample, this.patterns.ancient.greek);
        let romanScore = this.matchPatterns(sample, this.patterns.ancient.roman);
        let religiousScore = this.matchPatterns(sample, this.patterns.ancient.religious);

        if (greekScore > 2) scores['ancient/greek'] = greekScore;
        if (romanScore > 2) scores['ancient/roman'] = romanScore;
        if (religiousScore > 2) scores['religious'] = religiousScore;

        // Check scientific
        let sciScore = this.matchPatterns(sample, this.patterns.scientific.patterns);
        if (sciScore > 3) scores['scientific'] = sciScore;

        // Check literary
        let litScore = this.matchPatterns(sample, this.patterns.literary.patterns);
        if (litScore > 2) scores['literary'] = litScore;

        // Return highest scoring type(s)
        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return { primary: 'unclassified', confidence: 0, all: [] };

        return {
            primary: sorted[0][0],
            confidence: Math.min(sorted[0][1] / 10, 1),
            all: sorted.slice(0, 3).map(([type, score]) => ({ type, score }))
        };
    },

    // Detect time period
    detectPeriod(text) {
        const sample = text.slice(0, 15000);

        // Look for explicit years
        const yearMatches = sample.match(/\b(1\d{3}|20[0-2]\d)\b/g) || [];
        const bcMatches = sample.match(/\b(\d{1,4})\s*(bc|bce|b\.c\.)/gi) || [];

        let scores = {};

        // Score from explicit years
        yearMatches.forEach(y => {
            const year = parseInt(y);
            for (const [period, data] of Object.entries(this.periods)) {
                if (year >= data.range[0] && year <= data.range[1]) {
                    scores[period] = (scores[period] || 0) + 1;
                }
            }
        });

        if (bcMatches.length > 0) {
            scores.ancient = (scores.ancient || 0) + bcMatches.length * 2;
        }

        // Score from markers
        for (const [period, data] of Object.entries(this.periods)) {
            const markerScore = this.matchPatterns(sample, data.markers);
            if (markerScore > 0) {
                scores[period] = (scores[period] || 0) + markerScore * 2;
            }
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return { period: 'unknown', confidence: 0 };

        return {
            period: sorted[0][0],
            confidence: Math.min(sorted[0][1] / 10, 1)
        };
    },

    // Extract metadata based on document type
    extractMetadata(text, docType) {
        const meta = {};
        const sample = text.slice(0, 20000);

        // Universal extractions
        meta.wordCount = text.split(/\s+/).length;
        meta.language = this.detectLanguage(sample);

        // Type-specific extractions
        if (docType.startsWith('legal/eu')) {
            Object.assign(meta, this.extractEUMetadata(sample));
        } else if (docType.startsWith('legal')) {
            Object.assign(meta, this.extractLegalMetadata(sample));
        } else if (docType.startsWith('ancient') || docType === 'religious') {
            Object.assign(meta, this.extractAncientMetadata(sample));
        } else if (docType === 'scientific') {
            Object.assign(meta, this.extractScientificMetadata(sample));
        }

        return meta;
    },

    extractEUMetadata(text) {
        const meta = {};

        // CELEX number
        const celex = text.match(/\b([0-9]{5}[A-Z][0-9]{4})\b/);
        if (celex) meta.celex = celex[1];

        // Document type
        if (/\bregulation\b/i.test(text)) meta.euDocType = 'regulation';
        else if (/\bdirective\b/i.test(text)) meta.euDocType = 'directive';
        else if (/\bdecision\b/i.test(text)) meta.euDocType = 'decision';
        else if (/\btreaty\b/i.test(text)) meta.euDocType = 'treaty';

        // OJ reference
        const oj = text.match(/OJ\s+([LC])\s*(\d+)/i);
        if (oj) meta.ojReference = `OJ ${oj[1]} ${oj[2]}`;

        // Date
        const dateMatch = text.match(/(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
        if (dateMatch) meta.date = `${dateMatch[1]} ${dateMatch[2]} ${dateMatch[3]}`;

        // Subject matter (look for "concerning" or "on the")
        const subject = text.match(/(?:concerning|on the|relating to)\s+([^.]{10,100})/i);
        if (subject) meta.subject = subject[1].trim();

        return meta;
    },

    extractLegalMetadata(text) {
        const meta = {};

        // Case citation
        const citation = text.match(/\b(\d+)\s+([A-Z][a-z]+\.?)\s+(\d+)/);
        if (citation) meta.citation = citation[0];

        // Court
        const courts = ['supreme court', 'court of appeal', 'high court', 'district court', 'circuit court'];
        for (const court of courts) {
            if (text.toLowerCase().includes(court)) {
                meta.court = court.replace(/\b\w/g, l => l.toUpperCase());
                break;
            }
        }

        return meta;
    },

    extractAncientMetadata(text) {
        const meta = {};

        // Look for translator
        const translator = text.match(/translat(?:ed|ion|or)[:\s]+(?:by\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
        if (translator) meta.translator = translator[1];

        // Original language hints
        if (/greek|ελληνικ/i.test(text)) meta.originalLanguage = 'Greek';
        else if (/latin|latina/i.test(text)) meta.originalLanguage = 'Latin';
        else if (/hebrew|עברית/i.test(text)) meta.originalLanguage = 'Hebrew';
        else if (/arabic|عربي/i.test(text)) meta.originalLanguage = 'Arabic';
        else if (/sanskrit|संस्कृत/i.test(text)) meta.originalLanguage = 'Sanskrit';

        return meta;
    },

    extractScientificMetadata(text) {
        const meta = {};

        // DOI
        const doi = text.match(/10\.\d{4,}\/[^\s]+/);
        if (doi) meta.doi = doi[0];

        // Abstract
        const abstract = text.match(/abstract[:\s]*([^]{100,500}?)(?=\n\n|introduction|keywords)/i);
        if (abstract) meta.abstract = abstract[1].trim();

        // Keywords
        const keywords = text.match(/keywords?[:\s]*([^]{20,200}?)(?=\n|introduction|1\.)/i);
        if (keywords) {
            meta.keywords = keywords[1].split(/[,;]/).map(k => k.trim()).filter(k => k.length > 2);
        }

        return meta;
    },

    // Simple language detection
    detectLanguage(text) {
        const sample = text.slice(0, 5000).toLowerCase();

        const markers = {
            english: /\b(the|and|of|to|in|is|that|for|with|as)\b/g,
            german: /\b(der|die|das|und|ist|von|mit|den|dem|ein)\b/g,
            french: /\b(le|la|les|de|du|des|et|est|que|pour)\b/g,
            spanish: /\b(el|la|los|las|de|del|que|en|por|con)\b/g,
            italian: /\b(il|la|di|che|è|per|con|non|una|sono)\b/g,
            portuguese: /\b(o|a|os|as|de|do|da|que|em|para)\b/g
        };

        let scores = {};
        for (const [lang, pattern] of Object.entries(markers)) {
            const matches = sample.match(pattern) || [];
            scores[lang] = matches.length;
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        return sorted[0][0];
    },

    // Generate hierarchical tags
    generateTags(docType, period, metadata) {
        const tags = [];

        // Primary type tag
        if (docType.primary !== 'unclassified') {
            tags.push(...docType.primary.split('/'));
        }

        // Period tag
        if (period.period !== 'unknown') {
            tags.push(period.period);
        }

        // Metadata-based tags
        if (metadata.euDocType) tags.push(metadata.euDocType);
        if (metadata.originalLanguage) tags.push(metadata.originalLanguage.toLowerCase());
        if (metadata.language) tags.push(`lang:${metadata.language}`);
        if (metadata.keywords) tags.push(...metadata.keywords.slice(0, 5));

        return [...new Set(tags)]; // dedupe
    },

    // Helper: count pattern matches
    matchPatterns(text, patterns) {
        let score = 0;
        for (const pattern of patterns) {
            const matches = text.match(new RegExp(pattern, 'gi')) || [];
            score += matches.length;
        }
        return score;
    },

    // Main classification function
    classify(text, existingMeta = {}) {
        const docType = this.detectType(text);
        const period = this.detectPeriod(text);
        const metadata = this.extractMetadata(text, docType.primary);
        const tags = this.generateTags(docType, period, metadata);

        return {
            type: docType,
            period: period,
            metadata: { ...existingMeta, ...metadata },
            tags: tags,
            classified: true,
            classifiedAt: new Date().toISOString()
        };
    }
};

// Export for use in other modules
window.Classifier = Classifier;
