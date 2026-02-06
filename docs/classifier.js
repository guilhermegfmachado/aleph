// aleph - universal document classifier
// Multi-jurisdiction legal system support + general classification

const Classifier = {

    // ═══════════════════════════════════════════════════════════════
    // JURISDICTION DETECTION
    // ═══════════════════════════════════════════════════════════════

    jurisdictions: {
        eu: {
            name: 'European Union',
            patterns: [
                /\b(regulation|directive|decision)\s*\(?(eu|ec|eec)\)?/i,
                /\b(celex|eur-lex|official journal)\b/i,
                /\b(european\s+(parliament|commission|council|court))/i,
                /\b(treaty\s+on|tfeu|teu|charter of fundamental)/i,
                /\bCOM\s*\(\d{4}\)\s*\d+/i,  // Commission documents
                /\bOJ\s+[LC]\s*\d+/i,  // Official Journal
                /\b(cjeu|ecj|court of justice)\b/i
            ],
            citationPattern: /(?:Regulation|Directive|Decision)\s*\((?:EU|EC)\)\s*(?:No\s*)?(\d{4})\/(\d+)/gi,
            docTypes: ['regulation', 'directive', 'decision', 'treaty', 'recommendation', 'opinion']
        },

        uk: {
            name: 'United Kingdom',
            patterns: [
                /\b(act of parliament|statutory instrument|si \d{4})/i,
                /\b(house of (commons|lords)|westminster)\b/i,
                /\b(uksc|ukhl|ewca|ewhc|bailii)\b/i,  // Court citations
                /\b(queen'?s?|king'?s?) bench\b/i,
                /\b(crown court|magistrates)\b/i,
                /\b(england and wales|scottish|northern ireland)\b/i,
                /\bc\.\s*\d+\s*\(\d{4}\)/i,  // Chapter citation
                /\b\d{4}\s+c\.\s*\d+/i,  // Year Chapter
                /\[\d{4}\]\s+(UKSC|UKHL|EWCA|EWHC)/i  // Neutral citations
            ],
            citationPattern: /\[(\d{4})\]\s+(UKSC|UKHL|EWCA|EWHC)\s+(\d+)/gi,
            docTypes: ['act', 'statutory_instrument', 'case', 'bill', 'command_paper']
        },

        france: {
            name: 'France',
            patterns: [
                /\b(code civil|code pénal|code de commerce)\b/i,
                /\b(loi|décret|arrêté|ordonnance)\s+n[°o]\s*\d+/i,
                /\b(conseil (d'état|constitutionnel)|cour de cassation)\b/i,
                /\b(assemblée nationale|sénat)\b/i,
                /\b(jorf|journal officiel)\b/i,
                /\b(république française|légifrance)\b/i,
                /\barticle\s+(L|R|D)\.\s*\d+/i,  // Code article format
                /\b(tribunal|cour d'appel|juridiction)\b/i
            ],
            citationPattern: /(?:Loi|Décret|Arrêté)\s+n[°o]\s*(\d{2,4})-(\d+)/gi,
            docTypes: ['loi', 'décret', 'arrêté', 'ordonnance', 'code', 'arrêt']
        },

        germany: {
            name: 'Germany',
            patterns: [
                /\b(grundgesetz|gg|bgb|stgb|hgb|zpo|stpo)\b/i,
                /\b(bundesgesetzblatt|bgbl)\b/i,
                /\b(bundestag|bundesrat|bundesregierung)\b/i,
                /\b(bundesverfassungsgericht|bverfg)\b/i,
                /\b(bundesgerichtshof|bgh)\b/i,
                /\b(verwaltungsgericht|oberlandesgericht)\b/i,
                /§\s*\d+\s*(abs\.|absatz)?\s*\d*/i,  // Paragraph citations
                /\b(bundesrepublik deutschland)\b/i
            ],
            citationPattern: /§\s*(\d+)(?:\s*(?:Abs\.|Absatz)\s*(\d+))?(?:\s*(BGB|StGB|GG|HGB|ZPO))?/gi,
            docTypes: ['gesetz', 'verordnung', 'urteil', 'beschluss', 'grundgesetz']
        },

        usa: {
            name: 'United States',
            patterns: [
                /\b(\d+)\s+u\.?s\.?c\.?\s+§?\s*(\d+)/i,  // USC citation
                /\b(\d+)\s+c\.?f\.?r\.?\s+§?\s*(\d+)/i,  // CFR citation
                /\b(supreme court|scotus)\b/i,
                /\b(\d+)\s+(u\.s\.|s\.ct\.|l\.ed)/i,  // Case citations
                /\b(circuit|district) court\b/i,
                /\b(congress|senate|house of representatives)\b/i,
                /\b(federal register|fed\. reg\.)\b/i,
                /\b(public law|p\.l\.)\s*\d+-\d+/i,
                /\bexecutive order\s+\d+/i
            ],
            citationPattern: /(\d+)\s+U\.?S\.?C\.?\s+§?\s*(\d+)/gi,
            docTypes: ['statute', 'regulation', 'case', 'executive_order', 'public_law']
        },

        china: {
            name: "People's Republic of China",
            patterns: [
                /\b(中华人民共和国|全国人民代表大会|国务院)\b/,
                /\b(law of the people'?s republic of china)\b/i,
                /\b(npc|national people'?s congress)\b/i,
                /\b(supreme people'?s court|spc)\b/i,
                /\b(state council)\s+(of|order|decree)/i,
                /\b(administrative (regulation|rule|measure)s?)\b/i,
                /\[(19|20)\d{2}\]\s*(法|刑|民)/,  // Case numbers
                /\b(prc|p\.r\.c\.)\b/i,
                /司法解释/,  // Judicial interpretation
                /\b(civil code|criminal law|contract law)\s+of\s+(the\s+)?prc/i
            ],
            citationPattern: /\[(\d{4})\]\s*(最高法|高法|中法|基法)?\s*(民|刑|行|知|执)\s*(初|终|再|抗|监)?\s*字?\s*第?\s*(\d+)\s*号?/g,
            docTypes: ['law', 'administrative_regulation', 'judicial_interpretation', 'local_regulation', 'case']
        },

        international: {
            name: 'International Law',
            patterns: [
                /\b(united nations|u\.?n\.?)\b/i,
                /\b(international court of justice|icj)\b/i,
                /\b(vienna convention|geneva convention)\b/i,
                /\b(treaty|convention|protocol)\b/i,
                /\b(general assembly|security council)\s+(resolution)?\b/i,
                /\bA\/RES\/\d+\/\d+/i,  // GA resolutions
                /\bS\/RES\/\d+/i,  // SC resolutions
                /\b(wto|world trade organization)\b/i,
                /\b(ilo|international labour)\b/i,
                /\b(icrc|red cross)\b/i
            ],
            citationPattern: /(?:A|S)\/RES\/(\d+)(?:\/(\d+))?/gi,
            docTypes: ['treaty', 'convention', 'resolution', 'protocol', 'declaration']
        },

        japan: {
            name: 'Japan',
            patterns: [
                /\b(日本国|国会|内閣)\b/,
                /\b(civil code|penal code)\s+of\s+japan/i,
                /\b(supreme court of japan|最高裁判所)\b/i,
                /\b(diet|kokkai)\b/i,
                /法律第\d+号/,  // Law number format
                /\b(ministry of justice|法務省)\b/i,
                /平成|令和|昭和/  // Era names
            ],
            citationPattern: /(?:法律|政令)第(\d+)号/g,
            docTypes: ['law', 'cabinet_order', 'ministerial_ordinance', 'case']
        },

        india: {
            name: 'India',
            patterns: [
                /\b(constitution of india)\b/i,
                /\b(lok sabha|rajya sabha|parliament of india)\b/i,
                /\b(supreme court of india|high court)\b/i,
                /\bAIR\s+\d{4}\s+(SC|HC)/i,  // All India Reporter
                /\b(central act|state act)\b/i,
                /\b(\d{4})\s+\(\d+\)\s+SCC\b/i,  // SCC citation
                /\b(indian penal code|ipc|crpc|cpc)\b/i,
                /\b(gazette of india)\b/i
            ],
            citationPattern: /AIR\s+(\d{4})\s+(SC|[A-Z]+)\s+(\d+)/gi,
            docTypes: ['act', 'ordinance', 'case', 'notification', 'rule']
        },

        brazil: {
            name: 'Brazil',
            patterns: [
                /\b(constituição federal|república federativa)\b/i,
                /\b(lei|decreto|medida provisória)\s+n[°o]\s*[\d\.]+/i,
                /\b(supremo tribunal federal|stf)\b/i,
                /\b(superior tribunal de justiça|stj)\b/i,
                /\b(congresso nacional|senado federal)\b/i,
                /\b(diário oficial da união|dou)\b/i,
                /\bcódigo (civil|penal|processo)\b/i
            ],
            citationPattern: /(?:Lei|Decreto)\s+n[°o]\s*([\d\.]+)/gi,
            docTypes: ['lei', 'decreto', 'medida_provisória', 'emenda_constitucional', 'acórdão']
        },

        russia: {
            name: 'Russian Federation',
            patterns: [
                /\b(российская федерация|конституция рф)\b/i,
                /\b(federal law|федеральный закон)\b/i,
                /\b(constitutional court|конституционный суд)\b/i,
                /\b(государственная дума|совет федерации)\b/i,
                /\b(гражданский кодекс|уголовный кодекс)\b/i,
                /от\s+\d{1,2}\.\d{2}\.\d{4}\s+№\s*\d+/,  // Date and number format
                /\bФЗ-\d+\b/i
            ],
            citationPattern: /(?:от|№)\s*(\d+)-ФЗ/gi,
            docTypes: ['federal_law', 'decree', 'resolution', 'code', 'ruling']
        }
    },

    // ═══════════════════════════════════════════════════════════════
    // DOCUMENT TYPE PATTERNS (non-legal)
    // ═══════════════════════════════════════════════════════════════

    documentTypes: {
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
        scientific: [
            /\b(hypothesis|methodology|results|conclusion|abstract)\b/i,
            /\b(experiment|data|analysis|statistical|significant)\b/i,
            /\b(peer.?review|journal|citation|doi)\b/i,
            /\b(fig\.|figure\s+\d|table\s+\d|equation)\b/i
        ],
        literary: [
            /\bchapter\s+(one|two|three|\d+|[ivxlc]+)\b/i,
            /[""][^""]{20,}[""]\s*(said|asked|replied)/i,
            /\b(novel|story|tale|narrative|fiction)\b/i
        ]
    },

    // ═══════════════════════════════════════════════════════════════
    // TIME PERIODS
    // ═══════════════════════════════════════════════════════════════

    periods: {
        ancient: { range: [-3000, 500], markers: [/\b(ancient|classical|antiquity)\b/i, /\b(bc|bce)\b/i] },
        medieval: { range: [500, 1500], markers: [/\b(medieval|middle\s+ages|feudal)\b/i] },
        earlyModern: { range: [1500, 1800], markers: [/\b(renaissance|enlightenment)\b/i] },
        modern: { range: [1800, 1950], markers: [/\b(industrial|victorian|19th\s+century)\b/i] },
        contemporary: { range: [1950, 2100], markers: [/\b(contemporary|21st\s+century)\b/i] }
    },

    // ═══════════════════════════════════════════════════════════════
    // DETECTION METHODS
    // ═══════════════════════════════════════════════════════════════

    detectJurisdiction(text) {
        const sample = text.slice(0, 20000);
        const scores = {};

        for (const [code, juris] of Object.entries(this.jurisdictions)) {
            let score = 0;
            for (const pattern of juris.patterns) {
                const matches = sample.match(new RegExp(pattern, 'gi')) || [];
                score += matches.length;
            }
            if (score > 2) {
                scores[code] = { score, name: juris.name };
            }
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
        if (sorted.length === 0) return null;

        return {
            primary: sorted[0][0],
            name: sorted[0][1].name,
            confidence: Math.min(sorted[0][1].score / 15, 1),
            all: sorted.slice(0, 3).map(([code, data]) => ({ code, ...data }))
        };
    },

    detectDocumentType(text) {
        const sample = text.slice(0, 15000);
        const scores = {};

        // Check ancient patterns
        for (const [subtype, patterns] of Object.entries(this.documentTypes.ancient)) {
            const score = this.matchPatterns(sample, patterns);
            if (score > 2) scores[`ancient/${subtype}`] = score;
        }

        // Check scientific
        const sciScore = this.matchPatterns(sample, this.documentTypes.scientific);
        if (sciScore > 3) scores['scientific'] = sciScore;

        // Check literary
        const litScore = this.matchPatterns(sample, this.documentTypes.literary);
        if (litScore > 2) scores['literary'] = litScore;

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return { primary: 'unclassified', confidence: 0, all: [] };

        return {
            primary: sorted[0][0],
            confidence: Math.min(sorted[0][1] / 10, 1),
            all: sorted.slice(0, 3).map(([type, score]) => ({ type, score }))
        };
    },

    detectPeriod(text) {
        const sample = text.slice(0, 15000);
        const scores = {};

        // Year detection
        const yearMatches = sample.match(/\b(1\d{3}|20[0-2]\d)\b/g) || [];
        yearMatches.forEach(y => {
            const year = parseInt(y);
            for (const [period, data] of Object.entries(this.periods)) {
                if (year >= data.range[0] && year <= data.range[1]) {
                    scores[period] = (scores[period] || 0) + 1;
                }
            }
        });

        // BC detection
        if (/\b\d{1,4}\s*(bc|bce)/gi.test(sample)) {
            scores.ancient = (scores.ancient || 0) + 5;
        }

        // Marker detection
        for (const [period, data] of Object.entries(this.periods)) {
            const markerScore = this.matchPatterns(sample, data.markers);
            if (markerScore > 0) scores[period] = (scores[period] || 0) + markerScore * 2;
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        return sorted.length ? { period: sorted[0][0], confidence: Math.min(sorted[0][1] / 10, 1) } : { period: 'unknown', confidence: 0 };
    },

    // ═══════════════════════════════════════════════════════════════
    // METADATA EXTRACTION
    // ═══════════════════════════════════════════════════════════════

    extractMetadata(text, jurisdiction, docType) {
        const meta = {};
        const sample = text.slice(0, 25000);

        // Universal
        meta.wordCount = text.split(/\s+/).length;
        meta.language = this.detectLanguage(sample);

        // Jurisdiction-specific
        if (jurisdiction) {
            const extractor = this.metadataExtractors[jurisdiction];
            if (extractor) Object.assign(meta, extractor.call(this, sample));
        }

        // Type-specific
        if (docType?.startsWith('ancient')) {
            Object.assign(meta, this.extractAncientMetadata(sample));
        } else if (docType === 'scientific') {
            Object.assign(meta, this.extractScientificMetadata(sample));
        }

        return meta;
    },

    metadataExtractors: {
        eu(text) {
            const meta = {};
            const celex = text.match(/\b([0-9]{5}[A-Z][0-9]{4})\b/);
            if (celex) meta.celex = celex[1];

            if (/\bregulation\b/i.test(text)) meta.docType = 'regulation';
            else if (/\bdirective\b/i.test(text)) meta.docType = 'directive';
            else if (/\bdecision\b/i.test(text)) meta.docType = 'decision';
            else if (/\btreaty\b/i.test(text)) meta.docType = 'treaty';

            const oj = text.match(/OJ\s+([LC])\s*(\d+)/i);
            if (oj) meta.ojReference = `OJ ${oj[1]} ${oj[2]}`;

            const subject = text.match(/(?:concerning|on the|relating to)\s+([^.]{10,100})/i);
            if (subject) meta.subject = subject[1].trim();

            return meta;
        },

        uk(text) {
            const meta = {};

            // Act citation
            const act = text.match(/(\d{4})\s+c\.\s*(\d+)/);
            if (act) meta.actCitation = `${act[1]} c. ${act[2]}`;

            // Neutral citation
            const neutral = text.match(/\[(\d{4})\]\s+(UKSC|UKHL|EWCA|EWHC)\s+(\d+)/);
            if (neutral) meta.neutralCitation = neutral[0];

            // SI number
            const si = text.match(/SI\s+(\d{4})\/(\d+)/i);
            if (si) meta.siNumber = `SI ${si[1]}/${si[2]}`;

            if (/\bact\s+of\s+parliament\b/i.test(text)) meta.docType = 'act';
            else if (/\bstatutory instrument\b/i.test(text)) meta.docType = 'statutory_instrument';

            return meta;
        },

        france(text) {
            const meta = {};

            const loi = text.match(/loi\s+n[°o]\s*(\d{2,4})-(\d+)/i);
            if (loi) meta.lawNumber = `Loi n°${loi[1]}-${loi[2]}`;

            const decret = text.match(/décret\s+n[°o]\s*(\d{2,4})-(\d+)/i);
            if (decret) meta.decreeNumber = `Décret n°${decret[1]}-${decret[2]}`;

            const jorf = text.match(/JORF\s+n[°o]?\s*(\d+)/i);
            if (jorf) meta.jorfNumber = jorf[0];

            // Code article
            const article = text.match(/article\s+(L|R|D)\.\s*(\d+-?\d*)/i);
            if (article) meta.codeArticle = `Article ${article[1]}.${article[2]}`;

            return meta;
        },

        germany(text) {
            const meta = {};

            const bgbl = text.match(/BGBl\.?\s*(I|II)?\s*S\.\s*(\d+)/i);
            if (bgbl) meta.bgblCitation = bgbl[0];

            const paragraph = text.match(/§\s*(\d+)\s*(BGB|StGB|GG|HGB|ZPO)/i);
            if (paragraph) meta.paragraph = `§${paragraph[1]} ${paragraph[2]}`;

            // Court decision
            const decision = text.match(/(BVerfG|BGH|BVerwG)[,\s]+(?:Urteil|Beschluss)/i);
            if (decision) meta.court = decision[1];

            return meta;
        },

        usa(text) {
            const meta = {};

            const usc = text.match(/(\d+)\s+U\.?S\.?C\.?\s+§?\s*(\d+)/);
            if (usc) meta.uscCitation = `${usc[1]} U.S.C. § ${usc[2]}`;

            const cfr = text.match(/(\d+)\s+C\.?F\.?R\.?\s+§?\s*(\d+)/);
            if (cfr) meta.cfrCitation = `${cfr[1]} C.F.R. § ${cfr[2]}`;

            const publicLaw = text.match(/(?:Public Law|P\.L\.)\s*(\d+)-(\d+)/i);
            if (publicLaw) meta.publicLaw = `P.L. ${publicLaw[1]}-${publicLaw[2]}`;

            const scotus = text.match(/(\d+)\s+U\.S\.\s+(\d+)/);
            if (scotus) meta.usCitation = `${scotus[1]} U.S. ${scotus[2]}`;

            return meta;
        },

        china(text) {
            const meta = {};

            // Chinese law number format
            const lawNum = text.match(/中华人民共和国.{2,20}法/);
            if (lawNum) meta.lawName = lawNum[0];

            // Case number
            const caseNum = text.match(/\[(\d{4})\]\s*(最高法|高法|中法)?\s*(民|刑|行)\s*(初|终|再)?\s*(\d+)\s*号/);
            if (caseNum) meta.caseNumber = caseNum[0];

            // SPC interpretation
            if (/司法解释|最高人民法院.*解释/i.test(text)) {
                meta.docType = 'judicial_interpretation';
            }

            return meta;
        },

        international(text) {
            const meta = {};

            const gaRes = text.match(/A\/RES\/(\d+)\/(\d+)/);
            if (gaRes) meta.resolution = `A/RES/${gaRes[1]}/${gaRes[2]}`;

            const scRes = text.match(/S\/RES\/(\d+)/);
            if (scRes) meta.resolution = `S/RES/${scRes[1]}`;

            const treaty = text.match(/(vienna|geneva|hague|rome)\s+convention/i);
            if (treaty) meta.treatyName = treaty[0];

            return meta;
        },

        japan(text) {
            const meta = {};
            const lawNum = text.match(/法律第(\d+)号/);
            if (lawNum) meta.lawNumber = `法律第${lawNum[1]}号`;
            return meta;
        },

        india(text) {
            const meta = {};
            const air = text.match(/AIR\s+(\d{4})\s+(SC|[A-Z]+)\s+(\d+)/);
            if (air) meta.airCitation = air[0];
            const scc = text.match(/(\d{4})\s*\(\d+\)\s*SCC\s+(\d+)/);
            if (scc) meta.sccCitation = scc[0];
            return meta;
        },

        brazil(text) {
            const meta = {};
            const lei = text.match(/Lei\s+n[°o]\s*([\d\.]+)/i);
            if (lei) meta.lawNumber = lei[0];
            return meta;
        },

        russia(text) {
            const meta = {};
            const fz = text.match(/(\d+)-ФЗ/);
            if (fz) meta.federalLaw = fz[0];
            return meta;
        }
    },

    extractAncientMetadata(text) {
        const meta = {};
        const translator = text.match(/translat(?:ed|ion|or)[:\s]+(?:by\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
        if (translator) meta.translator = translator[1];

        if (/greek|ελληνικ/i.test(text)) meta.originalLanguage = 'Greek';
        else if (/latin|latina/i.test(text)) meta.originalLanguage = 'Latin';
        else if (/hebrew|עברית/i.test(text)) meta.originalLanguage = 'Hebrew';
        else if (/arabic|عربي/i.test(text)) meta.originalLanguage = 'Arabic';
        else if (/sanskrit|संस्कृत/i.test(text)) meta.originalLanguage = 'Sanskrit';

        return meta;
    },

    extractScientificMetadata(text) {
        const meta = {};
        const doi = text.match(/10\.\d{4,}\/[^\s]+/);
        if (doi) meta.doi = doi[0];

        const abstract = text.match(/abstract[:\s]*([^]{100,500}?)(?=\n\n|introduction|keywords)/i);
        if (abstract) meta.abstract = abstract[1].trim();

        return meta;
    },

    // ═══════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════

    detectLanguage(text) {
        const sample = text.slice(0, 5000).toLowerCase();
        const markers = {
            english: /\b(the|and|of|to|in|is|that|for|with|as)\b/g,
            german: /\b(der|die|das|und|ist|von|mit|den|dem|ein)\b/g,
            french: /\b(le|la|les|de|du|des|et|est|que|pour)\b/g,
            spanish: /\b(el|la|los|las|de|del|que|en|por|con)\b/g,
            chinese: /[\u4e00-\u9fff]/g,
            russian: /[\u0400-\u04FF]/g,
            japanese: /[\u3040-\u309f\u30a0-\u30ff]/g,
            portuguese: /\b(o|a|os|as|de|do|da|que|em|para)\b/g
        };

        let scores = {};
        for (const [lang, pattern] of Object.entries(markers)) {
            scores[lang] = (sample.match(pattern) || []).length;
        }

        const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        return sorted[0][1] > 0 ? sorted[0][0] : 'unknown';
    },

    matchPatterns(text, patterns) {
        let score = 0;
        for (const pattern of patterns) {
            const matches = text.match(new RegExp(pattern, 'gi')) || [];
            score += matches.length;
        }
        return score;
    },

    generateTags(jurisdiction, docType, period, metadata) {
        const tags = [];

        // Jurisdiction tags
        if (jurisdiction?.primary) {
            tags.push(jurisdiction.primary);
            tags.push('legal');
        }

        // Document type tags
        if (docType?.primary && docType.primary !== 'unclassified') {
            tags.push(...docType.primary.split('/'));
        }

        // Period
        if (period?.period && period.period !== 'unknown') {
            tags.push(period.period);
        }

        // Metadata-based
        if (metadata?.docType) tags.push(metadata.docType);
        if (metadata?.language) tags.push(`lang:${metadata.language}`);
        if (metadata?.originalLanguage) tags.push(metadata.originalLanguage.toLowerCase());

        return [...new Set(tags)];
    },

    // ═══════════════════════════════════════════════════════════════
    // MAIN CLASSIFICATION
    // ═══════════════════════════════════════════════════════════════

    classify(text, existingMeta = {}) {
        // Detect jurisdiction first (legal documents)
        const jurisdiction = this.detectJurisdiction(text);

        // Detect document type (for non-legal or additional classification)
        let docType;
        if (jurisdiction) {
            // Legal document - use jurisdiction as primary type
            docType = { primary: `legal/${jurisdiction.primary}`, confidence: jurisdiction.confidence, all: [] };
        } else {
            docType = this.detectDocumentType(text);
        }

        const period = this.detectPeriod(text);
        const metadata = this.extractMetadata(text, jurisdiction?.primary, docType?.primary);
        const tags = this.generateTags(jurisdiction, docType, period, metadata);

        return {
            jurisdiction,
            type: docType,
            period,
            metadata: { ...existingMeta, ...metadata },
            tags,
            classified: true,
            classifiedAt: new Date().toISOString()
        };
    }
};

window.Classifier = Classifier;
