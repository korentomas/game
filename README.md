# Space Based

A retro-style multiplayer space exploration game with voxel terrain, real-time combat, and resource collection.

## 🎮 Features

- **Procedural Voxel Worlds**: Explore infinite seed-based worlds with deterministic terrain generation
- **Real-time Multiplayer**: WebRTC-based peer-to-peer multiplayer with WebSocket fallback
- **Combat System**: Energy-based projectiles with homing missiles and damage effects
- **Resource Collection**: Destroy junk to collect materials with magnetic collection system
- **Retro Aesthetic**: Pixelated 3D graphics with bloom effects and glowing projectiles
- **Chat System**: Minecraft-style chat with speech bubbles above ships

## 🚀 Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development server (port 5173)
npm run dev

# Start multiplayer server (port 3001)
npm run server

# Run both in parallel
npm run dev & npm run server
```

### Production Build

```bash
npm run build
npm run preview
```

## 🎯 Game Controls

### Movement
- **WASD** - Move ship (relative to current heading)
- **Q/E** - Rotate ship left/right
- **Mouse** - Look around and rotate ship
- **Shift** - Boost speed

### Combat
- **Space/Left Click** - Fire projectiles
- Energy regenerates automatically
- Projectiles have cyan glow and homing capability

### Social
- **T** - Open/close chat
- **Escape** - Close chat
- Messages appear as speech bubbles above ships

## 🏗️ Technical Architecture

### Core Systems
- **Entity Management**: Efficient culling and LOD system for thousands of objects
- **World Streaming**: Chunk-based terrain with multi-threaded mesh generation
- **Networking**: Hybrid WebRTC/WebSocket for optimal multiplayer performance
- **Physics**: Custom collision detection with terrain following

### Performance Features
- Object pooling for geometries and materials
- Frustum culling with adaptive frequency
- Web Worker mesh generation
- Spatial indexing for chunk queries
- Time-sliced processing (8ms/frame chunk, 4ms/frame mesh)
- Adaptive quality system based on frame time

## 🛠️ Development

### Project Structure
```
src/
├── engine/         # Core game loop and systems
├── entities/       # Ships and game objects
├── world/          # Terrain generation and chunk management
├── combat/         # Projectiles and combat systems
├── networking/     # Multiplayer and synchronization
├── ui/             # HUD, chat, and UI elements
├── items/          # Materials and collectibles
└── camera/         # Camera controls and rendering
```

### Key Technologies
- **Three.js** - 3D rendering engine
- **TypeScript** - Type-safe development
- **Vite** - Fast build tooling
- **WebRTC** - Peer-to-peer networking
- **Web Workers** - Multi-threaded terrain generation

## 📝 Planned Features

- Ship hooking/claw mechanic for dragging
- Gas/fuel system with refueling stations
- Slipstream mechanic (speed boost from ship trails)
- Friend system (press F while hooked)
- Persistent world state saving
- More weapon types and upgrades

## 🎨 Art Style

The game features a retro pixelated aesthetic with:
- 3x upscaled rendering for chunky pixels
- Bloom effects on light sources
- Glowing cyan projectiles and UI elements
- Minecraft-inspired chat system
- Simple geometric shapes with flat shading

## 📦 Building from Source

Requirements:
- Node.js 18+
- npm or yarn

```bash
git clone https://github.com/yourusername/space-based.git
cd space-based
npm install
npm run dev
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## 📄 License

MIT License - see LICENSE file for details

---

Made with 💙 using Three.js and TypeScript