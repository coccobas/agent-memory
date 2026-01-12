/**
 * Chunking System Example
 *
 * Demonstrates text chunking with relation and dependency tracking,
 * integrated with LM Studio for memory-aware processing.
 *
 * Run: npx tsx examples/chunking-example.ts
 */

import 'dotenv/config';

import { createChunkingService } from '../src/services/chunking/index.js';
import { createLMStudioClient } from '../src/services/lm-studio/index.js';

// Sample code document for chunking
const sampleCode = `
import { Database } from './database.js';
import { Logger } from './logger.js';

/**
 * User service handles user operations
 */
export class UserService {
  private db: Database;
  private logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  async getUser(id: string): Promise<User | null> {
    this.logger.info('Fetching user', { id });
    return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
  }

  async createUser(data: CreateUserInput): Promise<User> {
    this.logger.info('Creating user', { email: data.email });
    const result = await this.db.insert('users', data);
    return result;
  }
}

/**
 * Authentication service depends on UserService
 */
export class AuthService {
  private userService: UserService;
  private logger: Logger;

  constructor(userService: UserService, logger: Logger) {
    this.userService = userService;
    this.logger = logger;
  }

  async login(email: string, password: string): Promise<Session | null> {
    const user = await this.userService.getUser(email);
    if (!user) {
      this.logger.warn('Login failed: user not found', { email });
      return null;
    }

    if (!this.verifyPassword(password, user.passwordHash)) {
      this.logger.warn('Login failed: invalid password', { email });
      return null;
    }

    this.logger.info('Login successful', { userId: user.id });
    return this.createSession(user);
  }

  private verifyPassword(password: string, hash: string): boolean {
    // Password verification logic
    return true;
  }

  private createSession(user: User): Session {
    // Session creation logic
    return { userId: user.id, token: 'xxx' };
  }
}

/**
 * API Router uses AuthService
 */
export class ApiRouter {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  async handleLogin(req: Request): Promise<Response> {
    const { email, password } = req.body;
    const session = await this.authService.login(email, password);

    if (!session) {
      return { status: 401, body: { error: 'Invalid credentials' } };
    }

    return { status: 200, body: session };
  }
}
`;

// Sample markdown document
const sampleMarkdown = `
# Project Architecture

This document describes the architecture of our application.

## Overview

The application follows a layered architecture with clear separation of concerns.

### Data Layer

The data layer handles all database operations:
- Database connections
- Query execution
- Transaction management

### Service Layer

The service layer contains business logic:
- User management
- Authentication
- Authorization

### API Layer

The API layer exposes HTTP endpoints:
- REST API routes
- Request validation
- Response formatting

## Dependencies

Each layer depends only on the layer below it:

\`\`\`
API Layer → Service Layer → Data Layer
\`\`\`

## Key Components

### UserService

Handles user CRUD operations. See \`src/services/user.ts\`.

### AuthService

Manages authentication flows. Depends on UserService.

### ApiRouter

Routes HTTP requests to appropriate handlers.
`;

async function main() {
  console.log('=== Chunking System Demo ===\n');

  // Create chunking service
  const chunker = createChunkingService({
    targetSize: 800,
    maxSize: 1500,
    overlap: 100,
    strategy: 'semantic',
    extractRelations: true,
    detectDependencies: true,
  });

  // 1. Chunk code document
  console.log('1. Chunking code document...');
  const codeResult = chunker.chunk(sampleCode, 'sample-code');

  console.log(`   Content type detected: ${codeResult.contentType}`);
  console.log(`   Total chunks: ${codeResult.stats.totalChunks}`);
  console.log(`   Total relations: ${codeResult.stats.totalRelations}`);
  console.log(`   Avg chunk size: ${codeResult.stats.avgChunkSize} chars`);

  console.log('\n   Chunks:');
  for (const chunk of codeResult.chunks) {
    console.log(`   [${chunk.index}] ${chunk.tokenEstimate} tokens - ${chunk.metadata.definitions?.join(', ') || 'no definitions'}`);
  }

  console.log('\n   Dependencies:');
  const dependencyRelations = codeResult.relations.filter((r) => r.type === 'depends_on');
  for (const rel of dependencyRelations) {
    const source = codeResult.chunks.find((c) => c.id === rel.sourceId);
    const target = codeResult.chunks.find((c) => c.id === rel.targetId);
    const ref = rel.metadata?.reference as string || 'unknown';
    console.log(`   "${source?.metadata.definitions?.[0] || 'chunk'}" depends on "${target?.metadata.definitions?.[0] || 'chunk'}" (${ref})`);
  }

  // 2. Chunk markdown document
  console.log('\n2. Chunking markdown document...');
  const mdResult = chunker.chunk(sampleMarkdown, 'sample-docs');

  console.log(`   Content type detected: ${mdResult.contentType}`);
  console.log(`   Total chunks: ${mdResult.stats.totalChunks}`);
  console.log(`   Total relations: ${mdResult.stats.totalRelations}`);

  console.log('\n   Sections:');
  for (const chunk of mdResult.chunks) {
    console.log(`   [${chunk.index}] ${chunk.metadata.title || 'Untitled'} (${chunk.tokenEstimate} tokens)`);
  }

  // 3. Get related chunks
  console.log('\n3. Exploring chunk relations...');
  if (codeResult.chunks.length > 0) {
    const firstChunk = codeResult.chunks[0]!;
    const related = chunker.getRelated(codeResult, firstChunk.id);
    console.log(`   Chunk "${firstChunk.metadata.definitions?.[0] || 'first'}" has ${related.length} relations:`);
    for (const { chunk, relation } of related.slice(0, 5)) {
      console.log(`   - ${relation.type} → "${chunk.metadata.definitions?.[0] || 'chunk'}"`);
    }
  }

  // 4. Use with LM Studio (if available)
  console.log('\n4. Testing LM Studio integration...');
  const lmClient = createLMStudioClient();
  const health = await lmClient.healthCheck();

  if (health.connected) {
    console.log('   LM Studio connected! Processing first chunk with context...');

    // Get a chunk and its dependencies
    const chunk = codeResult.chunks[1]; // AuthService chunk
    if (chunk) {
      const deps = chunker.getDependencies(codeResult, chunk.id);
      const context = deps.map((d) => d.content).join('\n\n---\n\n');

      const prompt = `Given this code context:

${context}

And this main code:

${chunk.content}

Explain what AuthService does and its dependencies.`;

      try {
        const response = await lmClient.chat([
          { role: 'user', content: prompt },
        ]);
        console.log(`   Response: ${response.content.slice(0, 300)}...`);
      } catch (error) {
        console.log(`   ⚠️ LLM call failed: ${error}`);
      }
    }
  } else {
    console.log('   LM Studio not available - skipping LLM integration demo');
  }

  // 5. Statistics summary
  console.log('\n5. Summary Statistics:');
  console.log(`   Code document:`);
  console.log(`     - ${codeResult.stats.totalChunks} chunks`);
  console.log(`     - ${codeResult.stats.totalRelations} relations`);
  console.log(`     - ${codeResult.stats.processingTimeMs}ms processing time`);
  console.log(`   Markdown document:`);
  console.log(`     - ${mdResult.stats.totalChunks} chunks`);
  console.log(`     - ${mdResult.stats.totalRelations} relations`);
  console.log(`     - ${mdResult.stats.processingTimeMs}ms processing time`);

  console.log('\n=== Demo Complete ===');
}

main().catch(console.error);
