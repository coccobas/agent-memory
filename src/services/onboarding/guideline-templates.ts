/**
 * Guideline Templates for Onboarding
 *
 * Predefined best-practice guidelines organized by tech stack.
 * These are seeded during project onboarding.
 */

import type { GuidelineTemplate } from './types.js';

/**
 * TypeScript guidelines
 */
export const TYPESCRIPT_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'typescript-strict-mode',
    content:
      'Enable TypeScript strict mode in tsconfig.json. This includes strictNullChecks, noImplicitAny, and other safety features.',
    category: 'typescript',
    priority: 85,
    rationale: 'Strict mode catches common bugs at compile time and improves code safety.',
    examples: {
      good: [
        '"strict": true in tsconfig.json',
        'function greet(name: string): string { return `Hello ${name}`; }',
      ],
      bad: [
        '"strict": false or omitted',
        'function greet(name) { return `Hello ${name}`; } // implicit any',
      ],
    },
    tags: ['typescript', 'code-quality'],
  },
  {
    name: 'typescript-explicit-return-types',
    content:
      'Use explicit return types for public functions and exported APIs. This improves documentation and catches refactoring errors.',
    category: 'typescript',
    priority: 70,
    rationale: 'Explicit types serve as documentation and prevent accidental API changes.',
    examples: {
      good: ['export function calculateTotal(items: Item[]): number { ... }'],
      bad: ['export function calculateTotal(items) { ... } // inferred return type'],
    },
    tags: ['typescript', 'api-design'],
  },
  {
    name: 'typescript-prefer-unknown-over-any',
    content:
      'Use `unknown` instead of `any` when the type is truly unknown. Use type guards to narrow the type safely.',
    category: 'typescript',
    priority: 75,
    rationale: 'unknown forces explicit type checking, while any bypasses type safety entirely.',
    examples: {
      good: ['function parse(input: unknown): Result { if (typeof input === "string") ... }'],
      bad: ['function parse(input: any): Result { return input.data; } // unsafe'],
    },
    tags: ['typescript', 'type-safety'],
  },
];

/**
 * React guidelines
 */
export const REACT_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'react-hooks-rules',
    content:
      'Follow the Rules of Hooks: only call hooks at the top level, only call hooks from React functions.',
    category: 'react',
    priority: 90,
    rationale: 'Breaking hook rules causes unpredictable behavior and bugs that are hard to debug.',
    examples: {
      good: ['const [state, setState] = useState(0); // at top level'],
      bad: ['if (condition) { const [state, setState] = useState(0); } // conditional hook'],
    },
    tags: ['react', 'hooks'],
  },
  {
    name: 'react-functional-components',
    content: 'Prefer functional components with hooks over class components for new code.',
    category: 'react',
    priority: 70,
    rationale:
      'Functional components are simpler, easier to test, and align with modern React patterns.',
    examples: {
      good: ['function MyComponent({ name }: Props) { return <div>{name}</div>; }'],
      bad: ['class MyComponent extends React.Component { render() { ... } }'],
    },
    tags: ['react', 'components'],
  },
  {
    name: 'react-memoization',
    content:
      'Use useMemo for expensive calculations and useCallback for callback functions passed to optimized child components.',
    category: 'react',
    priority: 65,
    rationale: 'Proper memoization prevents unnecessary recalculations and re-renders.',
    examples: {
      good: ['const total = useMemo(() => items.reduce(...), [items]);'],
      bad: ['const total = items.reduce(...); // recalculates every render'],
    },
    tags: ['react', 'performance'],
  },
];

/**
 * Node.js guidelines
 */
export const NODEJS_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'nodejs-async-error-handling',
    content:
      'Always handle errors in async operations with try/catch or .catch(). Unhandled rejections crash Node.js.',
    category: 'nodejs',
    priority: 85,
    rationale: 'Unhandled promise rejections lead to crashes and data loss in production.',
    examples: {
      good: ['try { await riskyOperation(); } catch (e) { logger.error(e); }'],
      bad: ['await riskyOperation(); // no error handling'],
    },
    tags: ['nodejs', 'error-handling'],
  },
  {
    name: 'nodejs-environment-variables',
    content:
      'Use environment variables for configuration. Never hardcode secrets, API keys, or environment-specific values.',
    category: 'nodejs',
    priority: 90,
    rationale:
      'Environment variables keep secrets out of code and allow different configs per environment.',
    examples: {
      good: [
        'const apiKey = process.env.API_KEY;',
        'if (!apiKey) throw new Error("API_KEY required");',
      ],
      bad: ['const apiKey = "sk-secret-123"; // hardcoded secret'],
    },
    tags: ['nodejs', 'security', 'configuration'],
  },
  {
    name: 'nodejs-input-validation',
    content: 'Validate all external input (user input, API responses, file contents) before use.',
    category: 'nodejs',
    priority: 85,
    rationale: 'Input validation prevents injection attacks and data corruption.',
    examples: {
      good: ['const validated = schema.parse(userInput);'],
      bad: ['db.query(`SELECT * FROM users WHERE id = ${userId}`); // SQL injection'],
    },
    tags: ['nodejs', 'security', 'validation'],
  },
];

/**
 * General best practices
 */
export const GENERAL_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'tdd-workflow',
    content:
      'Write tests first (TDD): RED (failing test) → GREEN (minimal code to pass) → REFACTOR (improve code).',
    category: 'testing',
    priority: 75,
    rationale: 'TDD leads to better design, higher coverage, and more confidence in refactoring.',
    examples: {
      good: ['1. Write test that fails', '2. Write minimal code to pass', '3. Refactor'],
      bad: ['Write all code first, then try to add tests later'],
    },
    tags: ['testing', 'tdd', 'workflow'],
  },
  {
    name: 'small-functions',
    content:
      'Keep functions small and focused. Each function should do one thing well (Single Responsibility Principle).',
    category: 'code-quality',
    priority: 70,
    rationale: 'Small functions are easier to understand, test, and reuse.',
    examples: {
      good: ['function validateEmail(email: string): boolean { ... }'],
      bad: ['function processForm() { /* 200 lines doing validation, saving, emailing */ }'],
    },
    tags: ['code-quality', 'maintainability'],
  },
  {
    name: 'document-public-apis',
    content:
      'Document public APIs and exported functions with JSDoc or TSDoc comments explaining purpose and parameters.',
    category: 'documentation',
    priority: 60,
    rationale:
      'Good documentation helps other developers (and your future self) use the code correctly.',
    examples: {
      good: [
        '/** Calculates total price including tax. @param items - Cart items @returns Total in cents */',
      ],
      bad: ['function calc(x) { ... } // no docs, unclear name'],
    },
    tags: ['documentation', 'api-design'],
  },
];

/**
 * Python guidelines
 */
export const PYTHON_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'python-type-hints',
    content:
      'Use type hints for function parameters and return types. Enable mypy or pyright for static type checking.',
    category: 'python',
    priority: 80,
    rationale: 'Type hints improve code clarity and catch bugs early through static analysis.',
    examples: {
      good: ['def greet(name: str) -> str: return f"Hello {name}"'],
      bad: ['def greet(name): return f"Hello {name}" # no type hints'],
    },
    tags: ['python', 'type-safety'],
  },
  {
    name: 'python-virtual-environment',
    content: 'Always use a virtual environment (venv, poetry, pipenv) for project dependencies.',
    category: 'python',
    priority: 85,
    rationale: 'Virtual environments prevent dependency conflicts between projects.',
    examples: {
      good: ['python -m venv .venv && source .venv/bin/activate'],
      bad: ['pip install package # installs globally'],
    },
    tags: ['python', 'dependencies'],
  },
];

/**
 * Rust guidelines
 */
export const RUST_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'rust-error-handling',
    content:
      'Use Result<T, E> for recoverable errors and propagate with ?. Reserve panic! for unrecoverable situations.',
    category: 'rust',
    priority: 85,
    rationale: "Rust's error handling model makes failures explicit and forces handling.",
    examples: {
      good: ['fn read_file(path: &str) -> Result<String, io::Error> { ... }'],
      bad: ['fn read_file(path: &str) -> String { ... } // panics on error'],
    },
    tags: ['rust', 'error-handling'],
  },
  {
    name: 'rust-clippy',
    content:
      'Run clippy regularly and address its warnings. It catches common mistakes and suggests improvements.',
    category: 'rust',
    priority: 75,
    rationale: 'Clippy provides expert-level linting that improves code quality.',
    examples: {
      good: ['cargo clippy -- -W clippy::all'],
      bad: ['Ignoring clippy warnings'],
    },
    tags: ['rust', 'linting'],
  },
];

/**
 * Go guidelines
 */
export const GO_GUIDELINES: GuidelineTemplate[] = [
  {
    name: 'go-error-checking',
    content: 'Always check error returns. Go functions commonly return (value, error) tuples.',
    category: 'go',
    priority: 90,
    rationale: 'Ignoring errors leads to silent failures and data corruption.',
    examples: {
      good: ['result, err := doSomething(); if err != nil { return err }'],
      bad: ['result, _ := doSomething() // ignoring error'],
    },
    tags: ['go', 'error-handling'],
  },
  {
    name: 'go-formatting',
    content: 'Run gofmt or goimports on all code. Go has a standard formatting style.',
    category: 'go',
    priority: 70,
    rationale: 'Standard formatting eliminates style debates and improves readability.',
    examples: {
      good: ['gofmt -w .'],
      bad: ['Inconsistent formatting across files'],
    },
    tags: ['go', 'formatting'],
  },
];

/**
 * Map of tech stack names to their guidelines
 */
export const GUIDELINE_MAP: Record<string, GuidelineTemplate[]> = {
  TypeScript: TYPESCRIPT_GUIDELINES,
  JavaScript: [...GENERAL_GUIDELINES], // JS gets general guidelines
  React: REACT_GUIDELINES,
  'Node.js': NODEJS_GUIDELINES,
  Python: PYTHON_GUIDELINES,
  Rust: RUST_GUIDELINES,
  Go: GO_GUIDELINES,
  // Frameworks that imply certain guidelines
  'Next.js': [...REACT_GUIDELINES],
  Vue: [...GENERAL_GUIDELINES],
  Angular: [...TYPESCRIPT_GUIDELINES, ...GENERAL_GUIDELINES],
  Express: NODEJS_GUIDELINES,
  Fastify: NODEJS_GUIDELINES,
  NestJS: [...NODEJS_GUIDELINES, ...TYPESCRIPT_GUIDELINES],
};

/**
 * Get all guideline templates for a list of tech stack items
 */
export function getGuidelinesForTechStackNames(names: string[]): GuidelineTemplate[] {
  const seen = new Set<string>();
  const guidelines: GuidelineTemplate[] = [];

  // Always include general guidelines
  for (const g of GENERAL_GUIDELINES) {
    if (!seen.has(g.name)) {
      seen.add(g.name);
      guidelines.push(g);
    }
  }

  // Add tech-specific guidelines
  for (const name of names) {
    const techGuidelines = GUIDELINE_MAP[name];
    if (techGuidelines) {
      for (const g of techGuidelines) {
        if (!seen.has(g.name)) {
          seen.add(g.name);
          guidelines.push(g);
        }
      }
    }
  }

  // Sort by priority (highest first)
  guidelines.sort((a, b) => b.priority - a.priority);

  return guidelines;
}
