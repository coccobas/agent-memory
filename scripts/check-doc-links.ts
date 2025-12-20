#!/usr/bin/env tsx
/**
 * Lightweight internal docs link checker (no extra deps).
 *
 * Checks relative links in README.md and Markdown files under docs/:
 * - linked files exist
 * - markdown heading anchors exist (best-effort GitHub-style slugs)
 */

import fs from 'node:fs';
import path from 'node:path';

type LinkError = { file: string; link: string; message: string };

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === 'dist') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function isMarkdown(pathname: string): boolean {
  return pathname.toLowerCase().endsWith('.md');
}

function stripCodeFences(lines: string[]): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out;
}

function githubSlug(raw: string, existing: Map<string, number>): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '') // strip HTML
    .replace(/[`*_~]/g, '') // markdown decorations
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // remove punctuation
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const count = existing.get(base) ?? 0;
  existing.set(base, count + 1);
  if (count === 0) return base;
  return `${base}-${count}`;
}

function extractAnchors(markdown: string): Set<string> {
  const slugs = new Set<string>();
  const seen = new Map<string, number>();
  const lines = stripCodeFences(markdown.replace(/\r\n/g, '\n').split('\n'));
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!m) continue;
    const heading = m[2] ?? '';
    if (!heading.trim()) continue;
    slugs.add(githubSlug(heading, seen));
  }
  return slugs;
}

function extractLinks(markdown: string): string[] {
  const links: string[] = [];
  // Basic markdown link pattern; intentionally ignores reference-style links.
  const re = /(^|[^!])\[[^\]]*]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const href = (match[2] ?? '').trim();
    if (!href) continue;
    links.push(href);
  }
  return links;
}

function normalizeHref(href: string): { target: string; anchor?: string } | null {
  const trimmed = href.trim();
  if (!trimmed) return null;

  const noTitle = trimmed.replace(/\s+\".*\"$/, '').replace(/\s+\'.*\'$/, '');
  if (
    noTitle.startsWith('http://') ||
    noTitle.startsWith('https://') ||
    noTitle.startsWith('mailto:') ||
    noTitle.startsWith('#')
  ) {
    return null;
  }

  const [targetRaw, anchorRaw] = noTitle.split('#');
  const target = decodeURIComponent(targetRaw);
  const anchor = anchorRaw ? decodeURIComponent(anchorRaw) : undefined;
  return { target, anchor };
}

function main(): void {
  const repoRoot = process.cwd();
  const candidates = [
    path.join(repoRoot, 'README.md'),
    ...walk(path.join(repoRoot, 'docs')).filter(isMarkdown),
  ].filter((p) => fs.existsSync(p));

  const anchorCache = new Map<string, Set<string>>();
  const errors: LinkError[] = [];

  for (const filePath of candidates) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const links = extractLinks(raw);
    for (const href of links) {
      const parsed = normalizeHref(href);
      if (!parsed) continue;

      // Skip pure query params (rare in docs)
      if (!parsed.target || parsed.target.startsWith('?')) continue;

      const resolved = path.resolve(path.dirname(filePath), parsed.target);
      if (!fs.existsSync(resolved)) {
        errors.push({
          file: path.relative(repoRoot, filePath),
          link: href,
          message: `Target not found: ${path.relative(repoRoot, resolved)}`,
        });
        continue;
      }

      if (parsed.anchor && isMarkdown(resolved)) {
        let anchors = anchorCache.get(resolved);
        if (!anchors) {
          anchors = extractAnchors(fs.readFileSync(resolved, 'utf8'));
          anchorCache.set(resolved, anchors);
        }
        if (parsed.anchor && !anchors.has(parsed.anchor)) {
          errors.push({
            file: path.relative(repoRoot, filePath),
            link: href,
            message: `Anchor not found: #${parsed.anchor} in ${path.relative(repoRoot, resolved)}`,
          });
        }
      }
    }
  }

  if (errors.length) {
    for (const e of errors) {
      process.stderr.write(`${e.file}: ${e.message} (link: ${e.link})\n`);
    }
    process.stderr.write(`Found ${errors.length} broken doc link(s)\n`);
    process.exit(1);
  }

  process.stdout.write('Docs links OK\n');
}

main();
