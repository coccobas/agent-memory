/**
 * Test MCP Server Directly via stdio
 * This simulates what an IDE does when calling the MCP server
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'dist', 'index.js');

console.log('Starting MCP server:', serverPath);
console.log('---');

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

let messageId = 0;

// Send MCP request
function sendRequest(method, params = {}) {
  messageId++;
  const request = {
    jsonrpc: '2.0',
    id: messageId,
    method,
    params
  };

  const message = JSON.stringify(request) + '\n';
  console.log('→ Sending:', method);
  server.stdin.write(message);
  return messageId;
}

// Handle server output
server.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const response = JSON.parse(line);
      console.log('← Response:', JSON.stringify(response, null, 2));
    } catch (e) {
      console.log('← Raw output:', line);
    }
  }
});

server.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

server.on('close', (code) => {
  console.log('Server closed with code:', code);
  process.exit(code || 0);
});

server.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});

// Test sequence
setTimeout(() => {
  console.log('\n=== Test 1: Initialize ===');
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  });
}, 100);

setTimeout(() => {
  console.log('\n=== Test 2: List Tools ===');
  sendRequest('tools/list');
}, 500);

setTimeout(() => {
  console.log('\n=== Test 3: Call memory_health ===');
  sendRequest('tools/call', {
    name: 'memory_health',
    arguments: {}
  });
}, 1000);

setTimeout(() => {
  console.log('\n=== Test 4: Call memory_org with create action ===');
  sendRequest('tools/call', {
    name: 'memory_org',
    arguments: {
      action: 'create',
      name: 'Test Organization'
    }
  });
}, 1500);

// Exit after tests
setTimeout(() => {
  console.log('\n=== Tests complete, closing ===');
  server.kill();
}, 2500);
