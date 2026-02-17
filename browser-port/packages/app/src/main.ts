/**
 * C&C Generals: Zero Hour — Browser Port
 *
 * Application entry point. Wires subsystems: InputManager, RTSCamera,
 * TerrainVisual, WaterVisual. Loads either a converted map JSON
 * (via ?map=path.json URL param) or a procedural demo terrain.
 */

import * as THREE from 'three';
import { GameLoop, SubsystemRegistry } from '@generals/core';
import {
  AssetManager,
  RUNTIME_ASSET_BASE_URL,
  RUNTIME_MANIFEST_FILE,
} from '@generals/assets';
import { TerrainVisual, WaterVisual } from '@generals/renderer';
import type { MapDataJSON } from '@generals/renderer';
import { InputManager, RTSCamera } from '@generals/input';
import { AudioManager, initializeAudioContext } from '@generals/audio';
import { IniDataRegistry, type IniDataBundle } from '@generals/ini-data';
import { initializeNetworkClient } from '@generals/network';
import { GameLogicSubsystem } from '@generals/game-logic';
import { UiRuntime, initializeUiOverlay } from '@generals/ui';

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const runtimeAssetPrefixPattern = new RegExp(`^${escapeRegExp(RUNTIME_ASSET_BASE_URL)}/`, 'i');
const runtimeAssetBasePattern = new RegExp(`^${escapeRegExp(RUNTIME_ASSET_BASE_URL)}$`, 'i');

function normalizeRuntimeAssetPath(pathValue: string | null): string | null {
  if (!pathValue) return null;
  const normalized = pathValue
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/\.\//g, '/')
    .replace(/\/{2,}/g, '/');
  if (runtimeAssetBasePattern.test(normalized)) {
    return '';
  }
  return normalized.replace(runtimeAssetPrefixPattern, '');
}

// ============================================================================
// Engine initialization
// ============================================================================

async function init(): Promise<void> {
  initializeAudioContext();
  const networkManager = initializeNetworkClient({ forceSinglePlayer: true });
  initializeUiOverlay();

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

  // Asset Manager (first — must init before any asset loads)
  const assets = new AssetManager({
    baseUrl: RUNTIME_ASSET_BASE_URL,
    manifestUrl: RUNTIME_MANIFEST_FILE,
    requireManifest: true,
  });
  subsystems.register(assets);

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

  // Audio
  const audioManager = new AudioManager({ debugLabel: '@generals/audio' });
  subsystems.register(audioManager);

  // Network
  subsystems.register(networkManager);

  // UI
  const uiRuntime = new UiRuntime({ enableDebugOverlay: true });
  subsystems.register(uiRuntime);

  // Initialize registered runtime subsystems before any asset fetches so
  // AssetManager has the manifest and cache ready.
  await subsystems.initAll();

  // ========================================================================
  // Game data (INI bundle)
  // ========================================================================

  const iniDataRegistry = new IniDataRegistry();
  let iniDataInfo = 'INI data bundle not loaded';
  try {
    const bundleHandle = await assets.loadJSON<IniDataBundle>('data/ini-bundle.json', (loaded, total) => {
      const pct = total > 0 ? Math.round(40 + (loaded / total) * 8) : 48;
      setLoadingProgress(pct, 'Loading INI bundle...');
    });
    iniDataRegistry.loadBundle(bundleHandle.data);
    iniDataInfo = `INI bundle loaded from ${bundleHandle.cached ? 'cache' : 'network'} ` +
      `(${bundleHandle.data.stats.objects} objects, ${bundleHandle.data.stats.weapons} weapons)`;
  } catch (bundleErr) {
    throw new Error(
      `Required runtime asset "data/ini-bundle.json" failed to load: ${
        bundleErr instanceof Error ? bundleErr.message : String(bundleErr)
      }`,
    );
  }

  const iniDataStats = iniDataRegistry.getStats();
  setLoadingProgress(48, 'Game data ready');

  // Game logic + object visuals
  const attackUsesLineOfSight = iniDataRegistry.getAiConfig()?.attackUsesLineOfSight ?? true;
  const gameLogic = new GameLogicSubsystem(scene, { attackUsesLineOfSight });
  subsystems.register(gameLogic);
  await gameLogic.init();

  setLoadingProgress(50, 'Loading terrain...');
  const dataSuffix = ` | INI: ${iniDataStats.objects} objects, ${iniDataStats.weapons} weapons`;
  console.log(`Game data status: ${iniDataInfo}`);

  // ========================================================================
  // Load terrain (map JSON or procedural demo)
  // ========================================================================

  const urlParams = new URLSearchParams(window.location.search);
  const mapPathParam = urlParams.get('map');
  const mapPath = normalizeRuntimeAssetPath(mapPathParam);
  let mapData: MapDataJSON;

  let loadedFromJSON = false;

  if (mapPathParam !== null) {
    if (!mapPath) {
      throw new Error(
        `Requested map path "${mapPathParam}" is invalid after runtime normalization`,
      );
    }
    try {
      const handle = await assets.loadJSON<MapDataJSON>(mapPath, (loaded, total) => {
        const pct = total > 0 ? Math.round(50 + (loaded / total) * 20) : 60;
        setLoadingProgress(pct, 'Loading map data...');
      });
      mapData = handle.data;
      loadedFromJSON = true;
      console.log(`Map loaded via AssetManager (cached: ${handle.cached}, hash: ${handle.hash ?? 'n/a'})`);
    } catch (err) {
      throw new Error(
        `Requested map "${mapPath}" failed to load: ${err instanceof Error ? err.message : String(err)}`,
      );
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
  const heightmap = terrainVisual.getHeightmap();
  if (!heightmap) {
    throw new Error('Failed to initialize terrain heightmap');
  }

  const objectPlacement = gameLogic.loadMapObjects(mapData, iniDataRegistry, heightmap);
  if (objectPlacement.unresolvedObjects > 0) {
    console.warn(
      `Object resolve summary: ${objectPlacement.resolvedObjects}/${objectPlacement.spawnedObjects} objects resolved`,
    );
  }
  const objectStatus = ` | Objects: ${objectPlacement.spawnedObjects}/${objectPlacement.totalObjects} ` +
    `(unresolved: ${objectPlacement.unresolvedObjects})`;

  setLoadingProgress(70, 'Configuring camera...');

  // ========================================================================
  // Camera setup
  // ========================================================================

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
      const inputState = inputManager.getState();
      gameLogic.handlePointerInput(inputState, camera);

      // Feed input to camera
      rtsCamera.setInputState(inputState);

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
      const selectedInfo = gameLogic.getSelectedEntityId();
      uiRuntime.setSelectedObjectName(
        selectedInfo === null ? null : `Unit #${selectedInfo}`,
      );
      debugInfo.textContent =
        `FPS: ${displayFps} | Map: ${mapInfo}${wireInfo}${dataSuffix}${objectStatus} | Sel: ` +
        `${selectedInfo === null ? 'none' : `#${selectedInfo}`} | Frame: ${gameLoop.getFrameNumber()}`;
    },
  });

  // Handle resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    uiRuntime.resize(window.innerWidth, window.innerHeight);
  });

  const disposeGame = (): void => {
    gameLoop.stop();
    subsystems.disposeAll();
  };

  window.addEventListener('pagehide', disposeGame);
  window.addEventListener('beforeunload', disposeGame);

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
  console.log('Stage 3: Terrain + map entities bootstrapped.');
  console.log(`Terrain: ${heightmap.width}x${heightmap.height} (${mapPath ?? 'procedural demo'})`);
  console.log(`Placed ${objectPlacement.spawnedObjects}/${objectPlacement.totalObjects} objects from map data.`);
  console.log('Controls: LMB=select, RMB=move, WASD=scroll, Q/E=rotate, Wheel=zoom, Middle-drag=pan, F1=wireframe');
}

init().catch((err) => {
  console.error('Failed to initialize engine:', err);
  setLoadingProgress(0, `Error: ${err instanceof Error ? err.message : String(err)}`);
});
