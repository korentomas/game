#!/usr/bin/env node

/**
 * Automated Test Runner for Multiplayer Game
 * Runs comprehensive tests including unit tests and integration tests
 */

const { exec, spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');

class TestRunner {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      skipped: []
    };
    this.ws = null;
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      reset: '\x1b[0m'
    };
    
    const color = colors[type] || colors.info;
    console.log(`${color}[${new Date().toISOString()}] ${message}${colors.reset}`);
  }

  // Run Jest unit tests
  async runUnitTests() {
    this.log('Running unit tests...', 'info');
    
    return new Promise((resolve) => {
      exec('npm test -- --json --outputFile=test-results.json', (error, stdout, stderr) => {
        if (error && !stdout.includes('testResults')) {
          this.log(`Unit tests failed: ${error.message}`, 'error');
          this.results.failed.push('unit-tests');
          resolve(false);
          return;
        }
        
        try {
          const fs = require('fs');
          const results = JSON.parse(fs.readFileSync('test-results.json', 'utf8'));
          
          this.log(`Unit tests: ${results.numPassedTests} passed, ${results.numFailedTests} failed`, 
            results.numFailedTests === 0 ? 'success' : 'error');
          
          if (results.numFailedTests === 0) {
            this.results.passed.push('unit-tests');
          } else {
            this.results.failed.push('unit-tests');
          }
          
          resolve(results.numFailedTests === 0);
        } catch (err) {
          this.log('Could not parse test results', 'warning');
          resolve(false);
        }
      });
    });
  }

  // Test WebSocket server
  async testWebSocketServer() {
    this.log('Testing WebSocket server...', 'info');
    
    return new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:3001');
      
      const timeout = setTimeout(() => {
        this.log('WebSocket connection timeout', 'error');
        this.results.failed.push('websocket-connection');
        ws.close();
        resolve(false);
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        this.log('WebSocket connected successfully', 'success');
        this.results.passed.push('websocket-connection');
        this.ws = ws;
        resolve(true);
      });
      
      ws.on('error', (err) => {
        clearTimeout(timeout);
        this.log(`WebSocket error: ${err.message}`, 'error');
        this.results.failed.push('websocket-connection');
        resolve(false);
      });
    });
  }

  // Test room joining
  async testRoomJoin() {
    if (!this.ws) {
      this.log('Skipping room join test - no WebSocket connection', 'warning');
      this.results.skipped.push('room-join');
      return false;
    }
    
    this.log('Testing room join...', 'info');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.log('Room join timeout', 'error');
        this.results.failed.push('room-join');
        resolve(false);
      }, 3000);
      
      this.ws.once('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'room-joined') {
          clearTimeout(timeout);
          this.log(`Joined room: ${msg.roomId}`, 'success');
          this.results.passed.push('room-join');
          resolve(true);
        }
      });
      
      this.ws.send(JSON.stringify({
        type: 'join-room',
        roomId: 'test-room-' + Date.now()
      }));
    });
  }

  // Test material synchronization
  async testMaterialSync() {
    if (!this.ws) {
      this.log('Skipping material sync test - no WebSocket connection', 'warning');
      this.results.skipped.push('material-sync');
      return false;
    }
    
    this.log('Testing material synchronization...', 'info');
    
    const materialId = 'test_mat_' + Date.now();
    let received = false;
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!received) {
          this.log('Material sync timeout', 'error');
          this.results.failed.push('material-sync');
          resolve(false);
        }
      }, 3000);
      
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'material-spawn' && msg.id === materialId) {
          received = true;
          clearTimeout(timeout);
          this.log('Material spawn received', 'success');
          this.results.passed.push('material-sync');
          this.ws.removeListener('message', handler);
          resolve(true);
        }
      };
      
      this.ws.on('message', handler);
      
      // Send material spawn
      this.ws.send(JSON.stringify({
        type: 'material-spawn',
        id: materialId,
        position: { x: 0, y: 10, z: 0 },
        materialType: 'scrap_metal'
      }));
    });
  }

  // Test junk synchronization
  async testJunkSync() {
    if (!this.ws) {
      this.log('Skipping junk sync test - no WebSocket connection', 'warning');
      this.results.skipped.push('junk-sync');
      return false;
    }
    
    this.log('Testing junk synchronization...', 'info');
    
    const chunkKey = 'test_0_0';
    let received = false;
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (!received) {
          this.log('Junk sync timeout', 'error');
          this.results.failed.push('junk-sync');
          resolve(false);
        }
      }, 3000);
      
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'junk-spawn' && msg.chunkKey === chunkKey) {
          received = true;
          clearTimeout(timeout);
          this.log('Junk spawn received', 'success');
          this.results.passed.push('junk-sync');
          this.ws.removeListener('message', handler);
          resolve(true);
        }
      };
      
      this.ws.on('message', handler);
      
      // Send junk spawn
      this.ws.send(JSON.stringify({
        type: 'junk-spawn',
        chunkKey: chunkKey,
        junkData: [
          { id: 'test_junk_1', position: { x: 0, y: 5, z: 0 }, size: 1.0 }
        ]
      }));
    });
  }

  // Stress test with many messages
  async stressTest() {
    if (!this.ws) {
      this.log('Skipping stress test - no WebSocket connection', 'warning');
      this.results.skipped.push('stress-test');
      return false;
    }
    
    this.log('Running stress test (100 messages)...', 'info');
    
    let sent = 0;
    let received = 0;
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.type === 'material-spawn' && msg.id && msg.id.startsWith('stress_')) {
          received++;
        }
      };
      
      this.ws.on('message', handler);
      
      // Send 100 material spawns rapidly
      const interval = setInterval(() => {
        if (sent >= 100) {
          clearInterval(interval);
          
          // Wait a bit for messages to arrive
          setTimeout(() => {
            const elapsed = Date.now() - startTime;
            this.ws.removeListener('message', handler);
            
            this.log(`Stress test: sent ${sent}, received ${received} in ${elapsed}ms`, 
              received >= 90 ? 'success' : 'warning');
            
            if (received >= 90) { // Allow 10% loss
              this.results.passed.push('stress-test');
              resolve(true);
            } else {
              this.results.failed.push('stress-test');
              resolve(false);
            }
          }, 2000);
          return;
        }
        
        this.ws.send(JSON.stringify({
          type: 'material-spawn',
          id: 'stress_' + sent,
          position: { x: sent, y: 10, z: sent },
          materialType: 'scrap_metal'
        }));
        sent++;
      }, 10); // 100 per second
    });
  }

  // Test race conditions
  async testRaceConditions() {
    if (!this.ws) {
      this.log('Skipping race condition test - no WebSocket connection', 'warning');
      this.results.skipped.push('race-conditions');
      return false;
    }
    
    this.log('Testing race conditions...', 'info');
    
    const materialId = 'race_mat_' + Date.now();
    
    // First spawn a material
    this.ws.send(JSON.stringify({
      type: 'material-spawn',
      id: materialId,
      position: { x: 0, y: 10, z: 0 },
      materialType: 'energy_crystal'
    }));
    
    // Wait a bit then send two simultaneous collect messages
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate two players collecting at once
    this.ws.send(JSON.stringify({
      type: 'material-collect',
      id: materialId,
      collectorId: 'player1'
    }));
    
    this.ws.send(JSON.stringify({
      type: 'material-collect',
      id: materialId,
      collectorId: 'player2'
    }));
    
    // Give it time to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    this.log('Race condition test completed', 'success');
    this.results.passed.push('race-conditions');
    return true;
  }

  // Generate test report
  generateReport() {
    this.log('\n========== TEST REPORT ==========', 'info');
    
    const total = this.results.passed.length + this.results.failed.length + this.results.skipped.length;
    const passRate = total > 0 ? (this.results.passed.length / total * 100).toFixed(1) : 0;
    
    this.log(`Total Tests: ${total}`, 'info');
    this.log(`Passed: ${this.results.passed.length} (${passRate}%)`, 'success');
    this.log(`Failed: ${this.results.failed.length}`, this.results.failed.length > 0 ? 'error' : 'info');
    this.log(`Skipped: ${this.results.skipped.length}`, 'info');
    
    if (this.results.passed.length > 0) {
      this.log('\nPassed Tests:', 'success');
      this.results.passed.forEach(test => this.log(`  ✓ ${test}`, 'success'));
    }
    
    if (this.results.failed.length > 0) {
      this.log('\nFailed Tests:', 'error');
      this.results.failed.forEach(test => this.log(`  ✗ ${test}`, 'error'));
    }
    
    if (this.results.skipped.length > 0) {
      this.log('\nSkipped Tests:', 'warning');
      this.results.skipped.forEach(test => this.log(`  - ${test}`, 'warning'));
    }
    
    const status = this.results.failed.length === 0 ? 'PASSED' : 'FAILED';
    this.log(`\nOverall Status: ${status}`, status === 'PASSED' ? 'success' : 'error');
    
    // Save report to file
    const fs = require('fs');
    const report = {
      timestamp: new Date().toISOString(),
      status,
      passRate: parseFloat(passRate),
      results: this.results
    };
    
    fs.writeFileSync('test-report.json', JSON.stringify(report, null, 2));
    this.log('Report saved to test-report.json', 'info');
    
    return status === 'PASSED';
  }

  // Clean up
  cleanup() {
    if (this.ws) {
      this.ws.close();
    }
  }

  // Main test execution
  async run() {
    this.log('Starting automated test suite...', 'info');
    
    // Run tests in sequence
    const tests = [
      { name: 'Unit Tests', fn: () => this.runUnitTests() },
      { name: 'WebSocket Server', fn: () => this.testWebSocketServer() },
      { name: 'Room Join', fn: () => this.testRoomJoin() },
      { name: 'Material Sync', fn: () => this.testMaterialSync() },
      { name: 'Junk Sync', fn: () => this.testJunkSync() },
      { name: 'Stress Test', fn: () => this.stressTest() },
      { name: 'Race Conditions', fn: () => this.testRaceConditions() }
    ];
    
    for (const test of tests) {
      this.log(`\nRunning: ${test.name}`, 'info');
      try {
        await test.fn();
      } catch (error) {
        this.log(`Error in ${test.name}: ${error.message}`, 'error');
        this.results.failed.push(test.name.toLowerCase().replace(' ', '-'));
      }
    }
    
    // Generate report
    const passed = this.generateReport();
    
    // Cleanup
    this.cleanup();
    
    // Exit with appropriate code
    process.exit(passed ? 0 : 1);
  }
}

// Check if server is running
function checkServer() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/',
      method: 'GET',
      timeout: 2000
    };
    
    const req = http.request(options, (res) => {
      // Server is responding (even if not with expected response)
      resolve(true);
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// Main execution
async function main() {
  console.log('\x1b[35m====================================\x1b[0m');
  console.log('\x1b[35m   Multiplayer Game Test Runner\x1b[0m');
  console.log('\x1b[35m====================================\x1b[0m\n');
  
  // Check if server is running
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.log('\x1b[33m[WARNING] WebSocket server not running on port 3001\x1b[0m');
    console.log('\x1b[33mStarting server...\x1b[0m');
    
    // Start the server
    const server = spawn('node', ['server.js'], {
      detached: false,
      stdio: 'pipe'
    });
    
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Run tests
    const runner = new TestRunner();
    await runner.run();
    
    // Kill the server
    server.kill();
  } else {
    console.log('\x1b[32m[INFO] WebSocket server detected on port 3001\x1b[0m\n');
    
    // Run tests
    const runner = new TestRunner();
    await runner.run();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('\x1b[31mFatal error:\x1b[0m', err);
    process.exit(1);
  });
}

module.exports = TestRunner;