## ADDED Requirements

### Requirement: Keyed child reconciliation via Vue's own reconciler

When building a node's children, the adapter SHALL use a child's own `key` (when present) as that child's Vue vnode key, falling back to its positional index only when the child carries no `key`. The adapter MUST NOT implement its own child-reconciliation algorithm for this: passing the real key into the vnode tree is sufficient for Vue's existing `render`/patch reconciler to preserve a keyed child's DOM element across an insert, remove, or reorder on a subsequent commit.

#### Scenario: A keyed list reorders without losing element identity

- **WHEN** a children array where every child carries a `key` is committed again with the same keys in a different order
- **THEN** each key's DOM element is the same node as before the commit, now in the new order

#### Scenario: An unkeyed list is unaffected

- **WHEN** a children array with no `key` on any child is committed again in a different order
- **THEN** reconciliation proceeds by positional index exactly as before this requirement
