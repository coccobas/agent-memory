import { z } from 'zod';

const ScopeTypeSchema = z.enum(['global', 'org', 'project', 'session', 'topic']);
const EntryTypeSchema = z.enum(['guideline', 'knowledge', 'tool', 'experience']);
const EntrySourceSchema = z.enum([
  'remember',
  'observe_extract',
  'observe_commit',
  'hook_capture',
  'import',
]);
const RelationTypeSchema = z.enum([
  'applies_to',
  'depends_on',
  'conflicts_with',
  'related_to',
  'parent_task',
  'subtask_of',
  'promoted_to',
]);
const RetrievalStrategySchema = z.enum(['fts', 'semantic', 'hybrid']);

const ScopeRefSchema = z.object({
  type: ScopeTypeSchema,
  id: z.string().nullable().optional(),
});

const EntryRefSchema = z.object({
  entryType: EntryTypeSchema,
  entryId: z.string().min(1),
});

const EntryDataSchema = z.object({
  type: EntryTypeSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  source: EntrySourceSchema,
  scope: ScopeRefSchema,
  category: z.string().optional(),
  confidence: z.number().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().optional(),
  rationale: z.string().optional(),
  citation: z.string().optional(),
  usage: z.string().optional(),
  scenario: z.string().optional(),
  outcome: z.string().optional(),
});

export const UpsertEntrySchema = z.object({
  action: z.literal('upsert_entry'),
  entryId: z.string().optional(),
  expectedVersion: z.number().int().optional(),
  actorId: z.string().nullable().optional(),
  correlationId: z.string().optional(),
  data: EntryDataSchema,
});

export const DeleteEntrySchema = z.object({
  action: z.literal('delete_entry'),
  entryType: EntryTypeSchema,
  entryId: z.string().min(1),
  reason: z.string().optional(),
  actorId: z.string().nullable().optional(),
  correlationId: z.string().optional(),
});

export const UpsertRelationSchema = z.object({
  action: z.literal('upsert_relation'),
  relationId: z.string().optional(),
  source: EntryRefSchema,
  target: EntryRefSchema,
  relationType: RelationTypeSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  actorId: z.string().nullable().optional(),
  correlationId: z.string().optional(),
});

export const DeleteRelationSchema = z.object({
  action: z.literal('delete_relation'),
  relationId: z.string().optional(),
  source: EntryRefSchema.optional(),
  target: EntryRefSchema.optional(),
  relationType: RelationTypeSchema.optional(),
  actorId: z.string().nullable().optional(),
  correlationId: z.string().optional(),
});

export const TagEntrySchema = z.object({
  action: z.enum(['tag_entry', 'untag_entry']),
  entryId: z.string().min(1),
  tag: z.string().min(1),
  actorId: z.string().nullable().optional(),
  correlationId: z.string().optional(),
});

export const CreateScopeSchema = z.object({
  action: z.literal('create_scope'),
  scopeType: ScopeTypeSchema,
  scopeId: z.string().nullable().optional(),
  parentScopeId: z.string().optional(),
  label: z.string().optional(),
});

export const ArchiveScopeSchema = z.object({
  action: z.literal('archive_scope'),
  scopeId: z.string().min(1),
});

export const QueryRequestSchema = z.object({
  action: z.literal('search'),
  query: z.string().optional(),
  scope: ScopeRefSchema,
  limit: z.number().int().positive().max(500).optional().default(20),
  offset: z.number().int().nonnegative().optional(),
  includeInactive: z.boolean().optional().default(false),
  tokenBudget: z.number().positive().optional(),
  queryEmbedding: z.array(z.number()).optional(),
  strategy: RetrievalStrategySchema.optional(),
  types: z.array(EntryTypeSchema).optional(),
  tags: z
    .object({
      include: z.array(z.string()).optional(),
      require: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
  relatedTo: z
    .object({
      entryType: EntryTypeSchema,
      entryId: z.string().min(1),
      relationType: RelationTypeSchema.optional(),
      depth: z.number().int().positive().max(5).optional(),
    })
    .optional(),
});

export type UpsertEntryParams = z.infer<typeof UpsertEntrySchema>;
export type DeleteEntryParams = z.infer<typeof DeleteEntrySchema>;
export type UpsertRelationParams = z.infer<typeof UpsertRelationSchema>;
export type DeleteRelationParams = z.infer<typeof DeleteRelationSchema>;
export type TagEntryParams = z.infer<typeof TagEntrySchema>;
export type CreateScopeParams = z.infer<typeof CreateScopeSchema>;
export type ArchiveScopeParams = z.infer<typeof ArchiveScopeSchema>;
export type QueryRequestParams = z.infer<typeof QueryRequestSchema>;
