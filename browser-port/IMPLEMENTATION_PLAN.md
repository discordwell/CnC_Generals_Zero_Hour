# C&C Generals: Zero Hour — Browser Port Implementation Plan

## Architecture Overview

This document describes the staged plan for porting Command & Conquer: Generals
Zero Hour from its original C++ / DirectX 8 / Miles Sound System codebase to a
browser-native TypeScript application using WebGL2 (via Three.js), Web Audio API,
and WebRTC/WebSocket networking.

### Original Engine Summary

| Subsystem | Original Technology | Browser Replacement |
|-----------|-------------------|-------------------|
| Rendering | WW3D2 / DirectX 8 | Three.js (WebGL2) |
| Audio | Miles Sound System | Web Audio API |
| Networking | GameSpy + Raw UDP | WebSocket + WebRTC DataChannels |
| UI/HUD | Custom Win32 Window/Gadget system | HTML/CSS + Canvas overlay |
| Input | DirectInput / Win32 messages | DOM Events (pointer, keyboard) |
| File I/O | Win32 filesystem + BIG archives | IndexedDB + fetch + virtual FS |
| Physics/Terrain | Custom heightmap + pathfinding | Ported logic (no external dep) |
| Scripting | INI data-driven + hardcoded C++ | TypeScript + parsed INI/JSON |
| AI | C++ state machines + pathfinding | Ported TypeScript logic |

### Core Design Principles

1. **Data-driven**: The original engine is heavily INI-driven. We preserve this
   by parsing INI files into JSON at build time and loading them at runtime.
2. **Deterministic simulation**: Multiplayer relies on lockstep determinism. All
   game logic uses fixed-point or deterministic float math.
3. **Module/Behavior architecture**: Game objects are composed of modules (Draw,
   Body, Update, AI, etc.). We replicate this with a TypeScript component system.
4. **Client/Logic separation**: The original cleanly separates GameLogic (simulation)
   from GameClient (rendering/audio). We preserve this boundary.

---

## Stage 0: Project Scaffolding & Tooling

**Goal**: Establish the monorepo, build pipeline, dev server, and testing harness.

### Deliverables
- Monorepo structure with packages (see below)
- Vite dev server with HMR
- TypeScript strict mode, ESLint, Prettier
- Vitest for unit tests, Playwright for integration tests
- Asset pipeline CLI tool (converts W3D models, TGA textures, WAV audio, BIG
  archives, INI configs into web-ready formats)
- CI with lint + type-check + unit tests

### Package Structure
```
browser-port/
├── packages/
│   ├── core/              # Math, data structures, INI parser, deterministic utils
│   ├── engine/            # Game loop, subsystem registry, event bus
│   ├── assets/            # Virtual filesystem, asset loader, BIG archive reader
│   ├── renderer/          # Three.js scene, terrain, models, particles, FX
│   ├── audio/             # Web Audio manager, 3D positional, music, speech
│   ├── ui/                # HTML/CSS UI system, menus, HUD, control bar
│   ├── input/             # Mouse, keyboard, camera control, command mapping
│   ├── game-logic/        # Simulation: objects, modules, weapons, upgrades, AI
│   ├── terrain/           # Heightmap, pathfinding, bridges, water
│   ├── network/           # WebSocket lobby, WebRTC game sync, replay
│   ├── ini-data/          # Parsed INI → JSON data (generated at build time)
│   └── app/               # Entry point, glue code, dev tools
├── tools/
│   ├── ini-parser/        # INI → JSON build-time converter
│   ├── w3d-converter/     # W3D model → glTF converter
│   ├── big-extractor/     # BIG archive extractor
│   └── map-converter/     # .map → JSON terrain converter
├── assets/                # (gitignored) Raw game assets placed here by user
├── public/                # Converted web-ready assets
├── vitest.config.ts
├── playwright.config.ts
├── tsconfig.json
├── package.json
└── vite.config.ts
```

### Validation Criteria
- [ ] `npm run build` compiles with zero errors
- [ ] `npm run test` passes (placeholder tests)
- [ ] `npm run dev` opens browser with blank canvas
- [ ] `npm run lint` passes
- [ ] Asset pipeline CLI runs without errors on sample data

---

## Stage 1: Core Math, Data Structures & INI Parser

**Goal**: Port fundamental types and the INI configuration system that everything
else depends on.

### 1.1 Math Library
Port from: `Generals/Code/Libraries/Source/WWMath/`

- `Vector2`, `Vector3`, `Vector4`, `Matrix3x4`, `Matrix4x4`, `Quaternion`
- `Coord2D`, `Coord3D`, `ICoord2D`, `IRegion2D` (game-specific coordinate types)
- Fixed-point arithmetic utilities for deterministic simulation
- `GameMath` helpers: `sin`, `cos`, `atan2`, `sqrt` (lookup-table versions for determinism)
- Bounding volumes: `AABox`, `OBBox`, `Sphere`, `Frustum`
- Intersection tests: ray-box, ray-sphere, frustum-box, line-segment

### 1.2 Core Data Structures
Port from: `Generals/Code/GameEngine/Include/Common/`

- `AsciiString` / `UnicodeString` → native JS strings with helper utilities
- `Dict` (key-value with typed values) → `Map<string, DictValue>`
- `BitFlags<N>` template → TypeScript bitflag utility class
- `GameType` enums: `KindOf`, `ObjectStatus`, `DamageType`, `WeaponStatus`, etc.
- `ObjectID`, `DrawableID`, `TeamID` — opaque ID types
- `NameKeyGenerator` — string interning / hash system
- `SubsystemInterface` — base interface for all engine subsystems

### 1.3 INI Parser
Port from: `Generals/Code/GameEngine/Source/Common/INI/`

The INI system is the backbone of all game data. Original INI format:
```ini
Object AmericaTankCrusader
  ; Base attributes
  SelectPortrait = SNAmericaTankCrusader
  Side = America
  EditorSorting = VEHICLE
  TransportSlotCount = 3

  Body = ActiveBody ModuleTag_02
    MaxHealth = 300.0
    InitialHealth = 300.0
  End

  Behavior = AIUpdateInterface ModuleTag_03
    AutoAcquireEnemiesWhenIdle = Yes
  End

  Weapon = PRIMARY CrusaderTankGun
End
```

- Build-time INI → JSON converter that handles:
  - Nested block structure (`Object ... End`, `Behavior ... End`)
  - Inheritance (`Object X : Y` derives from parent)
  - Include directives
  - Conditional compilation blocks
  - All field types: Int, Real, Bool, String, Percent, Color, Coord, Angle, Time
  - Enum fields (mapped to string unions in TypeScript)
  - Bitflag fields (`KindOf = VEHICLE SELECTABLE`)
- Runtime typed data access layer

### 1.4 Data Registry
- `ThingFactory` equivalent — registry of all object templates
- `WeaponStore` — all weapon definitions
- `UpgradeCenter` — all upgrade definitions
- `ScienceStore` — all science/general-power definitions
- `PlayerTemplateStore` — faction definitions (USA, China, GLA + generals)
- `MultiplierStore` — global game modifiers

### Validation Criteria
- [ ] Math library: unit tests for all vector/matrix operations matching C++ output
- [ ] INI parser: successfully parses all original INI files to JSON
- [ ] Parsed data matches expected field values (spot-check 20+ objects)
- [ ] Data registries load and query correctly
- [ ] Fixed-point math produces identical results across browsers

---

## Stage 2: Virtual Filesystem & Asset Pipeline

**Goal**: Load original game assets in the browser.

### 2.1 BIG Archive Reader
Port from: `Generals/Code/GameEngine/Source/Common/System/ArchiveFile.cpp`

- Parse `.big` archive format (EA's proprietary archive)
- Extract files on demand (streaming, not full unpack)
- Build-time extraction tool for converting to web-friendly bundles

### 2.2 Texture Pipeline
- TGA/DDS → PNG/WebP/KTX2 converter (build-time)
- Runtime texture loader with mipmap support
- Texture atlas generation for UI sprites

### 2.3 Model Pipeline (W3D Format)
Port from: `Generals/Code/Libraries/Source/W3DLib/`

The W3D format includes:
- Mesh geometry (vertices, normals, UVs, vertex colors)
- Hierarchical skeleton (HTree)
- Animations (bone keyframes, compressed)
- Material definitions (textures, shader flags, blend modes)
- Bounding volumes

Converter: W3D → glTF 2.0 (build-time)
- Mesh data → glTF mesh primitives
- Skeleton → glTF skin
- Animations → glTF animations
- Materials → glTF PBR (approximated from legacy shading)

### 2.4 Audio Pipeline
- WAV → MP3/OGG (build-time compression)
- Audio manifest JSON with spatial parameters
- Music tracks as streaming audio

### 2.5 Map Pipeline
Port from: `Generals/Code/GameEngine/Include/Common/MapReaderWriterInfo.h`

- Binary .map → JSON converter:
  - Heightmap grid → Float32Array
  - Blend tiles → texture index array + blend weights
  - Object placements → JSON array
  - Waypoints → JSON dictionary
  - Player start positions
  - Lighting parameters
  - Water areas

### 2.6 Virtual Filesystem
- `VFS` class that resolves paths through:
  1. Converted asset bundles (fetch from server)
  2. IndexedDB cache (persistent across sessions)
  3. User-uploaded raw assets (File API)
- Async loading with progress tracking
- Asset manifest for preloading critical resources

### Validation Criteria
- [ ] BIG extractor correctly extracts files from original archives
- [ ] W3D → glTF converter produces loadable models (verify in glTF viewer)
- [ ] At least 5 unit models convert with correct geometry and textures
- [ ] Map converter produces valid terrain data for 3 maps
- [ ] Audio files convert and play correctly
- [ ] VFS resolves and loads assets asynchronously in browser
- [ ] Total converted asset size is reasonable (with compression)

---

## Stage 3: Rendering Engine — Terrain & Static Scene

**Goal**: Render a playable map with terrain, water, and skybox.

### 3.1 Terrain Renderer
Port from: `Generals/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DTerrainVisual.cpp`

- Chunked heightmap mesh generation from parsed map data
- Multi-texture blending (base texture + blend textures per cell)
- Cliff detection and UV mapping
- Terrain LOD (distance-based tessellation reduction)
- Passability data overlay (debug view)

### 3.2 Water System
Port from: `Generals/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DWater.cpp`

- Flat water planes at configurable heights
- Animated UV scrolling for water texture
- Water transparency / reflection approximation
- Shore blending with terrain

### 3.3 Skybox & Atmosphere
- Skybox cube map from original textures
- Directional lighting matching map lighting data
- Fog / atmospheric haze (distance-based)

### 3.4 Camera System
Port from: `Generals/Code/GameEngine/Source/GameClient/TacticalView.cpp`

- RTS camera: pitch-locked with adjustable zoom
- Scroll by edge-of-screen, keyboard, or middle-mouse drag
- Zoom in/out with limits
- Camera rotation (Ctrl+scroll or arrow keys)
- Smooth interpolation for all camera movements
- Viewport frustum calculation for culling

### 3.5 Minimap
- Top-down orthographic render to offscreen canvas
- Terrain color from texture sampling
- Camera viewport indicator
- Click-to-move-camera

### Validation Criteria
- [ ] Tournament Desert, Alpine Assault, and one urban map render correctly
- [ ] Terrain textures blend smoothly between tiles
- [ ] Water renders at correct height with animation
- [ ] Camera controls: scroll, zoom, rotate all work fluidly
- [ ] Minimap reflects terrain accurately
- [ ] Maintains 60 FPS on mid-range hardware
- [ ] Screenshot comparison with original game shows terrain fidelity

---

## Stage 4: Object Rendering — Models, Animations & Effects

**Goal**: Render units, buildings, and visual effects on the map.

### 4.1 Model Loader
- Load glTF models converted from W3D
- Skeleton/bone hierarchy setup
- Instanced rendering for repeated units
- LOD switching based on camera distance

### 4.2 Animation System
Port from: `Generals/Code/Libraries/Source/W3DLib/W3DAnimation.cpp`

- Skeletal animation playback
- Animation blending (idle → walk → attack transitions)
- Animation speed scaling
- Death animations, build-up animations
- Bone attachment points (for weapon muzzle flashes, etc.)

### 4.3 Particle System
Port from: `Generals/Code/GameEngineDevice/Source/W3DDevice/GameClient/W3DParticleSystem.cpp`

- Particle emitter types: point, line, area, mesh surface
- Particle properties: position, velocity, color, size, rotation (all with keyframes)
- Render modes: billboard, streak, geometry
- Physics: gravity, wind, drag
- GPU-accelerated particle rendering via instanced quads

### 4.4 Visual Effects
- Tracer/projectile rendering
- Explosion effects (particle + light flash + screen shake)
- Muzzle flashes
- Laser beams (texture-mapped line segments)
- Contrails
- Building damage states (intact → damaged → destroyed models)
- Garrison flags/markers

### 4.5 Shadow System
- Shadow maps (directional light)
- Unit shadow blobs (simple projected circles for performance)
- Building shadows

### 4.6 Selection & Feedback Visuals
- Unit selection circles (projected rings)
- Health bars above units
- Rally point lines
- Move/attack order indicators
- Build radius indicators
- Range circles (debug)

### Validation Criteria
- [ ] 10+ unit types render with correct models and textures
- [ ] Walk, idle, attack, death animations play correctly
- [ ] Particle effects render (smoke, fire, explosions)
- [ ] Unit selection shows health bars and selection indicators
- [ ] Building construction animation works (scaffold → complete)
- [ ] LOD transitions are seamless
- [ ] 50 units on screen at 60 FPS

---

## Stage 5: Game Logic Core — Simulation Framework

**Goal**: Implement the deterministic game simulation layer (no rendering).

### 5.1 Game Loop & Frame Timing
Port from: `Generals/Code/GameEngine/Source/Common/GameEngine.cpp`

- Fixed timestep simulation (default: 33ms per logic frame = ~30 FPS logic)
- Render interpolation for smooth 60+ FPS visuals
- Simulation can run headless (for testing, server, AI training)
- Frame counter for network synchronization

### 5.2 Object System
Port from: `Generals/Code/GameEngine/Source/GameLogic/Object/`

Core class hierarchy:
```
Thing (base template)
  └── Object (instance in game world)
        ├── Position, orientation, velocity
        ├── KindOf flags (VEHICLE, INFANTRY, STRUCTURE, etc.)
        ├── StatusFlags (UNDER_CONSTRUCTION, STEALTHED, etc.)
        ├── ContainModule (garrison/transport)
        ├── Body module (health, damage, armor)
        ├── Locomotor (movement behavior)
        ├── AI module (behavior state machine)
        ├── WeaponSet (equipped weapons)
        ├── UpgradeSet (applied upgrades)
        └── DrawModule[] (visual representation — client only)
```

### 5.3 Module System
Port from: `Generals/Code/GameEngine/Source/GameLogic/Object/Update/`

Module categories:
- **Body**: `ActiveBody`, `StructureBody`, `ImmortalBody`, `HighlanderBody`
  - Health tracking, damage application, armor types
- **Locomotor**: `GroundVehicle`, `Helicopter`, `HumanLocomotor`, `JetLocomotor`
  - Movement speed, turn rate, acceleration, terrain restrictions
- **AI/Update**: `AIUpdateInterface`, `DozerAIUpdate`, `SupplyTruckAIUpdate`,
  `HackInternetAIUpdate`, `WorkerAIUpdate`, `JetAIUpdate`
  - State machine for unit behavior
  - Auto-acquire targets, guard mode, patrol
- **Weapon**: `WeaponSet`, `Weapon`, `WeaponTemplate`
  - Damage, range, rate of fire, projectile type
  - Anti-air, anti-ground flags
  - Weapon bonus conditions
- **Special Powers**: `OCLSpecialPower`, `FireWeaponPower`, `CashBounty`
  - Cooldown timers, science requirements

### 5.4 Faction & Player System
Port from: `Generals/Code/GameEngine/Source/GameLogic/Player.cpp`

- `Player` class: resources (money), owned objects, sciences, upgrades
- Resource model: $-based economy, supply docks + supply centers
- Build list management, production queue
- Tech tree / science tree validation
- Faction-specific rules (USA, China, GLA + 9 subfaction generals)
- Team/alliance management

### 5.5 Weapon & Damage System
Port from: `Generals/Code/GameEngine/Source/GameLogic/Weapon.cpp`

- Damage types: `ARMOR_PIERCING`, `EXPLOSION`, `FLAME`, `RADIATION`, `TOXIN`, etc.
- Armor types with damage multipliers per damage type
- AoE damage with falloff
- Projectile types: instant, ballistic, missile (homing), laser, stream
- Weapon status: `RIDER1-8` for conditional weapon upgrades
- Veterancy damage bonuses

### 5.6 Upgrade System
Port from: `Generals/Code/GameEngine/Source/GameLogic/Upgrade.cpp`

- Per-player upgrades (researched at buildings)
- Per-object upgrades (veterancy, crate pickups)
- Upgrade effects: weapon swap, armor bonus, speed bonus, ability unlock
- Prerequisite chains

### 5.7 Command System (Orders)
Port from: `Generals/Code/GameEngine/Include/Common/MessageStream.h`

- `GameMessage` types for all player actions:
  - `DOATTACKOBJECT`, `DOATTACKGROUND`, `DOMOVE`, `DOSTOP`
  - `DOBUILDBUILDING`, `DOTRAINUNIT`, `DOUPGRADE`
  - `DOSELLBUILDING`, `DOREPAIR`, `DOSETRALLYPOINT`
  - `DOUSESPECIALPOWER`, `DOEVACUATE`, `DOENTER`
- Command validation (can this player issue this command?)
- Command queue per object

### Validation Criteria
- [ ] Headless simulation: create 2 players, spawn units, advance 1000 frames
- [ ] Unit takes damage and dies when health reaches 0
- [ ] Unit moves to waypoint with correct speed and pathfinding
- [ ] Building constructs unit after correct build time
- [ ] Resource harvesting: supply truck gathers and deposits money
- [ ] Upgrade researches and applies effect to units
- [ ] Weapon fires, projectile travels, damage applies with correct armor calc
- [ ] Determinism: same inputs → same outputs across 10000 frames (CRC check)
- [ ] All 3 base factions (USA, China, GLA) can build full tech tree

---

## Stage 6: Pathfinding & Terrain Logic

**Goal**: Units navigate the map intelligently.

### 6.1 Pathfinding Grid
Port from: `Generals/Code/GameEngine/Source/GameLogic/Terrain/`

- Grid-based passability from terrain data + placed objects
- Cell flags: passable, impassable, water, cliff, bridge
- Dynamic obstacle updates (buildings placed/destroyed)
- Multiple passability layers (ground, water, air)

### 6.2 A* Pathfinding
- Hierarchical A* (coarse grid for long paths, fine grid for local)
- Path smoothing (string-pulling)
- Unit-size-aware pathfinding (tanks need wider paths than infantry)
- Bridge crossing logic

### 6.3 Steering & Formation
- Local avoidance (units don't stack on each other)
- Flow-field for large group movement
- Formation movement for selected groups
- Collision response

### 6.4 Terrain Queries
- Height at point (bilinear interpolation of heightmap)
- Slope at point
- Line-of-sight checks (raycast against heightmap)
- Passability at point
- Water depth at point

### Validation Criteria
- [ ] Unit pathfinds around obstacles correctly
- [ ] Groups of 20 units move without clumping into a single point
- [ ] Units respect impassable terrain (don't walk through cliffs/buildings)
- [ ] Path recalculates when obstacle is placed/removed
- [ ] Air units ignore ground obstacles
- [ ] Bridge pathfinding works correctly
- [ ] Performance: pathfinding for 200 units completes within frame budget

---

## Stage 7: AI System

**Goal**: Computer opponents that play the game.

### 7.1 Skirmish AI Framework
Port from: `Generals/Code/GameEngine/Source/GameLogic/AI/`

- AI difficulty levels: Easy, Medium, Hard (Brutal)
- AI personality system (loaded from INI)
- Build order planning
- Resource management
- Base layout decisions

### 7.2 Unit AI State Machine
Port from: `Generals/Code/GameEngine/Source/GameLogic/AI/AIStates/`

States per unit type:
- **Idle** → auto-acquire targets within guard range
- **Moving** → pathfinding to destination
- **Attacking** → weapon firing cycle, target tracking
- **Guarding** → patrol area, engage and return
- **Gathering** → supply truck harvest loop
- **Building** → dozer construction sequence
- **Garrisoned** → fire from within building
- **Fleeing** → move away from threat

### 7.3 Target Acquisition
- Priority system: closest, weakest, most valuable, threat level
- Weapon-target compatibility (anti-air won't target ground)
- Fog-of-war awareness
- Veterancy-based targeting bonuses

### 7.4 Strategic AI
- Base building logic (where to place structures)
- Army composition planning (counter enemy composition)
- Attack timing and grouping
- Expansion decisions (second base)
- General power usage (AI uses special abilities)

### Validation Criteria
- [ ] Easy AI builds a base and produces units
- [ ] AI attacks player base after buildup phase
- [ ] AI rebuilds destroyed structures
- [ ] AI uses counter-units against player composition
- [ ] Hard AI provides competitive challenge
- [ ] AI uses general powers (artillery barrage, carpet bomb, etc.)
- [ ] Full AI vs AI game completes without errors (1000+ frames)

---

## Stage 8: UI System — Menus & HUD

**Goal**: Complete game UI from main menu through gameplay.

### 8.1 Menu System
Port from: `Generals/Code/GameEngine/Source/GameClient/GUI/Shell/`

- Main Menu (Single Player, Multiplayer, Options, Replay)
- Skirmish Setup (map select, AI players, faction select)
- Options (video, audio, controls)
- Loading screen with progress bar
- Post-game stats/score screen

Implementation: HTML/CSS overlays (not canvas-rendered)
- CSS transitions for menu animations
- Responsive layout

### 8.2 In-Game HUD
Port from: `Generals/Code/GameEngine/Source/GameClient/GUI/ControlBar/`

- **Control Bar** (bottom panel):
  - Selected unit portrait / multi-select grid
  - Command buttons (move, attack, stop, special abilities)
  - Build queue with progress bars
  - Upgrade buttons
  - Faction-specific themes (USA=blue, China=red, GLA=brown)
- **Resource display** (top): money counter with income rate
- **Minimap** (bottom-left): terrain + unit dots + camera view
- **Power bar** (if applicable)
- **General powers panel** (top-left ability shortcuts)
- **Chat input** (multiplayer)
- **Game timer**
- **FPS/ping counter** (optional)

### 8.3 Selection & Interaction
- Click-to-select with raycasting
- Box selection (drag rectangle)
- Double-click to select all of type on screen
- Ctrl+number to assign control groups
- Number to recall control groups
- Right-click context commands (move, attack, garrison, etc.)
- Shift+click to queue commands
- Tab to cycle through subgroups

### 8.4 Command Card Logic
Port from: `Generals/Code/GameEngine/Source/GameClient/GUI/ControlBar/ControlBarCommand.cpp`

- Context-sensitive buttons based on selected unit(s)
- Multi-select shows common commands
- Build menus for construction units (Dozer, Worker)
- Tooltip system with hotkey display
- Cursor changes (move, attack, garrison, invalid, etc.)

### Validation Criteria
- [ ] Main menu navigates correctly to all submenus
- [ ] Skirmish setup creates game with chosen settings
- [ ] Control bar shows correct commands for each unit type
- [ ] Unit selection (click, box, double-click, groups) all work
- [ ] Build queue shows progress and allows cancellation
- [ ] Resource counter updates in real-time
- [ ] Minimap shows units and responds to clicks
- [ ] All hotkeys trigger correct commands

---

## Stage 9: Audio System

**Goal**: Full audio: effects, speech, music, 3D positional audio.

### 9.1 Audio Manager
Port from: `Generals/Code/GameEngine/Include/Common/GameAudio.h`

- Web Audio API `AudioContext` wrapper
- Sound pool management (limit concurrent sounds)
- Priority system (speech > effects > ambient)
- Volume controls: master, music, SFX, speech, 3D sounds

### 9.2 3D Positional Audio
- `PannerNode` for spatial positioning
- Listener position tracks camera
- Distance attenuation model matching original
- Stereo panning based on screen position

### 9.3 Sound Effects
- Unit acknowledgement voices (randomized from pool)
- Weapon fire sounds
- Explosion sounds
- Building sounds (construction, power-up)
- Ambient sounds (wind, birds, machinery)
- UI sounds (click, error, notification)

### 9.4 Music System
Port from: `Generals/Code/GameEngine/Include/Common/GameMusic.h`

- Streaming playback for music tracks
- Track transitions with crossfade
- In-game vs menu music
- Victory/defeat stingers

### 9.5 EVA / Announcer
- "Building complete", "Unit ready", "Under attack" notifications
- Cooldown on repeated messages
- Faction-specific voice sets

### Validation Criteria
- [ ] Background music plays and loops
- [ ] Unit selection voices play (randomized)
- [ ] Weapon sounds fire with correct timing
- [ ] 3D positioning: sounds pan and attenuate with distance
- [ ] EVA announcements trigger at correct events
- [ ] Volume sliders in options work correctly
- [ ] No audio glitches with 50+ simultaneous sounds

---

## Stage 10: Fog of War & Intel

**Goal**: Visibility system matching the original game.

### 10.1 Fog of War
Port from: `Generals/Code/GameEngine/Source/GameClient/FogOfWar.cpp`

- Three states per cell: unexplored (black), previously seen (dim), visible (clear)
- Per-player visibility grid
- Unit sight ranges (different per unit type)
- Elevated terrain gives bonus sight range
- Buildings reveal area
- Stealth detection ranges

### 10.2 Shroud Rendering
- GPU-based shroud overlay (texture applied to scene)
- Smooth edges via blur/gradient at visibility boundary
- Minimap fog overlay
- Enemy units hidden/revealed based on visibility

### 10.3 Intel & Detection
- Stealth units (visible only to detectors)
- Detector units with detection range
- Spy satellite / scan abilities
- GPS general power (reveals all)

### Validation Criteria
- [ ] Unexplored areas are fully black
- [ ] Moving units reveal terrain in real-time
- [ ] Previously seen areas show terrain but not enemy units
- [ ] Stealth units appear/disappear at detection boundary
- [ ] Minimap reflects fog state accurately
- [ ] Fog updates at 60 FPS without performance impact

---

## Stage 11: Complete Faction Implementation

**Goal**: All three base factions fully playable with all units, buildings, and abilities.

### 11.1 USA Faction
- **Buildings**: Command Center, Barracks, War Factory, Airfield, Strategy Center,
  Supply Center, Power Plant, Patriot Missile, Firebase, Detention Camp
- **Infantry**: Ranger, Missile Defender, Pathfinder, Colonel Burton
- **Vehicles**: Humvee, Crusader Tank, Paladin Tank, Tomahawk Launcher, Ambulance
- **Aircraft**: Raptor, Stealth Fighter, Comanche, Chinook, Aurora Bomber, B-52
- **General Powers**: Fuel Air Bomb, A-10 Strike, Paradrop, Spy Drone, etc.
- **Upgrades**: TOW Missile, Composite Armor, Battle Drone, etc.

### 11.2 China Faction
- **Buildings**: Command Center, Barracks, War Factory, Airfield, Propaganda Center,
  Supply Center, Nuclear Reactor, Gattling Cannon, Bunker, Speaker Tower
- **Infantry**: Red Guard, Tank Hunter, Hacker, Black Lotus
- **Vehicles**: Battlemaster, Overlord, Inferno Cannon, Troop Crawler, Supply Truck
- **Aircraft**: MiG, Helix
- **General Powers**: Artillery Barrage, Carpet Bomb, EMP Pulse, etc.
- **Upgrades**: Chain Guns, Nationalism, Nuclear Tanks, etc.

### 11.3 GLA Faction
- **Buildings**: Command Center, Barracks, Arms Dealer, Palace, Supply Stash,
  Tunnel Network, Stinger Site, Demo Trap
- **Infantry**: Rebel, RPG Trooper, Terrorist, Hijacker, Jarmen Kell, Angry Mob
- **Vehicles**: Technical, Scorpion, Marauder, Rocket Buggy, Bomb Truck, Radar Van
- **Aircraft**: (none — GLA has no airfield)
- **General Powers**: Anthrax Bomb, SCUD Storm, Sneak Attack, GPS Scrambler, etc.
- **Upgrades**: Arm the Mob, Junk Repair, Toxin Shells, etc.
- **Unique Mechanics**: Salvage system, GLA Hole (rebuilds destroyed buildings)

### Validation Criteria
- [ ] Each faction can build complete tech tree
- [ ] All unit abilities function correctly
- [ ] All general powers activate and have correct effects
- [ ] All upgrades apply correct bonuses
- [ ] Faction-specific mechanics work (salvage, hacker money, etc.)
- [ ] Balance matches original (damage tables from INI data verified)
- [ ] 1v1 AI game: each faction vs each faction completes normally

---

## Stage 12: Zero Hour Generals & Subfactions

**Goal**: All 9 Zero Hour generals with unique units and abilities.

### 12.1 USA Generals
- **Air Force General** — King Raptor, Combat Chinook, Stealth Comanche
- **Laser General** — Laser Crusader, Laser Paladin, Avenger
- **Superweapon General** — Enhanced Particle Cannon, EMP Patriot

### 12.2 China Generals
- **Tank General** — Emperor Overlord, Autoloader, Battlemaster Elite
- **Infantry General** — Mini-gunner, Assault Troop Crawler, Fortified Bunker
- **Nuke General** — Nuke Cannon, Advanced Nuclear Reactor, Isotope Stability

### 12.3 GLA Generals
- **Toxin General** — Toxin Tractor, Toxin Rebel, Advanced Toxin abilities
- **Demolition General** — Advanced Demo Trap, Combat Cycle, Booby Trap
- **Stealth General** — GPS Scrambler, Camo-netting, Stealth Rebels

### Validation Criteria
- [ ] Each general has unique unit roster and abilities
- [ ] General-specific modifications to base units work
- [ ] General selection at game start properly modifies available tech
- [ ] Each general's special challenge (vs other generals) is winnable
- [ ] General powers unique to each subfaction function correctly

---

## Stage 13: Multiplayer Networking

**Goal**: Real-time multiplayer with lockstep synchronization.

### 13.1 Lobby System
- WebSocket-based lobby server
- Room creation / browsing / joining
- Player ready state management
- Chat system
- Map sharing / validation

### 13.2 Lockstep Networking
Port from: `Generals/Code/GameEngine/Include/GameNetwork/`

- **Protocol**: Deterministic lockstep (same as original)
- **Execution**: All players execute same commands on same frame
- **Command distribution**: Player input → server → broadcast to all
- **Frame advance**: Wait for all players' commands before advancing
- **Latency handling**: Command execution delay (configurable, default ~100ms)
- **CRC validation**: Per-frame game state hash to detect desync

Implementation:
- WebRTC DataChannels for peer-to-peer game data (low latency, UDP-like)
- WebSocket fallback for environments without WebRTC
- Relay server for NAT traversal

### 13.3 Replay System
Port from: `Generals/Code/GameEngine/Include/Common/Recorder.h`

- Record all commands per frame to file
- Replay playback at variable speed
- Save/load replay files
- Replay viewer with timeline scrubbing

### 13.4 Reconnection & Disconnect
- Timeout detection
- Game pause on disconnect
- Reconnection with state catchup
- AI takeover for disconnected players

### Validation Criteria
- [ ] Two players can find and join a game through lobby
- [ ] Game plays synchronously (no desync for 10 minutes)
- [ ] CRC mismatch detection works correctly
- [ ] Network latency up to 200ms plays smoothly
- [ ] Replay records and plays back identically
- [ ] Disconnect pauses game, reconnect resumes
- [ ] Chat works in-game

---

## Stage 14: Campaign & Scripting (Stretch)

**Goal**: Support for scripted single-player missions.

### 14.1 Script Engine
Port from: `Generals/Code/GameEngine/Source/GameLogic/ScriptEngine/`

- Trigger system (condition → action)
- Script conditions: timer, unit count, area entered, building destroyed, etc.
- Script actions: spawn units, display text, play sound, move camera, etc.
- Sequential script chains
- Team script assignments

### 14.2 Campaign Framework
- Mission loading with briefing screens
- Objective tracking (primary, secondary, bonus)
- Scripted events and cutscenes
- Save/load game state (serialization of full simulation)
- Campaign progression tracking

### Validation Criteria
- [ ] Script parser loads original script files
- [ ] Basic triggers fire correctly (timer, unit enters area)
- [ ] One complete campaign mission is playable start to finish
- [ ] Save/load preserves game state correctly

---

## Stage 15: Polish & Optimization

**Goal**: Production-quality performance and visual fidelity.

### 15.1 Rendering Optimization
- Frustum culling (already needed for Stage 3+)
- Occlusion culling for dense scenes
- Instanced rendering for repeated models
- Texture streaming / LOD
- Draw call batching
- GPU particle systems
- Shader optimization

### 15.2 Simulation Optimization
- Spatial hash for collision/proximity queries
- Lazy pathfinding recalculation
- Object pooling (no GC pressure from unit creation/destruction)
- Web Worker for pathfinding computation
- WASM compilation for hot paths (optional)

### 15.3 Network Optimization
- Command compression
- Delta encoding for state sync
- Adaptive latency compensation
- Bandwidth throttling

### 15.4 Visual Polish
- Post-processing: bloom, color grading
- Screen shake on explosions
- Smooth unit turning and animation blending
- Terrain decals (scorching, tire tracks)
- Weather effects

### 15.5 Audio Polish
- Audio occlusion (sounds behind terrain reduced)
- Doppler effect for fast-moving units
- Dynamic music intensity based on combat

### Validation Criteria
- [ ] 200 units on screen at 60 FPS (mid-range hardware)
- [ ] Full 8-player skirmish runs without frame drops
- [ ] Memory usage stays under 2GB
- [ ] Initial load time under 10 seconds (cached assets)
- [ ] Works on Chrome, Firefox, Safari, Edge
- [ ] Mobile performance acceptable on modern tablets (30 FPS)

---

## Milestone Summary

| Stage | Name | Estimated Complexity | Key Deliverable |
|-------|------|---------------------|-----------------|
| 0 | Scaffolding | Low | Build system, repo structure |
| 1 | Core + INI | Medium | Math lib, INI parser, data registry |
| 2 | Assets | High | Asset pipeline, VFS, format converters |
| 3 | Terrain | Medium | Rendered playable map with camera |
| 4 | Objects | High | Models, animations, particles on map |
| 5 | Game Logic | Very High | Full deterministic simulation |
| 6 | Pathfinding | High | A* with dynamic obstacles |
| 7 | AI | High | Skirmish AI opponents |
| 8 | UI | High | Menus, HUD, control bar |
| 9 | Audio | Medium | All game audio |
| 10 | Fog of War | Medium | Visibility system |
| 11 | Factions | Very High | All 3 factions complete |
| 12 | Generals | High | All 9 Zero Hour subfactions |
| 13 | Multiplayer | Very High | Lockstep netcode + replay |
| 14 | Campaign | High | Scripted missions |
| 15 | Polish | High | Performance + visual quality |

### Playable Checkpoints

- **After Stage 4**: "Tech Demo" — fly around a rendered map with units standing
- **After Stage 8**: "Interactive Prototype" — click units, issue move commands, see them walk
- **After Stage 11**: "Skirmish Alpha" — play a 1v1 vs AI with one faction
- **After Stage 12**: "Feature Complete" — all content available
- **After Stage 15**: "Release Quality" — polished, optimized, multiplayer-ready

---

## Technology Stack

```
Runtime:
  TypeScript 5.x (strict mode)
  Three.js r160+ (WebGL2 renderer)
  Web Audio API
  WebRTC DataChannels + WebSocket
  IndexedDB (asset caching)
  Web Workers (pathfinding, asset loading)

Build:
  Vite (dev server + bundler)
  Vitest (unit tests)
  Playwright (E2E tests)
  ESBuild (fast transpilation)

Tools:
  Node.js CLI tools for asset conversion
  Rust CLI tools for W3D/BIG parsing (optional, for speed)
  Docker for multiplayer relay server

Multiplayer Server:
  Node.js + WebSocket (lobby)
  TURN/STUN for WebRTC NAT traversal
```
