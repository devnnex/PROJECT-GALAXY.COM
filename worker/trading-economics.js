import WebSocket from 'ws';
import { log } from './logger.js';

export const RECONNECT_BACKOFF_MS = Object.freeze([1000, 2000, 4000, 8000, 15000, 30000]);

export class TradingEconomicsClient {
  constructor(config, handlers = {}) {
    this.config = config; this.handlers = handlers; this.socket = null; this.closed = false; this.attempt = 0; this.reconnectCount = 0;
    this.connectionTimer = null; this.healthTimer = null; this.lastKeepaliveAt = 0;
  }

  start() { this.closed = false; this.connect(); }

  connect() {
    if (this.closed) return;
    const separator = this.config.websocketUrl.includes('?') ? '&' : '?';
    const url = `${this.config.websocketUrl}${separator}client=${encodeURIComponent(this.config.clientKey)}:${encodeURIComponent(this.config.clientSecret)}`;
    const socket = new WebSocket(url, { handshakeTimeout: this.config.connectionTimeoutMs }); this.socket = socket;
    this.connectionTimer = setTimeout(() => socket.terminate(), this.config.connectionTimeoutMs);
    socket.on('open', async () => {
      clearTimeout(this.connectionTimer); this.attempt = 0; this.lastKeepaliveAt = Date.now();
      socket.send(JSON.stringify({ topic: 'subscribe', to: 'calendar' }));
      log('info', 'Trading Economics stream connected and calendar subscribed.');
      await this.handlers.onOpen?.(); this.startHealthMonitor();
    });
    socket.on('message', (data) => this.handleMessage(data));
    socket.on('error', (error) => log('error', 'Trading Economics WebSocket error.', { error }));
    socket.on('close', (code) => this.handleClose(code));
  }

  async handleMessage(data) {
    let parsed;
    try { parsed = JSON.parse(data.toString()); } catch { log('warn', 'Discarded malformed Trading Economics message.'); return; }
    if (parsed?.topic === 'keepalive') { this.lastKeepaliveAt = Date.now(); await this.handlers.onHeartbeat?.(); return; }
    this.lastKeepaliveAt = Date.now();
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const message of messages) await this.handlers.onMessage?.(message);
  }

  startHealthMonitor() {
    clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      if (Date.now() - this.lastKeepaliveAt > this.config.staleAfterMs) {
        log('warn', 'Trading Economics stream is stale; forcing reconnect.');
        this.handlers.onStale?.(); this.socket?.terminate();
      }
    }, Math.min(10000, Math.max(1000, Math.floor(this.config.staleAfterMs / 4))));
  }

  handleClose(code) {
    clearTimeout(this.connectionTimer); clearInterval(this.healthTimer);
    if (this.closed) return;
    const delay = RECONNECT_BACKOFF_MS[Math.min(this.attempt, RECONNECT_BACKOFF_MS.length - 1)]; this.attempt += 1; this.reconnectCount += 1;
    log('warn', 'Trading Economics stream disconnected.', { code, reconnectInMs: delay, reconnectCount: this.reconnectCount });
    this.handlers.onClose?.({ code, reconnectInMs: delay, reconnectCount: this.reconnectCount });
    setTimeout(() => this.connect(), delay);
  }

  async fetchCalendar(from, to) {
    const path = `/calendar/country/united%20states/${from}/${to}?importance=2&values=true&f=json`;
    const response = await fetch(`${this.config.restUrl.replace(/\/$/, '')}${path}`, {
      headers: { Accept: 'application/json', Authorization: `Client ${this.config.clientKey}:${this.config.clientSecret}` },
      signal: AbortSignal.timeout(this.config.connectionTimeoutMs),
    });
    if (!response.ok) throw new Error(`Trading Economics REST returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('Trading Economics REST returned an invalid calendar payload.');
    return payload;
  }

  stop() { this.closed = true; clearTimeout(this.connectionTimer); clearInterval(this.healthTimer); this.socket?.close(1000, 'Worker shutdown'); }
}
