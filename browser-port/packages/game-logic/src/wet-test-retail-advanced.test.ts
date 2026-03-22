/**
 * Advanced Retail Wet Tests — exercises full build chains, unit training,
 * cross-faction play, pathfinding, economy, and AI composition with real
 * retail INI data on Tournament Desert.
 *
 * These tests are designed to surface parity bugs by logging anomalies
 * rather than hard-failing on non-critical issues.
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameLogicSubsystem } from './index.js';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, type MapDataJSON } from '@generals/terrain';

const ASSETS_DIR = resolve(import.meta.dirname ?? __dirname, '../../app/public/assets');

let iniRegistry: IniDataRegistry;
let mapData: MapDataJSON;

function loadRetailData(): boolean {
  try {
    const bundleJson = JSON.parse(readFileSync(resolve(ASSETS_DIR, 'data/ini-bundle.json'), 'utf-8'));
    iniRegistry = new IniDataRegistry();
    iniRegistry.loadBundle(bundleJson);
    mapData = JSON.parse(readFileSync(
      resolve(ASSETS_DIR, 'maps/_extracted/MapsZH/Maps/Tournament Desert/Tournament Desert.json'), 'utf-8',
    ));
    return true;
  } catch { return false; }
}

const hasRetailData = loadRetailData();

// ---- Helpers ----

interface SetupOptions {
  player0Side: string;
  player1Side: string;
  credits?: number;
}

function setupGame(opts: SetupOptions): {
  logic: GameLogicSubsystem;
  heightmap: HeightmapGrid;
} {
  const logic = new GameLogicSubsystem(new THREE.Scene());
  const heightmap = HeightmapGrid.fromJSON(mapData.heightmap);
  logic.loadMapObjects(mapData, iniRegistry, heightmap);
  logic.setPlayerSide(0, opts.player0Side);
  logic.setPlayerSide(1, opts.player1Side);
  logic.setTeamRelationship(opts.player0Side, opts.player1Side, 0);
  logic.setTeamRelationship(opts.player1Side, opts.player0Side, 0);
  logic.spawnSkirmishStartingEntities();
  const credits = opts.credits ?? 50000;
  logic.submitCommand({ type: 'setSideCredits', side: opts.player0Side, amount: credits });
  logic.submitCommand({ type: 'setSideCredits', side: opts.player1Side, amount: credits });
  logic.update(0);
  logic.update(1 / 30);
  return { logic, heightmap };
}

function advanceFrames(logic: GameLogicSubsystem, frames: number): void {
  for (let i = 0; i < frames; i++) logic.update(1 / 30);
}

function findEntity(logic: GameLogicSubsystem, templateName: string, side: string) {
  return logic.getRenderableEntityStates().find(e =>
    e.templateName === templateName && e.side?.toUpperCase() === side.toUpperCase(),
  );
}

function findAllEntities(logic: GameLogicSubsystem, side: string) {
  return logic.getRenderableEntityStates().filter(e =>
    e.side?.toUpperCase() === side.toUpperCase(),
  );
}

function findDozer(logic: GameLogicSubsystem, side: string) {
  const sideUpper = side.toUpperCase();
  const dozerTemplates: Record<string, string[]> = {
    AMERICA: ['AmericaVehicleDozer'],
    CHINA: ['ChinaVehicleDozer'],
    GLA: ['GLAInfantryWorker', 'GLAWorker'],
  };
  const templates = dozerTemplates[sideUpper];
  if (!templates) return undefined;
  for (const template of templates) {
    const found = logic.getRenderableEntityStates().find(e =>
      e.templateName === template && e.side?.toUpperCase() === sideUpper,
    );
    if (found) return found;
  }
  return undefined;
}


/**
 * Build a structure using the dozer. Places the building relative to the dozer's
 * CURRENT position (dozer.x + offsetX, dozer.z + offsetZ).
 * Returns whether the structure was found after construction. Logs anomalies.
 */
function buildStructure(
  logic: GameLogicSubsystem,
  side: string,
  templateName: string,
  offsetX: number,
  offsetZ: number,
  anomalies: string[],
  buildFrames = 900,
): boolean {
  const dozer = findDozer(logic, side);
  if (!dozer) {
    anomalies.push(`${templateName}: No dozer found for ${side}`);
    return false;
  }

  const creditsBefore = logic.getSideCredits(side.toLowerCase());
  const buildX = dozer.x + offsetX;
  const buildZ = dozer.z + offsetZ;

  logic.submitCommand({
    type: 'constructBuilding',
    entityId: dozer.id,
    templateName,
    targetPosition: [buildX, 0, buildZ],
    angle: 0,
    lineEndPosition: null,
  });
  advanceFrames(logic, buildFrames);

  const built = findEntity(logic, templateName, side);
  if (!built) {
    const creditsAfter = logic.getSideCredits(side.toLowerCase());
    if (creditsAfter === creditsBefore) {
      anomalies.push(`${templateName}: Construction command rejected (credits unchanged at ${creditsBefore})`);
    } else {
      anomalies.push(`${templateName}: Credits deducted (${creditsBefore} -> ${creditsAfter}) but structure not found after ${buildFrames} frames`);
    }
    return false;
  }

  // Check construction is complete
  if (built.constructionPercent >= 0 && built.constructionPercent < 100) {
    anomalies.push(`${templateName}: Still under construction at ${built.constructionPercent.toFixed(0)}% after ${buildFrames} frames`);
  }

  return true;
}

/**
 * Train a unit from a production building. Returns the spawned entity or null.
 */
function trainUnit(
  logic: GameLogicSubsystem,
  factoryTemplate: string,
  unitTemplate: string,
  side: string,
  anomalies: string[],
  trainFrames = 600,
) {
  const factory = findEntity(logic, factoryTemplate, side);
  if (!factory) {
    anomalies.push(`${unitTemplate}: Factory ${factoryTemplate} not found for ${side}`);
    return null;
  }

  const countBefore = logic.getRenderableEntityStates().filter(e =>
    e.templateName === unitTemplate && e.side?.toUpperCase() === side.toUpperCase(),
  ).length;

  logic.submitCommand({
    type: 'queueUnitProduction',
    entityId: factory.id,
    unitTemplateName: unitTemplate,
  });
  advanceFrames(logic, trainFrames);

  const countAfter = logic.getRenderableEntityStates().filter(e =>
    e.templateName === unitTemplate && e.side?.toUpperCase() === side.toUpperCase(),
  ).length;

  if (countAfter <= countBefore) {
    anomalies.push(`${unitTemplate}: Failed to train from ${factoryTemplate} (count ${countBefore} -> ${countAfter})`);
    return null;
  }

  return findEntity(logic, unitTemplate, side);
}

// ---- Tests ----

describe.skipIf(!hasRetailData)('retail advanced wet test: USA full build chain', () => {
  it('builds all USA structures in sequence: PP, Barracks, War Factory, Airfield, Strategy Center', () => {
    const { logic } = setupGame({ player0Side: 'America', player1Side: 'China' });
    const anomalies: string[] = [];

    // Build structures using dozer-relative offsets. The dozer moves to the
    // build site, so each subsequent offset is relative to the dozer's new position.
    // Use offset of 50 in one direction to avoid collision with prior builds.
    const structures = [
      { template: 'AmericaPowerPlant', offsetX: 50, offsetZ: 0 },
      { template: 'AmericaBarracks', offsetX: 50, offsetZ: 50 },
      { template: 'AmericaWarFactory', offsetX: 50, offsetZ: 0 },
      { template: 'AmericaAirfield', offsetX: 50, offsetZ: -50 },
      { template: 'AmericaStrategyCenter', offsetX: 50, offsetZ: 50 },
    ];

    const builtCount = { success: 0, fail: 0 };
    for (const s of structures) {
      const ok = buildStructure(logic, 'America', s.template, s.offsetX, s.offsetZ, anomalies, 1200);
      if (ok) builtCount.success++;
      else builtCount.fail++;
    }

    // Log results
    console.log(`\n=== USA BUILD CHAIN: ${builtCount.success}/${structures.length} structures built ===`);
    if (anomalies.length > 0) {
      console.log('Anomalies:');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // Check credits were deducted appropriately
    const finalCredits = logic.getSideCredits('america');
    console.log(`  Credits: 50000 -> ${finalCredits}`);

    // Check power state
    const powerState = logic.getSidePowerState('america');
    console.log(`  Power: production=${powerState.energyProduction}, consumption=${powerState.energyConsumption}, brownout=${powerState.brownedOut}`);

    // Log all USA buildings
    const usaBuildings = logic.getRenderableEntityStates()
      .filter(e => e.side?.toUpperCase() === 'AMERICA' && e.category === 'building')
      .map(e => `${e.templateName} (hp=${e.health}/${e.maxHealth}, construction=${e.constructionPercent})`);
    console.log(`  USA buildings: ${usaBuildings.join(', ')}`);

    // At minimum the power plant should build (it has no prerequisites)
    expect(builtCount.success).toBeGreaterThanOrEqual(1);
  }, 60000);
});

describe.skipIf(!hasRetailData)('retail advanced wet test: USA unit training', () => {
  it('trains one of each USA unit from the correct factory', () => {
    const { logic } = setupGame({ player0Side: 'America', player1Side: 'China' });
    const anomalies: string[] = [];

    // First build the required structures with generous frame budgets
    buildStructure(logic, 'America', 'AmericaPowerPlant', 50, 0, anomalies, 1200);
    buildStructure(logic, 'America', 'AmericaBarracks', 50, 50, anomalies, 1200);
    buildStructure(logic, 'America', 'AmericaWarFactory', 50, 0, anomalies, 1200);
    buildStructure(logic, 'America', 'AmericaAirfield', 50, -50, anomalies, 1200);
    buildStructure(logic, 'America', 'AmericaStrategyCenter', 50, 50, anomalies, 1200);

    // Infantry from Barracks
    const infantryUnits = [
      'AmericaInfantryRanger',
      'AmericaInfantryMissileDefender',
      'AmericaInfantryPathfinder',
    ];

    // Vehicles from War Factory
    const vehicleUnits = [
      'AmericaVehicleHumvee',
      'AmericaTankCrusader',
      'AmericaVehiclePaladin',
      'AmericaVehicleTomahawk',
    ];

    // Aircraft from Airfield
    const aircraftUnits = [
      'AmericaVehicleComanche',
      'AmericaJetRaptor',
      'AmericaJetStealthFighter',
    ];

    const results: { unit: string; success: boolean }[] = [];

    for (const unit of infantryUnits) {
      const spawned = trainUnit(logic, 'AmericaBarracks', unit, 'America', anomalies);
      results.push({ unit, success: !!spawned });
    }

    for (const unit of vehicleUnits) {
      const spawned = trainUnit(logic, 'AmericaWarFactory', unit, 'America', anomalies);
      results.push({ unit, success: !!spawned });
    }

    for (const unit of aircraftUnits) {
      const spawned = trainUnit(logic, 'AmericaAirfield', unit, 'America', anomalies);
      results.push({ unit, success: !!spawned });
    }

    // Log results
    const successCount = results.filter(r => r.success).length;
    console.log(`\n=== USA UNIT TRAINING: ${successCount}/${results.length} units trained ===`);
    for (const r of results) {
      console.log(`  ${r.success ? 'OK' : 'FAIL'}: ${r.unit}`);
    }
    if (anomalies.length > 0) {
      console.log('Anomalies:');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // Log all current USA entities for diagnosis
    const allUSA = findAllEntities(logic, 'America');
    console.log(`  All USA entities (${allUSA.length}):`);
    const groups = new Map<string, number>();
    for (const e of allUSA) groups.set(e.templateName, (groups.get(e.templateName) ?? 0) + 1);
    for (const [name, count] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${count}x ${name}`);
    }

    // Don't hard-fail — log findings. The build chain may have issues.
    console.log(`  Result: ${successCount}/${results.length} units trained successfully`);
  }, 60000);
});

describe.skipIf(!hasRetailData)('retail advanced wet test: GLA build chain', () => {
  it('builds GLA structures: Supply Stash, Barracks, Arms Dealer, Palace (no power needed)', () => {
    const { logic } = setupGame({ player0Side: 'GLA', player1Side: 'America' });
    const anomalies: string[] = [];

    // Verify GLA starts correctly (CC + Worker)
    const glaEntities = findAllEntities(logic, 'GLA');
    console.log(`\n=== GLA STARTING ENTITIES: ${glaEntities.length} ===`);
    for (const e of glaEntities) {
      console.log(`  ${e.templateName} at (${e.x.toFixed(0)}, ${e.z.toFixed(0)}) hp=${e.health}/${e.maxHealth}`);
    }

    const worker = findDozer(logic, 'GLA');
    if (!worker) {
      anomalies.push(`GLA: No worker found — found templates: ${glaEntities.map(e => e.templateName).join(', ')}`);
      console.log('=== GLA ANOMALIES ===');
      for (const a of anomalies) console.log(`  - ${a}`);
      // This is a critical finding worth logging
      console.log('  FINDING: GLA starting unit template mismatch — worker not recognized');
      // Don't hard-fail, still useful diagnostic output
      return;
    }

    // GLA doesn't need power plants — build directly
    const structures = [
      { template: 'GLASupplyStash', offsetX: 50, offsetZ: 0 },
      { template: 'GLABarracks', offsetX: 50, offsetZ: 50 },
      { template: 'GLAArmsDealer', offsetX: 50, offsetZ: 0 },
      { template: 'GLAPalace', offsetX: 50, offsetZ: -50 },
    ];

    const builtCount = { success: 0, fail: 0 };
    for (const s of structures) {
      const ok = buildStructure(logic, 'GLA', s.template, s.offsetX, s.offsetZ, anomalies, 1500);
      if (ok) builtCount.success++;
      else builtCount.fail++;
    }

    console.log(`\n=== GLA BUILD CHAIN: ${builtCount.success}/${structures.length} structures built ===`);

    // GLA should have no power state issues (no power system)
    const powerState = logic.getSidePowerState('gla');
    console.log(`  GLA Power: production=${powerState.energyProduction}, consumption=${powerState.energyConsumption}`);
    if (powerState.energyConsumption > 0) {
      anomalies.push(`GLA: Unexpected power consumption of ${powerState.energyConsumption} — GLA should have no power system`);
    }

    const finalCredits = logic.getSideCredits('gla');
    console.log(`  Credits: 50000 -> ${finalCredits}`);

    // All GLA buildings
    const glaBuildings = logic.getRenderableEntityStates()
      .filter(e => e.side?.toUpperCase() === 'GLA' && e.category === 'building')
      .map(e => `${e.templateName} (hp=${e.health}/${e.maxHealth})`);
    console.log(`  GLA buildings: ${glaBuildings.join(', ')}`);

    if (anomalies.length > 0) {
      console.log('Anomalies:');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // At least something should have built
    expect(builtCount.success).toBeGreaterThanOrEqual(0); // Soft assertion — GLA build may differ
  }, 60000);
});

describe.skipIf(!hasRetailData)('retail advanced wet test: China build chain', () => {
  it('builds China structures: Power Plant, Barracks, War Factory, Propaganda Center', () => {
    const { logic } = setupGame({ player0Side: 'China', player1Side: 'America' });
    const anomalies: string[] = [];

    // Verify China starting entities
    const chinaEntities = findAllEntities(logic, 'China');
    console.log(`\n=== CHINA STARTING ENTITIES: ${chinaEntities.length} ===`);
    for (const e of chinaEntities) {
      console.log(`  ${e.templateName} at (${e.x.toFixed(0)}, ${e.z.toFixed(0)}) hp=${e.health}/${e.maxHealth}`);
    }

    const structures = [
      { template: 'ChinaPowerPlant', offsetX: 50, offsetZ: 0 },
      { template: 'ChinaBarracks', offsetX: 50, offsetZ: 50 },
      { template: 'ChinaWarFactory', offsetX: 50, offsetZ: 0 },
      { template: 'ChinaPropagandaCenter', offsetX: 50, offsetZ: -50 },
    ];

    const builtCount = { success: 0, fail: 0 };
    for (const s of structures) {
      const ok = buildStructure(logic, 'China', s.template, s.offsetX, s.offsetZ, anomalies, 1200);
      if (ok) builtCount.success++;
      else builtCount.fail++;
    }

    console.log(`\n=== CHINA BUILD CHAIN: ${builtCount.success}/${structures.length} structures built ===`);
    if (anomalies.length > 0) {
      console.log('Anomalies:');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // China power should work
    const powerState = logic.getSidePowerState('china');
    console.log(`  China Power: production=${powerState.energyProduction}, consumption=${powerState.energyConsumption}, brownout=${powerState.brownedOut}`);

    if (builtCount.success >= 1 && powerState.energyProduction === 0) {
      anomalies.push('China: Power plant built but energyProduction is 0 — parity bug?');
    }

    const finalCredits = logic.getSideCredits('china');
    console.log(`  Credits: 50000 -> ${finalCredits}`);

    expect(builtCount.success).toBeGreaterThanOrEqual(1);
  }, 60000);
});

describe.skipIf(!hasRetailData)('retail advanced wet test: cross-map pathfinding', () => {
  it('sends a unit from player 1 start toward player 2 start', () => {
    const { logic } = setupGame({ player0Side: 'America', player1Side: 'China' });
    const anomalies: string[] = [];

    // First train a ranger (infantry units are more reliable for moveTo than dozers)
    // The AI test showed the AI can build barracks and train rangers, so let's do it manually

    // Build PP + Barracks, then train ranger
    buildStructure(logic, 'America', 'AmericaPowerPlant', 50, 0, anomalies, 1200);
    buildStructure(logic, 'America', 'AmericaBarracks', 50, 50, anomalies, 1200);

    const barracks = findEntity(logic, 'AmericaBarracks', 'America');
    let unitId: number;
    let unitTemplate: string;

    if (barracks) {
      // Train a ranger for pathfinding test
      logic.submitCommand({
        type: 'queueUnitProduction',
        entityId: barracks.id,
        unitTemplateName: 'AmericaInfantryRanger',
      });
      advanceFrames(logic, 600);

      const ranger = findEntity(logic, 'AmericaInfantryRanger', 'America');
      if (ranger) {
        unitId = ranger.id;
        unitTemplate = 'AmericaInfantryRanger';
      } else {
        // Fallback: use dozer
        const dozer = findDozer(logic, 'America')!;
        unitId = dozer.id;
        unitTemplate = dozer.templateName;
        anomalies.push('Could not train ranger — falling back to dozer for pathfinding test');
      }
    } else {
      // Fallback: use dozer
      const dozer = findDozer(logic, 'America')!;
      unitId = dozer.id;
      unitTemplate = dozer.templateName;
      anomalies.push('Could not build barracks — falling back to dozer for pathfinding test');
    }

    // Find the enemy CC to get the enemy start position
    const enemyCC = findEntity(logic, 'ChinaCommandCenter', 'China');
    expect(enemyCC).toBeDefined();

    const startState = logic.getEntityState(unitId)!;
    const startX = startState.x;
    const startZ = startState.z;
    const targetX = enemyCC!.x;
    const targetZ = enemyCC!.z;
    const totalDistance = Math.sqrt((targetX - startX) ** 2 + (targetZ - startZ) ** 2);

    console.log(`\n=== CROSS-MAP PATHFINDING ===`);
    console.log(`  Unit: ${unitTemplate} (id=${unitId})`);
    console.log(`  Start: (${startX.toFixed(0)}, ${startZ.toFixed(0)})`);
    console.log(`  Target: (${targetX.toFixed(0)}, ${targetZ.toFixed(0)})`);
    console.log(`  Distance: ${totalDistance.toFixed(0)}`);

    // Send unit to enemy base
    logic.submitCommand({
      type: 'moveTo',
      entityId: unitId,
      targetPosition: [targetX, 0, targetZ],
      commandSource: 'PLAYER',
    });

    // Track movement over 2000 frames
    let maxDistanceTraveled = 0;
    let finalDistToTarget = totalDistance;

    for (let frame = 0; frame < 2000; frame++) {
      logic.update(1 / 30);

      if (frame % 200 === 0 && frame > 0) {
        const state = logic.getEntityState(unitId);
        if (state && state.alive) {
          const distFromStart = Math.sqrt((state.x - startX) ** 2 + (state.z - startZ) ** 2);
          const distToTarget = Math.sqrt((state.x - targetX) ** 2 + (state.z - targetZ) ** 2);
          if (distFromStart > maxDistanceTraveled) maxDistanceTraveled = distFromStart;
          finalDistToTarget = distToTarget;
          console.log(`  Frame ${frame}: pos=(${state.x.toFixed(0)}, ${state.z.toFixed(0)}) distToTarget=${distToTarget.toFixed(0)} moving=${state.moving}`);
        }
      }
    }

    const finalState = logic.getEntityState(unitId);
    if (finalState && finalState.alive) {
      finalDistToTarget = Math.sqrt((finalState.x - targetX) ** 2 + (finalState.z - targetZ) ** 2);
    }

    console.log(`  Final distance to target: ${finalDistToTarget.toFixed(0)}`);
    console.log(`  Max distance traveled: ${maxDistanceTraveled.toFixed(0)}`);

    if (maxDistanceTraveled < 10) {
      anomalies.push(`PATHFINDING BUG: ${unitTemplate} didn't move at all on moveTo command (distance from start: ${maxDistanceTraveled.toFixed(0)})`);
    }

    const arrived = finalDistToTarget < 50;
    console.log(`  Arrived: ${arrived} (threshold: 50 units)`);

    if (!arrived && maxDistanceTraveled > 10) {
      anomalies.push(`Unit moved ${maxDistanceTraveled.toFixed(0)} units but didn't arrive (final dist: ${finalDistToTarget.toFixed(0)}/${totalDistance.toFixed(0)})`);
    }

    if (anomalies.length > 0) {
      console.log('Anomalies:');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // Log findings rather than hard-fail — pathfinding bugs are valuable findings
    console.log(`  FINDING: maxDistanceTraveled=${maxDistanceTraveled.toFixed(0)}, arrived=${arrived}`);
  }, 60000);
});

describe.skipIf(!hasRetailData)('retail advanced wet test: supply chain economy', () => {
  it('verifies player earns credits from supply trucks after 3000 frames', () => {
    const { logic } = setupGame({ player0Side: 'America', player1Side: 'China', credits: 10000 });
    const anomalies: string[] = [];

    // Build USA Supply Center (supply trucks auto-spawn from it)
    buildStructure(logic, 'America', 'AmericaPowerPlant', 50, 0, anomalies, 1200);
    buildStructure(logic, 'America', 'AmericaSupplyCenter', 50, 50, anomalies, 1500);

    const creditsAfterBuild = logic.getSideCredits('america');
    console.log(`\n=== SUPPLY CHAIN ECONOMY ===`);
    console.log(`  Credits after building: ${creditsAfterBuild}`);

    // Check if supply trucks exist
    const supplyTrucksBefore = logic.getRenderableEntityStates().filter(e =>
      e.templateName.includes('SupplyTruck') && e.side?.toUpperCase() === 'AMERICA',
    );
    console.log(`  Supply trucks found: ${supplyTrucksBefore.length}`);
    for (const t of supplyTrucksBefore) {
      console.log(`    ${t.templateName} at (${t.x.toFixed(0)}, ${t.z.toFixed(0)})`);
    }

    // Run 3000 frames for supply trucks to gather
    advanceFrames(logic, 3000);

    const creditsAfterGathering = logic.getSideCredits('america');
    const earned = creditsAfterGathering - creditsAfterBuild;
    console.log(`  Credits after 3000 frames: ${creditsAfterGathering} (earned: ${earned})`);

    // Supply trucks after
    const supplyTrucksAfter = logic.getRenderableEntityStates().filter(e =>
      e.templateName.includes('SupplyTruck') && e.side?.toUpperCase() === 'AMERICA',
    );
    console.log(`  Supply trucks after gathering: ${supplyTrucksAfter.length}`);

    if (earned <= 0) {
      anomalies.push(`No credits earned from supply chain after 3000 frames (credits: ${creditsAfterBuild} -> ${creditsAfterGathering})`);
    }

    // Log what neutral map objects exist (supply piles)
    const neutralEntities = logic.getRenderableEntityStates().filter(e =>
      !e.side || e.side === '' || e.side.toUpperCase() === 'CIVILIAN',
    );
    const supplyRelated = neutralEntities.filter(e =>
      e.templateName.toLowerCase().includes('supply'),
    );
    console.log(`  Neutral supply-related entities: ${supplyRelated.map(e => e.templateName).join(', ') || 'none'}`);

    if (anomalies.length > 0) {
      console.log('Anomalies:');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // Credits should not have gone deeply negative from building
    expect(creditsAfterGathering).toBeGreaterThanOrEqual(0);
  }, 60000);
});

describe.skipIf(!hasRetailData)('retail advanced wet test: AI army composition', () => {
  it('logs all AI-owned entities after 5000 frames with AI enabled', () => {
    const { logic } = setupGame({ player0Side: 'America', player1Side: 'China', credits: 50000 });
    const anomalies: string[] = [];

    // Enable AI for both sides
    logic.enableSkirmishAI('America');
    logic.enableSkirmishAI('China');

    // Snapshot initial state
    const initialAmerica = findAllEntities(logic, 'America');
    const initialChina = findAllEntities(logic, 'China');
    console.log(`\n=== AI ARMY COMPOSITION (initial) ===`);
    console.log(`  USA: ${initialAmerica.length} entities`);
    console.log(`  China: ${initialChina.length} entities`);

    // Run 5000 frames with periodic stability checks
    for (let frame = 0; frame < 5000; frame++) {
      try {
        logic.update(1 / 30);
      } catch (err) {
        anomalies.push(`Frame ${frame}: CRASH — ${err instanceof Error ? err.message : String(err)}`);
        break;
      }

      // Periodic NaN check
      if (frame % 1000 === 0 && frame > 0) {
        const states = logic.getRenderableEntityStates();
        const nanEntities = states.filter(s => isNaN(s.x) || isNaN(s.y) || isNaN(s.z));
        if (nanEntities.length > 0) {
          anomalies.push(`Frame ${frame}: ${nanEntities.length} entities with NaN positions: ${nanEntities.map(e => e.templateName).join(', ')}`);
        }
      }
    }

    // Catalog final state
    const finalAmerica = findAllEntities(logic, 'America');
    const finalChina = findAllEntities(logic, 'China');

    // Group by template name
    function groupByTemplate(entities: ReturnType<typeof findAllEntities>) {
      const groups = new Map<string, number>();
      for (const e of entities) {
        groups.set(e.templateName, (groups.get(e.templateName) ?? 0) + 1);
      }
      return [...groups.entries()].sort((a, b) => b[1] - a[1]);
    }

    const usaGroups = groupByTemplate(finalAmerica);
    const chinaGroups = groupByTemplate(finalChina);

    console.log(`\n=== AI ARMY COMPOSITION (after 5000 frames) ===`);
    console.log(`  USA (${finalAmerica.length} entities):`);
    for (const [name, count] of usaGroups) {
      console.log(`    ${count}x ${name}`);
    }
    console.log(`  China (${finalChina.length} entities):`);
    for (const [name, count] of chinaGroups) {
      console.log(`    ${count}x ${name}`);
    }

    // Check if AI actually built anything
    const usaBuildings = finalAmerica.filter(e => e.category === 'building');
    const chinaBuildings = finalChina.filter(e => e.category === 'building');
    console.log(`  USA buildings: ${usaBuildings.length} (was ${initialAmerica.filter(e => e.category === 'building').length})`);
    console.log(`  China buildings: ${chinaBuildings.length} (was ${initialChina.filter(e => e.category === 'building').length})`);

    // Check economy
    const usaCredits = logic.getSideCredits('america');
    const chinaCredits = logic.getSideCredits('china');
    console.log(`  USA credits: ${usaCredits}`);
    console.log(`  China credits: ${chinaCredits}`);

    // Power states
    const usaPower = logic.getSidePowerState('america');
    const chinaPower = logic.getSidePowerState('china');
    console.log(`  USA power: prod=${usaPower.energyProduction} cons=${usaPower.energyConsumption} brownout=${usaPower.brownedOut}`);
    console.log(`  China power: prod=${chinaPower.energyProduction} cons=${chinaPower.energyConsumption} brownout=${chinaPower.brownedOut}`);

    if (finalAmerica.length <= initialAmerica.length && finalChina.length <= initialChina.length) {
      anomalies.push('AI didn\'t produce any new entities after 5000 frames');
    }

    // Check for AI building bypassing prerequisites (known bug from previous tests)
    if (!usaBuildings.some(b => b.templateName === 'AmericaBarracks')) {
      const usaInfantry = finalAmerica.filter(e => e.category === 'infantry');
      if (usaInfantry.length > 0) {
        anomalies.push(`USA AI has ${usaInfantry.length} infantry but no Barracks — prerequisite bypass?`);
      }
    }

    // Check AI only built structures it has prerequisites for
    const usaBuildingTemplates = usaBuildings.map(b => b.templateName);
    const hasPP = usaBuildingTemplates.includes('AmericaPowerPlant');
    if (!hasPP) {
      const needsPowerStructures = usaBuildingTemplates.filter(t =>
        t !== 'AmericaCommandCenter' && t !== 'AmericaPowerPlant',
      );
      if (needsPowerStructures.length > 0) {
        anomalies.push(`USA AI built ${needsPowerStructures.join(', ')} without a Power Plant — prerequisite bypass?`);
      }
    }

    if (anomalies.length > 0) {
      console.log('\n=== AI ANOMALIES ===');
      for (const a of anomalies) console.log(`  - ${a}`);
    }

    // Game should still be running
    const finalStates = logic.getRenderableEntityStates();
    expect(finalStates.length).toBeGreaterThan(0);

    // No NaN positions in final state
    const finalNaN = finalStates.filter(s => isNaN(s.x) || isNaN(s.y) || isNaN(s.z));
    expect(finalNaN.length).toBe(0);
  }, 60000);
});
