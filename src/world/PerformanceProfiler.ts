/**
 * Professional performance profiling system for chunk management
 * Tracks detailed metrics like AAA games
 */

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  chunkUpdates: number;
  frustumCulling: number;
  geometryPoolHits: number;
  cacheHitRate: number;
  memoryUsage: number;
  triangleCount: number;
  drawCalls: number;
}

export class PerformanceProfiler {
  private metrics: PerformanceMetrics = {
    fps: 0,
    frameTime: 0,
    chunkUpdates: 0,
    frustumCulling: 0,
    geometryPoolHits: 0,
    cacheHitRate: 0,
    memoryUsage: 0,
    triangleCount: 0,
    drawCalls: 0
  };

  private timers: Map<string, number> = new Map();
  private counters: Map<string, number> = new Map();
  private history: Map<string, number[]> = new Map();
  private lastFrameTime = performance.now();
  private frameCount = 0;
  private lastFPSUpdate = 0;

  startTimer(name: string): void {
    this.timers.set(name, performance.now());
  }

  endTimer(name: string): number {
    const startTime = this.timers.get(name);
    if (!startTime) return 0;
    
    const duration = performance.now() - startTime;
    this.timers.delete(name);
    
    // Store in history for averaging
    if (!this.history.has(name)) {
      this.history.set(name, []);
    }
    const hist = this.history.get(name)!;
    hist.push(duration);
    if (hist.length > 60) hist.shift(); // Keep last 60 samples
    
    return duration;
  }

  increment(counter: string, amount: number = 1): void {
    const current = this.counters.get(counter) || 0;
    this.counters.set(counter, current + amount);
  }

  updateFrame(): void {
    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.frameCount++;

    this.metrics.frameTime = frameTime;

    // Update FPS every 500ms
    if (now - this.lastFPSUpdate > 500) {
      this.metrics.fps = Math.round(1000 / frameTime);
      this.lastFPSUpdate = now;
    }
  }

  getAverageTime(name: string): number {
    const hist = this.history.get(name);
    if (!hist || hist.length === 0) return 0;
    return hist.reduce((sum, val) => sum + val, 0) / hist.length;
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  resetCounters(): void {
    this.counters.clear();
  }

  getMetrics(): PerformanceMetrics {
    // Update calculated metrics
    this.metrics.chunkUpdates = this.getCounter('chunkUpdates');
    this.metrics.frustumCulling = this.getAverageTime('frustumCulling');
    this.metrics.geometryPoolHits = this.getCounter('geometryPoolHits');
    this.metrics.triangleCount = this.getCounter('triangles');
    this.metrics.drawCalls = this.getCounter('drawCalls');

    // Calculate cache hit rate
    const cacheHits = this.getCounter('cacheHits');
    const cacheRequests = this.getCounter('cacheRequests');
    this.metrics.cacheHitRate = cacheRequests > 0 ? (cacheHits / cacheRequests) * 100 : 0;

    // Estimate memory usage (rough approximation)
    this.metrics.memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;

    return { ...this.metrics };
  }

  getDetailedReport(): string {
    const metrics = this.getMetrics();
    return `
Performance Report:
  FPS: ${metrics.fps}
  Frame Time: ${metrics.frameTime.toFixed(2)}ms
  Chunk Updates: ${metrics.chunkUpdates}
  Frustum Culling: ${metrics.frustumCulling.toFixed(2)}ms
  Geometry Pool Hits: ${metrics.geometryPoolHits}%
  Cache Hit Rate: ${metrics.cacheHitRate.toFixed(1)}%
  Triangle Count: ${metrics.triangleCount.toLocaleString()}
  Draw Calls: ${metrics.drawCalls}
  Memory: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
    `;
  }
}