export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export interface SpeechBubbleData {
  playerId: string;
  playerName: string;
  text: string;
  position: THREE.Vector3;
  timestamp: number;
}

import * as THREE from 'three';

export class Chat {
  private container: HTMLDivElement;
  private messagesEl: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private messages: ChatMessage[] = [];
  private speechBubbles: Map<string, SpeechBubbleData> = new Map();
  private onSendMessage?: (text: string) => void;
  private isVisible = false;
  private camera?: THREE.Camera;
  private scene?: THREE.Scene;
  
  constructor() {
    // Create chat container (Minecraft-style, minimal background)
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 400px;
      height: 200px;
      background: rgba(0, 0, 0, 0.05);
      display: none;
      flex-direction: column;
      font-family: 'Press Start 2P', monospace;
      font-size: 10px;
      color: #ffffff;
      pointer-events: none;
    `;
    
    // Create messages area (Minecraft-style with no visible background)
    this.messagesEl = document.createElement('div');
    this.messagesEl.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      background: none;
    `;
    
    // Style scrollbar and animations (Minecraft-style)
    const style = document.createElement('style');
    style.textContent = `
      .chat-messages::-webkit-scrollbar {
        display: none;
      }
      .chat-input:focus {
        outline: none;
        background: rgba(0, 0, 0, 0.5);
      }
      .minecraft-message {
        text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.8);
        margin-bottom: 2px;
        padding: 2px 4px;
        animation: minecraftFadeIn 0.3s ease;
      }
      .speech-bubble {
        position: absolute;
        background: none;
        color: white;
        padding: 4px 6px;
        font-family: 'Press Start 2P', monospace;
        font-size: 10px;
        font-weight: bold;
        text-shadow: 2px 2px 0px rgba(0, 0, 0, 1), -1px -1px 0px rgba(0, 0, 0, 1), 1px -1px 0px rgba(0, 0, 0, 1), -1px 1px 0px rgba(0, 0, 0, 1);
        pointer-events: none;
        white-space: nowrap;
        z-index: 1000;
      }
      @keyframes minecraftFadeIn {
        from { 
          opacity: 0; 
          transform: translateY(15px) scale(0.95); 
          filter: brightness(0.7);
        }
        to { 
          opacity: 1; 
          transform: translateY(0) scale(1); 
          filter: brightness(1);
        }
      }
      @keyframes bubbleFadeOut {
        0% { 
          opacity: 1; 
          transform: scale(1) translateY(0) rotate(0deg); 
          filter: brightness(1);
        }
        30% { 
          opacity: 1; 
          transform: scale(1.1) translateY(-8px) rotate(1deg); 
          filter: brightness(1.2);
        }
        60% { 
          opacity: 0.7; 
          transform: scale(1.05) translateY(-12px) rotate(-0.5deg); 
          filter: brightness(0.9);
        }
        100% { 
          opacity: 0; 
          transform: scale(0.7) translateY(-25px) rotate(0deg); 
          filter: brightness(0.5);
        }
      }
      @keyframes bubbleAppear {
        0% { 
          opacity: 0; 
          transform: scale(0.5) translateY(10px); 
          filter: blur(2px);
        }
        50% { 
          opacity: 0.8; 
          transform: scale(1.1) translateY(-2px); 
          filter: blur(0.5px);
        }
        100% { 
          opacity: 1; 
          transform: scale(1) translateY(0); 
          filter: blur(0);
        }
      }
      .bubble-fade-out {
        animation: bubbleFadeOut 2s ease-out forwards;
      }
      .bubble-appear {
        animation: bubbleAppear 0.4s ease-out forwards;
      }
    `;
    document.head.appendChild(style);
    this.messagesEl.className = 'chat-messages';
    
    // Create input area (Minecraft-style)
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      padding: 10px;
      display: flex;
      pointer-events: auto;
    `;
    
    this.inputEl = document.createElement('input');
    this.inputEl.className = 'chat-input';
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Type a message... (Enter to send, Esc to close)';
    this.inputEl.style.cssText = `
      flex: 1;
      background: rgba(0, 0, 0, 0.3);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 2px;
      padding: 5px 10px;
      color: #ffffff;
      font-family: 'Press Start 2P', monospace;
      font-size: 9px;
      text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.8);
    `;
    
    inputContainer.appendChild(this.inputEl);
    
    this.container.appendChild(this.messagesEl);
    this.container.appendChild(inputContainer);
    document.body.appendChild(this.container);
    
    // Setup event handlers
    this.setupEventHandlers();
  }
  
  private setupEventHandlers() {
    // Toggle chat with T key
    document.addEventListener('keydown', (e) => {
      if (e.key === 't' && !this.isVisible) {
        e.preventDefault();
        this.show();
      } else if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
    
    // Send message on Enter
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.inputEl.value.trim();
        if (text && this.onSendMessage) {
          this.onSendMessage(text);
          this.inputEl.value = '';
        }
      }
    });
  }
  
  show() {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.inputEl.focus();
    // Stop game input while chatting
    this.inputEl.addEventListener('keydown', this.stopPropagation);
    this.inputEl.addEventListener('keyup', this.stopPropagation);
  }
  
  hide() {
    this.isVisible = false;
    this.container.style.display = 'none';
    this.inputEl.blur();
    // Resume game input
    this.inputEl.removeEventListener('keydown', this.stopPropagation);
    this.inputEl.removeEventListener('keyup', this.stopPropagation);
  }
  
  private stopPropagation(e: Event) {
    e.stopPropagation();
  }
  
  addMessage(message: ChatMessage) {
    this.messages.push(message);
    
    // Keep only last 50 messages
    if (this.messages.length > 50) {
      this.messages.shift();
    }
    
    // Create message element (Minecraft-style)
    const messageEl = document.createElement('div');
    messageEl.className = 'minecraft-message';
    
    // Color code player names
    const nameColor = this.getPlayerColor(message.playerId);
    
    // Minecraft-style chat without timestamps (cleaner look)
    messageEl.innerHTML = `
      <span style="color: ${nameColor}; font-weight: bold;">${this.escapeHtml(message.playerName)}</span><span style="color: #ffffff;">: ${this.escapeHtml(message.text)}</span>
    `;
    
    this.messagesEl.appendChild(messageEl);
    
    // Auto-scroll to bottom
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
  
  private getPlayerColor(playerId: string): string {
    // Generate consistent color for each player
    const colors = ['#00e5ff', '#ff4d6d', '#00ff88', '#ff8800', '#8800ff', '#ffff00'];
    let hash = 0;
    for (let i = 0; i < playerId.length; i++) {
      hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Set camera and scene for 3D speech bubbles
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }
  
  setScene(scene: THREE.Scene) {
    this.scene = scene;
  }
  
  // Add speech bubble above a ship - stores reference to moving object
  addSpeechBubble(playerId: string, playerName: string, text: string, positionReference: THREE.Vector3) {
    if (!this.camera) return;
    
    // Remove existing bubble for this player
    this.removeSpeechBubble(playerId);
    
    // Temporarily hide name tag to avoid duplication (optional)
    // Note: You can enable this if you want to hide name tags during speech bubbles
    // this.hideNameTag(playerId);
    
    // Create speech bubble element
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'speech-bubble bubble-appear';
    bubbleEl.style.transform = 'translateX(-50%)'; // Center horizontally
    bubbleEl.setAttribute('data-player-id', playerId);
    
    // Just show the message - name tag already identifies the player
    bubbleEl.innerHTML = this.escapeHtml(text);
    
    // Add to DOM
    document.body.appendChild(bubbleEl);
    
    // Store bubble data with reference to the position (not a copy)
    const bubbleData: SpeechBubbleData = {
      playerId,
      playerName,
      text,
      position: positionReference, // Store reference, not clone
      timestamp: Date.now()
    };
    this.speechBubbles.set(playerId, bubbleData);
    
    // Update position immediately
    this.updateBubblePosition(bubbleEl, positionReference);
    
    // Auto-remove after 5 seconds with fade animation
    setTimeout(() => {
      bubbleEl.classList.add('bubble-fade-out');
      setTimeout(() => {
        if (document.body.contains(bubbleEl)) {
          document.body.removeChild(bubbleEl);
        }
        this.speechBubbles.delete(playerId);
      }, 2000); // Match animation duration
    }, 3000);
    
    return bubbleEl;
  }
  
  // Helper method to update a single bubble position
  private updateBubblePosition(bubbleEl: HTMLElement, worldPosition: THREE.Vector3) {
    if (!this.camera) return;
    
    // Convert world position to screen coordinates
    const screenPosition = new THREE.Vector3();
    screenPosition.copy(worldPosition);
    screenPosition.y += 3; // Position above ship
    screenPosition.project(this.camera);
    
    // Convert to screen pixels
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (screenPosition.y * -0.5 + 0.5) * window.innerHeight;
    
    bubbleEl.style.left = `${x}px`;
    bubbleEl.style.top = `${y - 40}px`; // Position above the ship
    bubbleEl.style.transform = 'translateX(-50%)'; // Maintain centering during updates
    
    // Hide if behind camera or off screen
    const isVisible = screenPosition.z > 0 && screenPosition.z < 1;
    bubbleEl.style.display = isVisible ? 'block' : 'none';
  }
  
  // Remove speech bubble for a specific player
  removeSpeechBubble(playerId: string) {
    const existingBubbles = document.querySelectorAll(`[data-player-id="${playerId}"]`);
    existingBubbles.forEach(bubble => {
      if (document.body.contains(bubble)) {
        document.body.removeChild(bubble as HTMLElement);
      }
    });
    this.speechBubbles.delete(playerId);
  }
  
  // Update speech bubble positions (call in render loop)
  updateSpeechBubbles() {
    if (!this.camera) return;
    
    // Update each active speech bubble
    this.speechBubbles.forEach((bubbleData, playerId) => {
      const bubbleEl = document.querySelector(`[data-player-id="${playerId}"]`) as HTMLElement;
      if (bubbleEl && bubbleData.position) {
        this.updateBubblePosition(bubbleEl, bubbleData.position);
      }
    });
  }

  setOnSendMessage(callback: (text: string) => void) {
    this.onSendMessage = callback;
  }
  
  addSystemMessage(text: string) {
    const message: ChatMessage = {
      id: Math.random().toString(36),
      playerId: 'system',
      playerName: 'System',
      text,
      timestamp: Date.now()
    };
    this.addMessage(message);
  }
}