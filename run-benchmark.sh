#!/bin/bash
# LOCOMO Benchmark - Quick test (first conversation only)

API="https://api.muninn.au"
TOKEN="muninn_729186836cbd4aada2352cb4c06c4ef0"
ORG="leo-default"

echo "=== LOCOMO QUICK BENCHMARK (First 20 questions) ==="

DATA_FILE="/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json"

# Extract first conversation's questions
QUESTIONS=$(cat "$DATA_FILE" | jq '.[0].qa[:20]')

CORRECT=0
TOTAL=0

echo "$QUESTIONS" | jq -c '.[]' | while read -r qa; do
  QUESTION=$(echo "$qa" | jq -r '.question')
  EXPECTED=$(echo "$qa" | jq -r '.answer')
  
  TOTAL=$((TOTAL + 1))
  
  # Query Muninn
  RESPONSE=$(curl -s -X POST "$API/api/answer" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Organization-ID: $ORG" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$QUESTION\"}" 2>/dev/null)
  
  ANSWER=$(echo "$RESPONSE" | jq -r '.answer // .error // "no response"' | tr '\n' ' ' | head -c 100)
  
  # Check if answer contains expected
  if echo "$ANSWER" | grep -qi "$EXPECTED"; then
    echo "✅ PASS"
    echo "   Q: ${QUESTION:0:60}..."
    echo "   Expected: $EXPECTED"
    echo "   Got: ${ANSWER:0:80}..."
  else
    echo "❌ FAIL"
    echo "   Q: ${QUESTION:0:60}..."
    echo "   Expected: $EXPECTED"
    echo "   Got: ${ANSWER:0:80}..."
  fi
  echo ""
done