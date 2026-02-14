import { describe, it, expect } from 'vitest';
import { parseIni } from './ini-parser.js';

describe('INI Parser', () => {
  it('parses a simple object block', () => {
    const source = `
Object TestTank
  Side = America
  TransportSlotCount = 3
  MaxHealth = 300.0
End
`;
    const result = parseIni(source);
    expect(result.errors).toHaveLength(0);
    expect(result.blocks).toHaveLength(1);

    const obj = result.blocks[0]!;
    expect(obj.type).toBe('Object');
    expect(obj.name).toBe('TestTank');
    expect(obj.fields['Side']).toBe('America');
    expect(obj.fields['TransportSlotCount']).toBe(3);
    expect(obj.fields['MaxHealth']).toBe(300.0);
  });

  it('parses boolean fields', () => {
    const source = `
Object TestUnit
  IsSelectable = Yes
  IsPrerequisite = No
End
`;
    const result = parseIni(source);
    expect(result.blocks[0]!.fields['IsSelectable']).toBe(true);
    expect(result.blocks[0]!.fields['IsPrerequisite']).toBe(false);
  });

  it('parses multi-value fields as arrays', () => {
    const source = `
Object TestUnit
  KindOf = VEHICLE SELECTABLE CAN_ATTACK
End
`;
    const result = parseIni(source);
    expect(result.blocks[0]!.fields['KindOf']).toEqual([
      'VEHICLE',
      'SELECTABLE',
      'CAN_ATTACK',
    ]);
  });

  it('parses coordinate-like numeric arrays', () => {
    const source = `
Object TestUnit
  GeometryOffset = 0.0 5.0 10.0
End
`;
    const result = parseIni(source);
    expect(result.blocks[0]!.fields['GeometryOffset']).toEqual([0.0, 5.0, 10.0]);
  });

  it('parses inheritance syntax', () => {
    const source = `
Object CrusaderTank : BaseTank
  MaxHealth = 500.0
End
`;
    const result = parseIni(source);
    const obj = result.blocks[0]!;
    expect(obj.name).toBe('CrusaderTank');
    expect(obj.parent).toBe('BaseTank');
    expect(obj.fields['MaxHealth']).toBe(500.0);
  });

  it('strips comments', () => {
    const source = `
Object TestUnit ; this is a comment
  ; full line comment
  MaxHealth = 100.0 ; inline comment
  // C-style comment
End
`;
    const result = parseIni(source);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.fields['MaxHealth']).toBe(100.0);
  });

  it('parses multiple top-level blocks', () => {
    const source = `
Weapon TankGun
  Damage = 50
  Range = 200.0
End

Object TestTank
  Side = China
End
`;
    const result = parseIni(source);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]!.type).toBe('Weapon');
    expect(result.blocks[0]!.name).toBe('TankGun');
    expect(result.blocks[1]!.type).toBe('Object');
    expect(result.blocks[1]!.name).toBe('TestTank');
  });

  it('parses percentage values', () => {
    const source = `
Object TestUnit
  DamagePercent = 50%
End
`;
    const result = parseIni(source);
    expect(result.blocks[0]!.fields['DamagePercent']).toBe(0.5);
  });
});
