import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupTestDb, cleanupTestDb, schema } from '../fixtures/test-helpers.js';
import { tagRepo, entryTagRepo } from '../../src/db/repositories/tags.js';

const TEST_DB_PATH = './data/test-tags-race.db';

let sqlite: ReturnType<typeof setupTestDb>['sqlite'];
let db: ReturnType<typeof setupTestDb>['db'];

vi.mock('../../src/db/connection.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/db/connection.js')>(
    '../../src/db/connection.js'
  );
  return {
    ...actual,
    getDb: () => db,
    transaction: <T>(fn: () => T) => fn(),
  };
});

describe('Tags repository race handling', () => {
  beforeAll(() => {
    const testDb = setupTestDb(TEST_DB_PATH);
    sqlite = testDb.sqlite;
    db = testDb.db;
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

    const spy = vi
      .spyOn(tagRepo, 'getByName')
      .mockImplementationOnce(() => undefined)
      .mockImplementation(() => created);

    const got = tagRepo.getOrCreate('dup', 'custom');
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
