#!/usr/bin/env node

/**
 * Generate Example Data
 *
 * This script populates the database with example data for testing and development.
 * Run with: npx tsx scripts/generate-example-data.ts
 */

import { getDb } from '../src/db/connection.js';
import { orgRepo, projectRepo, sessionRepo } from '../src/db/repositories/scopes.js';
import { toolRepo } from '../src/db/repositories/tools.js';
import { guidelineRepo } from '../src/db/repositories/guidelines.js';
import { knowledgeRepo } from '../src/db/repositories/knowledge.js';
import { tagRepo } from '../src/db/repositories/tags.js';

console.log('🌱 Generating example data for Agent Memory...\n');

// Initialize database
const db = getDb();

// Seed predefined tags
tagRepo.seedPredefined();
console.log('✅ Seeded predefined tags');

// Create organization
const org = orgRepo.create({
  name: 'Example Corp',
  metadata: { description: 'Example organization for development' },
});
console.log(`✅ Created organization: ${org.name} (${org.id})`);

// Create project
const project = projectRepo.create({
  orgId: org.id,
  name: 'Example Web App',
  description: 'A sample web application project',
  rootPath: '/path/to/project',
  metadata: {
    tech_stack: ['TypeScript', 'React', 'Node.js'],
    team_size: 5,
  },
});
console.log(`✅ Created project: ${project.name} (${project.id})`);

// Create session
const session = sessionRepo.start({
  projectId: project.id,
  name: 'feature-authentication',
  purpose: 'Implementing user authentication',
  agentId: 'example-agent',
  metadata: { branch: 'feature/auth' },
});
console.log(`✅ Created session: ${session.name} (${session.id})`);

// Create global guidelines
const securityGuideline = guidelineRepo.create({
  scopeType: 'global',
  name: 'security_parameterized_sql',
  category: 'security',
  priority: 95,
  content: 'Always use parameterized queries or prepared statements to prevent SQL injection.',
  rationale: 'SQL injection is a critical security vulnerability',
  examples: {
    good: ['db.query("SELECT * FROM users WHERE id = ?", [userId])'],
    bad: ['db.query(`SELECT * FROM users WHERE id = ${userId}`)'],
  },
  createdBy: 'security-team',
});
console.log(`✅ Created global guideline: ${securityGuideline.name}`);

// Create project-specific guidelines
const codeStyleGuideline = guidelineRepo.create({
  scopeType: 'project',
  scopeId: project.id,
  name: 'typescript_naming',
  category: 'code_style',
  priority: 70,
  content:
    'Use PascalCase for classes/types, camelCase for functions/variables, UPPER_SNAKE_CASE for constants.',
  rationale: 'Consistent naming improves code readability',
  createdBy: 'tech-lead',
});
console.log(`✅ Created project guideline: ${codeStyleGuideline.name}`);

// Create tools
const testTool = toolRepo.create({
  scopeType: 'project',
  scopeId: project.id,
  name: 'run_tests',
  category: 'cli',
  description: 'Run the project test suite',
  parameters: {
    path: { type: 'string', optional: true, description: 'Specific test file or directory' },
    coverage: { type: 'boolean', optional: true, description: 'Generate coverage report' },
  },
  examples: ['npm test', 'npm test -- tests/auth.test.ts', 'npm run test:coverage'],
  constraints: 'Must be run from project root',
  createdBy: 'developer',
});
console.log(`✅ Created tool: ${testTool.name}`);

const deployTool = toolRepo.create({
  scopeType: 'project',
  scopeId: project.id,
  name: 'deploy_staging',
  category: 'cli',
  description: 'Deploy application to staging environment',
  parameters: {
    branch: { type: 'string', optional: true, description: 'Git branch to deploy' },
  },
  examples: ['./scripts/deploy.sh staging', './scripts/deploy.sh staging feature-branch'],
  constraints: 'Requires deployment credentials',
  createdBy: 'devops',
});
console.log(`✅ Created tool: ${deployTool.name}`);

// Create knowledge entries
const archDecision = knowledgeRepo.create({
  scopeType: 'project',
  scopeId: project.id,
  title: 'Authentication Strategy',
  category: 'decision',
  content:
    'Decided to use JWT tokens with refresh tokens for authentication. Access tokens expire after 15 minutes, refresh tokens after 7 days. Decision made after comparing OAuth2, session-based, and JWT approaches.',
  source: 'Architecture review meeting 2024-01-15',
  confidence: 1.0,
  createdBy: 'architect',
});
console.log(`✅ Created knowledge: ${archDecision.title}`);

const techContext = knowledgeRepo.create({
  scopeType: 'project',
  scopeId: project.id,
  title: 'Database Schema Overview',
  category: 'context',
  content:
    'Main tables: users, projects, tasks, comments. Users have many projects, projects have many tasks, tasks have many comments. Using PostgreSQL with Drizzle ORM.',
  source: 'Database design document',
  confidence: 1.0,
  createdBy: 'backend-team',
});
console.log(`✅ Created knowledge: ${techContext.title}`);

// Create session-specific entries
const sessionKnowledge = knowledgeRepo.create({
  scopeType: 'session',
  scopeId: session.id,
  title: 'Auth Implementation Notes',
  category: 'context',
  content:
    'Working on JWT token generation. Using jsonwebtoken library. Storing refresh tokens in Redis with 7-day expiration.',
  source: 'Development session',
  confidence: 0.9,
  createdBy: 'developer',
});
console.log(`✅ Created session knowledge: ${sessionKnowledge.title}`);

// Tag entries
const pythonTag = tagRepo.getOrCreate('python');
const securityTag = tagRepo.getOrCreate('security');
const webTag = tagRepo.getOrCreate('web');
const typescriptTag = tagRepo.getOrCreate('typescript');

tagRepo.attachTag('guideline', securityGuideline.id, securityTag.id);
tagRepo.attachTag('guideline', codeStyleGuideline.id, typescriptTag.id);
tagRepo.attachTag('tool', testTool.id, typescriptTag.id);
tagRepo.attachTag('knowledge', archDecision.id, securityTag.id);
tagRepo.attachTag('knowledge', archDecision.id, webTag.id);

console.log('✅ Tagged entries');

// Summary
console.log('\n📊 Summary:');
console.log(`   Organizations: 1`);
console.log(`   Projects: 1`);
console.log(`   Sessions: 1`);
console.log(`   Guidelines: 2`);
console.log(`   Tools: 2`);
console.log(`   Knowledge: 3`);
console.log(`   Tags: ${[pythonTag, securityTag, webTag, typescriptTag].length}`);

console.log('\n✨ Example data generation complete!');
console.log('\nYou can now:');
console.log('  • Query the data: npm run db:studio');
console.log('  • Test with: npm test');
console.log(`  • Use project ID: ${project.id}`);
console.log(`  • Use session ID: ${session.id}`);
