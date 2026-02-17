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

  // ==================== New Phase 1 tests ====================

  describe('#define macro substitution', () => {
    it('substitutes a simple define', () => {
      const source = `
#define TANK_HEALTH 300.0
Object TestTank
  MaxHealth = TANK_HEALTH
End
`;
      const result = parseIni(source);
      expect(result.errors).toHaveLength(0);
      expect(result.blocks[0]!.fields['MaxHealth']).toBe(300.0);
    });

    it('substitutes multiple defines', () => {
      const source = `
#define HP 500
#define SIDE America
Object TestTank
  MaxHealth = HP
  Side = SIDE
End
`;
      const result = parseIni(source);
      expect(result.blocks[0]!.fields['MaxHealth']).toBe(500);
      expect(result.blocks[0]!.fields['Side']).toBe('America');
    });

    it('returns defines in result', () => {
      const source = `
#define MY_VAL 42
Object Foo
  X = 1
End
`;
      const result = parseIni(source);
      expect(result.defines.get('MY_VAL')).toBe('42');
    });

    it('accepts pre-existing defines from options', () => {
      const source = `
Object TestTank
  MaxHealth = EXTERNAL_HP
End
`;
      const result = parseIni(source, {
        defines: new Map([['EXTERNAL_HP', '999']]),
      });
      expect(result.blocks[0]!.fields['MaxHealth']).toBe(999);
    });
  });

  describe('#include directive', () => {
    it('records include paths without resolver', () => {
      const source = `
#include "weapons.ini"
Object TestTank
  Side = America
End
`;
      const result = parseIni(source);
      expect(result.includes).toContain('weapons.ini');
      expect(result.blocks).toHaveLength(1);
    });

    it('resolves includes with callback', () => {
      const weaponsIni = `
Weapon TankGun
  Damage = 50
End
`;
      const source = `
#include "weapons.ini"
Object TestTank
  Side = America
End
`;
      const result = parseIni(source, {
        resolveInclude: (path) => path === 'weapons.ini' ? weaponsIni : null,
      });
      expect(result.errors).toHaveLength(0);
      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0]!.type).toBe('Weapon');
      expect(result.blocks[1]!.type).toBe('Object');
    });

    it('reports error for missing include', () => {
      const source = `
#include "missing.ini"
Object Foo
  X = 1
End
`;
      const result = parseIni(source, {
        resolveInclude: () => null,
      });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('not found');
    });

    it('detects circular includes', () => {
      const source = `
#include "self.ini"
Object Foo
  X = 1
End
`;
      const result = parseIni(source, {
        filePath: 'self.ini',
        resolveInclude: () => source,
      });
      expect(result.errors.some((e) => e.message.includes('Circular'))).toBe(true);
    });

    it('propagates defines across includes', () => {
      const base = `
#define BASE_HP 100
`;
      const main = `
#include "base.ini"
Object TestTank
  MaxHealth = BASE_HP
End
`;
      const result = parseIni(main, {
        filePath: 'main.ini',
        resolveInclude: (path) => path === 'base.ini' ? base : null,
      });
      expect(result.errors).toHaveLength(0);
      expect(result.blocks[0]!.fields['MaxHealth']).toBe(100);
    });
  });

  describe('singleton blocks', () => {
    it('parses GameData without name', () => {
      const source = `
GameData
  MaxCameraHeight = 800.0
  MinCameraHeight = 120.0
End
`;
      const result = parseIni(source);
      expect(result.errors).toHaveLength(0);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]!.type).toBe('GameData');
      expect(result.blocks[0]!.name).toBe('');
      expect(result.blocks[0]!.fields['MaxCameraHeight']).toBe(800.0);
    });

    it('parses AI block without name', () => {
      const source = `
AI
  AttackUsesLineOfSight = no
End
`;
      const result = parseIni(source);
      expect(result.errors).toHaveLength(0);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]!.type).toBe('AI');
      expect(result.blocks[0]!.name).toBe('');
      expect(result.blocks[0]!.fields['AttackUsesLineOfSight']).toBe(false);
    });

    it('parses AudioSettings block without name', () => {
      const source = `
AudioSettings
  SampleCount2D = 8
  SampleCount3D = 28
  StreamCount = 3
End
`;
      const result = parseIni(source);
      expect(result.errors).toHaveLength(0);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]!.type).toBe('AudioSettings');
      expect(result.blocks[0]!.name).toBe('');
      expect(result.blocks[0]!.fields['SampleCount2D']).toBe(8);
      expect(result.blocks[0]!.fields['SampleCount3D']).toBe(28);
      expect(result.blocks[0]!.fields['StreamCount']).toBe(3);
    });
  });

  describe('+= additive fields', () => {
    it('appends to existing array field', () => {
      const source = `
Object TestUnit
  KindOf = VEHICLE SELECTABLE
  KindOf += CAN_ATTACK
End
`;
      const result = parseIni(source);
      expect(result.blocks[0]!.fields['KindOf']).toEqual([
        'VEHICLE', 'SELECTABLE', 'CAN_ATTACK',
      ]);
    });

    it('creates new array from += on undefined field', () => {
      const source = `
Object TestUnit
  KindOf += VEHICLE
End
`;
      const result = parseIni(source);
      expect(result.blocks[0]!.fields['KindOf']).toBe('VEHICLE');
    });
  });

  describe('AddModule / RemoveModule / ReplaceModule', () => {
    it('parses AddModule as sub-block', () => {
      const source = `
ChildObject AdvancedTank : BaseTank
  AddModule ModuleTag_New
    MaxHealth = 999
  End
End
`;
      const result = parseIni(source);
      expect(result.errors).toHaveLength(0);
      const child = result.blocks[0]!;
      expect(child.blocks).toHaveLength(1);
      expect(child.blocks[0]!.type).toBe('AddModule');
      expect(child.blocks[0]!.name).toBe('ModuleTag_New');
      expect(child.blocks[0]!.fields['MaxHealth']).toBe(999);
    });

    it('parses RemoveModule as directive', () => {
      const source = `
ChildObject AdvancedTank : BaseTank
  RemoveModule ModuleTag_Old
End
`;
      const result = parseIni(source);
      const child = result.blocks[0]!;
      expect(child.blocks).toHaveLength(1);
      expect(child.blocks[0]!.type).toBe('RemoveModule');
      expect(child.blocks[0]!.name).toBe('ModuleTag_Old');
    });

    it('parses ReplaceModule as sub-block', () => {
      const source = `
ChildObject AdvancedTank : BaseTank
  ReplaceModule ModuleTag_02
    MaxHealth = 500
  End
End
`;
      const result = parseIni(source);
      const child = result.blocks[0]!;
      expect(child.blocks).toHaveLength(1);
      expect(child.blocks[0]!.type).toBe('ReplaceModule');
      expect(child.blocks[0]!.name).toBe('ModuleTag_02');
      expect(child.blocks[0]!.fields['MaxHealth']).toBe(500);
    });
  });

  describe('file context in errors', () => {
    it('includes file path in error', () => {
      const source = `
UnknownDirective Foo
`;
      const result = parseIni(source, { filePath: 'test.ini' });
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.file).toBe('test.ini');
    });
  });
});
