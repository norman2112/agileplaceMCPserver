# AgilePlace & OKR MCP Server

An MCP (Model Context Protocol) server that provides tools for interacting with AgilePlace boards and Planview OKR (Objectives and Key Results) APIs.

## Features

### AgilePlace Integration
- List card types
- Batch create cards
- Create connected cards (parent-child relationships)
- Create Epic hierarchies (Epic → Features → Stories)
- List cards on boards
- Update cards
- Connect existing cards

### OKR Integration
- List objectives with pagination
- Get key results for specific objectives
- Automatic OAuth2 token management with caching and refresh

## Prerequisites

- **Node.js** (version 18 or higher recommended)
  - macOS/Linux: Install via [Homebrew](https://brew.sh/) or [nvm](https://github.com/nvm-sh/nvm)
  - Windows: Download from [nodejs.org](https://nodejs.org/) or use [nvm-windows](https://github.com/coreybutler/nvm-windows)
  - Verify installation: `node --version` and `npm --version`

- **npm** (comes with Node.js, but verify: `npm --version`)

## Setup

1. Install dependencies:
```bash
npm install
```

**Note:** This command works on both macOS/Linux (Terminal) and Windows (CMD/PowerShell). The dependencies will be installed in the `node_modules/` directory.

2. Configure environment variables in Claude Desktop config (recommended) or in your shell environment.

3. Run the server (reads from Claude Desktop config by default):
```bash
node server.mjs
```

## Claude Desktop Configuration

To use this MCP server with Claude Desktop, add it to your Claude Desktop configuration file.

### macOS Configuration

Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agileplace": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/your/demo/server.mjs"],
      "env": {
        "AGILEPLACE_URL": "https://your-instance.leankit.com/io",
        "AGILEPLACE_TOKEN": "your-token-here",
        "AGILEPLACE_BOARD_ID": "your-board-id",
        "OKR_BASE_URL": "https://api-us.okrs.planview.com",
        "OKR_CLIENT_ID": "your-oauth2-client-id",
        "OKR_CLIENT_SECRET": "your-oauth2-client-secret",
        "OKR_DEFAULT_LIMIT": "200",
        "OKR_FETCH_TIMEOUT_MS": "25000"
      }
    }
  }
}
```

**Note:** If you installed Node.js via Homebrew, the path is typically `/opt/homebrew/bin/node` (Apple Silicon) or `/usr/local/bin/node` (Intel). Use `which node` to find your Node.js path.

### Windows Configuration

Location: `%APPDATA%\Claude\claude_desktop_config.json`  
(Full path: `C:\Users\<YourUsername>\AppData\Roaming\Claude\claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "agileplace": {
      "command": "node",
      "args": ["C:\\path\\to\\your\\demo\\server.mjs"],
      "env": {
        "AGILEPLACE_URL": "https://your-instance.leankit.com/io",
        "AGILEPLACE_TOKEN": "your-token-here",
        "AGILEPLACE_BOARD_ID": "your-board-id",
        "OKR_BASE_URL": "https://api-us.okrs.planview.com",
        "OKR_CLIENT_ID": "your-oauth2-client-id",
        "OKR_CLIENT_SECRET": "your-oauth2-client-secret",
        "OKR_DEFAULT_LIMIT": "200",
        "OKR_FETCH_TIMEOUT_MS": "25000"
      }
    }
  }
}
```

**Note:** On Windows, use double backslashes (`\\`) in file paths, or forward slashes (`/`). Ensure Node.js is in your system PATH, or use the full path to `node.exe`.

### Configuration Notes

- Replace `/path/to/your/demo/server.mjs` with the actual path to your `server.mjs` file
- The server reads from Claude Desktop config `mcpServers.<server>.env` by default
- Explicit environment variables take precedence over values in the config JSON
- You can override the config path with `CLAUDE_DESKTOP_CONFIG_PATH`
- If you have multiple `mcpServers` entries, you can force which one is used with `CLAUDE_MCP_SERVER_KEY`
- Restart Claude Desktop after modifying the configuration file

## OKR Authentication

The OKR integration uses OAuth2 client credentials flow. You need to generate OAuth2 credentials in Planview Admin before using the OKR tools.

### Generating a Bearer Token

To generate OAuth2 credentials for OKR API access:

1. In **Planview Admin**, on the **Settings** screen, click the **OAuth2 credentials** tab.
2. Click **Create OAuth2 credentials**.
3. Enter a **Name** for the credential.
4. Click the **Application** list and select **OKRs Integration**.
5. Click **Create OAuth2 credentials**.
6. Copy the **Client ID** and **Client Secret** and store them in a secure location. You can click the icons to the right of each field to copy them to your clipboard.

   ⚠️ **WARNING**: For security reasons, you cannot view the client secret after you click Close. If your credentials are not secure, your account can be vulnerable to unexpected or malicious actors.

7. Click **Close**.

### How It Works

Once you have the OAuth2 credentials:
1. The server automatically exchanges Client ID and Secret for an access token
2. Tokens are cached and automatically refreshed when expired
3. Tokens are valid for 1 hour and refreshed 5 minutes before expiry
4. Automatic retry on 401 errors with fresh token

Add the credentials to your Claude Desktop configuration (see Configuration sections above).

## Available Tools

### AgilePlace Boards

- **createBoard**: Create a new board (title, optional description/level/custom URL).
- **listBoards**: List boards (optional search, board ID filters, limit).
- **archiveBoard**: Archive a single board.
- **batchArchiveBoards**: Archive multiple boards with per-board success/failure.
- **updateBoard**: Update board-level settings (defaults, WIP/sharing, URL, level, etc.).
- **updateBoardLayout**: Update full lane layout for a board.
- **getBoardCustomFields**: Get custom fields configuration for a board.
- **updateBoardCustomFields**: Update custom fields configuration for a board.

### AgilePlace Cards

- **batchCreateCards**: Create one or more cards on a board (supports card types, headers, dates, dry run).
- **batchCreateConnectedCards**: Create a parent card plus multiple children and connect them.
- **getCard**: Get a single card by ID with a simplified summary plus full JSON.
- **listCards**: List cards on a board (optional `includeChildren`, `boardId`).
- **updateCard**: Update title, description, dates, header, card type, or priority for a card.
- **batchUpdateCards**: Different updates per card (parallel PATCH; max 50).
- **bulkUpdateCards**: Apply the same JSON Patch updates to many cards (native bulk API).
- **moveCardToLane**: Move a card to a different lane.
- **deleteCard**: Delete a single card.
- **batchDeleteCards**: Delete multiple cards in one call.
- **assignUsersToCards**: Assign one or more users to one or more cards.
- **listCardIds**: List simple card IDs and titles (plus tags) for a board.

### Card Types

- **listCardTypes**: List card types for a board (IDs and names).
- **createCardType**: Create a card or task type on a board.
- **updateCardType**: Partially update a card type (name, color, flags).
- **deleteCardType**: Delete a card type.
- **batchCreateCardTypes**: Create multiple card types in one call.
- **batchDeleteCardTypes**: Delete multiple card types (skips default card/task types).

### Tags

- **addCardTags**: Add tags to a single card.
- **removeCardTags**: Remove tags from a single card.
- **setCardTags**: Replace all tags on a card.
- **batchAddCardTags**: Add tags to multiple cards with per-card results.

### Comments

- **createCardComment**: Create a comment on a card.
- **listCardComments**: List comments for a card.
- **updateCardComment**: Update an existing comment.
- **deleteCardComment**: Delete a comment from a card.
- **batchCreateComments**: Create comments on multiple cards in parallel and return per-comment success/failure.

### Lanes & Layout

- **listLanes**: List lanes for a board (id, title, WIP, status, parent, etc.).
- **updateLane**: Update lane properties (title, description, WIP, status).
- **moveLaneWithinParent**: Reorder a lane within its parent.
- **moveLaneToNewParent**: Move a lane under a new parent.
- **setLaneClassType**: Normalize lane classType/cardStatus based on usage.
- **rebuildBoardLayoutFromLanes**: Normalize and rebuild board lane layout.

### Relationships & Dependencies

- **connectExistingCards**: Connect existing cards as parent/child.
- **get_card_relationships**: Full relationships for a card (dependencies, parents, children).
- **getCardChildren**: Lightweight child lookup for a card.
- **deleteCardConnections**: Delete parent/child connections for cards.
- **create_card_dependency**: Create a dependency between cards.
- **updateCardDependency**: Update an existing dependency (native API payload).
- **deleteCardDependency**: Delete a dependency (native API payload).

### Hierarchy

- **createEpicHierarchy**: Create an Epic → Features → Stories hierarchy, with optional dry run.

### Planning (PI / Increments)

- **listPlanningSeries**: List planning series (PIs) in the workspace.
- **createPlanningSeries**: Create a planning series (payload passed through).
- **getPlanningSeries**: Get a planning series by ID.
- **updatePlanningSeries**: Update a planning series (PATCH).
- **deletePlanningSeries**: Delete a planning series.
- **createPlanningIncrement**: Create an increment within a planning series.
- **listPlanningIncrements**: List increments for a planning series.
- **updatePlanningIncrement**: Update an increment in a planning series.
- **deletePlanningIncrement**: Delete an increment from a planning series.
- **getPlanningIncrementStatus**: Get status for a planning increment, optionally filtered by category.

### Reporting & Analytics

- **getBoardThroughputReport**: Throughput report for a board.
- **getBoardWipReport**: WIP report for a board.
- **getLaneBottleneckReport**: Lane bottleneck report for a board.
- **getCardStatistics**: Statistics for a card (cycle/lead time, etc.).
- **getCardActivity**: Activity history for a card.

### Users

- **getCurrentUser**: Get the current AgilePlace user.
- **listUsers**: List users in the workspace.
- **getUser**: Get a single user by ID.

### OKR Tools

- **okrListObjectives**: List objectives with pagination and optional scope filter.
- **okrGetKeyResults**: List key results for a specific objective ID.

### Utility & Health

- **checkHealth**: Check MCP server configuration and health (AgilePlace + OKR + limits).

## Configuration Options

### AgilePlace
- `MAX_CARDS` - Maximum cards to process in batch operations (default: 15)
- `MAX_DESC` - Maximum description length (default: 800)
- `FETCH_TIMEOUT_MS` - HTTP request timeout (default: 25000)
- `STORY_LIMIT` - Maximum stories per feature in Epic hierarchy (default: 5)
- `PORT` - Health check server port (default: 3333)

### OKR
- `OKR_DEFAULT_LIMIT` - Default pagination limit (default: 200, max: 500)
- `OKR_FETCH_TIMEOUT_MS` - OKR API timeout (default: 25000)

## Health Check

The server includes a health check endpoint at `http://localhost:3333/health` (if enabled) and a `checkHealth` MCP tool to verify configuration and status.

## License

See LICENSE file for details.

