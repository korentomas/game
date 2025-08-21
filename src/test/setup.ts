// Mock Three.js for testing
import '@testing-library/jest-dom';

// Mock WebGL context
const mockWebGLContext = {
  getExtension: jest.fn(),
  getParameter: jest.fn(() => 1024),
  createShader: jest.fn(),
  shaderSource: jest.fn(),
  compileShader: jest.fn(),
  getShaderParameter: jest.fn(() => true),
  createProgram: jest.fn(),
  attachShader: jest.fn(),
  linkProgram: jest.fn(),
  getProgramParameter: jest.fn(() => true),
  useProgram: jest.fn(),
  createBuffer: jest.fn(),
  bindBuffer: jest.fn(),
  bufferData: jest.fn(),
  createTexture: jest.fn(),
  bindTexture: jest.fn(),
  texImage2D: jest.fn(),
  texParameteri: jest.fn(),
  viewport: jest.fn(),
  clearColor: jest.fn(),
  clear: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
  blendFunc: jest.fn(),
  depthFunc: jest.fn(),
  getUniformLocation: jest.fn(),
  getAttribLocation: jest.fn(),
  uniformMatrix4fv: jest.fn(),
  uniform1f: jest.fn(),
  uniform1i: jest.fn(),
  uniform2f: jest.fn(),
  uniform3f: jest.fn(),
  uniform4f: jest.fn(),
  vertexAttribPointer: jest.fn(),
  enableVertexAttribArray: jest.fn(),
  drawArrays: jest.fn(),
  drawElements: jest.fn(),
  readPixels: jest.fn(),
  getError: jest.fn(() => 0),
};

// Mock canvas
const mockCanvas = {
  getContext: jest.fn(() => mockWebGLContext),
  width: 800,
  height: 600,
  style: {},
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock document.createElement for canvas
global.document = global.document || {};
const originalCreateElement = global.document.createElement;
global.document.createElement = jest.fn((tagName: string) => {
  if (tagName === 'canvas') {
    return mockCanvas;
  }
  return originalCreateElement?.call(global.document, tagName);
});

// Mock requestAnimationFrame
global.requestAnimationFrame = jest.fn((cb) => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn((id) => clearTimeout(id));

// Mock performance.now()
global.performance = global.performance || {};
global.performance.now = jest.fn(() => Date.now());

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  readyState: 1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
}));

// Mock RTCPeerConnection
global.RTCPeerConnection = jest.fn().mockImplementation(() => ({
  createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
  createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
  setLocalDescription: jest.fn().mockResolvedValue(undefined),
  setRemoteDescription: jest.fn().mockResolvedValue(undefined),
  addIceCandidate: jest.fn().mockResolvedValue(undefined),
  createDataChannel: jest.fn().mockReturnValue({
    send: jest.fn(),
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    readyState: 'open',
  }),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  close: jest.fn(),
  connectionState: 'connected',
  iceConnectionState: 'connected',
  iceGatheringState: 'complete',
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock as any;