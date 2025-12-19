# MDAP Support

Agent Memory supports large-scale, multi-agent workflows (sometimes called MDAP-style workloads) via:

- Hierarchical scopes and inheritance
- Conflict detection and audit logging
- Bulk operations and caching
- Optional semantic search for retrieval

For best results in large deployments:

- Use explicit project and session scopes
- Enable permissions and rate limiting
- Monitor health via `memory_health` or REST `/health`
