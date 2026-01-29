#!/usr/bin/env node
/**
 * Sync drizzle-kit journal with actual migration files
 * 
 * This script ensures the drizzle journal stays in sync with migration files.
 * Run this after adding new migrations or if the journal becomes corrupted.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const journalPath = 'src/db/migrations/meta/_journal.json';
const migrationsDir = 'src/db/migrations';

try {
  // Read existing journal
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  
  // Get all migration files
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql') && !f.includes('snapshot'))
    .sort();
  
  console.log(`Found ${files.length} migration files`);
  
  // Rebuild entries
  journal.entries = files.map((file, idx) => ({
    idx,
    version: "6",
    when: 1734000000000 + (idx * 100000), // Incrementing timestamps
    tag: file.replace('.sql', ''),
    breakpoints: true
  }));
  
  // Write updated journal
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
  
  console.log(`✅ Updated journal with ${journal.entries.length} entries`);
  console.log(`   First: ${journal.entries[0].tag}`);
  console.log(`   Last: ${journal.entries[journal.entries.length - 1].tag}`);
  
} catch (error) {
  console.error('❌ Failed to sync journal:', error.message);
  process.exit(1);
}
