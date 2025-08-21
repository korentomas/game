export class SyncOverlay {
  private container: HTMLDivElement;
  private dotsElement: HTMLSpanElement;
  private progressFill: HTMLDivElement;
  private syncSteps = {
    connecting: false,
    authenticated: false,
    roomJoined: false,
    playersLoaded: false,
    worldSynced: false
  };
  private startTime: number;
  private minDisplayTime = 1200; // Minimum 1.2 seconds to avoid flashing
  private dotAnimation: number | null = null;
  
  constructor() {
    this.container = this.createOverlay();
    this.dotsElement = this.container.querySelector('#loading-dots') as HTMLSpanElement;
    this.progressFill = this.container.querySelector('#sync-progress-fill') as HTMLDivElement;
    this.startTime = Date.now();
    document.body.appendChild(this.container);
    this.startDotAnimation();
  }
  
  private createOverlay(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'sync-overlay';
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 15000;
      font-family: 'Press Start 2P', monospace;
      transition: opacity 0.4s ease-out;
      pointer-events: none;
      text-align: center;
    `;
    
    container.innerHTML = `
      <div style="
        padding: 30px 40px;
        border-radius: 12px;
      ">
        <!-- Simple text -->
        <div style="
          color: #00e5ff;
          font-size: 14px;
          margin-bottom: 20px;
          text-shadow: 0 0 15px rgba(0, 229, 255, 0.8);
          letter-spacing: 2px;
        ">
          Connecting<span id="loading-dots"></span>
        </div>
        
        <!-- Simple loading bar -->
        <div style="
          width: 250px;
          height: 6px;
          background: rgba(0, 229, 255, 0.15);
          border-radius: 10px;
          overflow: hidden;
          box-shadow: 0 0 20px rgba(0, 229, 255, 0.3);
        ">
          <div id="sync-progress-fill" style="
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #00e5ff, #4affff);
            transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 10px;
            box-shadow: 0 0 8px #00e5ff;
          "></div>
        </div>
      </div>
      
      <style>
        @keyframes fadeInOut {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
      </style>
    `;
    
    return container;
  }
  
  private startDotAnimation() {
    let dots = 0;
    this.dotAnimation = window.setInterval(() => {
      dots = (dots + 1) % 4;
      this.dotsElement.textContent = ' ' + '.'.repeat(dots);
    }, 400);
  }
  
  updateStatus(step: keyof typeof this.syncSteps, message?: string) {
    this.syncSteps[step] = true;
    
    // Calculate progress
    const completedSteps = Object.values(this.syncSteps).filter(v => v).length;
    const totalSteps = Object.keys(this.syncSteps).length;
    const progress = (completedSteps / totalSteps) * 100;
    
    // Update progress bar smoothly
    this.progressFill.style.width = `${progress}%`;
    
    // Check if we're done
    if (completedSteps === totalSteps) {
      this.complete();
    }
  }
  
  private complete() {
    // Ensure minimum display time to avoid flashing
    const elapsed = Date.now() - this.startTime;
    const remainingTime = Math.max(0, this.minDisplayTime - elapsed);
    
    setTimeout(() => {
      // Fill the bar completely
      this.progressFill.style.width = '100%';
      
      // Fade out after a moment
      setTimeout(() => {
        this.container.style.opacity = '0';
        if (this.dotAnimation) {
          clearInterval(this.dotAnimation);
          this.dotAnimation = null;
        }
        setTimeout(() => {
          this.hide();
        }, 400);
      }, 200);
    }, remainingTime);
  }
  
  show() {
    this.container.style.display = 'block';
    this.container.style.opacity = '1';
    if (!this.dotAnimation) {
      this.startDotAnimation();
    }
  }
  
  hide() {
    this.container.style.display = 'none';
    if (this.dotAnimation) {
      clearInterval(this.dotAnimation);
      this.dotAnimation = null;
    }
  }
  
  reset() {
    // Reset all sync steps
    Object.keys(this.syncSteps).forEach(key => {
      this.syncSteps[key as keyof typeof this.syncSteps] = false;
    });
    this.progressFill.style.width = '0%';
    this.startTime = Date.now();
    this.container.style.opacity = '1';
    if (!this.dotAnimation) {
      this.startDotAnimation();
    }
  }
  
  forceComplete() {
    // Force complete all steps and hide quickly (for dev/testing)
    Object.keys(this.syncSteps).forEach(key => {
      this.syncSteps[key as keyof typeof this.syncSteps] = true;
    });
    this.complete();
  }
}