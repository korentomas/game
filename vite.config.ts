import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    // Increase chunk size warning limit since Three.js is naturally large
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Manual chunking to optimize loading
        manualChunks: {
          // Separate Three.js into its own chunk for better caching
          'vendor-three': ['three'],
          'vendor-stdlib': ['three-stdlib'],
          'vendor-noise': ['simplex-noise']
        }
      }
    },
    // Enable source maps for debugging
    sourcemap: true,
    // Optimize for modern browsers
    target: 'es2020'
  },
  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['three', 'three-stdlib', 'simplex-noise']
  },
  // Enable worker support
  worker: {
    format: 'es'
  }
});
