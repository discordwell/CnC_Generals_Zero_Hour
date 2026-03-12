import { describe, expect, it } from 'vitest';
import { IniDataRegistry } from '@generals/ini-data';
import {
  buildStartingCreditsOptionsFromRegistry,
  getDefaultStartingCreditsValue,
} from './shell-runtime-data.js';

describe('shell-runtime-data', () => {
  it('builds starting money options from MultiplayerStartingMoneyChoice blocks', () => {
    const registry = new IniDataRegistry();
    registry.loadBlocks([
      {
        type: 'MultiplayerStartingMoneyChoice',
        name: '',
        fields: { Value: 5000 },
        blocks: [],
      },
      {
        type: 'MultiplayerStartingMoneyChoice',
        name: '',
        fields: { Value: 10000, Default: true },
        blocks: [],
      },
      {
        type: 'MultiplayerStartingMoneyChoice',
        name: '',
        fields: { Value: 50000 },
        blocks: [],
      },
    ]);

    const options = buildStartingCreditsOptionsFromRegistry(registry);

    expect(options).toEqual([
      { value: 5000, label: '$5,000', isDefault: false },
      { value: 10000, label: '$10,000 (Default)', isDefault: true },
      { value: 50000, label: '$50,000', isDefault: false },
    ]);
    expect(getDefaultStartingCreditsValue(options)).toBe(10000);
  });
});
