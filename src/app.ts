import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

import analysisRoutes from './routes/analysis.routes';

dotenv.config();

export const app = express();
app.set('etag', false);

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
}));
app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Static Assets & HLS Video Stream Serving
app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_DIR || 'data/uploads')));
app.use('/streams', express.static(path.resolve(process.env.STREAM_DIR || 'data/streams')));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Root & Health Check Endpoints
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    service: 'Sky Guardians — Drone Flood Disaster Intelligence & Operations Backend',
    version: '1.0.0',
    mode: 'Full Command Access',
    health: '/health',
    apiBaseUrl: process.env.API_PREFIX || '/api/v1',
    streamEndpoint: '/streams/live/stream.m3u8',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'online',
    service: 'Sky Guardians Drone Flood Intelligence Backend',
    version: '1.0.0',
    mode: 'Full Command Access',
    timestamp: new Date().toISOString(),
  });
});

// API Routes Mounting
const prefix = process.env.API_PREFIX || '/api/v1';
app.use(prefix, analysisRoutes);

const frontendDir = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get('/dashboard', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// 404 Route Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString(),
  });
});
