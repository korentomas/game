export class Input {
  private keys: Set<string> = new Set();
  private mouseButtons: Set<number> = new Set();
  public pointerLocked = false;
  public mouseDeltaX = 0;
  public mouseDeltaY = 0;

  constructor() {
    addEventListener('keydown', e => {
      // Don't capture keys when typing in input fields
      if (document.activeElement && 
          (document.activeElement.tagName === 'INPUT' || 
           document.activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      this.keys.add(e.key.toLowerCase());
    });
    
    addEventListener('keyup', e => {
      // Always remove keys on keyup to prevent stuck keys
      this.keys.delete(e.key.toLowerCase());
    });

    addEventListener('mousedown', e => {
      this.mouseButtons.add(e.button);
      if (!this.pointerLocked && document.body.requestPointerLock) {
        // Request pointer lock with promise error handling
        document.body.requestPointerLock()
          .catch(err => {
            // User cancelled or error occurred - this is fine
            if (err.name !== 'SecurityError') {
              console.warn('Pointer lock request failed:', err);
            }
          });
      }
    });
    addEventListener('mouseup', e => this.mouseButtons.delete(e.button));

    addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === document.body;
    });

    addEventListener('mousemove', e => {
      if (this.pointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });
  }

  isDown(key: string) {
    return this.keys.has(key.toLowerCase());
  }

  isMouseDown(button: number) {
    return this.mouseButtons.has(button);
  }

  consumeMouseDelta() {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }
  
  clearAllKeys() {
    // Clear all pressed keys - useful when opening menus
    this.keys.clear();
    this.mouseButtons.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }
}
