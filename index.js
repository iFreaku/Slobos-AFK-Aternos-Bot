"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");
const http = require("http");
const https = require("https");

// ============================================================
// FORGE SUPPORT: Add Minecraft protocol patch for Forge handshake
// ============================================================
const { autoVersionForge } = require("minecraft-protocol-forge");

// ============================================================
// EXPRESS SERVER - Keep Render/Aternos alive
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

// Bot state tracking
let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false,
};

// Health check endpoint for monitoring
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
          }
          main { width: 100%; max-width: 400px; }
          header { margin-bottom: 28px; }
          header h1 {
            font-size: 26px;
            font-weight: 700;
            color: #f0f6fc;
            margin: 0;
            line-height: 1.2;
          }
          header p {
            font-size: 14px;
            color: #8b949e;
            margin: 6px 0 0;
            line-height: 1.5;
          }
          .status-section {
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 16px;
            transition: background 0.3s, border-color 0.3s;
          }
          .status-section.online  { background: #0d2218; border: 2px solid #238636; }
          .status-section.offline { background: #200d0d; border: 2px solid #da3633; }
          .status-icon {
            width: 44px; height: 44px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; flex-shrink: 0;
            transition: background 0.3s;
          }
          .status-icon.online  { background: #238636; }
          .status-icon.offline { background: #da3633; }
          .status-label { font-size: 18px; font-weight: 700; line-height: 1.2; transition: color 0.3s; }
          .status-label.online  { color: #3fb950; }
          .status-label.offline { color: #f85149; }
          .status-detail { font-size: 13px; color: #8b949e; margin-top: 3px; }
          dl { margin: 0; }
          .stat-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 10px;
            padding: 16px 20px;
            margin-bottom: 10px;
          }
          dt { font-size: 12px; color: #8b949e; font-weight: 600; margin-bottom: 4px; }
          dd { margin: 0; font-size: 17px; font-weight: 600; color: #e6edf3; line-height: 1.3; }
          .stat-detail { margin: 4px 0 0; font-size: 11px; color: #6e7681; }
          .controls { margin-top: 8px; }
          .btn-grid { display: grid; gap: 10px; margin-bottom: 10px; }
          .btn-grid-2 { grid-template-columns: 1fr 1fr; }
          .btn-primary {
            min-height: 52px; border-radius: 10px;
            font-size: 15px; font-weight: 700;
            cursor: pointer; letter-spacing: 0.3px;
            transition: opacity 0.2s, filter 0.2s;
            font-family: inherit;
          }
          .btn-primary:hover  { filter: brightness(1.1); }
          .btn-primary:active { opacity: 0.85; }
          .btn-start { border: 2px solid #238636; background: #0d2218; color: #3fb950; }
          .btn-stop  { border: 2px solid #da3633; background: #200d0d; color: #f85149; }
          .btn-secondary {
            min-height: 44px; border-radius: 10px;
            border: 1px solid #21262d; background: #161b22; color: #8b949e;
            font-size: 13px; font-weight: 500;
            text-decoration: none;
            display: flex; align-items: center; justify-content: center;
            font-family: inherit; cursor: pointer;
            transition: background 0.2s, color 0.2s;
          }
          .btn-secondary:hover { background: #21262d; color: #c9d1d9; }
          footer { margin-top: 20px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main role="main" aria-label="AFK Bot Dashboard">
          <header>
            <h1>AFK Bot Dashboard</h1>
            <p>Minecraft server bot &middot; Live status</p>
          </header>
          <section id="status-section" role="status" aria-live="polite" aria-label="Bot connection status" class="status-section offline">
            <div id="status-icon" aria-hidden="true" class="status-icon offline">&#x2717;</div>
            <div>
              <div id="status-label" class="status-label offline">Connecting…</div>
              <div id="status-detail" class="status-detail">Establishing connection</div>
            </div>
          </section>
          <section aria-label="Bot statistics">
            <dl>
              <div class="stat-card">
                <dt>Uptime</dt>
                <dd id="uptime-text">—</dd>
                <p class="stat-detail">Time since last connection</p>
              </div>
              <div class="stat-card">
                <dt>Coordinates</dt>
                <dd id="coords-text">Searching…</dd>
                <p class="stat-detail">Bot's current in-game position</p>
              </div>
              <div class="stat-card">
                <dt>Server address</dt>
                <dd>${config.server.ip}</dd>
                <p class="stat-detail">Minecraft server hostname</p>
              </div>
            </dl>
          </section>
          <section class="controls" aria-label="Bot controls">
            <div class="btn-grid btn-grid-2">
              <button class="btn-primary btn-start" onclick="startBot()" aria-label="Start bot">Start bot</button>
              <button class="btn-primary btn-stop" onclick="stopBot()" aria-label="Stop bot">Stop bot</button>
            </div>
            <div class="btn-grid btn-grid-2">
              <a href="/tutorial" class="btn-secondary" aria-label="View setup guide">Setup guide</a>
              <a href="/logs" class="btn-secondary" aria-label="View bot logs">View logs</a>
            </div>
          </section>
          <footer>
            <p>Status updates every 5 seconds</p>
          </footer>
        </main>
        <script>
          function formatUptime(s) {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
            if (m > 0) return m + 'm ' + sec + 's';
            return sec + ' seconds';
          }
          async function update() {
            try {
              const r = await fetch('/health');
              const data = await r.json();
              const online = data.status === 'connected';
              const section = document.getElementById('status-section');
              const icon    = document.getElementById('status-icon');
              const label   = document.getElementById('status-label');
              const detail  = document.getElementById('status-detail');
              section.className = 'status-section ' + (online ? 'online' : 'offline');
              icon.className    = 'status-icon '    + (online ? 'online' : 'offline');
              icon.textContent  = online ? '✓' : '✗';
              label.className   = 'status-label '   + (online ? 'online' : 'offline');
              label.textContent = online ? 'Connected' : 'Disconnected';
              detail.textContent = online ? 'Bot is active on the server' : 'Attempting to reconnect';
              document.getElementById('uptime-text').textContent = formatUptime(data.uptime);
              if (data.coords) {
                const x = Math.floor(data.coords.x);
                const y = Math.floor(data.coords.y);
                const z = Math.floor(data.coords.z);
                document.getElementById('coords-text').textContent = 'X ' + x + ', Y ' + y + ', Z ' + z;
              } else {
                document.getElementById('coords-text').textContent = 'Searching…';
              }
            } catch (e) {
              const label = document.getElementById('status-label');
              label.className = 'status-label offline';
              label.textContent = 'Unreachable';
            }
          }
          async function startBot() {
            const r = await fetch('/start', { method: 'POST' });
            const data = await r.json();
            alert(data.success ? 'Bot started!' : data.msg);
            update();
          }
          async function stopBot() {
            const r = await fetch('/stop', { method: 'POST' });
            const data = await r.json();
            alert(data.success ? 'Bot stopped!' : data.msg);
            update();
          }
          setInterval(update, 5000);
          update();
        </script>
      </body>
    </html>
  `);
});

app.get("/tutorial", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} - Setup Guide</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            margin: 0;
            padding: 40px 24px;
          }
          main { max-width: 560px; margin: 0 auto; }
          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #8b949e;
            text-decoration: none;
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 8px;
            padding: 7px 14px;
            margin-bottom: 32px;
            transition: color 0.2s, background 0.2s;
          }
          .back-btn:hover { background: #21262d; color: #c9d1d9; }
          header { margin-bottom: 32px; }
          header h1 { font-size: 26px; font-weight: 700; color: #f0f6fc; margin: 0; }
          header p { font-size: 14px; color: #8b949e; margin: 6px 0 0; }
          .step-card {
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 16px;
          }
          .step-header { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
          .step-number {
            width: 32px; height: 32px;
            border-radius: 50%;
            background: #0d2218;
            border: 2px solid #238636;
            color: #3fb950;
            font-size: 14px;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .step-title { font-size: 16px; font-weight: 700; color: #f0f6fc; margin: 0; }
          ol { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
          li { font-size: 14px; color: #8b949e; line-height: 1.6; padding-left: 20px; position: relative; }
          li::before { content: "·"; position: absolute; left: 6px; color: #3fb950; font-weight: 700; }
          li strong { color: #e6edf3; }
          code {
            background: #21262d;
            border: 1px solid #30363d;
            padding: 2px 7px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
          }
          a { color: #58a6ff; text-decoration: none; }
          footer { margin-top: 32px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main>
          <a href="/" class="back-btn">&#8592; Back to Dashboard</a>
          <header>
            <h1>Setup Guide</h1>
            <p>Get your AFK bot running in under 15 minutes</p>
          </header>
          <div class="step-card">
            <div class="step-header"><div class="step-number">1</div><h2 class="step-title">Configure Aternos</h2></div>
            <ol><li>Go to <strong>Aternos</strong> and open your server.</li><li>Install <strong>Paper/Bukkit</strong> as your server software.</li><li>Enable <strong>Cracked</strong> mode using the green switch.</li><li>Install these plugins: <code>ViaVersion</code>, <code>ViaBackwards</code>, <code>ViaRewind</code></li></ol>
          </div>
          <div class="step-card">
            <div class="step-header"><div class="step-number">2</div><h2 class="step-title">GitHub Setup</h2></div>
            <ol><li>Download this project as a ZIP and extract it.</li><li>Edit <code>settings.json</code> with your server IP and port.</li><li>Upload all files to a new <strong>GitHub Repository</strong>.</li></ol>
          </div>
          <div class="step-card">
            <div class="step-header"><div class="step-number">3</div><h2 class="step-title">Deploy on Replit (Free 24/7)</h2></div>
            <ol><li>Import your GitHub repo into <strong>Replit</strong>.</li><li>Set the run command to <code>npm start</code>.</li><li>Hit <strong>Run</strong> — the bot connects automatically.</li><li>The bot pings itself every 10 minutes to stay alive.</li></ol>
          </div>
          <footer><p>AFK Bot Dashboard &middot; ${config.name}</p></footer>
        </main>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: bot && bot.entity ? bot.entity.position : null,
    lastActivity: botState.lastActivity,
    reconnectAttempts: botState.reconnectAttempts,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
  });
});

app.get("/ping", (req, res) => res.send("pong"));

app.get("/logs", (req, res) => {
  const logs = getLogs();
  const escapeHTML = (str) => str.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m]);
  const logCount = logs.length;
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} - Logs</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            margin: 0;
            padding: 40px 24px;
          }
          main { max-width: 760px; margin: 0 auto; }
          .back-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 500;
            color: #8b949e;
            text-decoration: none;
            background: #161b22;
            border: 1px solid #21262d;
            border-radius: 8px;
            padding: 7px 14px;
            margin-bottom: 32px;
          }
          .back-btn:hover { background: #21262d; color: #c9d1d9; }
          .page-header { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
          .page-header-left h1 { font-size: 26px; font-weight: 700; color: #f0f6fc; margin: 0; }
          .badge { font-size: 12px; font-weight: 600; color: #8b949e; background: #161b22; border: 1px solid #21262d; border-radius: 20px; padding: 4px 12px; }
          .log-card { background: #0d1117; border: 1px solid #21262d; border-radius: 12px; overflow: hidden; }
          .log-card-header { background: #161b22; border-bottom: 1px solid #21262d; padding: 12px 18px; display: flex; align-items: center; gap: 8px; }
          .dot { width: 10px; height: 10px; border-radius: 50%; }
          .dot-red { background: #ff5f57; }
          .dot-yellow { background: #ffbd2e; }
          .dot-green { background: #28c840; }
          .log-body { padding: 16px 18px; max-height: 560px; overflow-y: auto; font-family: monospace; font-size: 12.5px; line-height: 1.7; }
          .log-entry.error { color: #ff7b72; }
          .log-entry.warn { color: #e3b341; }
          .log-entry.success { color: #3fb950; }
          .log-entry.control { color: #58a6ff; }
          .log-entry.default { color: #8b949e; }
          .empty-state { text-align: center; padding: 40px 20px; color: #484f58; }
          .console-row { display: flex; align-items: center; border-top: 1px solid #21262d; background: #0d1117; padding: 10px 18px; gap: 10px; }
          .console-prompt { font-family: monospace; font-size: 13px; color: #3fb950; flex-shrink: 0; }
          .console-input { flex: 1; background: transparent; border: none; outline: none; font-family: monospace; font-size: 12.5px; color: #e6edf3; }
          .console-send { background: #0d2218; border: 1px solid #238636; color: #3fb950; font-size: 12px; font-weight: 600; padding: 5px 14px; border-radius: 6px; cursor: pointer; }
          footer { margin-top: 32px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; }
        </style>
      </head>
      <body>
        <main>
          <a href="/" class="back-btn">&#8592; Back to Dashboard</a>
          <div class="page-header">
            <div class="page-header-left"><h1>Bot Logs</h1><p>Live output from the AFK bot</p></div>
            <span class="badge">${logCount} ${logCount === 1 ? "entry" : "entries"}</span>
          </div>
          <div class="log-card">
            <div class="log-card-header">
              <span class="dot dot-red"></span>
              <span class="dot dot-yellow"></span>
              <span class="dot dot-green"></span>
              <span class="log-card-title">bot.log</span>
            </div>
            <div class="log-body" id="log-body">
              ${logCount === 0 ? `<div class="empty-state">No log entries yet.</div>` : logs.map(l => `<span class="log-entry ${l.toLowerCase().includes("error") ? "error" : l.toLowerCase().includes("warn") ? "warn" : l.toLowerCase().includes("connect") ? "success" : "default"}">${escapeHTML(l)}</span>`).join("")}
            </div>
            <div class="console-row">
              <span class="console-prompt">&gt;</span>
              <input id="console-input" class="console-input" type="text" placeholder="Type / for commands, or any message…" autocomplete="off">
              <button id="console-send" class="console-send">Send</button>
            </div>
          </div>
          <footer><p>AFK Bot Dashboard &middot; ${config.name}</p></footer>
        </main>
        <script>
          const logBody = document.getElementById('log-body');
          const input = document.getElementById('console-input');
          const sendBtn = document.getElementById('console-send');
          function appendLocalEntry(text, cls) {
            const span = document.createElement('span');
            span.className = 'log-entry ' + cls;
            span.textContent = text;
            logBody.appendChild(span);
            logBody.scrollTop = logBody.scrollHeight;
          }
          async function sendCommand() {
            const cmd = input.value.trim();
            if (!cmd) return;
            input.value = '';
            appendLocalEntry('> ' + cmd, 'control');
            try {
              const r = await fetch('/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: cmd })
              });
              const data = await r.json();
              if (data.msg) {
                data.msg.split('\\n').forEach(line => appendLocalEntry(line, data.success ? 'default' : 'error'));
              }
            } catch(e) {
              appendLocalEntry('Failed to send command.', 'error');
            }
            input.focus();
          }
          sendBtn.addEventListener('click', sendCommand);
          input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCommand(); });
          setTimeout(() => { logBody.scrollTop = logBody.scrollHeight; }, 100);
        </script>
      </body>
    </html>
  `);
});

let botRunning = true;

app.post("/start", (req, res) => {
  if (botRunning) return res.json({ success: false, msg: "Already running" });
  botRunning = true;
  createBot();
  addLog("[Control] Bot started");
  res.json({ success: true });
});

app.post("/stop", (req, res) => {
  if (!botRunning) return res.json({ success: false, msg: "Already stopped" });
  botRunning = false;
  if (bot) { bot.end(); bot = null; }
  clearAllIntervals();
  addLog("[Control] Bot stopped");
  res.json({ success: true });
});

app.post("/command", express.json(), (req, res) => {
  const cmd = (req.body.command || "").trim();
  if (!cmd) return res.json({ success: false, msg: "Empty command." });
  addLog(`[Console] > ${cmd}`);
  if (cmd === "/help") {
    const lines = ["Available commands:", "  /help          - Show this help", "  /pos           - Show bot's coordinates", "  /status        - Show bot connection status", "  /list          - List players", "  /say <message> - Send chat message", "  /<anything>    - Send Minecraft command"];
    lines.forEach(l => addLog(`[Console] ${l}`));
    return res.json({ success: true, msg: lines.join("\n") });
  }
  if (cmd === "/pos" || cmd === "/coords") {
    const pos = bot && bot.entity ? bot.entity.position : null;
    const msg = pos ? `Position: X=${Math.floor(pos.x)} Y=${Math.floor(pos.y)} Z=${Math.floor(pos.z)}` : "Position unavailable.";
    addLog(`[Console] ${msg}`);
    return res.json({ success: true, msg });
  }
  if (cmd === "/status") {
    const status = botState.connected ? "Connected" : "Disconnected";
    const uptime = Math.floor((Date.now() - botState.startTime) / 1000);
    const msg = `Status: ${status} | Uptime: ${uptime}s | Reconnects: ${botState.reconnectAttempts}`;
    addLog(`[Console] ${msg}`);
    return res.json({ success: true, msg });
  }
  if (!bot || typeof bot.chat !== "function") {
    const msg = bot ? "Bot still connecting..." : "Bot not running.";
    return res.json({ success: false, msg });
  }
  try {
    bot.chat(cmd);
    addLog(`[Console] Sent: ${cmd}`);
    return res.json({ success: true, msg: `Sent: ${cmd}` });
  } catch (err) {
    addLog(`[Console] Error: ${err.message}`);
    return res.json({ success: false, msg: err.message });
  }
});

// ============================================================
// HELPER FUNCTIONS (unchanged from your original)
// ============================================================
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function clearAllIntervals() {
  addLog(`[Cleanup] Clearing ${activeIntervals.length} intervals`);
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
}

function addInterval(callback, delay) {
  const id = setInterval(callback, delay);
  activeIntervals.push(id);
  return id;
}

function getReconnectDelay() {
  if (botState.wasThrottled) {
    botState.wasThrottled = false;
    return 60000 + Math.floor(Math.random() * 60000);
  }
  const baseDelay = config.utils["auto-reconnect-delay"] || 3000;
  const maxDelay = config.utils["max-reconnect-delay"] || 30000;
  const delay = Math.min(baseDelay * Math.pow(2, botState.reconnectAttempts), maxDelay);
  return delay + Math.floor(Math.random() * 2000);
}

function clearBotTimeouts() {
  if (reconnectTimeoutId) clearTimeout(reconnectTimeoutId);
  if (connectionTimeoutId) clearTimeout(connectionTimeoutId);
  reconnectTimeoutId = connectionTimeoutId = null;
}

let bot = null;
let activeIntervals = [];
let reconnectTimeoutId = null;
let connectionTimeoutId = null;
let isReconnecting = false;

function scheduleReconnect() {
  clearBotTimeouts();
  if (isReconnecting) return;
  isReconnecting = true;
  botState.reconnectAttempts++;
  const delay = getReconnectDelay();
  addLog(`[Bot] Reconnecting in ${delay / 1000}s (attempt #${botState.reconnectAttempts})`);
  reconnectTimeoutId = setTimeout(() => {
    reconnectTimeoutId = null;
    isReconnecting = false;
    createBot();
  }, delay);
}

function createBot() {
  if (isReconnecting) {
    addLog("[Bot] Already reconnecting, skipping...");
    return;
  }
  if (bot) {
    clearAllIntervals();
    try { bot.removeAllListeners(); bot.end(); } catch(e) {}
    bot = null;
  }
  addLog(`[Bot] Creating bot instance...`);
  addLog(`[Bot] Connecting to ${config.server.ip}:${config.server.port}`);

  try {
    const botVersion = config.server.version && config.server.version.trim() !== "" ? config.server.version : false;
    bot = mineflayer.createBot({
      username: config["bot-account"].username,
      password: config["bot-account"].password || undefined,
      auth: config["bot-account"].type,
      host: config.server.ip,
      port: config.server.port,
      version: botVersion,
      hideErrors: false,
      checkTimeoutInterval: 600000,
    });

    // ============================================================
    // FORGE HANDSHAKE PATCH – this is the fix for your server
    // ============================================================
    const forgeOptions = { forgeMods: undefined, channels: undefined };
    autoVersionForge(bot._client, forgeOptions);
    addLog("[Forge] Forge handshake patched into bot client");

    bot.loadPlugin(pathfinder);
    clearBotTimeouts();
    connectionTimeoutId = setTimeout(() => {
      if (!botState.connected) {
        addLog("[Bot] Connection timeout - no spawn received");
        try { bot.removeAllListeners(); bot.end(); } catch(e) {}
        bot = null;
        scheduleReconnect();
      }
    }, 150000);

    let spawnHandled = false;
    bot.once("spawn", () => {
      if (spawnHandled) return;
      spawnHandled = true;
      clearBotTimeouts();
      botState.connected = true;
      botState.lastActivity = Date.now();
      botState.reconnectAttempts = 0;
      isReconnecting = false;
      addLog(`[Bot] [+] Successfully spawned on Forge server! (Version: ${bot.version})`);
      if (config.discord && config.discord.events && config.discord.events.connect) {
        sendDiscordWebhook(`[+] **Connected** to \`${config.server.ip}\``, 0x4ade80);
      }
      const mcData = require("minecraft-data")(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.allowFreeMotion = false;
      defaultMove.canDig = false;
      defaultMove.liquidCost = 1000;
      defaultMove.fallDamageCost = 1000;
      initializeModules(bot, mcData, defaultMove);
      setTimeout(() => {
        if (bot && botState.connected && config.server["try-creative"]) {
          bot.chat("/gamemode creative");
          addLog("[INFO] Attempted to set creative mode (requires OP)");
        }
      }, 3000);
    });

    bot.on("kicked", (reason) => {
      const kickReason = typeof reason === "object" ? JSON.stringify(reason) : reason;
      addLog(`[Bot] Kicked: ${kickReason}`);
      botState.connected = false;
      botState.errors.push({ type: "kicked", reason: kickReason, time: Date.now() });
      clearAllIntervals();
      if (String(kickReason).toLowerCase().includes("throttl")) botState.wasThrottled = true;
      if (config.discord && config.discord.events && config.discord.events.disconnect) {
        sendDiscordWebhook(`[!] **Kicked**: ${kickReason}`, 0xff0000);
      }
    });

    bot.on("end", (reason) => {
      addLog(`[Bot] Disconnected: ${reason || "Unknown reason"}`);
      botState.connected = false;
      clearAllIntervals();
      spawnHandled = false;
      if (config.discord && config.discord.events && config.discord.events.disconnect) {
        sendDiscordWebhook(`[-] **Disconnected**: ${reason || "Unknown"}`, 0xf87171);
      }
      scheduleReconnect();
    });

    bot.on("error", (err) => {
      addLog(`[Bot] Error: ${err.message}`);
      botState.errors.push({ type: "error", message: err.message, time: Date.now() });
    });
  } catch (err) {
    addLog(`[Bot] Failed to create bot: ${err.message}`);
    scheduleReconnect();
  }
}

function initializeModules(bot, mcData, defaultMove) {
  addLog("[Modules] Initializing all modules...");
  if (config.utils["auto-auth"] && config.utils["auto-auth"].enabled) {
    const password = config.utils["auto-auth"].password;
    let authHandled = false;
    const tryAuth = (type) => {
      if (authHandled || !bot || !botState.connected) return;
      authHandled = true;
      if (type === "register") bot.chat(`/register ${password} ${password}`);
      else bot.chat(`/login ${password}`);
    };
    bot.on("messagestr", (message) => {
      if (authHandled) return;
      const msg = message.toLowerCase();
      if (msg.includes("/register") || msg.includes("register ")) tryAuth("register");
      else if (msg.includes("/login") || msg.includes("login ")) tryAuth("login");
    });
    setTimeout(() => {
      if (!authHandled && bot && botState.connected) {
        addLog("[Auth] No prompt detected after 10s, sending /login as failsafe");
        bot.chat(`/login ${password}`);
        authHandled = true;
      }
    }, 10000);
  }
  if (config.utils["chat-messages"] && config.utils["chat-messages"].enabled) {
    const messages = config.utils["chat-messages"].messages;
    if (config.utils["chat-messages"].repeat) {
      let i = 0;
      addInterval(() => {
        if (bot && botState.connected) { bot.chat(messages[i]); botState.lastActivity = Date.now(); i = (i + 1) % messages.length; }
      }, config.utils["chat-messages"]["repeat-delay"] * 1000);
    } else {
      messages.forEach((msg, idx) => setTimeout(() => { if (bot && botState.connected) bot.chat(msg); }, idx * 1000));
    }
  }
  if (config.position && config.position.enabled && !(config.movement && config.movement["circle-walk"] && config.movement["circle-walk"].enabled)) {
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.setGoal(new GoalBlock(config.position.x, config.position.y, config.position.z));
    addLog("[Position] Navigating to configured position...");
  }
  if (config.utils["anti-afk"] && config.utils["anti-afk"].enabled) {
    addInterval(() => { if (bot && botState.connected) try { bot.swingArm(); } catch(e) {} }, 10000 + Math.floor(Math.random() * 50000));
    addInterval(() => { if (bot && botState.connected) try { bot.setQuickBarSlot(Math.floor(Math.random() * 9)); } catch(e) {} }, 30000 + Math.floor(Math.random() * 90000));
    if (config.utils["anti-afk"].sneak) { try { bot.setControlState("sneak", true); } catch(e) {} }
  }
  if (config.movement && config.movement.enabled !== false) {
    if (config.movement["circle-walk"] && config.movement["circle-walk"].enabled) startCircleWalk(bot, defaultMove);
    if (config.movement["random-jump"] && config.movement["random-jump"].enabled && !(config.movement["circle-walk"] && config.movement["circle-walk"].enabled)) startRandomJump(bot);
    if (config.movement["look-around"] && config.movement["look-around"].enabled) startLookAround(bot);
  }
  if (config.modules.avoidMobs && !config.modules.combat) avoidMobs(bot);
  if (config.modules.combat) combatModule(bot, mcData);
  if (config.modules.beds) bedModule(bot, mcData);
  if (config.modules.chat) chatModule(bot);
  addLog("[Modules] All modules initialized!");
}

function startCircleWalk(bot, defaultMove) {
  const radius = config.movement["circle-walk"].radius;
  let angle = 0, lastPathTime = 0;
  addInterval(() => {
    if (!bot || !botState.connected) return;
    const now = Date.now();
    if (now - lastPathTime < 2000) return;
    lastPathTime = now;
    try {
      const x = bot.entity.position.x + Math.cos(angle) * radius;
      const z = bot.entity.position.z + Math.sin(angle) * radius;
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(Math.floor(x), Math.floor(bot.entity.position.y), Math.floor(z)));
      angle += Math.PI / 4;
      botState.lastActivity = Date.now();
    } catch(e) {}
  }, config.movement["circle-walk"].speed);
}

function startRandomJump(bot) {
  addInterval(() => {
    if (!bot || !botState.connected || typeof bot.setControlState !== "function") return;
    try { bot.setControlState("jump", true); setTimeout(() => { if (bot) bot.setControlState("jump", false); }, 300); botState.lastActivity = Date.now(); } catch(e) {}
  }, config.movement["random-jump"].interval);
}

function startLookAround(bot) {
  addInterval(() => {
    if (!bot || !botState.connected) return;
    try { bot.look(Math.random() * Math.PI * 2 - Math.PI, (Math.random() * Math.PI) / 2 - Math.PI / 4, false); botState.lastActivity = Date.now(); } catch(e) {}
  }, config.movement["look-around"].interval);
}

function avoidMobs(bot) {
  addInterval(() => {
    if (!bot || !botState.connected || typeof bot.setControlState !== "function") return;
    try {
      const entities = Object.values(bot.entities).filter(e => e.type === "mob" || (e.type === "player" && e.username !== bot.username));
      for (const e of entities) {
        if (!e.position) continue;
        if (bot.entity.position.distanceTo(e.position) < 5) {
          bot.setControlState("back", true);
          setTimeout(() => { if (bot) bot.setControlState("back", false); }, 500);
          break;
        }
      }
    } catch(e) {}
  }, 2000);
}

function combatModule(bot, mcData) {
  let lastAttackTime = 0, lockedTarget = null, lockedTargetExpiry = 0;
  bot.on("physicsTick", () => {
    if (!bot || !botState.connected) return;
    if (!config.combat["attack-mobs"]) return;
    const now = Date.now();
    if (now - lastAttackTime < 620) return;
    try {
      if (lockedTarget && now < lockedTargetExpiry && bot.entities[lockedTarget.id] && lockedTarget.position && bot.entity.position.distanceTo(lockedTarget.position) < 4) {
        bot.attack(lockedTarget);
        lastAttackTime = now;
        return;
      } else { lockedTarget = null; }
      const mobs = Object.values(bot.entities).filter(e => e.type === "mob" && e.position && bot.entity.position.distanceTo(e.position) < 4);
      if (mobs.length) { lockedTarget = mobs[0]; lockedTargetExpiry = now + 3000; bot.attack(lockedTarget); lastAttackTime = now; }
    } catch(e) {}
  });
  bot.on("health", () => {
    if (!config.combat["auto-eat"]) return;
    try {
      if (bot.food < 14) {
        const food = bot.inventory.items().find(i => i.foodPoints && i.foodPoints > 0);
        if (food) bot.equip(food, "hand").then(() => bot.consume()).catch(() => {});
      }
    } catch(e) {}
  });
}

function bedModule(bot, mcData) {
  let isTryingToSleep = false;
  addInterval(async () => {
    if (!bot || !botState.connected) return;
    if (!config.beds["place-night"]) return;
    try {
      const isNight = bot.time.timeOfDay >= 12500 && bot.time.timeOfDay <= 23500;
      if (isNight && !isTryingToSleep) {
        const bedBlock = bot.findBlock({ matching: (block) => block.name.includes("bed"), maxDistance: 8 });
        if (bedBlock) {
          isTryingToSleep = true;
          try { await bot.sleep(bedBlock); addLog("[Bed] Sleeping..."); } catch(e) {}
          finally { isTryingToSleep = false; }
        }
      }
    } catch(e) { isTryingToSleep = false; }
  }, 10000);
}

function chatModule(bot) {
  bot.on("chat", (username, message) => {
    if (!bot || username === bot.username) return;
    try {
      if (config.discord && config.discord.enabled && config.discord.events && config.discord.events.chat) {
        sendDiscordWebhook(`💬 **${username}**: ${message}`, 0x7289da);
      }
      if (config.chat && config.chat.respond) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes("hello") || lowerMsg.includes("hi")) bot.chat(`Hello, ${username}!`);
        if (message.startsWith("!tp ")) { const target = message.split(" ")[1]; if (target) bot.chat(`/tp ${target}`); }
      }
    } catch(e) {}
  });
}

let lastDiscordSend = 0;
const DISCORD_RATE_LIMIT_MS = 5000;
function sendDiscordWebhook(content, color = 0x0099ff) {
  if (!config.discord || !config.discord.enabled || !config.discord.webhookUrl || config.discord.webhookUrl.includes("YOUR_DISCORD")) return;
  const now = Date.now();
  if (now - lastDiscordSend < DISCORD_RATE_LIMIT_MS) return;
  lastDiscordSend = now;
  const protocol = config.discord.webhookUrl.startsWith("https") ? https : http;
  const urlParts = new URL(config.discord.webhookUrl);
  const payload = JSON.stringify({ username: config.name, embeds: [{ description: content, color: color, timestamp: new Date().toISOString(), footer: { text: "AFK Bot" } }] });
  const options = { hostname: urlParts.hostname, port: 443, path: urlParts.pathname + urlParts.search, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload, "utf8") } };
  const req = protocol.request(options, () => {});
  req.on("error", (e) => addLog(`[Discord] Error: ${e.message}`));
  req.write(payload);
  req.end();
}

// Start Express server
const server = app.listen(PORT, "0.0.0.0", () => addLog(`[Server] HTTP server started on port ${PORT}`));
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    const fallbackPort = PORT + 1;
    addLog(`[Server] Port ${PORT} in use - trying port ${fallbackPort}`);
    app.listen(fallbackPort, "0.0.0.0");
  } else addLog(`[Server] Error: ${err.message}`);
});

// Self-ping for Render
const SELF_PING_INTERVAL = 10 * 60 * 1000;
function startSelfPing() {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (!renderUrl) { addLog("[KeepAlive] Self-ping disabled (no RENDER_EXTERNAL_URL)"); return; }
  setInterval(() => {
    const protocol = renderUrl.startsWith("https") ? https : http;
    protocol.get(`${renderUrl}/ping`, () => {}).on("error", (err) => addLog(`[KeepAlive] Self-ping failed: ${err.message}`));
  }, SELF_PING_INTERVAL);
  addLog("[KeepAlive] Self-ping system started (every 10 min)");
}
startSelfPing();

setInterval(() => addLog(`[Memory] Heap: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`), 5 * 60 * 1000);

// Start the bot
addLog("=".repeat(50));
addLog("  Minecraft AFK Bot v2.5 - Forge Edition");
addLog("=".repeat(50));
addLog(`Server: ${config.server.ip}:${config.server.port}`);
addLog(`Version: ${config.server.version || "auto"}`);
addLog(`Auto-Reconnect: ${config.utils["auto-reconnect"] ? "Enabled" : "Disabled"}`);
addLog("Forge handshake ENABLED");
addLog("=".repeat(50));
createBot();
