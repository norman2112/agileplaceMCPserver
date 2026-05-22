# NCCI session workflows (canonical patterns)

Patterns from the NCCI demo retrospective. Use with AgilePlace MCP tools in `src/tools/`.

## Demo data seed (rename → archive → create)

1. **Rename** existing showcase cards with `batchUpdateCards` (use `dryRun: true` first).
2. **Archive** or delete leftovers with `batchDeleteCards` / board tools — avoid orphaning integration-linked cards.
3. **Create** net-new cards only when needed via `batchCreateCards` (respect `MAX_CARDS` per call).

## PI planning bootstrap

Prefer **`bootstrapPlanningIncrement`** (series + PI parent + N child iterations) over manual increment loops.

1. `createPlanningSeries` with initial `boardIds`.
2. `addBoardsToPlanningSeries` to append team boards (do not rely on partial `updatePlanningSeries` boardIds).
3. `bootstrapPlanningIncrement` for PI + sprints.
4. `assignLaneCardsToIncrement` or `bulkAssignCardsToIncrement` for card assignment.

## Cross-board hierarchy

- **`connectExistingCards`** and **`linkHierarchy`** work cross-board.
- Verify with **`listCardChildren`** (includes `boardId` / `boardTitle`).
- **`searchCards`** to find cards by title across boards.

## Lane moves at scale

- Resolve lanes with **`findLane`** / **`moveCardToLaneByName`** when IDs go stale after board edits.
- Use **`wipOverrideReason`** on **`moveCardToLane`** / **`bulkMoveCardsToLane`** when WIP limits block moves.
- **`distributeCardsAcrossLanes`** for percentage spreads across swimlanes.

## Tags

Run **`listTagsOnBoard`** before applying a taxonomy (`vs:`, `pillar:`, etc.) to avoid typos.

## Tool discovery

Call **`listToolCatalog`** for grouped tool names and batch vs bulk conventions.
