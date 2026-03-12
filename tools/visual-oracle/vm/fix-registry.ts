#!/usr/bin/env tsx
/**
 * Fix registry entries for Generals + ZH using .reg file import.
 * Also verifies game files are present.
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
                const r = this.responseResolve;
                this.responseResolve = null;
                r(msg);
              }
            }
          } catch {}
        }
      });
      this.socket.on('error', (e) => { clearTimeout(timeout); reject(e); });
    });
  }

  async send(cmd: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.responseResolve = null; reject(new Error('timeout')); }, 60000);
      this.responseResolve = (v: any) => { clearTimeout(t); resolve(v); };
      this.socket!.write(JSON.stringify(cmd) + '\n');
    });
  }

  async hmp(command: string): Promise<string> {
    const r = await this.send({ execute: 'human-monitor-command', arguments: { 'command-line': command } });
    return r.return ?? '';
  }

  async key(k: string): Promise<void> { await this.hmp(`sendkey ${k}`); await sleep(80); }

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
    else if (ch === '>') k = 'shift-dot';
    else if (ch === '(') k = 'shift-9';
    else if (ch === ')') k = 'shift-0';
    else if (ch === '[') k = 'bracket_left';
    else if (ch === ']') k = 'bracket_right';
    else k = ch;
    await this.key(k);
  }

  async type(text: string): Promise<void> {
    for (const ch of text) await this.typeChar(ch);
  }

  async screenshot(label: string): Promise<string> {
    const outPath = path.join(SCREENSHOT_DIR, `${label}.png`);
    const ppmPath = outPath.replace('.png', '.ppm');
    await this.send({ execute: 'screendump', arguments: { filename: ppmPath } });
    await sleep(500);
    const ppmData = fs.readFileSync(ppmPath);
    const headerEnd = ppmData.indexOf(0x0a, ppmData.indexOf(0x0a, ppmData.indexOf(0x0a) + 1) + 1) + 1;
    const header = ppmData.slice(0, headerEnd).toString('ascii');
    const hdrLines = header.split('\n').filter((l: string) => !l.startsWith('#'));
    const [w, h] = hdrLines[1].split(' ').map(Number);
    const rgbData = ppmData.slice(headerEnd);
    const png = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
      png.data[i * 4] = rgbData[i * 3];
      png.data[i * 4 + 1] = rgbData[i * 3 + 1];
      png.data[i * 4 + 2] = rgbData[i * 3 + 2];
      png.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(outPath, PNG.sync.write(png));
    try { fs.unlinkSync(ppmPath); } catch {}
    console.log(`  📸 ${label}`);
    return outPath;
  }

  async saveSnapshot(name: string): Promise<void> {
    console.log(`  Saving snapshot "${name}"...`);
    const result = await this.hmp(`savevm ${name}`);
    console.log(`  Snapshot: ${result || 'ok'}`);
    await sleep(5000);
  }

  disconnect(): void { this.socket?.destroy(); }
}

async function cmd(qmp: QmpClient, text: string, waitMs = 8000): Promise<void> {
  await qmp.type(text);
  await sleep(300);
  await qmp.key('ret');
  await sleep(waitMs);
}

async function main() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('Connecting...');
  const qmp = new QmpClient();
  await qmp.connect();
  console.log('Connected');

  // Create a .reg file using echo commands
  // In .reg files, backslashes in paths need to be doubled
  // We use >> to append lines to the file
  console.log('\nCreating generals.reg file...');

  // Use a simple approach: write each line with echo
  // Note: > creates/overwrites, >> appends
  await cmd(qmp, 'echo Windows Registry Editor Version 5.00 > C:\\generals.reg');
  await cmd(qmp, 'echo. >> C:\\generals.reg');

  // Generals base game entries
  await cmd(qmp, 'echo [HKEY_LOCAL_MACHINE\\SOFTWARE\\Electronic Arts\\EA Games\\Generals] >> C:\\generals.reg');
  // For the value, we need the path with doubled backslashes in .reg format
  // But echo in cmd doesn't need escaping for backslashes
  await cmd(qmp, 'echo "InstallPath"="C:\\\\Program Files\\\\EA Games\\\\Command and Conquer Generals\\\\" >> C:\\generals.reg');
  await cmd(qmp, 'echo "Version"=dword:00010000 >> C:\\generals.reg');
  await cmd(qmp, 'echo "MapPackVersion"=dword:00010000 >> C:\\generals.reg');
  await cmd(qmp, 'echo. >> C:\\generals.reg');

  // Generals ergc key
  await cmd(qmp, 'echo [HKEY_LOCAL_MACHINE\\SOFTWARE\\Electronic Arts\\EA Games\\Generals\\ergc] >> C:\\generals.reg');
  await cmd(qmp, 'echo @="0000000000000000000000" >> C:\\generals.reg');
  await cmd(qmp, 'echo. >> C:\\generals.reg');

  // Zero Hour entries
  await cmd(qmp, 'echo [HKEY_LOCAL_MACHINE\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour] >> C:\\generals.reg');
  await cmd(qmp, 'echo "InstallPath"="C:\\\\Program Files\\\\EA Games\\\\Command and Conquer Generals Zero Hour\\\\" >> C:\\generals.reg');
  await cmd(qmp, 'echo "Version"=dword:00010000 >> C:\\generals.reg');
  await cmd(qmp, 'echo "MapPackVersion"=dword:00010000 >> C:\\generals.reg');
  await cmd(qmp, 'echo. >> C:\\generals.reg');

  // Zero Hour ergc key
  await cmd(qmp, 'echo [HKEY_LOCAL_MACHINE\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour\\ergc] >> C:\\generals.reg');
  await cmd(qmp, 'echo @="0000000000000000000000" >> C:\\generals.reg');

  await qmp.screenshot('reg-file-created');

  // View the file to verify
  console.log('Verifying .reg file...');
  await cmd(qmp, 'type C:\\generals.reg');
  await sleep(3000);
  await qmp.screenshot('reg-file-contents');

  // Import the .reg file silently
  console.log('Importing registry entries...');
  await cmd(qmp, 'regedit /s C:\\generals.reg', 10000);
  await qmp.screenshot('reg-imported');

  // Verify by querying the registry
  console.log('Verifying registry...');
  await cmd(qmp, 'reg query "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals"');
  await qmp.screenshot('reg-verify-gen');
  await cmd(qmp, 'reg query "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour"');
  await qmp.screenshot('reg-verify-zh');

  // Verify game files
  console.log('\nVerifying game files...');
  await cmd(qmp, 'dir "C:\\Program Files\\EA Games\\Command and Conquer Generals\\generals.exe"');
  await cmd(qmp, 'dir "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\generals.exe"');
  await qmp.screenshot('verify-files');

  // Save snapshot
  console.log('\nSaving snapshot...');
  await qmp.saveSnapshot('generals-installed');
  await qmp.screenshot('final');

  console.log('\n✓ Registry entries created, snapshot saved!');
  qmp.disconnect();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
