#!/bin/bash
# LOCOMO Benchmark Runner for Muninn
# Tests recall accuracy against ingested LOCOMO sessions

API="https://api.muninn.au"
TOKEN="muninn_729186836cbd4aada2352cb4c06c4ef0"
ORG="leo-default"
DATA_FILE="/home/homelab/.openclaw/workspace-charlie/locomo/data/locomo10.json"
OUT_FILE="/home/homelab/.openclaw/workspace/memory/locomo-benchmark-results.json"

echo "=== LOCOMO BENCHMARK ==="
echo "Loading questions from: $DATA_FILE"

# Count total questions
TOTAL=$(cat "$DATA_FILE" | jq '[.[].qa | length] | add')
echo "Total questions: $TOTAL"

# Initialize counters
CORRECT=0
PROCESSED=0

# Process each conversation
cat "$DATA_FILE" | jq -c '.[]' | while read -r conv; do
  CONV_ID=$(echo "$conv" | jq -r '.sample_id')
  echo ""
  echo "=== Conversation: $CONV_ID ==="
  
  # Process each question
  echo "$conv" | jq -c '.qa[]' | while read -r qa; do
    QUESTION=$(echo "$qa" | jq -r '.question')
    EXPECTED=$(echo "$qa" | jq -r '.answer')
    
    # Query Muninn
    RESPONSE=$(curl -s -X POST "$API/api/answer" \
      -H "Authorization: Bearer $TOKEN" \
      -H "X-Organization-ID: $ORG" \
      -H "Content-Type: application/json" \
      -d "{\"query\": \"$QUESTION\"}" 2>/dev/null)
    
    ANSWER=$(echo "$RESPONSE" | jq -r '.answer // .error // "no response"')
    
    # Check if answer contains expected (case-insensitive partial match)
    if echo "$ANSWER" | grep -qi "$EXPECTED"; then
      echo "✅ Q: ${QUESTION:0:50}... | Expected: $EXPECTED | Got: ${ANSWER:0:50}..."
      echo "correct" >> /tmp/locomo_results.txt
    else
      echo "❌ Q: ${QUESTION:0:50}... | Expected: $EXPECTED | Got: ${ANSWER:0:50}..."
      echo "incorrect" >> /tmp/locomo_results.txt
    fi
  done
done

# Calculate accuracy
echo ""
echo "=== RESULTS ==="
CORRECT=$(grep -c "correct" /tmp/locomo_results.txt 2>/dev/null || echo "0")
TOTAL=$(wc -l < /tmp/locomo_results.txt 2>/dev/null || echo "0")
if [ "$TOTAL" -gt 0 ]; then
  ACCURACY=$(echo "scale=2; $CORRECT * 100 / $TOTAL" | bc)
  echo "Accuracy: $CORRECT / $TOTAL = ${ACCURACY}%"
else
  echo "No results collected"
fi
rm -f /tmp/locomo_results.txt