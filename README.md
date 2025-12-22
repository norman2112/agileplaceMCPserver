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

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables in `config.env`:
```env
# AgilePlace Configuration
AGILEPLACE_URL=https://your-instance.leankit.com/io
AGILEPLACE_TOKEN=your-token-here
AGILEPLACE_BOARD_ID=your-board-id

# OKR Configuration
OKR_BASE_URL=https://api-us.okrs.planview.com
OKR_CLIENT_ID=your-oauth2-client-id
OKR_CLIENT_SECRET=your-oauth2-client-secret
OKR_DEFAULT_LIMIT=200
OKR_FETCH_TIMEOUT_MS=25000
```

3. Run the server:
```bash
node server.mjs
```

## OKR Authentication

The OKR integration uses OAuth2 client credentials flow:
1. Client ID and Secret are exchanged for an access token
2. Tokens are cached and automatically refreshed when expired
3. Tokens are valid for 1 hour and refreshed 5 minutes before expiry
4. Automatic retry on 401 errors with fresh token

## Available Tools

### AgilePlace Tools
- `listCardTypes` - List available card types for a board
- `batchCreateCards` - Create one or more cards
- `batchCreateConnectedCards` - Create parent-child card relationships
- `createEpicHierarchy` - Create Epic → Features → Stories hierarchy
- `listCards` - List cards on a board
- `updateCard` - Update card properties
- `connectExistingCards` - Connect existing cards
- `getCardIds` - Get simple list of card IDs and titles

### OKR Tools
- `okr_listObjectives` - List objectives with pagination (limit, offset)
- `okr_getKeyResults` - Get key results for a specific objective ID

### Utility Tools
- `checkHealth` - Check server health and configuration status

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

