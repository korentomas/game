import * as THREE from 'three';

export class NameTag {
  private sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  
  constructor(name: string) {
    // Create tiny canvas for pixel-perfect text
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 16;
    this.context = this.canvas.getContext('2d', { 
      imageSmoothingEnabled: false,
      willReadFrequently: true 
    })!;
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(this.canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    
    // Create sprite material
    const material = new THREE.SpriteMaterial({ 
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true  // Scale with distance
    });
    
    // Create sprite
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(0.8, 0.2, 1);  // Much smaller
    this.sprite.position.y = 1.2; // Closer to ship
    
    this.updateName(name);
  }
  
  updateName(name: string) {
    const ctx = this.context;
    
    // Clear canvas
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Setup tiny pixel font
    ctx.imageSmoothingEnabled = false;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // No background - just text with subtle shadow
    
    // Draw shadow (1px offset)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(name.substring(0, 8), this.canvas.width / 2 + 1, this.canvas.height / 2 + 1);
    
    // Draw main text in subtle cyan
    ctx.fillStyle = 'rgba(0, 229, 255, 0.8)';
    ctx.fillText(name.substring(0, 8), this.canvas.width / 2, this.canvas.height / 2);
    
    // Update texture
    (this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true;
  }
  
  get object3D() {
    return this.sprite;
  }
  
  setVisible(visible: boolean) {
    this.sprite.visible = visible;
  }
  
  update(camera: THREE.Camera, distance?: number) {
    // Fade out based on distance
    if (distance !== undefined) {
      const maxDistance = 30;
      const minDistance = 5;
      
      if (distance > maxDistance) {
        this.sprite.visible = false;
      } else if (distance < minDistance) {
        this.sprite.visible = true;
        (this.sprite.material as THREE.SpriteMaterial).opacity = 1;
      } else {
        this.sprite.visible = true;
        // Fade out gradually
        const fade = 1 - ((distance - minDistance) / (maxDistance - minDistance));
        (this.sprite.material as THREE.SpriteMaterial).opacity = fade * 0.8;
      }
    }
  }
  
  dispose() {
    (this.sprite.material as THREE.SpriteMaterial).map?.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
    this.sprite.geometry.dispose();
  }
}