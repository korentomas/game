import * as THREE from 'three';
import { SimpleNameTag } from '../ui/SimpleNameTag';
import { RemoteShip } from '../entities/RemoteShip';

export interface NetworkPlayer {
  id: string;
  name: string;
  position: THREE.Vector3;
  rotation: number;
  velocity: THREE.Vector3;
  group: THREE.Group;
  ship?: RemoteShip;
  lastUpdate: number;
  nameTag?: SimpleNameTag;
  nameTagGroup?: THREE.Group; // Separate group for UI scene
  isThrusting?: boolean;
  heading?: number;
  customization?: any; // Ship customization data
}

interface InputCommand {
  sequence: number;
  timestamp: number;
  position: THREE.Vector3;
  rotation: number;
  velocity: THREE.Vector3;
  inputs: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    rotateLeft: boolean;
    rotateRight: boolean;
  };
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private peers = new Map<string, RTCPeerConnection>(); // Multiple peer connections
  private dataChannels = new Map<string, RTCDataChannel>(); // Multiple data channels
  
  public localPlayerId: string = '';
  public localPlayerName: string = '';
  public roomId: string = 'default';
  public remotePlayers = new Map<string, NetworkPlayer>();
  public isFirstPlayer: boolean = false; // Whether we're the first player in room
  public localCustomization: any; // Local player's ship customization
  
  // Client-side prediction
  private inputSequence = 0;
  private pendingInputs: InputCommand[] = [];
  private lastServerUpdate = 0;
  
  // Delta compression
  private lastSentPosition = new THREE.Vector3();
  private lastSentRotation = 0;
  private lastSentVelocity = new THREE.Vector3();
  
  private onPlayerJoined?: (player: NetworkPlayer) => void;
  private onPlayerLeft?: (playerId: string) => void;
  private onPlayerUpdate?: (player: NetworkPlayer) => void;
  private onChatMessage?: (playerId: string, playerName: string, text: string) => void;
  private onPlayerShoot?: (playerId: string, position: THREE.Vector3, direction: THREE.Vector3) => void;
  private onMaterialSpawn?: (id: string, position: THREE.Vector3, type: string) => void;
  private onMaterialCollect?: (id: string, collectorId: string) => void;
  private onMaterialUpdate?: (materialId: string, position: THREE.Vector3) => void;
  // Junk spawn callback removed - deterministic generation
  private onJunkDestroy?: (junkId: string, destroyerId: string) => void;
  private onJunkHit?: (junkId: string, damage: number, hitterId: string) => void;
  
  constructor() {}
  
  
  async connect(url: string = 'ws://localhost:3001') {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('Connected to signaling server');
        resolve();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      };
      
      this.ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        await this.handleSignalingMessage(data);
      };
      
      this.ws.onclose = () => {
        console.log('Disconnected from signaling server');
      };
    });
  }
  
  joinRoom(roomId: string = 'default', customization?: any, sessionToken?: string) {
    this.roomId = roomId;
    this.localCustomization = customization;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'join-room',
        roomId: roomId,
        customization: customization,
        token: sessionToken
      }));
    }
  }
  
  private async handleSignalingMessage(message: any) {
    switch (message.type) {
      case 'welcome':
        this.localPlayerId = message.playerId;
        this.localPlayerName = `Player-${message.playerId.substring(0, 4).toUpperCase()}`;
        console.log('Assigned player ID:', this.localPlayerId, 'as', this.localPlayerName);
        break;
        
      case 'room-joined':
        console.log('Joined room:', message.roomId);
        break;
        
      case 'existing-players':
        // Players already in room
        if (message.players.length === 0) {
          // We're the first player!
          this.isFirstPlayer = true;
          console.log('We are the first player in the room - generating junk for others');
        } else {
          this.isFirstPlayer = false;
          console.log('Other players already in room - waiting for junk sync');
        }
        for (const playerData of message.players) {
          this.addRemotePlayer(playerData.id, playerData.position, playerData.rotation, playerData.customization, playerData.username);
        }
        break;
        
      case 'player-joined':
        // New player joined
        this.addRemotePlayer(message.playerId, message.position, message.rotation, message.customization, message.username);
        // Initiate WebRTC connection as the caller
        await this.initiateWebRTC(message.playerId);
        break;
        
      case 'player-left':
        this.removeRemotePlayer(message.playerId);
        break;
        
      case 'player-update':
        // Fallback position update via WebSocket
        this.updateRemotePlayer(message.playerId, message.position, message.rotation);
        break;
        
      case 'offer':
        await this.handleWebRTCOffer(message.data, message.from);
        break;
        
      case 'answer':
        await this.handleWebRTCAnswer(message.data, message.from);
        break;
        
      case 'ice-candidate':
        await this.handleICECandidate(message.data, message.from);
        break;
        
      case 'chat-message':
        // Received chat message from another player
        // Use the playerName from the message (sent by server with actual username)
        const playerName = message.playerName || `Player-${message.playerId.substring(0, 4).toUpperCase()}`;
        console.log('Received chat via WebSocket from', message.playerId, ':', message.text);
        if (this.onChatMessage) {
          this.onChatMessage(message.playerId, playerName, message.text);
        }
        break;
        
      case 'shoot':
        // Handle shoot message via WebSocket fallback
        console.log('Received shoot via WebSocket from', message.playerId);
        if (this.onPlayerShoot && message.playerId && message.playerId !== this.localPlayerId) {
          const position = new THREE.Vector3(message.position.x, message.position.y, message.position.z);
          // Calculate direction from heading (rotation around Y axis)
          // Match ship's heading calculation
          const direction = new THREE.Vector3(Math.sin(message.heading), 0, Math.cos(message.heading));
          this.onPlayerShoot(message.playerId, position, direction);
        }
        break;
        
      case 'material-spawn':
        // Handle material spawn from other players
        if (this.onMaterialSpawn && message.id) {
          const position = new THREE.Vector3(message.position.x, message.position.y, message.position.z);
          this.onMaterialSpawn(message.id, position, message.type);
        }
        break;
        
      case 'material-collect':
        // Handle material collection by other players
        if (this.onMaterialCollect && message.id) {
          this.onMaterialCollect(message.id, message.collectorId);
        }
        break;
        
      case 'material-update':
        // Handle material position update (magnetization sync)
        if (this.onMaterialUpdate && message.materialId) {
          const position = new THREE.Vector3(message.position.x, message.position.y, message.position.z);
          this.onMaterialUpdate(message.materialId, position);
        }
        break;
        
      // Junk spawn messages no longer needed - deterministic generation
      // case 'junk-spawn': removed
        
      case 'junk-destroy':
        // Handle junk destruction by other players
        if (this.onJunkDestroy && message.junkId) {
          this.onJunkDestroy(message.junkId, message.destroyerId);
        }
        break;
        
      case 'junk-hit':
        // Handle junk hit visual effects from other players
        if (this.onJunkHit && message.junkId) {
          this.onJunkHit(message.junkId, message.damage, message.hitterId);
        }
        break;
        
      case 'customization-update':
        // Handle customization update from other players
        if (message.playerId && message.customization) {
          const player = this.remotePlayers.get(message.playerId);
          if (player && player.ship) {
            player.customization = message.customization;
            player.ship.applyCustomization(message.customization);
          }
        }
        break;
    }
  }
  
  private async initiateWebRTC(remotePlayerId: string) {
    console.log('Initiating WebRTC connection to', remotePlayerId);
    
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    
    this.peers.set(remotePlayerId, peer);
    
    // Create data channel
    const dataChannel = peer.createDataChannel('game', {
      ordered: false,
      maxRetransmits: 0
    });
    
    this.dataChannels.set(remotePlayerId, dataChannel);
    this.setupDataChannel(dataChannel, remotePlayerId);
    
    // Handle ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          to: remotePlayerId,
          data: event.candidate
        }));
      }
    };
    
    // Create and send offer
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'offer',
        to: remotePlayerId,
        data: offer
      }));
    }
  }
  
  private async handleWebRTCOffer(offer: RTCSessionDescriptionInit, from: string) {
    console.log('Received WebRTC offer from', from);
    
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
    
    this.peers.set(from, peer);
    
    // Handle incoming data channel
    peer.ondatachannel = (event) => {
      const dataChannel = event.channel;
      this.dataChannels.set(from, dataChannel);
      this.setupDataChannel(dataChannel, from);
    };
    
    // Handle ICE candidates
    peer.onicecandidate = (event) => {
      if (event.candidate && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          to: from,
          data: event.candidate
        }));
      }
    };
    
    await peer.setRemoteDescription(offer);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'answer',
        to: from,
        data: answer
      }));
    }
  }
  
  private async handleWebRTCAnswer(answer: RTCSessionDescriptionInit, from: string) {
    console.log('Received WebRTC answer from', from);
    const peer = this.peers.get(from);
    if (peer) {
      await peer.setRemoteDescription(answer);
    }
  }
  
  private async handleICECandidate(candidate: RTCIceCandidate, from: string) {
    const peer = this.peers.get(from);
    if (peer) {
      await peer.addIceCandidate(candidate);
    }
  }
  
  private setupDataChannel(dataChannel: RTCDataChannel, playerId: string) {
    if (!dataChannel) return;
    
    dataChannel.onopen = () => {
      console.log('DataChannel opened with', playerId);
    };
    
    dataChannel.onclose = () => {
      console.log('DataChannel closed with', playerId);
      this.dataChannels.delete(playerId);
    };
    
    dataChannel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'position') {
          this.updateRemotePlayer(data.playerId, data.position, data.rotation, data.velocity, data.isThrusting);
        } else if (data.type === 'delta') {
          // Apply delta updates
          const player = this.remotePlayers.get(data.playerId);
          if (player) {
            const newPosition = {
              x: player.position.x + (data.deltaPosition?.x || 0),
              y: player.position.y + (data.deltaPosition?.y || 0),
              z: player.position.z + (data.deltaPosition?.z || 0)
            };
            const newRotation = player.rotation + (data.deltaRotation || 0);
            const newVelocity = data.deltaVelocity ? {
              x: player.velocity.x + data.deltaVelocity.x,
              y: player.velocity.y + data.deltaVelocity.y,
              z: player.velocity.z + data.deltaVelocity.z
            } : player.velocity;
            
            this.updateRemotePlayer(data.playerId, newPosition, newRotation, newVelocity, data.isThrusting);
          }
        } else if (data.type === 'shoot') {
          // Handle remote player shooting
          const senderId = data.playerId || playerId;
          console.log('Received shoot via DataChannel from', senderId);
          if (senderId && this.onPlayerShoot && senderId !== this.localPlayerId) {
            const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            // Calculate direction from heading (rotation around Y axis)
            // Match ship's heading calculation
            const direction = new THREE.Vector3(Math.sin(data.heading), 0, Math.cos(data.heading));
            this.onPlayerShoot(senderId, position, direction);
          }
        } else if (data.type === 'material-spawn') {
          // Handle material spawn via DataChannel
          if (this.onMaterialSpawn && data.id) {
            const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            this.onMaterialSpawn(data.id, position, data.materialType);
          }
        } else if (data.type === 'material-collect') {
          // Handle material collection via DataChannel
          if (this.onMaterialCollect && data.id) {
            this.onMaterialCollect(data.id, data.collectorId);
          }
        } else if (data.type === 'material-update') {
          // Handle material position update (magnetization sync)
          if (this.onMaterialUpdate && data.materialId) {
            const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            this.onMaterialUpdate(data.materialId, position);
          }
        // Junk spawn messages no longer handled - deterministic generation
        } else if (data.type === 'junk-destroy') {
          // Handle junk destruction via DataChannel
          if (this.onJunkDestroy && data.junkId) {
            this.onJunkDestroy(data.junkId, data.destroyerId);
          }
        } else if (data.type === 'junk-hit') {
          // Handle junk hit visual effects via DataChannel
          if (this.onJunkHit && data.junkId) {
            this.onJunkHit(data.junkId, data.damage, data.hitterId);
          }
        } else if (data.type === 'chat-message') {
          // Handle chat message via DataChannel
          const senderId = data.playerId || playerId;
          const player = this.remotePlayers.get(senderId);
          const playerName = player?.name || `Player-${senderId.substring(0, 4).toUpperCase()}`;
          console.log('Received chat via DataChannel from', senderId, ':', data.text);
          if (this.onChatMessage && senderId !== this.localPlayerId) {
            this.onChatMessage(senderId, playerName, data.text);
          }
        }
      } catch (err) {
        console.error('Error parsing DataChannel message:', err);
      }
    };
  }
  
  sendPosition(position: THREE.Vector3, rotation: number, velocity: THREE.Vector3, inputs?: any, isThrusting?: boolean) {
    const sequence = ++this.inputSequence;
    const timestamp = Date.now();
    
    // Store input for reconciliation
    if (inputs) {
      this.pendingInputs.push({
        sequence,
        timestamp,
        position: position.clone(),
        rotation,
        velocity: velocity.clone(),
        inputs
      });
      
      // Keep only last 60 inputs (about 1 second at 60fps)
      if (this.pendingInputs.length > 60) {
        this.pendingInputs.shift();
      }
    }
    
    // Delta compression - only send changes
    const positionDelta = position.clone().sub(this.lastSentPosition);
    const rotationDelta = rotation - this.lastSentRotation;
    const velocityDelta = velocity.clone().sub(this.lastSentVelocity);
    
    // Check if we need to send an update (threshold to avoid tiny updates)
    const positionChanged = positionDelta.lengthSq() > 0.001;
    const rotationChanged = Math.abs(rotationDelta) > 0.01;
    const velocityChanged = velocityDelta.lengthSq() > 0.001;
    
    if (!positionChanged && !rotationChanged && !velocityChanged && !inputs) {
      return; // No significant change, skip update
    }
    
    // Decide between delta and full update
    const useDelta = this.lastSentPosition.lengthSq() > 0; // Have we sent a position before?
    
    const data: any = {
      type: useDelta ? 'delta' : 'position',
      playerId: this.localPlayerId,
      sequence,
      timestamp
    };
    
    if (useDelta) {
      // Send deltas
      data.deltaPosition = { x: positionDelta.x, y: positionDelta.y, z: positionDelta.z };
      data.deltaRotation = rotationDelta;
      data.deltaVelocity = { x: velocityDelta.x, y: velocityDelta.y, z: velocityDelta.z };
    } else {
      // Send full state (first update or fallback)
      data.position = { x: position.x, y: position.y, z: position.z };
      data.rotation = rotation;
      data.velocity = { x: velocity.x, y: velocity.y, z: velocity.z };
    }
    
    if (inputs) {
      data.inputs = inputs;
    }
    
    if (isThrusting !== undefined) {
      data.isThrusting = isThrusting;
    }
    
    // Update last sent values
    this.lastSentPosition.copy(position);
    this.lastSentRotation = rotation;
    this.lastSentVelocity.copy(velocity);
    
    // Send to all open data channels
    let sentViaDataChannel = false;
    this.dataChannels.forEach((dataChannel, playerId) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
        sentViaDataChannel = true;
      }
    });
    
    // Fallback to WebSocket if no data channels are open
    if (!sentViaDataChannel && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'position-update',
        position: { x: position.x, y: position.y, z: position.z },
        rotation: rotation
      }));
    }
  }
  
  private addRemotePlayer(id: string, position: any, rotation: number, customization?: any, username?: string) {
    if (this.remotePlayers.has(id)) return;
    
    // Use provided username or fallback to generated name
    const name = username || `Player-${id.substring(0, 4).toUpperCase()}`;
    
    // Create RemoteShip with customization
    const remoteShip = new RemoteShip(customization);
    
    const player: NetworkPlayer = {
      id,
      name,
      position: new THREE.Vector3(position.x, position.y, position.z),
      rotation: rotation,
      velocity: new THREE.Vector3(),
      group: remoteShip.group,
      ship: remoteShip,
      lastUpdate: Date.now(),
      customization: customization
    };
    
    // Create name tag (will be added to UI scene separately)
    player.nameTag = new SimpleNameTag(name);
    player.nameTagGroup = new THREE.Group();
    player.nameTagGroup.add(player.nameTag.sprite);
    
    this.remotePlayers.set(id, player);
    
    if (this.onPlayerJoined) {
      this.onPlayerJoined(player);
    }
    
    console.log('Added remote player:', id, 'as', name);
  }
  
  private removeRemotePlayer(id: string) {
    const player = this.remotePlayers.get(id);
    if (!player) return;
    
    // Clean up name tag
    if (player.nameTag) {
      player.nameTag.dispose();
    }
    
    this.remotePlayers.delete(id);
    
    if (this.onPlayerLeft) {
      this.onPlayerLeft(id);
    }
    
    console.log('Removed remote player:', id);
  }
  
  private updateRemotePlayer(id: string, position: any, rotation: number, velocity?: any, isThrusting?: boolean) {
    const player = this.remotePlayers.get(id);
    if (!player) {
      // Player doesn't exist yet, add them
      this.addRemotePlayer(id, position, rotation);
      return;
    }
    
    // Store target position for interpolation
    player.position.set(position.x, position.y, position.z);
    player.rotation = rotation;
    player.heading = rotation; // Store heading for projectile direction
    
    if (velocity) {
      player.velocity.set(velocity.x, velocity.y, velocity.z);
    }
    
    if (isThrusting !== undefined) {
      player.isThrusting = isThrusting;
    }
    
    player.lastUpdate = Date.now();
    
    if (this.onPlayerUpdate) {
      this.onPlayerUpdate(player);
    }
  }
  
  update(dt: number, localPosition?: THREE.Vector3, camera?: THREE.Camera) {
    const now = Date.now();
    
    // Interpolate and extrapolate remote player positions
    this.remotePlayers.forEach(player => {
      const timeSinceUpdate = (now - player.lastUpdate) / 1000;
      
      // Extrapolate position based on velocity
      const extrapolatedPos = player.position.clone();
      if (timeSinceUpdate < 0.5) { // Only extrapolate for recent updates
        extrapolatedPos.add(
          player.velocity.clone().multiplyScalar(timeSinceUpdate * 0.5)
        );
      }
      
      // Smooth interpolation with some extrapolation
      const lerpFactor = Math.min(dt * 15, 1);
      player.group.position.lerp(extrapolatedPos, lerpFactor);
      
      // Rotate smoothly
      const targetRotation = player.rotation;
      const currentRotation = player.group.rotation.y;
      let rotationDiff = targetRotation - currentRotation;
      
      // Normalize rotation difference to [-PI, PI]
      while (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
      while (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
      
      player.group.rotation.y += rotationDiff * lerpFactor;
      
      // Update thruster effects for remote ships
      if (player.ship && player.isThrusting !== undefined) {
        player.ship.updateThruster(
          player.isThrusting,
          player.group.position,
          player.group.rotation.y,
          player.velocity,
          dt
        );
      }
      
      // Update name tag position and visibility
      if (player.nameTagGroup && player.nameTag && localPosition) {
        // Sync name tag position with ship
        player.nameTagGroup.position.copy(player.group.position);
        player.nameTagGroup.rotation.copy(player.group.rotation);
        
        // Update visibility based on distance
        const distance = player.group.position.distanceTo(localPosition);
        player.nameTag.updateVisibility(distance);
      }
    });
  }
  
  sendChatMessage(text: string) {
    if (!this.localPlayerId) {
      console.error('Cannot send chat message: localPlayerId not set');
      return;
    }
    
    const data = {
      type: 'chat-message',
      playerId: this.localPlayerId,
      text: text
    };
    
    console.log('Sending chat message:', data);
    
    // Send to all open data channels for better performance
    let sentViaDataChannel = false;
    this.dataChannels.forEach((dataChannel, playerId) => {
      if (dataChannel.readyState === 'open') {
        console.log('Sending chat via DataChannel to', playerId);
        dataChannel.send(JSON.stringify(data));
        sentViaDataChannel = true;
      }
    });
    
    // Also send via WebSocket as fallback
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('Sending chat via WebSocket');
      this.ws.send(JSON.stringify(data));
    } else if (!sentViaDataChannel) {
      console.log('No connection available to send chat message');
    }
  }
  
  sendShoot(position: THREE.Vector3, heading: number) {
    const data = {
      type: 'shoot',
      playerId: this.localPlayerId,
      position: { x: position.x, y: position.y, z: position.z },
      heading: heading
    };
    
    console.log('Sending shoot message:', data);
    
    // Send to all open data channels
    let sentViaDataChannel = false;
    this.dataChannels.forEach((dataChannel, playerId) => {
      if (dataChannel.readyState === 'open') {
        console.log('Sending shoot via DataChannel to', playerId);
        dataChannel.send(JSON.stringify(data));
        sentViaDataChannel = true;
      }
    });
    
    // Also send via WebSocket to ensure all players get it
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('Sending shoot via WebSocket');
      this.ws.send(JSON.stringify(data));
    } else if (!sentViaDataChannel) {
      console.log('No connection available to send shoot');
    }
  }
  
  sendMaterialSpawn(id: string, position: THREE.Vector3, type: string) {
    const data = {
      type: 'material-spawn',
      id: id,
      position: { x: position.x, y: position.y, z: position.z },
      materialType: type,
      spawnerId: this.localPlayerId
    };
    
    // Send to all open data channels
    this.dataChannels.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
      }
    });
    
    // Also send via WebSocket to ensure all players get it
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  sendMaterialCollect(id: string) {
    const data = {
      type: 'material-collect',
      id: id,
      collectorId: this.localPlayerId
    };
    
    // Send to all open data channels
    this.dataChannels.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
      }
    });
    
    // Also send via WebSocket to ensure all players get it
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  sendMaterialUpdate(materialId: string, position: THREE.Vector3) {
    const data = {
      type: 'material-update',
      materialId: materialId,
      position: { x: position.x, y: position.y, z: position.z }
    };
    
    // Send to all open data channels (high frequency updates)
    this.dataChannels.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
      }
    });
    
    // Don't send via WebSocket for position updates (too frequent)
  }
  
  // Junk spawn no longer needs network sync - each player generates deterministically
  
  
  sendJunkDestroy(junkId: string) {
    const data = {
      type: 'junk-destroy',
      junkId: junkId,
      destroyerId: this.localPlayerId
    };
    
    // Send to all open data channels
    this.dataChannels.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
      }
    });
    
    // Also send via WebSocket to ensure all players get it
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  sendJunkHit(junkId: string, damage: number) {
    const data = {
      type: 'junk-hit',
      junkId: junkId,
      damage: damage,
      hitterId: this.localPlayerId
    };
    
    // Send to all open data channels
    this.dataChannels.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
      }
    });
    
    // Also send via WebSocket for reliability
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  
  setCallbacks(callbacks: {
    onPlayerJoined?: (player: NetworkPlayer) => void;
    onPlayerLeft?: (playerId: string) => void;
    onPlayerUpdate?: (player: NetworkPlayer) => void;
    onChatMessage?: (playerId: string, playerName: string, text: string) => void;
    onPlayerShoot?: (playerId: string, position: THREE.Vector3, direction: THREE.Vector3) => void;
    onMaterialSpawn?: (id: string, position: THREE.Vector3, type: string) => void;
    onMaterialCollect?: (id: string, collectorId: string) => void;
    onMaterialUpdate?: (materialId: string, position: THREE.Vector3) => void;
    // onJunkSpawn removed - deterministic generation
    onJunkDestroy?: (junkId: string, destroyerId: string) => void;
    onJunkHit?: (junkId: string, damage: number, hitterId: string) => void;
  }) {
    this.onPlayerJoined = callbacks.onPlayerJoined;
    this.onPlayerLeft = callbacks.onPlayerLeft;
    this.onPlayerUpdate = callbacks.onPlayerUpdate;
    this.onChatMessage = callbacks.onChatMessage;
    this.onPlayerShoot = callbacks.onPlayerShoot;
    this.onMaterialSpawn = callbacks.onMaterialSpawn;
    this.onMaterialCollect = callbacks.onMaterialCollect;
    this.onMaterialUpdate = callbacks.onMaterialUpdate;
    // onJunkSpawn removed - deterministic generation
    this.onJunkDestroy = callbacks.onJunkDestroy;
    this.onJunkHit = callbacks.onJunkHit;
  }
  
  disconnect() {
    // Close all data channels
    this.dataChannels.forEach((dataChannel) => {
      dataChannel.close();
    });
    this.dataChannels.clear();
    
    // Close all peer connections
    this.peers.forEach((peer) => {
      peer.close();
    });
    this.peers.clear();
    
    if (this.ws) {
      this.ws.close();
    }
  }
  
  sendCustomizationUpdate(customization: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'customization-update',
        customization,
        playerId: this.localPlayerId
      }));
    }
  }
}