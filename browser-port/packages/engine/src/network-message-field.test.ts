import { describe, expect, it } from 'vitest';

import {
  resolveNetworkMessageGetter,
  resolveNetworkNumericField,
  resolveNetworkNumericFieldFromMessage,
  resolveNetworkTextField,
  resolveNetworkTextFieldFromMessage,
} from './network-message-field.js';

describe('network message field helpers', () => {
  it('resolves numeric field values from number/string payloads', () => {
    expect(resolveNetworkNumericField(12)).toBe(12);
    expect(resolveNetworkNumericField(' 42 ')).toBe(42);
    expect(resolveNetworkNumericField('nan')).toBeNull();
    expect(resolveNetworkNumericField({})).toBeNull();
  });

  it('resolves text field values from non-empty strings', () => {
    expect(resolveNetworkTextField(' hello ')).toBe('hello');
    expect(resolveNetworkTextField('   ')).toBeNull();
    expect(resolveNetworkTextField(123)).toBeNull();
  });

  it('resolves message getter values and suppresses getter exceptions', () => {
    expect(resolveNetworkMessageGetter({ getValue: () => 5 }, 'getValue')).toBe(5);
    expect(resolveNetworkMessageGetter({ value: 5 }, 'getValue')).toBeUndefined();
    expect(resolveNetworkMessageGetter({
      getValue: () => {
        throw new Error('getter fail');
      },
    }, 'getValue')).toBeUndefined();
  });

  it('resolves numeric fields from message keys/getters in order', () => {
    expect(resolveNetworkNumericFieldFromMessage(
      { frame: '7', getFrame: () => 9 },
      ['frame'],
      ['getFrame'],
    )).toBe(7);
    expect(resolveNetworkNumericFieldFromMessage(
      { getFrame: () => '9' },
      ['frame'],
      ['getFrame'],
    )).toBe(9);
    expect(resolveNetworkNumericFieldFromMessage({}, ['frame'], ['getFrame'])).toBeNull();
  });

  it('resolves text fields from message keys/getters in order', () => {
    expect(resolveNetworkTextFieldFromMessage(
      { text: '  chat ', getText: () => 'fallback' },
      ['text'],
      ['getText'],
    )).toBe('chat');
    expect(resolveNetworkTextFieldFromMessage(
      { getText: () => ' value ' },
      ['text'],
      ['getText'],
    )).toBe('value');
    expect(resolveNetworkTextFieldFromMessage({}, ['text'], ['getText'])).toBeNull();
  });
});
