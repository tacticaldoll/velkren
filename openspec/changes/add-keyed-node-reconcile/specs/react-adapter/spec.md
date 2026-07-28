## ADDED Requirements

### Requirement: Keyed child reconciliation via React's own reconciler

When a node's children array is fully keyed (every child carries a non-blank `key`), the adapter SHALL use each child's own `key` as its React reconciliation key. When the array is not fully keyed — including today's fully-unkeyed lists, and a mixed list only reachable by committing a `RenderNode` directly rather than through template authoring — every child SHALL use its positional index instead, never mixing a real key with a synthesized one. The adapter MUST NOT implement its own child-reconciliation algorithm for this: passing the real key into React's element tree when the list is fully keyed is sufficient for React's existing reconciler to preserve a keyed child's DOM element across an insert, remove, or reorder on a subsequent commit.

#### Scenario: A keyed list reorders without losing element identity

- **WHEN** a children array where every child carries a `key` is committed again with the same keys in a different order
- **THEN** each key's DOM element is the same node as before the commit, now in the new order

#### Scenario: An unkeyed list is unaffected

- **WHEN** a children array with no `key` on any child is committed again in a different order
- **THEN** reconciliation proceeds by positional index exactly as before this requirement

#### Scenario: A partially-keyed list still renders every child

- **WHEN** a children array where only some children carry a `key` is committed (reachable only by committing a `RenderNode` directly, since template authoring rejects this shape)
- **THEN** every child still renders, reconciled by positional index rather than mixing a real key with a synthesized one
