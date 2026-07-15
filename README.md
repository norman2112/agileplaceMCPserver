# AgilePlace MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io/) server for [Planview AgilePlace](https://www.planview.com/products/agileplace/) and Planview OKRs. Provides 80+ tools for managing boards, cards, attachments, automations, scoring (WSJF), hierarchies, dependencies, planning increments, and OKR objectives directly from Claude Desktop or any MCP-compatible client.

## Quick Start

```bash
npm install
```

Add to your Claude Desktop config:

**macOS** — `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows** — `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agileplace": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/agileplaceMCPdemo/src/server.mjs"],
      "env": {
        "AGILEPLACE_DEFAULT_URL": "https://your-instance.leankit.com/io",
        "AGILEPLACE_DEFAULT_TOKEN": "your-api-token",
        "OKR_BASE_URL": "https://api-us.okrs.planview.com",
        "OKR_CLIENT_ID": "your-oauth2-client-id",
        "OKR_CLIENT_SECRET": "your-oauth2-client-secret"
      }
    }
  }
}
```

> **Node path:** Use `which node` to find yours. Homebrew on Apple Silicon installs to `/opt/homebrew/bin/node`. On Windows, use `node` (must be in PATH) or the full path to `node.exe`. Use `\\` or `/` for Windows paths in `args`.

Restart Claude Desktop after saving.

`default` is the canonical account alias for `AGILEPLACE_DEFAULT_URL` / `AGILEPLACE_DEFAULT_TOKEN`. Use `default` in tool calls unless you configure additional account aliases.

## Tools

### Boards

| Tool | Description |
|------|-------------|
| `createBoard` | Create a new board |
| `listBoards` | List boards with optional search/filter |
| `archiveBoard` | Archive a board |
| `unarchiveBoard` | Restore an archived board |
| `batchArchiveBoards` | Archive multiple boards |
| `updateBoard` | Update board settings (title, defaults, WIP, sharing) |
| `updateBoardLayout` | Update full lane layout |
| `getBoardCustomFields` | Get custom field config |
| `updateBoardCustomFields` | Update custom field config using JSON Patch array |
| `createBoardCustomField` | Create one board custom field (helper) |
| `createBoardCustomFields` | Create multiple board custom fields (helper) |
| `patchBoardCustomField` | Update one board custom field by field ID (helper) |
| `deleteBoardCustomField` | Delete one board custom field by field ID (helper) |
| `exportBoardHistory` | Export board history as CSV (movements, events, who/when/what) |

### Cards

| Tool | Description |
|------|-------------|
| `batchCreateCards` | Create cards (per-card or batch `laneId`, cap from env; dry run) |
| `batchCreateConnectedCards` | Create parent + children and connect them |
| `getCard` | Get card by ID |
| `getCardCustomFields` | Get card custom field values + board metadata |
| `listCards` | List cards on a board |
| `listCardIds` | Lightweight card ID + title listing |
| `setCardCustomFields` | Set custom field values on a card |
| `updateCard` | Update a single card |
| `batchUpdateCards` | Different updates per card (max 50; dry run; re-fetched summaries) |
| `bulkUpdateCards` | Same JSON Patch update applied to many cards |
| `moveCardToLane` | Move one card to a lane (preferred over bulk JSON Patch for lane-only moves) |
| `bulkMoveCardsToLane` | Move many cards to the same lane (WIP override, lane by name, atomic mode) |
| `moveCardToLaneByName` | Move card using lane title + boardId |
| `searchCards` | Search titles/customId across boards |
| `changeCardType` | Re-type a card |
| `distributeCardsAcrossLanes` | Spread cards by % across lanes |
| `assignLaneCardsToIncrement` | Assign all cards in a lane to an increment |
| `deleteCard` | Delete a card |
| `batchDeleteCards` | Delete multiple cards |
| `assignUsersToCards` | Assign users to cards |

### Card Types

Use **`updateCardType`** to rename or recolor an existing type in place (same type ID; cards on that type are unchanged). That matches how **`updateLane`** works for lanes. Avoid delete-and-recreate or a full **`setupCardTypes`** pass when you only need a color or label tweak.

| Tool | Description |
|------|-------------|
| `listCardTypes` | List card types for a board |
| `createCardType` | Create a card/task type |
| `updateCardType` | Patch one card type (name, colorHex, isCardType, isTaskType) without new IDs or card reassignment |
| `setDefaultCardType` | Set default card type by ID or name |
| `deleteCardType` | Delete a card type |
| `batchCreateCardTypes` | Create multiple card types |
| `batchDeleteCardTypes` | Delete multiple card types (supports forced default reassignment) |
| `setupCardTypes` | Full card type setup in one call (default can be existing or newly created type) |

### Tags

| Tool | Description |
|------|-------------|
| `listTagsOnBoard` | Distinct tags in use on a board |
| `addCardTags` | Add tags to a card |
| `removeCardTags` | Remove tags from a card |
| `setCardTags` | Replace all tags on a card |
| `batchAddCardTags` | Add tags to multiple cards |
| `batchRemoveCardTags` | Remove tags from multiple cards |

### Comments

| Tool | Description |
|------|-------------|
| `createCardComment` | Create a comment |
| `batchCreateComments` | Create comments on multiple cards in parallel |
| `listCardComments` | List comments for a card |
| `updateCardComment` | Update a comment |
| `deleteCardComment` | Delete a comment |

### Attachments

| Tool | Description |
|------|-------------|
| `listAttachments` | List attachments on a card (id, name, description, createdOn, createdBy) |
| `createAttachment` | Upload an attachment (multipart; fileContent + fileName, optional description) |
| `deleteAttachment` | Delete an attachment from a card |

### Automations

| Tool | Description |
|------|-------------|
| `listAutomations` | List automations for a board (id, description, enabled, events, filter, action) |
| `getAutomation` | Get full automation details (schedule, filter, action config) |
| `triggerBoardCustomEvent` | Trigger board automations for a custom event name (rate limited) |
| `triggerCardCustomEvent` | Trigger card-level automations for a custom event name |
| `getAutomationAudit` | Get last 20 audit records for an automation |

### Lanes & Layout

Use **`updateLane`** to rename or tweak one lane in place (PATCH lane properties; keeps lane ID and all cards). For card-level edits you use **`setCardCustomFields`** / **`bulkUpdateCards`**; **`updateLane`** is the same idea for lane metadata — avoid **`cloneBoardLayout`** for a simple rename (that replaces the entire layout and new lane IDs).

| Tool | Description |
|------|-------------|
| `listLanes` | List lanes (ID, title, WIP, status, parent) |
| `findLane` | Find lanes by title substring |
| `addLane` | Add a new lane |
| `updateLane` | Rename or update one lane (title, description, wipLimit, default drop, card status) without replacing layout |
| `removeLane` | Remove a lane |
| `resizeLane` | Change lane column width |
| `moveLane` | Move a lane to a new position/parent |
| `cloneBoardLayout` | Replace board layout from a snapshot (optional `dryRun` to preview normalization) |

### Relationships & Dependencies

| Tool | Description |
|------|-------------|
| `connectExistingCards` | Parent-child connections (cross-board supported) |
| `getCardRelationships` | Full relationship map for a card |
| `getCardChildren` / `listCardChildren` | Child cards with board context |
| `deleteCardConnections` | Delete parent/child connections |
| `createCardDependency` | Create a dependency |
| `updateCardDependency` | Update a dependency |
| `deleteCardDependency` | Delete a dependency |

### Hierarchy

| Tool | Description |
|------|-------------|
| `createEpicHierarchy` | Create Epic → Features → Stories in one call (supports dry run) |
| `linkHierarchy` | Connect existing initiative/epic/feature/story card IDs |

### Planning (PI / Increments)

| Tool | Description |
|------|-------------|
| `listPlanningSeries` | List planning series |
| `createPlanningSeries` | Create a planning series |
| `getPlanningSeries` | Get a planning series by ID |
| `updatePlanningSeries` | Update a planning series |
| `addBoardsToPlanningSeries` | Append boards to a series (merge boardIds) |
| `bootstrapPlanningIncrement` | Create PI parent + N child iterations |
| `deletePlanningSeries` | Delete a planning series |
| `createPlanningIncrement` | Create an increment |
| `listPlanningIncrements` | List increments |
| `updatePlanningIncrement` | Update an increment |
| `deletePlanningIncrement` | Delete an increment |
| `getPlanningIncrementStatus` | Get increment status |

### Reporting & Analytics

| Tool | Description |
|------|-------------|
| `getBoardThroughputReport` | Throughput report |
| `getBoardWipReport` | WIP report |
| `getLaneBottleneckReport` | Lane bottleneck report |
| `getCardStatistics` | Card cycle/lead time stats |
| `getCardActivity` | Card activity history |

### Card Scoring (WSJF)

| Tool | Description |
|------|-------------|
| `listScoringTemplates` | List scoring templates (WSJF, org, board-level; id, title, metrics) |
| `getBoardScoring` | Get current scoring session (active template + card scores) |
| `setScoringSession` | Set template and card list for scoring (cardIds are exclusive) |
| `updateCardScore` | Update staged score for a card (scoreTotal, scores per metric) |
| `applyScoringToCards` | Persist staged scores to cards on the board |
| `deleteCardScores` | Remove applied scores from cards |

### Users

| Tool | Description |
|------|-------------|
| `getCurrentUser` | Get current user |
| `listUsers` | List workspace users (admin) |
| `getUser` | Get user by ID (admin) |
| `createUser` | Create a user (admin) |
| `updateUser` | Update a user profile/permissions (admin; partial) |
| `deleteUser` | Permanently delete a user (admin) |
| `changeUserPassword` | Change a user's password (admin) |
| `updateCurrentUser` | Update requesting user's own profile (partial) |
| `getCurrentUserCards` | Cards assigned to or subscribed by current user |
| `getCurrentUserRecentBoards` | Favorite and recently accessed boards (max 10) |
| `getUsersInfo` | Batch basic info for up to 100 user IDs |
| `listBoardUsers` | List users and roles on a board |
| `updateBoardUserRoles` | Create/update board roles for multiple users |
| `addTeamUsers` | Add users to a team (max 100; not built-in teams) |
| `listTeamUsers` | List users assigned directly to a team |
| `removeTeamUsers` | Remove users from a team (max 10; not built-in teams) |
| `listInvitations` | List open user invitations (admin) |
| `revokeInvitation` | Revoke or un-revoke an invitation (admin) |

### OKRs

| Tool | Description |
|------|-------------|
| `okrListObjectives` | List objectives with pagination |
| `okrGetKeyResults` | Get key results for an objective |
| `okrCreateObjective` | Create an objective (write) |
| `okrUpdateObjective` | Update an objective (PATCH; typed fields) |
| `okrDeleteObjective` | Delete an objective (`confirm: true` required) |
| `okrCreateKeyResult` | Create a key result (write) |
| `okrUpdateKeyResult` | Update a key result (PATCH) |
| `okrDeleteKeyResult` | Delete a key result (`confirm: true` required) |
| `linkObjectiveToCard` | Link objective URL to card external link |

### Utility

| Tool | Description |
|------|-------------|
| `checkHealth` | Server health and config check |
| `listAccounts` | List configured account aliases |
| `listToolCatalog` | Tools grouped by category (batch vs bulk) |

See [docs/WORKFLOWS.md](docs/WORKFLOWS.md) for common demo/PI/hierarchy workflow patterns.

## Board Custom Fields Patch Format

`updateBoardCustomFields` expects `updates` as a non-empty JSON Patch array (RFC 6902). Each `add`/`replace` `value` object may only use keys accepted by the API: `label`, `helpText`, `type`, `index`, `choiceConfiguration`. Other keys (for example `iconName`) are rejected before the request is sent.

Example (add a text field):

```json
[
  {
    "op": "add",
    "path": "/",
    "value": {
      "label": "Submitter",
      "type": "text"
    }
  }
]
```

Example (add a choice field):

```json
[
  {
    "op": "add",
    "path": "/",
    "value": {
      "label": "Sentiment",
      "type": "choice",
      "choiceConfiguration": {
        "choices": ["Positive", "Neutral", "Negative", "N/A"]
      }
    }
  }
]
```

## OKR Authentication

The OKR integration uses OAuth2 client credentials. Generate credentials in **Planview Admin → Settings → OAuth2 credentials**, select **OKRs Integration** as the application, and store the Client ID and Secret securely. The server handles token exchange, caching, and refresh automatically.

## Configuration

### AgilePlace

| Variable | Default | Description |
|----------|---------|-------------|
| `AGILEPLACE_MAX_CARDS_PER_BATCH` | — | Preferred: max cards per `batchCreateCards` / related batch creates (default **15**, hard cap **200**) |
| `MAX_CARDS` | 15 | Legacy alias for the same limit if `AGILEPLACE_MAX_CARDS_PER_BATCH` is unset |
| `MAX_DESC` | 800 | Max description length |
| `FETCH_TIMEOUT_MS` | 25000 | HTTP request timeout (ms) |
| `STORY_LIMIT` | 5 | Max stories per feature in hierarchy |

### OKR

| Variable | Default | Description |
|----------|---------|-------------|
| `OKR_DEFAULT_LIMIT` | 200 | Default pagination limit (max 500) |
| `OKR_FETCH_TIMEOUT_MS` | 25000 | OKR API timeout (ms) |

## Config Resolution

The server reads environment variables from the Claude Desktop config file (`mcpServers.<key>.env`) by default. Explicit environment variables take precedence. Override the config path with `CLAUDE_DESKTOP_CONFIG_PATH` or force a specific server key with `CLAUDE_MCP_SERVER_KEY`.

## Requirements

- Node.js 18+
- An AgilePlace instance with API token
- (Optional) Planview OKR OAuth2 credentials

## License

See LICENSE for details.