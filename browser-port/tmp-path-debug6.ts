import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

const scenarios = [
  {
    label: 'A=30,20 B=0,30', a: { x: 30, y: 20 }, b: { x: 0, y: 30 },
    blockedTargets: ['2,1', '1,2'],
  },
  {
    label: 'A=20,20 B=0,30', a: { x: 20, y: 20 }, b: { x: 0, y: 30 },
    blockedTargets: ['2,1', '1,2'],
  },
  {
    label: 'A=40,20 B=0,30', a: { x: 40, y: 20 }, b: { x: 0, y: 30 },
    blockedTargets: ['2,1', '1,2'],
  },
];

function runScenario(scenario: any) {
  const scene = new THREE.Scene();
  const registry = new IniDataRegistry();
  registry.loadBundle({
    objects: [
      { name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [], resolved: true },
      { name: 'BlockerA', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
      { name: 'BlockerB', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
    ],
    weapons: [], armors: [], upgrades: [], sciences: [], factions: [],
    stats: { objects: 3, weapons: 0, armors: 0, upgrades: 0, sciences: 0, factions: 0, unresolvedInheritance: 0, totalBlocks: 3 },
    errors: [], unsupportedBlockTypes: [],
  });

  const data = uint8ArrayToBase64(new Uint8Array(100).fill(64));
  const mapData = {
    heightmap: { width: 10, height: 10, borderSize: 0, data },
    objects: [
      { templateName: 'Ranger', position: { x: 15, y: 15, z: 0 }, angle: 0, flags: 0, properties: {} },
      { templateName: 'BlockerA', position: { x: scenario.a.x, y: scenario.a.y, z: 0 }, angle: 0, flags: 0, properties: {} },
      { templateName: 'BlockerB', position: { x: scenario.b.x, y: scenario.b.y, z: 0 }, angle: 0, flags: 0, properties: {} },
    ],
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };

  const gameLogic = new GameLogicSubsystem(scene);
  gameLogic.loadMapObjects(mapData, registry, HeightmapGrid.fromJSON(mapData.heightmap));
  const path = (gameLogic as any).findPath(15, 15, 45, 45, { category: 'vehicle' });
  const toCell = ({ x, z }: { x: number; z: number }) => ({ x: Math.floor(x / 10), z: Math.floor(z / 10) });
  const pathCells = path.map(toCell);
  const containsBlocked = scenario.blockedTargets.some((cell: string) => pathCells.some(({ x, z }) => `${x},${z}` === cell));
  const containsDiag = pathCells.some(({ x, z }) => `${x},${z}` === '2,2');
  console.log(`scenario ${scenario.label}: len=${path.length}, containsBlocked=${containsBlocked}, contains2,2=${containsDiag}, cells=${pathCells.map((c:any)=>`${c.x},${c.z}`).join(' -> ')}`);
}

for (const scenario of scenarios) {
  runScenario(scenario);
}
