#!/usr/bin/env npx tsx
/**
 * One-time migration: v1 tables → v2 tables
 *
 * Migrates guidelines, knowledge, experiences, and tags from v1 format
 * into v2 tables with properly formatted outbox events for projector indexing.
 *
 * Usage: npx tsx scripts/migrate-v1-to-v2.ts [--db path/to/memory.db] [--dry-run]
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dbIdx = args.indexOf('--db');
const dbPath =
  dbIdx >= 0 && args[dbIdx + 1]
    ? resolve(args[dbIdx + 1])
    : resolve(process.cwd(), 'data/memory.db');

console.log(`Migration: v1 → v2`);
console.log(`  Database: ${dbPath}`);
console.log(`  Dry run:  ${dryRun}`);
console.log('');

// ---------------------------------------------------------------------------
// Open DB
// ---------------------------------------------------------------------------

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Check preconditions
// ---------------------------------------------------------------------------

const v2EntryCount = (sqlite.prepare('SELECT COUNT(*) as c FROM v2_entries').get() as { c: number })
  .c;
if (v2EntryCount > 0) {
  console.log(
    `⚠ v2_entries already has ${v2EntryCount} rows. Skipping migration to avoid duplicates.`
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Read v1 project
// ---------------------------------------------------------------------------

interface V1Project {
  id: string;
  name: string;
  description: string;
  root_path: string;
}

const v1Project = sqlite.prepare('SELECT * FROM projects LIMIT 1').get() as V1Project | undefined;
if (!v1Project) {
  console.log('No v1 project found. Nothing to migrate.');
  process.exit(0);
}

console.log(`Found v1 project: "${v1Project.name}" (${v1Project.id})`);
console.log(`  Root path: ${v1Project.root_path}`);

// ---------------------------------------------------------------------------
// Create v2 scopes
// ---------------------------------------------------------------------------

const now = new Date().toISOString();
const globalScopeId = 'global:__root__';
const projectScopeId = `project:${v1Project.name}`;

function ensureScope(
  id: string,
  type: string,
  name: string,
  parentId: string | null,
  label: string | null,
  metadata: Record<string, unknown>
): void {
  const exists = sqlite.prepare('SELECT 1 FROM v2_scopes WHERE id = ?').get(id);

  if (exists) {
    console.log(`  Scope exists: ${id}`);
    return;
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would create scope: ${id}`);
    return;
  }

  sqlite
    .prepare(
      `INSERT INTO v2_scopes (id, type, parent_scope_id, name, label, metadata, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .run(id, type, parentId, name, label, JSON.stringify(metadata), now, now);

  console.log(`  Created scope: ${id}`);
}

console.log('\nCreating v2 scopes...');
ensureScope(globalScopeId, 'global', 'global', null, null, {});
ensureScope(projectScopeId, 'project', v1Project.name, globalScopeId, v1Project.name, {
  rootPath: v1Project.root_path,
  description: v1Project.description,
  migratedFrom: 'v1',
  v1ProjectId: v1Project.id,
});

// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------

let migratedCount = 0;
let skippedCount = 0;

const insertEntry = sqlite.prepare(
  `INSERT INTO v2_entries (id, entry_type, scope_id, title, category, priority, source, confidence, current_version, is_active, metadata, created_at, updated_at, created_by)
   VALUES (?, ?, ?, ?, ?, ?, 'import', NULL, 1, 1, ?, ?, ?, ?)`
);

const insertVersion = sqlite.prepare(
  `INSERT INTO v2_entry_versions (id, entry_id, version_num, content, facets_json, created_at, created_by)
   VALUES (?, ?, 1, ?, '{}', ?, ?)`
);

const insertOutboxEvent = sqlite.prepare(
  `INSERT INTO v2_outbox_events (event_id, event_type, aggregate_id, correlation_id, payload_json, occurred_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const ensureTag = sqlite.prepare(
  `INSERT OR IGNORE INTO v2_tags (id, name, created_at) VALUES (?, ?, ?)`
);

const linkTag = sqlite.prepare(
  `INSERT OR IGNORE INTO v2_entry_tags (entry_id, tag_id, created_at) VALUES (?, ?, ?)`
);

function migrateEntry(
  entryType: 'guideline' | 'knowledge' | 'tool' | 'experience',
  id: string,
  title: string,
  content: string,
  category: string | null,
  priority: number | null,
  createdAt: string,
  createdBy: string | null,
  v1Tags: string[]
): void {
  if (dryRun) {
    migratedCount++;
    return;
  }

  const versionId = randomUUID();
  const metadata = { migratedFrom: 'v1' };

  insertEntry.run(
    id,
    entryType,
    projectScopeId,
    title,
    category,
    priority,
    JSON.stringify(metadata),
    createdAt,
    now,
    createdBy
  );
  insertVersion.run(versionId, id, content, createdAt, createdBy);

  // Tags
  const resolvedTags: string[] = [];
  for (const tagName of v1Tags) {
    const normalized = tagName.toLowerCase();
    const tagId = randomUUID();
    ensureTag.run(tagId, normalized, now);
    const existing = sqlite.prepare('SELECT id FROM v2_tags WHERE name = ?').get(normalized) as {
      id: string;
    };
    linkTag.run(id, existing.id, now);
    resolvedTags.push(normalized);
  }

  // Outbox event: full EntryUpsertedEvent envelope as expected by projectors
  const eventId = randomUUID();
  const eventPayload = JSON.stringify({
    eventId,
    eventType: 'memory.entry.upserted.v1',
    eventVersion: 1,
    occurredAt: now,
    aggregateType: 'entry',
    aggregateId: id,
    actorId: createdBy ?? null,
    payload: {
      snapshot: {
        ref: { type: entryType, id },
        scope: { type: 'project', id: v1Project.name },
        title,
        content,
        category: category ?? null,
        confidence: null,
        tags: resolvedTags,
        source: 'import',
        version: 1,
        priority: priority ?? null,
        metadata,
        createdAt,
        updatedAt: now,
        createdBy: createdBy ?? null,
        updatedBy: null,
      },
    },
  });

  insertOutboxEvent.run(eventId, 'memory.entry.upserted.v1', id, null, eventPayload, now);

  migratedCount++;
}

// ---------------------------------------------------------------------------
// Read v1 tags helper
// ---------------------------------------------------------------------------

function getV1Tags(entryId: string): string[] {
  const rows = sqlite
    .prepare(
      `SELECT t.name FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = ?`
    )
    .all(entryId) as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Migrate in a single transaction
// ---------------------------------------------------------------------------

const migrate = sqlite.transaction(() => {
  // 1. Guidelines
  console.log('\nMigrating guidelines...');
  interface V1Guideline {
    id: string;
    name: string;
    category: string | null;
    priority: number;
    created_at: string;
    created_by: string | null;
    content: string | null;
  }

  const guidelines = sqlite
    .prepare(
      `SELECT g.id, g.name, g.category, g.priority, g.created_at, g.created_by, gv.content
       FROM guidelines g
       LEFT JOIN guideline_versions gv ON gv.id = g.current_version_id
       WHERE g.is_active = 1`
    )
    .all() as V1Guideline[];

  for (const g of guidelines) {
    if (!g.content) {
      skippedCount++;
      continue;
    }
    const tags = getV1Tags(g.id);
    migrateEntry(
      'guideline',
      g.id,
      g.name,
      g.content,
      g.category,
      g.priority,
      g.created_at,
      g.created_by,
      tags
    );
  }
  console.log(
    `  Guidelines: ${guidelines.length} found, ${guidelines.filter((g) => g.content).length} migrated`
  );

  // 2. Knowledge
  console.log('Migrating knowledge...');
  interface V1Knowledge {
    id: string;
    title: string;
    category: string | null;
    created_at: string;
    created_by: string | null;
    content: string | null;
  }

  const knowledge = sqlite
    .prepare(
      `SELECT k.id, k.title, k.category, k.created_at, k.created_by, kv.content
       FROM knowledge k
       LEFT JOIN knowledge_versions kv ON kv.id = k.current_version_id
       WHERE k.is_active = 1`
    )
    .all() as V1Knowledge[];

  for (const k of knowledge) {
    if (!k.content) {
      skippedCount++;
      continue;
    }
    const tags = getV1Tags(k.id);
    migrateEntry(
      'knowledge',
      k.id,
      k.title,
      k.content,
      k.category,
      null,
      k.created_at,
      k.created_by,
      tags
    );
  }
  console.log(
    `  Knowledge: ${knowledge.length} found, ${knowledge.filter((k) => k.content).length} migrated`
  );

  // 3. Experiences
  console.log('Migrating experiences...');
  interface V1Experience {
    id: string;
    title: string;
    category: string | null;
    created_at: string;
    created_by: string | null;
    content: string | null;
  }

  const experiences = sqlite
    .prepare(
      `SELECT e.id, e.title, e.category, e.created_at, e.created_by, ev.content
       FROM experiences e
       LEFT JOIN experience_versions ev ON ev.id = e.current_version_id
       WHERE e.is_active = 1`
    )
    .all() as V1Experience[];

  for (const e of experiences) {
    if (!e.content) {
      skippedCount++;
      continue;
    }
    const tags = getV1Tags(e.id);
    migrateEntry(
      'experience',
      e.id,
      e.title,
      e.content,
      e.category,
      null,
      e.created_at,
      e.created_by,
      tags
    );
  }
  console.log(
    `  Experiences: ${experiences.length} found, ${experiences.filter((e) => e.content).length} migrated`
  );
});

if (dryRun) {
  console.log('\n[DRY RUN] Would migrate entries (no changes made)');
  migrate();
  console.log(`\n  Would migrate: ${migratedCount} entries`);
  console.log(`  Would skip:    ${skippedCount} entries (no content)`);
} else {
  migrate();
  console.log(`\nMigration complete!`);
  console.log(`  Migrated: ${migratedCount} entries`);
  console.log(`  Skipped:  ${skippedCount} entries (no content)`);
  console.log(`  Outbox events: ${migratedCount} (ready for projector)`);

  // Show final counts
  const counts = sqlite
    .prepare(
      `SELECT entry_type, COUNT(*) as cnt FROM v2_entries WHERE is_active = 1 GROUP BY entry_type ORDER BY cnt DESC`
    )
    .all() as Array<{ entry_type: string; cnt: number }>;

  console.log('\nv2 entry counts:');
  for (const row of counts) {
    console.log(`  ${row.entry_type}: ${row.cnt}`);
  }

  const outboxCount = (
    sqlite.prepare('SELECT COUNT(*) as c FROM v2_outbox_events').get() as { c: number }
  ).c;
  console.log(`\nOutbox events pending: ${outboxCount}`);
  console.log('Run `memory_projector drain_once` to index all entries for search.');
}

sqlite.close();
