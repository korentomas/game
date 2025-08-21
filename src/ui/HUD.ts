import { MaterialType } from '../items/MaterialDrop';

export class HUD {
  private element: HTMLDivElement;
  
  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'hud';
    this.element.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      color: #00ff88;
      font-family: monospace;
      font-size: 14px;
      text-shadow: 0 0 5px rgba(0, 255, 136, 0.5);
      background: rgba(0, 0, 0, 0.6);
      padding: 15px;
      border: 1px solid #00ff88;
      border-radius: 4px;
      min-width: 200px;
      z-index: 100;
    `;
    
    parent.appendChild(this.element);
  }
  
  update(data: {
    position: { x: number, y: number, z: number },
    speed: number,
    hull: number,
    energy: number,
    inventory: Record<MaterialType, number>
  }) {
    const inventoryText = Object.entries(data.inventory)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => {
        const name = type.split('_').map(w => 
          w.charAt(0).toUpperCase() + w.slice(1)
        ).join(' ');
        return `${name}: ${count}`;
      })
      .join('<br>') || 'Empty';
    
    // Check for boundary proximity warnings
    const boundaryWarnings: string[] = [];
    const warningDistance = 200;
    
    if (Math.abs(data.position.x - (-2500)) < warningDistance) {
      boundaryWarnings.push('⚠ WEST BOUNDARY');
    } else if (Math.abs(data.position.x - 2500) < warningDistance) {
      boundaryWarnings.push('⚠ EAST BOUNDARY');
    }
    
    if (Math.abs(data.position.z - (-2500)) < warningDistance) {
      boundaryWarnings.push('⚠ NORTH BOUNDARY');
    } else if (Math.abs(data.position.z - 2500) < warningDistance) {
      boundaryWarnings.push('⚠ SOUTH BOUNDARY');
    }
    
    const warningHtml = boundaryWarnings.length > 0 
      ? `<div style="color: #ff8800; font-weight: bold; animation: pulse 1s infinite;">${boundaryWarnings.join('<br>')}</div>`
      : '';
    
    this.element.innerHTML = `
      <style>
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      </style>
      <div style="margin-bottom: 10px; border-bottom: 1px solid #00ff88; padding-bottom: 10px;">
        ${warningHtml}
        <div>Position: ${data.position.x.toFixed(1)}, ${data.position.y.toFixed(1)}, ${data.position.z.toFixed(1)}</div>
        <div>Speed: ${data.speed.toFixed(1)} m/s</div>
        <div>Hull: ${data.hull}%</div>
        <div>Energy: ${data.energy}%</div>
      </div>
      <div>
        <div style="font-weight: bold; margin-bottom: 5px;">Inventory:</div>
        <div style="padding-left: 10px; font-size: 12px;">
          ${inventoryText}
        </div>
      </div>
    `;
  }
  
  dispose() {
    this.element.remove();
  }
}