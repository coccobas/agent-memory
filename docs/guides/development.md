# Development Guide

## Prerequisites

- Node.js >= 20
- npm

## Setup

```bash
npm install
npm run build
```

## Run

```bash
npm run dev
```

## Validate

```bash
npm run validate
```

## Docs lint

```bash
brew install vale
npm run docs:lint
```

## Common Commands

- `npm run lint`
- `npm run format:check`
- `npm run typecheck`
- `npm run test:run`

## Local Data

By default, data is stored in `<repo>/data`. Override with:

```bash
export AGENT_MEMORY_DATA_DIR=~/.agent-memory/data
```
