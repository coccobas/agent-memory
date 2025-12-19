# Docker Setup

## Build & Run

```bash
docker compose up --build
```

## Data Persistence

The container uses `/data` for storage. `docker-compose.yml` binds host `~/.agent-memory` to `/data`.

To override:

```bash
export AGENT_MEMORY_DATA_DIR=/absolute/host/path
```

Then:

```bash
docker compose up --build
```

## Environment

Non-path settings can be set in `.env` and are loaded via `env_file`.

## Notes

- The container forces `AGENT_MEMORY_DB_PATH=/data/memory.db` and `AGENT_MEMORY_VECTOR_DB_PATH=/data/vectors.lance`.
- REST is disabled by default; enable via env vars.
