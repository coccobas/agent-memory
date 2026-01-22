import type {
  WalkthroughStepId,
  WalkthroughStepContent,
  WalkthroughProgress,
  IWalkthroughService,
} from './walkthrough-types.js';

const STEP_ORDER: WalkthroughStepId[] = [
  'welcome',
  'project_setup',
  'first_memory',
  'querying',
  'sessions',
  'tips',
  'complete',
];

const STEPS: WalkthroughStepContent[] = [
  {
    id: 'welcome',
    title: 'Welcome to Agent Memory',
    explanation: `
Agent Memory gives AI agents persistent memory across conversations.

**What it does:**
- Stores guidelines, knowledge, and tools scoped to your project
- Tracks work sessions and episodes
- Learns patterns from your coding sessions
- Provides contextual retrieval when you need it

**Why it matters:**
Without memory, every conversation starts from scratch. With Agent Memory, the agent remembers your coding standards, architectural decisions, and project context.
`.trim(),
    concepts: ['Guidelines', 'Knowledge', 'Scopes', 'Sessions'],
    tips: [
      'Memory is automatically scoped to your project directory',
      'The agent can proactively store things it learns during conversations',
    ],
    nextPreview: "Next, we'll set up your project in the memory system.",
  },
  {
    id: 'project_setup',
    title: 'Project Setup',
    explanation: `
Every memory entry belongs to a scope. The most common scope is **project** - tied to your codebase.

**Auto-detection:**
Agent Memory automatically detects your project from:
- package.json, Cargo.toml, pyproject.toml
- Git repository info
- Directory name as fallback

**What gets created:**
- A project record linked to your directory
- Permissions for the agent to read/write memory
- Initial context from README and CLAUDE.md (if present)
`.trim(),
    concepts: ['Project scope', 'Auto-detection', 'Permissions'],
    tryIt: [
      {
        description: 'Run the full onboarding wizard',
        command: 'memory_onboard',
        example: '{"dryRun": true}',
      },
      {
        description: 'Quick start with a session',
        command: 'memory_quickstart',
        example: '{"sessionName": "Learning walkthrough"}',
      },
    ],
    tips: [
      'Use dryRun:true to preview what onboarding will do',
      'If your project is already set up, quickstart will just resume it',
    ],
    nextPreview: "Next, you'll store your first memory.",
  },
  {
    id: 'first_memory',
    title: 'Storing Your First Memory',
    explanation: `
There are three types of memory entries:

**Guidelines** - Rules and standards that affect how the agent works
- "Always use TypeScript strict mode"
- "Follow the existing error handling pattern"

**Knowledge** - Facts, decisions, and context about your project
- "We chose PostgreSQL because of JSONB support"
- "The auth module uses JWT with 1-hour expiry"

**Tools** - Reusable commands and patterns
- CLI commands, scripts, API patterns

**Two ways to store:**

1. **Manual** - Use \`memory_remember\` with natural language (auto-detects type)
2. **Automatic** - Use \`memory_observe\` to extract memories from conversation/code context
`.trim(),
    concepts: ['Guidelines', 'Knowledge', 'Tools', 'Auto-classification', 'Auto-extraction'],
    tryIt: [
      {
        description: 'Store a guideline (natural language)',
        command: 'memory_remember',
        example: '{"text": "Always run tests before committing"}',
      },
      {
        description: 'Store knowledge about a decision',
        command: 'memory_remember',
        example:
          '{"text": "We use Vitest because it is faster than Jest for our TypeScript setup"}',
      },
      {
        description: 'Auto-extract from conversation',
        command: 'memory_observe',
        example: '{"action": "extract", "context": "<paste conversation>", "autoStore": true}',
      },
    ],
    tips: [
      'memory_remember auto-detects type, category, and tags',
      'memory_observe uses LLM to extract multiple memories from raw text',
      'Set autoStore:true with confidenceThreshold to store high-confidence extractions automatically',
    ],
    nextPreview: "Next, we'll learn how to query and retrieve memories.",
  },
  {
    id: 'querying',
    title: 'Querying Memory',
    explanation: `
Retrieval is just as important as storage. Agent Memory supports:

**Natural language queries:**
\`memory\` tool with plain text questions

**Structured queries:**
\`memory_query\` for precise filtering by type, tags, scope

**Automatic context:**
\`memory_quickstart\` loads relevant context at session start

**Search features:**
- Full-text search with BM25 ranking
- Semantic search (with embeddings enabled)
- Tag-based filtering
- Exclusion syntax: \`-term\` or \`-"phrase"\`
`.trim(),
    concepts: ['Natural language query', 'Structured query', 'Context loading', 'Search'],
    tryIt: [
      {
        description: 'Ask a natural language question',
        command: 'memory',
        example: '{"text": "What are our coding standards?"}',
      },
      {
        description: 'Get all guidelines',
        command: 'memory_query',
        example: '{"action": "search", "types": ["guidelines"]}',
      },
      {
        description: 'Search with exclusions',
        command: 'memory_query',
        example: '{"action": "search", "search": "testing -unit"}',
      },
    ],
    tips: [
      'memory_quickstart automatically loads context - call it at conversation start',
      'Use memory_query action:"context" for aggregated view',
      'Exclusion syntax (-term) filters out unwanted results',
    ],
    nextPreview: "Next, we'll cover sessions and work tracking.",
  },
  {
    id: 'sessions',
    title: 'Sessions & Episodes',
    explanation: `
Sessions track your work over time:

**Sessions:**
- Group related work within a conversation
- Auto-timeout after inactivity
- Provide context continuity

**Episodes:**
- Track specific tasks: "Fix auth bug", "Add dark mode"
- Record what happened and the outcome
- Enable "what did we do?" queries

**Why it matters:**
- Continue where you left off
- Review past decisions
- Learn from successful patterns
`.trim(),
    concepts: ['Sessions', 'Episodes', 'Work tracking', 'Continuity'],
    tryIt: [
      {
        description: 'Start a session with purpose',
        command: 'memory_quickstart',
        example: '{"sessionName": "Implement feature X"}',
      },
      {
        description: 'Begin tracking an episode',
        command: 'memory_episode',
        example: '{"action": "begin", "sessionId": "<your-session>", "name": "Fix login bug"}',
      },
      {
        description: 'Check what happened',
        command: 'memory_episode',
        example: '{"action": "what_happened", "id": "<episode-id>"}',
      },
    ],
    tips: [
      'Sessions auto-start when you use quickstart with a sessionName',
      'Episodes can be nested for complex tasks',
      'Log progress with action:"log" for better retrospectives',
    ],
    nextPreview: 'Finally, some tips and advanced features to explore.',
  },
  {
    id: 'tips',
    title: 'Tips & Advanced Features',
    explanation: `
**Best practices:**
1. Start every conversation with \`memory_quickstart\`
2. Be specific when storing - vague memories aren't useful
3. Let the agent suggest memories during work
4. Review recommendations periodically

**Automatic memory extraction:**
- \`memory_observe\` - Extract memories from conversation/code with LLM analysis
- \`memory_experience learn\` - Parse natural language like "Fixed X by doing Y"
- \`memory_experience capture_from_transcript\` - Extract learnings from transcripts
- **Librarian agent** - Runs daily + on session end, detects patterns automatically

**Other advanced features:**
- **Episodes**: Track work with begin/log/complete
- **Graph**: Knowledge graph for relationships
- **Explain**: Debug retrieval with explain:true

**Explore more:**
- \`memory_discover\` - List all available tools
- \`memory_status\` - Check memory health
- \`memory_librarian\` - Review pattern recommendations
`.trim(),
    concepts: ['Best practices', 'Auto-extraction', 'Librarian', 'Graph', 'Advanced tools'],
    tryIt: [
      {
        description: 'See all available memory tools',
        command: 'memory_discover',
        example: '{}',
      },
      {
        description: 'Check your memory health',
        command: 'memory_status',
        example: '{}',
      },
      {
        description: 'Extract memories from context automatically',
        command: 'memory_observe',
        example:
          '{"action": "extract", "context": "<conversation>", "autoStore": true, "confidenceThreshold": 0.7}',
      },
      {
        description: 'Review pattern recommendations',
        command: 'memory_librarian',
        example: '{"action": "list_recommendations"}',
      },
    ],
    tips: [
      'Use memory_observe to auto-extract memories from conversations',
      'The librarian finds patterns in your work - review its recommendations',
      'memory_experience with action:"learn" is the lowest-friction way to capture learnings',
      'Use explain:true on queries to understand retrieval',
    ],
    nextPreview: "That's it! You're ready to use Agent Memory.",
  },
  {
    id: 'complete',
    title: 'Walkthrough Complete!',
    explanation: `
**You've learned:**
✓ What Agent Memory does and why it matters
✓ How to set up your project
✓ Storing guidelines, knowledge, and tools
✓ Querying and retrieving memories
✓ Tracking work with sessions and episodes
✓ Advanced features to explore

**Quick reference:**
- \`memory_quickstart\` - Start every conversation with this
- \`memory_remember\` - Store something (auto-classifies)
- \`memory\` - Ask questions (natural language)
- \`memory_status\` - Check health and stats

**Get help:**
- \`memory_discover\` lists all tools with examples
- Each tool has detailed parameter documentation

Happy coding with persistent memory! 🧠
`.trim(),
    concepts: [],
    tips: [
      'Bookmark memory_discover for quick reference',
      'The agent will remind you of relevant memories automatically',
    ],
  },
];

export class WalkthroughService implements IWalkthroughService {
  private progressStore: Map<string, WalkthroughProgress> = new Map();

  getSteps(): WalkthroughStepContent[] {
    return STEPS;
  }

  getStep(stepId: WalkthroughStepId): WalkthroughStepContent | null {
    return STEPS.find((s) => s.id === stepId) ?? null;
  }

  async getProgress(projectId: string): Promise<WalkthroughProgress | null> {
    return this.progressStore.get(projectId) ?? null;
  }

  async saveProgress(projectId: string, progress: WalkthroughProgress): Promise<void> {
    this.progressStore.set(projectId, progress);
  }

  createInitialProgress(): WalkthroughProgress {
    const now = new Date().toISOString();
    return {
      currentStep: 'welcome',
      completedSteps: [],
      startedAt: now,
      lastActivityAt: now,
      hasStoredMemory: false,
      hasQueriedMemory: false,
      hasStartedSession: false,
    };
  }

  nextStep(progress: WalkthroughProgress): WalkthroughProgress {
    const currentIndex = STEP_ORDER.indexOf(progress.currentStep);
    const nextIndex = Math.min(currentIndex + 1, STEP_ORDER.length - 1);
    const nextStepId = STEP_ORDER[nextIndex] ?? progress.currentStep;

    const completedSteps = progress.completedSteps.includes(progress.currentStep)
      ? progress.completedSteps
      : [...progress.completedSteps, progress.currentStep];

    return {
      ...progress,
      currentStep: nextStepId,
      completedSteps,
      lastActivityAt: new Date().toISOString(),
    };
  }

  prevStep(progress: WalkthroughProgress): WalkthroughProgress {
    const currentIndex = STEP_ORDER.indexOf(progress.currentStep);
    const prevIndex = Math.max(currentIndex - 1, 0);
    const prevStepId = STEP_ORDER[prevIndex] ?? progress.currentStep;

    return {
      ...progress,
      currentStep: prevStepId,
      lastActivityAt: new Date().toISOString(),
    };
  }

  gotoStep(progress: WalkthroughProgress, stepId: WalkthroughStepId): WalkthroughProgress {
    if (!STEP_ORDER.includes(stepId)) {
      return progress;
    }

    return {
      ...progress,
      currentStep: stepId,
      lastActivityAt: new Date().toISOString(),
    };
  }

  markAchievement(
    progress: WalkthroughProgress,
    achievement: 'storedMemory' | 'queriedMemory' | 'startedSession'
  ): WalkthroughProgress {
    const updates: Partial<WalkthroughProgress> = {
      lastActivityAt: new Date().toISOString(),
    };

    switch (achievement) {
      case 'storedMemory':
        updates.hasStoredMemory = true;
        break;
      case 'queriedMemory':
        updates.hasQueriedMemory = true;
        break;
      case 'startedSession':
        updates.hasStartedSession = true;
        break;
    }

    return { ...progress, ...updates };
  }

  getStepNumber(stepId: WalkthroughStepId): number {
    return STEP_ORDER.indexOf(stepId) + 1;
  }

  getTotalSteps(): number {
    return STEP_ORDER.length;
  }

  isComplete(progress: WalkthroughProgress): boolean {
    return progress.currentStep === 'complete';
  }
}

export function createWalkthroughService(): WalkthroughService {
  return new WalkthroughService();
}
