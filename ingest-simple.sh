#!/bin/bash
# Simple LOCOMO ingestion - one session at a time

API="https://api.muninn.au/api/memories"
TOKEN="muninn_729186836cbd4aada2352cb4c06c4ef0"
ORG="leo-default"

# Test a single session
curl -s -X POST "$API" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Organization-ID: $ORG" \
  -d '{"content":"Session 1: Caroline is a transgender woman. She moved from Sweden 4 years ago. She has two kids who love dinosaurs.","type":"episodic","session_date":"2023-06-09","metadata":{"source":"locomo_test"}}' | jq '.id, .facts_created, .entities_created'

