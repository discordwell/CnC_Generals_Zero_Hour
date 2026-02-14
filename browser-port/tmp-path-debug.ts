import * as THREE from 'three';
import { IniDataRegistry } from '@generals/ini-data';
import { HeightmapGrid, uint8ArrayToBase64 } from '@generals/terrain';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';

function makeMapDataObjectCount(objects, width = 10, height = 10) {
  const data = uint8ArrayToBase64(new Uint8Array(width * height).fill(64));
  return {
    heightmap: { width, height, borderSize: 0, data },
    objects,
    triggers: [],
    textureClasses: [],
    blendTileCount: 0,
  };
}

const scene = new THREE.Scene();
const registry = new IniDataRegistry();
registry.loadBundle({
  objects: [
    { name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerA', side: 'America', kindOf: ['UNUSED'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerB', side: 'America', kindOf: ['UNUSED'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [],
  armors: [],
  upgrades: [],
  sciences: [],
  factions: [],
  stats: { objects: 3, weapons: 0, armors: 0, upgrades: 0, sciences: 0, factions: 0, unresolvedInheritance: 0, totalBlocks: 3 },
  errors: [],
  unsupportedBlockTypes: [],
});

const mapData = makeMapDataObjectCount([
  { templateName: 'Ranger', position: { x: 15, y: 15, z: 0 }, angle: 0, flags: 0, properties: {} },
  { templateName: 'BlockerA', position: { x: 20, y: 10, z: 0 }, angle: 0, flags: 0, properties: {} },
  { templateName: 'BlockerB', position: { x: 10, y: 20, z: 0 }, angle: 0, flags: 0, properties: {} },
]);

const gameLogic = new GameLogicSubsystem(scene);
const heightmap = HeightmapGrid.fromJSON(mapData.heightmap);
gameLogic.loadMapObjects(mapData, registry, heightmap);

const nav = (gameLogic as any).navigationGrid;
const entities = (gameLogic as any).spawnedEntities as Map<number, any>;
for (const [id, entity] of entities) {
  console.log('entity', id, entity.templateName, entity.category, entity.canMove, entity.mesh.position.x, entity.mesh.position.z);
}

const idx = (x: number, z: number) => z * 10 + x;
console.log('start terrain', nav.terrainType[idx(1, 1)], 'blocked', nav.blocked[idx(1, 1)]);
console.log('goal terrain', nav.terrainType[idx(4, 4)], 'blocked', nav.blocked[idx(4, 4)]);
console.log('blocked20,10', nav.terrainType[idx(2, 1)], nav.blocked[idx(2, 1)]);
console.log('blocked10,20', nav.terrainType[idx(1, 2)], nav.blocked[idx(1, 2)]);
console.log('blocked20,20', nav.terrainType[idx(2, 2)], nav.blocked[idx(2, 2)]);
console.log(
  'obstacle indices',
  Array.from(nav.blocked.entries())
    .filter(([, value]) => value === 1)
    .map(([index]) => index),
);
