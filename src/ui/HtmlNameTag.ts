import * as THREE from 'three';

export class HtmlNameTag {
  private element: HTMLElement;
  private camera?: THREE.Camera;
  private isVisible: boolean = true;
  
  constructor(playerId: string, playerName: string) {
    // Create HTML element for name tag
    this.element = document.createElement('div');
    this.element.className = 'html-name-tag';
    this.element.setAttribute('data-player-id', playerId);
    this.element.style.cssText = `
      position: absolute;
      background: none;
      color: #00ffff;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      font-weight: bold;
      text-shadow: 1px 1px 0px rgba(0, 0, 0, 1), -1px -1px 0px rgba(0, 0, 0, 1), 1px -1px 0px rgba(0, 0, 0, 1), -1px 1px 0px rgba(0, 0, 0, 1);
      pointer-events: none;
      white-space: nowrap;
      z-index: 999;
      transform: translateX(-50%);
    `;
    
    this.element.textContent = playerName.substring(0, 10); // Limit length
    document.body.appendChild(this.element);
  }
  
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }
  
  updatePosition(worldPosition: THREE.Vector3) {
    if (!this.camera) return;
    
    // Convert world position to screen coordinates  
    const screenPosition = new THREE.Vector3();
    screenPosition.copy(worldPosition);
    screenPosition.y += 2; // Position above ship (lower than speech bubbles)
    screenPosition.project(this.camera);
    
    // Convert to screen pixels
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (screenPosition.y * -0.5 + 0.5) * window.innerHeight;
    
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y - 20}px`;
    
    // Hide if behind camera, too far, or off screen
    const isInFront = screenPosition.z > 0 && screenPosition.z < 1;
    const distance = screenPosition.length();
    const shouldShow = isInFront && distance < 100 && this.isVisible;
    
    this.element.style.display = shouldShow ? 'block' : 'none';
    
    // Fade based on distance
    if (shouldShow) {
      const opacity = distance < 20 ? 1.0 : Math.max(0.3, 1 - (distance - 20) / 40);
      this.element.style.opacity = opacity.toString();
    }
  }
  
  setVisibility(visible: boolean) {
    this.isVisible = visible;
    if (!visible) {
      this.element.style.display = 'none';
    }
  }
  
  dispose() {
    if (this.element && document.body.contains(this.element)) {
      document.body.removeChild(this.element);
    }
  }
}