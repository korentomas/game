import { ShipCustomization, ShipCustomizer } from '../entities/ShipCustomization';
import { Ship } from '../entities/Ship';

export class CustomizationMenu {
  private container: HTMLDivElement;
  private isVisible = false;
  private onCustomizationChange?: (customization: ShipCustomization) => void;
  private currentCustomization: ShipCustomization;
  private terminalInput: HTMLInputElement | null = null;
  private terminalOutput: HTMLDivElement | null = null;
  private currentPath: string[] = [];
  private commandHistory: string[] = [];
  private historyIndex = -1;
  
  constructor() {
    this.currentCustomization = ShipCustomizer.getClassic();
    this.container = this.createMenu();
    document.body.appendChild(this.container);
    
    // Setup keyboard controls
    this.setupKeyboardControls();
  }
  
  private setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      // If menu is visible, handle keyboard events
      if (this.isVisible) {
        // Always allow ESC to close
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.hide();
          return;
        }
        
        // If terminal input is focused, let it handle its own events
        if (document.activeElement === this.terminalInput) {
          // Don't block anything - let terminal input handle it
          return;
        }
        
        // Otherwise block all game controls when menu is open
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      
      // Toggle with C key only when menu is closed
      if (e.key === 'c' && !this.isInputFocused()) {
        e.preventDefault();
        this.toggle();
        return;
      }
    }, true); // Use capture phase to intercept before other handlers
  }
  
  private isInputFocused(): boolean {
    const activeElement = document.activeElement;
    return activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
  }
  
  private processCommand(command: string) {
    if (!this.terminalOutput) return;
    
    // Add command to history
    this.commandHistory.push(command);
    this.historyIndex = this.commandHistory.length;
    
    // Echo command
    this.addLine(`> ${command}`, '#00e5ff');
    
    const parts = command.toLowerCase().trim().split(' ');
    const cmd = parts[0];
    const args = parts.slice(1);
    
    switch(cmd) {
      case 'help':
      case '?':
        this.showHelp();
        break;
      case 'ls':
      case 'list':
        this.listOptions();
        break;
      case 'set':
        if (args.length >= 2) {
          this.setOption(args[0], args.slice(1).join(' '));
        } else {
          this.addLine('Usage: set <property> <value>', '#ff4444');
        }
        break;
      case 'show':
        this.showCurrentConfig();
        break;
      case 'random':
        this.randomizeConfig();
        break;
      case 'classic':
        this.setClassicConfig();
        break;
      case 'apply':
        this.applyCustomization();
        break;
      case 'exit':
      case 'quit':
        this.hide();
        break;
      case 'clear':
      case 'cls':
        if (this.terminalOutput) {
          this.terminalOutput.innerHTML = '';
          this.showWelcome();
        }
        break;
      default:
        if (cmd) {
          this.addLine(`Unknown command: ${cmd}. Type 'help' for commands.`, '#ff4444');
        }
        break;
    }
  }
  
  private showHelp() {
    this.addLine('╔════════════════════════════════════════════╗', '#00e5ff');
    this.addLine('║         SHIP CUSTOMIZATION TERMINAL        ║', '#00e5ff');
    this.addLine('╚════════════════════════════════════════════╝', '#00e5ff');
    this.addLine('');
    this.addLine('COMMANDS:', '#ffff44');
    this.addLine('  help      - Show this help', '#ffffff');
    this.addLine('  ls        - List available options', '#ffffff');
    this.addLine('  show      - Show current configuration', '#ffffff');
    this.addLine('  set       - Set a property (see below)', '#ffffff');
    this.addLine('  random    - Generate random configuration', '#ffffff');
    this.addLine('  classic   - Reset to classic ship', '#ffffff');
    this.addLine('  apply     - Apply changes and exit', '#ffffff');
    this.addLine('  clear     - Clear terminal', '#ffffff');
    this.addLine('  exit      - Exit without saving', '#ffffff');
    this.addLine('');
    this.addLine('SET COMMANDS:', '#ffff44');
    this.addLine('  set model [fighter|cruiser|speeder]', '#ffffff');
    this.addLine('  set hull [1-8]    - Choose hull color', '#ffffff');
    this.addLine('  set engine [1-8]  - Choose engine glow', '#ffffff');
    this.addLine('  set decal [none|stripes|flames|stars]', '#ffffff');
  }
  
  private listOptions() {
    this.addLine('AVAILABLE OPTIONS:', '#ffff44');
    this.addLine('');
    this.addLine('Models:', '#00e5ff');
    this.addLine('  1. fighter  - Balanced all-rounder', '#ffffff');
    this.addLine('  2. cruiser  - Heavy and tanky', '#ffffff');
    this.addLine('  3. speeder  - Fast and agile', '#ffffff');
    this.addLine('');
    this.addLine('Hull Colors:', '#00e5ff');
    this.addLine('  1. Classic Blue  (#4fc3f7)', '#4fc3f7');
    this.addLine('  2. Red          (#ff4444)', '#ff4444');
    this.addLine('  3. Green        (#44ff44)', '#44ff44');
    this.addLine('  4. Yellow       (#ffff44)', '#ffff44');
    this.addLine('  5. Magenta      (#ff44ff)', '#ff44ff');
    this.addLine('  6. Cyan         (#44ffff)', '#44ffff');
    this.addLine('  7. Orange       (#ff8800)', '#ff8800');
    this.addLine('  8. Purple       (#8844ff)', '#8844ff');
    this.addLine('');
    this.addLine('Engine Colors:', '#00e5ff');
    this.addLine('  1. Cyan         (#00e5ff)', '#00e5ff');
    this.addLine('  2. Magenta      (#ff00ff)', '#ff00ff');
    this.addLine('  3. Green        (#00ff00)', '#00ff00');
    this.addLine('  4. Yellow       (#ffff00)', '#ffff00');
    this.addLine('  5. Orange       (#ff8800)', '#ff8800');
    this.addLine('  6. Red          (#ff0000)', '#ff0000');
    this.addLine('  7. Blue         (#0088ff)', '#0088ff');
    this.addLine('  8. White        (#ffffff)', '#ffffff');
  }
  
  private setOption(property: string, value: string) {
    const hullColors = ['#4fc3f7', '#ff4444', '#44ff44', '#ffff44', '#ff44ff', '#44ffff', '#ff8800', '#8844ff'];
    const engineColors = ['#00e5ff', '#ff00ff', '#00ff00', '#ffff00', '#ff8800', '#ff0000', '#0088ff', '#ffffff'];
    
    switch(property) {
      case 'model':
        if (['fighter', 'cruiser', 'speeder'].includes(value)) {
          this.currentCustomization.modelType = value as 'fighter' | 'cruiser' | 'speeder';
          this.addLine(`Model set to: ${value}`, '#44ff44');
          this.updatePreview();
        } else {
          this.addLine('Invalid model. Use: fighter, cruiser, or speeder', '#ff4444');
        }
        break;
      case 'hull':
        const hullIndex = parseInt(value) - 1;
        if (hullIndex >= 0 && hullIndex < hullColors.length) {
          this.currentCustomization.colors.primary = hullColors[hullIndex];
          this.addLine(`Hull color set to: ${hullColors[hullIndex]}`, '#44ff44');
          this.updatePreview();
        } else {
          this.addLine('Invalid hull color. Use numbers 1-8', '#ff4444');
        }
        break;
      case 'engine':
        const engineIndex = parseInt(value) - 1;
        if (engineIndex >= 0 && engineIndex < engineColors.length) {
          this.currentCustomization.colors.engine = engineColors[engineIndex];
          this.currentCustomization.colors.trail = engineColors[engineIndex];
          this.addLine(`Engine glow set to: ${engineColors[engineIndex]}`, '#44ff44');
          this.updatePreview();
        } else {
          this.addLine('Invalid engine color. Use numbers 1-8', '#ff4444');
        }
        break;
      case 'decal':
        if (['none', 'stripes', 'flames', 'stars'].includes(value)) {
          this.currentCustomization.decalType = value as 'none' | 'stripes' | 'flames' | 'stars';
          this.addLine(`Decal set to: ${value}`, '#44ff44');
          this.updatePreview();
        } else {
          this.addLine('Invalid decal. Use: none, stripes, flames, or stars', '#ff4444');
        }
        break;
      default:
        this.addLine(`Unknown property: ${property}`, '#ff4444');
        break;
    }
  }
  
  private showCurrentConfig() {
    this.addLine('CURRENT CONFIGURATION:', '#ffff44');
    this.addLine(`  Model:  ${this.currentCustomization.modelType}`, '#ffffff');
    this.addLine(`  Hull:   ${this.currentCustomization.colors.primary}`, this.currentCustomization.colors.primary);
    this.addLine(`  Engine: ${this.currentCustomization.colors.engine}`, this.currentCustomization.colors.engine);
    this.addLine(`  Decal:  ${this.currentCustomization.decalType}`, '#ffffff');
  }
  
  private randomizeConfig() {
    this.currentCustomization = ShipCustomizer.generateRandomCustomization();
    this.addLine('Configuration randomized!', '#44ff44');
    this.showCurrentConfig();
    this.updatePreview();
  }
  
  private setClassicConfig() {
    this.currentCustomization = ShipCustomizer.getClassic();
    this.addLine('Classic configuration restored!', '#44ff44');
    this.showCurrentConfig();
    this.updatePreview();
  }
  
  private addLine(text: string, color: string = '#ffffff') {
    if (!this.terminalOutput) return;
    
    const line = document.createElement('div');
    line.style.color = color;
    line.style.fontFamily = "'Courier New', monospace";
    line.style.fontSize = '12px';
    line.style.lineHeight = '1.4';
    line.textContent = text;
    this.terminalOutput.appendChild(line);
    
    // Auto-scroll to bottom
    this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
  }
  
  private showWelcome() {
    this.addLine('═══════════════════════════════════════════', '#00e5ff');
    this.addLine('    SHIP CUSTOMIZATION TERMINAL v1.0', '#00e5ff');
    this.addLine('═══════════════════════════════════════════', '#00e5ff');
    this.addLine('');
    this.addLine('Type "help" for commands or "ls" to see options', '#ffff44');
    this.addLine('');
  }
  
  private updatePreview() {
    // Update the visual preview if we add one later
    // For now, just update the internal state
  }
  
  private createMenu(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #000000;
      border: 2px solid #00e5ff;
      border-radius: 4px;
      padding: 0;
      color: white;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      display: none;
      z-index: 10000;
      width: 600px;
      height: 400px;
      box-shadow: 0 0 20px #00e5ff;
    `;
    
    container.innerHTML = `
      <div style="background: #00e5ff; color: black; padding: 5px 10px; font-weight: bold; display: flex; justify-content: space-between; align-items: center;">
        <span>SHIP CUSTOMIZATION TERMINAL</span>
        <span style="cursor: pointer; padding: 0 5px;" id="close-x">✕</span>
      </div>
      <div id="terminal-output" style="
        height: 320px;
        padding: 10px;
        overflow-y: auto;
        background: #000000;
        color: #ffffff;
      "></div>
      <div style="padding: 10px; background: #111111; border-top: 1px solid #333;">
        <div style="display: flex; align-items: center;">
          <span style="color: #00e5ff; margin-right: 8px;">$</span>
          <input id="terminal-input" type="text" style="
            flex: 1;
            background: transparent;
            border: none;
            color: #ffffff;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            outline: none;
          " placeholder="Type 'help' for commands" />
        </div>
      </div>
    `;
    
    // Add event listeners
    this.attachEventListeners(container);
    
    return container;
  }
  
  private attachEventListeners(container: HTMLDivElement) {
    // Get terminal elements
    this.terminalInput = container.querySelector('#terminal-input') as HTMLInputElement;
    this.terminalOutput = container.querySelector('#terminal-output') as HTMLDivElement;
    
    // Close button
    container.querySelector('#close-x')?.addEventListener('click', () => {
      this.hide();
    });
    
    // Terminal input
    if (this.terminalInput) {
      this.terminalInput.addEventListener('keydown', (e) => {
        // Stop propagation to prevent game controls from triggering
        e.stopPropagation();
        
        if (e.key === 'Enter') {
          e.preventDefault();
          const command = this.terminalInput!.value;
          this.terminalInput!.value = '';
          this.processCommand(command);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          // Command history navigation
          if (this.historyIndex > 0) {
            this.historyIndex--;
            this.terminalInput!.value = this.commandHistory[this.historyIndex];
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          // Command history navigation
          if (this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            this.terminalInput!.value = this.commandHistory[this.historyIndex];
          } else {
            this.historyIndex = this.commandHistory.length;
            this.terminalInput!.value = '';
          }
        }
      });
      
      // Also stop keyup events from propagating
      this.terminalInput.addEventListener('keyup', (e) => {
        e.stopPropagation();
      });
      
      // And keypress events
      this.terminalInput.addEventListener('keypress', (e) => {
        e.stopPropagation();
      });
    }
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
    }
    
    // Show welcome message
    if (this.terminalOutput) {
      this.terminalOutput.innerHTML = '';
      this.showWelcome();
    }
    
    // Focus terminal input
    if (this.terminalInput) {
      this.terminalInput.focus();
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