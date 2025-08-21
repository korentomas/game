import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { SpatialIndex } from './SpatialIndex';
import { ChunkCache, ChunkData } from './ChunkCache';
import { PerformanceProfiler } from './PerformanceProfiler';

const CHUNK_SIZE_X = 16;
const CHUNK_SIZE_Z = 16;
const CHUNK_HEIGHT = 64;

function key(cx: number, cz: number) { return `${cx},${cz}`; }

// LOD levels - reduce geometry complexity at distance
enum LODLevel {
  FULL = 0,    // All detail
  MEDIUM = 1,  // Half resolution
  LOW = 2      // Quarter resolution
}

export class World {
  public group = new THREE.Group();
  
  // Core systems
  private chunks: Map<string, Chunk> = new Map();
  private spatialIndex = new SpatialIndex<Chunk>(128); // Spatial indexing for fast queries
  private chunkCache = new ChunkCache(300); // Memory + disk cache
  private profiler = new PerformanceProfiler();
  
  // Terrain generation
  private noise2: (x: number, y: number) => number;
  private worker: Worker;
  private seed: string;
  
  // Chunk management
  private lastCenter = new THREE.Vector2(Infinity, Infinity);
  private radius = 6; // Increased for better streaming
  private unloadRadius = 10; // Larger unload distance
  
  // Cache management
  private chunkMapByKey: Map<string, Chunk> = new Map();
  private cacheQueue: Array<() => Promise<void>> = [];
  private cacheProcessing = false;
  
  // Predictive loading
  private playerVelocity = new THREE.Vector2();
  private lastPlayerPos = new THREE.Vector2();
  private predictiveRadius = 2; // Extra chunks to load ahead
  
  // Processing queues with priority system
  private buildQueue: Array<{ cx: number; cz: number; k: string; dist: number; lod: LODLevel; priority: number }> = [];
  private pending: Set<string> = new Set();
  private meshApplyQueue: Array<{ k: string; positions: ArrayBuffer; normals: ArrayBuffer; colors: ArrayBuffer; lod: LODLevel }> = [];
  
  // Advanced pooling system
  private geometryPool: Map<LODLevel, THREE.BufferGeometry[]> = new Map();
  private materialPool: THREE.MeshLambertMaterial[] = [];
  private maxPoolSize = 100; // Increased pool size
  
  // Frustum culling optimization
  private camera: THREE.Camera | null = null;
  private frustum = new THREE.Frustum();
  private cameraMatrix = new THREE.Matrix4();
  private frustumUpdateCounter = 0;
  private visibleChunks: Set<Chunk> = new Set();
  
  // Dirty flagging system
  private dirtyChunks: Set<string> = new Set();
  private needsFrustumUpdate = true;
  
  // Event system
  public onChunkAdded: Array<(cx: number, cz: number, group: THREE.Group) => void> = [];
  public onChunkRemoved: Array<(cx: number, cz: number) => void> = [];
  
  // Debug and monitoring
  public debug = { 
    buildQueue: 0, 
    pending: 0, 
    meshApplyQueue: 0, 
    chunks: 0, 
    visible: 0,
    lastBuildMs: 0, 
    lastApplyMs: 0,
    poolSize: 0,
    cacheStats: {},
    performance: {} as any,
    frameTimeMs: 0,
    adaptiveQuality: 'normal' as 'low' | 'normal' | 'high'
  };
  
  // Adaptive quality control
  private frameTimeHistory: number[] = [];
  private qualityAdjustTimer = 0;

  constructor(seed: string = 'seed') {
    this.seed = seed;
    const rng = seededRandom(seed);
    this.noise2 = createNoise2D(rng);
    
    // Initialize worker
    // Create worker - handle Jest environment where import.meta is not available
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      // Mock worker for tests
      this.worker = { postMessage: () => {}, terminate: () => {}, onmessage: null } as any;
    } else {
      this.worker = new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent) => {
        const msg = e.data as { k: string; positions: ArrayBuffer; normals: ArrayBuffer; colors: ArrayBuffer; lod: LODLevel };
        this.meshApplyQueue.push(msg);
      };
    }
    
    // Initialize geometry pools with larger capacity
    for (const lodLevel of [LODLevel.FULL, LODLevel.MEDIUM, LODLevel.LOW]) {
      this.geometryPool.set(lodLevel, []);
    }
    
    // Pre-create materials for better performance
    for (let i = 0; i < 25; i++) {
      this.materialPool.push(new THREE.MeshLambertMaterial({ 
        vertexColors: true, 
        flatShading: true 
      }));
    }
  }
  
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
    this.needsFrustumUpdate = true;
  }
  
  public getGeometryFromPool(lod: LODLevel): THREE.BufferGeometry | null {
    const pool = this.geometryPool.get(lod);
    return pool && pool.length > 0 ? pool.pop()! : null;
  }
  
  public returnGeometryToPool(geometry: THREE.BufferGeometry, lod: LODLevel) {
    const pool = this.geometryPool.get(lod);
    if (pool && pool.length < this.maxPoolSize) {
      // Clear attributes but keep the geometry structure
      geometry.deleteAttribute('position');
      geometry.deleteAttribute('normal');
      geometry.deleteAttribute('color');
      pool.push(geometry);
      this.profiler.increment('geometryPoolHits');
    } else {
      geometry.dispose();
    }
  }
  
  public getMaterialFromPool(): THREE.MeshLambertMaterial | null {
    return this.materialPool.length > 0 ? this.materialPool.pop()! : null;
  }
  
  public returnMaterialToPool(material: THREE.MeshLambertMaterial) {
    if (this.materialPool.length < 40) {
      this.materialPool.push(material);
    } else {
      material.dispose();
    }
  }

  private enqueueDesired(cx: number, cz: number, forward?: { x: number; z: number }) {
    this.profiler.startTimer('enqueueDesired');
    
    const desired: Array<{ cx: number; cz: number; k: string; dist: number; score: number; lod: LODLevel; priority: number }> = [];
    
    // More efficient spiral pattern for chunk loading
    const spiralOrder = this.generateSpiralOrder(this.radius);
    
    // Add predictive loading based on player velocity
    const predictedCx = Math.round(cx + this.playerVelocity.x * 2); // Look 2 units ahead
    const predictedCz = Math.round(cz + this.playerVelocity.y * 2);
    
    for (const [dx, dz] of spiralOrder) {
      const chunkX = cx + dx;
      const chunkZ = cz + dz;
      const k = key(chunkX, chunkZ);
      
      if (!this.chunks.has(k) && !this.pending.has(k)) {
        const dist = Math.abs(dx) + Math.abs(dz);
        const dirBias = forward ? -(dx * forward.x + dz * forward.z) * 0.4 : 0;
        
        // Predictive bonus for chunks in movement direction
        const predictiveBias = (Math.abs(chunkX - predictedCx) + Math.abs(chunkZ - predictedCz) < 2) ? -1 : 0;
        
        // Improved LOD system with smoother transitions
        let lod = LODLevel.FULL;
        if (dist > 2) lod = LODLevel.MEDIUM;
        if (dist > 4) lod = LODLevel.LOW;
        
        // Priority system: closer chunks get higher priority
        const priority = this.calculatePriority(dist, lod, dirBias + predictiveBias);
        
        desired.push({ 
          cx: chunkX, 
          cz: chunkZ, 
          k, 
          dist, 
          score: dist + dirBias + predictiveBias,
          lod,
          priority
        });
      }
    }
    
    // Sort by priority system
    desired.sort((a, b) => {
      // Higher priority first
      if (a.priority !== b.priority) return b.priority - a.priority;
      // Then by LOD (higher detail first)
      if (a.lod !== b.lod) return a.lod - b.lod;
      // Finally by distance
      return a.score - b.score;
    });
    
    // More conservative capacity to prevent stutter
    const queuePressure = this.meshApplyQueue.length + this.pending.size;
    const inflightCap = queuePressure > 12 ? 16 : 24; // Reduced limits
    
    let added = 0;
    for (const d of desired) {
      if (this.meshApplyQueue.length + this.pending.size >= inflightCap) break;
      if (added >= 4) break; // Reduced from 8 chunks per frame
      
      this.pending.add(d.k);
      this.buildQueue.push(d);
      added++;
    }
    
    // Sort build queue by priority
    this.buildQueue.sort((a, b) => b.priority - a.priority);
    
    this.profiler.endTimer('enqueueDesired');
    this.debug.buildQueue = this.buildQueue.length;
    this.debug.pending = this.pending.size;
  }

  private generateSpiralOrder(radius: number): Array<[number, number]> {
    const coords: Array<[number, number]> = [];
    coords.push([0, 0]); // Center first
    
    for (let r = 1; r <= radius; r++) {
      // Generate ring at radius r
      for (let i = 0; i < 8 * r; i++) {
        const angle = (i / (8 * r)) * 2 * Math.PI;
        const x = Math.round(r * Math.cos(angle));
        const z = Math.round(r * Math.sin(angle));
        
        // Avoid duplicates
        if (!coords.some(([cx, cz]) => cx === x && cz === z)) {
          coords.push([x, z]);
        }
      }
    }
    
    return coords;
  }

  private calculatePriority(distance: number, lod: LODLevel, directionBias: number): number {
    let priority = 100 - distance * 10; // Base priority by distance
    
    // LOD bonus
    if (lod === LODLevel.FULL) priority += 50;
    else if (lod === LODLevel.MEDIUM) priority += 25;
    
    // Direction bonus
    priority += directionBias * 20;
    
    return Math.max(0, priority);
  }

  private async processBuildQueue(budget: number) {
    let built = 0;
    const t0 = performance.now();
    const maxProcessingTime = 8; // Max 8ms per frame for chunk processing
    
    while (built < budget && this.buildQueue.length > 0) {
      // Time-slice to prevent frame drops
      if (performance.now() - t0 > maxProcessingTime) {
        break;
      }
      
      const job = this.buildQueue.shift()!;
      if (this.chunks.has(job.k)) { 
        this.pending.delete(job.k); 
        continue; 
      }
      
      const c = new Chunk(job.cx, job.cz, job.lod, this);
      this.chunks.set(job.k, c);
      this.chunkMapByKey.set(job.k, c);
      this.group.add(c.meshGroup);
      
      for (const cb of this.onChunkAdded) cb(job.cx, job.cz, c.meshGroup);
      
      // Try cache first (async, non-blocking)
      const cacheKey = `${this.seed}:${job.k}:${job.lod}`;
      this.tryLoadFromCache(cacheKey, job.k, job.lod);
      
      // Ask worker to build mesh
      this.worker.postMessage({
        type: 'build',
        k: job.k,
        cx: job.cx,
        cz: job.cz,
        seed: this.seed,
        lod: job.lod,
      });
      
      this.pending.delete(job.k);
      built++;
    }
    
    const t1 = performance.now();
    this.debug.lastBuildMs = t1 - t0;
    this.debug.buildQueue = this.buildQueue.length;
    this.debug.pending = this.pending.size;
    this.debug.chunks = this.chunks.size;
    this.debug.poolSize = Array.from(this.geometryPool.values()).reduce((sum, pool) => sum + pool.length, 0);
  }
  
  private async tryLoadFromCache(cacheKey: string, k: string, lod: LODLevel) {
    try {
      const cached = await this.getChunkCache(cacheKey);
      if (cached) {
        this.meshApplyQueue.push({ k, lod, ...cached });
      }
    } catch (error) {
      // Cache miss or error, worker will handle generation
    }
  }
  
  private async getChunkCache(key: string): Promise<{positions: ArrayBuffer, normals: ArrayBuffer, colors: ArrayBuffer} | null> {
    try {
      const cached = localStorage.getItem(`chunk_${key}`);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      return {
        positions: new Uint8Array(data.positions).buffer,
        normals: new Uint8Array(data.normals).buffer,
        colors: new Uint8Array(data.colors).buffer
      };
    } catch {
      return null;
    }
  }
  
  private async putChunkCache(key: string, data: {positions: ArrayBuffer, normals: ArrayBuffer, colors: ArrayBuffer}) {
    try {
      const serializable = {
        positions: Array.from(new Uint8Array(data.positions)),
        normals: Array.from(new Uint8Array(data.normals)),
        colors: Array.from(new Uint8Array(data.colors))
      };
      localStorage.setItem(`chunk_${key}`, JSON.stringify(serializable));
    } catch {
      // Ignore cache errors
    }
  }

  private processMeshApplyQueue(budget: number) {
    let applied = 0;
    const t0 = performance.now();
    const maxProcessingTime = 4; // Max 4ms per frame for mesh application
    
    while (applied < budget && this.meshApplyQueue.length > 0) {
      // Time-slice to prevent frame drops
      if (performance.now() - t0 > maxProcessingTime) {
        break;
      }
      
      const msg = this.meshApplyQueue.shift()!;
      const chunk = this.chunkMapByKey.get(msg.k);
      if (!chunk) continue;
      
      chunk.applyMeshData(
        new Float32Array(msg.positions),
        new Float32Array(msg.normals),
        new Float32Array(msg.colors)
      );
      
      // Store in cache asynchronously
      const cacheKey = `${this.seed}:${msg.k}:${msg.lod}`;
      this.queueCacheOperation(() => 
        this.putChunkCache(cacheKey, { 
          positions: msg.positions, 
          normals: msg.normals, 
          colors: msg.colors 
        })
      );
      
      applied++;
    }
    
    const t1 = performance.now();
    this.debug.lastApplyMs = t1 - t0;
    this.debug.meshApplyQueue = this.meshApplyQueue.length;
  }
  
  private queueCacheOperation(operation: () => Promise<void>) {
    this.cacheQueue.push(operation);
    if (!this.cacheProcessing) {
      this.processCacheQueue();
    }
  }
  
  private async processCacheQueue() {
    this.cacheProcessing = true;
    
    while (this.cacheQueue.length > 0) {
      const operation = this.cacheQueue.shift()!;
      try {
        await operation();
      } catch (error) {
        // Ignore cache errors
      }
      
      // Yield control to prevent blocking
      if (this.cacheQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    this.cacheProcessing = false;
  }

  private pruneFar(cx: number, cz: number) {
    const toRemove: string[] = [];
    
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - cx) > this.unloadRadius || Math.abs(c.cz - cz) > this.unloadRadius) {
        toRemove.push(k);
      }
    }
    
    // Remove chunks in smaller batches to prevent frame drops
    const batchSize = Math.min(2, toRemove.length); // Reduced from 5
    for (let i = 0; i < batchSize; i++) {
      const k = toRemove[i];
      const c = this.chunks.get(k);
      if (!c) continue;
      
      this.group.remove(c.meshGroup);
      c.dispose?.();
      this.chunks.delete(k);
      this.chunkMapByKey.delete(k);
      
      for (const cb of this.onChunkRemoved) cb(c.cx, c.cz);
    }
    
    // Queue remaining chunks for next frame
    if (toRemove.length > batchSize) {
      this.queueCacheOperation(async () => {
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield
        if (toRemove.length > batchSize) {
          this.pruneFar(cx, cz); // Continue next frame
        }
      });
    }
  }
  
  private updateFrustumCulling() {
    if (!this.camera) return;
    
    this.cameraMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.cameraMatrix);
    
    let visibleCount = 0;
    
    for (const [k, chunk] of this.chunks) {
      const chunkCenter = new THREE.Vector3(
        chunk.cx * CHUNK_SIZE_X + CHUNK_SIZE_X / 2,
        8, // Approximate chunk height center
        chunk.cz * CHUNK_SIZE_Z + CHUNK_SIZE_Z / 2
      );
      
      const chunkRadius = Math.sqrt(CHUNK_SIZE_X * CHUNK_SIZE_X + CHUNK_SIZE_Z * CHUNK_SIZE_Z) / 2;
      const sphere = new THREE.Sphere(chunkCenter, chunkRadius);
      
      const isVisible = this.frustum.intersectsSphere(sphere);
      chunk.meshGroup.visible = isVisible;
      
      if (isVisible) visibleCount++;
    }
    
    this.debug.visible = visibleCount;
  }

  update(dt: number, playerPos: THREE.Vector3, forward?: { x: number; z: number }) {
    const cx = Math.floor(playerPos.x / CHUNK_SIZE_X);
    const cz = Math.floor(playerPos.z / CHUNK_SIZE_Z);
    
    // Calculate player velocity for predictive loading
    const currentPos = new THREE.Vector2(playerPos.x, playerPos.z);
    this.playerVelocity.subVectors(currentPos, this.lastPlayerPos).multiplyScalar(1 / dt);
    this.lastPlayerPos.copy(currentPos);
    
    // Only rebuild chunks when player moves to a new chunk
    if (this.lastCenter.x !== cx || this.lastCenter.y !== cz) {
      this.lastCenter.set(cx, cz);
      this.enqueueDesired(cx, cz, forward);
      this.pruneFar(cx, cz);
    }

    // Adaptive budgets based on frame time performance
    this.updateAdaptiveQuality(dt);
    
    const queuePressure = this.meshApplyQueue.length + this.pending.size;
    const highPressure = queuePressure > 6;
    const veryHighPressure = queuePressure > 12;
    
    // Adjust budgets based on quality setting
    let buildBudget = this.debug.adaptiveQuality === 'low' ? 1 : (this.debug.adaptiveQuality === 'high' ? 3 : 2);
    let applyBudget = this.debug.adaptiveQuality === 'low' ? 1 : (this.debug.adaptiveQuality === 'high' ? 2 : 1);
    
    if (veryHighPressure) {
      buildBudget = Math.max(1, Math.floor(buildBudget * 0.5));
      applyBudget = Math.max(1, Math.floor(applyBudget * 0.5));
    } else if (highPressure) {
      buildBudget = Math.max(1, Math.floor(buildBudget * 0.7));
      applyBudget = Math.max(1, Math.floor(applyBudget * 0.7));
    }
    
    this.processBuildQueue(buildBudget);
    this.processMeshApplyQueue(applyBudget);
    
    // Update frustum culling adaptively based on quality
    const cullFrequency = this.debug.adaptiveQuality === 'low' ? 8 : (this.debug.adaptiveQuality === 'high' ? 3 : 5);
    if (Math.floor(Date.now() / 16) % cullFrequency === 0) {
      this.updateFrustumCulling();
    }
  }
  
  private updateAdaptiveQuality(dt: number) {
    const frameTime = dt * 1000; // Convert to ms
    this.debug.frameTimeMs = frameTime;
    
    // Track frame time history
    this.frameTimeHistory.push(frameTime);
    if (this.frameTimeHistory.length > 30) { // 30 frame window
      this.frameTimeHistory.shift();
    }
    
    this.qualityAdjustTimer += dt;
    if (this.qualityAdjustTimer > 2.0) { // Check every 2 seconds
      this.qualityAdjustTimer = 0;
      
      const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
      
      // More conservative quality adjustment
      if (avgFrameTime > 25) { // > 25ms (< 40fps) - more tolerant
        this.debug.adaptiveQuality = 'low';
        this.radius = Math.max(5, this.radius - 1); // Less aggressive reduction
      } else if (avgFrameTime < 14) { // < 14ms (> 71fps) - higher threshold
        this.debug.adaptiveQuality = 'high';
        this.radius = Math.min(7, this.radius + 1); // Moderate increase
      } else {
        this.debug.adaptiveQuality = 'normal';
      }
    }
  }

  sampleHeight(x: number, z: number): number {
    // Height sample from noise; mirrors Chunk generation
    const s = 0.04; // Reduced frequency for smoother terrain
    // Use multiple octaves with decreasing amplitude for smoother terrain
    const octave1 = this.noise2(x * s, z * s) * 5; // Main terrain shape
    const octave2 = this.noise2(x * s * 2, z * s * 2) * 2; // Medium details
    const octave3 = this.noise2(x * s * 4, z * s * 4) * 0.5; // Fine details
    
    const h = 10 + octave1 + octave2 + octave3;
    // Apply smoothstep to make the terrain less jagged
    const smoothed = h * 0.8 + 2; // Scale down and add base height
    return Math.max(0, Math.floor(smoothed));
  }
}

class Chunk {
  public meshGroup = new THREE.Group();
  public lodLevel: LODLevel;
  private mesh: THREE.Mesh;
  private world: World;

  constructor(public cx: number, public cz: number, lod: LODLevel, world: World) {
    this.lodLevel = lod;
    this.world = world;
    this.meshGroup.position.set(cx * CHUNK_SIZE_X, 0, cz * CHUNK_SIZE_Z);
    
    // Try to get geometry and material from pools
    let geom = world.getGeometryFromPool(lod);
    if (!geom) {
      geom = new THREE.BufferGeometry();
    }
    
    let mat = world.getMaterialFromPool();
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    }
    
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false; // Disable for performance
    this.meshGroup.add(this.mesh);
  }

  applyMeshData(positions: Float32Array, normals: Float32Array, colors: Float32Array) {
    const oldGeometry = this.mesh.geometry;
    
    // Try to get geometry from pool
    let geom = this.world.getGeometryFromPool(this.lodLevel);
    if (!geom) {
      geom = new THREE.BufferGeometry();
    }
    
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geom.computeBoundingSphere();
    
    this.mesh.geometry = geom;
    
    // Return old geometry to pool
    if (oldGeometry) {
      this.world.returnGeometryToPool(oldGeometry, this.lodLevel);
    }
  }
  
  dispose() {
    if (this.mesh.geometry) {
      this.world.returnGeometryToPool(this.mesh.geometry, this.lodLevel);
    }
    if (this.mesh.material) {
      this.world.returnMaterialToPool(this.mesh.material as THREE.MeshLambertMaterial);
    }
  }
}

// Deterministic RNG from string seed for simplex-noise
function seededRandom(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    // xorshift*
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}
