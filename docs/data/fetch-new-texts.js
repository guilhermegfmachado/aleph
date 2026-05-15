#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const textsDir = './texts';

const TEXTS = [
  // ═══════════════════════════════════════════════════════════════
  // ANCIENT NEAR EAST
  // ═══════════════════════════════════════════════════════════════
  { id: 'gilgamesh', gutenberg: 11000, title: 'The Epic of Gilgamesh', author: 'Anonymous', period: 'ancient', year: -2100, tags: ['epic', 'mesopotamia', 'sumerian', 'flood myth', 'immortality'] },
  { id: 'book-of-dead', gutenberg: 7145, title: 'The Egyptian Book of the Dead', author: 'Anonymous', period: 'ancient', year: -1550, tags: ['egyptian', 'afterlife', 'funerary', 'spells', 'osiris'] },

  // ═══════════════════════════════════════════════════════════════
  // GREEK — Philosophy
  // ═══════════════════════════════════════════════════════════════
  { id: 'epictetus-enchiridion', gutenberg: 45109, title: 'Enchiridion', author: 'Epictetus', period: 'classical', year: 125, tags: ['stoicism', 'ethics', 'manual', 'practical philosophy'] },
  { id: 'epictetus-discourses', gutenberg: 10661, title: 'Discourses', author: 'Epictetus', period: 'classical', year: 108, tags: ['stoicism', 'ethics', 'lectures', 'arrian'] },
  { id: 'diogenes-laertius', gutenberg: 57342, title: 'Lives of Eminent Philosophers', author: 'Diogenes Laërtius', period: 'classical', year: 230, tags: ['biography', 'philosophy', 'doxography', 'anecdotes'] },
  { id: 'plotinus-enneads', gutenberg: 37903, title: 'The Enneads (Selections)', author: 'Plotinus', period: 'classical', year: 270, tags: ['neoplatonism', 'metaphysics', 'the one', 'emanation'] },

  // ═══════════════════════════════════════════════════════════════
  // GREEK — Poetry & Drama
  // ═══════════════════════════════════════════════════════════════
  { id: 'hesiod-theogony', gutenberg: 348, title: 'Theogony & Works and Days', author: 'Hesiod', period: 'classical', year: -700, tags: ['cosmogony', 'greek mythology', 'didactic poetry', 'ages of man'] },
  { id: 'pindar-odes', gutenberg: 10717, title: 'The Odes', author: 'Pindar', period: 'classical', year: -470, tags: ['lyric poetry', 'victory odes', 'olympic games', 'mythology'] },
  { id: 'euripides-medea', gutenberg: 35451, title: 'Medea', author: 'Euripides', period: 'classical', year: -431, tags: ['tragedy', 'revenge', 'women', 'infanticide', 'jason'] },
  { id: 'euripides-bacchae', gutenberg: 5793, title: 'The Bacchae', author: 'Euripides', period: 'classical', year: -405, tags: ['tragedy', 'dionysus', 'ecstasy', 'madness', 'ritual'] },
  { id: 'euripides-hippolytus', gutenberg: 14337, title: 'Hippolytus', author: 'Euripides', period: 'classical', year: -428, tags: ['tragedy', 'phaedra', 'passion', 'artemis', 'aphrodite'] },
  { id: 'aristophanes-clouds', gutenberg: 2562, title: 'The Clouds', author: 'Aristophanes', period: 'classical', year: -423, tags: ['comedy', 'socrates', 'satire', 'sophistry', 'education'] },
  { id: 'aristophanes-birds', gutenberg: 3013, title: 'The Birds', author: 'Aristophanes', period: 'classical', year: -414, tags: ['comedy', 'utopia', 'fantasy', 'politics', 'satire'] },
  { id: 'aristophanes-lysistrata', gutenberg: 7700, title: 'Lysistrata', author: 'Aristophanes', period: 'classical', year: -411, tags: ['comedy', 'war', 'women', 'sex strike', 'peace'] },

  // ═══════════════════════════════════════════════════════════════
  // GREEK — History & Prose
  // ═══════════════════════════════════════════════════════════════
  { id: 'xenophon-anabasis', gutenberg: 1170, title: 'Anabasis', author: 'Xenophon', period: 'classical', year: -370, tags: ['history', 'ten thousand', 'persia', 'mercenaries', 'march'] },
  { id: 'xenophon-memorabilia', gutenberg: 1177, title: 'Memorabilia', author: 'Xenophon', period: 'classical', year: -371, tags: ['socrates', 'dialogues', 'ethics', 'biography'] },
  { id: 'xenophon-cyropaedia', gutenberg: 2085, title: 'Cyropaedia', author: 'Xenophon', period: 'classical', year: -370, tags: ['cyrus', 'persia', 'education', 'leadership', 'political philosophy'] },
  { id: 'lucian-dialogues', gutenberg: 6829, title: 'Dialogues of the Dead', author: 'Lucian', period: 'classical', year: 165, tags: ['satire', 'afterlife', 'philosophy', 'wit', 'menippean'] },
  { id: 'longus-daphnis', gutenberg: 2629, title: 'Daphnis and Chloe', author: 'Longus', period: 'classical', year: 200, tags: ['pastoral', 'romance', 'love', 'greek novel'] },

  // ═══════════════════════════════════════════════════════════════
  // ROMAN — Philosophy
  // ═══════════════════════════════════════════════════════════════
  { id: 'cicero-offices', gutenberg: 47001, title: 'De Officiis (On Duties)', author: 'Cicero', period: 'classical', year: -44, tags: ['ethics', 'duty', 'stoicism', 'practical wisdom'] },
  { id: 'cicero-tusculan', gutenberg: 14988, title: 'Tusculan Disputations', author: 'Cicero', period: 'classical', year: -45, tags: ['philosophy', 'death', 'pain', 'grief', 'emotions'] },
  { id: 'cicero-nature-gods', gutenberg: 14988, title: 'On the Nature of the Gods', author: 'Cicero', period: 'classical', year: -45, tags: ['theology', 'epicureanism', 'stoicism', 'skepticism'] },
  { id: 'lucretius-natura', gutenberg: 785, title: 'De Rerum Natura', author: 'Lucretius', period: 'classical', year: -55, tags: ['epicureanism', 'atomism', 'physics', 'didactic poetry', 'death'] },
  { id: 'seneca-letters', gutenberg: 56075, title: 'Moral Letters to Lucilius', author: 'Seneca', period: 'classical', year: 65, tags: ['stoicism', 'ethics', 'letters', 'practical philosophy', 'death'] },
  { id: 'seneca-dialogues', gutenberg: 56078, title: 'Dialogues (On Anger, On Providence)', author: 'Seneca', period: 'classical', year: 50, tags: ['stoicism', 'anger', 'providence', 'consolation'] },
  { id: 'boethius-consolation', gutenberg: 14328, title: 'The Consolation of Philosophy', author: 'Boethius', period: 'late_antique', year: 524, tags: ['philosophy', 'fortune', 'free will', 'theodicy', 'prison'] },

  // ═══════════════════════════════════════════════════════════════
  // ROMAN — Poetry
  // ═══════════════════════════════════════════════════════════════
  { id: 'ovid-metamorphoses', gutenberg: 26073, title: 'Metamorphoses', author: 'Ovid', period: 'classical', year: 8, tags: ['mythology', 'transformation', 'epic', 'love', 'gods'] },
  { id: 'ovid-art-love', gutenberg: 5765, title: 'Ars Amatoria', author: 'Ovid', period: 'classical', year: 2, tags: ['love', 'seduction', 'didactic', 'wit', 'elegiac'] },
  { id: 'horace-odes', gutenberg: 9175, title: 'Odes', author: 'Horace', period: 'classical', year: -23, tags: ['lyric poetry', 'carpe diem', 'wine', 'friendship', 'golden mean'] },
  { id: 'horace-satires', gutenberg: 14020, title: 'Satires and Epistles', author: 'Horace', period: 'classical', year: -35, tags: ['satire', 'ethics', 'self-mockery', 'horatian satire'] },
  { id: 'juvenal-satires', gutenberg: 50848, title: 'Satires', author: 'Juvenal', period: 'classical', year: 127, tags: ['satire', 'indignation', 'rome', 'corruption', 'women'] },
  { id: 'catullus-poems', gutenberg: 24122, title: 'Poems', author: 'Catullus', period: 'classical', year: -54, tags: ['love poetry', 'lesbia', 'lyric', 'invective', 'neoteric'] },

  // ═══════════════════════════════════════════════════════════════
  // ROMAN — History & Prose
  // ═══════════════════════════════════════════════════════════════
  { id: 'livy-rome', gutenberg: 19725, title: 'History of Rome (Books I-X)', author: 'Livy', period: 'classical', year: -27, tags: ['history', 'rome', 'republic', 'founding myths', 'exempla'] },
  { id: 'suetonius-caesars', gutenberg: 6386, title: 'Lives of the Twelve Caesars', author: 'Suetonius', period: 'classical', year: 121, tags: ['biography', 'emperors', 'gossip', 'anecdotes', 'rome'] },
  { id: 'pliny-letters', gutenberg: 2811, title: 'Letters', author: 'Pliny the Younger', period: 'classical', year: 109, tags: ['letters', 'eruption vesuvius', 'roman life', 'trajan'] },
  { id: 'petronius-satyricon', gutenberg: 5225, title: 'Satyricon', author: 'Petronius', period: 'classical', year: 65, tags: ['novel', 'satire', 'picaresque', 'feast trimalchio', 'decadence'] },
  { id: 'apuleius-golden-ass', gutenberg: 1666, title: 'The Golden Ass', author: 'Apuleius', period: 'classical', year: 170, tags: ['novel', 'metamorphosis', 'cupid psyche', 'isis', 'magic'] },

  // ═══════════════════════════════════════════════════════════════
  // MEDIEVAL — Epic & Romance
  // ═══════════════════════════════════════════════════════════════
  { id: 'beowulf', gutenberg: 16328, title: 'Beowulf', author: 'Anonymous', period: 'medieval', year: 1000, tags: ['old english', 'epic', 'monsters', 'anglo-saxon', 'heroism'] },
  { id: 'poetic-edda', gutenberg: 14726, title: 'The Poetic Edda', author: 'Anonymous', period: 'medieval', year: 1270, tags: ['norse mythology', 'old norse', 'ragnarok', 'odin', 'thor'] },
  { id: 'song-roland', gutenberg: 391, title: 'The Song of Roland', author: 'Anonymous', period: 'medieval', year: 1100, tags: ['chanson de geste', 'charlemagne', 'chivalry', 'crusades', 'french epic'] },
  { id: 'nibelungenlied', gutenberg: 7321, title: 'Nibelungenlied', author: 'Anonymous', period: 'medieval', year: 1200, tags: ['german epic', 'siegfried', 'kriemhild', 'burgundy', 'revenge'] },
  { id: 'cid', gutenberg: 500, title: 'El Cantar de mio Cid', author: 'Anonymous', period: 'medieval', year: 1207, tags: ['spanish epic', 'reconquista', 'honor', 'exile', 'castile'] },
  { id: 'gawain-green-knight', gutenberg: 14568, title: 'Sir Gawain and the Green Knight', author: 'Anonymous', period: 'medieval', year: 1375, tags: ['arthurian', 'chivalry', 'temptation', 'beheading game', 'alliterative'] },
  { id: 'malory-morte-arthur', gutenberg: 1251, title: 'Le Morte d\'Arthur', author: 'Thomas Malory', period: 'medieval', year: 1485, tags: ['arthurian', 'round table', 'lancelot', 'grail', 'camelot'] },

  // ═══════════════════════════════════════════════════════════════
  // MEDIEVAL — Italian
  // ═══════════════════════════════════════════════════════════════
  { id: 'boccaccio-decameron', gutenberg: 23700, title: 'The Decameron', author: 'Giovanni Boccaccio', period: 'medieval', year: 1353, tags: ['frame narrative', 'plague', 'novella', 'wit', 'renaissance'] },
  { id: 'petrarch-canzoniere', gutenberg: 17650, title: 'Canzoniere (Sonnets to Laura)', author: 'Francesco Petrarca', period: 'medieval', year: 1374, tags: ['sonnets', 'laura', 'love poetry', 'petrarchism', 'vernacular'] },

  // ═══════════════════════════════════════════════════════════════
  // MEDIEVAL — English
  // ═══════════════════════════════════════════════════════════════
  { id: 'chaucer-canterbury', gutenberg: 2383, title: 'The Canterbury Tales', author: 'Geoffrey Chaucer', period: 'medieval', year: 1400, tags: ['pilgrimage', 'estates satire', 'frame narrative', 'middle english'] },
  { id: 'piers-plowman', gutenberg: 43659, title: 'Piers Plowman', author: 'William Langland', period: 'medieval', year: 1370, tags: ['allegory', 'vision', 'social criticism', 'alliterative'] },
  { id: 'margery-kempe', gutenberg: 5196, title: 'The Book of Margery Kempe', author: 'Margery Kempe', period: 'medieval', year: 1438, tags: ['autobiography', 'mysticism', 'pilgrimage', 'visions', 'women'] },
  { id: 'cloud-unknowing', gutenberg: 30448, title: 'The Cloud of Unknowing', author: 'Anonymous', period: 'medieval', year: 1375, tags: ['mysticism', 'contemplation', 'apophatic', 'prayer'] },
  { id: 'julian-norwich', gutenberg: 52958, title: 'Revelations of Divine Love', author: 'Julian of Norwich', period: 'medieval', year: 1395, tags: ['mysticism', 'visions', 'theodicy', 'divine love', 'anchoress'] },

  // ═══════════════════════════════════════════════════════════════
  // MEDIEVAL — Philosophy & Theology
  // ═══════════════════════════════════════════════════════════════
  { id: 'aquinas-summa', gutenberg: 17611, title: 'Summa Theologica (Selections)', author: 'Thomas Aquinas', period: 'medieval', year: 1274, tags: ['scholasticism', 'theology', 'five ways', 'natural law', 'thomism'] },
  { id: 'meister-eckhart', gutenberg: 39766, title: 'Meister Eckhart\'s Sermons', author: 'Meister Eckhart', period: 'medieval', year: 1328, tags: ['mysticism', 'german', 'detachment', 'ground of soul', 'apophatic'] },
  { id: 'abelard-heloise', gutenberg: 35977, title: 'Letters of Abelard and Heloise', author: 'Peter Abelard & Heloise', period: 'medieval', year: 1132, tags: ['letters', 'love', 'philosophy', 'monasticism', 'tragedy'] },

  // ═══════════════════════════════════════════════════════════════
  // PERSIAN
  // ═══════════════════════════════════════════════════════════════
  { id: 'rubaiyat-khayyam', gutenberg: 246, title: 'Rubáiyát of Omar Khayyám', author: 'Omar Khayyám', period: 'medieval', year: 1120, tags: ['persian poetry', 'quatrains', 'carpe diem', 'wine', 'mortality'] },
  { id: 'rumi-masnavi', gutenberg: 34903, title: 'The Masnavi (Selections)', author: 'Jalal ad-Din Rumi', period: 'medieval', year: 1273, tags: ['persian poetry', 'sufi', 'mysticism', 'love', 'parables'] },

  // ═══════════════════════════════════════════════════════════════
  // ARABIC
  // ═══════════════════════════════════════════════════════════════
  { id: 'arabian-nights', gutenberg: 128, title: 'The Arabian Nights (Selections)', author: 'Anonymous', period: 'medieval', year: 850, tags: ['arabic', 'frame narrative', 'scheherazade', 'folklore'] },

  // ═══════════════════════════════════════════════════════════════
  // EAST ASIAN
  // ═══════════════════════════════════════════════════════════════
  { id: 'tale-of-genji', gutenberg: 6540, title: 'The Tale of Genji (Selections)', author: 'Murasaki Shikibu', period: 'medieval', year: 1010, tags: ['japanese', 'heian', 'novel', 'court life', 'mono no aware'] },
  { id: 'zhuangzi', gutenberg: 17072, title: 'Zhuangzi', author: 'Zhuangzi', period: 'classical', year: -300, tags: ['taoism', 'chinese philosophy', 'wu wei', 'relativism', 'butterfly dream'] },
  { id: 'i-ching', gutenberg: 339, title: 'I Ching (Book of Changes)', author: 'Anonymous', period: 'ancient', year: -1000, tags: ['divination', 'chinese philosophy', 'yin yang', 'hexagrams', 'wisdom'] },
  { id: 'mencius', gutenberg: 56063, title: 'Mencius', author: 'Mencius', period: 'classical', year: -300, tags: ['confucianism', 'human nature', 'righteousness', 'benevolence'] },

  // ═══════════════════════════════════════════════════════════════
  // INDIAN
  // ═══════════════════════════════════════════════════════════════
  { id: 'upanishads', gutenberg: 3283, title: 'The Upanishads', author: 'Various', period: 'ancient', year: -800, tags: ['sanskrit', 'hindu philosophy', 'vedanta', 'brahman', 'atman'] },
  { id: 'ramayana', gutenberg: 24869, title: 'The Ramayana (Selections)', author: 'Valmiki', period: 'ancient', year: -400, tags: ['sanskrit', 'epic', 'rama', 'sita', 'dharma', 'hindu'] },
  { id: 'mahabharata-selections', gutenberg: 7864, title: 'Mahabharata (Selections)', author: 'Vyasa', period: 'ancient', year: -400, tags: ['sanskrit', 'epic', 'kurukshetra', 'dharma', 'hindu'] },

  // ═══════════════════════════════════════════════════════════════
  // EARLY MODERN — Philosophy
  // ═══════════════════════════════════════════════════════════════
  { id: 'montaigne-essays', gutenberg: 3600, title: 'Essays', author: 'Michel de Montaigne', period: 'early_modern', year: 1580, tags: ['essay', 'skepticism', 'self-examination', 'humanism'] },
  { id: 'pascal-pensees', gutenberg: 18269, title: 'Pensées', author: 'Blaise Pascal', period: 'early_modern', year: 1670, tags: ['aphorisms', 'christianity', 'wagering', 'human condition'] },
  { id: 'erasmus-folly', gutenberg: 9371, title: 'In Praise of Folly', author: 'Erasmus', period: 'early_modern', year: 1511, tags: ['satire', 'humanism', 'church criticism', 'wit'] },
  { id: 'more-utopia', gutenberg: 2130, title: 'Utopia', author: 'Thomas More', period: 'early_modern', year: 1516, tags: ['utopia', 'political philosophy', 'humanism', 'satire'] },
  { id: 'bacon-essays', gutenberg: 575, title: 'Essays', author: 'Francis Bacon', period: 'early_modern', year: 1625, tags: ['essays', 'practical wisdom', 'aphorisms', 'science'] }
];

function fetchGutenberg(id) {
  return new Promise((resolve, reject) => {
    const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;
    console.log(`  Fetching Gutenberg #${id}...`);

    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => resolve(data));
        }).on('error', reject);
      } else if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
      } else {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }
    }).on('error', reject);
  });
}

function cleanGutenbergText(raw) {
  let text = raw;
  const startMarkers = ['*** START OF THE PROJECT GUTENBERG', '*** START OF THIS PROJECT GUTENBERG', '*END*THE SMALL PRINT'];
  const endMarkers = ['*** END OF THE PROJECT GUTENBERG', '*** END OF THIS PROJECT GUTENBERG', 'End of the Project Gutenberg', 'End of Project Gutenberg'];

  for (const marker of startMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      const lineEnd = text.indexOf('\n', idx);
      text = text.substring(lineEnd + 1);
      break;
    }
  }

  for (const marker of endMarkers) {
    const idx = text.indexOf(marker);
    if (idx !== -1) {
      text = text.substring(0, idx);
      break;
    }
  }

  return text.trim();
}

async function processText(textInfo) {
  console.log(`\n[${textInfo.id}] ${textInfo.title} by ${textInfo.author}`);

  const filename = path.join(textsDir, `${textInfo.id}_en.json`);
  if (fs.existsSync(filename)) {
    console.log(`  → Already exists, skipping`);
    return 'skipped';
  }

  try {
    const raw = await fetchGutenberg(textInfo.gutenberg);
    const content = cleanGutenbergText(raw);

    if (content.length < 1000) {
      console.log(`  ✗ Content too short (${content.length} chars), skipping`);
      return 'failed';
    }

    const jsonData = {
      id: `${textInfo.id}_en`,
      source: 'gutenberg',
      gutenberg_id: textInfo.gutenberg,
      content: content
    };

    fs.writeFileSync(filename, JSON.stringify(jsonData));
    console.log(`  ✓ Saved (${Math.round(content.length / 1024)}KB)`);
    return 'success';
  } catch (err) {
    console.error(`  ✗ Failed: ${err.message}`);
    return 'failed';
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ALEPH — Fetching New Texts from Project Gutenberg');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nTotal texts to process: ${TEXTS.length}\n`);

  const results = { success: 0, skipped: 0, failed: 0 };

  for (const text of TEXTS) {
    const result = await processText(text);
    results[result]++;
    // Small delay to be nice to Gutenberg
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  DONE: ${results.success} new, ${results.skipped} skipped, ${results.failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Save manifest entries to file
  const manifestEntries = TEXTS.map(t => ({
    id: t.id,
    title: t.title,
    author: t.author,
    period: t.period,
    year: t.year,
    languages: { en: { source: 'gutenberg', gutenberg_id: t.gutenberg } },
    tags: t.tags
  }));

  fs.writeFileSync('new-texts-manifest.json', JSON.stringify(manifestEntries, null, 2));
  console.log('Manifest entries saved to new-texts-manifest.json');
}

main();
