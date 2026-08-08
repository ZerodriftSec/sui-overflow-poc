#!/usr/bin/env node

/**
 * Webhook Test Server
 *
 * A simple HTTP server that receives webhook POSTs and logs them.
 * Usage:  node scripts/webhook-test-server.mjs [port]
 * Default port: 4444
 *
 * Set your merchant webhook URL to: http://localhost:4444/webhook
 * (or use ngrok to expose it publicly)
 */

import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PORT = parseInt(process.argv[2] || '4000', 10);

// Set WEBHOOK_SECRET to verify HMAC signatures (generate locally: openssl rand -hex 32)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? '';

let count = 0;

const server = createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Webhook test server running. ${count} webhooks received.\n`);
    return;
  }

  // Accept POST on any path
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf-8');

  count++;
  const ts = new Date().toISOString();
  const sig = req.headers['x-noderails-signature'] || '';
  const webhookTs = req.headers['x-noderails-timestamp'] || '';

  // Parse JSON safely
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = body;
  }

  // Signature verification
  let sigValid = '⏭  skipped (no secret set)';
  if (WEBHOOK_SECRET && sig && webhookTs) {
    const signedPayload = `${webhookTs}.${body}`;
    const expected = createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex');
    try {
      sigValid = timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
        ? '✅ valid'
        : '❌ INVALID';
    } catch {
      sigValid = '❌ INVALID (length mismatch)';
    }
  }

  // Log with color
  console.log('\n' + '═'.repeat(70));
  console.log(`📨 Webhook #${count}  •  ${ts}`);
  console.log('─'.repeat(70));
  console.log(`  Path:       ${req.url}`);
  console.log(`  Event:      ${parsed?.event || '(unknown)'}`);
  console.log(`  Signature:  ${sigValid}`);
  console.log(`  Timestamp:  ${webhookTs || '(none)'}`);
  console.log('─'.repeat(70));
  console.log('  Payload:');
  console.log(JSON.stringify(parsed, null, 2).split('\n').map(l => '    ' + l).join('\n'));
  console.log('─'.repeat(70));
  console.log('  Headers:');
  for (const [k, v] of Object.entries(req.headers)) {
    if (k.startsWith('x-') || k === 'content-type') {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log('═'.repeat(70));

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ received: true, count }));
});

server.listen(PORT, () => {
  console.log('');
  console.log('🔔 Webhook Test Server');
  console.log('═'.repeat(50));
  console.log(`  Listening on:  http://localhost:${PORT}`);
  console.log(`  Webhook URL:   http://localhost:${PORT}/webhook`);
  console.log(`  Signature:     ${WEBHOOK_SECRET ? 'will verify' : 'set WEBHOOK_SECRET env to verify'}`);
  console.log('═'.repeat(50));
  console.log('  Waiting for webhooks...\n');
});
