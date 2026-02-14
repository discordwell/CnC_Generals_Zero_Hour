import { describe, it, expect } from 'vitest';
import { sha256Hex } from './hash.js';

describe('sha256Hex', () => {
  it('hashes empty buffer to known SHA-256', async () => {
    const empty = new ArrayBuffer(0);
    const hash = await sha256Hex(empty);
    // SHA-256 of empty input
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "hello" to known SHA-256', async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode('hello').buffer as ArrayBuffer;
    const hash = await sha256Hex(data);
    // SHA-256 of "hello"
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns lowercase hex string of 64 chars', async () => {
    const data = new Uint8Array([1, 2, 3]).buffer as ArrayBuffer;
    const hash = await sha256Hex(data);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different inputs', async () => {
    const a = new Uint8Array([1]).buffer as ArrayBuffer;
    const b = new Uint8Array([2]).buffer as ArrayBuffer;
    const hashA = await sha256Hex(a);
    const hashB = await sha256Hex(b);
    expect(hashA).not.toBe(hashB);
  });
});
