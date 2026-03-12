#!/usr/bin/env tsx
/**
 * Quick VM interaction helper — sends mouse/keyboard commands via QMP.
 * Usage:
 *   npx tsx interact.ts click <x> <y>        — Left click at screen coords (800x600)
 *   npx tsx interact.ts rclick <x> <y>       — Right click
 *   npx tsx interact.ts key <keyname>         — Send key (e.g. esc, ret, tab)
 *   npx tsx interact.ts type <text>           — Type text string
 *   npx tsx interact.ts screenshot [out.png]  — Capture screenshot
 *   npx tsx interact.ts dclick <x> <y>       — Double click
 */

import net from 'node:net';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const QMP_SOCK = '/tmp/generals-zh-qmp.sock';
const SCREEN_W = 800;
const SCREEN_H = 600;

class QmpClient {
  private socket: net.Socket | null = null;
  private buffer = '';
  private responseResolve: ((v: any) => void) | null = null;
  private ready = false;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(QMP_SOCK);
      let greeted = false;
      let capSent = false;

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line);

          if (msg.QMP && !greeted) {
            greeted = true;
            // Send capabilities
            this.socket!.write('{"execute":"qmp_capabilities"}\n');
            capSent = true;
          } else if (msg.return !== undefined && capSent && !this.ready) {
            this.ready = true;
            resolve();
          } else if (msg.return !== undefined || msg.error !== undefined) {
            if (this.responseResolve) {
              this.responseResolve(msg);
              this.responseResolve = null;
            }
          }
          // Ignore events
        }
      });

      this.socket.on('error', reject);
    });
  }

  async send(cmd: Record<string, any>): Promise<any> {
    return new Promise((resolve) => {
      this.responseResolve = resolve;
      this.socket!.write(JSON.stringify(cmd) + '\n');
    });
  }

  async hmp(command: string): Promise<string> {
    const result = await this.send({
      execute: 'human-monitor-command',
      arguments: { 'command-line': command },
    });
    return result.return ?? '';
  }

  async mouseMove(x: number, y: number): Promise<void> {
    const absX = Math.round((x / SCREEN_W) * 32767);
    const absY = Math.round((y / SCREEN_H) * 32767);
    await this.send({
      execute: 'input-send-event',
      arguments: {
        events: [
          { type: 'abs', data: { axis: 'x', value: absX } },
          { type: 'abs', data: { axis: 'y', value: absY } },
        ],
      },
    });
  }

  async click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
    const absX = Math.round((x / SCREEN_W) * 32767);
    const absY = Math.round((y / SCREEN_H) * 32767);
    // Send position + button down in one event batch (USB tablet)
    await this.send({
      execute: 'input-send-event',
      arguments: {
        events: [
          { type: 'abs', data: { axis: 'x', value: absX } },
          { type: 'abs', data: { axis: 'y', value: absY } },
          { type: 'btn', data: { down: true, button } },
        ],
      },
    });
    await sleep(100);
    // Release button
    await this.send({
      execute: 'input-send-event',
      arguments: {
        events: [
          { type: 'btn', data: { down: false, button } },
        ],
      },
    });
  }

  async doubleClick(x: number, y: number): Promise<void> {
    await this.click(x, y);
    await sleep(100);
    await this.click(x, y);
  }

  async sendKey(keys: string[]): Promise<void> {
    const keyStr = keys.join('-');
    await this.hmp(`sendkey ${keyStr}`);
  }

  async typeText(text: string): Promise<void> {
    const keyMap: Record<string, string> = {
      ' ': 'spc', '.': 'dot', '/': 'slash', '\\': 'backslash',
      ':': 'shift-semicolon', '-': 'minus', '_': 'shift-minus',
      '=': 'equal', '+': 'shift-equal', ',': 'comma',
      ';': 'semicolon', "'": 'apostrophe', '"': 'shift-apostrophe',
      '[': 'bracket_left', ']': 'bracket_right',
      '(': 'shift-9', ')': 'shift-0',
      '!': 'shift-1', '@': 'shift-2', '#': 'shift-3',
      '$': 'shift-4', '%': 'shift-5', '^': 'shift-6',
      '&': 'shift-7', '*': 'shift-8',
      '\n': 'ret', '\t': 'tab',
    };

    for (const ch of text) {
      let key: string;
      if (ch >= 'a' && ch <= 'z') key = ch;
      else if (ch >= 'A' && ch <= 'Z') key = `shift-${ch.toLowerCase()}`;
      else if (ch >= '0' && ch <= '9') key = ch;
      else key = keyMap[ch] ?? ch;

      await this.hmp(`sendkey ${key}`);
      await sleep(30);
    }
  }

  async screenshot(outPath: string): Promise<Buffer> {
    const ppmPath = outPath.replace('.png', '.ppm');
    await this.send({
      execute: 'screendump',
      arguments: { filename: ppmPath },
    });
    await sleep(500);

    const ppmData = fs.readFileSync(ppmPath);
    const headerEnd = ppmData.indexOf(0x0a, ppmData.indexOf(0x0a, ppmData.indexOf(0x0a) + 1) + 1) + 1;
    const header = ppmData.slice(0, headerEnd).toString('ascii');
    const lines = header.split('\n').filter((l: string) => !l.startsWith('#'));
    const [w, h] = lines[1].split(' ').map(Number);
    const rgbData = ppmData.slice(headerEnd);

    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
      png.data[i * 4] = rgbData[i * 3];
      png.data[i * 4 + 1] = rgbData[i * 3 + 1];
      png.data[i * 4 + 2] = rgbData[i * 3 + 2];
      png.data[i * 4 + 3] = 255;
    }
    const buf = PNG.sync.write(png);
    fs.writeFileSync(outPath, buf);
    fs.unlinkSync(ppmPath);
    return buf;
  }

  async changeCD(isoPath: string): Promise<void> {
    await this.hmp(`change ide1-cd0 ${isoPath}`);
  }

  disconnect(): void {
    this.socket?.destroy();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const qmp = new QmpClient();
  await qmp.connect();

  try {
    switch (cmd) {
      case 'click':
        await qmp.click(Number(args[0]), Number(args[1]));
        console.log(`Clicked (${args[0]}, ${args[1]})`);
        break;

      case 'rclick':
        await qmp.click(Number(args[0]), Number(args[1]), 'right');
        console.log(`Right-clicked (${args[0]}, ${args[1]})`);
        break;

      case 'dclick':
        await qmp.doubleClick(Number(args[0]), Number(args[1]));
        console.log(`Double-clicked (${args[0]}, ${args[1]})`);
        break;

      case 'key':
        await qmp.sendKey(args);
        console.log(`Sent key: ${args.join('+')}`);
        break;

      case 'type':
        await qmp.typeText(args.join(' '));
        console.log(`Typed: ${args.join(' ')}`);
        break;

      case 'screenshot': {
        const out = args[0] ?? '/tmp/generals-vm-screen.png';
        await qmp.screenshot(out);
        console.log(`Screenshot: ${out}`);
        break;
      }

      case 'cd':
        await qmp.changeCD(args[0]);
        console.log(`Changed CD to: ${args[0]}`);
        break;

      default:
        console.log('Usage: interact.ts <click|rclick|dclick|key|type|screenshot|cd> [args]');
    }
  } finally {
    qmp.disconnect();
  }
}

main().catch(console.error);
