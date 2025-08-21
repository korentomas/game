/**
 * Spatial indexing system for efficient chunk queries
 * Based on industry-standard spatial hashing techniques
 */

export class SpatialIndex<T> {
  private buckets: Map<string, Set<T>> = new Map();
  private itemPositions: Map<T, { x: number; z: number }> = new Map();
  private bucketSize: number;

  constructor(bucketSize: number = 64) {
    this.bucketSize = bucketSize;
  }

  private getBucketKey(x: number, z: number): string {
    const bx = Math.floor(x / this.bucketSize);
    const bz = Math.floor(z / this.bucketSize);
    return `${bx},${bz}`;
  }

  private getBucketsInRange(centerX: number, centerZ: number, range: number): string[] {
    const buckets: string[] = [];
    const startX = Math.floor((centerX - range) / this.bucketSize);
    const endX = Math.floor((centerX + range) / this.bucketSize);
    const startZ = Math.floor((centerZ - range) / this.bucketSize);
    const endZ = Math.floor((centerZ + range) / this.bucketSize);

    for (let bx = startX; bx <= endX; bx++) {
      for (let bz = startZ; bz <= endZ; bz++) {
        buckets.push(`${bx},${bz}`);
      }
    }
    return buckets;
  }

  add(item: T, x: number, z: number): void {
    const key = this.getBucketKey(x, z);
    
    if (!this.buckets.has(key)) {
      this.buckets.set(key, new Set());
    }
    
    this.buckets.get(key)!.add(item);
    this.itemPositions.set(item, { x, z });
  }

  remove(item: T): void {
    const pos = this.itemPositions.get(item);
    if (!pos) return;

    const key = this.getBucketKey(pos.x, pos.z);
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.delete(item);
      if (bucket.size === 0) {
        this.buckets.delete(key);
      }
    }
    
    this.itemPositions.delete(item);
  }

  queryRadius(centerX: number, centerZ: number, radius: number): T[] {
    const results: T[] = [];
    const buckets = this.getBucketsInRange(centerX, centerZ, radius);
    const radiusSquared = radius * radius;

    for (const bucketKey of buckets) {
      const bucket = this.buckets.get(bucketKey);
      if (!bucket) continue;

      for (const item of bucket) {
        const pos = this.itemPositions.get(item);
        if (!pos) continue;

        const dx = pos.x - centerX;
        const dz = pos.z - centerZ;
        const distanceSquared = dx * dx + dz * dz;

        if (distanceSquared <= radiusSquared) {
          results.push(item);
        }
      }
    }

    return results;
  }

  queryRange(minX: number, minZ: number, maxX: number, maxZ: number): T[] {
    const results: T[] = [];
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;
    const range = Math.max(maxX - minX, maxZ - minZ) / 2;
    const buckets = this.getBucketsInRange(centerX, centerZ, range);

    for (const bucketKey of buckets) {
      const bucket = this.buckets.get(bucketKey);
      if (!bucket) continue;

      for (const item of bucket) {
        const pos = this.itemPositions.get(item);
        if (!pos) continue;

        if (pos.x >= minX && pos.x <= maxX && pos.z >= minZ && pos.z <= maxZ) {
          results.push(item);
        }
      }
    }

    return results;
  }

  size(): number {
    return this.itemPositions.size;
  }

  clear(): void {
    this.buckets.clear();
    this.itemPositions.clear();
  }
}