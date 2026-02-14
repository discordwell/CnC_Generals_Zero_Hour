/**
 * Validation utilities for parsed W3D data.
 *
 * Checks structural integrity of hierarchies, meshes, and animations.
 */

import type { W3dFile } from './W3dParser.js';
import type { W3dHierarchy } from './W3dHierarchyParser.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  chunk: string;
  message: string;
}

/**
 * Validate a parsed W3D file for structural integrity.
 * Returns a list of issues found.
 */
export function validateW3d(w3d: W3dFile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const hier of w3d.hierarchies) {
    issues.push(...validateHierarchy(hier));
  }

  // Check mesh bone index references against hierarchy
  const hierarchy = w3d.hierarchies[0];
  if (hierarchy) {
    for (const mesh of w3d.meshes) {
      if (mesh.boneIndices) {
        for (let i = 0; i < mesh.boneIndices.length; i++) {
          const boneIdx = mesh.boneIndices[i]!;
          if (boneIdx >= hierarchy.pivots.length) {
            issues.push({
              severity: 'error',
              chunk: `Mesh:${mesh.name}`,
              message: `Vertex ${i} references bone ${boneIdx} but hierarchy has only ${hierarchy.pivots.length} pivots`,
            });
          }
        }
      }
    }

    // Check animation pivot references
    for (const anim of w3d.animations) {
      for (const ch of anim.channels) {
        if (ch.pivot >= hierarchy.pivots.length) {
          issues.push({
            severity: 'warning',
            chunk: `Animation:${anim.name}`,
            message: `Channel references pivot ${ch.pivot} but hierarchy has only ${hierarchy.pivots.length} pivots`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validate a single hierarchy for structural issues:
 *  - Parent indices must be in bounds or -1 (root)
 *  - No cycles in parent chain
 *  - At least one root pivot
 */
export function validateHierarchy(hier: W3dHierarchy): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pivotCount = hier.pivots.length;
  let rootCount = 0;

  for (let i = 0; i < pivotCount; i++) {
    const pivot = hier.pivots[i]!;
    const parent = pivot.parentIndex;

    if (parent === -1) {
      rootCount++;
      continue;
    }

    if (parent < 0 || parent >= pivotCount) {
      issues.push({
        severity: 'error',
        chunk: `Hierarchy:${hier.name}`,
        message: `Pivot ${i} ("${pivot.name}") has out-of-bounds parent index ${parent} (hierarchy has ${pivotCount} pivots)`,
      });
      continue;
    }

    if (parent >= i) {
      issues.push({
        severity: 'warning',
        chunk: `Hierarchy:${hier.name}`,
        message: `Pivot ${i} ("${pivot.name}") references forward parent ${parent} — may indicate non-topological order`,
      });
    }
  }

  // Cycle detection: walk each pivot's parent chain
  for (let i = 0; i < pivotCount; i++) {
    const visited = new Set<number>();
    let current = i;
    while (current !== -1) {
      if (visited.has(current)) {
        issues.push({
          severity: 'error',
          chunk: `Hierarchy:${hier.name}`,
          message: `Cycle detected in parent chain starting from pivot ${i} ("${hier.pivots[i]!.name}")`,
        });
        break;
      }
      visited.add(current);
      const pivot = hier.pivots[current];
      if (!pivot || pivot.parentIndex < -1 || pivot.parentIndex >= pivotCount) break;
      current = pivot.parentIndex;
    }
  }

  if (rootCount === 0 && pivotCount > 0) {
    issues.push({
      severity: 'error',
      chunk: `Hierarchy:${hier.name}`,
      message: 'No root pivot found (all pivots have a parent)',
    });
  }

  return issues;
}
