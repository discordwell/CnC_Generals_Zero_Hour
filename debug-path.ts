import * as THREE from 'three';
import { IniDataRegistry, type IniDataBundle } from './browser-port/packages/ini-data/src/index.js';
import { GameLogicSubsystem } from './browser-port/packages/game-logic/src/index.js';
import { HeightmapGrid } from './browser-port/packages/terrain/src/index.js';

const LOCOMOTORSURFACE_GROUND = 1 << 0;

const scene = new THREE.Scene();
const registry = new IniDataRegistry();
const bundle: IniDataBundle = {
  locomotors: [
    {
      name: 'TestGround',
      fields: { Surfaces: ['GROUND'] },
      surfaces: ['GROUND'],
      surfaceMask: LOCOMOTORSURFACE_GROUND,
      downhillOnly: false,
    },
  ],
  objects: [
    {
      name: 'Ranger',
      side: 'America',
      kindOf: ['VEHICLE'],
      fields: {},
      blocks: [
        {
          type: 'Behavior',
          name: 'AIUpdateInterface ModuleTag_AI',
          fields: { LocomotorSet: ['SET_NORMAL TestGround'] },
          blocks: [],
        },
      ],
      resolved: true,
    },
    { name: 'BlockerA', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
    { name: 'BlockerB', side: 'America', kindOf: ['STRUCTURE'], fields: {}, blocks: [], resolved: true },
  ],
  weapons: [],
  armors: [],
  upgrades: [],
  sciences: [],
  factions: [],
  stats: {
    objects: 3,
    weapons: 0,
    armors: 0,
    upgrades: 0,
    sciences: 0,
    factions: 0,
    unresolvedInheritance: 0,
    totalBlocks: 0,
  },
  errors: [],
  unsupportedBlockTypes: [],
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

const path = (logic as unknown as {
  findPath(startX: number, startZ: number, targetX: number, targetZ: number, mover?: { locomotorSurfaceMask?: number }): { x: number; z: number }[];
}).findPath(15, 15, 45, 45, { locomotorSurfaceMask: LOCOMOTORSURFACE_GROUND } as never);

console.log('len', path.length);
console.log(path);
console.log(path.map(({x, z}) => [Math.floor(x / 10), Math.floor(z / 10)]));
