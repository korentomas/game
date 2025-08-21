import { createNoise2D } from 'simplex-noise';

const CHUNK_SIZE_X = 16;
const CHUNK_SIZE_Z = 16;

enum LODLevel {
  FULL = 0,
  MEDIUM = 1,
  LOW = 2
}

self.onmessage = (e: MessageEvent) => {
  const data = e.data as { type: string; k: string; cx: number; cz: number; seed: string; lod: LODLevel };
  if (data.type !== 'build') return;
  const noise2 = createNoise2D(seededRandom(data.seed));

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];

  const s = 0.04; // Reduced frequency for smoother terrain
  const colorA = { r: 0x24 / 255, g: 0x38 / 255, b: 0x4a / 255 };
  const colorB = { r: 0x39 / 255, g: 0x5a / 255, b: 0x74 / 255 };
  const neon1 = { r: 0x00 / 255, g: 0xe5 / 255, b: 0xff / 255 };
  const neon2 = { r: 0xff / 255, g: 0x4d / 255, b: 0x6d / 255 };

  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
  function smoothstep(x: number, edge0: number, edge1: number) {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function pushQuad(px: number[], nx: number[], cx: {r:number;g:number;b:number}) {
    positions.push(...px);
    normals.push(...nx);
    for (let i = 0; i < 6; i++) colors.push(cx.r, cx.g, cx.b);
  }

  // Adjust resolution based on LOD
  const lodStep = Math.pow(2, data.lod); // 1, 2, 4 for FULL, MEDIUM, LOW
  const w = Math.ceil(CHUNK_SIZE_X / lodStep);
  const d = Math.ceil(CHUNK_SIZE_Z / lodStep);
  
  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const wx = data.cx * CHUNK_SIZE_X + x * lodStep;
      const wz = data.cz * CHUNK_SIZE_Z + z * lodStep;
      // Multi-octave noise for smoother terrain
      const octave1 = noise2(wx * s, wz * s) * 5;
      const octave2 = noise2(wx * s * 2, wz * s * 2) * 2;
      const octave3 = noise2(wx * s * 4, wz * s * 4) * 0.5;
      const combined = 10 + octave1 + octave2 + octave3;
      const smoothed = combined * 0.8 + 2;
      const h = Math.max(0, Math.floor(smoothed));

      const y = h;
      const b = (noise2(wx * 0.02, wz * 0.02) + 1) * 0.5;
      const base = {
        r: lerp(colorA.r, colorB.r, smoothstep(h, 0, 24)),
        g: lerp(colorA.g, colorB.g, smoothstep(h, 0, 24)),
        b: lerp(colorA.b, colorB.b, smoothstep(h, 0, 24)),
      };
      const neonMix = b > 0.6 ? neon1 : (b < 0.3 ? neon2 : null);
      const c = neonMix ? {
        r: lerp(base.r, neonMix.r, 0.15),
        g: lerp(base.g, neonMix.g, 0.15),
        b: lerp(base.b, neonMix.b, 0.15),
      } : base;

      // Greedy merge in X for top faces (only for FULL LOD to maintain performance)
      let run = 1;
      if (data.lod === LODLevel.FULL) {
        while (x + run < w) {
          const wx2 = data.cx * CHUNK_SIZE_X + (x + run) * lodStep;
          const o1 = noise2(wx2 * s, wz * s) * 5;
          const o2 = noise2(wx2 * s * 2, wz * s * 2) * 2;
          const o3 = noise2(wx2 * s * 4, wz * s * 4) * 0.5;
          const h2 = Math.max(0, Math.floor((10 + o1 + o2 + o3) * 0.8 + 2));
          if (h2 !== h) break;
          run++;
        }
      }
      
      const scale = lodStep;
      const p0 = [x * scale, y, z * scale];
      const p1 = [(x + run) * scale, y, z * scale];
      const p2 = [(x + run) * scale, y, (z + 1) * scale];
      const p3 = [x * scale, y, (z + 1) * scale];
      pushQuad([
        p0[0], p0[1], p0[2],
        p1[0], p1[1], p1[2],
        p2[0], p2[1], p2[2],
        p0[0], p0[1], p0[2],
        p2[0], p2[1], p2[2],
        p3[0], p3[1], p3[2],
      ], [0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0], c);
      x += run - 1;

      // Pre-calculate neighbor heights (cache these calculations)
      const hL = Math.max(0, Math.floor((10 + noise2((wx - 1) * s, wz * s) * 5 + noise2((wx - 1) * s * 2, wz * s * 2) * 2 + noise2((wx - 1) * s * 4, wz * s * 4) * 0.5) * 0.8 + 2));
      const hR = Math.max(0, Math.floor((10 + noise2((wx + 1) * s, wz * s) * 5 + noise2((wx + 1) * s * 2, wz * s * 2) * 2 + noise2((wx + 1) * s * 4, wz * s * 4) * 0.5) * 0.8 + 2));
      const hD = Math.max(0, Math.floor((10 + noise2(wx * s, (wz - 1) * s) * 5 + noise2(wx * s * 2, (wz - 1) * s * 2) * 2 + noise2(wx * s * 4, (wz - 1) * s * 4) * 0.5) * 0.8 + 2));
      const hU = Math.max(0, Math.floor((10 + noise2(wx * s, (wz + 1) * s) * 5 + noise2(wx * s * 2, (wz + 1) * s * 2) * 2 + noise2(wx * s * 4, (wz + 1) * s * 4) * 0.5) * 0.8 + 2));

      function pushSide(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number, nx:number,ny:number,nz:number) {
        const yb = Math.min(y0, y1);
        const yt = Math.max(y0, y1);
        for (let y = yb - 1; y < yt; y++) {
          const p0 = [x0, y + 1, z0];
          const p1 = [x1, y + 1, z1];
          const p2 = [x1, y, z1];
          const p3 = [x0, y, z0];
          pushQuad([
            p0[0], p0[1], p0[2],
            p1[0], p1[1], p1[2],
            p2[0], p2[1], p2[2],
            p0[0], p0[1], p0[2],
            p2[0], p2[1], p2[2],
            p3[0], p3[1], p3[2],
          ], [nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz, nx,ny,nz], base);
        }
      }

      // Generate side faces (only for high detail chunks to reduce complexity)
      if (data.lod === LODLevel.FULL) {
        if (hL < h) pushSide(x * scale, h, z * scale, x * scale, hL, z * scale, -1, 0, 0);
        if (hR < h) pushSide((x + run) * scale, h, z * scale, (x + run) * scale, hR, z * scale, 1, 0, 0);
        if (hD < h) pushSide(x * scale, h, z * scale, x * scale, hD, z * scale, 0, 0, -1);
        if (hU < h) pushSide(x * scale, h, (z + 1) * scale, x * scale, hU, (z + 1) * scale, 0, 0, 1);
      }
    }
  }

  const pos = new Float32Array(positions);
  const nor = new Float32Array(normals);
  const col = new Float32Array(colors);
  // If geometry is empty, still post a tiny buffer to avoid main-thread stalls
  const pb = pos.buffer.byteLength ? pos.buffer : new Float32Array(0).buffer;
  const nb = nor.buffer.byteLength ? nor.buffer : new Float32Array(0).buffer;
  const cb = col.buffer.byteLength ? col.buffer : new Float32Array(0).buffer;
  (self as any).postMessage({ k: data.k, lod: data.lod, positions: pb, normals: nb, colors: cb }, [pb, nb, cb]);
};

function seededRandom(seed: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}
