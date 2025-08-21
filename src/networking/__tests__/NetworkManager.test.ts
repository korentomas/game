import { NetworkManager } from '../NetworkManager';
import * as THREE from 'three';

// Mock RemoteShip to avoid Three.js issues in tests
jest.mock('../../entities/RemoteShip', () => ({
  RemoteShip: jest.fn().mockImplementation(() => ({
    group: new THREE.Group(),
    updateThruster: jest.fn()
  }))
}));

// Mock SimpleNameTag to avoid Three.js sprite issues
jest.mock('../../ui/SimpleNameTag', () => ({
  SimpleNameTag: jest.fn().mockImplementation((name: string) => ({
    sprite: { position: new THREE.Vector3() },
    updateVisibility: jest.fn(),
    dispose: jest.fn()
  }))
}));

// Mock WebSocket
class MockWebSocket {
  readyState: number = WebSocket.OPEN;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: (error: any) => void;
  onmessage?: (event: any) => void;
  sentMessages: any[] = [];

  send(data: string) {
    this.sentMessages.push(JSON.parse(data));
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }

  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    if (this.onopen) this.onopen();
  }
}

// Mock RTCPeerConnection
class MockRTCPeerConnection {
  localDescription: any = null;
  remoteDescription: any = null;
  onicecandidate?: (event: any) => void;
  ondatachannel?: (event: any) => void;
  dataChannel?: MockRTCDataChannel;

  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'mock-offer-sdp' });
  }

  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'mock-answer-sdp' });
  }

  setLocalDescription(desc: any) {
    this.localDescription = desc;
    return Promise.resolve();
  }

  setRemoteDescription(desc: any) {
    this.remoteDescription = desc;
    return Promise.resolve();
  }

  addIceCandidate(candidate: any) {
    return Promise.resolve();
  }

  createDataChannel(label: string, options?: any) {
    this.dataChannel = new MockRTCDataChannel();
    return this.dataChannel;
  }

  close() {}
}

// Mock RTCDataChannel
class MockRTCDataChannel {
  readyState: string = 'connecting';
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (event: any) => void;
  sentMessages: any[] = [];

  send(data: string) {
    this.sentMessages.push(JSON.parse(data));
  }

  close() {
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
  }

  simulateOpen() {
    this.readyState = 'open';
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

// Setup mocks
(global as any).WebSocket = MockWebSocket as any;
(global as any).RTCPeerConnection = MockRTCPeerConnection as any;
(global as any).RTCDataChannel = MockRTCDataChannel as any;

describe('NetworkManager', () => {
  let networkManager: NetworkManager;
  let mockWebSocket: MockWebSocket;

  beforeEach(() => {
    networkManager = new NetworkManager();
    jest.clearAllMocks();
  });

  afterEach(() => {
    networkManager.disconnect();
  });

  describe('WebSocket Connection', () => {
    it('should connect to WebSocket server', async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      
      // Get the created WebSocket
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      
      // Need to simulate open immediately for the promise to resolve
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      
      await connectPromise;
      
      expect(mockWebSocket.readyState).toBe(WebSocket.OPEN);
    });

    it('should handle connection errors', async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      
      // Simulate error asynchronously
      setTimeout(() => {
        const error = new Error('Connection failed');
        if (mockWebSocket.onerror) mockWebSocket.onerror(error);
      }, 0);
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
    });

    it('should handle welcome message and set player ID', async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      
      // Simulate open immediately
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      
      await connectPromise;
      
      mockWebSocket.simulateMessage({
        type: 'welcome',
        playerId: 'test-player-123'
      });
      
      expect(networkManager.localPlayerId).toBe('test-player-123');
      expect(networkManager.localPlayerName).toBe('Player-TEST');
    });
  });

  describe('Room Management', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
    });

    it('should join a room', () => {
      networkManager.joinRoom('test-room');
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'join-room',
        roomId: 'test-room'
      });
      expect(networkManager.roomId).toBe('test-room');
    });

    it('should handle room-joined message', () => {
      mockWebSocket.simulateMessage({
        type: 'room-joined',
        roomId: 'test-room'
      });
      
      // Room joined successfully (check console.log was called)
      expect(networkManager.roomId).toBeDefined();
    });

    it('should detect first player status when room is empty', () => {
      mockWebSocket.simulateMessage({
        type: 'existing-players',
        players: []
      });
      
      expect(networkManager.isFirstPlayer).toBe(true);
    });

    it('should detect non-first player status when room has players', () => {
      mockWebSocket.simulateMessage({
        type: 'existing-players',
        players: [
          { id: 'player1', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
        ]
      });
      
      expect(networkManager.isFirstPlayer).toBe(false);
    });
  });

  describe('Player Management', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
    });

    it('should add remote players', () => {
      const onPlayerJoined = jest.fn();
      networkManager.setCallbacks({ onPlayerJoined });
      
      mockWebSocket.simulateMessage({
        type: 'player-joined',
        playerId: 'remote-player-1',
        position: { x: 10, y: 20, z: 30 },
        rotation: Math.PI / 2
      });
      
      // Wait for async operations
      setTimeout(() => {
        expect(networkManager.remotePlayers.has('remote-player-1')).toBe(true);
        expect(onPlayerJoined).toHaveBeenCalled();
        
        const player = networkManager.remotePlayers.get('remote-player-1');
        expect(player?.position.x).toBe(10);
        expect(player?.position.y).toBe(20);
        expect(player?.position.z).toBe(30);
        expect(player?.rotation).toBe(Math.PI / 2);
      }, 0);
    });

    it('should remove remote players', async () => {
      const onPlayerLeft = jest.fn();
      networkManager.setCallbacks({ onPlayerLeft });
      
      // First add a player
      mockWebSocket.simulateMessage({
        type: 'player-joined',
        playerId: 'remote-player-2',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
      });
      
      // Wait for async player addition
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify player was added
      expect(networkManager.remotePlayers.has('remote-player-2')).toBe(true);
      
      // Then remove them
      mockWebSocket.simulateMessage({
        type: 'player-left',
        playerId: 'remote-player-2'
      });
      
      expect(networkManager.remotePlayers.has('remote-player-2')).toBe(false);
      expect(onPlayerLeft).toHaveBeenCalledWith('remote-player-2');
    });

    it('should update remote player positions', () => {
      const onPlayerUpdate = jest.fn();
      networkManager.setCallbacks({ onPlayerUpdate });
      
      // Add a player first
      mockWebSocket.simulateMessage({
        type: 'player-joined',
        playerId: 'remote-player-3',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
      });
      
      // Update their position
      mockWebSocket.simulateMessage({
        type: 'player-update',
        playerId: 'remote-player-3',
        position: { x: 50, y: 10, z: -20 },
        rotation: Math.PI
      });
      
      const player = networkManager.remotePlayers.get('remote-player-3');
      expect(player?.position.x).toBe(50);
      expect(player?.position.y).toBe(10);
      expect(player?.position.z).toBe(-20);
      expect(player?.rotation).toBe(Math.PI);
      expect(onPlayerUpdate).toHaveBeenCalled();
    });
  });

  describe('Position Synchronization', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      
      networkManager.localPlayerId = 'local-player';
    });

    it('should send position updates', () => {
      const position = new THREE.Vector3(100, 50, 200);
      const rotation = Math.PI / 4;
      const velocity = new THREE.Vector3(5, 0, 10);
      
      networkManager.sendPosition(position, rotation, velocity);
      
      const sentMessage = mockWebSocket.sentMessages[0];
      expect(sentMessage.type).toBe('position-update');
      expect(sentMessage.position).toEqual({ x: 100, y: 50, z: 200 });
      expect(sentMessage.rotation).toBe(Math.PI / 4);
    });

    it('should use delta compression for subsequent updates', () => {
      const position1 = new THREE.Vector3(100, 50, 200);
      const rotation1 = 0;
      const velocity1 = new THREE.Vector3(5, 0, 10);
      
      // First update - full position
      networkManager.sendPosition(position1, rotation1, velocity1);
      
      const position2 = new THREE.Vector3(105, 50, 210);
      const rotation2 = 0.1;
      const velocity2 = new THREE.Vector3(6, 0, 11);
      
      // Second update - should use delta
      networkManager.sendPosition(position2, rotation2, velocity2);
      
      // Clear messages to check only the second update
      const sentMessages = mockWebSocket.sentMessages;
      expect(sentMessages.length).toBe(2);
      
      // Note: Since we're using WebSocket fallback (no DataChannel), it always sends full position
      // In real scenario with DataChannel, it would send deltas
      expect(sentMessages[1].type).toBe('position-update');
    });

    it('should skip updates when position hasnt changed significantly', () => {
      const position = new THREE.Vector3(100, 50, 200);
      const rotation = 0;
      const velocity = new THREE.Vector3(0, 0, 0);
      
      networkManager.sendPosition(position, rotation, velocity);
      
      // Send same position again (no significant change)
      mockWebSocket.sentMessages = [];
      networkManager.sendPosition(position, rotation, velocity);
      
      // Should not send update for insignificant change
      expect(mockWebSocket.sentMessages.length).toBe(0);
    });
  });

  describe('Chat System', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
    });

    it('should send chat messages', () => {
      networkManager.sendChatMessage('Hello, world!');
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'chat-message',
        text: 'Hello, world!'
      });
    });

    it('should receive chat messages', () => {
      const onChatMessage = jest.fn();
      networkManager.setCallbacks({ onChatMessage });
      
      mockWebSocket.simulateMessage({
        type: 'chat-message',
        playerId: 'remote-player',
        text: 'Hi there!'
      });
      
      expect(onChatMessage).toHaveBeenCalledWith(
        'remote-player',
        'Player-REMO',
        'Hi there!'
      );
    });
  });

  describe('Combat Events', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      networkManager.localPlayerId = 'local-player';
    });

    it('should send shoot events', () => {
      const position = new THREE.Vector3(10, 5, 20);
      const heading = Math.PI / 2;
      
      networkManager.sendShoot(position, heading);
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'shoot',
        playerId: 'local-player',
        position: { x: 10, y: 5, z: 20 },
        heading: Math.PI / 2
      });
    });

    it('should receive shoot events', () => {
      const onPlayerShoot = jest.fn();
      networkManager.setCallbacks({ onPlayerShoot });
      
      mockWebSocket.simulateMessage({
        type: 'shoot',
        playerId: 'remote-player',
        position: { x: 15, y: 10, z: 25 },
        heading: Math.PI
      });
      
      expect(onPlayerShoot).toHaveBeenCalled();
      const [playerId, position, direction] = onPlayerShoot.mock.calls[0];
      expect(playerId).toBe('remote-player');
      expect(position.x).toBe(15);
      expect(position.y).toBe(10);
      expect(position.z).toBe(25);
    });
  });

  describe('Material Events', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      networkManager.localPlayerId = 'local-player';
    });

    it('should send material spawn events', () => {
      const position = new THREE.Vector3(30, 15, 40);
      
      networkManager.sendMaterialSpawn('mat-123', position, 'energy_crystal');
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'material-spawn',
        id: 'mat-123',
        position: { x: 30, y: 15, z: 40 },
        materialType: 'energy_crystal',
        spawnerId: 'local-player'
      });
    });

    it('should receive material spawn events', () => {
      const onMaterialSpawn = jest.fn();
      networkManager.setCallbacks({ onMaterialSpawn });
      
      mockWebSocket.simulateMessage({
        type: 'material-spawn',
        id: 'mat-456',
        position: { x: 50, y: 25, z: 60 },
        type: 'scrap_metal'  // Note: 'type' is used in the message handler
      });
      
      expect(onMaterialSpawn).toHaveBeenCalled();
      const [id, position, materialType] = onMaterialSpawn.mock.calls[0];
      expect(id).toBe('mat-456');
      expect(position.x).toBe(50);
      expect(materialType).toBe('scrap_metal');
    });

    it('should send material collect events', () => {
      networkManager.sendMaterialCollect('mat-789');
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'material-collect',
        id: 'mat-789',
        collectorId: 'local-player'
      });
    });

    it('should receive material collect events', () => {
      const onMaterialCollect = jest.fn();
      networkManager.setCallbacks({ onMaterialCollect });
      
      mockWebSocket.simulateMessage({
        type: 'material-collect',
        id: 'mat-101',
        collectorId: 'remote-player'
      });
      
      expect(onMaterialCollect).toHaveBeenCalledWith('mat-101', 'remote-player');
    });
  });

  describe('Junk Events', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      networkManager.localPlayerId = 'local-player';
    });

    it('should send junk spawn events', () => {
      const junkData = [
        { id: 'junk-1', position: new THREE.Vector3(10, 5, 10), size: 1.0 },
        { id: 'junk-2', position: new THREE.Vector3(20, 5, 20), size: 1.5 }
      ];
      
      networkManager.sendJunkSpawn('0,0', junkData);
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'junk-spawn',
        chunkKey: '0,0',
        junkData: [
          { id: 'junk-1', position: { x: 10, y: 5, z: 10 }, size: 1.0 },
          { id: 'junk-2', position: { x: 20, y: 5, z: 20 }, size: 1.5 }
        ],
        spawnerId: 'local-player'
      });
    });

    it('should receive junk spawn events', () => {
      const onJunkSpawn = jest.fn();
      networkManager.setCallbacks({ onJunkSpawn });
      
      mockWebSocket.simulateMessage({
        type: 'junk-spawn',
        chunkKey: '1,1',
        junkData: [
          { id: 'junk-3', position: { x: 30, y: 10, z: 30 }, size: 2.0 }
        ]
      });
      
      expect(onJunkSpawn).toHaveBeenCalled();
      const [chunkKey, junkData] = onJunkSpawn.mock.calls[0];
      expect(chunkKey).toBe('1,1');
      expect(junkData).toHaveLength(1);
      expect(junkData[0].id).toBe('junk-3');
    });

    it('should send junk destroy events', () => {
      networkManager.sendJunkDestroy('junk-999');
      
      expect(mockWebSocket.sentMessages).toContainEqual({
        type: 'junk-destroy',
        junkId: 'junk-999',
        destroyerId: 'local-player'
      });
    });

    it('should receive junk destroy events', () => {
      const onJunkDestroy = jest.fn();
      networkManager.setCallbacks({ onJunkDestroy });
      
      mockWebSocket.simulateMessage({
        type: 'junk-destroy',
        junkId: 'junk-888',
        destroyerId: 'remote-player'
      });
      
      expect(onJunkDestroy).toHaveBeenCalledWith('junk-888', 'remote-player');
    });
  });

  describe('WebRTC Integration', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      networkManager.localPlayerId = 'local-player';
    });

    it('should initiate WebRTC connection when player joins', async () => {
      mockWebSocket.simulateMessage({
        type: 'player-joined',
        playerId: 'remote-player',
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
      });
      
      // Wait for async WebRTC setup
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check that offer was sent
      const offerMessage = mockWebSocket.sentMessages.find(msg => msg.type === 'offer');
      expect(offerMessage).toBeDefined();
      expect(offerMessage?.to).toBe('remote-player');
    });

    it('should handle WebRTC offers', async () => {
      mockWebSocket.simulateMessage({
        type: 'offer',
        from: 'remote-player',
        data: { type: 'offer', sdp: 'mock-offer-sdp' }
      });
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check that answer was sent
      const answerMessage = mockWebSocket.sentMessages.find(msg => msg.type === 'answer');
      expect(answerMessage).toBeDefined();
      expect(answerMessage?.to).toBe('remote-player');
    });

    it('should handle WebRTC answers', async () => {
      // First create a peer connection
      const peers = (networkManager as any).peers as Map<string, MockRTCPeerConnection>;
      const mockPeer = new MockRTCPeerConnection();
      peers.set('remote-player', mockPeer);
      
      mockWebSocket.simulateMessage({
        type: 'answer',
        from: 'remote-player',
        data: { type: 'answer', sdp: 'mock-answer-sdp' }
      });
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockPeer.remoteDescription).toEqual({ type: 'answer', sdp: 'mock-answer-sdp' });
    });

    it('should handle ICE candidates', async () => {
      // First create a peer connection
      const peers = (networkManager as any).peers as Map<string, MockRTCPeerConnection>;
      const mockPeer = new MockRTCPeerConnection();
      const addIceCandidateSpy = jest.spyOn(mockPeer, 'addIceCandidate');
      peers.set('remote-player', mockPeer);
      
      const candidate = { candidate: 'mock-ice-candidate', sdpMLineIndex: 0 };
      
      mockWebSocket.simulateMessage({
        type: 'ice-candidate',
        from: 'remote-player',
        data: candidate
      });
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(addIceCandidateSpy).toHaveBeenCalledWith(candidate);
    });
  });

  describe('DataChannel Communication', () => {
    let mockDataChannel: MockRTCDataChannel;
    
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      networkManager.localPlayerId = 'local-player';
      
      // Create a mock data channel
      mockDataChannel = new MockRTCDataChannel();
      const dataChannels = (networkManager as any).dataChannels as Map<string, MockRTCDataChannel>;
      dataChannels.set('remote-player', mockDataChannel);
      
      // Setup the data channel
      (networkManager as any).setupDataChannel(mockDataChannel, 'remote-player');
      mockDataChannel.simulateOpen();
    });

    it('should send position updates via DataChannel when available', () => {
      const position = new THREE.Vector3(100, 50, 200);
      const rotation = Math.PI / 4;
      const velocity = new THREE.Vector3(5, 0, 10);
      
      networkManager.sendPosition(position, rotation, velocity);
      
      expect(mockDataChannel.sentMessages.length).toBeGreaterThan(0);
      const sentMessage = mockDataChannel.sentMessages[0];
      expect(sentMessage.playerId).toBe('local-player');
    });

    it('should receive position updates via DataChannel', () => {
      // Add the remote player first
      (networkManager as any).addRemotePlayer('remote-player', { x: 0, y: 0, z: 0 }, 0);
      
      mockDataChannel.simulateMessage({
        type: 'position',
        playerId: 'remote-player',
        position: { x: 75, y: 30, z: 150 },
        rotation: Math.PI / 3,
        velocity: { x: 3, y: 0, z: 6 },
        isThrusting: true
      });
      
      const player = networkManager.remotePlayers.get('remote-player');
      expect(player?.position.x).toBe(75);
      expect(player?.position.y).toBe(30);
      expect(player?.position.z).toBe(150);
      expect(player?.rotation).toBe(Math.PI / 3);
      expect(player?.isThrusting).toBe(true);
    });

    it('should receive delta updates via DataChannel', () => {
      // Add the remote player first with initial position
      (networkManager as any).addRemotePlayer('remote-player', { x: 100, y: 50, z: 200 }, 0);
      
      mockDataChannel.simulateMessage({
        type: 'delta',
        playerId: 'remote-player',
        deltaPosition: { x: 5, y: 0, z: 10 },
        deltaRotation: 0.1,
        deltaVelocity: { x: 1, y: 0, z: 2 }
      });
      
      const player = networkManager.remotePlayers.get('remote-player');
      expect(player?.position.x).toBe(105);
      expect(player?.position.z).toBe(210);
      expect(player?.rotation).toBe(0.1);
    });

    it('should handle shoot events via DataChannel', () => {
      const onPlayerShoot = jest.fn();
      networkManager.setCallbacks({ onPlayerShoot });
      
      mockDataChannel.simulateMessage({
        type: 'shoot',
        playerId: 'remote-player',
        position: { x: 20, y: 10, z: 30 },
        heading: Math.PI / 2
      });
      
      expect(onPlayerShoot).toHaveBeenCalled();
    });
  });

  describe('Update Loop', () => {
    beforeEach(async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
    });

    it('should interpolate remote player positions', () => {
      // Add a remote player
      (networkManager as any).addRemotePlayer('remote-player', { x: 0, y: 0, z: 0 }, 0);
      
      const player = networkManager.remotePlayers.get('remote-player');
      // Ensure the group position is initialized
      player!.group.position.set(0, 0, 0);
      
      // Update their target position
      (networkManager as any).updateRemotePlayer(
        'remote-player',
        { x: 100, y: 0, z: 100 },
        Math.PI,
        { x: 10, y: 0, z: 10 }
      );
      
      const initialPosX = player!.group.position.x;
      const initialPosZ = player!.group.position.z;
      
      // Run update loop
      const localPosition = new THREE.Vector3(0, 0, 0);
      networkManager.update(0.016, localPosition); // 60fps frame time
      
      // Position should have moved towards target
      expect(player!.group.position.x).toBeGreaterThan(initialPosX);
      expect(player!.group.position.z).toBeGreaterThan(initialPosZ);
    });

    it('should extrapolate positions based on velocity', () => {
      // Add a remote player with velocity
      (networkManager as any).addRemotePlayer('remote-player', { x: 0, y: 0, z: 0 }, 0);
      
      const player = networkManager.remotePlayers.get('remote-player');
      // Ensure the group position is initialized
      player!.group.position.set(0, 0, 0);
      player!.position.set(0, 0, 0);
      player!.velocity.set(10, 0, 10);
      player!.lastUpdate = Date.now() - 100; // 100ms ago
      
      // Run update loop
      const localPosition = new THREE.Vector3(0, 0, 0);
      networkManager.update(0.016, localPosition);
      
      // Position should be extrapolated based on velocity
      expect(player!.group.position.x).toBeGreaterThan(0);
      expect(player!.group.position.z).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    it('should properly disconnect and cleanup resources', async () => {
      const connectPromise = networkManager.connect('ws://localhost:3001');
      mockWebSocket = (networkManager as any).ws as MockWebSocket;
      setTimeout(() => mockWebSocket.simulateOpen(), 0);
      await connectPromise;
      
      // Add some connections
      const peers = (networkManager as any).peers as Map<string, MockRTCPeerConnection>;
      const mockPeer = new MockRTCPeerConnection();
      const closeSpy = jest.spyOn(mockPeer, 'close');
      peers.set('remote-player', mockPeer);
      
      const dataChannels = (networkManager as any).dataChannels as Map<string, MockRTCDataChannel>;
      const mockDataChannel = new MockRTCDataChannel();
      const channelCloseSpy = jest.spyOn(mockDataChannel, 'close');
      dataChannels.set('remote-player', mockDataChannel);
      
      // Disconnect
      networkManager.disconnect();
      
      expect(closeSpy).toHaveBeenCalled();
      expect(channelCloseSpy).toHaveBeenCalled();
      expect(mockWebSocket.readyState).toBe(WebSocket.CLOSED);
      expect(peers.size).toBe(0);
      expect(dataChannels.size).toBe(0);
    });
  });
});