import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');

export const QEMU_CONFIG = {
  /** QEMU binary — x86_64 supports both 32-bit and 64-bit guests. */
  binary: 'qemu-system-i386',
  /** VM disk image with Windows + Generals ZH installed. */
  diskImage: path.join(ROOT, 'tools/visual-oracle/vm/generals-win10.qcow2'),
  memory: '4G',
  /**
   * Display adapter. vmware (vmsvga) is the best for Windows guests —
   * supports dynamic resolution and has good driver support in Win10.
   * CRITICAL: Must match what was used when the snapshot was saved.
   */
  display: 'vmware',
  /** CPU model. Conroe (Core 2 Duo) provides SSE2/SSE3, compatible with Generals. */
  cpu: 'Conroe',
  audio: 'intel-hda',
  qmpSocket: '/tmp/generals-zh-qmp.sock',
  /** Windows desktop resolution. */
  resolution: { width: 1024, height: 768 },
  /** Generals in-game resolution (800x600 is the default, most compatible). */
  gameResolution: { width: 800, height: 600 },
  cdrom: null as string | null,
  bootTimeout: 120_000,
  screenshotDir: path.join(ROOT, 'artifacts/visual-oracle/captures'),
  /** Snapshot name for instant boot to desktop. null = cold boot. */
  snapshotName: 'desktop-ready' as string | null,
  /** VNC display — required for QMP input events to reach the guest. */
  vncDisplay: ':1',
  portForwards: [] as Array<{ host: number; guest: number }>,

  // ── Generals-Specific Paths ──
  /** Path to Generals Zero Hour install dir inside the VM. */
  gameInstallDir: 'C:\\Program Files\\EA Games\\Command & Conquer Generals Zero Hour',
  /** Path to the game executable inside the VM. */
  gameExe: 'C:\\Program Files\\EA Games\\Command & Conquer Generals Zero Hour\\game.dat',
  /** Path to Generals base game (needed for ZH). */
  baseGameDir: 'C:\\Program Files\\EA Games\\Command & Conquer Generals',
};
