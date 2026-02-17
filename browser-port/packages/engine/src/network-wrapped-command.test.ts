import { describe, expect, it } from 'vitest';

import {
  NETCOMMANDTYPE_CHAT,
  NETCOMMANDTYPE_FILEANNOUNCE,
  NETCOMMANDTYPE_FRAMEINFO,
  NETCOMMANDTYPE_WRAPPER,
} from './network-command-type.js';
import { parseNetworkWrappedCommand } from './network-wrapped-command.js';

function appendUint8(bytes: number[], value: number): void {
  bytes.push(value & 0xff);
}

function appendUint16LE(bytes: number[], value: number): void {
  const normalized = value & 0xffff;
  bytes.push(normalized & 0xff, (normalized >>> 8) & 0xff);
}

function appendUint32LE(bytes: number[], value: number): void {
  const normalized = value >>> 0;
  bytes.push(
    normalized & 0xff,
    (normalized >>> 8) & 0xff,
    (normalized >>> 16) & 0xff,
    (normalized >>> 24) & 0xff,
  );
}

function appendInt32LE(bytes: number[], value: number): void {
  const normalized = value | 0;
  appendUint32LE(bytes, normalized);
}

function appendUtf16(bytes: number[], text: string): void {
  appendUint8(bytes, text.length);
  for (let index = 0; index < text.length; index += 1) {
    appendUint16LE(bytes, text.charCodeAt(index));
  }
}

describe('network-wrapped-command', () => {
  it('parses frameinfo payload markers', () => {
    const bytes: number[] = [];
    appendUint8(bytes, 'T'.charCodeAt(0));
    appendUint8(bytes, NETCOMMANDTYPE_FRAMEINFO);
    appendUint8(bytes, 'P'.charCodeAt(0));
    appendUint8(bytes, 2);
    appendUint8(bytes, 'F'.charCodeAt(0));
    appendUint32LE(bytes, 33);
    appendUint8(bytes, 'C'.charCodeAt(0));
    appendUint16LE(bytes, 99);
    appendUint8(bytes, 'D'.charCodeAt(0));
    appendUint16LE(bytes, 7);

    expect(parseNetworkWrappedCommand(new Uint8Array(bytes))).toEqual({
      commandType: NETCOMMANDTYPE_FRAMEINFO,
      sender: 2,
      executionFrame: 33,
      commandId: 99,
      commandCount: 7,
    });
  });

  it('parses chat payload with UTF16 text and player mask', () => {
    const bytes: number[] = [];
    appendUint8(bytes, 'T'.charCodeAt(0));
    appendUint8(bytes, NETCOMMANDTYPE_CHAT);
    appendUint8(bytes, 'P'.charCodeAt(0));
    appendUint8(bytes, 1);
    appendUint8(bytes, 'D'.charCodeAt(0));
    appendUtf16(bytes, 'hi');
    appendInt32LE(bytes, 5);

    expect(parseNetworkWrappedCommand(new Uint8Array(bytes))).toEqual({
      commandType: NETCOMMANDTYPE_CHAT,
      sender: 1,
      text: 'hi',
      playerMask: 5,
    });
  });

  it('parses wrapper payload records', () => {
    const bytes: number[] = [];
    appendUint8(bytes, 'T'.charCodeAt(0));
    appendUint8(bytes, NETCOMMANDTYPE_WRAPPER);
    appendUint8(bytes, 'D'.charCodeAt(0));
    appendUint16LE(bytes, 0x4321);
    appendUint32LE(bytes, 1);
    appendUint32LE(bytes, 2);
    appendUint32LE(bytes, 8);
    appendUint32LE(bytes, 4);
    appendUint32LE(bytes, 4);
    appendUint8(bytes, 10);
    appendUint8(bytes, 11);
    appendUint8(bytes, 12);
    appendUint8(bytes, 13);

    expect(parseNetworkWrappedCommand(new Uint8Array(bytes))).toEqual({
      commandType: NETCOMMANDTYPE_WRAPPER,
      wrappedCommandID: 0x4321,
      chunkNumber: 1,
      numChunks: 2,
      totalDataLength: 8,
      dataOffset: 4,
      data: new Uint8Array([10, 11, 12, 13]),
    });
  });

  it('returns null for malformed/truncated payloads', () => {
    const bytes: number[] = [];
    appendUint8(bytes, 'T'.charCodeAt(0));
    appendUint8(bytes, NETCOMMANDTYPE_FILEANNOUNCE);
    appendUint8(bytes, 'D'.charCodeAt(0));
    appendUint8(bytes, 'a'.charCodeAt(0));
    appendUint8(bytes, 0); // path terminator
    appendUint16LE(bytes, 77); // commandId
    // missing playerMask byte

    expect(parseNetworkWrappedCommand(new Uint8Array(bytes))).toBeNull();
    expect(parseNetworkWrappedCommand(new Uint8Array())).toBeNull();
    expect(parseNetworkWrappedCommand('')).toBeNull();
  });
});
