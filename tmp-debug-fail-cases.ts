import * as THREE from 'three';
import { IniDataRegistry, type IniDataBundle } from './packages/ini-data/src/index.js';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';
import { HeightmapGrid } from './packages/terrain/src/index.js';

const LOCOMOTORSURFACE_GROUND = 1 << 0;
const LOCOMOTORSET: IniDataBundle = {
  locomotors: [{ name: 'TestGround', fields: { Surfaces: ['GROUND'] }, surfaces: ['GROUND'], surfaceMask: LOCOMOTORSURFACE_GROUND, downhillOnly: false }],
  objects: [
    { name:'Ranger',side:'America',kindOf:['VEHICLE'],fields:{},blocks:[{type:'Behavior',name:'AIUpdateInterface ModuleTag_AI',fields:{LocomotorSet:['SET_NORMAL TestGround']},blocks:[]}],resolved:true },
    { name:'Wall',side:'America',kindOf:['STRUCTURE'],fields:{},blocks:[],resolved:true },
  ],
  weapons:[], armors:[], upgrades:[], sciences:[], factions:[],
  stats:{ objects:2,weapons:0,armors:0,upgrades:0,sciences:0,factions:0,unresolvedInheritance:0,totalBlocks:0 },
  errors:[], unsupportedBlockTypes:[],
};
const map={ heightmap:{width:10,height:10,borderSize:0,data:Buffer.from(new Uint8Array(100).fill(64)).toString('base64')}, objects:[
  {templateName:'Ranger',position:{x:5,y:10,z:0},angle:0,flags:0,properties:{}},
  {templateName:'Wall',position:{x:40,y:10,z:0},angle:0,flags:0,properties:{}},
], triggers:[], textureClasses:[], blendTileCount:0};
const reg=new IniDataRegistry();reg.loadBundle(LOCOMOTORSET);
const logic = new GameLogicSubsystem(new THREE.Scene());
logic.loadMapObjects(map,reg, HeightmapGrid.fromJSON(map.heightmap));
const nav=(logic as any).navigationGrid;
const profile={acceptableSurfaces:LOCOMOTORSURFACE_GROUND,canPassObstacle:false,canUseBridge:true};
for(let z=0;z<nav.height;z++){
 for(let x=0;x<nav.width;x++){
  const ok=(logic as any).canOccupyCell(x,z,profile,nav);
  if(ok) continue;
  if(x<=2&&z<=2||x>=6&&x<=8&&z<=2) console.log('blocked?',x,z,'terrain',nav.terrainType[z*nav.width+x],'blocked',nav.blocked[z*nav.width+x]);
 }
}
const nbs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
for(const [dx,dz] of nbs){
 const x=0+dx; const z=1+dz; if(x<0||z<0||x>=nav.width||z>=nav.height) {console.log('out',dx,dz); continue;}
 console.log('nbr',x,z,'ok', (logic as any).canOccupyCell(x,z,profile,nav));
}
