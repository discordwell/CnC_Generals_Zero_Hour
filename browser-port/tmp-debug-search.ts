import * as THREE from 'three';
import { IniDataRegistry, type IniDataBundle } from './packages/ini-data/src/index.js';
import { GameLogicSubsystem } from './packages/game-logic/src/index.js';
import { HeightmapGrid } from './packages/terrain/src/index.js';

const bundle: IniDataBundle = {
  locomotors:[{ name:'TestGround', fields:{Surfaces:['GROUND']}, surfaces:['GROUND'], surfaceMask:1<<0, downhillOnly:false}],
  objects:[
    {name:'Ranger',side:'America',kindOf:['VEHICLE'],fields:{},blocks:[{type:'Behavior',name:'AIUpdateInterface ModuleTag_AI',fields:{LocomotorSet:['SET_NORMAL TestGround']},blocks:[]}],resolved:true},
    {name:'Wall',side:'America',kindOf:['STRUCTURE'],fields:{},blocks:[],resolved:true},
  ],
  weapons:[],armors:[],upgrades:[],sciences:[],factions:[],stats:{objects:2,weapons:0,armors:0,upgrades:0,sciences:0,factions:0,unresolvedInheritance:0,totalBlocks:0},errors:[],unsupportedBlockTypes:[],
};
const registry = new IniDataRegistry();
registry.loadBundle(bundle);
const map={heightmap:{width:10,height:10,borderSize:0,data:Buffer.from(new Uint8Array(100).fill(64)).toString('base64')},
objects:[
  {templateName:'Ranger',position:{x:5,y:10,z:0},angle:0,flags:0,properties:{}},
  {templateName:'Wall',position:{x:40,y:10,z:0},angle:0,flags:0,properties:{}},
],triggers:[],textureClasses:[],blendTileCount:0};
const logic = new GameLogicSubsystem(new THREE.Scene());
logic.loadMapObjects(map,registry,HeightmapGrid.fromJSON(map.heightmap));
const nav=(logic as any).navigationGrid as any;
const canOcc=(x:number,z:number,profile:any)=> (logic as any).canOccupyCell(x,z,profile,nav);
const canTr=(ax:number,az:number,bx:number,bz:number,profile:any)=> (logic as any).canTraverseBridgeTransition(ax,az,bx,bz,profile,nav);
const pathCost=(ax:number,az:number,bx:number,bz:number,profile:any)=>(logic as any).pathCost(ax,az,bx,bz,nav,profile);
const worldToGrid=(x:number,z:number)=>(logic as any).worldToGrid(x,z);
const gridFrom=(idx:number)=> [idx % nav.width, Math.floor(idx / nav.width)] as const;
const isIn=(x:number,z:number)=> x>=0&&z>=0&&x<nav.width&&z<nav.height;
const profile={acceptableSurfaces:1,downhillOnly:false,canPassObstacle:false,canUseBridge:true,avoidPinched:false};
const heuristic=(x:number,z:number,tx:number,tz:number)=>{const dx=Math.abs(x-tx),dz=Math.abs(z-tz);return dx>dz?10*dx+5*dz:10*dz+5*dx};
const start=worldToGrid(5,10) as any, goal=worldToGrid(85,10) as any;
console.log('start goal',start,goal);
let startC={x:start[0]!,z:start[1]!}; let goalC={x:goal[0]!,z:goal[1]!};
const startIdx=startC.z*nav.width+startC.x; const goalIdx=goalC.z*nav.width+goalC.x;
const width=nav.width*nav.height;
const open:number[]=[]; const g=new Array(width).fill(Infinity); const f=new Array(width).fill(Infinity); const parent=new Int32Array(width); const inOpen=new Uint8Array(width); const inClosed=new Uint8Array(width); parent.fill(-1);
g[startIdx]=0; f[startIdx]=heuristic(startC.x,startC.y?startC.y:startC.z,goalC.x,goalC.z); open.push(startIdx); inOpen[startIdx]=1;
let it=0;
while(open.length){
  it++; if(it>500000) break;
  let bi=0,bf=f[open[0]];
  for(let i=1;i<open.length;i++){if((f[open[i]]??Infinity)<bf){bf=f[open[i]];bi=i;}}
  const ci=open[bi]!; open.splice(bi,1); inOpen[ci]=0; inClosed[ci]=1;
  const [cx,cz]=gridFrom(ci);
  if(ci===goalIdx){console.log('reached',it,'open',open.length,'node',cx,cz); break;}
  if(it<40) console.log('pop',it,cx,cz,'f',f[ci],'g',g[ci],'parent',parent[ci]);
  const deltaX=[1,0,-1,0,1,-1,-1,1]; const deltaZ=[0,1,0,-1,1,1,-1,-1];
  const pIdx=parent[ci]!; const pXY=pIdx>=0?gridFrom(pIdx):[0,0];
  for(let i=0;i<deltaX.length;i++){
    const sx=deltaX[i],sz=deltaZ[i]; const nx=cx+sx,nz=cz+sz; if(!isIn(nx,nz)) continue; if(!canTr(cx,cz,nx,nz,profile)) continue;
    const diag=(sx!==0&&sz!==0); if(diag){const s1x=cx+sx,s1z=cz,s2x=cx,s2z=cz+sz; if(!(canOcc(s1x,s1z,profile)&&canTr(cx,cz,s1x,s1z,profile) || canOcc(s2x,s2z,profile)&&canTr(cx,cz,s2x,s2z,profile))) continue;}
    const ni=nz*nav.width+nx;
    if(!canOcc(nx,nz,profile)) continue;
    let step=pathCost(cx,cz,nx,nz,profile);
    if(pIdx>=0){const prevX=cx-nx, prevZ=cz-nz; const nextX=pXY[0]-cx; const nextZ=pXY[1]-cz; const dot=prevX*nextX+prevZ*nextZ; if(prevX!==nextX||prevZ!==nextZ){ if(dot>0) step+=4; else if(dot===0) step+=8; else step+=16; }}
    const tg=g[ci]+step; const ng=g[ni]??Infinity; const on=(inOpen[ni]===1||inClosed[ni]===1);
    if(on && tg>=ng) continue;
    if(inClosed[ni]===1) inClosed[ni]=0;
    parent[ni]=ci; g[ni]=tg; f[ni]=tg+heuristic(nx,nz,goalC.x,goalC.z);
    if(inOpen[ni]===1){const k=open.indexOf(ni); if(k>=0) open.splice(k,1);} else open.push(ni);
    inOpen[ni]=1;
    if(it<15) console.log('  push',nx,nz,'from',cx,cz,'step',step,'g',tg,'f',f[ni]);
  }
}
console.log('done it',it,'goalIdx',goalIdx,'startIdx',startIdx,'goalTerrain',nav.terrainType[goalIdx],'goalBlocked',nav.blocked[goalIdx]);
console.log('goal inOpen',inOpen[goalIdx], 'inClosed',inClosed[goalIdx], 'parent', parent[goalIdx]);
