#!/usr/bin/env node

/**
 * Quick verification script for multiplayer sync
 * Tests that junk and materials are properly synchronized
 */

const WebSocket = require('ws');

async function test() {
  console.log('🎮 Testing Multiplayer Sync...\n');
  
  // Create two WebSocket connections to simulate two players
  const player1 = new WebSocket('ws://localhost:3001');
  const player2 = new WebSocket('ws://localhost:3001');
  
  const results = {
    player1Joined: false,
    player2Joined: false,
    junkReceived: false,
    materialReceived: false,
    errors: []
  };
  
  // Wait for connections
  await Promise.all([
    new Promise(resolve => player1.on('open', resolve)),
    new Promise(resolve => player2.on('open', resolve))
  ]);
  
  console.log('✅ Both players connected');
  
  // Set up message handlers
  player1.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Player 1 received:', msg.type);
    
    if (msg.type === 'room-joined') {
      results.player1Joined = true;
    } else if (msg.type === 'existing-players' && msg.players.length === 0) {
      console.log('✅ Player 1 is first player (will generate junk)');
    }
  });
  
  player2.on('message', (data) => {
    const msg = JSON.parse(data);
    console.log('Player 2 received:', msg.type);
    
    if (msg.type === 'room-joined') {
      results.player2Joined = true;
    } else if (msg.type === 'existing-players' && msg.players.length > 0) {
      console.log('✅ Player 2 sees existing players');
    } else if (msg.type === 'junk-spawn') {
      results.junkReceived = true;
      console.log(`✅ Player 2 received junk spawn for chunk ${msg.chunkKey}`);
    } else if (msg.type === 'material-spawn') {
      results.materialReceived = true;
      console.log(`✅ Player 2 received material spawn: ${msg.id}`);
    }
  });
  
  // Join same room
  const testRoom = 'sync-test-' + Date.now();
  
  // Player 1 joins first (will be host)
  player1.send(JSON.stringify({
    type: 'join-room',
    roomId: testRoom
  }));
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Player 2 joins
  player2.send(JSON.stringify({
    type: 'join-room',
    roomId: testRoom
  }));
  
  // Wait for room join
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n📦 Testing junk sync...');
  
  // Player 1 (host) spawns junk
  player1.send(JSON.stringify({
    type: 'junk-spawn',
    chunkKey: '0,0',
    junkData: [
      { id: 'test_junk_1', position: { x: 10, y: 5, z: 10 }, size: 1.0 },
      { id: 'test_junk_2', position: { x: 15, y: 5, z: 15 }, size: 1.5 }
    ]
  }));
  
  // Wait for sync
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log('\n💎 Testing material sync...');
  
  // Player 1 spawns materials
  player1.send(JSON.stringify({
    type: 'material-spawn',
    id: 'test_mat_' + Date.now(),
    position: { x: 0, y: 10, z: 0 },
    materialType: 'energy_crystal'
  }));
  
  // Wait for sync
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Check results
  console.log('\n📊 Results:');
  console.log('Player 1 joined room:', results.player1Joined ? '✅' : '❌');
  console.log('Player 2 joined room:', results.player2Joined ? '✅' : '❌');
  console.log('Junk sync working:', results.junkReceived ? '✅' : '❌');
  console.log('Material sync working:', results.materialReceived ? '✅' : '❌');
  
  const allPassed = results.player1Joined && results.player2Joined && 
                    results.junkReceived && results.materialReceived;
  
  console.log('\n' + (allPassed ? '✅ All tests PASSED!' : '❌ Some tests FAILED'));
  
  // Cleanup
  player1.close();
  player2.close();
  
  process.exit(allPassed ? 0 : 1);
}

test().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});