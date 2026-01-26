import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTranscriptService,
  type TranscriptService,
} from '../../../src/services/ide-conversation/transcript-service.js';
import type {
  IDEConversationReader,
  IDEMessage,
  IDESession,
} from '../../../src/services/ide-conversation/types.js';
import type {
  IIDETranscriptRepository,
  Transcript,
  TranscriptMessage,
  AddTranscriptMessageInput,
} from '../../../src/core/interfaces/repositories.js';

function createMockReader(): IDEConversationReader {
  return {
    ideName: 'opencode',
    isAvailable: vi.fn().mockResolvedValue(true),
    getDataPath: vi.fn().mockReturnValue('/test/path'),
    listSessions: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
    findSessionByExternalId: vi.fn().mockResolvedValue(null),
  };
}

function createMockRepository(): IIDETranscriptRepository {
  return {
    create: vi.fn(),
    getById: vi.fn(),
    getByIDESession: vi.fn(),
    list: vi.fn(),
    addMessage: vi.fn(),
    addMessages: vi.fn(),
    getMessages: vi.fn(),
    getMessagesByTimeRange: vi.fn(),
    updateLastMessageTimestamp: vi.fn(),
    seal: vi.fn(),
    linkToSession: vi.fn(),
  };
}

function createTestTranscript(overrides: Partial<Transcript> = {}): Transcript {
  return {
    id: 'transcript-1',
    ideName: 'opencode',
    ideSessionId: 'ide-session-1',
    agentMemorySessionId: null,
    projectId: null,
    projectPath: '/test/project',
    title: 'Test Session',
    importedAt: '2026-01-26T10:00:00Z',
    lastMessageTimestamp: null,
    messageCount: 0,
    isSealed: false,
    metadata: null,
    ...overrides,
  };
}

function createTestIDEMessage(overrides: Partial<IDEMessage> = {}): IDEMessage {
  return {
    id: 'msg-1',
    sessionId: 'ide-session-1',
    role: 'user',
    content: 'Hello',
    timestamp: new Date('2026-01-26T10:00:00Z'),
    toolsUsed: [],
    metadata: {},
    ...overrides,
  };
}

describe('TranscriptService', () => {
  let reader: IDEConversationReader;
  let repository: IIDETranscriptRepository;
  let service: TranscriptService;

  beforeEach(() => {
    reader = createMockReader();
    repository = createMockRepository();
    service = createTranscriptService(reader, repository);
  });

  describe('getCurrentIDESessionId', () => {
    it('should return the first session ID when sessions exist', async () => {
      const sessions: IDESession[] = [
        { id: 'session-1', projectPath: '/test', createdAt: new Date(), title: 'Session 1' },
        { id: 'session-2', projectPath: '/test', createdAt: new Date(), title: 'Session 2' },
      ];
      vi.mocked(reader.listSessions).mockResolvedValue(sessions);

      const result = await service.getCurrentIDESessionId('/test');

      expect(result).toBe('session-1');
      expect(reader.listSessions).toHaveBeenCalledWith('/test');
    });

    it('should return null when no sessions exist', async () => {
      vi.mocked(reader.listSessions).mockResolvedValue([]);

      const result = await service.getCurrentIDESessionId();

      expect(result).toBeNull();
    });
  });

  describe('ensureTranscript', () => {
    it('should return existing transcript without reimporting', async () => {
      const existingTranscript = createTestTranscript({ messageCount: 10 });
      vi.mocked(repository.getByIDESession).mockResolvedValue(existingTranscript);

      const result = await service.ensureTranscript({
        ideSessionId: 'ide-session-1',
      });

      expect(result.isNew).toBe(false);
      expect(result.transcript).toBe(existingTranscript);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(10);
      expect(repository.create).not.toHaveBeenCalled();
      expect(reader.getMessages).not.toHaveBeenCalled();
    });

    it('should create new transcript and import all messages', async () => {
      const newTranscript = createTestTranscript();
      const updatedTranscript = createTestTranscript({ messageCount: 2 });
      const messages: IDEMessage[] = [
        createTestIDEMessage({ id: 'msg-1', content: 'Hello' }),
        createTestIDEMessage({ id: 'msg-2', content: 'World', role: 'assistant' }),
      ];

      vi.mocked(repository.getByIDESession).mockResolvedValue(undefined);
      vi.mocked(reader.findSessionByExternalId).mockResolvedValue({
        id: 'ide-session-1',
        projectPath: '/test/project',
        title: 'Fix Bug',
        createdAt: new Date(),
      });
      vi.mocked(repository.create).mockResolvedValue(newTranscript);
      vi.mocked(reader.getMessages).mockResolvedValue(messages);
      vi.mocked(repository.addMessages).mockResolvedValue({ added: 2, skipped: 0 });
      vi.mocked(repository.getById).mockResolvedValue(updatedTranscript);

      const result = await service.ensureTranscript({
        ideSessionId: 'ide-session-1',
        projectId: 'proj-1',
      });

      expect(result.isNew).toBe(true);
      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
      expect(repository.create).toHaveBeenCalledWith({
        ideName: 'opencode',
        ideSessionId: 'ide-session-1',
        projectId: 'proj-1',
        projectPath: '/test/project',
        agentMemorySessionId: undefined,
        title: 'Fix Bug',
      });
    });

    it('should use provided title over session title', async () => {
      vi.mocked(repository.getByIDESession).mockResolvedValue(undefined);
      vi.mocked(reader.findSessionByExternalId).mockResolvedValue({
        id: 'ide-session-1',
        projectPath: '/test',
        title: 'Session Title',
        createdAt: new Date(),
      });
      vi.mocked(repository.create).mockResolvedValue(createTestTranscript());
      vi.mocked(reader.getMessages).mockResolvedValue([]);

      await service.ensureTranscript({
        ideSessionId: 'ide-session-1',
        title: 'Custom Title',
      });

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Custom Title' })
      );
    });

    it('should handle empty message list gracefully', async () => {
      vi.mocked(repository.getByIDESession).mockResolvedValue(undefined);
      vi.mocked(repository.create).mockResolvedValue(createTestTranscript());
      vi.mocked(reader.getMessages).mockResolvedValue([]);

      const result = await service.ensureTranscript({
        ideSessionId: 'ide-session-1',
      });

      expect(result.isNew).toBe(true);
      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(0);
      expect(repository.addMessages).not.toHaveBeenCalled();
    });
  });

  describe('appendNewMessages', () => {
    it('should append messages after last timestamp', async () => {
      const transcript = createTestTranscript({
        lastMessageTimestamp: '2026-01-26T10:00:00Z',
      });
      const newMessages: IDEMessage[] = [
        createTestIDEMessage({
          id: 'msg-new',
          timestamp: new Date('2026-01-26T10:05:00Z'),
        }),
      ];

      vi.mocked(repository.getById).mockResolvedValue(transcript);
      vi.mocked(reader.getMessages).mockResolvedValue(newMessages);
      vi.mocked(repository.addMessages).mockResolvedValue({ added: 1, skipped: 0 });

      const result = await service.appendNewMessages('transcript-1');

      expect(result.appended).toBe(1);
      expect(reader.getMessages).toHaveBeenCalledWith('ide-session-1', {
        after: new Date('2026-01-26T10:00:00Z'),
      });
    });

    it('should return zeros when transcript not found', async () => {
      vi.mocked(repository.getById).mockResolvedValue(undefined);

      const result = await service.appendNewMessages('nonexistent');

      expect(result.appended).toBe(0);
      expect(result.skipped).toBe(0);
      expect(reader.getMessages).not.toHaveBeenCalled();
    });

    it('should skip append for sealed transcripts', async () => {
      const sealedTranscript = createTestTranscript({ isSealed: true });
      vi.mocked(repository.getById).mockResolvedValue(sealedTranscript);

      const result = await service.appendNewMessages('transcript-1');

      expect(result.appended).toBe(0);
      expect(result.skipped).toBe(0);
      expect(reader.getMessages).not.toHaveBeenCalled();
    });

    it('should handle no new messages gracefully', async () => {
      vi.mocked(repository.getById).mockResolvedValue(createTestTranscript());
      vi.mocked(reader.getMessages).mockResolvedValue([]);

      const result = await service.appendNewMessages('transcript-1');

      expect(result.appended).toBe(0);
      expect(result.skipped).toBe(0);
      expect(repository.addMessages).not.toHaveBeenCalled();
    });
  });

  describe('seal', () => {
    it('should append final messages then seal', async () => {
      const transcript = createTestTranscript();
      const sealedTranscript = createTestTranscript({ isSealed: true, messageCount: 5 });

      vi.mocked(repository.getById).mockResolvedValue(transcript);
      vi.mocked(reader.getMessages).mockResolvedValue([]);
      vi.mocked(repository.seal).mockResolvedValue(sealedTranscript);

      const result = await service.seal('transcript-1');

      expect(result.isSealed).toBe(true);
      expect(repository.seal).toHaveBeenCalledWith('transcript-1');
    });

    it('should include new messages in sealed transcript', async () => {
      const transcript = createTestTranscript({
        lastMessageTimestamp: '2026-01-26T10:00:00Z',
      });
      const newMessage = createTestIDEMessage({
        id: 'final-msg',
        timestamp: new Date('2026-01-26T10:10:00Z'),
      });
      const sealedTranscript = createTestTranscript({ isSealed: true, messageCount: 3 });

      vi.mocked(repository.getById).mockResolvedValue(transcript);
      vi.mocked(reader.getMessages).mockResolvedValue([newMessage]);
      vi.mocked(repository.addMessages).mockResolvedValue({ added: 1, skipped: 0 });
      vi.mocked(repository.seal).mockResolvedValue(sealedTranscript);

      const result = await service.seal('transcript-1');

      expect(repository.addMessages).toHaveBeenCalled();
      expect(result.messageCount).toBe(3);
    });
  });

  describe('getMessages', () => {
    it('should delegate to repository', async () => {
      const messages: TranscriptMessage[] = [
        {
          id: 'tm-1',
          transcriptId: 'transcript-1',
          ideMessageId: 'msg-1',
          role: 'user',
          content: 'Hello',
          toolsUsed: null,
          timestamp: '2026-01-26T10:00:00Z',
          metadata: null,
        },
      ];
      vi.mocked(repository.getMessages).mockResolvedValue(messages);

      const result = await service.getMessages('transcript-1', { limit: 10 });

      expect(result).toBe(messages);
      expect(repository.getMessages).toHaveBeenCalledWith('transcript-1', { limit: 10 });
    });
  });

  describe('getMessagesByTimeRange', () => {
    it('should delegate to repository with time bounds', async () => {
      const messages: TranscriptMessage[] = [];
      vi.mocked(repository.getMessagesByTimeRange).mockResolvedValue(messages);

      const result = await service.getMessagesByTimeRange(
        'transcript-1',
        '2026-01-26T10:00:00Z',
        '2026-01-26T11:00:00Z'
      );

      expect(result).toBe(messages);
      expect(repository.getMessagesByTimeRange).toHaveBeenCalledWith(
        'transcript-1',
        '2026-01-26T10:00:00Z',
        '2026-01-26T11:00:00Z'
      );
    });
  });

  describe('getTranscriptByIDESession', () => {
    it('should lookup transcript by IDE session ID', async () => {
      const transcript = createTestTranscript();
      vi.mocked(repository.getByIDESession).mockResolvedValue(transcript);

      const result = await service.getTranscriptByIDESession('ide-session-1');

      expect(result).toBe(transcript);
      expect(repository.getByIDESession).toHaveBeenCalledWith('opencode', 'ide-session-1');
    });

    it('should return undefined when not found', async () => {
      vi.mocked(repository.getByIDESession).mockResolvedValue(undefined);

      const result = await service.getTranscriptByIDESession('nonexistent');

      expect(result).toBeUndefined();
    });
  });
});
