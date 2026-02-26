import { describe, expect, it } from 'vitest';

import { resolveScriptRadarVisibility } from './script-radar-visibility.js';

describe('resolveScriptRadarVisibility', () => {
  it('hides radar when script has disabled radar and no force-enable is active', () => {
    expect(resolveScriptRadarVisibility(true, false)).toBe(false);
  });

  it('shows radar when script has not disabled radar', () => {
    expect(resolveScriptRadarVisibility(false, false)).toBe(true);
  });

  it('shows radar when forced even if script hide flag is set', () => {
    expect(resolveScriptRadarVisibility(true, true)).toBe(true);
  });
});
