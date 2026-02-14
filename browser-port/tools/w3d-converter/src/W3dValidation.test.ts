/**
 * Tests for W3D hierarchy and mesh validation.
 */

import { describe, it, expect } from 'vitest';
import { validateHierarchy, validateW3d } from './W3dValidation.js';
import type { W3dHierarchy } from './W3dHierarchyParser.js';
import type { W3dFile } from './W3dParser.js';
import type { W3dMesh } from './W3dMeshParser.js';

function makeHierarchy(pivots: Array<{ name: string; parentIndex: number }>): W3dHierarchy {
  return {
    name: 'TestHier',
    pivots: pivots.map((p) => ({
      name: p.name,
      parentIndex: p.parentIndex,
      translation: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    })),
  };
}

function makeMesh(name: string, boneIndices?: number[]): W3dMesh {
  return {
    name,
    containerName: 'Test',
    vertices: new Float32Array(0),
    normals: new Float32Array(0),
    uvs: new Float32Array(0),
    indices: new Uint32Array(0),
    textureNames: [],
    attributes: 0,
    boneIndices: boneIndices ? new Uint16Array(boneIndices) : undefined,
  };
}

describe('validateHierarchy', () => {
  it('passes for a valid hierarchy', () => {
    const hier = makeHierarchy([
      { name: 'Root', parentIndex: -1 },
      { name: 'Child1', parentIndex: 0 },
      { name: 'Child2', parentIndex: 0 },
      { name: 'Grandchild', parentIndex: 1 },
    ]);

    const issues = validateHierarchy(hier);
    expect(issues).toHaveLength(0);
  });

  it('detects out-of-bounds parent index', () => {
    const hier = makeHierarchy([
      { name: 'Root', parentIndex: -1 },
      { name: 'Bad', parentIndex: 99 },
    ]);

    const issues = validateHierarchy(hier);
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('out-of-bounds'))).toBe(true);
  });

  it('detects cycle in parent chain', () => {
    const hier = makeHierarchy([
      { name: 'A', parentIndex: 1 },
      { name: 'B', parentIndex: 0 },
    ]);

    const issues = validateHierarchy(hier);
    expect(issues.some((i) => i.message.includes('Cycle'))).toBe(true);
  });

  it('warns about missing root pivot', () => {
    const hier = makeHierarchy([
      { name: 'A', parentIndex: 1 },
      { name: 'B', parentIndex: 0 },
    ]);

    const issues = validateHierarchy(hier);
    expect(issues.some((i) => i.message.includes('No root pivot'))).toBe(true);
  });

  it('warns about forward parent references', () => {
    const hier = makeHierarchy([
      { name: 'Root', parentIndex: -1 },
      { name: 'Child', parentIndex: 2 },
      { name: 'Sibling', parentIndex: 0 },
    ]);

    const issues = validateHierarchy(hier);
    expect(issues.some((i) => i.message.includes('forward parent'))).toBe(true);
  });
});

describe('validateW3d', () => {
  it('detects mesh bone index out of range', () => {
    const w3d: W3dFile = {
      meshes: [makeMesh('BadMesh', [0, 1, 99])],
      hierarchies: [makeHierarchy([
        { name: 'Root', parentIndex: -1 },
        { name: 'Child', parentIndex: 0 },
      ])],
      animations: [],
      hlods: [],
      boxes: [],
    };

    const issues = validateW3d(w3d);
    expect(issues.some((i) =>
      i.severity === 'error' && i.message.includes('bone 99'),
    )).toBe(true);
  });

  it('detects animation pivot out of range', () => {
    const w3d: W3dFile = {
      meshes: [],
      hierarchies: [makeHierarchy([
        { name: 'Root', parentIndex: -1 },
        { name: 'Child', parentIndex: 0 },
      ])],
      animations: [{
        name: 'TestAnim',
        hierarchyName: 'TestHier',
        numFrames: 5,
        frameRate: 30,
        channels: [
          { firstFrame: 0, lastFrame: 4, type: 'x', pivot: 99, data: new Float32Array(5) },
        ],
      }],
      hlods: [],
      boxes: [],
    };

    const issues = validateW3d(w3d);
    expect(issues.some((i) =>
      i.severity === 'warning' && i.message.includes('pivot 99'),
    )).toBe(true);
  });

  it('passes for valid W3D file', () => {
    const w3d: W3dFile = {
      meshes: [makeMesh('GoodMesh', [0, 1, 0])],
      hierarchies: [makeHierarchy([
        { name: 'Root', parentIndex: -1 },
        { name: 'Child', parentIndex: 0 },
      ])],
      animations: [],
      hlods: [],
      boxes: [],
    };

    const issues = validateW3d(w3d);
    expect(issues).toHaveLength(0);
  });
});
