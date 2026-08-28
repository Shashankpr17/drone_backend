import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import { esp32StreamService } from './services/esp32Stream';

let ioInstance: SocketIOServer | null = null;
let latestDetectionState: any = null;
let latestMavlinkState: any = null;

export function initSocketIO(server: HTTPServer, corsOrigin: string = '*'): SocketIOServer {
  ioInstance = new SocketIOServer(server, {
    cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  });

  esp32StreamService.setIO(ioInstance);

  ioInstance.on('connection', (socket) => {
    console.log(`⚡ WebSocket client connected: ${socket.id}`);

    // Send current ESP32 stream status
    socket.emit('esp32:status', esp32StreamService.getStatus());

    // If a new client connects and we have fresh mavlink state (< 10s), send it
    if (latestMavlinkState) {
      const elapsed = Date.now() - new Date(latestMavlinkState.receivedAt).getTime();
      if (elapsed <= 10000) {
        socket.emit('telemetry:mavlink', latestMavlinkState);
      }
    }

    socket.on('client:detection', (detectionData) => {
      latestDetectionState = {
        ...detectionData,
        receivedAt: new Date().toISOString(),
      };
      ioInstance?.emit('detection:new', detectionData);
    });

    let watchingEsp32 = false;

    socket.on('esp32:start', (payload?: { url?: string }) => {
      const url = payload?.url || 'http://192.168.137.151/';
      watchingEsp32 = true;
      if (ioInstance) {
        esp32StreamService.start(url, ioInstance);
      }
    });

    socket.on('esp32:stop', () => {
      if (watchingEsp32) {
        watchingEsp32 = false;
        esp32StreamService.stop();
      }
    });

    socket.on('disconnect', (reason) => {
      if (watchingEsp32) {
        watchingEsp32 = false;
        esp32StreamService.stop();
      }
      console.log(`🔌 WebSocket client disconnected: ${socket.id} (${reason})`);
    });
  });

  return ioInstance;
}

export function getLatestDetection(): any {
  return latestDetectionState;
}

export function getLatestMavlink(): any {
  return latestMavlinkState;
}

export function broadcastMavlink(data: any): void {
  latestMavlinkState = { ...data, receivedAt: new Date().toISOString() };
  ioInstance?.emit('telemetry:mavlink', latestMavlinkState);

  // Also emit formatted telemetry:update so all dashboard maps move the drone live
  if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
    ioInstance?.emit('telemetry:update', {
      coordinates: { lat: data.lat, lng: data.lng },
      altitude: data.altitude ?? 120,
      speed: data.speed ?? 45,
      battery: data.battery ?? 85,
      yaw: data.yaw ?? 0,
      verticalSpeed: data.verticalSpeed ?? 0,
      distToWP: data.distToWP ?? 0,
      distToMAV: data.distToMAV ?? 0,
    });
  }
}

export function getIO(): SocketIOServer {
  if (!ioInstance) {
    throw new Error('Socket.io has not been initialized. Call initSocketIO first.');
  }
  return ioInstance;
}

export function tryGetIO(): SocketIOServer | null {
  return ioInstance;
}
