#!/bin/bash
# Muninn Migration Script
# Migrates from Supabase to Cloudflare D1

set -e

echo "=== Muninn Supabase → Cloudflare D1 Migration ==="

# Check if Wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "Installing Wrangler..."
    npm install -g wrangler
fi

# Set Cloudflare credentials from environment or use defaults
export CLOUDFLARE_API_TOKEN="${CF_API_TOKEN:-cfat_vlGGORiFHhoq5nB5hy7pQohd2HDLBcjUb5E0lzo37784962b}"
export CLOUDFLARE_ACCOUNT_ID="${CF_ACCOUNT_ID:-f41284de76d5ead189b5b3500a08173f}"

echo "Using Cloudflare Account: $CLOUDFLARE_ACCOUNT_ID"

# Create D1 database
echo ""
echo "=== Creating D1 Database ==="
wrangler d1 create muninn-db 2>/dev/null || echo "Database may already exist"

# Run migrations
echo ""
echo "=== Running Schema Migration ==="
wrangler d1 execute muninn-db --file=./schema.sql --remote

# Export data from Supabase
echo ""
echo "=== Exporting Data from Supabase ==="
# This would use pg_dump or Supabase API
# For now, we'll use the Muninn API to export

# Deploy Workers
echo ""
echo "=== Deploying Workers ==="
wrangler deploy

echo ""
echo "=== Migration Complete ==="
echo "API will be available at: https://muninn.phillipneho.workers.dev"
echo "Or with custom domain: https://api.muninn.au"
echo ""
echo "Next steps:"
echo "1. Update DNS for api.muninn.au to point to Cloudflare Workers"
echo "2. Update Muninn API endpoint in clients"
echo "3. Import data from Supabase using: wrangler d1 execute muninn-db --file=./data-export.sql"