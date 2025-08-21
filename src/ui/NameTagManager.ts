import * as THREE from 'three';

interface NameTagData {
  playerId: string;
  name: string;
  object3D: THREE.Object3D;
  element: HTMLDivElement;
}

export class NameTagManager {
  private container: HTMLDivElement;
  private nameTags = new Map<string, NameTagData>();
  private camera: THREE.Camera | null = null;
  private canvas: HTMLCanvasElement | null = null;
  
  constructor() {
    // Create container for all name tags
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
    `;
    document.body.appendChild(this.container);
    
    // Add CSS for pixel-perfect text
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Silkscreen:wght@400&display=swap');
      
      .name-tag {
        position: absolute;
        color: #00e5ff;
        font-family: 'Silkscreen', monospace;
        font-size: 8px;
        font-weight: 400;
        text-shadow: 
          1px 0 0 #000,
          -1px 0 0 #000,
          0 1px 0 #000,
          0 -1px 0 #000;
        white-space: nowrap;
        transform-origin: center bottom;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        -webkit-font-smoothing: none;
        -moz-osx-font-smoothing: unset;
        font-smooth: never;
        text-rendering: optimizeSpeed;
        pointer-events: none;
        user-select: none;
        z-index: 1000;
      }
    `;
    document.head.appendChild(style);
  }
  
  setCamera(camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;
  }
  
  addNameTag(playerId: string, name: string, object3D: THREE.Object3D) {
    // Remove existing if any
    this.removeNameTag(playerId);
    
    // Create name tag element
    const element = document.createElement('div');
    element.className = 'name-tag';
    element.textContent = name.substring(0, 8);
    element.style.display = 'none';
    
    this.container.appendChild(element);
    
    this.nameTags.set(playerId, {
      playerId,
      name,
      object3D,
      element
    });
  }
  
  removeNameTag(playerId: string) {
    const tag = this.nameTags.get(playerId);
    if (tag) {
      tag.element.remove();
      this.nameTags.delete(playerId);
    }
  }
  
  update(localPosition: THREE.Vector3) {
    if (!this.camera || !this.canvas) return;
    
    this.nameTags.forEach(tag => {
      const worldPos = new THREE.Vector3();
      tag.object3D.getWorldPosition(worldPos);
      worldPos.y += 2.0; // Higher above the ship
      
      // Calculate distance from camera (not from ship)
      const cameraPos = new THREE.Vector3();
      this.camera.getWorldPosition(cameraPos);
      const distance = worldPos.distanceTo(cameraPos);
      
      const maxDistance = 50;
      const minDistance = 2;
      
      if (distance > maxDistance) {
        tag.element.style.display = 'none';
        return;
      }
      
      // Project to screen coordinates
      const screenPos = worldPos.clone();
      screenPos.project(this.camera);
      
      // Check if behind camera or off-screen
      if (screenPos.z > 1 || Math.abs(screenPos.x) > 1.5 || Math.abs(screenPos.y) > 1.5) {
        tag.element.style.display = 'none';
        return;
      }
      
      // Convert normalized device coordinates to screen pixels
      const x = (screenPos.x + 1) * this.canvas.width * 0.5;
      const y = (-screenPos.y + 1) * this.canvas.height * 0.5;
      
      // Calculate distance-based scale (discrete levels for pixel-perfect)
      let scale: number;
      if (distance < 10) {
        scale = 3; // Close: large
      } else if (distance < 20) {
        scale = 2; // Medium distance
      } else {
        scale = 1; // Far: small
      }
      
      // Snap to pixel grid based on scale
      const snappedX = Math.round(x / scale) * scale;
      const snappedY = Math.round(y / scale) * scale;
      
      // Position and scale the element
      tag.element.style.left = `${snappedX}px`;
      tag.element.style.top = `${snappedY}px`;
      tag.element.style.transform = `translate(-50%, -100%) scale(${scale})`;
      tag.element.style.display = 'block';
      
      // Fade based on distance (but keep readable)
      if (distance < minDistance) {
        tag.element.style.opacity = '0';
      } else if (distance > maxDistance - 10) {
        const fade = 1 - ((distance - (maxDistance - 10)) / 10);
        tag.element.style.opacity = Math.max(0.3, fade).toString();
      } else {
        tag.element.style.opacity = '1';
      }
    });
  }
  
  dispose() {
    this.nameTags.forEach(tag => tag.element.remove());
    this.nameTags.clear();
    this.container.remove();
  }
}