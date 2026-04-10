#!/bin/bash
# Muninn Recall Benchmark
# Phase 1: Ingest all stories
# Phase 2: Answer questions from memory

API="https://api.muninn.au"
TOKEN="muninn_729186836cbd4aada2352cb4c06c4ef0"
ORG="leo-default"

echo "=== MUNINN RECALL BENCHMARK ==="
echo ""

# Stories to ingest
declare -A STORIES
STORIES["story_firetruck"]="The Riverside Fire Department received a brand new fire truck yesterday. Chief Morrison drove it to the station at 3pm. The truck cost \$450,000 and can carry 1000 gallons of water. It was painted bright red with gold stripes."
STORIES["story_caroline"]="Caroline went to an LGBTQ support group yesterday. She is a transgender woman from Sweden. She has been painting for 7 years and specializes in watercolor landscapes."
STORIES["story_tech"]="OpenClaw version 3.2 released today with Camoufox browser integration. The key features include anti-detection browsing, cookie import for authenticated sessions, and snapshot-based automation. Developer Leo led the release."
STORIES["story_muninn"]="Muninn v5.3 introduces TurboQuant compression with 4-bit quantization. It achieves 7.92x compression ratio with 94% cosine similarity. The algorithm uses quaternion rotation for uniform distribution. Cloudflare Workers host the API."
STORIES["story_business"]="AgentHired launched on March 10, 2026. It's a job marketplace for verified AI agents. Pricing: Starter \$9/mo, Pro \$29/mo, Enterprise \$79/mo. Phillip is the founder. The tech stack uses Next.js 16 and Supabase."

# Questions to test recall
declare -A QUESTIONS
QUESTIONS["q1_time"]="What time did Chief Morrison drive the fire truck?"
QUESTIONS["q2_capacity"]="How many gallons of water can the fire truck carry?"
QUESTIONS["q3_cost"]="How much did the fire truck cost?"
QUESTIONS["q4_origin"]="Where is Caroline from?"
QUESTIONS["q5_painting"]="What type of painting does Caroline specialize in?"
QUESTIONS["q6_openclaw"]="What version of OpenClaw was released?"
QUESTIONS["q7_browser"]="What browser integration was added to OpenClaw?"
QUESTIONS["q8_compression"]="What compression ratio does TurboQuant achieve?"
QUESTIONS["q9_pricing"]="What is the Pro plan price for AgentHired?"
QUESTIONS["q10_stack"]="What database does AgentHired use?"

# Expected answers
declare -A EXPECTED
EXPECTED["q1_time"]="3pm"
EXPECTED["q2_capacity"]="1000 gallons"
EXPECTED["q3_cost"]="450,000"
EXPECTED["q4_origin"]="Sweden"
EXPECTED["q5_painting"]="watercolor landscapes"
EXPECTED["q6_openclaw"]="3.2"
EXPECTED["q7_browser"]="Camoufox"
EXPECTED["q8_compression"]="7.92x"
EXPECTED["q9_pricing"]="29/mo"
EXPECTED["q10_stack"]="Supabase"

echo "=== PHASE 1: INGESTING STORIES ==="
echo ""

for key in "${!STORIES[@]}"; do
  content="${STORIES[$key]}"
  echo "Ingesting: $key"
  echo "Content: ${content:0:60}..."
  
  response=$(curl -s -X POST "$API/api/memories" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Organization-ID: $ORG" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$content\", \"type\": \"semantic\", \"metadata\": {\"benchmark\": \"recall-test\", \"story\": \"$key\"}}")
  
  id=$(echo "$response" | jq -r '.id // .error // empty')
  if [ -n "$id" ] && [ "$id" != "null" ]; then
    echo "✅ Stored: $id"
  else
    echo "❌ Failed: $response"
  fi
  echo ""
done

echo "Waiting 3 seconds for embeddings to process..."
sleep 3
echo ""

echo "=== PHASE 2: TESTING RECALL ==="
echo ""

correct=0
total=${#QUESTIONS[@]}

for key in "${!QUESTIONS[@]}"; do
  question="${QUESTIONS[$key]}"
  expected="${EXPECTED[$key]}"
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Question: $question"
  echo "Expected: $expected"
  
  # Search for answer
  search_result=$(curl -s "$API/api/memories?q=$(echo "$question" | sed 's/ /+/g')&search_type=hybrid&limit=3" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Organization-ID: $ORG")
  
  # Extract top result content
  top_content=$(echo "$search_result" | jq -r '.results[0].content // empty')
  similarity=$(echo "$search_result" | jq -r '.results[0].similarity // "N/A"')
  
  echo "Top result (similarity: $similarity):"
  echo "${top_content:0:150}..."
  
  # Check if expected answer is in result
  if echo "$top_content" | grep -qi "$expected"; then
    echo "✅ PASS: Found '$expected' in result"
    ((correct++))
  else
    echo "❌ FAIL: '$expected' not found"
  fi
  echo ""
done

echo "=== BENCHMARK RESULTS ==="
echo "Correct: $correct / $total"
echo "Accuracy: $(echo "scale=1; $correct * 100 / $total" | bc)%"