/**
 * C&C Generals: Zero Hour — Browser Port
 *
 * Application entry point. Wires subsystems: InputManager, RTSCamera,
 * TerrainVisual, WaterVisual. Loads either a converted map JSON
 * (via ?map=path.json URL param) or a procedural demo terrain.
 */

import * as THREE from 'three';
import { GameLoop, SubsystemRegistry } from '@generals/engine';
import {
  AssetManager,
  RUNTIME_ASSET_BASE_URL,
  RUNTIME_MANIFEST_FILE,
} from '@generals/assets';
import { TerrainVisual, WaterVisual } from '@generals/renderer';
import type { MapDataJSON } from '@generals/renderer';
import { InputManager, RTSCamera, type InputState } from '@generals/input';
import {
  AudioAffect,
  AudioControl,
  AudioManager,
  AudioPriority,
  AudioType,
  SoundType,
  initializeAudioContext,
} from '@generals/audio';
import { IniDataRegistry, type AudioEventDef, type IniDataBundle } from '@generals/ini-data';
import { initializeNetworkClient } from '@generals/network';
import { GameLogicSubsystem } from '@generals/game-logic';
import {
  UiRuntime,
  initializeUiOverlay,
} from '@generals/ui';
import {
  playUiFeedbackAudio,
} from './control-bar-audio.js';
import {
  buildControlBarButtonsForSelection,
} from './control-bar-buttons.js';
import { dispatchIssuedControlBarCommands } from './control-bar-dispatch.js';
import {
  isObjectTargetAllowedForSelection,
  isObjectTargetRelationshipAllowed,
} from './control-bar-targeting.js';
import { collectShortcutSpecialPowerReadyFrames } from './shortcut-special-power-sources.js';
import { resolveSfxVolumesFromAudioSettings } from './audio-settings.js';
import {
  extractAudioOptionPreferences,
  loadOptionPreferencesFromStorage,
} from './option-preferences.js';
import { syncPlayerSidesFromNetwork } from './player-side-sync.js';

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

const AUDIO_PRIORITY_BY_NAME = new Map<string, AudioPriority>([
  ['LOWEST', AudioPriority.AP_LOWEST],
  ['LOW', AudioPriority.AP_LOW],
  ['NORMAL', AudioPriority.AP_NORMAL],
  ['HIGH', AudioPriority.AP_HIGH],
  ['CRITICAL', AudioPriority.AP_CRITICAL],
]);

const SOUND_TYPE_MASK_BY_NAME = new Map<string, number>([
  ['UI', SoundType.ST_UI],
  ['WORLD', SoundType.ST_WORLD],
  ['SHROUDED', SoundType.ST_SHROUDED],
  ['GLOBAL', SoundType.ST_GLOBAL],
  ['VOICE', SoundType.ST_VOICE],
  ['PLAYER', SoundType.ST_PLAYER],
  ['ALLIES', SoundType.ST_ALLIES],
  ['ENEMIES', SoundType.ST_ENEMIES],
  ['EVERYONE', SoundType.ST_EVERYONE],
]);

const AUDIO_CONTROL_MASK_BY_NAME = new Map<string, number>([
  ['LOOP', AudioControl.AC_LOOP],
  ['RANDOM', AudioControl.AC_RANDOM],
  ['ALL', AudioControl.AC_ALL],
  ['POSTDELAY', AudioControl.AC_POSTDELAY],
  ['INTERRUPT', AudioControl.AC_INTERRUPT],
]);

function audioTypeFromIniSoundType(soundType: AudioEventDef['soundType']): AudioType {
  switch (soundType) {
    case 'music':
      return AudioType.AT_Music;
    case 'streaming':
      return AudioType.AT_Streaming;
    case 'sound':
    default:
      return AudioType.AT_SoundEffect;
  }
}

function defaultAudioEventNameForType(soundType: AudioEventDef['soundType']): string {
  switch (soundType) {
    case 'music':
      return 'DefaultMusicTrack';
    case 'streaming':
      return 'DefaultDialog';
    case 'sound':
    default:
      return 'DefaultSoundEffect';
  }
}

function applyBitMaskNames(
  names: readonly string[],
  maskByName: ReadonlyMap<string, number>,
): number | undefined {
  if (names.length === 0) {
    return undefined;
  }

  let mask = 0;
  for (const name of names) {
    const bit = maskByName.get(name);
    if (bit !== undefined) {
      mask |= bit;
    }
  }
  return mask;
}

function resolveAudioEventDefaults(
  iniDataRegistry: IniDataRegistry,
  audioEvent: AudioEventDef,
): AudioEventDef {
  const defaultName = defaultAudioEventNameForType(audioEvent.soundType);
  if (audioEvent.name === defaultName) {
    return audioEvent;
  }

  const defaults = iniDataRegistry.getAudioEvent(defaultName);
  if (!defaults) {
    return audioEvent;
  }

  return {
    ...audioEvent,
    priorityName: audioEvent.priorityName ?? defaults.priorityName,
    typeNames: audioEvent.typeNames.length > 0 ? [...audioEvent.typeNames] : [...defaults.typeNames],
    controlNames: audioEvent.controlNames.length > 0 ? [...audioEvent.controlNames] : [...defaults.controlNames],
    volume: audioEvent.volume ?? defaults.volume,
    minVolume: audioEvent.minVolume ?? defaults.minVolume,
    limit: audioEvent.limit ?? defaults.limit,
    minRange: audioEvent.minRange ?? defaults.minRange,
    maxRange: audioEvent.maxRange ?? defaults.maxRange,
    filename: audioEvent.filename ?? defaults.filename,
  };
}

function registerIniAudioEvents(
  iniDataRegistry: IniDataRegistry,
  audioManager: AudioManager,
): number {
  let registeredCount = 0;

  for (const audioEvent of iniDataRegistry.audioEvents.values()) {
    const resolved = resolveAudioEventDefaults(iniDataRegistry, audioEvent);
    const soundType = audioTypeFromIniSoundType(resolved.soundType);
    const priority = resolved.priorityName
      ? AUDIO_PRIORITY_BY_NAME.get(resolved.priorityName)
      : undefined;
    const typeMask = applyBitMaskNames(resolved.typeNames, SOUND_TYPE_MASK_BY_NAME);
    const controlMask = applyBitMaskNames(resolved.controlNames, AUDIO_CONTROL_MASK_BY_NAME);

    audioManager.addAudioEventInfo({
      audioName: resolved.name,
      filename: resolved.filename,
      soundType,
      priority,
      type: typeMask,
      control: controlMask,
      volume: resolved.volume,
      minVolume: resolved.minVolume,
      limit: resolved.limit,
      minRange: resolved.minRange,
      maxRange: resolved.maxRange,
    });

    if (soundType === AudioType.AT_Music && resolved.name !== 'DefaultMusicTrack') {
      audioManager.addTrackName(resolved.name);
    }
    registeredCount += 1;
  }

  return registeredCount;
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
  let browserStorage: Storage | null = null;
  if (typeof window !== 'undefined') {
    try {
      browserStorage = window.localStorage;
    } catch {
      browserStorage = null;
    }
  }
  const optionPreferenceEntries = loadOptionPreferencesFromStorage(
    browserStorage,
  );
  const audioOptionPreferences = extractAudioOptionPreferences(optionPreferenceEntries);
  if (optionPreferenceEntries.size > 0) {
    iniDataInfo += ` | OptionPreferences keys=${optionPreferenceEntries.size}`;
  }
  const audioSettings = iniDataRegistry.getAudioSettings();
  if (audioSettings) {
    if (audioSettings.sampleCount2D !== undefined || audioSettings.sampleCount3D !== undefined) {
      // Source behavior from AudioSettings / MilesAudioManager::initSamplePools:
      // sample pool capacities come from INI-configured counts.
      // TODO: Source parity gap. GameLOD/user-preference presets can override these
      // counts at runtime; that override path is not yet ported.
      audioManager.setSampleCounts(
        audioSettings.sampleCount2D ?? Number.NaN,
        audioSettings.sampleCount3D ?? Number.NaN,
      );
      iniDataInfo +=
        ` | Audio sample pools 2D=${audioSettings.sampleCount2D ?? 'default'}` +
        ` 3D=${audioSettings.sampleCount3D ?? 'default'}`;
    }

    if (audioSettings.streamCount !== undefined) {
      // Source behavior from AudioSettings::StreamCount:
      // streaming voices share a finite stream pool.
      audioManager.setStreamCount(audioSettings.streamCount);
      iniDataInfo += ` | Audio stream pool=${audioSettings.streamCount}`;
    }
    if (audioSettings.minSampleVolume !== undefined) {
      // Source behavior from AudioSettings::MinSampleVolume:
      // low-volume samples are culled globally before playback.
      audioManager.setGlobalMinVolume(audioSettings.minSampleVolume);
      iniDataInfo += ` | Audio min sample volume=${audioSettings.minSampleVolume}`;
    }
    if (audioSettings.globalMinRange !== undefined || audioSettings.globalMaxRange !== undefined) {
      // Source behavior from MilesAudioManager::playSample3D/getEffectiveVolume:
      // ST_GLOBAL events use AudioSettings global range bounds.
      audioManager.setGlobalRanges(
        audioSettings.globalMinRange,
        audioSettings.globalMaxRange,
      );
      iniDataInfo +=
        ` | Audio global range=${audioSettings.globalMinRange ?? 'default'}-` +
        `${audioSettings.globalMaxRange ?? 'default'}`;
    }

    const resolvedSfxVolumes = resolveSfxVolumesFromAudioSettings(audioSettings, audioOptionPreferences);
    if (resolvedSfxVolumes.music !== undefined) {
      audioManager.setVolume(
        resolvedSfxVolumes.music,
        AudioAffect.AudioAffect_Music | AudioAffect.AudioAffect_SystemSetting,
      );
    }
    if (resolvedSfxVolumes.sound2D !== undefined) {
      audioManager.setVolume(
        resolvedSfxVolumes.sound2D,
        AudioAffect.AudioAffect_Sound | AudioAffect.AudioAffect_SystemSetting,
      );
    }
    if (resolvedSfxVolumes.sound3D !== undefined) {
      audioManager.setVolume(
        resolvedSfxVolumes.sound3D,
        AudioAffect.AudioAffect_Sound3D | AudioAffect.AudioAffect_SystemSetting,
      );
    }
    if (resolvedSfxVolumes.speech !== undefined) {
      audioManager.setVolume(
        resolvedSfxVolumes.speech,
        AudioAffect.AudioAffect_Speech | AudioAffect.AudioAffect_SystemSetting,
      );
    }

    if (resolvedSfxVolumes.usedOptionPreferenceOverrides) {
      iniDataInfo += ' | Audio OptionPreferences overrides';
    }
    if (audioOptionPreferences.preferred3DProvider || audioOptionPreferences.speakerType) {
      audioManager.setPreferredProvider(audioOptionPreferences.preferred3DProvider ?? null);
      audioManager.setPreferredSpeaker(audioOptionPreferences.speakerType ?? null);
      // TODO: Source parity gap. Browser backend currently stores preferred
      // provider/speaker metadata but cannot route to Miles device selection.
      iniDataInfo +=
        ` | Audio prefs provider=${audioOptionPreferences.preferred3DProvider ?? 'default'}` +
        ` speaker=${audioOptionPreferences.speakerType ?? 'default'}`;
    }

    if (resolvedSfxVolumes.usedRelative2DVolume && audioSettings.relative2DVolume !== undefined) {
      iniDataInfo += ` | Audio Relative2DVolume=${audioSettings.relative2DVolume}`;
    }
    if (resolvedSfxVolumes.unresolvedRelative2DVolume) {
      // TODO: Source parity gap. Relative2DVolume fallback depends on source
      // AudioSettings defaults for both SFX channels. INI bundles missing those
      // defaults cannot resolve preferred SFX volumes exactly.
    }
  }
  const registeredAudioEvents = registerIniAudioEvents(iniDataRegistry, audioManager);
  iniDataInfo += ` | Audio events: ${registeredAudioEvents}`;
  setLoadingProgress(48, 'Game data ready');

  // Game logic + object visuals
  const attackUsesLineOfSight = iniDataRegistry.getAiConfig()?.attackUsesLineOfSight ?? true;
  const gameLogic = new GameLogicSubsystem(scene, { attackUsesLineOfSight });
  networkManager.setDeterministicGameLogicCrcSectionWriters(
    gameLogic.createDeterministicGameLogicCrcSectionWriters(),
  );
  subsystems.register(gameLogic);
  await gameLogic.init();
  audioManager.setObjectPositionResolver((objectId) => gameLogic.getEntityWorldPosition(objectId));
  audioManager.setPlayerRelationshipResolver((owningPlayerIndex, localPlayerIndex) =>
    gameLogic.getPlayerRelationshipByIndex(owningPlayerIndex, localPlayerIndex),
  );
  syncPlayerSidesFromNetwork(networkManager, gameLogic);

  setLoadingProgress(50, 'Loading terrain...');
  const dataSuffix = ` | INI: ${iniDataStats.objects} objects, ${iniDataStats.weapons} weapons, ${iniDataStats.audioEvents} audio`;
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
  const cameraForward = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();

  const activateControlBarSlot = (slotIndex: number): void => {
    const sourceSlot = slotIndex + 1;
    const activation = uiRuntime.activateControlBarSlot(sourceSlot);
    const buttons = uiRuntime.getControlBarButtons();
    const button = buttons.find((candidate) => candidate.slot === sourceSlot) ?? null;
    if (!button && activation.status === 'missing') {
      return;
    }

    const buttonLabel = button?.label ?? `Slot ${sourceSlot}`;
    if (activation.status === 'needs-target') {
      uiRuntime.showMessage(`${buttonLabel}: select target with right-click.`);
      playUiFeedbackAudio(iniDataRegistry, audioManager, 'select');
      return;
    }
    if (activation.status === 'issued') {
      playUiFeedbackAudio(iniDataRegistry, audioManager, 'accept');
      return;
    }
    if (activation.status === 'disabled') {
      uiRuntime.showMessage(`${buttonLabel}: unavailable.`);
      playUiFeedbackAudio(iniDataRegistry, audioManager, 'invalid');
    }
  };

  // F1 toggle wireframe
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F1') {
      e.preventDefault();
      terrainVisual.toggleWireframe();
      return;
    }

    const slotIndex = Number.parseInt(e.key, 10);
    if (Number.isInteger(slotIndex) && slotIndex >= 1 && slotIndex <= 9) {
      e.preventDefault();
      activateControlBarSlot(slotIndex - 1);
    }
  });

  // ========================================================================
  // Game loop
  // ========================================================================

  const gameLoop = new GameLoop(30);

  gameLoop.start({
    onSimulationStep(_frameNumber: number, dt: number) {
      const inputState = inputManager.getState();
      let inputStateForGameLogic: InputState = inputState;
      camera.getWorldDirection(cameraForward);
      cameraUp.copy(camera.up).normalize();
      audioManager.setLocalPlayerIndex(networkManager.getLocalPlayerID());
      syncPlayerSidesFromNetwork(networkManager, gameLogic);
      audioManager.setListenerPosition([
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ]);
      audioManager.setListenerOrientation(
        [cameraForward.x, cameraForward.y, cameraForward.z],
        [cameraUp.x, cameraUp.y, cameraUp.z],
      );

      const pendingControlBarCommand = uiRuntime.getPendingControlBarCommand();
      if (pendingControlBarCommand && inputState.rightMouseClick) {
        inputStateForGameLogic = {
          ...inputState,
          rightMouseClick: false,
        };

        if (pendingControlBarCommand.targetKind === 'position') {
          const worldTarget = gameLogic.resolveMoveTargetFromInput(inputState, camera);
          if (worldTarget) {
            uiRuntime.commitPendingControlBarTarget({
              kind: 'position',
              x: worldTarget.x,
              y: 0,
              z: worldTarget.z,
            });
          } else {
            uiRuntime.showMessage('Select a valid ground target.');
          }
        } else if (pendingControlBarCommand.targetKind === 'object') {
          const targetObjectId = gameLogic.resolveObjectTargetFromInput(inputState, camera);
          if (targetObjectId !== null) {
            const selectedObjectIds = uiRuntime.getSelectionState().selectedObjectIds;
            const sourceObjectIds = selectedObjectIds.length > 0
              ? selectedObjectIds
              : (() => {
                  const selectedEntityId = gameLogic.getSelectedEntityId();
                  return selectedEntityId === null ? [] : [selectedEntityId];
                })();
            const isValidTarget = sourceObjectIds.length === 1
              ? isObjectTargetRelationshipAllowed(
                  pendingControlBarCommand.commandOption,
                  gameLogic.getEntityRelationship(sourceObjectIds[0]!, targetObjectId),
                )
              : isObjectTargetAllowedForSelection(
                  pendingControlBarCommand.commandOption,
                  sourceObjectIds,
                  targetObjectId,
                  (sourceObjectId, objectTargetId) => gameLogic.getEntityRelationship(
                    sourceObjectId,
                    objectTargetId,
                  ),
                );
            if (!isValidTarget) {
              uiRuntime.showMessage('Target is not valid for this command.');
              playUiFeedbackAudio(iniDataRegistry, audioManager, 'invalid');
            } else {
              uiRuntime.commitPendingControlBarTarget({
                kind: 'object',
                objectId: targetObjectId,
              });
            }
          } else {
            uiRuntime.showMessage('Select a valid target object.');
          }
        } else {
          const contextTargetObjectId = gameLogic.resolveObjectTargetFromInput(inputState, camera);
          const contextWorldTarget = gameLogic.resolveMoveTargetFromInput(inputState, camera);
          if (contextTargetObjectId === null && !contextWorldTarget) {
            uiRuntime.showMessage('Select a valid command target.');
          } else {
            uiRuntime.commitPendingControlBarTarget({
              kind: 'context',
              payload: {
                targetObjectId: contextTargetObjectId,
                targetPosition: contextWorldTarget
                  ? [contextWorldTarget.x, 0, contextWorldTarget.z]
                  : null,
              },
            });
          }
        }
      }

      gameLogic.handlePointerInput(inputStateForGameLogic, camera);
      dispatchIssuedControlBarCommands(
        uiRuntime.consumeIssuedCommands(),
        iniDataRegistry,
        gameLogic,
        uiRuntime,
        audioManager,
        networkManager.getLocalPlayerID(),
      );

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
      const selectedInfo = gameLogic.getSelectedEntityInfo();
      const selectedEntityId = selectedInfo?.id ?? null;
      const controlBarButtons = buildControlBarButtonsForSelection(
        iniDataRegistry,
        {
          templateName: selectedInfo?.templateName ?? null,
          canMove: selectedInfo?.canMove ?? false,
          hasAutoRallyPoint: selectedInfo?.hasAutoRallyPoint ?? false,
          isUnmanned: selectedInfo?.isUnmanned ?? false,
          isDozer: selectedInfo?.isDozer ?? false,
          isMoving: selectedInfo?.isMoving ?? false,
          appliedUpgradeNames: selectedInfo?.appliedUpgradeNames ?? [],
          // TODO: Source parity gap: player progression currently comes from
          // game-logic command hooks, not a full Player subsystem.
          playerUpgradeNames: gameLogic.getLocalPlayerUpgradeNames(),
          playerScienceNames: gameLogic.getLocalPlayerScienceNames(),
          playerSciencePurchasePoints: gameLogic.getLocalPlayerSciencePurchasePoints(),
          disabledScienceNames: gameLogic.getLocalPlayerDisabledScienceNames(),
          hiddenScienceNames: gameLogic.getLocalPlayerHiddenScienceNames(),
        },
      );

      const currentShortcutSpecialPowerReadyFrames = collectShortcutSpecialPowerReadyFrames(
        controlBarButtons,
        iniDataRegistry,
      );

      if (selectedEntityId !== null) {
        // Source behavior from Player::findMostReadyShortcutSpecialPowerOfType:
        // candidate source objects are tracked per special power and resolved by
        // lowest ready frame.
        // TODO: Source parity gap: ready-frame values currently come from command
        // card enabled state, not live SpecialPowerModule cooldown frames.
        gameLogic.clearTrackedShortcutSpecialPowerSourceEntity(selectedEntityId);
        for (const [specialPowerName, readyFrame] of currentShortcutSpecialPowerReadyFrames) {
          gameLogic.trackShortcutSpecialPowerSourceEntity(
            specialPowerName,
            selectedEntityId,
            readyFrame,
          );
        }
      }

      uiRuntime.setSelectionState({
        selectedObjectIds: selectedInfo ? [selectedInfo.id] : [],
        selectedObjectName: selectedInfo?.templateName ?? '',
      });
      uiRuntime.setControlBarButtons(controlBarButtons);
      debugInfo.textContent =
        `FPS: ${displayFps} | Map: ${mapInfo}${wireInfo}${dataSuffix}${objectStatus} | Sel: ` +
        `${selectedEntityId === null ? 'none' : `#${selectedEntityId}`} | Frame: ${gameLoop.getFrameNumber()}`;
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
  console.log('Controls: LMB=select, RMB=move/confirm target, 1-9=ControlBar slot, WASD=scroll, Q/E=rotate, Wheel=zoom, Middle-drag=pan, F1=wireframe');
}

init().catch((err) => {
  console.error('Failed to initialize engine:', err);
  setLoadingProgress(0, `Error: ${err instanceof Error ? err.message : String(err)}`);
});
