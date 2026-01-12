/**
 * LLM-Powered Chunking Example
 *
 * Uses a local LLM via LM Studio to intelligently chunk documents
 * with semantic understanding of boundaries, relations, and dependencies.
 *
 * Run: npx tsx examples/llm-chunking-example.ts
 */

import 'dotenv/config';

import { createLLMChunkingService } from '../src/services/chunking/index.js';

// Sample TypeScript code for chunking
const sampleCode = `
import { Database } from './database.js';
import { Logger } from './logger.js';
import { Cache } from './cache.js';

/**
 * Configuration for the application
 */
export interface AppConfig {
  dbUrl: string;
  cacheEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * User model representing a user in the system
 */
export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User service handles all user-related operations
 * including CRUD and validation
 */
export class UserService {
  private db: Database;
  private logger: Logger;
  private cache: Cache;

  constructor(db: Database, logger: Logger, cache: Cache) {
    this.db = db;
    this.logger = logger;
    this.cache = cache;
  }

  /**
   * Get a user by their ID
   * Uses cache for faster lookups
   */
  async getUser(id: string): Promise<User | null> {
    // Check cache first
    const cached = await this.cache.get(\`user:\${id}\`);
    if (cached) {
      this.logger.debug('User found in cache', { id });
      return cached as User;
    }

    // Query database
    this.logger.info('Fetching user from database', { id });
    const user = await this.db.query<User>(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );

    // Cache the result
    if (user) {
      await this.cache.set(\`user:\${id}\`, user, 300);
    }

    return user;
  }

  /**
   * Create a new user
   * Validates email uniqueness before creation
   */
  async createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    this.logger.info('Creating new user', { email: data.email });

    // Check for existing user
    const existing = await this.db.query<User>(
      'SELECT id FROM users WHERE email = ?',
      [data.email]
    );

    if (existing) {
      throw new Error('User with this email already exists');
    }

    const user = await this.db.insert<User>('users', {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.logger.info('User created successfully', { userId: user.id });
    return user;
  }

  /**
   * Update user information
   */
  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    this.logger.info('Updating user', { id });

    const user = await this.db.update<User>('users', id, {
      ...updates,
      updatedAt: new Date(),
    });

    // Invalidate cache
    await this.cache.delete(\`user:\${id}\`);

    return user;
  }
}

/**
 * Authentication service handles login/logout and session management
 * Depends on UserService for user lookups
 */
export class AuthService {
  private userService: UserService;
  private logger: Logger;

  constructor(userService: UserService, logger: Logger) {
    this.userService = userService;
    this.logger = logger;
  }

  /**
   * Authenticate a user with email and password
   */
  async login(email: string, password: string): Promise<{ token: string; user: User } | null> {
    this.logger.info('Login attempt', { email });

    // Find user by email (we need to query directly for password check)
    const user = await this.userService.getUser(email);

    if (!user) {
      this.logger.warn('Login failed: user not found', { email });
      return null;
    }

    if (!this.verifyPassword(password, user.passwordHash)) {
      this.logger.warn('Login failed: invalid password', { email });
      return null;
    }

    const token = this.generateToken(user);
    this.logger.info('Login successful', { userId: user.id });

    return { token, user };
  }

  /**
   * Verify a session token
   */
  async verifyToken(token: string): Promise<User | null> {
    try {
      const payload = this.decodeToken(token);
      return this.userService.getUser(payload.userId);
    } catch {
      return null;
    }
  }

  private verifyPassword(password: string, hash: string): boolean {
    // Password verification implementation
    return true;
  }

  private generateToken(user: User): string {
    // Token generation implementation
    return 'token';
  }

  private decodeToken(token: string): { userId: string } {
    // Token decoding implementation
    return { userId: 'id' };
  }
}

/**
 * API controller for user endpoints
 * Uses AuthService for authentication
 */
export class UserController {
  private userService: UserService;
  private authService: AuthService;

  constructor(userService: UserService, authService: AuthService) {
    this.userService = userService;
    this.authService = authService;
  }

  async handleGetUser(req: Request): Promise<Response> {
    const user = await this.authService.verifyToken(req.headers.authorization || '');
    if (!user) {
      return { status: 401, body: { error: 'Unauthorized' } };
    }

    const targetUser = await this.userService.getUser(req.params.id);
    if (!targetUser) {
      return { status: 404, body: { error: 'User not found' } };
    }

    return { status: 200, body: targetUser };
  }

  async handleLogin(req: Request): Promise<Response> {
    const { email, password } = req.body;
    const result = await this.authService.login(email, password);

    if (!result) {
      return { status: 401, body: { error: 'Invalid credentials' } };
    }

    return { status: 200, body: result };
  }
}
`;

async function main() {
  console.log('=== LLM-Powered Chunking Demo ===\n');

  // Create LLM chunking service
  const chunker = createLLMChunkingService({
    targetTokens: 400,
    maxTokens: 800,
    extractRelations: true,
    detectDependencies: true,
    temperature: 0.3,
  });

  // Check LM Studio connection
  const health = await chunker.getLMStudioClient().healthCheck();
  if (!health.connected) {
    console.error('❌ LM Studio not connected. Please start LM Studio with a model loaded.');
    return;
  }
  console.log(`✅ Connected to LM Studio (${health.currentModel})\n`);

  // Chunk the code
  console.log('Chunking code document with LLM...');
  console.log('(This uses the LLM to understand semantic boundaries)\n');

  const startTime = Date.now();
  const result = await chunker.chunk(sampleCode, 'user-service-module');
  const elapsed = Date.now() - startTime;

  // Display results
  console.log('=== Results ===\n');
  console.log(`Content type: ${result.contentType}`);
  console.log(`Total chunks: ${result.stats.totalChunks}`);
  console.log(`Total relations: ${result.stats.totalRelations}`);
  console.log(`Processing time: ${elapsed}ms\n`);

  console.log('Chunks found:');
  console.log('─'.repeat(60));

  for (const chunk of result.chunks) {
    const defs = chunk.metadata.definitions?.join(', ') || 'none';
    const imports = chunk.metadata.imports?.length || 0;
    const exports = chunk.metadata.exports?.length || 0;

    console.log(`\n[${chunk.index}] ${chunk.metadata.title || 'Untitled'}`);
    console.log(`    Tokens: ~${chunk.tokenEstimate}`);
    console.log(`    Definitions: ${defs}`);
    console.log(`    Imports: ${imports}, Exports: ${exports}`);

    if (chunk.metadata.custom?.summary) {
      console.log(`    Summary: ${chunk.metadata.custom.summary}`);
    }
  }

  // Display relations
  console.log('\n\nRelations found:');
  console.log('─'.repeat(60));

  const depRelations = result.relations.filter(
    (r) => r.type === 'depends_on' || r.type === 'references' || r.type === 'related_to'
  );

  for (const rel of depRelations) {
    const source = result.chunks.find((c) => c.id === rel.sourceId);
    const target = result.chunks.find((c) => c.id === rel.targetId);

    if (source && target) {
      const sourceName = source.metadata.definitions?.[0] || source.metadata.title || `Chunk ${source.index}`;
      const targetName = target.metadata.definitions?.[0] || target.metadata.title || `Chunk ${target.index}`;
      const reason = rel.metadata?.reason ? ` (${rel.metadata.reason})` : '';

      console.log(`  ${sourceName} ──[${rel.type}]──> ${targetName}${reason}`);
    }
  }

  // Show dependency chain
  console.log('\n\nDependency Analysis:');
  console.log('─'.repeat(60));

  for (const chunk of result.chunks) {
    const deps = chunker.getDependencies(result, chunk.id);
    const dependents = chunker.getDependents(result, chunk.id);

    const name = chunk.metadata.definitions?.[0] || chunk.metadata.title || `Chunk ${chunk.index}`;

    if (deps.length > 0 || dependents.length > 0) {
      console.log(`\n${name}:`);
      if (deps.length > 0) {
        const depNames = deps.map((d) => d.metadata.definitions?.[0] || d.metadata.title || `Chunk ${d.index}`);
        console.log(`  Depends on: ${depNames.join(', ')}`);
      }
      if (dependents.length > 0) {
        const depNames = dependents.map((d) => d.metadata.definitions?.[0] || d.metadata.title || `Chunk ${d.index}`);
        console.log(`  Used by: ${depNames.join(', ')}`);
      }
    }
  }

  console.log('\n\n=== Demo Complete ===');
}

main().catch(console.error);
