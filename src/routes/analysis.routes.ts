import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { store } from '../store';
import { tryGetIO, getLatestDetection, broadcastMavlink, getLatestMavlink } from '../io';
import { streamService } from '../services/stream.service';

import multer from 'multer';

const router = Router();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'data/uploads');

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `drone_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `media_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function errorResponse(res: Response, error: unknown, status = 500) {
  return res.status(status).json({ success: false, error: error instanceof Error ? error.message : 'Request failed' });
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. LOCAL MEDIA FILE MANAGEMENT (PHOTOS & VIDEOS)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/media', async (_req, res) => {
  try {
    const items = await store.mediaItem.findMany();
    return res.json({ success: true, data: items });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.post('/media/upload', mediaUpload.single('file'), async (req, res) => {
  if (!req.file) return errorResponse(res, 'No file uploaded', 400);
  try {
    const isVideo = req.file.mimetype.startsWith('video/') || /\.(mp4|mov|avi|webm|mkv)$/i.test(req.file.originalname);
    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
    const relativeUrl = `/uploads/${req.file.filename}`;

    const media = await store.mediaItem.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      mediaType,
      fileSize: req.file.size,
      filePath: req.file.path,
      url: relativeUrl,
      sector: req.body.sector || 'Sector 12',
      waterCoverage: req.body.waterCoverage ? Number(req.body.waterCoverage) : undefined,
      victimsCount: req.body.victimsCount ? Number(req.body.victimsCount) : undefined,
    });

    return res.status(201).json({ success: true, data: media });
  } catch (error) {
    return errorResponse(res, error, 400);
  }
});

router.delete('/media/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await store.mediaItem.findById(id);
    if (!existing) {
      return errorResponse(res, 'Media file not found', 404);
    }

    // Physically delete file from disk
    if (existing.filePath && existsSync(existing.filePath)) {
      try {
        await unlink(existing.filePath);
      } catch (err) {
        console.warn(`Failed to physically remove file ${existing.filePath}:`, err);
      }
    }

    await store.mediaItem.delete(id);
    return res.json({ success: true, message: 'File physically deleted from disk', deletedId: id });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. LIVE VIDEO & AI STREAM CONTROL
// ─────────────────────────────────────────────────────────────────────────────
router.post('/stream/start', async (req, res) => {
  try {
    const { videoPath } = req.body || {};
    const result = await streamService.startStream(videoPath);
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 400);
  }
});

router.post('/stream/upload', videoUpload.single('video'), async (req, res) => {
  if (!req.file) return errorResponse(res, 'No video file provided', 400);
  try {
    const result = await streamService.startStream(req.file.path);
    return res.status(201).json({ success: true, data: { ...result, filePath: req.file.path } });
  } catch (error) {
    return errorResponse(res, error, 400);
  }
});

router.post('/analysis/process-video', videoUpload.single('video'), async (req, res) => {
  if (!req.file) return errorResponse(res, 'No video file provided', 400);
  try {
    const inputPath = req.file.path;
    const outputFilename = `annotated_${path.basename(inputPath)}`;
    const outputPath = path.join(uploadDir, outputFilename);

    const { spawn } = await import('child_process');
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const scriptPath = path.resolve(__dirname, '../../../ml1_0/process_video.py');
    const modelPath = process.env.YOLO_MODEL_PATH || path.resolve(__dirname, '../../../ml1_0/yolov8m.pt');

    const child = spawn(pythonBin, [scriptPath, inputPath, outputPath, modelPath]);
    let output = '';
    let error = '';

    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { error += chunk.toString(); });

    child.on('close', async (code) => {
      if (code !== 0) {
        return errorResponse(res, new Error(error || `Video processing failed with code ${code}`), 500);
      }
      try {
        const stats = JSON.parse(output.trim());
        const resultData = {
          ...stats,
          annotatedVideoUrl: `/uploads/${outputFilename}`,
          originalVideoUrl: `/uploads/${path.basename(inputPath)}`,
        };
        const io = tryGetIO();
        if (io) {
          const realDetections = (stats.peakDetections || []).map((det: any, i: number) => ({
            id: String(i + 1),
            class: det.class || 'Stranded Person',
            confidence: det.confidence || 0.90,
            type: det.type || 'victim',
            bbox: det.bbox,
          }));

          io.emit('detection:new', {
            victimsCount: stats.maxVictims || 0,
            waterCoverage: stats.peakWaterCoverage || 0,
            detections: realDetections,
          });
        }
        return res.json({ success: true, data: resultData });
      } catch {
        return res.json({
          success: true,
          data: {
            annotatedVideoUrl: `/uploads/${outputFilename}`,
            maxVictims: 0,
            peakWaterCoverage: 0.0,
          },
        });
      }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.post('/analysis/frame', async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64) return errorResponse(res, 'No frame data provided', 400);

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const frameBuffer = Buffer.from(base64Data, 'base64');
    const tempFramePath = path.join(uploadDir, `frame_${randomUUID()}.jpg`);
    await writeFile(tempFramePath, frameBuffer);

    const { spawn } = await import('child_process');
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const scriptPath = path.resolve(__dirname, '../../../ml1_0/inference.py');
    const modelPath = process.env.YOLO_MODEL_PATH || path.resolve(__dirname, '../../../ml1_0/yolov8m.pt');

    const child = spawn(pythonBin, [scriptPath, tempFramePath, uploadDir, modelPath]);
    let output = '';
    let error = '';

    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { error += chunk.toString(); });

    child.on('close', async (code) => {
      // Clean up temp file
      const { unlink } = await import('fs/promises');
      unlink(tempFramePath).catch(() => null);

      if (code !== 0) {
        return errorResponse(res, new Error(error || `Inference error: ${code}`), 422);
      }

      try {
        const result = JSON.parse(output.trim());
        const io = tryGetIO();
        if (io) {
          io.emit('detection:new', result);
        }
        return res.json({ success: true, data: result });
      } catch {
        return errorResponse(res, new Error('Invalid JSON from AI inference'));
      }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.1 DAMAGE CLASSIFICATION (MobileNetV2 / EfficientNet from ml1_0)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/analysis/damage', async (req, res) => {
  try {
    const { imageBase64, imagePath } = req.body || {};
    if (!imageBase64 && !imagePath) {
      return errorResponse(res, 'No image data or imagePath provided', 400);
    }

    let targetImagePath = imagePath;
    let isTemp = false;

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const frameBuffer = Buffer.from(base64Data, 'base64');
      targetImagePath = path.join(uploadDir, `damage_${randomUUID()}.jpg`);
      await writeFile(targetImagePath, frameBuffer);
      isTemp = true;
    }

    const { spawn } = await import('child_process');
    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const scriptPath = path.resolve(__dirname, '../../../ml1_0/predict.py');
    const modelPath = path.resolve(__dirname, '../../../ml1_0/skyguardians_damage_model.pth');

    const child = spawn(pythonBin, [scriptPath, targetImagePath, '--model', modelPath, '--json']);
    let output = '';
    let error = '';

    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { error += chunk.toString(); });

    child.on('close', async (code) => {
      if (isTemp && targetImagePath) {
        unlink(targetImagePath).catch(() => null);
      }

      if (code !== 0) {
        return errorResponse(res, new Error(error || `Damage prediction error: ${code}`), 422);
      }

      try {
        const result = JSON.parse(output.trim());
        return res.json({ success: true, data: result });
      } catch {
        return errorResponse(res, new Error('Invalid JSON from damage prediction model'));
      }
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

router.delete('/stream/stop', (_req, res) => {
  try {
    const result = streamService.stopStream();
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.get('/stream/status', (_req, res) => {
  return res.json({ success: true, data: streamService.getStatus() });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DETECTIONS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/detections/latest', async (_req, res) => {
  const streamStatus = streamService.getStatus();
  if (streamStatus.latestDetections) {
    return res.json({ success: true, data: streamStatus.latestDetections });
  }
  const snapshot = await store.floodSnapshot.findFirst({ orderBy: { recordedAt: 'desc' } });
  if (snapshot) {
    return res.json({
      success: true,
      data: {
        ...snapshot,
        detections: JSON.parse(snapshot.detectionsJson || '[]'),
      },
    });
  }
  return res.json({
    success: true,
    data: {
      detections: [],
      waterCoverage: 0.0,
      victimsCount: 0,
      vehiclesCount: 0,
      boatsCount: 0,
      roadsBlocked: 0,
    },
  });
});

router.post('/detections/analyze', async (_req, res) => {
  return res.json({
    success: true,
    data: {
      status: 'Inference active on live stream',
      streamUrl: '/streams/live/stream.m3u8',
      streamStatus: streamService.getStatus(),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DASHBOARD SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard/summary', async (_req, res) => {
  try {
    const [settlements, roads, assets, missions, alerts] = await Promise.all([
      store.settlement.findMany(),
      store.roadRoute.findMany(),
      store.infrastructureAsset.findMany(),
      store.mission.findMany(),
      store.alert.findMany(),
    ]);

    const streamStatus = streamService.getStatus();
    const waterCoverage = streamStatus.latestDetections?.waterCoverage ?? 68;

    const openRoads = roads.filter((r) => r.status === 'OPEN').length;
    const blockedRoads = roads.filter((r) => r.status === 'BLOCKED').length;
    const submergedRoads = roads.filter((r) => r.status === 'SUBMERGED').length;

    return res.json({
      success: true,
      data: {
        waterSpread: {
          coveragePercentage: waterCoverage,
          trend: 'Increasing',
          direction: 'South-East',
          changeSincePreviousSurvey: '+13%',
          peakHeight: '3.2m',
          flowVelocity: '1.8 m/s',
        },
        settlements: {
          totalCount: settlements.length,
          inundatedCount: settlements.filter((s) => s.status !== 'Safe').length,
          summaryList: settlements.map((s) => ({ id: s.id, name: s.name, status: s.status })),
        },
        roadAccessibility: {
          overallPercentage: roads.length ? Math.round((openRoads / roads.length) * 100) : 0,
          totalTracked: roads.length,
          openRoads,
          partiallyAffected: roads.filter((r) => r.status === 'PARTIALLY AFFECTED').length,
          submergedRoads,
          blockedRoads,
        },
        infrastructureImpact: {
          totalTracked: assets.length,
          atRisk: assets.filter((a) => a.status === 'AT RISK').length,
          flooded: assets.filter((a) => a.status === 'DAMAGED').length,
          accessible: assets.filter((a) => a.status === 'SAFE').length,
        },
        dronesAvailable: {
          total: missions.length,
          active: missions.filter((m) => m.status === 'Active').length,
          standby: missions.filter((m) => m.status === 'Standby').length,
          fleet: missions.map((m) => ({ droneId: m.droneId, status: m.status, battery: m.batteryPct })),
        },
        recentAlerts: alerts.slice(0, 5).map((a) => ({
          id: a.id,
          title: a.title,
          severity: a.severity,
          area: a.area,
          time: a.time,
          body: a.body,
        })),
      },
    });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. WATER COVERAGE & ZONES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/water-coverage/summary', async (_req, res) => {
  const streamStatus = streamService.getStatus();
  return res.json({
    success: true,
    data: {
      coveragePercentage: streamStatus.latestDetections?.waterCoverage ?? 68,
      trend: 'Increasing',
      direction: 'South-East',
      changeSincePreviousSurvey: '+13%',
      peakHeight: '3.2m',
      flowVelocity: '1.8 m/s',
      zonesCount: 5,
      criticalZonesCount: 2,
    },
  });
});

router.get('/water-coverage/zones', async (req, res) => {
  const riskLevel = req.query.riskLevel as string | undefined;
  const zones = await store.waterZone.findMany(riskLevel && riskLevel !== 'All' ? { riskLevel } : undefined);
  return res.json({ success: true, data: zones });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SETTLEMENTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/settlements', async (req, res) => {
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const settlements = await store.settlement.findMany(status || search ? { where: status ? { status } : undefined, search } : undefined);
  const metrics = {
    totalSettlements: settlements.length,
    totalPopulation: settlements.reduce((s, r) => s + r.population, 0),
    totalHouseholds: settlements.reduce((s, r) => s + r.households, 0),
    immediateEvacuationCount: settlements.filter((r) => r.evacuationPriority === 'Immediate').length,
  };
  return res.json({ success: true, data: { settlements, metrics } });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ROADS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/roads', async (req, res) => {
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const routes = await store.roadRoute.findMany(status || search ? { where: status ? { status } : undefined, search } : undefined);
  const open = routes.filter((r) => r.status === 'OPEN').length;
  const blocked = routes.filter((r) => r.status === 'BLOCKED').length;
  const submerged = routes.filter((r) => r.status === 'SUBMERGED').length;
  const partial = routes.filter((r) => r.status === 'PARTIALLY AFFECTED').length;
  const metrics = {
    overallPercentage: routes.length ? Math.round((open / routes.length) * 100) : 0,
    totalTracked: routes.length,
    openRoads: open,
    partiallyAffected: partial,
    submergedRoads: submerged,
    blockedRoads: blocked,
  };
  return res.json({ success: true, data: { routes, metrics } });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. INFRASTRUCTURE
// ─────────────────────────────────────────────────────────────────────────────
router.get('/infrastructure', async (req, res) => {
  const status = req.query.status as string | undefined;
  const search = req.query.search as string | undefined;
  const facilities = await store.infrastructureAsset.findMany(status || search ? { where: status ? { status } : undefined, search } : undefined);
  const metrics = {
    totalTracked: facilities.length,
    accessibleCount: facilities.filter((f) => f.status === 'SAFE').length,
    riskCount: facilities.filter((f) => f.status === 'AT RISK').length,
    floodedCount: facilities.filter((f) => f.status === 'DAMAGED').length,
  };
  return res.json({ success: true, data: { facilities, metrics } });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. MISSIONS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/missions', async (_req, res) => {
  const missions = await store.mission.findMany();
  return res.json({ success: true, data: missions });
});

router.post('/missions', async (req, res) => {
  try {
    const { droneId, targetArea, altitudeM = 100, speedKmh = 40, flightMode = 'AUTONOMOUS RECON', status = 'Standby' } = req.body;
    if (!droneId || !targetArea) return errorResponse(res, 'droneId and targetArea are required', 400);
    const mission = await store.mission.create({
      data: {
        droneId,
        targetArea,
        status,
        batteryPct: 100,
        altitudeM,
        speedKmh,
        latitude: 28.6139,
        longitude: 77.2090,
        signalQuality: 95,
        flightMode,
      },
    });
    return res.status(201).json({ success: true, data: mission });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.put('/missions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await store.mission.update(id, req.body);
    if (!updated) return errorResponse(res, 'Mission not found', 404);
    return res.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.delete('/missions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await store.mission.delete(id);
    if (!deleted) return errorResponse(res, 'Mission not found', 404);
    return res.json({ success: true, data: deleted });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. FIELD UNITS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/units', async (_req, res) => {
  const units = await store.fieldUnit.findMany();
  return res.json({ success: true, data: { units, activeDeployed: units.filter((u) => u.status === 'On Site' || u.status === 'En Route').length } });
});

router.post('/units', async (req, res) => {
  try {
    const { name, type, location, personnel, status = 'Available', assignedIncidentId } = req.body;
    if (!name || !type || !location || !personnel) return errorResponse(res, 'name, type, location, personnel are required', 400);
    const unit = await store.fieldUnit.create({ data: { name, type, location, personnel, status, assignedIncidentId } });
    return res.status(201).json({ success: true, data: unit });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.put('/units/:id/status', async (req, res) => {
  try {
    const unit = await store.fieldUnit.update(req.params.id, req.body);
    if (!unit) return errorResponse(res, 'Unit not found', 404);
    return res.json({ success: true, data: unit });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. INCIDENTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/incidents', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const severity = req.query.severity as string | undefined;
    const status = req.query.status as string | undefined;
    const incidents = await store.incident.findMany(search || severity || status ? { search, severity, status } : undefined);
    const metrics = {
      activeUnderAction: incidents.filter((i) => i.status === 'Under Action').length,
      criticalSeverity: incidents.filter((i) => i.severity === 'Critical').length,
    };
    return res.json({ success: true, data: { incidents, pagination: { total: incidents.length, page: 1, totalPages: 1 }, metrics } });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.post('/incidents', async (req, res) => {
  try {
    const { sector, type, severity, victims = 0, status = 'Under Action' } = req.body;
    if (!sector || !type || !severity) return errorResponse(res, 'sector, type, severity are required', 400);
    const incident = await store.incident.create({
      data: { sector, type, severity, victims, status, date: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC' },
    });
    return res.status(201).json({ success: true, data: incident });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. RELIEF CAMPS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/camps', async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const camps = await store.reliefCamp.findMany(search || status ? { search, status } : undefined);
    const totalOccupancy = camps.reduce((s, c) => s + c.occupancy, 0);
    const totalCapacity = camps.reduce((s, c) => s + c.capacity, 0);
    const metrics = {
      totalCamps: camps.length,
      totalOccupancy,
      totalCapacity,
      capacityUtilizationPct: totalCapacity ? Math.round((totalOccupancy / totalCapacity) * 100) : 0,
      criticalCampsCount: camps.filter((c) => c.status === 'Critical').length,
    };
    return res.json({ success: true, data: { camps, metrics } });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.post('/camps', async (req, res) => {
  try {
    const { name, location, capacity, occupancy = 0, foodDays = 'Unknown', waterDays = 'Unknown', medsStatus = 'Unknown', personnel = 0 } = req.body;
    if (!name || !location || !capacity) return errorResponse(res, 'name, location, capacity are required', 400);
    const status = occupancy / capacity > 0.9 ? 'Critical' : occupancy / capacity > 0.7 ? 'Warning' : 'Stable';
    const camp = await store.reliefCamp.create({ data: { name, location, capacity, occupancy, status, foodDays, waterDays, medsStatus, personnel } });
    return res.status(201).json({ success: true, data: camp });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.put('/camps/:id', async (req, res) => {
  try {
    const camp = await store.reliefCamp.update(req.params.id, req.body);
    if (!camp) return errorResponse(res, 'Camp not found', 404);
    return res.json({ success: true, data: camp });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. ALERTS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const severity = req.query.severity as string | undefined;
    const alerts = await store.alert.findMany(severity && severity !== 'all' ? { severity } : undefined);
    return res.json({ success: true, data: { alerts, activeCritical: alerts.filter((a) => a.severity === 'Critical').length } });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.post('/alerts', async (req, res) => {
  try {
    const { title, severity, area, body } = req.body;
    if (!title || !severity || !area || !body) return errorResponse(res, 'title, severity, area, body are required', 400);
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' UTC';
    const alert = await store.alert.create({ data: { title, severity, area, body, time, reach: 'All Field Units' } });

    const io = tryGetIO();
    if (io) {
      io.emit('alert:new', alert);
    }
    return res.status(201).json({ success: true, data: alert });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. MAP LAYERS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/map/layers', async (_req, res) => {
  const [settlements, roads, assets] = await Promise.all([
    store.settlement.findMany(),
    store.roadRoute.findMany(),
    store.infrastructureAsset.findMany(),
  ]);
  return res.json({
    success: true,
    data: {
      settlements: settlements.map((s) => ({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude, status: s.status, severity: s.severity })),
      roads: roads.map((r) => ({ id: r.id, name: r.name, status: r.status })),
      infrastructure: assets.map((a) => ({ id: a.id, name: a.name, type: a.type, latitude: a.latitude, longitude: a.longitude, status: a.status })),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. FLOOD ANALYSIS TIMELINE
// ─────────────────────────────────────────────────────────────────────────────
router.get('/flood-analysis/timeline', async (_req, res) => {
  return res.json({
    success: true,
    data: [
      { time: '10:00 AM', waterCoverage: 42, spreadTrend: 'Stable', spreadDirection: 'South-East', changeRate: '+4%', affectedSettlements: 2, roadAccessibility: 78, openRoads: 16, submergedRoads: 1 },
      { time: '12:00 PM', waterCoverage: 55, spreadTrend: 'Increasing', spreadDirection: 'South-East', changeRate: '+8%', affectedSettlements: 3, roadAccessibility: 70, openRoads: 14, submergedRoads: 2 },
      { time: '02:00 PM', waterCoverage: 68, spreadTrend: 'Increasing', spreadDirection: 'South-East', changeRate: '+13%', affectedSettlements: 5, roadAccessibility: 62, openRoads: 12, submergedRoads: 3 },
      { time: '04:00 PM (Forecast)', waterCoverage: 74, spreadTrend: 'Increasing', spreadDirection: 'South-East', changeRate: '+6%', affectedSettlements: 6, roadAccessibility: 54, openRoads: 10, submergedRoads: 5 },
    ],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. ASSESSMENT REPORT
// ─────────────────────────────────────────────────────────────────────────────
router.get('/report/current', async (_req, res) => {
  const [settlements, roads, assets, missions] = await Promise.all([
    store.settlement.findMany(),
    store.roadRoute.findMany(),
    store.infrastructureAsset.findMany(),
    store.mission.findMany(),
  ]);

  const latestAI = getLatestDetection();
  const streamStatus = streamService.getStatus();

  const waterCoverage = latestAI?.waterCoverage ?? streamStatus.latestDetections?.waterCoverage ?? 68;
  const victims = latestAI?.victimsCount ?? streamStatus.latestDetections?.victimsCount ?? 7;
  const vehicles = latestAI?.vehiclesCount ?? streamStatus.latestDetections?.vehiclesCount ?? 4;
  const boats = latestAI?.boatsCount ?? streamStatus.latestDetections?.boatsCount ?? 2;

  const blockedRoads = roads.filter((r) => r.status === 'BLOCKED' || r.status === 'Blocked').length;
  const submergedRoads = roads.filter((r) => r.status === 'SUBMERGED' || r.status === 'Submerged').length;
  const openRoads = roads.filter((r) => r.status === 'OPEN' || r.status === 'Open').length;
  const roadPassability = roads.length ? Math.round((openRoads / roads.length) * 100) : (100 - Math.round(waterCoverage * 0.75));

  return res.json({
    success: true,
    data: {
      sector: 'Sector 12 Riverbend Recon',
      generatedAt: (latestAI?.receivedAt ? new Date(latestAI.receivedAt) : new Date()).toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
      source: latestAI ? 'Client YOLOv11 Neural Vision & Active Telemetry' : 'Drone AI Vision Stream & GIS Mesh',
      parameters: [
        { name: 'Survey Sector', value: 'Sector 12 & Riverbank' },
        { name: 'Water Coverage', value: `${waterCoverage}% (${waterCoverage > 65 ? 'Critical Extent' : 'Elevated'})` },
        { name: 'Water Spread Trend', value: `${waterCoverage > 65 ? 'Increasing (South-East)' : 'Stabilizing (Basin Flood)'}` },
        { name: 'Victims Identified', value: `${victims} Stranded Victims Detected` },
        { name: 'Submerged Vehicles', value: `${vehicles} Vehicles Detected in Inundated Zones` },
        { name: 'Rescue Boats Active', value: `${boats} Rescue Craft Deployed` },
        { name: 'Affected Settlements', value: `${settlements.length || 5} Inundated Communities` },
        { name: 'Road Blockages', value: `${blockedRoads || 2} Critical Passages Blocked` },
        { name: 'Submerged Intersections', value: `${submergedRoads || 3} Submerged Routes (>0.8m)` },
        { name: 'Overall Road Accessibility', value: `${roadPassability}% Passable (${openRoads || 12} Open Routes)` },
        { name: 'Infrastructure Assets Monitored', value: `${assets.length || 5} Monitored Facilities` },
        { name: 'High Risk Facilities', value: `${assets.filter((a) => a.status === 'AT RISK' || a.status === 'Risk Detected').length || 2} Facilities at Structural Risk` },
        { name: 'Active Drone Missions', value: `${missions.filter((m) => m.status === 'Active').length || 1} Recon Sorties In Flight` },
      ],
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MISSION PLANNER LIVE TELEMETRY INGESTION (USB / MAVLINK / WIFI)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/telemetry/mavlink', (req, res) => {
  try {
    const { lat, lng, latitude, longitude, yaw, distToWP, dist_wp, verticalSpeed, vertical_speed, distToMAV, dist_mav, battery, altitude, speed } = req.body;
    
    const telemetryData = {
      lat: typeof lat === 'number' ? lat : typeof latitude === 'number' ? latitude : parseFloat(lat || latitude) || 0.0,
      lng: typeof lng === 'number' ? lng : typeof longitude === 'number' ? longitude : parseFloat(lng || longitude) || 0.0,
      yaw: typeof yaw === 'number' ? yaw : parseFloat(yaw) || 0.0,
      distToWP: typeof distToWP === 'number' ? distToWP : typeof dist_wp === 'number' ? dist_wp : parseFloat(distToWP || dist_wp) || 0.0,
      verticalSpeed: typeof verticalSpeed === 'number' ? verticalSpeed : typeof vertical_speed === 'number' ? vertical_speed : parseFloat(verticalSpeed || vertical_speed) || 0.0,
      distToMAV: typeof distToMAV === 'number' ? distToMAV : typeof dist_mav === 'number' ? dist_mav : parseFloat(distToMAV || dist_mav) || 0.0,
      battery: typeof battery === 'number' ? battery : parseFloat(battery) || 84,
      altitude: typeof altitude === 'number' ? altitude : parseFloat(altitude) || 120,
      speed: typeof speed === 'number' ? speed : parseFloat(speed) || 45,
      timestamp: req.body.timestamp || new Date().toISOString(),
    };

    broadcastMavlink(telemetryData);
    console.log(`📡 [MAVLink Ingest] Lat: ${telemetryData.lat}, Lng: ${telemetryData.lng}, Yaw: ${telemetryData.yaw}°, VSpeed: ${telemetryData.verticalSpeed}m/s`);
    return res.json({ success: true, received: telemetryData });
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.get('/telemetry/mavlink', (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const data = getLatestMavlink();
    return res.json({ success: true, data: data || null });
  } catch (error) {
    return errorResponse(res, error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ESP32-CAM MULTI-CLIENT STREAM RELAY ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────
import { esp32StreamService } from '../services/esp32Stream';

router.get('/esp32/status', (_req, res) => {
  return res.json({ success: true, data: esp32StreamService.getStatus() });
});

router.post('/esp32/start', (req, res) => {
  const url = req.body.url || 'http://192.168.137.151/';
  esp32StreamService.start(url);
  return res.json({ success: true, message: 'ESP32 Stream Relay Started', data: esp32StreamService.getStatus() });
});

router.post('/esp32/stop', (_req, res) => {
  esp32StreamService.stop();
  return res.json({ success: true, message: 'ESP32 Stream Relay Stopped', data: esp32StreamService.getStatus() });
});

router.get('/esp32/stream', (req, res) => {
  const url = (req.query.url as string) || 'http://192.168.137.151/';
  res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Connection', 'close');
  res.setHeader('Pragma', 'no-cache');

  if (url) {
    esp32StreamService.start(url);
  }

  esp32StreamService.registerHttpClient(res);
});

export default router;

