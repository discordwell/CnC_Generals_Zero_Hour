import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ParticleSystemManager,
  PARTICLE_STRIDE,
  VEL_X,
  VEL_Y,
  VEL_Z,
  ALPHA,
  VEL_DAMP,
  ANG_DAMP,
  ALPHA_FACTOR,
} from './particle-system-manager.js';
import { IniDataRegistry } from '@generals/ini-data';
import type { IniBlock, IniValue } from '@generals/core';

function makeBlock(type: string, name: string, fields: Record<string, unknown> = {}): IniBlock {
  return { type, name, fields: fields as Record<string, IniValue>, blocks: [] };
}

function createRegistryWithTemplate(): IniDataRegistry {
  const registry = new IniDataRegistry();
  registry.loadBlocks([
    makeBlock('ParticleSystem', 'SmokePuff', {
      Priority: 'WEAPON_EXPLOSION',
      IsOneShot: 'Yes',
      Shader: 'ALPHA',
      Type: 'PARTICLE',
      ParticleName: 'EXSmokNew1.tga',
      Lifetime: '30 30',
      SystemLifetime: '5',
      Size: '1.00 2.00',
      BurstDelay: '1 1',
      BurstCount: '3 3',
      Alpha1: '0.00 0.00 0',
      Alpha2: '1.00 1.00 15',
      Alpha3: '0.00 0.00 30',
      Color1: 'R:255 G:255 B:255 0',
      VelocityType: 'SPHERICAL',
      VelSpherical: '0.5 1.0',
      VolumeType: 'POINT',
    }),
  ]);
  return registry;
}

describe('ParticleSystemManager', () => {
  let scene: THREE.Scene;
  let manager: ParticleSystemManager;

  beforeEach(() => {
    scene = new THREE.Scene();
    manager = new ParticleSystemManager(scene);
    manager.loadFromRegistry(createRegistryWithTemplate());
    manager.init();
  });

  it('loads templates from registry', () => {
    expect(manager.getTemplateCount()).toBe(1);
    expect(manager.getTemplate('SmokePuff')).toBeDefined();
  });

  it('creates a particle system and returns an id', () => {
    const id = manager.createSystem('SmokePuff', new THREE.Vector3(10, 0, 10));
    expect(id).not.toBeNull();
    expect(manager.getActiveSystemCount()).toBe(1);
  });

  it('returns null for unknown template', () => {
    const id = manager.createSystem('NonExistent', new THREE.Vector3(0, 0, 0));
    expect(id).toBeNull();
  });

  it('emits particles on update', () => {
    manager.createSystem('SmokePuff', new THREE.Vector3(0, 0, 0));
    expect(manager.getTotalParticleCount()).toBe(0);

    // First update should trigger burst
    manager.update(1 / 30);
    expect(manager.getTotalParticleCount()).toBeGreaterThan(0);
  });

  it('removes expired particles', () => {
    manager.createSystem('SmokePuff', new THREE.Vector3(0, 0, 0));

    // Run updates to emit and then age particles past their lifetime
    for (let i = 0; i < 50; i++) {
      manager.update(1 / 30);
    }

    // System has systemLifetime=5, particles have lifetime=30
    // After 50 frames: system stopped emitting at frame 5, particles all expired by frame 35
    expect(manager.getActiveSystemCount()).toBe(0);
    expect(manager.getTotalParticleCount()).toBe(0);
  });

  it('destroys system manually', () => {
    const id = manager.createSystem('SmokePuff', new THREE.Vector3(0, 0, 0))!;
    manager.destroySystem(id);
    manager.update(1 / 30);
    // System should be cleaned up after next update
    expect(manager.getActiveSystemCount()).toBe(0);
  });

  it('resets all state', () => {
    manager.createSystem('SmokePuff', new THREE.Vector3(0, 0, 0));
    manager.update(1 / 30);
    expect(manager.getActiveSystemCount()).toBe(1);

    manager.reset();
    expect(manager.getActiveSystemCount()).toBe(0);
    expect(manager.getTotalParticleCount()).toBe(0);
  });

  it('creates instanced mesh in scene', () => {
    manager.createSystem('SmokePuff', new THREE.Vector3(5, 0, 5));
    manager.update(1 / 30);

    // Check scene has instanced mesh
    const instancedMeshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instancedMeshes.length).toBeGreaterThan(0);
  });

  it('respects particle cap', () => {
    // Create many systems to hit the cap
    for (let i = 0; i < 100; i++) {
      manager.createSystem('SmokePuff', new THREE.Vector3(i, 0, 0));
    }

    // Run many updates
    for (let i = 0; i < 10; i++) {
      manager.update(1 / 30);
    }

    expect(manager.getTotalParticleCount()).toBeLessThanOrEqual(3000);
  });

  it('damping value is constant per-particle across frames', () => {
    // Use a template with a damping range so the per-particle value matters
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeBlock('ParticleSystem', 'DampTest', {
        Priority: 'WEAPON_EXPLOSION',
        IsOneShot: 'Yes',
        Shader: 'ALPHA',
        Type: 'PARTICLE',
        Lifetime: '100 100',
        SystemLifetime: '1',
        Size: '1 1',
        BurstDelay: '1 1',
        BurstCount: '1 1',
        VelocityDamping: '0.5 0.9',
        AngularDamping: '0.3 0.7',
        VelocityType: 'ORTHO',
        VelOrthoX: '1 1',
        VelOrthoY: '1 1',
        VelOrthoZ: '1 1',
        VolumeType: 'POINT',
      }),
    ]);
    const scene2 = new THREE.Scene();
    const mgr = new ParticleSystemManager(scene2);
    mgr.loadFromRegistry(registry);
    mgr.init();

    const id = mgr.createSystem('DampTest', new THREE.Vector3(0, 0, 0))!;
    expect(id).not.toBeNull();

    // First update emits the particle
    mgr.update(1 / 30);
    const info1 = mgr._getSystemParticleData(id)!;
    expect(info1.count).toBe(1);

    // Read damping values after frame 1
    const velDamp1 = info1.data[0 * PARTICLE_STRIDE + VEL_DAMP]!;
    const angDamp1 = info1.data[0 * PARTICLE_STRIDE + ANG_DAMP]!;

    // Second update
    mgr.update(1 / 30);
    const info2 = mgr._getSystemParticleData(id)!;
    expect(info2.count).toBe(1);

    // Read damping values after frame 2 — should be identical
    const velDamp2 = info2.data[0 * PARTICLE_STRIDE + VEL_DAMP]!;
    const angDamp2 = info2.data[0 * PARTICLE_STRIDE + ANG_DAMP]!;

    expect(velDamp2).toBe(velDamp1);
    expect(angDamp2).toBe(angDamp1);

    // Also verify damping is within the configured range
    expect(velDamp1).toBeGreaterThanOrEqual(0.5);
    expect(velDamp1).toBeLessThanOrEqual(0.9);
    expect(angDamp1).toBeGreaterThanOrEqual(0.3);
    expect(angDamp1).toBeLessThanOrEqual(0.7);
  });

  it('alpha varies between particles with same keyframes', () => {
    // Use a template with distinct alphaMin/alphaMax ranges
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeBlock('ParticleSystem', 'AlphaVaryTest', {
        Priority: 'WEAPON_EXPLOSION',
        IsOneShot: 'Yes',
        Shader: 'ALPHA',
        Type: 'PARTICLE',
        Lifetime: '100 100',
        SystemLifetime: '2',
        Size: '1 1',
        BurstDelay: '1 1',
        BurstCount: '20 20',
        Alpha1: '0.00 1.00 0',     // wide alphaMin/alphaMax range
        Alpha2: '0.00 1.00 100',
        VelocityType: 'ORTHO',
        VolumeType: 'POINT',
      }),
    ]);
    const scene2 = new THREE.Scene();
    const mgr = new ParticleSystemManager(scene2);
    mgr.loadFromRegistry(registry);
    mgr.init();

    const id = mgr.createSystem('AlphaVaryTest', new THREE.Vector3(0, 0, 0))!;
    mgr.update(1 / 30); // emit particles

    const info = mgr._getSystemParticleData(id)!;
    expect(info.count).toBeGreaterThanOrEqual(2);

    // Collect per-particle alpha factors
    const factors = new Set<number>();
    for (let i = 0; i < info.count; i++) {
      factors.add(info.data[i * PARTICLE_STRIDE + ALPHA_FACTOR]!);
    }

    // With 20 particles, alpha factors should not all be the same
    expect(factors.size).toBeGreaterThan(1);

    // Verify alpha values also differ (since factors differ and range is 0..1)
    const alphas = new Set<number>();
    for (let i = 0; i < info.count; i++) {
      alphas.add(info.data[i * PARTICLE_STRIDE + ALPHA]!);
    }
    expect(alphas.size).toBeGreaterThan(1);
  });

  it('physics order: gravity applied before damping', () => {
    // Gravity should be added to velocity BEFORE damping multiplies it.
    // If order is: vel_y = (vel_y - gravity) * damp
    // Then with vel_y=0, gravity=10, damp=0.5: result = (0-10)*0.5 = -5
    // Wrong order (damp then gravity): result = 0*0.5 - 10 = -10
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      makeBlock('ParticleSystem', 'PhysicsOrderTest', {
        Priority: 'WEAPON_EXPLOSION',
        IsOneShot: 'Yes',
        Shader: 'ALPHA',
        Type: 'PARTICLE',
        Lifetime: '100 100',
        SystemLifetime: '2',
        Size: '1 1',
        BurstDelay: '1 1',
        BurstCount: '1 1',
        Gravity: '10',
        VelocityDamping: '0.5 0.5',  // Fixed damping (no range)
        VelocityType: 'ORTHO',
        VelOrthoX: '0 0',
        VelOrthoY: '0 0',
        VelOrthoZ: '0 0',
        VolumeType: 'POINT',
      }),
    ]);
    const scene2 = new THREE.Scene();
    const mgr = new ParticleSystemManager(scene2);
    mgr.loadFromRegistry(registry);
    mgr.init();

    const id = mgr.createSystem('PhysicsOrderTest', new THREE.Vector3(0, 0, 0))!;
    // First update: emit particle with vel_y = 0
    mgr.update(1 / 30);

    const info = mgr._getSystemParticleData(id)!;
    expect(info.count).toBe(1);

    // After first update tick, the particle has been updated:
    // Correct order: vel_y = (0 - 10) * 0.5 = -5
    // Wrong order:   vel_y = (0 * 0.5) - 10 = -10
    const velY = info.data[0 * PARTICLE_STRIDE + VEL_Y]!;
    expect(velY).toBeCloseTo(-5, 5);
  });
});
