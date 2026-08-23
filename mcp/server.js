#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────────────
 * Helpotron Admin Agent MCP server (zero-dep, stdio, JSON-RPC 2.0)
 *
 * Bridges Claude Code to the helpotron ADMIN AGENT chat: every tool call is
 * sent to POST /api/agent/chat as the admin identity (RoniDev by default)
 * with session_mode_override=auto, so the backend's LLM intent resolver
 * decides the action, the permission engine approves it for the admin, and
 * the agent executes it (user lookup, credit adjustments, health checks,
 * platform operations) — the reply + execution record come back here.
 *
 * Config (read from env or mcp/.env):
 *   HELPOTRON_BASE_URL        default http://localhost:8000
 *   HELPOTRON_ADMIN_PUBLIC_ID default RoniDev
 *   HELPOTRON_ADMIN_PASSWORD  required (or HELPOTRON_ADMIN_TOKEN for a
 *                             pre-issued Bearer JWT)
 *
 * Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout (MCP stdio).
 * Node >= 18 (built-in fetch). No npm install.
 * ────────────────────────────────────────────────────────────────────────── */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/* ── config ─────────────────────────────────────────────────────────────── */
function loadEnv() {
  const env = {};
  try {
    const p = path.join(__dirname, '.env');
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* .env optional */ }
  return env;
}

const env = loadEnv();
const BASE = env.HELPOTRON_BASE_URL || process.env.HELPOTRON_BASE_URL || 'http://localhost:8000';
const ADMIN_ID = env.HELPOTRON_ADMIN_PUBLIC_ID || process.env.HELPOTRON_ADMIN_PUBLIC_ID || 'RoniDev';
const ADMIN_PASSWORD = env.HELPOTRON_ADMIN_PASSWORD || process.env.HELPOTRON_ADMIN_PASSWORD || '';
const ADMIN_TOKEN = env.HELPOTRON_ADMIN_TOKEN || process.env.HELPOTRON_ADMIN_TOKEN || '';

if (!ADMIN_PASSWORD && !ADMIN_TOKEN) {
  process.stderr.write('helpotron-mcp: set HELPOTRON_ADMIN_PASSWORD (or HELPOTRON_ADMIN_TOKEN) in mcp/.env\n');
  process.exit(1);
}

/* ── session (login once, re-login on expiry) ───────────────────────────── */
let session = { cookies: '', csrf: '', bearer: ADMIN_TOKEN || '' };

async function login() {
  if (ADMIN_TOKEN) { session.bearer = ADMIN_TOKEN; return; }
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_id: ADMIN_ID, password: ADMIN_PASSWORD }),
    redirect: 'manual',
  });
  if (!res.ok) throw new Error(`login failed (HTTP ${res.status})`);
  const body = await res.json();
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const parts = [];
  for (const c of setCookies) {
    const name = c.split('=')[0].trim();
    const value = c.split('=').slice(1).join('=').split(';')[0].trim();
    parts.push(`${name}=${value}`);
  }
  session.cookies = parts.join('; ');
  session.csrf = body.csrf_token || '';
  if (!session.cookies.includes('helpotron_session=')) {
    throw new Error('login did not set a session cookie');
  }
}

async function chat(text) {
  const headers = {
    'Content-Type': 'application/json',
    ...(session.cookies ? { Cookie: session.cookies } : {}),
    ...(session.csrf ? { 'X-CSRF-Token': session.csrf } : {}),
    ...(session.bearer ? { Authorization: `Bearer ${session.bearer}` } : {}),
  };
  const res = await fetch(`${BASE}/api/agent/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ assignment_id: 0, text, session_mode_override: 'auto' }),
  });
  if (res.status === 401) {
    // Session expired (or token rejected) — re-login once and retry.
    await login();
    return chat(text);
  }
  if (res.status === 403) {
    // CSRF rotated — re-login to refresh both cookies.
    await login();
    return chat(text);
  }
  if (!res.ok) {
    throw new Error(`agent chat failed (HTTP ${res.status})`);
  }
  return res.json();
}

/* ── JSON-RPC plumbing ──────────────────────────────────────────────────── */
const rl = readline.createInterface({ input: process.stdin, terminal: false });

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

const TOOLS = [
  {
    name: 'admin_chat',
    description: `Send a message to the helpotron ADMIN AGENT (identity: ${ADMIN_ID}). The agent resolves the intent and executes admin operations directly — user lookup, credit adjustments, system health, platform operations, and anything else the admin agent supports. Returns the agent's reply plus the execution record.`,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Instruction for the admin agent, e.g. "check system health", "give <public_id> 50 credits", "look up <public_id>", "show platform stats".' },
      },
      required: ['message'],
    },
  },
  {
    name: 'admin_health',
    description: 'Fast liveness check of the helpotron backend (GET /api/health — no auth needed).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

async function handleCall(id, name, args) {
  const params = args || {};
  try {
    if (name === 'admin_health') {
      const res = await fetch(`${BASE}/api/health`);
      const body = await res.json();
      respond(id, {
        content: [{ type: 'text', text: JSON.stringify({ http: res.status, ...body }) }],
      });
      return;
    }
    if (name === 'admin_chat') {
      const text = String(params.message || '').trim();
      if (!text) return respondError(id, -32602, 'message is required');
      const data = await chat(text);
      respond(id, {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: data.status || 'unknown',
            reply: data.reply || data.message || '',
            execution: data.execution || null,
            permission_required: data.status === 'permission_required' ? (data.permission_request || null) : null,
          }, null, 2),
        }],
      });
      return;
    }
    respondError(id, -32602, `unknown tool: ${name}`);
  } catch (e) {
    respondError(id, -32603, String(e && e.message ? e.message : e));
  }
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }

  if (msg.method === 'initialize') {
    respond(msg.id, {
      protocolVersion: msg.params && msg.params.protocolVersion ? msg.params.protocolVersion : '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'helpotron-admin-agent', version: '1.0.0' },
    });
  } else if (msg.method === 'notifications/initialized') {
    /* no response for notifications */
  } else if (msg.method === 'ping') {
    respond(msg.id, {});
  } else if (msg.method === 'tools/list') {
    respond(msg.id, { tools: TOOLS });
  } else if (msg.method === 'tools/call') {
    handleCall(msg.id, msg.params && msg.params.name, msg.params && msg.params.arguments);
  } else if (msg.id !== undefined) {
    respondError(msg.id, -32601, `method not found: ${msg.method}`);
  }
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
