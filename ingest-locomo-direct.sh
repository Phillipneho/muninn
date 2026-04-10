#!/bin/bash
# LOCOMO Ingestion - Direct Cloudflare AI
# Bypasses Worker CPU limits

set -e

ACCOUNT_ID="f41284de76d5ead189b5b3500a08173f"
CF_TOKEN="cfat_vlGGORiFHhoq5nB5hy7pQohd2HDLBcjUb5E0lzo37784962b"
MUNINN_API="https://api.muninn.au/api/memories"
MUNINN_TOKEN="muninn_729186836cbd4aada2352cb4c06c4ef0"
ORG="leo-default"

DATA_PATH="/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json"
PROGRESS_PATH="/home/homelab/.openclaw/workspace/memory/locomo-progress.json"

MINIMAL_PROMPT='Extract facts from the dialogue. Use these predicates:
- identifies_as (identity, gender)
- has_relationship_status (single, married)
- has_child (children)
- moved_from (origin location)
- known_for (duration: X years)
- researched (topics investigated)
- kids_like (child preferences)
- camped_at (locations)
- activity (hobbies)

Session: {{SESSION_DATE}}
Dialogue: {{CONTENT}}

Output ONLY valid JSON:
{"entities":[{"name":"Name","type":"person"}],"facts":[{"subject":"Name","predicate":"predicate","object":"value","pds_decimal":"code","evidence":"quote"}]}'

# Load progress
if [ -f "$PROGRESS_PATH" ]; then
  PROCESSED=$(jq -r '.sessions[] | select(.status == "success") | "\(.conversationId):\(.sessionNum)"' "$PROGRESS_PATH" 2>/dev/null | wc -l)
else
  PROCESSED=0
fi

echo "=== LOCOMO INGESTION (Direct Cloudflare AI) ==="
echo "Using: @cf/meta/llama-3.1-8b-instruct"
echo ""

# Get total sessions
TOTAL_SESSIONS=$(jq '[.[] | .conversation | keys | map(select(startswith("session_") and !contains("date"))) | length] | add' "$DATA_PATH" 2>/dev/null || echo "272")
echo "Total sessions: $TOTAL_SESSIONS"
echo "Already processed: $PROCESSED"
echo ""

# Extract first session for testing
FIRST_CONV=$(jq '.[0]' "$DATA_PATH")
SAMPLE_ID=$(echo "$FIRST_CONV" | jq -r '.sample_id')
SESSION_DATE=$(echo "$FIRST_CONV" | jq -r '.conversation.session_1_date_time // "2023-06-09"')

# Build session content
SPEAKERS=$(echo "$FIRST_CONV" | jq -r '[.conversation.speaker_a, .conversation.speaker_b] | map(select(.)) | join(", ")')
TURNS=$(echo "$FIRST_CONV" | jq -r '.conversation.session_1[] | "\(.speaker): \(.text)"' | head -5)

CONTENT="Session 1 ($SESSION_DATE)
Speakers: $SPEAKERS

$TURNS"

echo "Testing first session:"
echo "$CONTENT" | head -10
echo ""

# Replace placeholders
PROMPT="${MINIMAL_PROMPT//{{SESSION_DATE}}/$SESSION_DATE}"
PROMPT="${PROMPT//{{CONTENT}}/$CONTENT}"

echo "Extracting with Cloudflare AI..."
RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct" \
  -H "Authorization: Bearer ${CF_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":$(echo "$PROMPT" | jq -Rs .)}],\"max_tokens\":500,\"temperature\":0}")

# Parse response
echo "$RESPONSE" | jq '.result.response' -r | head -20

# Extract JSON
EXTRACTION=$(echo "$RESPONSE" | jq '.result.response' -r | grep -o '{[^}]*}' | head -1)

if [ -n "$EXTRACTION" ]; then
  echo ""
  echo "✓ Extraction successful"
  echo "$EXTRACTION" | jq '.facts | length, .entities | length'
else
  echo "✗ Extraction failed"
fi

echo ""
echo "To run full ingestion, use: node ingest-locomo-direct.mjs"