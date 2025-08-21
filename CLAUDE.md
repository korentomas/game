# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Development Server
- `npm run dev` - Start Vite development server on port 5173
- `npm run build` - Build for production with optimizations
- `npm run preview` - Preview production build locally
- `npm run server` - Start WebSocket server on port 3001 for multiplayer
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Build System
- Uses Vite with TypeScript for bundling
- Three.js chunks are split for optimal caching
- Source maps enabled for debugging
- Builds target ES2020 for modern browsers

### TypeScript Configuration
- Strict mode enabled with comprehensive linting rules
- Uses ES2020 target with bundler module resolution
- Includes DOM and ES2020 libs

## Game Controls

### Movement
- **WASD** - Move ship (relative to current heading)
- **Q/E** - Rotate ship left/right
- **Mouse** - Look around and rotate ship
- **Shift** - Boost speed

### Combat
- **Space/Left Click** - Fire projectiles
- Energy regenerates automatically
- Projectiles have glowing cyan appearance

### Social
- **T** - Open chat
- **Escape** - Close chat
- Player names display above ships

## Game Architecture

### Core Game Loop
The game bootstraps in `src/engine/bootstrap.ts` which sets up:
- Three.js renderer with pixelated retro aesthetic (3x upscale)
- Scene with fog, lighting, and post-processing bloom effects
- Main game loop with delta time-based updates

### Entity System
- **Ship** (`src/entities/Ship.ts`): Player-controlled ship with physics, energy/hull systems, shooting
- **World** (`src/world/World.ts`): Procedural voxel terrain with chunk-based streaming
- **Junk** (`src/world/Junk.ts`): Collectible objects spawned in world chunks
- **Projectile** (`src/combat/Projectile.ts`): Energy projectiles fired by ships
- **ProjectileManager** (`src/combat/ProjectileManager.ts`): Manages all active projectiles and collisions

### World Generation
- Seed-based procedural generation using simplex-noise
- Chunk-based streaming world (16x16x64 voxels per chunk)
- Multi-threaded mesh generation using Web Workers (`src/world/mesher.worker.ts`)
- LOD system with spatial indexing for performance
- Chunk caching system (memory + localStorage) in `ChunkCache.ts`
- Performance profiling and debug metrics

### Core Systems
- **Input** (`src/engine/input.ts`): Keyboard and mouse input handling
- **Camera** (`src/camera/CameraRig.ts`): Third-person camera following ship
- **Effects**: Particle systems for thruster trails and ambient dust
- **Save System** (`src/engine/save.ts`): Persistent player state per seed

### Key Dependencies
- **three**: 3D rendering engine
- **three-stdlib**: Additional Three.js utilities
- **simplex-noise**: Procedural noise generation for terrain

### Performance Considerations
- **Object pooling** for geometries and materials to reduce GC pressure
- **Frustum culling** for chunk visibility with adaptive frequency
- **Web Worker mesh generation** to avoid blocking main thread
- **Spatial indexing** for efficient chunk queries
- **Configurable LOD levels** based on distance (FULL/MEDIUM/LOW)
- **Time-sliced processing** - chunk processing limited to 8ms/frame, mesh application to 4ms/frame
- **Adaptive quality system** - automatically adjusts render distance and processing budgets based on frame time
- **Predictive chunk loading** - loads chunks ahead of player movement direction
- **Conservative processing budgets** - reduced simultaneous chunk processing to prevent stuttering
- **Throttled updates** - secondary systems (junk, HUD) update less frequently
- **Efficient caching** - localStorage-based chunk cache with async operations
- **Worker optimizations** - noise function caching and reduced side face generation for distant chunks

### Entity Management System
- **Comprehensive entity tracking** - tracks all game objects (junk, lights, particles, drones, projectiles)
- **Distance-based LOD** - entities automatically reduce quality/complexity at distance
- **Smart culling system** - entities beyond view or interaction range are hidden
- **Entity pooling** - reuse objects to reduce memory allocation and GC pressure
- **Adaptive culling frequency** - adjusts culling update rate based on performance
- **Type-specific optimizations** - different entity types have specialized culling and LOD rules
- **Visual quality preservation** - maintains important visual elements (lights, particles) while optimizing performance
- **Real-time statistics** - debug HUD shows detailed entity counts, LOD distribution, and performance metrics

### Game Features
- Seed-based worlds with URL parameter persistence
- Real-time HUD showing position, speed, and debug metrics
- Hull/energy systems for player ship
- Thruster particle effects responsive to player input
- Save/restore player position per world seed