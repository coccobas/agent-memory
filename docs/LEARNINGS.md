# Agent Learnings

Insights extracted from debugging sessions that should inform future behavior.

---

## 2026-02-02: Use Playwright First for UI/Visual Bugs

**Context:** Debugging a backwards drag-and-drop animation in a Kanban board (dnd-kit).

**What happened:**

- Made 5+ speculative code fixes based on reading code and guessing at the cause
- Tried: `transition-all` removal, `animateLayoutChanges` configs, `dropAnimation` settings, `MeasuringStrategy` changes
- None were verified to work - kept asking user "does it work now?"

**What changed:**

- Finally used Playwright to observe actual browser behavior
- Could see: DOM state changes, task counts in columns, dnd-kit status messages
- Captured screenshots at precise moments during drag animation
- Verified that drag events fired correctly and tasks moved between columns

**The learning:**

> **For UI/visual/animation bugs, ALWAYS use Playwright browser automation FIRST before making code changes.**

**Why:**

| Without Playwright       | With Playwright                     |
| ------------------------ | ----------------------------------- |
| Speculative fixes        | Verified behavior                   |
| No confirmation          | DOM snapshots show actual state     |
| Guessing at cause        | See what user sees                  |
| Multiple failed attempts | Targeted fixes based on observation |

**Core insight:**
UI bugs require **observability**, not just code analysis. Playwright provides eyes into the running application - you see what the user sees, not what the code says should happen.

**Tags:** `debugging`, `ui`, `playwright`, `frontend`, `visual-bugs`, `dnd-kit`, `animation`

---
