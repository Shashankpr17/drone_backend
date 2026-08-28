import http from 'http';
import https from 'https';
import { Server as SocketIOServer } from 'socket.io';

class ESP32StreamService {
  private activeUrl: string | null = null;
  private currentRequest: http.ClientRequest | null = null;
  private isStreaming: boolean = false;
  private io: SocketIOServer | null = null;
  private viewersCount: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private httpClients: Set<any> = new Set();
  private latestFrameBase64: string | null = null;
  private probeIndex: number = 0;
  private candidateUrls: string[] = [];

  public setIO(io: SocketIOServer) {
    this.io = io;
  }

  public getStatus() {
    return {
      active: this.isStreaming,
      url: this.activeUrl,
      viewers: this.viewersCount + this.httpClients.size,
    };
  }

  public start(targetUrl: string, io?: SocketIOServer) {
    if (io) this.io = io;

    let url = targetUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `http://${url}`;
    }

    // If already streaming the same URL, send latest frame immediately and increment viewers
    if (this.isStreaming && this.activeUrl === url) {
      this.viewersCount++;
      this.broadcastStatus();
      if (this.latestFrameBase64 && this.io) {
        this.io.emit('esp32:frame', { data: this.latestFrameBase64, timestamp: Date.now() });
      }
      return;
    }

    // Stop existing stream if URL changed
    if (this.isStreaming) {
      this.stopInternal();
    }

    this.activeUrl = url;
    this.candidateUrls = this.generateCandidates(url);
    this.probeIndex = 0;
    this.viewersCount = Math.max(1, this.viewersCount + 1);
    this.connectToStream();
  }

  public stop() {
    this.viewersCount = Math.max(0, this.viewersCount - 1);
    if (this.viewersCount === 0 && this.httpClients.size === 0) {
      this.stopInternal();
    } else {
      this.broadcastStatus();
    }
  }

  public registerHttpClient(res: any) {
    this.httpClients.add(res);
    this.broadcastStatus();

    if (!this.isStreaming) {
      const url = this.activeUrl || 'http://192.168.137.151/';
      this.start(url);
    }

    res.on('close', () => {
      this.httpClients.delete(res);
      this.broadcastStatus();
      if (this.viewersCount === 0 && this.httpClients.size === 0) {
        this.stopInternal();
      }
    });
  }

  private generateCandidates(rawUrl: string): string[] {
    const list: string[] = [];
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname; // e.g. 192.168.137.221

      // 1. If explicit port :81 or /stream path is given, prioritize exact input
      if (parsed.port === '81' || parsed.pathname.includes('stream')) {
        list.push(rawUrl);
      } else {
        // Standard Arduino ESP32-CAM stream is on port 81 /stream!
        list.push(`http://${host}:81/stream`);
        list.push(`http://${host}/stream`);
        list.push(rawUrl);
      }

      const port81Url = `http://${host}:81/stream`;
      if (!list.includes(port81Url)) list.push(port81Url);
      const port80Stream = `http://${host}/stream`;
      if (!list.includes(port80Stream)) list.push(port80Stream);
      const port80Root = `http://${host}/`;
      if (!list.includes(port80Root)) list.push(port80Root);
    } catch {
      list.push(rawUrl);
    }
    return list;
  }

  private connectToStream() {
    if (this.candidateUrls.length === 0) return;

    if (this.probeIndex >= this.candidateUrls.length) {
      this.probeIndex = 0; // wrap around for retry
    }

    const currentTargetUrl = this.candidateUrls[this.probeIndex];

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    console.log(`📡 [ESP32 Relay] Trying connection to upstream: ${currentTargetUrl}...`);
    this.isStreaming = true;
    this.broadcastStatus();

    const client = currentTargetUrl.startsWith('https') ? https : http;

    try {
      this.currentRequest = client.get(currentTargetUrl, (res) => {
        const contentType = (res.headers['content-type'] || '').toLowerCase();

        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
          console.warn(`⚠️ [ESP32 Relay] ${currentTargetUrl} returned status ${res.statusCode}`);
          this.tryNextCandidate();
          return;
        }

        // If returned HTML instead of image/multipart, it's the web control page, not the video stream
        if (contentType.includes('text/html') && !currentTargetUrl.includes(':81')) {
          console.log(`ℹ️ [ESP32 Relay] ${currentTargetUrl} is Web UI page. Looking for stream endpoint...`);
          this.tryNextCandidate();
          return;
        }

        console.log(`✅ [ESP32 Relay] Connected successfully to ${currentTargetUrl} (${contentType || 'MJPEG'}). Relaying frames to all clients.`);
        this.activeUrl = currentTargetUrl;
        this.broadcastStatus();

        let buffer = Buffer.alloc(0);

        res.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk]);

          // Extract JPEG frames by identifying SOI (0xFF, 0xD8) and EOI (0xFF, 0xD9)
          while (true) {
            const soiIndex = buffer.indexOf(Buffer.from([0xff, 0xd8]));
            if (soiIndex === -1) {
              if (buffer.length > 2) {
                buffer = buffer.subarray(buffer.length - 2);
              }
              break;
            }

            const eoiIndex = buffer.indexOf(Buffer.from([0xff, 0xd9]), soiIndex + 2);
            if (eoiIndex === -1) {
              if (soiIndex > 0) {
                buffer = buffer.subarray(soiIndex);
              }
              break;
            }

            // Full JPEG frame found
            const jpegBuffer = buffer.subarray(soiIndex, eoiIndex + 2);
            buffer = buffer.subarray(eoiIndex + 2);

            this.dispatchFrame(jpegBuffer);
          }
        });

        res.on('end', () => {
          console.log(`🔌 [ESP32 Relay] Upstream stream ended by ${currentTargetUrl}.`);
          this.handleDisconnect();
        });

        res.on('error', (err) => {
          console.warn(`⚠️ [ESP32 Relay] Stream error on ${currentTargetUrl}:`, err.message);
          this.tryNextCandidate();
        });
      });

      this.currentRequest.on('error', (err) => {
        console.warn(`⚠️ [ESP32 Relay] Connection failed to ${currentTargetUrl}:`, err.message);
        this.tryNextCandidate();
      });

      this.currentRequest.setTimeout(6000, () => {
        console.warn(`⚠️ [ESP32 Relay] Connection timeout to ${currentTargetUrl}`);
        this.currentRequest?.destroy();
        this.tryNextCandidate();
      });
    } catch (err: any) {
      console.error(`❌ [ESP32 Relay] Error connecting to ${currentTargetUrl}:`, err.message);
      this.tryNextCandidate();
    }
  }

  private tryNextCandidate() {
    if (this.currentRequest) {
      this.currentRequest.destroy();
      this.currentRequest = null;
    }

    this.probeIndex++;
    if (this.probeIndex < this.candidateUrls.length) {
      // Try next candidate immediately
      this.connectToStream();
    } else {
      // All candidates tried, wait 3s and restart cycle
      this.probeIndex = 0;
      this.handleDisconnect();
    }
  }

  private dispatchFrame(jpegBuffer: Buffer) {
    const base64Data = jpegBuffer.toString('base64');
    this.latestFrameBase64 = base64Data;
    const now = Date.now();

    // 1. Broadcast via WebSocket to all connected browser clients
    if (this.io) {
      this.io.emit('esp32:frame', { data: base64Data, timestamp: now });
    }

    // 2. Broadcast to any direct HTTP MJPEG clients
    if (this.httpClients.size > 0) {
      const header = `--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegBuffer.length}\r\n\r\n`;
      const footer = '\r\n';
      const chunk = Buffer.concat([Buffer.from(header), jpegBuffer, Buffer.from(footer)]);

      for (const client of this.httpClients) {
        try {
          client.write(chunk);
        } catch {
          this.httpClients.delete(client);
        }
      }
    }
  }

  private handleDisconnect() {
    if (this.currentRequest) {
      this.currentRequest.destroy();
      this.currentRequest = null;
    }

    if (this.viewersCount > 0 || this.httpClients.size > 0) {
      if (!this.reconnectTimer) {
        console.log(`🔄 [ESP32 Relay] Reconnecting in 3 seconds...`);
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (this.viewersCount > 0 || this.httpClients.size > 0) {
            this.connectToStream();
          }
        }, 3000);
      }
    } else {
      this.isStreaming = false;
      this.broadcastStatus();
    }
  }

  private stopInternal() {
    console.log(`⏹️ [ESP32 Relay] All viewers disconnected. Stopping stream.`);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.currentRequest) {
      this.currentRequest.destroy();
      this.currentRequest = null;
    }
    this.isStreaming = false;
    this.broadcastStatus();
  }

  private broadcastStatus() {
    if (this.io) {
      this.io.emit('esp32:status', this.getStatus());
    }
  }
}

export const esp32StreamService = new ESP32StreamService();

