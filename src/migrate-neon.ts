// Muninn v2 Schema Migration for Neon PostgreSQL
// Run this script to create tables on Neon

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('DATABASE_URL environment variable required');
    process.exit(1);
  }
  
  const client = new pg.Client({ connectionString });
  
  try {
    console.log('Connecting to Neon PostgreSQL...');
    await client.connect();
    console.log('Connected!');
    
    // Read schema file
    const schemaPath = path.join(__dirname, 'schema-neon.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Running schema migration...');
    await client.query(schema);
    console.log('✓ Schema created successfully!');
    
    // Verify tables
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\nTables created:');
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();