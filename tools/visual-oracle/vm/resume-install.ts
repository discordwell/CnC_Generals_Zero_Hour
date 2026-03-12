#!/usr/bin/env tsx
/**
 * Resume installation: Generals xcopy is done, cmd.exe is open.
 * Do: registry entries, ZH xcopy, ZH registry, save snapshot.
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

  async changeCD(isoPath: string): Promise<void> { await this.hmp(`change ide1-cd0 ${isoPath}`); }

  async saveSnapshot(name: string): Promise<void> {
    console.log(`  Saving snapshot "${name}"...`);
    const result = await this.hmp(`savevm ${name}`);
    console.log(`  Snapshot: ${result || 'ok'}`);
    await sleep(5000);
  }

  disconnect(): void { this.socket?.destroy(); }
}

/** Type a command and press Enter, wait for it to complete */
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

  await qmp.screenshot('resume-start');

  // === Generals registry entries ===
  console.log('\n[1/6] Creating Generals registry entries...');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals" /v InstallPath /t REG_SZ /d "C:\\Program Files\\EA Games\\Command and Conquer Generals\\" /f');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals" /v Version /t REG_DWORD /d 65536 /f');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals" /v MapPackVersion /t REG_DWORD /d 65536 /f');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Generals\\ergc" /ve /t REG_SZ /d "0000000000000000000000" /f');
  await qmp.screenshot('gen-registry-done');
  console.log('  Done');

  // === Switch CD to Zero Hour ===
  console.log('\n[2/6] Switching CD to Zero Hour...');
  await qmp.changeCD('/tmp/zh-game.iso');
  await sleep(5000);

  // === Create ZH directory ===
  console.log('[3/6] Creating ZH directory...');
  await cmd(qmp, 'mkdir "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour"');

  // === Copy ZH files ===
  console.log('[4/6] Copying Zero Hour files...');
  await cmd(qmp, 'xcopy D:\\ "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\" /E /Y /Q', 3000);

  // Wait for xcopy - it was instant for Generals, should be similar
  // But take screenshots to verify
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    if (i % 6 === 0) {
      await qmp.screenshot(`zh-copy-${i}`);
      console.log(`  Waiting... ${i * 5}s`);
    }
  }
  await qmp.screenshot('zh-copy-done');

  // === ZH registry entries ===
  console.log('\n[5/6] Creating Zero Hour registry entries...');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour" /v InstallPath /t REG_SZ /d "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\" /f');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour" /v Version /t REG_DWORD /d 65536 /f');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour" /v MapPackVersion /t REG_DWORD /d 65536 /f');
  await cmd(qmp, 'reg add "HKLM\\SOFTWARE\\Electronic Arts\\EA Games\\Command and Conquer Generals Zero Hour\\ergc" /ve /t REG_SZ /d "0000000000000000000000" /f');
  await qmp.screenshot('zh-registry-done');
  console.log('  Done');

  // === Verify ===
  console.log('\n[6/6] Verifying...');
  await cmd(qmp, 'dir "C:\\Program Files\\EA Games\\Command and Conquer Generals\\generals.exe"');
  await cmd(qmp, 'dir "C:\\Program Files\\EA Games\\Command and Conquer Generals Zero Hour\\generals.exe"');
  await qmp.screenshot('verify');

  // === Save snapshot ===
  console.log('\nSaving snapshot...');
  await qmp.saveSnapshot('generals-installed');
  await qmp.screenshot('final');

  console.log('\n✓ Generals + Zero Hour installed!');
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  qmp.disconnect();
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
