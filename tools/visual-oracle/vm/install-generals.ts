#!/usr/bin/env tsx
/**
 * Automated Generals + Zero Hour installation via file copy (bypasses installer).
 *
 * Strategy:
 * 1. Boot VM with pre-extracted game files ISO as CD
 * 2. Dismiss Windows startup dialogs via keyboard
 * 3. Open cmd.exe and xcopy game files from D:\ to C:\Program Files\EA Games\...
 * 4. Create registry entries via reg.exe
 * 5. Swap CD to ZH ISO, repeat
 * 6. Save snapshot
 *
 * Prerequisites:
 *   - Game files extracted from MSI+cab on macOS via msiextract/cabextract
 *   - Game ISOs created: /tmp/generals-game.iso, /tmp/zh-game.iso
 *   - VM booted with generals-game.iso as CD
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const QMP_SOCK = '/tmp/generals-zh-qmp.sock';
const SCREENSHOT_DIR = '/tmp/generals-install';

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
      const timeout = setTimeout(() => reject(new Error('QMP timeout')), 15000);

      this.socket.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.QMP && !greeted) {
              greeted = true;
              this.socket!.write('{"execute":"qmp_capabilities"}\n');
              capSent = true;
            } else if (msg.return !== undefined && capSent && !this.ready) {
              this.ready = true;
              clearTimeout(timeout);
              resolve();
            } else if (msg.return !== undefined || msg.error !== undefined) {
              if (this.responseResolve) {
                this.responseResolve(msg);
                this.responseResolve = null;
              }
            }
          } catch { /* ignore parse errors */ }
        }
      });

      this.socket.on('error', (e) => {
        clearTimeout(timeout);
        reject(e);
      });
    });
  }

  async send(cmd: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (this.responseResolve) {
          this.responseResolve = null;
          reject(new Error(`QMP timeout: ${cmd.execute}`));
        }
      }, 60000);
      this.responseResolve = (v: any) => { clearTimeout(t); resolve(v); };
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

  async key(k: string): Promise<void> {
    await this.hmp(`sendkey ${k}`);
    await sleep(80);
  }

  async typeChar(ch: string): Promise<void> {
    let k: string;
    if (ch >= 'a' && ch <= 'z') k = ch;
    else if (ch >= 'A' && ch <= 'Z') k = `shift-${ch.toLowerCase()}`;
    else if (ch >= '0' && ch <= '9') k = ch;
    else if (ch === '\\') k = 'backslash';
    else if (ch === ':') k = 'shift-semicolon';
    else if (ch === '.') k = 'dot';
    else if (ch === '/') k = 'slash';
    else if (ch === ' ') k = 'spc';
    else if (ch === '-') k = 'minus';
    else if (ch === '"') k = 'shift-apostrophe';
    else if (ch === '=') k = 'equal';
    else if (ch === ',') k = 'comma';
    else k = ch;
    await this.key(k);
  }

  async type(text: string): Promise<void> {
    for (const ch of text) {
      await this.typeChar(ch);
    }
  }

  async screenshot(label: string): Promise<string> {
    const pngPath = path.join(SCREENSHOT_DIR, `${label}.png`);
    const ppmPath = pngPath.replace('.png', '.ppm');
    await this.send({ execute: 'screendump', arguments: { filename: ppmPath } });
    await sleep(500);

    const ppmData = fs.readFileSync(ppmPath);
    const headerEnd = ppmData.indexOf(0x0a, ppmData.indexOf(0x0a, ppmData.indexOf(0x0a) + 1) + 1) + 1;
    const header = ppmData.slice(0, headerEnd).toString('ascii');
    const dims = header.split('\n').filter((l: string) => !l.startsWith('#'));
    const [w, h] = dims[1].split(' ').map(Number);
    const rgbData = ppmData.slice(headerEnd);

    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
      png.data[i * 4] = rgbData[i * 3];
      png.data[i * 4 + 1] = rgbData[i * 3 + 1];
      png.data[i * 4 + 2] = rgbData[i * 3 + 2];
      png.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(pngPath, PNG.sync.write(png));
    try { fs.unlinkSync(ppmPath); } catch {}
    console.log(`  📸 ${label}`);
    return pngPath;
  }

  async changeCD(isoPath: string): Promise<void> {
    await this.hmp(`change ide1-cd0 ${isoPath}`);
  }

  async saveSnapshot(name: string): Promise<void> {
    console.log(`  Saving snapshot "${name}"...`);
    const result = await this.hmp(`savevm ${name}`);
    console.log(`  Snapshot result: ${result || 'ok'}`);
    await sleep(5000);
  }

  disconnect(): void {
    this.socket?.destroy();
  }
}

let qmp: QmpClient;

async function waitForBrightScreen(label: string, threshold = 0.3, maxChecks = 60): Promise<void> {
  for (let i = 0; i < maxChecks; i++) {
    await sleep(5000);
    const p = await qmp.screenshot(`${label}-${i}`);
    const png = PNG.sync.read(fs.readFileSync(p));
    let bright = 0;
    for (let j = 0; j < png.width * png.height; j++) {
      if (png.data[j * 4] > 30 || png.data[j * 4 + 1] > 30 || png.data[j * 4 + 2] > 30) bright++;
    }
    const pct = bright / (png.width * png.height);
    if (i % 6 === 0) console.log(`  ${label} check ${i}: ${(pct * 100).toFixed(0)}% bright`);
    if (pct > threshold) return;
  }
  throw new Error(`Screen didn't become bright within ${maxChecks * 5}s`);
}

/** Type a command and press Enter */
async function cmd(text: string): Promise<void> {
  await qmp.type(text);
  await sleep(300);
  await qmp.key('ret');
}

/** Wait for a long-running cmd operation by polling screenshots.
 *  When the cmd prompt reappears (C:\), we know it's done.
 *  We detect this by checking for a mostly-black screen with white text at bottom
 *  (the cmd window) rather than the progress output. */
async function waitForCmdComplete(label: string, maxChecks = 180): Promise<void> {
  for (let i = 0; i < maxChecks; i++) {
    await sleep(10000);
    if (i % 6 === 0) {
      await qmp.screenshot(`${label}-${i}`);
      console.log(`  ${Math.floor(i * 10 / 60)}m ${(i * 10) % 60}s elapsed...`);
    }
  }
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Connect to already-running VM
  console.log('Connecting to QMP...');
  qmp = new QmpClient();
  await qmp.connect();
  console.log('QMP connected');

  // Wait for desktop
  console.log('Waiting for Windows desktop...');
  await waitForBrightScreen('boot');
  await sleep(15000);
  await qmp.screenshot('desktop-loaded');

  // === Dismiss startup dialogs ===
  // Win10 base: may have "Found New Hardware" wizard or other popups
  console.log('Dismissing any startup dialogs...');
  for (let i = 0; i < 5; i++) {
    await qmp.key('alt-f4');
    await sleep(3000);
  }
  // Also press Escape in case of any remaining dialogs
  await qmp.key('esc');
  await sleep(2000);
  await qmp.screenshot('desktop-clean');

  // === Open cmd.exe via Win+R ===
  console.log('\n=== Opening command prompt ===');
  await qmp.key('meta_l-r');
  await sleep(5000);
  await qmp.key('ctrl-a');
  await sleep(200);
  await qmp.type('cmd');
  await sleep(500);
  await qmp.key('ret');
  await sleep(10000);
  await qmp.screenshot('cmd-opened');

  // === Install C&C Generals (xcopy from ISO) ===
  console.log('\n=== Installing C&C Generals via xcopy ===');

  // Create install directory
  await cmd('mkdir "C:\\Program Files\\EA Games\\Command and Conquer Generals"');
  await sleep(5000);

  // Copy all game files from D:\ (ISO) to install directory
  // Chain with 'echo XCOPY_DONE' so we can detect completion
  console.log('Copying Generals files from CD...');
  await cmd('xcopy D:\\ "C:\\Program Files\\EA Games\\Command and Conquer Generals\\" /E /Y /Q && echo XCOPY_DONE');

  // Wait for copy to complete by monitoring screenshots
  console.log('Waiting for file copy to complete (1.6GB under TCG)...');
  await waitForCmdComplete('gen-copy', 300);
  await qmp.screenshot('gen-copy-done');

  // Create Generals registry entries
  console.log('Creating Generals registry entries...');
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals" /v InstallPath /t REG_SZ /d "C:\\Program Files\\EA Games\\Command and Conquer Generals\\" /f');
  await sleep(5000);
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals" /v Version /t REG_DWORD /d 65536 /f');
  await sleep(5000);
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals" /v MapPackVersion /t REG_DWORD /d 65536 /f');
  await sleep(5000);
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals\\ergc" /ve /t REG_SZ /d "0000000000000000000000" /f');
  await sleep(5000);
  await qmp.screenshot('gen-registry-done');

  // === Install Zero Hour ===
  console.log('\n=== Installing Zero Hour via xcopy ===');

  // Switch CD to ZH ISO
  console.log('Switching CD to Zero Hour ISO...');
  await qmp.changeCD('/tmp/zh-game.iso');
  await sleep(5000);

  // Create ZH directory
  await cmd('mkdir "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour"');
  await sleep(5000);

  // Copy ZH files
  console.log('Copying Zero Hour files...');
  await cmd('xcopy D:\\ "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\" /E /Y /Q && echo XCOPY_DONE');

  // Wait for copy (1.2GB)
  console.log('Waiting for ZH copy (1.2GB under TCG)...');
  await waitForCmdComplete('zh-copy', 300);
  await qmp.screenshot('zh-copy-done');

  // Create ZH registry entries
  console.log('Creating Zero Hour registry entries...');
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour" /v InstallPath /t REG_SZ /d "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\" /f');
  await sleep(5000);
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour" /v Version /t REG_DWORD /d 65536 /f');
  await sleep(5000);
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour" /v MapPackVersion /t REG_DWORD /d 65536 /f');
  await sleep(5000);
  await cmd('reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour\\ergc" /ve /t REG_SZ /d "0000000000000000000000" /f');
  await sleep(5000);
  await qmp.screenshot('zh-registry-done');

  // Verify installation
  console.log('\nVerifying installation...');
  await cmd('dir "C:\\Program Files\\EA Games\\Command and Conquer Generals\\generals.exe"');
  await sleep(5000);
  await cmd('dir "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\generals.exe"');
  await sleep(5000);
  await qmp.screenshot('verify');

  // === Save snapshot ===
  console.log('\n=== Saving snapshot ===');
  await qmp.saveSnapshot('generals-installed');
  await qmp.screenshot('final');

  console.log('\n✓ Generals + Zero Hour installed!');
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  console.log('VM running on VNC :1 (localhost:5901)');

  qmp.disconnect();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
