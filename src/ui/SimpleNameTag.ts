import * as THREE from 'three';

export class SimpleNameTag {
  public sprite: THREE.Sprite;
  private texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  
  constructor(name: string) {
    // Create a higher resolution canvas for crisper text
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 32;
    
    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: false
    })!;
    
    // Create texture BEFORE drawing
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    
    // Now draw the name
    this.drawName(name);
    
    // Create sprite that always faces camera
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false, // Keep size independent of distance
      toneMapped: false // Bypass post-processing for crisp text
    });
    
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(0.15, 0.04, 1); // Smaller, more reasonable size
    this.sprite.position.y = 2.0; // A bit higher above the ship
    this.sprite.renderOrder = 1000; // Render on top of everything
  }
  
  private drawName(name: string) {
    const ctx = this.ctx;
    
    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Settings for crisp pixel text with higher resolution
    ctx.imageSmoothingEnabled = false;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const x = this.canvas.width / 2;
    const y = this.canvas.height / 2;
    
    // Create glow effect with multiple shadow layers
    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#00ffff';
    ctx.fillText(name.substring(0, 10), x, y);
    
    // Add extra glow layers for stronger effect
    ctx.shadowBlur = 4;
    ctx.fillText(name.substring(0, 10), x, y);
    
    // Reset shadow and draw solid text on top
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    
    // Draw dark outline for contrast
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.strokeText(name.substring(0, 10), x, y);
    
    // Draw bright text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name.substring(0, 10), x, y);
    
    this.texture.needsUpdate = true;
  }
  
  updateVisibility(distance: number) {
    // Distance-based visibility and scaling
    if (distance > 50) {
      this.sprite.visible = false;
    } else {
      this.sprite.visible = true;
      
      // Scale based on distance (moderate size)
      const baseScale = 0.15; // Reasonable base scale
      const minScale = 0.08;
      const maxScale = 0.25;
      
      // Simplified scaling that keeps text readable but not huge
      const clampedDistance = Math.max(5, distance);
      const scaleFactor = Math.max(minScale, Math.min(maxScale, baseScale * (20 / clampedDistance)));
      this.sprite.scale.set(scaleFactor, scaleFactor * 0.27, 1);
      
      // Opacity based on distance (but always visible when close)
      const opacity = distance < 5 ? 1.0 : Math.min(1, Math.max(0.4, 1 - (distance - 20) / 30));
      (this.sprite.material as THREE.SpriteMaterial).opacity = opacity;
    }
  }
  
  dispose() {
    this.texture.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}