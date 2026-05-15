#!/bin/bash
# Fetch all new texts from Project Gutenberg
# Run this script locally: cd docs/data && bash fetch-texts.sh

mkdir -p texts

TEXTS=(
  "gilgamesh:11000"
  "book-of-dead:7145"
  "epictetus-enchiridion:45109"
  "epictetus-discourses:10661"
  "diogenes-laertius:57342"
  "plotinus-enneads:37903"
  "hesiod-theogony:348"
  "pindar-odes:10717"
  "euripides-medea:35451"
  "euripides-bacchae:5793"
  "euripides-hippolytus:14337"
  "aristophanes-clouds:2562"
  "aristophanes-birds:3013"
  "aristophanes-lysistrata:7700"
  "xenophon-anabasis:1170"
  "xenophon-memorabilia:1177"
  "xenophon-cyropaedia:2085"
  "lucian-dialogues:6829"
  "longus-daphnis:2629"
  "cicero-offices:47001"
  "cicero-tusculan:14988"
  "lucretius-natura:785"
  "seneca-letters:56075"
  "boethius-consolation:14328"
  "ovid-metamorphoses:26073"
  "ovid-art-love:5765"
  "horace-odes:9175"
  "horace-satires:14020"
  "juvenal-satires:50848"
  "catullus-poems:24122"
  "livy-rome:19725"
  "suetonius-caesars:6386"
  "pliny-letters:2811"
  "petronius-satyricon:5225"
  "apuleius-golden-ass:1666"
  "beowulf:16328"
  "poetic-edda:14726"
  "song-roland:391"
  "nibelungenlied:7321"
  "cid:500"
  "gawain-green-knight:14568"
  "malory-morte-arthur:1251"
  "boccaccio-decameron:23700"
  "petrarch-canzoniere:17650"
  "chaucer-canterbury:2383"
  "piers-plowman:43659"
  "margery-kempe:5196"
  "cloud-unknowing:30448"
  "julian-norwich:52958"
  "aquinas-summa:17611"
  "meister-eckhart:39766"
  "abelard-heloise:35977"
  "rubaiyat-khayyam:246"
  "rumi-masnavi:34903"
  "arabian-nights:128"
  "tale-of-genji:6540"
  "zhuangzi:17072"
  "i-ching:339"
  "mencius:56063"
  "upanishads:3283"
  "ramayana:24869"
  "mahabharata-selections:7864"
  "montaigne-essays:3600"
  "pascal-pensees:18269"
  "erasmus-folly:9371"
  "more-utopia:2130"
  "bacon-essays:575"
)

echo "═══════════════════════════════════════════════════════════════"
echo "  Fetching ${#TEXTS[@]} texts from Project Gutenberg"
echo "═══════════════════════════════════════════════════════════════"
echo ""

SUCCESS=0
FAILED=0

for item in "${TEXTS[@]}"; do
  ID="${item%%:*}"
  GID="${item##*:}"
  FILE="texts/${ID}_en.json"

  if [ -f "$FILE" ]; then
    echo "[skip] $ID already exists"
    continue
  fi

  echo -n "[fetch] $ID (gutenberg #$GID)..."

  # Try .txt first, then -0.txt
  URL="https://www.gutenberg.org/cache/epub/${GID}/pg${GID}.txt"
  CONTENT=$(curl -sL -A "Mozilla/5.0" "$URL" 2>/dev/null)

  if [ -z "$CONTENT" ] || echo "$CONTENT" | grep -q "404 Not Found"; then
    URL="https://www.gutenberg.org/files/${GID}/${GID}-0.txt"
    CONTENT=$(curl -sL -A "Mozilla/5.0" "$URL" 2>/dev/null)
  fi

  if [ -z "$CONTENT" ] || echo "$CONTENT" | grep -q "404 Not Found"; then
    echo " FAILED"
    ((FAILED++))
    continue
  fi

  # Strip Gutenberg header/footer (basic)
  CONTENT=$(echo "$CONTENT" | sed -n '/\*\*\* START OF/,/\*\*\* END OF/p' | tail -n +2 | head -n -1)

  if [ ${#CONTENT} -lt 1000 ]; then
    # Fallback: use full content
    CONTENT=$(curl -sL -A "Mozilla/5.0" "$URL" 2>/dev/null)
  fi

  # Create JSON (escape for JSON)
  ESCAPED=$(echo "$CONTENT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')

  echo "{\"id\":\"${ID}_en\",\"source\":\"gutenberg\",\"gutenberg_id\":${GID},\"content\":${ESCAPED}}" > "$FILE"

  SIZE=$(du -h "$FILE" | cut -f1)
  echo " OK ($SIZE)"
  ((SUCCESS++))

  sleep 0.5
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Done: $SUCCESS fetched, $FAILED failed"
echo "═══════════════════════════════════════════════════════════════"
