import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Input } from './input';
import { Ship } from '../entities/Ship';
import { CameraRig } from '../camera/CameraRig';
import { World } from '../world/World';
import { ParticleSystem } from '../effects/ParticleSystem';
import { JunkManager } from '../world/Junk';
import { DustField } from '../effects/DustField';
import { loadState, saveState, recordVisitedChunk } from './save';
import { EntityManager, EntityType } from './EntityManager';
import { FadeManager } from './FadeManager';
import { EffectsManager } from '../effects/EffectsManager';
import { NetworkManager } from '../networking/NetworkManager';
import { Chat } from '../ui/Chat';
import { ProjectileManager } from '../combat/ProjectileManager';
import { MaterialManager } from '../items/MaterialManager';
import { MaterialType } from '../items/MaterialDrop';
import { HUD } from '../ui/HUD';

export function bootstrap() {
  const appEl = document.getElementById('app')!;
  const uiEl = document.getElementById('ui')!;

  const pixelScale = 3; // retro upscale factor
  const baseWidth = Math.floor(window.innerWidth / pixelScale);
  const baseHeight = Math.floor(window.innerHeight / pixelScale);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(baseWidth, baseHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.imageRendering = 'pixelated';
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  appEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101b2a);
  scene.fog = new THREE.FogExp2(0x101b2a, 0.012);

  const camera = new THREE.PerspectiveCamera(55, baseWidth / baseHeight, 0.1, 2000);

  const input = new Input();
  const ship = new Ship();
  scene.add(ship.group);

  // Use room name as seed - each room has its own persistent world
  const urlParams = new URLSearchParams(location.search);
  const room = urlParams.get('room') ?? 'room-' + Math.random().toString(36).slice(2, 8);
  const seed = room; // Room name determines the world
  
  // Update URL to always have a room
  if (!urlParams.get('room')) {
    const url = new URL(location.href);
    url.searchParams.set('room', room);
    history.replaceState({}, '', url);
  }
  const world = new World(seed);
  world.setCamera(camera);
  scene.add(world.group);

  const rig = new CameraRig(camera, ship);

  // Balanced postprocessing composer with nice bloom for light emission
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(baseWidth, baseHeight), 
    1.5,   // strength - moderate bloom
    1.0,   // radius - normal glow spread
    0.5    // threshold - higher to only glow bright things
  );
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  // Enhanced lighting with neon atmosphere
  const light = new THREE.DirectionalLight(0x9fd0ff, 0.4); // Reduced to let neon lights shine
  light.position.set(10, 20, 10);
  scene.add(light);
  
  // More atmospheric hemisphere lighting
  const hemiLight = new THREE.HemisphereLight(0x4488cc, 0x0a1628, 0.3);
  scene.add(hemiLight);
  
  // Entity management system (create early so other code can use it)
  const entityManager = new EntityManager();
  
  // Initialize UI
  const hud = new HUD(uiEl);
  const chat = new Chat();
  
  // Set camera and scene for speech bubbles
  chat.setCamera(camera);
  chat.setScene(scene);
  
  // Initialize networking
  const networkManager = new NetworkManager();
  
  // Set up network callbacks
  networkManager.setCallbacks({
    onPlayerJoined: (player) => {
      scene.add(player.group);
      // Add particle system to scene
      if (player.ship) {
        scene.add(player.ship.thrusterSystem.points);
      }
      // Add name tag to main scene (will use render order to stay on top)
      if (player.nameTagGroup) {
        scene.add(player.nameTagGroup);
      }
      // Removed system message for cleaner chat
      console.log('Remote player joined:', player.id);
    },
    onPlayerLeft: (playerId) => {
      const player = networkManager.remotePlayers.get(playerId);
      if (player) {
        scene.remove(player.group);
        // Remove particle system from scene
        if (player.ship) {
          scene.remove(player.ship.thrusterSystem.points);
        }
        // Remove name tag from scene
        if (player.nameTagGroup) {
          scene.remove(player.nameTagGroup);
        }
        // Removed system message for cleaner chat
      }
      console.log('Remote player left:', playerId);
    },
    onChatMessage: (playerId, playerName, text) => {
      // Add to chat history
      chat.addMessage({
        id: Math.random().toString(36),
        playerId,
        playerName,
        text,
        timestamp: Date.now()
      });
      
      // Show speech bubble above the player's ship
      if (playerId === networkManager.localPlayerId) {
        // Local player - use ship position
        chat.addSpeechBubble(playerId, playerName, text, ship.position);
      } else {
        // Remote player - find their ship
        const remotePlayer = networkManager.remotePlayers.get(playerId);
        if (remotePlayer && remotePlayer.group) {
          chat.addSpeechBubble(playerId, playerName, text, remotePlayer.group.position);
        }
      }
    },
    onPlayerShoot: (playerId, position, direction) => {
      // Spawn remote player's projectile
      const id = `${playerId}_proj_${Date.now()}`;
      console.log('Remote player shot:', playerId, 'at', position, 'dir', direction);
      projectileManager.spawnRemote(id, position, direction, playerId);
    },
    onMaterialSpawn: (id, position, type) => {
      // Spawn material from remote player
      console.log('Remote material spawn:', id, type, 'at', position);
      materialManager.spawnRemote(id, position, type as MaterialType);
    },
    onMaterialCollect: (id, collectorId) => {
      // Remove material that was collected by another player
      console.log('Remote material collect:', id, 'by', collectorId);
      materialManager.collectRemote(id);
      
      // Show message if material was stolen from us
      const player = networkManager.remotePlayers.get(collectorId);
      if (player) {
        // Removed system message for cleaner chat
      }
    },
    onMaterialUpdate: (materialId, position) => {
      // Update remote material position during magnetization
      materialManager.updateRemotePosition(materialId, position);
    },
    // Junk spawn no longer needs network sync - each player generates deterministically
    onJunkDestroy: (junkId, destroyerId) => {
      // Destroy junk that was destroyed by another player
      console.log('Remote junk destroy:', junkId, 'by', destroyerId);
      junk.destroyRemoteJunk(junkId);
      const player = networkManager.remotePlayers.get(destroyerId);
      if (player) {
        // Removed system message for cleaner chat
      }
    },
    onJunkHit: (junkId, damage, hitterId) => {
      // Show visual effect when another player hits junk
      junk.applyRemoteHit(junkId, damage);
    }
  });
  
  // Setup chat callbacks
  chat.setOnSendMessage((text) => {
    const localPlayerName = networkManager.localPlayerName || 'You';
    
    // Add the message to our own chat immediately
    chat.addMessage({
      id: Math.random().toString(36),
      playerId: networkManager.localPlayerId,
      playerName: localPlayerName,
      text,
      timestamp: Date.now()
    });
    
    // Show speech bubble above local player's ship
    chat.addSpeechBubble(networkManager.localPlayerId, localPlayerName, text, ship.position);
    
    // Send to others
    networkManager.sendChatMessage(text);
  });
  
  // Connect to multiplayer (always, since we always have a room now)
  if (room) {
    networkManager.connect().then(() => {
      networkManager.joinRoom(room);
      // Show welcome tip in chat
      chat.addSystemMessage(`Press T to open chat`);
      // Set player ID for material manager
      materialManager.setPlayerId(networkManager.localPlayerId);
      // Junk generation is now deterministic - all players generate the same junk locally
    }).catch(err => {
      console.error('Failed to connect to multiplayer:', err);
      // Removed system message for cleaner chat
      // Junk generation works offline too (deterministic)
    });
  }

  // Add some ambient neon accent lights - moderate intensity for atmosphere
  const accentColors = [0x00e5ff, 0xff4d6d, 0x00ff88, 0xff8800, 0x8800ff, 0xffff00];
  for (let i = 0; i < 6; i++) {
    const accentLight = new THREE.PointLight(
      accentColors[i % accentColors.length],
      0.8,  // Moderate brightness for ambient atmosphere
      45,   // Good range
      1.5
    );
    const angle = (i / 6) * Math.PI * 2;
    const radius = 60 + Math.random() * 40;
    accentLight.position.set(
      Math.cos(angle) * radius,
      8 + Math.random() * 15,
      Math.sin(angle) * radius
    );
    scene.add(accentLight);
    
    // Register with entity manager
    entityManager.registerEntity(accentLight, EntityType.LIGHT);
  }

  // World grid for motion perception (static at y=0)
  const grid = new THREE.GridHelper(2000, 200, 0x2a3e55, 0x1a2736);
  grid.material.opacity = 0.3;
  (grid.material as THREE.Material).transparent = true;
  grid.position.y = 0;
  scene.add(grid);

  // Enhanced decorative water plane - no light reflections, just atmosphere
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshBasicMaterial({ 
      color: 0x0a2235, 
      transparent: true, 
      opacity: 0.6,
      // No metalness/roughness - MeshBasicMaterial doesn't respond to lighting
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 6;
  scene.add(water);

  // Thruster and ambient particles - reasonable size for trail
  const thruster = new ParticleSystem({ maxParticles: 500, size: 0.25, additive: true, opacity: 0.9 });
  scene.add(thruster.points);
  const dustField = new DustField(seed, 1400, 80);  // Smaller radius for closer particles
  scene.add(dustField.points);

  // Combat system
  const projectileManager = new ProjectileManager(world);
  scene.add(projectileManager.group);
  
  // Space junk
  
  // Create fade manager for smooth entity transitions
  const fadeManager = new FadeManager();
  
  // Create effects manager for explosions and other visual effects
  const effectsManager = new EffectsManager();
  scene.add(effectsManager.group);
  
  // Create material manager for collectible drops
  let inventory: Record<MaterialType, number> = {
    scrap_metal: 0,
    energy_crystal: 0,
    rare_alloy: 0,
    plasma_core: 0
  };
  
  const materialManager = new MaterialManager((type, value, materialId) => {
    inventory[type] += value;
    console.log(`Collected ${value} ${type}! Total: ${inventory[type]}`);
    // Send collection to network
    networkManager.sendMaterialCollect(materialId);
  });
  scene.add(materialManager.group);
  
  // Set up magnetization callback (throttled to reduce network traffic)
  let lastMagnetUpdate = 0;
  materialManager.setOnMagnetizing((materialId, position) => {
    const now = Date.now();
    if (now - lastMagnetUpdate > 50) { // Only send updates every 50ms
      networkManager.sendMaterialUpdate(materialId, position);
      lastMagnetUpdate = now;
    }
  });
  
  const junk = new JunkManager(seed, entityManager, fadeManager, effectsManager);
  scene.add(junk.group);
  
  // Set up junk network callbacks (only destruction needs syncing)
  junk.setNetworkCallbacks({
    onJunkDestroy: (junkId) => {
      networkManager.sendJunkDestroy(junkId);
    }
  });
  
  // Hook junk into world chunks and record visited - pass world for terrain height
  world.onChunkAdded.push((cx, cz, group) => { junk.spawnInChunk(cx, cz, group, world); recordVisitedChunk(seed, cx, cz); });
  world.onChunkRemoved.push((cx, cz) => { junk.onChunkRemoved(cx, cz); });
  
  // Set up targeting systems for homing missiles
  projectileManager.setTargetingSystems(junk, () => {
    // Get all ship positions (local + remote)
    const ships: Array<{position: THREE.Vector3, velocity?: THREE.Vector3, id: string}> = [];
    
    // Add local ship
    ships.push({
      position: ship.position.clone(),
      velocity: ship.velocity.clone(),
      id: 'local'
    });
    
    // Add remote ships
    networkManager.remotePlayers.forEach((player, id) => {
      ships.push({
        position: player.group.position.clone(),
        velocity: player.velocity ? player.velocity.clone() : undefined,
        id: id
      });
    });
    
    return ships;
  });
  
  // Register main entities
  entityManager.registerEntity(ship.group, EntityType.SHIP, ship.position);
  // Don't register particle systems - they manage their own visibility
  // entityManager.registerEntity(thruster.points, EntityType.PARTICLE_THRUSTER, ship.position);
  // entityManager.registerEntity(dustField.points, EntityType.PARTICLE_DUST, ship.position);

  // Restore last position for this seed if available
  const loaded = loadState(seed);
  if (loaded) {
    ship.position.set(loaded.x, loaded.y, loaded.z);
  }
  
  // Initialize dust field around ship position
  dustField.initializeAroundCenter(ship.position);
  
  addEventListener('beforeunload', () => {
    saveState(seed, ship.position);
  });

  let last = performance.now();
  let lastNetworkUpdate = 0;
  const networkUpdateRate = 50; // 20Hz

  function onResize() {
    const w = Math.floor(window.innerWidth / pixelScale);
    const h = Math.floor(window.innerHeight / pixelScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    composer.setSize(w, h);
    bloomPass.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  function loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Core game updates (high priority)
    ship.update(dt, input, world, junk);
    rig.update(dt);
    
    // Handle shooting
    if (input.isDown(' ') || input.isDown('mouse0')) {
      const projectileId = ship.tryFire(projectileManager, world);
      // Send shoot event over network
      if (projectileId && room) {
        // Get the actual muzzle position (same calculation as in tryFire)
        const dir = new THREE.Vector3(Math.sin(ship.heading), 0, Math.cos(ship.heading));
        const muzzle = new THREE.Vector3();
        ship.group.getWorldPosition(muzzle);
        muzzle.addScaledVector(dir, 1.5);
        
        // Account for velocity
        const velocityOffset = ship.velocity.clone().multiplyScalar(0.05);
        muzzle.add(velocityOffset);
        
        // Ensure proper height
        const groundY = world.sampleHeight(muzzle.x, muzzle.z);
        muzzle.y = Math.max(ship.group.position.y, groundY + 2.0);
        
        console.log('Local player shooting, sending to network');
        networkManager.sendShoot(muzzle, ship.heading);
      }
    }
    
    // Update projectiles
    projectileManager.update(dt);
    
    // Check projectile collisions with junk
    projectileManager.projectiles.forEach(projectile => {
      // Only check collisions for local player's projectiles
      // Remote projectiles are visual only and don't process collisions with junk
      if (projectile.ownerId !== 'local') return;
      
      const result = junk.checkProjectileCollisions(projectile.mesh.position, projectile.damage);
      if (result) {
        // Remove the projectile
        projectileManager.remove(projectile.id);
        
        if (result === 'hit') {
          // Junk was hit but not destroyed - send hit effect to others
          const junkId = junk.getJunkAtPosition(projectile.mesh.position);
          if (junkId) {
            networkManager.sendJunkHit(junkId, projectile.damage);
          }
        } else {
          // Junk was destroyed - spawn explosion effect
          effectsManager.spawnExplosion(projectile.mesh.position.clone(), 0x00e5ff);
          
          // Spawn material drops (only by the projectile owner)
          const dropCount = 2 + Math.floor(Math.random() * 3); // 2-4 materials
          const spawned = materialManager.spawnMaterials(projectile.mesh.position.clone(), dropCount);
          
          // Send to network
          spawned.forEach(mat => {
            networkManager.sendMaterialSpawn(mat.id, mat.position, mat.type);
          });
          
          console.log(`Local player destroyed junk: ${result}`);
        }
      }
    });
    
    // Check collisions with remote players
    const shipTargets: Array<{object: THREE.Object3D, radius: number, type: string}> = [];
    networkManager.remotePlayers.forEach(player => {
      shipTargets.push({
        object: player.group,
        radius: 2.0,
        type: 'ship'
      });
    });
    
    const hits = projectileManager.checkCollisions(shipTargets);
    hits.forEach(hit => {
      // Remove projectile
      projectileManager.remove(hit.projectileId);
      
      // Handle hit based on target type
      if (hit.target.type === 'ship') {
        // TODO: Damage ship
        console.log('Hit ship!');
      }
    });
    
    // Network updates
    if (room) {
      networkManager.update(dt, ship.position, camera);
      
      // Send position updates at fixed rate with input state for client-side prediction
      if (now - lastNetworkUpdate > networkUpdateRate) {
        const inputState = {
          forward: input.isDown('w'),
          backward: input.isDown('s'),
          left: input.isDown('a'),
          right: input.isDown('d'),
          rotateLeft: input.isDown('q'),
          rotateRight: input.isDown('e')
        };
        networkManager.sendPosition(ship.position, ship.heading, ship.velocity, inputState, ship.isThrusting);
        lastNetworkUpdate = now;
      }
    }
    
    // Forward bias for streaming in facing direction
    const forward = { x: Math.sin(ship.heading), z: Math.cos(ship.heading) };
    world.update(dt, ship.position, forward);
    
    // Entity management and culling
    entityManager.updateEntityPosition(ship.group, ship.position);
    // Don't update particle positions - they manage themselves
    // entityManager.updateEntityPosition(thruster.points, ship.position);
    // entityManager.updateEntityPosition(dustField.points, ship.position);
    entityManager.performCulling(ship.position, camera);
    entityManager.updateCullFrequency(dt * 1000);
    
    // Apply adaptive LOD to particle systems (throttled to prevent constant changes)
    if (Math.floor(now / 16) % 30 === 0) { // Every 30 frames (~0.5s)
      const worldQuality = world['debug'].adaptiveQuality;
      if (worldQuality === 'low') {
        dustField.setLOD('low');
        thruster.setLOD('medium'); // Keep thrusters more responsive
      } else if (worldQuality === 'high') {
        dustField.setLOD('full');
        thruster.setLOD('full');
      } else {
        dustField.setLOD('medium');
        thruster.setLOD('full'); // Default to full quality for responsiveness
      }
    }
    
    // Secondary updates (can be throttled)
    if (Math.floor(now / 16) % 3 === 0) { // Every 3rd frame
      junk.update(dt, ship.position);
    }
    // Emit thruster particles only when player is actively thrusting
    if (ship.isThrusting) {
      const horizontalSpeed = Math.hypot(ship.velocity.x, ship.velocity.z);
      const dir = new THREE.Vector3(Math.sin(ship.heading), 0, Math.cos(ship.heading));
      
      // Spawn from two engine exhausts for twin-engine effect
      const engineOffsets = [
        new THREE.Vector3(-0.3, 0.3, -0.9),  // Left engine
        new THREE.Vector3(0.3, 0.3, -0.9)    // Right engine
      ];
      
      // Base emission rate
      const baseEmission = 2.0;
      const speedBonus = Math.min(horizontalSpeed * 0.3, 1.5);
      const emission = baseEmission + speedBonus;
      const particlesPerEngine = Math.floor(emission * 4 + 2);
      
      for (const offset of engineOffsets) {
        // Transform offset by ship rotation
        const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ship.heading);
        const enginePos = ship.position.clone().add(rotatedOffset);
        
        for (let i = 0; i < particlesPerEngine; i++) {
          // Tighter cone for more focused exhaust
          const spread = 0.08;
          const jitter = new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            (Math.random() - 0.5) * spread * 0.5,
            (Math.random() - 0.5) * spread
          );
          
          // Faster, more directed exhaust velocity
          const exhaustSpeed = 12 + Math.random() * 6;
          const vel = dir.clone()
            .multiplyScalar(-exhaustSpeed)
            .add(jitter)
            .add(ship.velocity.clone().multiplyScalar(0.3)); // Inherit some ship velocity
          
          // Varied color mix for thruster exhaust
          let particleColor;
          let particleAlpha;
          let particleLife;
          
          const temp = Math.random();
          if (temp < 0.10) {
            // Hot white core (10%)
            particleColor = new THREE.Color(0xffffff);
            particleAlpha = 1.0;
            particleLife = 0.2 + Math.random() * 0.1;
          } else if (temp < 0.25) {
            // Orange-red flame (15%)
            particleColor = new THREE.Color(0xff6633);
            particleAlpha = 0.95;
            particleLife = 0.25 + Math.random() * 0.15;
          } else if (temp < 0.40) {
            // Yellow-orange burn (15%)
            particleColor = new THREE.Color(0xffaa00);
            particleAlpha = 0.9;
            particleLife = 0.3 + Math.random() * 0.15;
          } else if (temp < 0.55) {
            // Green plasma (15%)
            particleColor = new THREE.Color(0x00ff88);
            particleAlpha = 0.85;
            particleLife = 0.35 + Math.random() * 0.2;
          } else if (temp < 0.70) {
            // Cyan energy (15%)
            particleColor = new THREE.Color(0x00e5ff);
            particleAlpha = 0.8;
            particleLife = 0.4 + Math.random() * 0.2;
          } else if (temp < 0.85) {
            // Purple plasma (15%)
            particleColor = new THREE.Color(0xff00ff);
            particleAlpha = 0.7;
            particleLife = 0.45 + Math.random() * 0.2;
          } else {
            // Pink-red tail (15%)
            particleColor = new THREE.Color(0xff4488);
            particleAlpha = 0.5;
            particleLife = 0.5 + Math.random() * 0.2;
          }
          
          thruster.spawn(enginePos, vel, particleLife, particleColor, particleAlpha);
        }
      }
    }
    thruster.update(dt);

    // Ambient dust field follows camera/ship with wrapping
    dustField.update(ship.position, dt);
    
    // Update visual effects (explosions, etc.)
    effectsManager.update(dt);
    
    // Update material drops
    const collectedMaterials = materialManager.update(dt, ship.position);
    // Collected materials are already sent to network in the MaterialManager constructor callback

    // Update HUD (throttled)
    if (Math.floor(now / 16) % 2 === 0) { // Update every other frame
      const horizontalSpeed = Math.hypot(ship.velocity.x, ship.velocity.z);
      
      hud.update({
        position: ship.position,
        speed: horizontalSpeed,
        hull: Math.round((ship.hull / ship.maxHull) * 100),
        energy: Math.round((ship.energy / ship.maxEnergy) * 100),
        inventory: inventory
      });
      const entityStats = entityManager.getDebugInfo();
      
      // Extract detailed stats
      const junkStats = entityStats.junk || {total: 0, visible: 0, culled: 0, lod_full: 0, lod_medium: 0, lod_low: 0, pooled: 0};
      const droneStats = entityStats.drone || {total: 0, visible: 0, culled: 0};
      const projectileStats = entityStats.projectile || {total: 0, visible: 0};
      // Particles are not in EntityManager anymore - get stats directly
      const particleStats = {total: thruster.getActiveCount(), visible: thruster.getActiveCount()};
      const dustStats = {total: dustField.getVisibleCount(), visible: dustField.getVisibleCount()};
      const lightStats = entityStats.light || {total: 0, visible: 0, culled: 0};
      const fadeStats = fadeManager.getStats();
      
      // Calculate total entities
      const totalEntities = Object.values(entityStats).reduce((sum, stats) => sum + (stats.total || 0), 0);
      const totalVisible = Object.values(entityStats).reduce((sum, stats) => sum + (stats.visible || 0), 0);
      const totalCulled = Object.values(entityStats).reduce((sum, stats) => sum + (stats.culled || 0), 0);
      
      uiEl.innerHTML = `
        <div>room:${room} pos:(${ship.position.x.toFixed(1)}, ${ship.position.y.toFixed(1)}, ${ship.position.z.toFixed(1)}) speed:${horizontalSpeed.toFixed(2)} quality:${world['debug'].adaptiveQuality}</div>
        <div>chunks:${world['debug'].chunks}/${world['debug'].visible} buildQ:${world['debug'].buildQueue} applyQ:${world['debug'].meshApplyQueue} chunkPool:${world['debug'].poolSize}</div>
        <div>entities: ${totalVisible}/${totalEntities} (${totalCulled} culled) | junk:${junkStats.visible}/${junkStats.total}(${junkStats.pooled}pool) lights:${lightStats.visible}</div>
        <div>particles: thruster:${thruster.getActiveCount()} dust:${dustField.getVisibleCount()} | drones:${droneStats.visible} projectiles:${projectileStats.visible}</div>
        <div>LOD full:${junkStats.lod_full + droneStats.lod_full || 0} med:${junkStats.lod_medium + droneStats.lod_medium || 0} low:${junkStats.lod_low + droneStats.lod_low || 0} | fade:${fadeStats.totalFading}(${fadeStats.fadingIn}↑${fadeStats.fadingOut}↓)</div>
        <div>perf: build:${world['debug'].lastBuildMs.toFixed(1)}ms apply:${world['debug'].lastApplyMs.toFixed(1)}ms frame:${world['debug'].frameTimeMs.toFixed(1)}ms dt:${(dt*1000).toFixed(1)}ms</div>
        <div style="height:6px;background:#111;border:1px solid #223; margin-top:4px;">
          <div style="height:100%; width:${(ship.hull/ship.maxHull*100).toFixed(0)}%; background:#ff4d6d;"></div>
        </div>
        <div style="height:6px;background:#111;border:1px solid #223; margin-top:2px;">
          <div style="height:100%; width:${(ship.energy/ship.maxEnergy*100).toFixed(0)}%; background:#00e5ff;"></div>
        </div>
      `;
    }

    // Update speech bubble positions
    chat.updateSpeechBubbles();

    composer.render();
    requestAnimationFrame(loop);
  }

  loop();
}
