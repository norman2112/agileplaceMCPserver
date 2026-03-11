# DEBUG: MCP UI Apps Not Rendering in Claude Desktop

## Executive Summary

**There is no `simple_ui_test` directory in ext-apps.** The simplest equivalents are:
- `basic-server-react` — React + MCP Apps
- `basic-server-vanillajs` — Vanilla JS + MCP Apps  
- `quickstart` — Minimal TypeScript example

This guide documents the MCP Apps specification, common failure points, and exact steps to get UI rendering working in Claude Desktop.

---

## 1. Repository Setup & Analysis

### Ext-Apps Structure

```
ext-apps/
├── specification/2026-01-26/apps.mdx   # MCP Apps spec (SEP-1865)
├── src/                                # SDK source
│   ├── app.ts                          # App class (client-side)
│   ├── server/index.ts                 # registerAppTool, registerAppResource
│   └── react/useApp.tsx                # React useApp hook
└── examples/
    ├── basic-server-react/             # Simplest React example
    ├── basic-server-vanillajs/         # Simplest Vanilla JS example
    ├── quickstart/                     # Minimal example
    ├── debug-server/                   # Debug/testing tool
    └── basic-host/                     # Reference host (for testing)
```

### Expected Behavior

1. **Server** registers a tool with `_meta.ui.resourceUri` pointing to a `ui://` resource
2. **Server** registers the resource that returns HTML with `mimeType: "text/html;profile=mcp-app"`
3. **Host (Claude Desktop)** fetches the resource via `resources/read` when the tool is called
4. **Host** renders the HTML in a sandboxed iframe
5. **App (iframe)** calls `app.connect()` (or `useApp()`) to establish postMessage communication
6. **Host** sends `ui/notifications/tool-input` and `ui/notifications/tool-result` to the iframe

---

## 2. MCP Protocol Compliance

### Extension Identifier

- **Extension ID:** `io.modelcontextprotocol/ui`
- **MIME Type:** `text/html;profile=mcp-app`
- **Resource URI scheme:** `ui://`

### Client (Claude Desktop) Initialize

Claude Desktop MUST advertise MCP Apps support in `initialize`:

```json
{
  "capabilities": {
    "extensions": {
      "io.modelcontextprotocol/ui": {
        "mimeTypes": ["text/html;profile=mcp-app"]
      }
    }
  }
}
```

### Tool Schema (Server-Side)

```typescript
// Tool with UI linkage
{
  name: "get-time",
  description: "Returns current server time",
  inputSchema: {},
  _meta: {
    ui: {
      resourceUri: "ui://get-time/mcp-app.html"
    }
  }
}
```

### Resource Read Response

```typescript
{
  contents: [{
    uri: "ui://get-time/mcp-app.html",
    mimeType: "text/html;profile=mcp-app",
    text: "<!DOCTYPE html>...",  // OR blob: base64-encoded HTML
  }]
}
```

### Tool Call Response

```typescript
{
  content: [{ type: "text", text: "2025-02-09T12:00:00.000Z" }],
  structuredContent: { time: "..." }  // Optional, for UI
}
```

---

## 3. Claude Desktop Configuration

### Config File Location

| OS | Path |
|----|------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |

### Exact Configuration

**Option A: Published npm package (recommended)**

```json
{
  "mcpServers": {
    "basic-react": {
      "command": "npx",
      "args": [
        "-y",
        "--silent",
        "--registry=https://registry.npmjs.org/",
        "@modelcontextprotocol/server-basic-react",
        "--stdio"
      ]
    }
  }
}
```

**Option B: Local development (cloned ext-apps)**

```json
{
  "mcpServers": {
    "basic-react": {
      "command": "bash",
      "args": [
        "-c",
        "cd /Users/potatoes/Desktop/agileplaceMCPdemo/ext-apps/examples/basic-server-react && npm run build >&2 && node dist/index.js --stdio"
      ]
    }
  }
}
```

**Replace the path** with your actual clone path.

### After Editing Config

1. Save `claude_desktop_config.json`
2. Restart Claude Desktop **OR** use **Developer → Reload MCP Configuration** (requires Developer Mode)
3. Enable Developer Mode: **Help → Troubleshooting → Enable Developer Mode**

---

## 4. Server Build & Dependencies

### Build basic-server-react

```bash
cd /Users/potatoes/Desktop/agileplaceMCPdemo/ext-apps
npm install
npm run --workspace examples/basic-server-react build
```

### Build Output

- `dist/mcp-app.html` — Bundled HTML with inline JS/CSS (vite-plugin-singlefile)
- `dist/server.js` — MCP server logic
- `dist/index.js` — Entry point (stdio or HTTP)

### Verify Build

```bash
cd ext-apps/examples/basic-server-react
node dist/index.js --stdio
# In another terminal, send initialize (see Section 5)
```

---

## 5. Runtime Debugging

### Add Logging to Server

In `server.ts`, add logging around the tool handler:

```typescript
async (): Promise<CallToolResult> => {
  console.error("[MCP] get-time tool called");
  const time = new Date().toISOString();
  const result = { content: [{ type: "text", text: time }] };
  console.error("[MCP] Returning:", JSON.stringify(result));
  return result;
},
```

### Test Server Manually

```bash
# Send initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/index.js --stdio
```

### Claude Desktop Logs

- **macOS:** `~/Library/Logs/Claude/` or use **Developer Tools** (Cmd+Option+I)
- Inspect the tool call element: look for nested iframes (outer sandbox, inner app)
- Check console for `[HOST]` or MCP-related errors

---

## 6. Response Format Validation

### MCP Apps Spec Requirements

| Requirement | Value |
|-------------|-------|
| Resource URI | Must start with `ui://` |
| MIME type | `text/html;profile=mcp-app` |
| Content | `text` (string) or `blob` (base64) |
| HTML | Valid HTML5 document |

### UI App Requirements

1. **Must call `app.connect()`** — Vanilla JS: `await app.connect()` or use `useApp()` in React
2. **Must have non-zero height** — Root element needs explicit dimensions or content
3. **Register handlers before connect** — `app.ontoolresult`, `app.ontoolinput`, etc.

### Iframe Zero Height

From [Claude MCP Apps Troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting):

> Your app needs a non-zero height to be visible. Check that your root element has explicit dimensions or content that gives it height.

---

## 7. Common Failure Points & Root Causes

### Root Cause #1: Missing `app.connect()` (MOST COMMON)

**Symptom:** Tool call appears but the app is invisible.

**Fix:** Ensure your app calls `app.connect()` (Vanilla JS) or uses `useApp()` (React). Event handlers like `ontoolinput` and `ontoolresult` won't fire until connected.

**Vanilla JS:**
```javascript
const app = new App({ name: "My App", version: "1.0.0" });
app.ontoolresult = (result) => { /* ... */ };
await app.connect();
```

**React:**
```tsx
const { app, error } = useApp({
  appInfo: { name: "My App", version: "1.0.0" },
  capabilities: {},
  onAppCreated: (app) => {
    app.ontoolresult = (result) => { /* ... */ };
  },
});
```

### Root Cause #2: Claude Desktop Version

MCP Apps support was added in 2026. Ensure you have a recent Claude Desktop version. Check **Help → About**.

### Root Cause #3: Host Doesn't Advertise UI Capability

If Claude Desktop doesn't send `io.modelcontextprotocol/ui` in initialize, some servers may skip UI tool registration (if they use `getUiCapability`). The basic-server-react always registers UI tools, so this is unlikely.

### Root Cause #4: Incorrect Config (Command/Args)

- Must use `--stdio` for Claude Desktop
- Path in local config must be absolute and correct
- `npx` packages must be published (e.g. `@modelcontextprotocol/server-basic-react`)

### Root Cause #5: Build Failure

- `dist/mcp-app.html` must exist — the server reads it via `resources/read`
- Run `npm run build` in the example directory
- Check for Vite/build errors

### Root Cause #6: Permission Denied

When Claude prompts "Allow [server] to display an app?", user must click **Allow** or **Always allow**.

---

## 8. Step-by-Step Reproduction

### Minimal Test with basic-server-react

1. **Clone and build**
   ```bash
   cd /Users/potatoes/Desktop/agileplaceMCPdemo/ext-apps
   npm install
   npm run --workspace examples/basic-server-react build
   ```

2. **Add to claude_desktop_config.json**
   ```json
   {
     "mcpServers": {
       "basic-react": {
         "command": "node",
         "args": [
           "/Users/potatoes/Desktop/agileplaceMCPdemo/ext-apps/examples/basic-server-react/dist/index.js",
           "--stdio"
         ]
       }
     }
   }
   ```

3. **Restart Claude Desktop** (or Reload MCP Configuration)

4. **Test**
   - Start a new conversation
   - Ask: "What time is it? Use the get-time tool."
   - Claude should call the tool and request permission to display the app
   - Click "Always allow"
   - The Get Time App UI should render inline

---

## 9. Testing Checklist

- [ ] Server builds without errors (`npm run build`)
- [ ] `dist/mcp-app.html` exists and contains bundled HTML/JS
- [ ] Config uses `--stdio`
- [ ] Claude Desktop restarted or MCP config reloaded
- [ ] Claude Desktop version supports MCP Apps (2026+)
- [ ] User clicked Allow when prompted to display app
- [ ] App calls `app.connect()` or `useApp()`
- [ ] Root element has non-zero height
- [ ] Developer Tools open to inspect iframe and console errors

---

## 10. Quick Reference: basic-server-react Files

| File | Purpose |
|------|---------|
| `server.ts` | Registers `get-time` tool + `ui://get-time/mcp-app.html` resource |
| `main.ts` | Entry: stdio or HTTP transport |
| `mcp-app.html` | Source HTML (Vite input) |
| `src/mcp-app.tsx` | React app with `useApp()` |
| `dist/mcp-app.html` | Built single-file HTML (server serves this) |
| `dist/index.js` | CLI entry for `node dist/index.js --stdio` |

---

## 11. Debug Server

For comprehensive debugging, use the **debug-server** example:

```json
{
  "mcpServers": {
    "debug": {
      "command": "bash",
      "args": [
        "-c",
        "cd /path/to/ext-apps/examples/debug-server && npm run build >&2 && node dist/index.js --stdio"
      ]
    }
  }
}
```

The debug-tool supports content types (text, image, audio), delays, and error simulation. Logs to `/tmp/mcp-apps-debug-server.log` by default.

---

## Summary

**Most likely cause of invisible UI:** Missing `app.connect()` or `useApp()` in the app code. The ext-apps examples already include this; if you have a custom server, ensure the HTML/JS app establishes the connection.

**Config template for Claude Desktop:**
```json
{
  "mcpServers": {
    "basic-react": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-basic-react", "--stdio"]
    }
  }
}
```

**Verification:** Ask Claude "What time is it? Use the get-time tool." and allow the app when prompted. The UI should render inline.
