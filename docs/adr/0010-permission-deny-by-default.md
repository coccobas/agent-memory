# ADR-0010: Permission Deny-by-Default

## Status

Accepted

## Context

Multi-agent systems require access control to prevent unauthorized modifications:

- Agents should only modify entries they have permission for
- Production environments need strict access control
- Development environments need flexibility for testing

Without explicit permissions, any agent could modify any entry, creating security and data integrity risks.

## Decision

Implement deny-by-default permission model with configurable modes:

**Permission Levels:**

- `read`: View entries
- `write`: Create and update entries
- `delete`: Remove entries (implies write)
- `admin`: Grant permissions to others

**Permission Modes (via `AGENT_MEMORY_PERMISSIONS_MODE`):**

- `strict` (default): All operations require explicit permission grants
- `permissive`: All operations allowed without permission checks

**Implementation:**

- `PermissionService.check()` validates single operations
- `PermissionService.checkBatch()` validates bulk operations efficiently
- Permission grants stored in `permissions` table with agent/scope/entryType
- Cache layer (optional) for high-frequency permission checks

**Fail-Fast Behavior:**

- Bulk operations check all permissions before any modification
- First denied permission throws immediately
- No partial execution of bulk operations

## Consequences

**Positive:**

- Secure by default (deny-by-default)
- Flexible development mode (permissive)
- Efficient batch checking for bulk operations
- Granular control per agent/scope/entry type

**Negative:**

- Requires admin setup before agents can write (in strict mode)
- Additional latency for permission checks
- Complexity in permission grant management

## References

- Code location: `src/services/permission.service.ts`
- Batch checking: `checkBatch()` at line 393
- Factory integration: `src/mcp/handlers/factory.ts` (`requirePermissionBatch`)
- Security fixes: `SECURITY-FIXES.md` (CRIT-002)
