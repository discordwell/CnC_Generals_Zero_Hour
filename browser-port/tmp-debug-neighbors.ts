import * as THREE from 'three';
import { IniDataRegistry, type IniDataBundle } from './packages/ini-data/src/index.js';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';
import { HeightmapGrid } from './packages/terrain/src/index.js';

const bundle: IniDataBundle = {
  locomotors:[{name:'TestGround',fields:{Surfaces:['GROUND']},surfaces:['GROUND'],surfaceMask:1<<0,downhillOnly:false}],
  objects:[
    {name:'Ranger',side:'America',kindOf:['VEHICLE'],fields:{},blocks:[{type:'Behavior',name:'AIUpdateInterface ModuleTag_AI',fields:{LocomotorSet:['SET_NORMAL TestGround']},blocks:[]}],resolved:true},
    {name:'Wall',side:'America',kindOf:['STRUCTURE'],fields:{},blocks:[],resolved:true},
  ],
  weapons:[],armors:[],upgrades:[],sciences:[],factions:[],
  stats:{objects:2,weapons:0,armors:0,upgrades:0,sciences:0,factions:0,unresolvedInheritance:0,totalBlocks:0},
  errors:[],unsupportedBlockTypes:[],
};
const map={heightmap:{width:10,height:10,borderSize:0,data:Buffer.from(new Uint8Array(100).fill(64)).toString('base64')},
  objects:[{templateName:'Ranger',position:{x:5,y:10,z:0},angle:0,flags:0,properties:{}},{templateName:'Wall',position:{x:40,y:10,z:0},angle:0,flags:0,properties:{}}],
  triggers:[],textureClasses:[],blendTileCount:0};
const registry = new IniDataRegistry();
registry.loadBundle(bundle);
const logic = new GameLogicSubsystem(new THREE.Scene());
logic.loadMapObjects(map,registry,HeightmapGrid.fromJSON(map.heightmap));
const nav=(logic as any).navigationGrid;
const profile={acceptableSurfaces:1<<0,canPassObstacle:false,canUseBridge:true};
console.log('start', (logic as any).canOccupyCell(0,1,profile,nav));
for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]){
  const x=0+dx, z=1+dz;
  if (x<0||z<0||x>=nav.width||z>=nav.height) { console.log(dx,dz,'out'); continue; }
  console.log(dx,dz,'cell',x,z,'occ', (logic as any).canOccupyCell(x,z,profile,nav), 'terrain', nav.terrainType[z*nav.width+x],'blocked',nav.blocked[z*nav.width+x]);
}
const path=(logic as any).findPath(5,10,85,10,{locomotorSurfaceMask:1<<0} as never);
console.log('path',path);
