import { ShipCustomization, ShipCustomizer } from '../entities/ShipCustomization';
import { Ship } from '../entities/Ship';

export class CustomizationMenu {
  private container: HTMLDivElement;
  private isVisible = false;
  private onCustomizationChange?: (customization: ShipCustomization) => void;
  private currentCustomization: ShipCustomization;
  
  constructor() {
    this.currentCustomization = ShipCustomizer.getClassic();
    this.container = this.createMenu();
    document.body.appendChild(this.container);
    
    // Toggle with C key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'c' && !this.isInputFocused()) {
        e.preventDefault();
        this.toggle();
      }
    });
  }
  
  private isInputFocused(): boolean {
    const activeElement = document.activeElement;
    return activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
  }
  
  private createMenu(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.9);
      border: 2px solid #00e5ff;
      border-radius: 8px;
      padding: 20px;
      color: white;
      font-family: 'Press Start 2P', monospace;
      font-size: 10px;
      display: none;
      z-index: 10000;
      min-width: 400px;
    `;
    
    container.innerHTML = `
      <h2 style="margin: 0 0 20px 0; color: #00e5ff; font-size: 14px; text-align: center;">
        SHIP CUSTOMIZATION
      </h2>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #00e5ff;">Ship Model:</label>
        <div style="display: flex; gap: 10px;">
          <button class="model-btn" data-model="fighter" style="${this.getButtonStyle(true)}">Fighter</button>
          <button class="model-btn" data-model="cruiser" style="${this.getButtonStyle()}">Cruiser</button>
          <button class="model-btn" data-model="speeder" style="${this.getButtonStyle()}">Speeder</button>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #00e5ff;">Hull Color:</label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${this.createColorButtons('primary', [
            '#4fc3f7', '#ff4444', '#44ff44', '#ffff44', 
            '#ff44ff', '#44ffff', '#ff8800', '#8844ff'
          ])}
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #00e5ff;">Engine Glow:</label>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${this.createColorButtons('engine', [
            '#00e5ff', '#ff00ff', '#00ff00', '#ffff00', 
            '#ff8800', '#ff0000', '#0088ff', '#ffffff'
          ])}
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 10px; color: #00e5ff;">Decal:</label>
        <div style="display: flex; gap: 10px;">
          <button class="decal-btn" data-decal="none" style="${this.getButtonStyle(true)}">None</button>
          <button class="decal-btn" data-decal="stripes" style="${this.getButtonStyle()}">Stripes</button>
          <button class="decal-btn" data-decal="flames" style="${this.getButtonStyle()}">Flames</button>
          <button class="decal-btn" data-decal="stars" style="${this.getButtonStyle()}">Stars</button>
        </div>
      </div>
      
      <div style="display: flex; gap: 10px; margin-top: 30px;">
        <button id="apply-btn" style="${this.getButtonStyle(false, true)}">Apply</button>
        <button id="random-btn" style="${this.getButtonStyle()}">Random</button>
        <button id="classic-btn" style="${this.getButtonStyle()}">Classic</button>
        <button id="close-btn" style="${this.getButtonStyle()}">Close (C)</button>
      </div>
      
      <div style="margin-top: 15px; text-align: center; color: #888; font-size: 8px;">
        Press C to toggle this menu
      </div>
    `;
    
    // Add event listeners
    this.attachEventListeners(container);
    
    return container;
  }
  
  private getButtonStyle(active = false, primary = false): string {
    const baseStyle = `
      padding: 8px 12px;
      background: ${primary ? '#00e5ff' : active ? '#00e5ff' : 'rgba(0, 232, 255, 0.1)'};
      color: ${primary || active ? 'black' : 'white'};
      border: 1px solid #00e5ff;
      border-radius: 4px;
      font-family: 'Press Start 2P', monospace;
      font-size: 8px;
      cursor: pointer;
      transition: all 0.2s;
    `;
    return baseStyle;
  }
  
  private createColorButtons(type: 'primary' | 'engine', colors: string[]): string {
    return colors.map(color => `
      <button 
        class="color-btn" 
        data-type="${type}" 
        data-color="${color}"
        style="
          width: 30px;
          height: 30px;
          background: ${color};
          border: 2px solid ${color === this.currentCustomization.colors[type] ? 'white' : 'transparent'};
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        "
      ></button>
    `).join('');
  }
  
  private attachEventListeners(container: HTMLDivElement) {
    // Model selection
    container.querySelectorAll('.model-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const model = (e.target as HTMLElement).dataset.model as 'fighter' | 'cruiser' | 'speeder';
        this.currentCustomization.modelType = model;
        this.updateModelButtons(container);
      });
    });
    
    // Color selection
    container.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const type = target.dataset.type as 'primary' | 'engine';
        const color = target.dataset.color!;
        
        if (type === 'primary') {
          this.currentCustomization.colors.primary = color;
        } else if (type === 'engine') {
          this.currentCustomization.colors.engine = color;
          this.currentCustomization.colors.trail = color; // Match trail to engine
        }
        
        this.updateColorButtons(container);
      });
    });
    
    // Decal selection
    container.querySelectorAll('.decal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const decal = (e.target as HTMLElement).dataset.decal as 'none' | 'stripes' | 'flames' | 'stars';
        this.currentCustomization.decalType = decal;
        this.updateDecalButtons(container);
      });
    });
    
    // Action buttons
    container.querySelector('#apply-btn')?.addEventListener('click', () => {
      this.applyCustomization();
    });
    
    container.querySelector('#random-btn')?.addEventListener('click', () => {
      this.currentCustomization = ShipCustomizer.generateRandomCustomization();
      this.updateAllButtons(container);
    });
    
    container.querySelector('#classic-btn')?.addEventListener('click', () => {
      this.currentCustomization = ShipCustomizer.getClassic();
      this.updateAllButtons(container);
    });
    
    container.querySelector('#close-btn')?.addEventListener('click', () => {
      this.hide();
    });
  }
  
  private updateModelButtons(container: HTMLDivElement) {
    container.querySelectorAll('.model-btn').forEach(btn => {
      const isActive = (btn as HTMLElement).dataset.model === this.currentCustomization.modelType;
      (btn as HTMLElement).style.background = isActive ? '#00e5ff' : 'rgba(0, 232, 255, 0.1)';
      (btn as HTMLElement).style.color = isActive ? 'black' : 'white';
    });
  }
  
  private updateColorButtons(container: HTMLDivElement) {
    container.querySelectorAll('.color-btn').forEach(btn => {
      const element = btn as HTMLElement;
      const type = element.dataset.type as 'primary' | 'engine';
      const color = element.dataset.color!;
      const isActive = this.currentCustomization.colors[type] === color;
      element.style.border = `2px solid ${isActive ? 'white' : 'transparent'}`;
    });
  }
  
  private updateDecalButtons(container: HTMLDivElement) {
    container.querySelectorAll('.decal-btn').forEach(btn => {
      const isActive = (btn as HTMLElement).dataset.decal === this.currentCustomization.decalType;
      (btn as HTMLElement).style.background = isActive ? '#00e5ff' : 'rgba(0, 232, 255, 0.1)';
      (btn as HTMLElement).style.color = isActive ? 'black' : 'white';
    });
  }
  
  private updateAllButtons(container: HTMLDivElement) {
    this.updateModelButtons(container);
    this.updateColorButtons(container);
    this.updateDecalButtons(container);
  }
  
  private applyCustomization() {
    // Save to localStorage
    ShipCustomizer.saveToLocalStorage('local', this.currentCustomization);
    
    // Notify callback
    if (this.onCustomizationChange) {
      this.onCustomizationChange(this.currentCustomization);
    }
    
    // Close menu
    this.hide();
  }
  
  show() {
    this.isVisible = true;
    this.container.style.display = 'block';
    
    // Load current customization
    const saved = ShipCustomizer.loadFromLocalStorage('local');
    if (saved) {
      this.currentCustomization = saved;
      this.updateAllButtons(this.container);
    }
  }
  
  hide() {
    this.isVisible = false;
    this.container.style.display = 'none';
  }
  
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  setOnCustomizationChange(callback: (customization: ShipCustomization) => void) {
    this.onCustomizationChange = callback;
  }
}