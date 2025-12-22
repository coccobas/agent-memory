import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, schema } from '../fixtures/test-helpers.js';
import {
  createTagRepository,
  createEntryTagRepository,
} from '../../src/db/repositories/tags.js';
import type { ITagRepository, IEntryTagRepository } from '../../src/core/interfaces/repositories.js';
import type { DatabaseDeps } from '../../src/core/types.js';

const TEST_DB_PATH = './data/test-tags-race.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];
let deps: DatabaseDeps;
let tagRepo: ITagRepository;
let entryTagRepo: IEntryTagRepository;

describe('Tags repository race handling', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
    deps = { db, sqlite };
    tagRepo = createTagRepository(deps);
    entryTagRepo = createEntryTagRepository(deps, tagRepo);
  });

  afterAll(() => {
    sqlite.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  beforeEach(() => {
    db.delete(schema.entryTags).run();
    db.delete(schema.tags).run();
  });

  it('tagRepo.getOrCreate returns existing tag on unique constraint', () => {
    const created = tagRepo.create({ name: 'dup', category: 'custom' });

    // Create a wrapper repo for spying - this simulates the race condition
    // where getByName returns undefined first (race) then finds the tag
    const spyRepo = createTagRepository(deps);
    const spy = vi
      .spyOn(spyRepo, 'getByName')
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => created);

    const got = spyRepo.getOrCreate('dup', 'custom');
    expect(got.id).toBe(created.id);

    spy.mockRestore();
  });

  it('entryTagRepo.attach returns existing association on unique constraint', () => {
    const tag = tagRepo.getOrCreate('t1', 'custom');

    const first = entryTagRepo.attach({ entryType: 'tool', entryId: 'e1', tagId: tag.id });
    const second = entryTagRepo.attach({ entryType: 'tool', entryId: 'e1', tagId: tag.id });

    expect(second.id).toBe(first.id);
  });
});
