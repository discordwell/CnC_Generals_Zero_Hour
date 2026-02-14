/**
 * C&C Generals: Zero Hour — Browser Port
 *
 * Application entry point. Wires subsystems: InputManager, RTSCamera,
 * TerrainVisual, WaterVisual. Loads either a converted map JSON
 * (via ?map=path.json URL param) or a procedural demo terrain.
 */

import * as THREE from 'three';
import { GameLoop, SubsystemRegistry } from '@generals/core';
import { TerrainVisual, WaterVisual } from '@generals/terrain';
import type { MapDataJSON } from '@generals/terrain';
import { InputManager, RTSCamera } from '@generals/input';

// ============================================================================
// Loading screen
// ============================================================================

const loadingBar = document.getElementById('loading-bar') as HTMLDivElement;
const loadingStatus = document.getElementById('loading-status') as HTMLDivElement;
const loadingScreen = document.getElementById('loading-screen') as HTMLDivElement;

function setLoadingProgress(percent: number, status: string): void {
  loadingBar.style.width = `${percent}%`;
  loadingStatus.textContent = status;
}

// ============================================================================
// Engine initialization
// ============================================================================

async function init(): Promise<void> {
  setLoadingProgress(10, 'Creating renderer...');

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x1a1a2e);

  setLoadingProgress(20, 'Setting up scene...');

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x87a5b5, 0.0008);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    5000,
  );

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x607080, 0.7);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.3);
  sunLight.position.set(200, 400, 200);
  sunLight.castShadow = true;
  scene.add(sunLight);

  // Hemisphere light for natural sky/ground coloring
  const hemiLight = new THREE.HemisphereLight(0x88aacc, 0x445533, 0.4);
  scene.add(hemiLight);

  setLoadingProgress(30, 'Initializing subsystems...');

  // ========================================================================
  // Subsystems
  // ========================================================================

  const subsystems = new SubsystemRegistry();

  // Input
  const inputManager = new InputManager(canvas);
  subsystems.register(inputManager);

  // RTS Camera
  const rtsCamera = new RTSCamera(camera);
  subsystems.register(rtsCamera);

  // Terrain
  const terrainVisual = new TerrainVisual(scene);
  subsystems.register(terrainVisual);

  // Water
  const waterVisual = new WaterVisual(scene);
  subsystems.register(waterVisual);

  await subsystems.initAll();

  setLoadingProgress(50, 'Loading terrain...');

  // ========================================================================
  // Load terrain (map JSON or procedural demo)
  // ========================================================================

  const urlParams = new URLSearchParams(window.location.search);
  const mapPath = urlParams.get('map');
  let mapData: MapDataJSON;

  let loadedFromJSON = false;

  if (mapPath) {
    try {
      const response = await fetch(mapPath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      mapData = await response.json() as MapDataJSON;
      loadedFromJSON = true;
    } catch (err) {
      console.warn(`Failed to load map "${mapPath}":`, err);
      console.log('Falling back to procedural demo terrain.');
      const demo = terrainVisual.loadDemoTerrain();
      mapData = demo.mapData;
    }
  } else {
    const demo = terrainVisual.loadDemoTerrain();
    mapData = demo.mapData;
  }

  // If loaded from JSON, build terrain (demo path already builds it)
  if (loadedFromJSON) {
    terrainVisual.loadMap(mapData);
  }

  // Load water surfaces
  waterVisual.loadFromMapData(mapData);

  setLoadingProgress(70, 'Configuring camera...');

  // ========================================================================
  // Camera setup
  // ========================================================================

  const heightmap = terrainVisual.getHeightmap()!;

  // Set camera height query for terrain following
  rtsCamera.setHeightQuery((x, z) => heightmap.getInterpolatedHeight(x, z));

  // Set map bounds
  rtsCamera.setMapBounds(0, heightmap.worldWidth, 0, heightmap.worldDepth);

  // Center camera on map
  rtsCamera.lookAt(heightmap.worldWidth / 2, heightmap.worldDepth / 2);

  setLoadingProgress(90, 'Starting game loop...');

  // ========================================================================
  // Debug info & keyboard shortcuts
  // ========================================================================

  const debugInfo = document.getElementById('debug-info') as HTMLDivElement;
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let displayFps = 0;

  // F1 toggle wireframe
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      terrainVisual.toggleWireframe();
    }
  });

  // ========================================================================
  // Game loop
  // ========================================================================

  const gameLoop = new GameLoop(30);

  gameLoop.start({
    onSimulationStep(_frameNumber: number, dt: number) {
      // Feed input to camera
      rtsCamera.setInputState(inputManager.getState());

      // Update all subsystems (InputManager resets accumulators,
      // RTSCamera processes input, WaterVisual animates UVs)
      subsystems.updateAll(dt);
    },

    onRender(_alpha: number) {
      renderer.render(scene, camera);

      // FPS counter
      frameCount++;
      const now = performance.now();
      if (now - lastFpsUpdate > 1000) {
        displayFps = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
      }

      const hm = terrainVisual.getHeightmap();
      const mapInfo = hm
        ? `${hm.width}x${hm.height}`
        : 'none';
      const wireInfo = terrainVisual.isWireframe() ? ' [wireframe]' : '';
      debugInfo.textContent =
        `FPS: ${displayFps} | Map: ${mapInfo}${wireInfo} | Frame: ${gameLoop.getFrameNumber()}`;
    },
  });

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Hide loading screen
  setLoadingProgress(100, 'Ready!');
  await new Promise((resolve) => setTimeout(resolve, 300));
  loadingScreen.style.opacity = '0';
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 500);

  console.log(
    '%c C&C Generals: Zero Hour — Browser Edition ',
    'background: #1a1a2e; color: #c9a84c; font-size: 16px; padding: 8px;',
  );
  console.log('Stage 3: Terrain rendering & RTS camera active.');
  console.log(`Terrain: ${heightmap.width}x${heightmap.height} (${mapPath ?? 'procedural demo'})`);
  console.log('Controls: WASD=scroll, Q/E=rotate, Wheel=zoom, Middle-drag=pan, F1=wireframe');
}

init().catch((err) => {
  console.error('Failed to initialize engine:', err);
  setLoadingProgress(0, `Error: ${err instanceof Error ? err.message : String(err)}`);
});
