import http from 'http';
import { app } from './app';
import { initSocketIO } from './io';

const PORT = process.env.PORT || 8000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const server = http.createServer(app);

// ─── Initialize Shared Socket.io ──────────────────────────────────────────────
const io = initSocketIO(server, CORS_ORIGIN);

// ─── Server Start ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚁 Sky Guardians Drone Flood Intelligence Backend`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health endpoint: /health`);
  console.log(`⚡ WebSocket initialized`);
  console.log(`🛡️  Mode: Full Operational Access`);
  console.log(`===================================================`);
});
