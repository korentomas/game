export class LoginScreen {
  private container: HTMLDivElement;
  private usernameInput: HTMLInputElement;
  private submitButton: HTMLButtonElement;
  private errorMessage: HTMLDivElement;
  private onLogin?: (username: string) => void;
  
  constructor() {
    this.container = this.createLoginScreen();
    this.usernameInput = this.container.querySelector('#username-input') as HTMLInputElement;
    this.submitButton = this.container.querySelector('#submit-btn') as HTMLButtonElement;
    this.errorMessage = this.container.querySelector('#error-message') as HTMLDivElement;
    
    document.body.appendChild(this.container);
    this.setupEventHandlers();
  }
  
  private createLoginScreen(): HTMLDivElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #0a0e1a 0%, #1a2332 100%);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 20000;
      font-family: 'Press Start 2P', monospace;
    `;
    
    container.innerHTML = `
      <div style="
        background: rgba(0, 0, 0, 0.8);
        border: 2px solid #00e5ff;
        border-radius: 8px;
        padding: 40px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 0 40px #00e5ff;
      ">
        <h1 style="
          margin: 0 0 10px 0;
          color: #00e5ff;
          font-size: 24px;
          text-align: center;
          text-shadow: 0 0 10px #00e5ff;
        ">SPACE BASED</h1>
        
        <p style="
          color: #888;
          font-size: 10px;
          text-align: center;
          margin-bottom: 30px;
        ">Enter your username to join</p>
        
        <div style="margin-bottom: 20px;">
          <label style="
            display: block;
            color: #00e5ff;
            font-size: 10px;
            margin-bottom: 10px;
          ">USERNAME:</label>
          
          <input id="username-input" type="text" 
            placeholder="Enter username..." 
            maxlength="20"
            style="
              width: 100%;
              padding: 10px;
              background: rgba(0, 232, 255, 0.1);
              border: 1px solid #00e5ff;
              border-radius: 4px;
              color: white;
              font-family: 'Press Start 2P', monospace;
              font-size: 10px;
              outline: none;
              box-sizing: border-box;
            " />
        </div>
        
        <div id="error-message" style="
          color: #ff4444;
          font-size: 8px;
          margin-bottom: 20px;
          text-align: center;
          display: none;
        "></div>
        
        <button id="submit-btn" style="
          width: 100%;
          padding: 12px;
          background: #00e5ff;
          border: none;
          border-radius: 4px;
          color: black;
          font-family: 'Press Start 2P', monospace;
          font-size: 10px;
          cursor: pointer;
          transition: all 0.2s;
        ">ENTER GAME</button>
        
        <div style="
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #333;
          color: #666;
          font-size: 8px;
          text-align: center;
        ">
          <p>CONTROLS:</p>
          <p style="margin-top: 10px;">WASD - Move | Mouse - Aim</p>
          <p>Space - Shoot | T - Chat | C - Customize</p>
        </div>
      </div>
    `;
    
    return container;
  }
  
  private setupEventHandlers() {
    // Submit on button click
    this.submitButton.addEventListener('click', () => {
      this.handleSubmit();
    });
    
    // Submit on Enter key
    this.usernameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleSubmit();
      }
    });
    
    // Button hover effect
    this.submitButton.addEventListener('mouseenter', () => {
      this.submitButton.style.background = '#00ffff';
      this.submitButton.style.boxShadow = '0 0 20px #00e5ff';
    });
    
    this.submitButton.addEventListener('mouseleave', () => {
      this.submitButton.style.background = '#00e5ff';
      this.submitButton.style.boxShadow = 'none';
    });
    
    // Auto-focus username input
    setTimeout(() => {
      this.usernameInput.focus();
    }, 100);
  }
  
  private handleSubmit() {
    const username = this.usernameInput.value.trim();
    
    // Validation
    if (!username) {
      this.showError('Please enter a username');
      return;
    }
    
    if (username.length < 3) {
      this.showError('Username must be at least 3 characters');
      return;
    }
    
    if (username.length > 20) {
      this.showError('Username must be less than 20 characters');
      return;
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      this.showError('Username can only contain letters, numbers, _ and -');
      return;
    }
    
    // Clear error
    this.hideError();
    
    // Disable input during login
    this.usernameInput.disabled = true;
    this.submitButton.disabled = true;
    this.submitButton.textContent = 'CONNECTING...';
    
    // Call login callback
    if (this.onLogin) {
      this.onLogin(username);
    }
  }
  
  private showError(message: string) {
    this.errorMessage.textContent = message;
    this.errorMessage.style.display = 'block';
  }
  
  private hideError() {
    this.errorMessage.style.display = 'none';
  }
  
  public setOnLogin(callback: (username: string) => void) {
    this.onLogin = callback;
  }
  
  public hide() {
    this.container.style.display = 'none';
  }
  
  public show() {
    this.container.style.display = 'flex';
    this.usernameInput.disabled = false;
    this.submitButton.disabled = false;
    this.submitButton.textContent = 'ENTER GAME';
    this.usernameInput.focus();
  }
  
  public showLoginError(message: string) {
    this.showError(message);
    this.usernameInput.disabled = false;
    this.submitButton.disabled = false;
    this.submitButton.textContent = 'ENTER GAME';
  }
}