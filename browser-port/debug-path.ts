import * as THREE from 'three';
import { IniDataRegistry, type IniDataBundle } from '../browser-port/packages/ini-data/src/index.js';
import { GameLogicSubsystem } from '../browser-port/packages/game-logic/src/index.js';
import { HeightmapGrid } from '../browser-port/packages/terrain/src/index.js';

const LOCOMOTORSURFACE_GROUND = 1 << 0;
const scene = new THREE.Scene();
const registry = new IniDataRegistry();
const bundle: IniDataBundle = {
  locomotors: [{ name: 'TestGround', fields: { Surfaces: ['GROUND'] }, surfaces: ['GROUND'], surfaceMask: LOCOMOTORSURFACE_GROUND, downhillOnly: false }],
  objects: [
    { name: 'Ranger', side: 'America', kindOf: ['VEHICLE'], fields: {}, blocks: [{ type: 'Behavior', name: 'AIUpdateInterface ModuleTag_AI', fields: { LocomotorSet: ['SET_NORMAL TestGround'] }, blocks: [] }], resolved: true },
    { name: 'BlockerA', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerB', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [], armors: [], upgrades: [], sciences: [], factions: [],
  stats: { objects: 3, weapons: 0, armors: 0, upgrades: 0, sciences: 0, factions: 0, unresolvedInheritance: 0, totalBlocks: 0 },
  errors: [], unsupportedBlockTypes: [],
};
registry.loadBundle(bundle);

const mapData = {
  heightmap: {
    width: 10,
    height: 10,
    borderSize: 0,
    data: Buffer.from(new Uint8Array(100).fill(64)).toString('base64'),
  },
  objects: [
    { templateName: 'Ranger', position: { x: 15, y: 15, z: 0 }, angle: 0, flags: 0, properties: {} },
    { templateName: 'BlockerA', position: { x: 30, y: 20, z: 0 }, angle: 0, flags: 0, properties: {} },
    { templateName: 'BlockerB', position: { x: 0, y: 30, z: 0 }, angle: 0, flags: 0, properties: {} },
  ],
  triggers: [],
  textureClasses: [],
  blendTileCount: 0,
};

const heightmap = HeightmapGrid.fromJSON(mapData.heightmap);
const logic = new GameLogicSubsystem(scene);
logic.loadMapObjects(mapData, registry, heightmap);

const nav = (logic as unknown as { navigationGrid: any }).navigationGrid;
console.log('grid', nav.width, nav.height);
for (let z = 0; z < nav.height; z++) {
  let blockedLine = '';
  let pinLine = '';
  let terrainLine = '';
  for (let x = 0; x < nav.width; x++) {
    const idx = z * nav.width + x;
    blockedLine += nav.blocked[idx] ? '#' : '.';
    pinLine += nav.pinched[idx] ? '*' : '.';
    terrainLine += nav.terrainType[idx].toString();
  }
  console.log(`z=${z} terrain=${terrainLine}`);
  console.log(`z=${z} blocked=${blockedLine} pin=${pinLine}`);
}

const startCell = logic.worldToGrid(15, 15);
const goalCell = logic.worldToGrid(45, 45);
console.log('start/goal', startCell, goalCell);

const path = (logic as unknown as { findPath(a:number,b:number,c:number,d:number,e: { locomotorSurfaceMask: number }): { x: number; z: number }[] }).findPath(15, 15, 45, 45, { locomotorSurfaceMask: LOCOMOTORSURFACE_GROUND } as never);
console.log('path length', path.length);
console.log(path);
