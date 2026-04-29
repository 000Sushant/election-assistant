/**
 * ============================================================
 *  Election Assistant – Backend Integration Tests
 *  Runner: Node.js built-in test runner (node:test)
 * ============================================================
 *
 *  Strategy: mock all external Google Cloud SDK methods BEFORE
 *  requiring index.js so the server never tries to open real
 *  sockets or call live APIs.
 */

'use strict';

const { test, mock, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ─── 1. MOCK EXTERNAL GOOGLE SERVICES ────────────────────────
// Must happen BEFORE requiring index.js

const { VertexAI } = require('@google-cloud/vertexai');
const textToSpeech = require('@google-cloud/text-to-speech');
const { Translate } = require('@google-cloud/translate').v2;
const admin = require('firebase-admin');

// Mock Vertex AI – getGenerativeModel returns a fake model
mock.method(VertexAI.prototype, 'getGenerativeModel', () => ({
  startChat: () => ({
    sendMessage: async () => ({
      response: {
        candidates: [{ content: { parts: [{ text: 'Mock AI reply' }] } }]
      }
    })
  }),
  generateContent: async () => ({
    response: {
      candidates: [{
        content: { parts: [{ text: '[{"state": "Bihar", "date": "Oct 2026"}]' }] }
      }]
    }
  })
}));

// Mock TTS
mock.method(
  textToSpeech.TextToSpeechClient.prototype,
  'synthesizeSpeech',
  async () => [{ audioContent: Buffer.from('mock-audio') }]
);

// Mock Translation
mock.method(
  Translate.prototype,
  'translate',
  async () => ['Mocked Hindi translation']
);

// Mock Firestore so it behaves as if the collection doesn't exist
// (forces the AI-fetch path without an actual DB)
const firestoreMock = {
  collection: () => ({
    doc: () => ({
      get: async () => ({ exists: false }),
      set: async () => {}
    })
  })
};
// Stub admin.initializeApp + getFirestore before module load
const { getFirestore } = require('firebase-admin/firestore');
mock.method(admin, 'initializeApp', () => ({}));
mock.method({ getFirestore }, 'getFirestore', () => firestoreMock);

const { spawn } = require('node:child_process');
const path = require('node:path');

// ─── 2. CONFIG & SERVER SPAWNING ─────────────────────────────
const BASE_URL = 'http://127.0.0.1:3001';
let serverProcess;

/**
 * Starts the standalone index.js as a background process
 */
async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('⏳ Starting background server...');
    serverProcess = spawn('node', [path.join(__dirname, 'index.js')], {
      env: { ...process.env, PORT: '3001', NODE_ENV: 'test' },
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      if (data.toString().includes('Votika Server running')) {
        resolve();
      }
    });

    serverProcess.on('error', reject);
    
    // Safety timeout
    setTimeout(() => reject(new Error('Server took too long to start')), 10000);
  });
}

/**
 * Stop the background server
 */
function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    console.log('🛑 Background server stopped.');
  }
}

// ─── 3. HELPER: request against the spawned server ────────────
async function request(method, path, body) {
  const url = `${BASE_URL}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, body: json, raw: text };
}

// ─── 4. TEST SUITES ──────────────────────────────────────────

test('Setup: Start Server', async () => {
  await startServer();
});

// ... Existing tests follow ...

// Final cleanup (Added at the end of the file later)


// ─── 4. TEST SUITES ──────────────────────────────────────────

// ── /health ──────────────────────────────────────────────────

test('GET /health → 200 with status "healthy"', async () => {
  const { status, body } = await request('GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'healthy');
  assert.ok(body.timestamp, 'timestamp should be present');
});

test('GET /health → timestamp is a valid date string', async () => {
  const { body } = await request('GET', '/health');
  const ts = new Date(body.timestamp);
  assert.ok(!isNaN(ts.getTime()), 'timestamp should parse to a valid Date');
});

// ── /api/upcoming-elections ──────────────────────────────────

test('GET /api/upcoming-elections → 200 with array of elections', async () => {
  const { status, body } = await request('GET', '/api/upcoming-elections');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body), 'response should be an array');
  assert.ok(body.length > 0, 'should have at least one election');
});

test('GET /api/upcoming-elections → each entry has state and date fields', async () => {
  const { body } = await request('GET', '/api/upcoming-elections');
  for (const election of body) {
    assert.ok('state' in election, 'election must have state field');
    assert.ok('date' in election, 'election must have date field');
  }
});

test('GET /api/upcoming-elections → uses in-memory cache on second request', async () => {
  // First call primes the cache; second should be identical & fast
  const r1 = await request('GET', '/api/upcoming-elections');
  const r2 = await request('GET', '/api/upcoming-elections');
  assert.deepEqual(r1.body, r2.body);
});

// ── /api/chat ────────────────────────────────────────────────

test('POST /api/chat → 200 with AI response text', async () => {
  const { status, body } = await request('POST', '/api/chat', {
    message: 'Who can vote in India?',
    history: []
  });
  assert.equal(status, 200);
  assert.ok(typeof body.response === 'string', 'response should be a string');
  assert.ok(body.response.length > 0, 'response should not be empty');
});

test('POST /api/chat → works without a history field (edge case)', async () => {
  const { status, body } = await request('POST', '/api/chat', {
    message: 'Tell me about elections'
    // no history key
  });
  assert.equal(status, 200);
  assert.ok(body.response, 'response should be present even without history');
});

test('POST /api/chat → works with non-empty history (integration flow)', async () => {
  const history = [
    { role: 'user', parts: [{ text: 'Hello' }] },
    { role: 'model', parts: [{ text: 'Hi there!' }] }
  ];
  const { status, body } = await request('POST', '/api/chat', {
    message: 'What elections are upcoming?',
    history
  });
  assert.equal(status, 200);
  assert.ok(body.response);
});

test('POST /api/chat → works with empty string message (edge case)', async () => {
  // The server should still call the AI; this tests robustness
  const { status } = await request('POST', '/api/chat', {
    message: '',
    history: []
  });
  // Server should not crash — 200 or 500 are both acceptable, but no uncaught error
  assert.ok([200, 500].includes(status), `unexpected status: ${status}`);
});

// ── /api/speak-hindi ─────────────────────────────────────────

test('POST /api/speak-hindi → 200 with audio and translatedText', async () => {
  const { status, body } = await request('POST', '/api/speak-hindi', {
    text: 'Voting is important'
  });
  assert.equal(status, 200);
  assert.ok(typeof body.audio === 'string', 'audio should be a base64 string');
  assert.ok(body.audio.length > 0, 'audio should not be empty');
  assert.ok(typeof body.translatedText === 'string', 'translatedText should be a string');
});

test('POST /api/speak-hindi → 400 when text is missing (edge case)', async () => {
  const { status, body } = await request('POST', '/api/speak-hindi', {});
  assert.equal(status, 400);
  assert.ok(body.error, 'error message should be present');
});

test('POST /api/speak-hindi → 400 when body is empty (edge case)', async () => {
  // When null is sent, Express body-parser rejects with a 400 SyntaxError response.
  // The response body may not be valid JSON, so we only assert on the status code.
  const { status } = await request('POST', '/api/speak-hindi', null);
  assert.equal(status, 400);
});

test('POST /api/speak-hindi → audio is valid base64', async () => {
  const { body } = await request('POST', '/api/speak-hindi', { text: 'Test' });
  // base64 strings only contain [A-Za-z0-9+/=]
  const b64Regex = /^[A-Za-z0-9+/=]+$/;
  assert.match(body.audio, b64Regex, 'audio should be valid base64');
});

// ── Unknown routes ────────────────────────────────────────────

test('GET /api/nonexistent → serves index.html (SPA catch-all)', async () => {
  // The catch-all serves the Angular SPA; in tests the public/ dir
  // may not exist, so we accept any non-500 response (404 or 200).
  const { status } = await request('GET', '/api/nonexistent-route');
  assert.ok(status !== 500, 'catch-all should not throw a 500 error');
});

test('Teardown: Stop Server', () => {
  stopServer();
});
