import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import {
  setupTestDb,
  cleanupTestDb,
  createTestRepositories,
  schema,
  type TestDb,
} from '../fixtures/test-helpers.js';
import { createTagRepository, createEntryTagRepository } from '../../src/db/repositories/tags.js';
import type { ITagRepository, IEntryTagRepository } from '../../src/core/interfaces/repositories.js';
import type { DatabaseDeps } from '../../src/core/types.js';

const TEST_DB_PATH = './data/test-tags-race.db';
let testDb: TestDb;
let deps: DatabaseDeps;
let tagRepo: ITagRepository;
let entryTagRepo: IEntryTagRepository;

describe('Tags repository race handling', () => {
  beforeAll(() => {
    testDb = setupTestDb(TEST_DB_PATH);
    deps = { db: testDb.db, sqlite: testDb.sqlite };
    tagRepo = createTagRepository(deps);
    entryTagRepo = createEntryTagRepository(deps, tagRepo);
  });

  afterAll(() => {
    testDb.sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    testDb.db.delete(schema.entryTags).run();
    testDb.db.delete(schema.tags).run();
  });

  it('tagRepo.getOrCreate returns existing tag on unique constraint', async () => {
    const created = await tagRepo.create({ name: 'dup', category: 'custom' });

    // Create a wrapper repo for spying - this simulates the race condition
    // where getByName returns undefined first (race) then finds the tag
    const spyRepo = createTagRepository(deps);
    const spy = vi
      .spyOn(spyRepo, 'getByName')
      .mockImplementationOnce(async () => undefined)
      .mockImplementation(async () => created);

    const got = await spyRepo.getOrCreate('dup', 'custom');
    expect(got.id).toBe(created.id);

    spy.mockRestore();
  });

  it('entryTagRepo.attach returns existing association on unique constraint', async () => {
    const tag = await tagRepo.getOrCreate('t1', 'custom');

    const first = await entryTagRepo.attach({ entryType: 'tool', entryId: 'e1', tagId: tag.id });
    const second = await entryTagRepo.attach({ entryType: 'tool', entryId: 'e1', tagId: tag.id });

    expect(second.id).toBe(first.id);
  });
});
