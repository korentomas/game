export interface UserSession {
  username: string;
  userId: string;
  token: string;
  createdAt: number;
}

export class AuthManager {
  private static SESSION_KEY = 'user_session';
  private currentSession: UserSession | null = null;
  private ws: WebSocket | null = null;
  
  constructor() {
    // Try to load existing session from localStorage
    this.loadSession();
  }
  
  private loadSession() {
    try {
      const stored = localStorage.getItem(AuthManager.SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored) as UserSession;
        // Check if session is still valid (24 hours)
        const now = Date.now();
        const age = now - session.createdAt;
        if (age < 24 * 60 * 60 * 1000) {
          this.currentSession = session;
        } else {
          // Session expired
          localStorage.removeItem(AuthManager.SESSION_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e);
      localStorage.removeItem(AuthManager.SESSION_KEY);
    }
  }
  
  private saveSession(session: UserSession) {
    try {
      localStorage.setItem(AuthManager.SESSION_KEY, JSON.stringify(session));
      this.currentSession = session;
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }
  
  public clearSession() {
    localStorage.removeItem(AuthManager.SESSION_KEY);
    this.currentSession = null;
  }
  
  public getSession(): UserSession | null {
    return this.currentSession;
  }
  
  public isLoggedIn(): boolean {
    return this.currentSession !== null;
  }
  
  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    
    if (window.location.hostname === 'localhost') {
      // Determine WebSocket port based on current page port
      const currentPort = window.location.port;
      // If running on port 5175 (Docker web), use port 3002 (Docker WS)
      // If running on port 5173 (dev), use port 3001 (dev WS)
      const wsPort = currentPort === '5175' ? '3002' : '3001';
      const url = `${protocol}//localhost:${wsPort}`;
      console.log(`AuthManager: Current port: ${currentPort}, WebSocket URL: ${url}`);
      return url;
    } else {
      // Production uses same host
      return `${protocol}//${window.location.host}`;
    }
  }
  
  public async login(username: string): Promise<UserSession> {
    return new Promise((resolve, reject) => {
      // Connect to auth server (same as game server for now)
      this.ws = new WebSocket(this.getWebSocketUrl());
      
      this.ws.onopen = () => {
        // Send login request
        this.ws!.send(JSON.stringify({
          type: 'auth-login',
          username: username
        }));
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'welcome') {
          // Ignore the welcome message, wait for auth response
          return;
        }
        
        if (message.type === 'auth-success') {
          const session: UserSession = {
            username: message.username,
            userId: message.userId,
            token: message.token,
            createdAt: Date.now()
          };
          
          this.saveSession(session);
          this.ws?.close();
          this.ws = null;
          resolve(session);
          
        } else if (message.type === 'auth-error') {
          this.ws?.close();
          this.ws = null;
          reject(new Error(message.error || 'Login failed'));
        }
      };
      
      this.ws.onerror = () => {
        reject(new Error('Failed to connect to server'));
      };
      
      this.ws.onclose = () => {
        // Connection closed without auth response
        if (!this.currentSession) {
          reject(new Error('Connection lost'));
        }
      };
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.ws?.readyState === WebSocket.CONNECTING || 
            this.ws?.readyState === WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('Login timeout'));
        }
      }, 5000);
    });
  }
  
  public async validateSession(): Promise<boolean> {
    if (!this.currentSession) return false;
    
    return new Promise((resolve) => {
      const ws = new WebSocket(this.getWebSocketUrl());
      
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'auth-validate',
          token: this.currentSession!.token
        }));
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'welcome') {
          // Ignore the welcome message, wait for auth response
          return;
        }
        
        ws.close();
        
        if (message.type === 'auth-valid') {
          resolve(true);
        } else {
          // Invalid session
          this.clearSession();
          resolve(false);
        }
      };
      
      ws.onerror = () => {
        ws.close();
        resolve(false);
      };
      
      // Timeout
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING || 
            ws.readyState === WebSocket.OPEN) {
          ws.close();
          resolve(false);
        }
      }, 3000);
    });
  }
}