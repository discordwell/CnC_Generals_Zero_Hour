/**
 * C&C Generals: Zero Hour — Browser Port
 *
 * Application entry point. Initializes all engine subsystems, sets up
 * the Three.js renderer, and starts the game loop.
 */

import * as THREE from 'three';
import { GameLoop, SubsystemRegistry, Vector3 } from '@generals/core';

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

  setLoadingProgress(30, 'Setting up scene...');

  // Basic scene setup — will be replaced by terrain renderer in Stage 3
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x333344, 0.002);

  // RTS camera (looking down at an angle)
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    5000,
  );
  camera.position.set(0, 300, 300);
  camera.lookAt(0, 0, 0);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xfff4e0, 1.2);
  directionalLight.position.set(200, 400, 200);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  setLoadingProgress(50, 'Creating placeholder terrain...');

  // Placeholder terrain grid — will be replaced by heightmap renderer
  const gridSize = 512;
  const gridDivisions = 64;
  const terrainGeometry = new THREE.PlaneGeometry(
    gridSize,
    gridSize,
    gridDivisions,
    gridDivisions,
  );
  terrainGeometry.rotateX(-Math.PI / 2);

  // Add some height variation to the placeholder
  const positions = terrainGeometry.attributes.position!;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const height =
      Math.sin(x * 0.02) * 5 +
      Math.cos(z * 0.03) * 3 +
      Math.sin((x + z) * 0.01) * 8;
    positions.setY(i, height);
  }
  terrainGeometry.computeVertexNormals();

  const terrainMaterial = new THREE.MeshLambertMaterial({
    color: 0x8b7355,
    wireframe: false,
  });
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  scene.add(terrain);

  // Placeholder unit — a simple box standing on the terrain
  const unitGeometry = new THREE.BoxGeometry(6, 4, 10);
  const unitMaterial = new THREE.MeshLambertMaterial({ color: 0x3366cc });
  const unit = new THREE.Mesh(unitGeometry, unitMaterial);
  unit.position.set(0, 4, 0);
  scene.add(unit);

  // Selection ring (projected circle under unit)
  const ringGeometry = new THREE.RingGeometry(7, 8, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial);
  selectionRing.position.set(0, 0.5, 0);
  scene.add(selectionRing);

  setLoadingProgress(70, 'Setting up input...');

  // Basic camera controls (placeholder — will be replaced by RTS camera system)
  let cameraAngle = 0;
  let cameraZoom = 300;
  const cameraTarget = new THREE.Vector3(0, 0, 0);

  function updateCamera(): void {
    camera.position.x = cameraTarget.x + Math.sin(cameraAngle) * cameraZoom;
    camera.position.z = cameraTarget.z + Math.cos(cameraAngle) * cameraZoom;
    camera.position.y = cameraZoom * 0.8;
    camera.lookAt(cameraTarget);
  }

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraZoom = Math.max(50, Math.min(800, cameraZoom + e.deltaY * 0.5));
    updateCamera();
  });

  // Edge scrolling
  const scrollSpeed = 5;
  const edgeSize = 20;
  let scrollDx = 0;
  let scrollDz = 0;

  canvas.addEventListener('mousemove', (e) => {
    scrollDx = 0;
    scrollDz = 0;
    if (e.clientX < edgeSize) scrollDx = -scrollSpeed;
    if (e.clientX > window.innerWidth - edgeSize) scrollDx = scrollSpeed;
    if (e.clientY < edgeSize) scrollDz = -scrollSpeed;
    if (e.clientY > window.innerHeight - edgeSize) scrollDz = scrollSpeed;
  });

  // Keyboard camera rotation
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => keys.add(e.key));
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  setLoadingProgress(90, 'Starting game loop...');

  // Subsystem registry (empty for now — subsystems added in later stages)
  const subsystems = new SubsystemRegistry();

  // Debug info
  const debugInfo = document.getElementById('debug-info') as HTMLDivElement;
  let frameCount = 0;
  let lastFpsUpdate = performance.now();
  let displayFps = 0;

  // Game loop
  const gameLoop = new GameLoop(30);

  gameLoop.start({
    onSimulationStep(frameNumber: number, _dt: number) {
      // Apply camera scrolling
      cameraTarget.x += scrollDx;
      cameraTarget.z += scrollDz;

      // Keyboard rotation
      if (keys.has('q') || keys.has('Q')) cameraAngle -= 0.03;
      if (keys.has('e') || keys.has('E')) cameraAngle += 0.03;

      // Keyboard scrolling
      if (keys.has('ArrowLeft') || keys.has('a')) cameraTarget.x -= scrollSpeed;
      if (keys.has('ArrowRight') || keys.has('d')) cameraTarget.x += scrollSpeed;
      if (keys.has('ArrowUp') || keys.has('w')) cameraTarget.z -= scrollSpeed;
      if (keys.has('ArrowDown') || keys.has('s')) cameraTarget.z += scrollSpeed;

      updateCamera();

      // Animate placeholder unit (rotate in circle)
      const angle = frameNumber * 0.02;
      unit.position.x = Math.cos(angle) * 30;
      unit.position.z = Math.sin(angle) * 30;
      unit.rotation.y = -angle + Math.PI / 2;
      selectionRing.position.x = unit.position.x;
      selectionRing.position.z = unit.position.z;

      subsystems.updateAll(_dt);
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
      debugInfo.textContent = `FPS: ${displayFps} | Frame: ${gameLoop.getFrameNumber()}`;
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
  console.log('Engine initialized. Stage 0 scaffolding active.');
  console.log(`Core math test: Vector3(1,2,3).length() = ${new Vector3(1, 2, 3).length()}`);
}

init().catch((err) => {
  console.error('Failed to initialize engine:', err);
  setLoadingProgress(0, `Error: ${err instanceof Error ? err.message : String(err)}`);
});
