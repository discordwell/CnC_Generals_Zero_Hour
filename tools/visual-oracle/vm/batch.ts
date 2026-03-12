#!/usr/bin/env tsx
/**
 * Batch VM interaction script — runs multiple commands in one invocation.
 * Reduces API rate limit issues by batching operations.
 *
 * Usage:
 *   npx tsx batch.ts <script-file>    — Run commands from file
 *   npx tsx batch.ts -c "cmd1;cmd2"   — Run inline commands separated by ;
 *
 * Command format (one per line or separated by ;):
 *   type <text>           — Type text into VM
 *   key <keyname>         — Send key
 *   click <x> <y>        — Left click
 *   screenshot <path>    — Take screenshot
 *   cd <iso-path>        — Change CD
 *   sleep <ms>           — Wait
 *   wait <seconds>       — Wait (in seconds, for readability)
 *   # comment            — Ignored
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

  async click(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
    const absX = Math.round((x / SCREEN_W) * 32767);
    const absY = Math.round((y / SCREEN_H) * 32767);
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
    await this.send({
      execute: 'input-send-event',
      arguments: {
        events: [
          { type: 'btn', data: { down: false, button } },
        ],
      },
    });
  }

  async sendKey(keys: string[]): Promise<void> {
    await this.hmp(`sendkey ${keys.join('-')}`);
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
      '>': 'shift-dot', '<': 'shift-comma',
      '|': 'shift-backslash', '`': 'grave_accent',
      '~': 'shift-grave_accent', '{': 'shift-bracket_left',
      '}': 'shift-bracket_right', '?': 'shift-slash',
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

  async screenshot(outPath: string): Promise<void> {
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

async function runBatch(commands: string[]) {
  const qmp = new QmpClient();
  await qmp.connect();
  console.log('Connected to QMP');

  try {
    for (const rawCmd of commands) {
      const cmd = rawCmd.trim();
      if (!cmd || cmd.startsWith('#')) continue;

      const parts = cmd.split(/\s+/);
      const op = parts[0];
      const args = parts.slice(1);

      switch (op) {
        case 'type':
          const text = cmd.substring(cmd.indexOf(' ') + 1);
          await qmp.typeText(text);
          console.log(`[type] ${text}`);
          break;

        case 'key':
          await qmp.sendKey(args);
          console.log(`[key] ${args.join('+')}`);
          break;

        case 'enter':
          await qmp.typeText(cmd.substring(cmd.indexOf(' ') + 1));
          await sleep(200);
          await qmp.sendKey(['ret']);
          console.log(`[enter] ${cmd.substring(cmd.indexOf(' ') + 1)}`);
          break;

        case 'click':
          await qmp.click(Number(args[0]), Number(args[1]));
          console.log(`[click] (${args[0]}, ${args[1]})`);
          break;

        case 'screenshot':
          await qmp.screenshot(args[0]);
          console.log(`[screenshot] ${args[0]}`);
          break;

        case 'cd':
          await qmp.changeCD(args[0]);
          console.log(`[cd] ${args[0]}`);
          break;

        case 'sleep':
          await sleep(Number(args[0]));
          console.log(`[sleep] ${args[0]}ms`);
          break;

        case 'wait':
          const secs = Number(args[0]);
          await sleep(secs * 1000);
          console.log(`[wait] ${secs}s`);
          break;

        default:
          console.log(`[unknown] ${cmd}`);
      }
    }
  } finally {
    qmp.disconnect();
  }
}

async function main() {
  let commands: string[];

  if (process.argv[2] === '-c') {
    commands = process.argv.slice(3).join(' ').split(';');
  } else if (process.argv[2]) {
    const content = fs.readFileSync(process.argv[2], 'utf-8');
    commands = content.split('\n');
  } else {
    console.log('Usage: batch.ts <script-file> | batch.ts -c "cmd1;cmd2"');
    process.exit(1);
  }

  await runBatch(commands);
}

main().catch(console.error);
