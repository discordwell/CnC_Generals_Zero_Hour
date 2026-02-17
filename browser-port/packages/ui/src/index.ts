/**
 * @generals/ui
 *
 * Browser-side UI runtime used by the app shell. Keeps a small overlay for
 * status messages and selected-object text while the full ControlBar port is
 * implemented in later phases.
 */
import type { Subsystem } from '@generals/engine';

export class UiRuntime implements Subsystem {
  readonly name = '@generals/ui';

  private root: HTMLElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private messageNode: HTMLDivElement | null = null;
  private selectedNode: HTMLDivElement | null = null;
  private debugNode: HTMLDivElement | null = null;
  private messageTimeout: ReturnType<typeof setTimeout> | null = null;
  private selectedText = '';
  private debugEnabled = false;
  private containerWidth = 0;
  private containerHeight = 0;

  constructor(options: UiRuntimeOptions = {}) {
    this.debugEnabled = options.enableDebugOverlay ?? false;
  }

  init(_root?: HTMLElement | null): void {
    if (typeof document === 'undefined') {
      return;
    }

    const root = _root ?? document.body;
    if (!root) {
      return;
    }

    this.root = root;
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'z-index: 10',
      'pointer-events: none',
      'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      'font-size: 13px',
      'color: #e8ecff',
      'text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75)',
    ].join(';');

    this.selectedNode = document.createElement('div');
    this.selectedNode.style.cssText = [
      'position: absolute',
      'left: 12px',
      'bottom: 80px',
      'background: rgba(12, 20, 36, 0.58)',
      'border: 1px solid rgba(168, 178, 198, 0.35)',
      'padding: 6px 9px',
      'max-width: 55ch',
    ].join(';');
    this.selectedNode.textContent = 'Selected: <none>';

    this.messageNode = document.createElement('div');
    this.messageNode.style.cssText = [
      'position: absolute',
      'left: 50%',
      'transform: translateX(-50%)',
      'top: 12px',
      'background: rgba(20, 20, 20, 0.74)',
      'border: 1px solid rgba(255, 255, 255, 0.22)',
      'padding: 6px 10px',
      'max-width: 80ch',
      'text-align: center',
      'display: none',
    ].join(';');

    this.overlay.append(this.selectedNode, this.messageNode);

    if (this.debugEnabled) {
      this.debugNode = document.createElement('div');
      this.debugNode.style.cssText = [
        'position: absolute',
        'left: 12px',
        'top: 12px',
        'background: rgba(0, 0, 0, 0.42)',
        'border: 1px solid rgba(0, 0, 0, 0.5)',
        'padding: 6px 10px',
      ].join(';');
      this.debugNode.textContent = 'Debug overlay enabled';
      this.overlay.append(this.debugNode);
    }

    this.root.appendChild(this.overlay);
    this.containerWidth = this.root.clientWidth;
    this.containerHeight = this.root.clientHeight;
    this.resize(this.containerWidth, this.containerHeight);
  }

  update(_deltaMs = 16): void {
    void _deltaMs;
    if (!this.overlay || !this.messageNode || !this.selectedNode) {
      return;
    }
    this.selectedNode.textContent = `Selected: ${this.selectedText || '<none>'}`;
    if (this.debugNode && this.debugEnabled) {
      this.debugNode.textContent = `UI runtime active • ${new Date().toLocaleTimeString()}`;
    }
  }

  reset(): void {
    this.selectedText = '';
    this.showMessage('');
  }

  dispose(): void {
    if (this.messageTimeout !== null) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
    if (this.overlay && this.root) {
      this.root.removeChild(this.overlay);
    }
    this.overlay = null;
    this.messageNode = null;
    this.selectedNode = null;
    this.debugNode = null;
    this.root = null;
    this.selectedText = '';
  }

  resize(_width = 0, _height = 0): void {
    if (!this.overlay || !this.messageNode || !this.selectedNode || !_width || !_height) {
      return;
    }

    this.containerWidth = _width;
    this.containerHeight = _height;
    const safeWidth = Math.max(1, _width);
    const safeHeight = Math.max(1, _height);
    const selectedWidth = Math.min(Math.floor(safeWidth * 0.55), 64 * 16);

    this.overlay.style.width = `${safeWidth}px`;
    this.overlay.style.height = `${safeHeight}px`;
    this.selectedNode.style.maxWidth = `${selectedWidth}px`;
    this.messageNode.style.maxWidth = `${Math.min(Math.floor(safeWidth * 0.85), 120 * 16)}px`;

    const wireframePadding = this.debugEnabled ? 24 : 12;
    if (this.debugNode) {
      this.debugNode.style.top = `${wireframePadding}px`;
      this.debugNode.style.maxWidth = `${Math.min(Math.floor(safeWidth * 0.45), 64 * 16)}px`;
      this.debugNode.style.wordBreak = 'break-word';
      this.debugNode.style.lineHeight = '1.2';
    }

    this.selectedNode.style.left = `${12}px`;
    this.selectedNode.style.bottom = `${Math.max(40, Math.floor(safeHeight * 0.05))}px`;
  }

  showMessage(message: string): void {
    if (!this.messageNode) {
      return;
    }

    if (this.messageTimeout !== null) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }

    if (!message) {
      this.messageNode.style.display = 'none';
      return;
    }

    this.messageNode.textContent = message;
    this.messageNode.style.display = 'block';
    this.messageTimeout = setTimeout(() => {
      if (this.messageNode) {
        this.messageNode.style.display = 'none';
      }
      this.messageTimeout = null;
    }, 4000);
  }

  clearMessage(): void {
    if (!this.messageNode) {
      return;
    }
    if (this.messageTimeout !== null) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
    this.messageNode.style.display = 'none';
    this.messageNode.textContent = '';
  }

  getState(): string {
    return this.selectedText;
  }

  setSelectedObjectName(name: string | null): void {
    this.selectedText = name ?? '';
  }
}

export function initializeUiOverlay(): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.body) {
    document.body.dataset.generalsUiOverlay = 'ready';
  }
}

export interface UiRuntimeOptions {
  enableDebugOverlay?: boolean;
}
