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
      "args": ["/path/to/server.mjs"],
      "env": {
        "AGILEPLACE_URL": "https://your-instance.leankit.com/io",
        "AGILEPLACE_TOKEN": "your-api-token",
        "AGILEPLACE_BOARD_ID": "default-board-id",
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

## Tools

### Boards

| Tool | Description |
|------|-------------|
| `createBoard` | Create a new board |
| `listBoards` | List boards with optional search/filter |
| `archiveBoard` | Archive a board |
| `batchArchiveBoards` | Archive multiple boards |
| `updateBoard` | Update board settings (title, defaults, WIP, sharing) |
| `updateBoardLayout` | Update full lane layout |
| `getBoardCustomFields` | Get custom field config |
| `updateBoardCustomFields` | Update custom field config |
| `exportBoardHistory` | Export board history as CSV (movements, events, who/when/what) |

### Cards

| Tool | Description |
|------|-------------|
| `batchCreateCards` | Create one or more cards (supports types, headers, dates, dry run) |
| `batchCreateConnectedCards` | Create parent + children and connect them |
| `getCard` | Get card by ID |
| `getCardCustomFields` | Get card custom field values + board metadata |
| `listCards` | List cards on a board |
| `listCardIds` | Lightweight card ID + title listing |
| `setCardCustomFields` | Set custom field values on a card |
| `updateCard` | Update a single card |
| `batchUpdateCards` | Different updates per card (max 50, parallel) |
| `bulkUpdateCards` | Same JSON Patch update applied to many cards |
| `moveCardToLane` | Move card to a different lane |
| `deleteCard` | Delete a card |
| `batchDeleteCards` | Delete multiple cards |
| `assignUsersToCards` | Assign users to cards |

### Card Types

| Tool | Description |
|------|-------------|
| `listCardTypes` | List card types for a board |
| `createCardType` | Create a card/task type |
| `updateCardType` | Update card type (name, color, flags) |
| `deleteCardType` | Delete a card type |
| `batchCreateCardTypes` | Create multiple card types |
| `batchDeleteCardTypes` | Delete multiple card types |
| `setupCardTypes` | Full card type setup in one call |

### Tags

| Tool | Description |
|------|-------------|
| `addCardTags` | Add tags to a card |
| `removeCardTags` | Remove tags from a card |
| `setCardTags` | Replace all tags on a card |
| `batchAddCardTags` | Add tags to multiple cards |

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

| Tool | Description |
|------|-------------|
| `listLanes` | List lanes (ID, title, WIP, status, parent) |
| `addLane` | Add a new lane |
| `updateLane` | Update lane properties |
| `removeLane` | Remove a lane |
| `resizeLane` | Change lane column width |
| `moveLane` | Move a lane to a new position/parent |
| `cloneBoardLayout` | Replace board layout from a snapshot |

### Relationships & Dependencies

| Tool | Description |
|------|-------------|
| `connectExistingCards` | Create parent-child connections |
| `get_card_relationships` | Full relationship map for a card |
| `getCardChildren` | Get child cards |
| `deleteCardConnections` | Delete parent/child connections |
| `create_card_dependency` | Create a dependency |
| `updateCardDependency` | Update a dependency |
| `deleteCardDependency` | Delete a dependency |

### Hierarchy

| Tool | Description |
|------|-------------|
| `createEpicHierarchy` | Create Epic → Features → Stories in one call (supports dry run) |

### Planning (PI / Increments)

| Tool | Description |
|------|-------------|
| `listPlanningSeries` | List planning series |
| `createPlanningSeries` | Create a planning series |
| `getPlanningSeries` | Get a planning series by ID |
| `updatePlanningSeries` | Update a planning series |
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
| `listUsers` | List workspace users |
| `getUser` | Get user by ID |

### OKRs

| Tool | Description |
|------|-------------|
| `okrListObjectives` | List objectives with pagination |
| `okrGetKeyResults` | Get key results for an objective |

### Utility

| Tool | Description |
|------|-------------|
| `checkHealth` | Server health and config check |

## OKR Authentication

The OKR integration uses OAuth2 client credentials. Generate credentials in **Planview Admin → Settings → OAuth2 credentials**, select **OKRs Integration** as the application, and store the Client ID and Secret securely. The server handles token exchange, caching, and refresh automatically.

## Configuration

### AgilePlace

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CARDS` | 15 | Max cards per batch operation |
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