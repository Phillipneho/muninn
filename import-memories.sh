#!/bin/bash
# Import memories to Cloudflare D1

BATCH_SIZE=50
TOTAL=$(cat /tmp/memories-import.json | jq 'length')
BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "Importing $TOTAL memories in $BATCHES batches..."

for ((i=0; i<BATCHES; i++)); do
  OFFSET=$((i * BATCH_SIZE))
  BATCH=$(cat /tmp/memories-import.json | jq ".[$OFFSET:$((OFFSET + BATCH_SIZE))]")
  
  echo "Batch $((i+1))/$BATCHES: importing memories $((OFFSET+1))-$((OFFSET + BATCH_SIZE > TOTAL ? TOTAL : OFFSET + BATCH_SIZE))..."
  
  curl -s -X POST "https://muninn.phillipneho.workers.dev/api/import" \
    -H "Authorization: Bearer muninn_729186836cbd4aada2352cb4c06c4ef0" \
    -H "Content-Type: application/json" \
    -H "X-Organization-ID: leo-default" \
    -d "{\"memories\": $BATCH}"
  
  echo ""
  sleep 0.5
done

echo "Done!"