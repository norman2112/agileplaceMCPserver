import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { z } from "zod";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { CONFIG, configSourceLabel } from "./config.mjs";
import { respondText } from "./helpers.mjs";
import { listCardsWithDependencies } from "./api/agileplace.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { DEFAULT_BOARD_ID } = CONFIG;

const DEPENDENCY_GRAPH_URI = "ui://agileplace/dependency-graph";

// ---------------------------------------------------------------------------
// Inline MCP App client — postMessage JSON-RPC bridge (no CDN, no eval)
// Claude's iframe sandbox blocks external imports. The official quickstart
// uses Vite singlefile to inline the SDK; this is the hand-rolled equivalent.
// ---------------------------------------------------------------------------
const MCP_APP_INLINE_SCRIPT = `
<script>
(function() {
  var msgId = 0;
  var pending = {};
  var toolResultHandler = null;

  window.addEventListener("message", function(ev) {
    var msg = ev.data;
    if (!msg || msg.jsonrpc !== "2.0") return;
    if (msg.id !== undefined && pending[msg.id]) {
      pending[msg.id](msg.result);
      delete pending[msg.id];
      return;
    }
    if (msg.method === "ui/notifications/tool-result" && toolResultHandler) {
      toolResultHandler(msg.params);
    }
  });

  function sendRequest(method, params) {
    return new Promise(function(resolve) {
      var id = ++msgId;
      pending[id] = resolve;
      window.parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
    });
  }

  function sendNotification(method, params) {
    window.parent.postMessage({ jsonrpc: "2.0", method: method, params: params || {} }, "*");
  }

  // Expose a minimal app-like API for the graph code
  window.__mcpApp = {
    ontoolresult: function(handler) { toolResultHandler = handler; },
    callServerTool: function(params) { return sendRequest("tools/call", params); },
    updateModelContext: function(params) { return sendRequest("ui/update-model-context", params); },
    sendSizeChanged: function(w, h) {
      sendNotification("ui/notifications/size-changed", { width: w, height: h });
    },
    connect: function() {
      return sendRequest("ui/initialize", {
        appInfo: { name: "Dependency Graph", version: "1.0.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26"
      }).then(function() {
        sendNotification("ui/notifications/initialized");
      });
    }
  };
})();
</script>`;

/**
 * Build a self-contained dependency graph HTML using Canvas API.
 * No D3, no CDN — just vanilla JS force simulation + Canvas rendering.
 * Total output ~12KB, well under Claude's iframe resource limit.
 */
function buildDependencyGraphHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;color:#1a1a1a;overflow:hidden;min-height:700px;height:100vh}
.container{display:flex;height:100%;min-height:700px}
.sidebar{width:280px;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;overflow:hidden;flex-shrink:0}
.sidebar-header{padding:14px 16px;border-bottom:1px solid #e5e7eb}
.sidebar-title{font-size:14px;font-weight:600;margin-bottom:4px;color:#111}
.sidebar-stats{font-size:11px;color:#6b7280;display:flex;gap:12px}
.controls{padding:10px 16px;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;flex-wrap:wrap}
.btn{background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer}
.btn:hover{background:#e5e7eb}.btn.active{background:#4a6fa5;color:#fff;border-color:#4a6fa5}
.card-list{flex:1;overflow-y:auto;padding:8px}
.card-item{padding:8px 10px;border-radius:4px;cursor:pointer;margin-bottom:4px;border-left:3px solid transparent}
.card-item:hover{background:#f3f4f6}.card-item.selected{background:#eff6ff;border-left-color:#4a6fa5}
.card-item.blocked{border-left-color:#ef4444}
.card-title{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#111}
.card-meta{font-size:10px;color:#6b7280;margin-top:2px}
.graph-area{flex:1;position:relative;background:#f5f5f5}
canvas{display:block;width:100%;height:100%}
.loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#6b7280;font-size:14px}
.tooltip{position:fixed;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:10px 14px;font-size:12px;pointer-events:none;display:none;max-width:280px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,.12)}
.tooltip.visible{display:block}
.tt-title{font-weight:600;margin-bottom:6px;font-size:13px;color:#111}
.tt-row{display:flex;justify-content:space-between;gap:12px;margin-bottom:3px}
.tt-label{color:#6b7280}.tt-val{color:#374151}
.legend{padding:10px 16px;border-top:1px solid #e5e7eb;font-size:10px;color:#6b7280}
.legend span{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:4px;vertical-align:middle}
</style></head>
<body>
${MCP_APP_INLINE_SCRIPT}
<div class="container">
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-title" id="board-title">Dependency Graph</div>
      <div class="sidebar-stats"><span id="subtitle">Loading...</span></div>
    </div>
    <div class="controls">
      <button class="btn active" data-f="all">All</button>
      <button class="btn" data-f="blocked">Blocked</button>
      <button class="btn" data-f="deps">With Deps</button>
      <button class="btn" data-f="isolated">Isolated</button>
      <button class="btn" id="reset-btn" title="Reset zoom">Reset</button>
    </div>
    <div class="card-list" id="card-list"></div>
    <div class="legend">
      <span style="background:#4a6fa5"></span>Card
      <span style="background:#ff4444;margin-left:8px"></span>Blocked
      <span style="background:#f5a623;margin-left:8px"></span>High priority
    </div>
  </div>
  <div class="graph-area">
    <canvas id="canvas"></canvas>
    <div class="loading" id="loading">Waiting for board data...</div>
  </div>
</div>
<div class="tooltip" id="tooltip"><div class="tt-title" id="tt-title"></div><div id="tt-body"></div></div>

<script>
(function(){
var mcpApp = window.__mcpApp;
var nodes = [], edges = [], resolvedEdges = [];
var selectedId = null, hoveredNode = null, dragNode = null;
var cx = 0, cy = 0, scale = 1, dragStartX, dragStartY, panStartX, panStartY, isPanning = false;
var canvas, ctx, W, H, alpha = 1, animId;
var filter = 'all';

// --- Color palette by lane type ---
var COLORS = {
  blocked: '#ff4444', high: '#f5a623', critical: '#ff4444',
  backlog: '#6b7280', active: '#4a6fa5', archive: '#2d6a4f', _default: '#4a6fa5'
};
function nodeColor(n) {
  if (n.isBlocked) return COLORS.blocked;
  if (n.priority === 'critical') return COLORS.critical;
  if (n.priority === 'high') return COLORS.high;
  if (n.laneType === 'ready') return COLORS.backlog;
  if (n.laneType === 'completed') return COLORS.archive;
  return COLORS.active;
}

// --- Force simulation (Euler integration) ---
function initPositions() {
  var angle, r;
  for (var i = 0; i < nodes.length; i++) {
    angle = (2 * Math.PI * i) / nodes.length;
    r = Math.min(W, H) * 0.3;
    nodes[i].x = W/2 + r * Math.cos(angle);
    nodes[i].y = H/2 + r * Math.sin(angle);
    nodes[i].vx = 0; nodes[i].vy = 0;
    nodes[i].fx = null; nodes[i].fy = null;
  }
}

function simulate() {
  if (alpha < 0.001) { alpha = 0; return; }
  alpha *= 0.995;
  var i, j, n1, n2, dx, dy, dist, force, ex, ey;
  // Repulsion (charge)
  for (i = 0; i < nodes.length; i++) {
    for (j = i+1; j < nodes.length; j++) {
      n1 = nodes[i]; n2 = nodes[j];
      dx = n2.x - n1.x; dy = n2.y - n1.y;
      dist = Math.sqrt(dx*dx + dy*dy) || 1;
      force = -400 / (dist * dist) * alpha;
      n1.vx += dx / dist * force; n1.vy += dy / dist * force;
      n2.vx -= dx / dist * force; n2.vy -= dy / dist * force;
    }
  }
  // Link attraction
  for (i = 0; i < resolvedEdges.length; i++) {
    ex = resolvedEdges[i];
    dx = ex.target.x - ex.source.x; dy = ex.target.y - ex.source.y;
    dist = Math.sqrt(dx*dx + dy*dy) || 1;
    force = (dist - 120) * 0.005 * alpha;
    var fx = dx / dist * force, fy = dy / dist * force;
    ex.source.vx += fx; ex.source.vy += fy;
    ex.target.vx -= fx; ex.target.vy -= fy;
  }
  // Center gravity
  for (i = 0; i < nodes.length; i++) {
    nodes[i].vx += (W/2 - nodes[i].x) * 0.001 * alpha;
    nodes[i].vy += (H/2 - nodes[i].y) * 0.001 * alpha;
  }
  // Integrate
  for (i = 0; i < nodes.length; i++) {
    var nd = nodes[i];
    if (nd.fx !== null) { nd.x = nd.fx; nd.y = nd.fy; nd.vx = 0; nd.vy = 0; continue; }
    nd.vx *= 0.6; nd.vy *= 0.6;
    nd.x += nd.vx; nd.y += nd.vy;
  }
}

// --- Rendering ---
function isVisible(n) {
  if (filter === 'all') return true;
  if (filter === 'blocked') return n.isBlocked;
  if (filter === 'deps') return n._hasDeps;
  if (filter === 'isolated') return !n._hasDeps;
  return true;
}

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.translate(cx + W/2, cy + H/2);
  ctx.scale(scale, scale);
  ctx.translate(-W/2, -H/2);

  // Edges
  for (var i = 0; i < resolvedEdges.length; i++) {
    var e = resolvedEdges[i], s = e.source, t = e.target;
    var sVis = isVisible(s), tVis = isVisible(t);
    if (!sVis && !tVis) continue;
    var edgeAlpha = (sVis && tVis) ? 0.7 : 0.15;
    var isBlocking = e.type === 'blocks';
    var isHighlighted = selectedId && (s.id === selectedId || t.id === selectedId);

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = isBlocking ? 'rgba(255,68,68,'+edgeAlpha+')' : 'rgba(100,100,100,'+edgeAlpha+')';
    ctx.lineWidth = isHighlighted ? 2.5 : 1.2;
    if (isBlocking) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    var dx = t.x - s.x, dy = t.y - s.y, len = Math.sqrt(dx*dx+dy*dy) || 1;
    var ux = dx/len, uy = dy/len;
    var ax = t.x - ux*14, ay = t.y - uy*14;
    ctx.beginPath();
    ctx.moveTo(t.x - ux*4, t.y - uy*4);
    ctx.lineTo(ax - uy*5, ay + ux*5);
    ctx.lineTo(ax + uy*5, ay - ux*5);
    ctx.closePath();
    ctx.fillStyle = isBlocking ? 'rgba(255,68,68,'+edgeAlpha+')' : 'rgba(100,100,100,'+edgeAlpha+')';
    ctx.fill();
  }

  // Nodes
  var R = 16;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var vis = isVisible(n);
    var a = vis ? 1 : 0.15;
    var isSel = n.id === selectedId;
    var isHov = hoveredNode === n;
    var col = nodeColor(n);

    // Glow for selected
    if (isSel) {
      ctx.beginPath(); ctx.arc(n.x, n.y, R+6, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(74,111,165,0.3)'; ctx.fill();
    }

    // Circle
    ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, Math.PI*2);
    ctx.fillStyle = col; ctx.globalAlpha = a; ctx.fill();
    if (isSel || isHov) { ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.globalAlpha = 1;

    // Label
    if (vis) {
      var label = n.title.length > 18 ? n.title.substring(0,16)+'..' : n.title;
      ctx.font = '10px -apple-system,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(17,17,17,'+a*0.85+')';
      ctx.fillText(label, n.x, n.y + R + 14);
    }
  }
  ctx.restore();
}

function tick() { simulate(); draw(); animId = requestAnimationFrame(tick); }

// --- Interaction ---
function screenToWorld(sx, sy) {
  return { x: (sx - cx - W/2) / scale + W/2, y: (sy - cy - H/2) / scale + H/2 };
}

function findNode(sx, sy) {
  var p = screenToWorld(sx, sy);
  for (var i = nodes.length - 1; i >= 0; i--) {
    var dx = nodes[i].x - p.x, dy = nodes[i].y - p.y;
    if (dx*dx + dy*dy < 18*18) return nodes[i];
  }
  return null;
}

function setupEvents() {
  canvas.addEventListener('mousedown', function(e) {
    var n = findNode(e.offsetX, e.offsetY);
    if (n) { dragNode = n; n.fx = n.x; n.fy = n.y; alpha = Math.max(alpha, 0.3); }
    else { isPanning = true; panStartX = e.clientX - cx; panStartY = e.clientY - cy; }
  });
  canvas.addEventListener('mousemove', function(e) {
    if (dragNode) {
      var p = screenToWorld(e.offsetX, e.offsetY);
      dragNode.fx = p.x; dragNode.fy = p.y; alpha = Math.max(alpha, 0.1);
    } else if (isPanning) {
      cx = e.clientX - panStartX; cy = e.clientY - panStartY; draw();
    } else {
      var n = findNode(e.offsetX, e.offsetY);
      hoveredNode = n;
      canvas.style.cursor = n ? 'pointer' : 'grab';
      var tt = document.getElementById('tooltip');
      if (n) {
        var deps = resolvedEdges.filter(function(ed) { return ed.source.id === n.id || ed.target.id === n.id; });
        document.getElementById('tt-title').textContent = n.title;
        document.getElementById('tt-body').innerHTML =
          '<div class="tt-row"><span class="tt-label">Lane</span><span class="tt-val">'+(n.laneName||'?')+'</span></div>'+
          '<div class="tt-row"><span class="tt-label">Priority</span><span class="tt-val">'+(n.priority||'normal')+'</span></div>'+
          '<div class="tt-row"><span class="tt-label">Connections</span><span class="tt-val">'+deps.length+'</span></div>'+
          (n.isBlocked?'<div style="color:#ff4444;margin-top:4px">BLOCKED'+(n.blockReason?' - '+n.blockReason:'')+'</div>':'');
        tt.style.left = (e.clientX+12)+'px'; tt.style.top = (e.clientY+12)+'px';
        tt.classList.add('visible');
      } else { tt.classList.remove('visible'); }
    }
  });
  canvas.addEventListener('mouseup', function() {
    if (dragNode) { dragNode.fx = null; dragNode.fy = null; dragNode = null; }
    isPanning = false;
  });
  canvas.addEventListener('mouseleave', function() {
    if (dragNode) { dragNode.fx = null; dragNode.fy = null; dragNode = null; }
    isPanning = false; hoveredNode = null;
    document.getElementById('tooltip').classList.remove('visible');
  });
  canvas.addEventListener('click', function(e) {
    var n = findNode(e.offsetX, e.offsetY);
    selectNode(n ? n.id : null);
  });
  canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    var z = e.deltaY < 0 ? 1.1 : 0.9;
    var ns = Math.max(0.1, Math.min(6, scale * z));
    // Zoom toward cursor
    var mx = e.offsetX, my = e.offsetY;
    cx = mx - (mx - cx) * (ns / scale); cy = my - (my - cy) * (ns / scale);
    scale = ns; draw();
  }, {passive: false});
  document.getElementById('reset-btn').addEventListener('click', function() {
    cx = 0; cy = 0; scale = 1; draw();
  });
  document.querySelectorAll('[data-f]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('[data-f]').forEach(function(b){b.classList.remove('active')});
      btn.classList.add('active');
      filter = btn.dataset.f; draw();
    });
  });
}

function selectNode(id) {
  selectedId = id;
  document.querySelectorAll('.card-item').forEach(function(el) {
    if (el.dataset.id === String(id)) { el.classList.add('selected'); el.scrollIntoView({behavior:'smooth',block:'nearest'}); }
    else el.classList.remove('selected');
  });
  draw();
  if (id) {
    var nd = nodes.find(function(n){return n.id===id});
    if (nd) {
      try { mcpApp.updateModelContext({content:[{type:'text',text:'User selected card: "'+nd.title+'" (ID:'+nd.id+', Lane:'+nd.laneName+', Priority:'+nd.priority+')'}]}); } catch(e){}
    }
  }
}

// --- Load data ---
function loadGraph(data) {
  document.getElementById('loading').style.display = 'none';
  nodes = data.nodes || []; var rawEdges = data.edges || [];
  var nodeMap = {};
  for (var i = 0; i < nodes.length; i++) { nodes[i]._hasDeps = false; nodeMap[nodes[i].id] = nodes[i]; }
  resolvedEdges = [];
  for (var i = 0; i < rawEdges.length; i++) {
    var e = rawEdges[i], s = nodeMap[e.from], t = nodeMap[e.to];
    if (s && t) { resolvedEdges.push({source:s,target:t,type:e.type}); s._hasDeps = true; t._hasDeps = true; }
  }

  // Stats
  var stats = data.statistics || {};
  var dep = stats.dependencies || {}, pc = stats.parentChild || {};
  document.getElementById('subtitle').textContent =
    nodes.length+' cards \\u2022 '+ ((dep.total||0)+(pc.total||0))+' relationships \\u2022 '+(stats.blockedCards||0)+' blocked';

  // Card list
  var list = document.getElementById('card-list'); list.innerHTML = '';
  nodes.forEach(function(n) {
    var el = document.createElement('div');
    el.className = 'card-item' + (n.isBlocked ? ' blocked' : '');
    el.dataset.id = n.id;
    el.innerHTML = '<div class="card-title">'+esc(n.title)+'</div><div class="card-meta">'+(n.laneName||'?')+' \\u2022 '+(n.priority||'normal')+'</div>';
    el.addEventListener('click', function(){ selectNode(n.id); });
    list.appendChild(el);
  });

  initPositions();
  alpha = 1;
  if (!animId) tick();
}
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}

// --- Init ---
function init() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  function resize() {
    var r = canvas.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = W * devicePixelRatio; canvas.height = H * devicePixelRatio;
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    if (nodes.length) draw();
  }
  resize(); window.addEventListener('resize', resize);
  setupEvents();

  mcpApp.connect().then(function() {
    mcpApp.sendSizeChanged(900, 700);
    mcpApp.ontoolresult(function(result) {
      var data = result.structuredContent || result.data || result;
      if (!data && result.content && Array.isArray(result.content)) {
        var tc = result.content.find(function(c){return c.type==='text'});
        if (tc) try { data = JSON.parse(tc.text); } catch(e){}
      }
      if (data && data.nodes) loadGraph(data);
      else document.getElementById('loading').textContent = 'No graph data in response';
    });
  }).catch(function(e) {
    document.getElementById('loading').textContent = 'Connection failed: '+e.message;
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
<\/script>
</body></html>`;
}

export function registerUiResources(mcp) {
  // Register MCP App UI resource for dependency graph
  registerAppResource(
    mcp,
    DEPENDENCY_GRAPH_URI,
    DEPENDENCY_GRAPH_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      try {
        const htmlContent = buildDependencyGraphHtml();
        return {
          contents: [{
            uri: DEPENDENCY_GRAPH_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: htmlContent,
          }],
        };
      } catch (error) {
        throw new Error(`Failed to build UI resource: ${error.message}`);
      }
    }
  );

  // Register the dependency graph tool with UI
  registerAppTool(
    mcp,
    "get_board_dependency_graph",
    {
      title: "Board Dependency Graph",
      description: "Get complete dependency graph for an entire board. Returns all cards with their relationships formatted for graph visualization. Includes interactive UI for exploring the dependency graph.",
      inputSchema: {
        boardId: z.string().optional(),
      },
      outputSchema: z.object({
        boardId: z.string(),
        nodes: z.array(z.any()),
        edges: z.array(z.any()),
        statistics: z.any(),
      }),
      _meta: {
        ui: {
          resourceUri: DEPENDENCY_GRAPH_URI,
        },
      },
    },
    async ({ boardId }) => {
      const resolvedBoardId = boardId || DEFAULT_BOARD_ID;
      if (!resolvedBoardId) {
        throw new Error(`Board ID is required. Provide "boardId" or set AGILEPLACE_BOARD_ID in ${configSourceLabel()}.`);
      }

      try {
        const response = await listCardsWithDependencies(resolvedBoardId);
        const { cards } = response;

        // Build nodes array
        const nodes = cards.map(card => ({
          id: card.id,
          title: card.title,
          description: card.description,
          laneId: card.lane?.id,
          laneName: card.lane?.title,
          laneType: card.lane?.laneType,
          priority: card.priority,
          size: card.size,
          color: card.color,
          tags: card.tags || [],
          assignedUsers: (card.assignedUsers || []).map(u => ({ id: u.id, name: u.fullName, email: u.emailAddress })),
          assignedTeams: (card.assignedTeams || []).map(t => ({ id: t.id, name: t.title })),
          dates: {
            plannedStart: card.plannedStart,
            plannedFinish: card.plannedFinish,
            actualStart: card.actualStart,
            actualFinish: card.actualFinish,
          },
          cardType: card.type?.title,
          isBlocked: card.blockedStatus?.isBlocked || false,
          blockReason: card.blockedStatus?.reason,
          customFields: card.customFields || {},
          parentCards: (card.parentCards || [])
            .filter(p => p && p.id)
            .map(p => ({ id: p.id, title: p.title })),
        }));

        // Build edges array from dependencies and parent-child relationships
        const edges = [];
        cards.forEach(card => {
          const deps = card.dependencies || { incoming: [], outgoing: [] };
          deps.incoming.forEach(dep => {
            edges.push({ from: dep.cardId, to: card.id, type: "blocks", timing: dep.timing, createdOn: dep.createdOn });
          });
          deps.outgoing.forEach(dep => {
            edges.push({ from: card.id, to: dep.cardId, type: "blocks", timing: dep.timing, createdOn: dep.createdOn });
          });
          (card.parentCards || []).forEach(parent => {
            if (parent && parent.id) {
              edges.push({ from: parent.id, to: card.id, type: "parent", relationship: "parent-child" });
            }
          });
        });

        // Deduplicate and filter
        const validEdges = edges.filter(e => e.from && e.to);
        const uniqueEdges = Array.from(
          new Map(validEdges.map(e => [`${e.from}-${e.to}-${e.type}`, e])).values()
        );

        const dependencyEdges = uniqueEdges.filter(e => e.type === "blocks");
        const parentChildEdges = uniqueEdges.filter(e => e.type === "parent");

        const blockedCards = nodes.filter(n => n.isBlocked).length;
        const cardsWithDependencies = new Set([
          ...dependencyEdges.map(e => e.from),
          ...dependencyEdges.map(e => e.to),
        ]).size;
        const cardsWithParentChild = new Set([
          ...parentChildEdges.map(e => e.from),
          ...parentChildEdges.map(e => e.to),
        ]).size;

        const graphData = {
          boardId: resolvedBoardId,
          nodes,
          edges: uniqueEdges,
          statistics: {
            totalCards: nodes.length,
            dependencies: {
              total: dependencyEdges.length,
              cardsWithDependencies,
              averagePerCard: nodes.length > 0 ? (dependencyEdges.length / nodes.length).toFixed(2) : "0",
            },
            parentChild: {
              total: parentChildEdges.length,
              cardsWithParentChild,
              averagePerCard: nodes.length > 0 ? (parentChildEdges.length / nodes.length).toFixed(2) : "0",
            },
            totalRelationships: uniqueEdges.length,
            blockedCards,
          },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(graphData, null, 2) }],
          structuredContent: graphData,
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error fetching board dependency graph: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
