#!/usr/bin/env tsx
/**
 * Enter the Generals serial key into the installer.
 * Uses a single persistent QMP connection to avoid focus issues.
 */

import net from 'node:net';
import fs from 'node:fs';
import { PNG } from 'pngjs';

const QMP_SOCK = '/tmp/generals-zh-qmp.sock';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

  async sendKey(key: string): Promise<void> {
    await this.hmp(`sendkey ${key}`);
  }

  async typeDigit(digit: string): Promise<void> {
    await this.sendKey(digit);
    await sleep(80); // slow enough for TCG to process
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
    fs.writeFileSync(outPath, PNG.sync.write(png));
    fs.unlinkSync(ppmPath);
    console.log(`Screenshot: ${outPath}`);
  }

  disconnect(): void {
    this.socket?.destroy();
  }
}

async function main() {
  const qmp = new QmpClient();
  await qmp.connect();
  console.log('Connected to QMP');

  // Step 1: Take initial screenshot
  await qmp.screenshot('/tmp/gen-key-0.png');

  // Step 2: Close Task Manager and CMD first to simplify window management
  // Press Ctrl+Shift+Esc to ensure Task Manager has focus, then close it
  // Actually, let's just close ALL windows except the installer

  // Close cmd: Alt+F4 (cycle to it first)
  // Better approach: just use the installer's own keyboard shortcuts

  // Step 2: Alt+Tab to make sure CD Serial Number Request dialog has focus
  // The installer's serial key dialog should be a specific window
  // Try clicking on the CD Serial Number taskbar button by navigating taskbar

  // Approach: Use Win+Tab to cycle through task bar items
  // Or just close everything and relaunch the installer

  // Actually simplest: kill everything and start fresh
  console.log('Closing all windows...');

  // Send multiple Alt+F4s with waits to close windows
  for (let i = 0; i < 10; i++) {
    await qmp.sendKey('alt-f4');
    await sleep(500);
    // If a "confirm close" dialog appears, press Enter/Yes
    await qmp.sendKey('ret');
    await sleep(1000);
  }

  await sleep(5000);
  await qmp.screenshot('/tmp/gen-key-1.png');
  console.log('Took screenshot after closing windows');

  // Step 3: Open Run dialog and launch installer
  console.log('Opening Run dialog...');
  await qmp.sendKey('meta_l-r');
  await sleep(5000);

  await qmp.screenshot('/tmp/gen-key-2.png');

  // Type the installer path
  console.log('Typing installer path...');
  const path = 'D:\\setup.exe';
  for (const ch of path) {
    let key: string;
    if (ch === '\\') key = 'backslash';
    else if (ch === ':') key = 'shift-semicolon';
    else if (ch === '.') key = 'dot';
    else if (ch >= 'a' && ch <= 'z') key = ch;
    else if (ch >= 'A' && ch <= 'Z') key = `shift-${ch.toLowerCase()}`;
    else key = ch;
    await qmp.sendKey(key);
    await sleep(50);
  }

  await sleep(1000);
  await qmp.sendKey('ret');
  console.log('Launched installer. Waiting for it to load...');

  // Wait for installer to start and show the welcome screen
  await sleep(120000); // 2 minutes for InstallShield to prepare

  await qmp.screenshot('/tmp/gen-key-3.png');

  // Click Next on welcome screen
  console.log('Pressing Next on welcome screen...');
  await qmp.sendKey('ret');
  await sleep(30000); // Wait for key entry dialog

  await qmp.screenshot('/tmp/gen-key-4.png');

  // Now the serial key dialog should be focused
  // Type the key: 1531-3432190-7624832-4839
  console.log('Entering serial key...');

  // The fields should auto-advance: 4-7-7-4
  const keyDigits = '1531343219076248324839';
  for (const digit of keyDigits) {
    await qmp.typeDigit(digit);
  }

  await sleep(2000);
  await qmp.screenshot('/tmp/gen-key-5.png');

  // Press Enter to submit
  console.log('Submitting key...');
  await qmp.sendKey('ret');
  await sleep(10000);

  await qmp.screenshot('/tmp/gen-key-6.png');

  console.log('Done. Check screenshots in /tmp/gen-key-*.png');
  qmp.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
