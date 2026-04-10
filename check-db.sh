#!/bin/bash
# Check D1 database directly

npx wrangler d1 execute muninn-db --command "SELECT COUNT(*) as memories FROM memories; SELECT COUNT(*) as entities FROM entities; SELECT COUNT(*) as facts FROM facts;" --remote 2>/dev/null | jq '.results'
