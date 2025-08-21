type MeshBuffers = { positions: ArrayBuffer; normals: ArrayBuffer; colors: ArrayBuffer };

const DB_NAME = 'voxel-cache-v1';
const STORE = 'chunks';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getChunkCache(key: string): Promise<MeshBuffers | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const g = store.get(key);
      g.onsuccess = () => resolve(g.result ?? null);
      g.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putChunkCache(key: string, value: MeshBuffers): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const p = store.put(value, key);
      p.onsuccess = () => resolve();
      p.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}
