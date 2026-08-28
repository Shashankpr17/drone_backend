import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import { tryGetIO } from '../io';
import { store } from '../store';

interface StreamState {
  active: boolean;
  videoPath: string | null;
  startedAt: string | null;
  frameIndex: number;
  fps: number;
  width: number;
  height: number;
  latestDetections: any;
}

let pythonProcess: ChildProcess | null = null;
let ffmpegProcess: ChildProcess | null = null;

const state: StreamState = {
  active: false,
  videoPath: null,
  startedAt: null,
  frameIndex: 0,
  fps: 15,
  width: 1280,
  height: 720,
  latestDetections: null,
};

const streamDir = path.resolve(process.env.STREAM_DIR || 'data/streams/live');
fs.mkdirSync(streamDir, { recursive: true });

let lastAutoAlertTime = 0;

export const streamService = {
  getStatus(): StreamState & { streamUrl: string } {
    return {
      ...state,
      streamUrl: '/streams/live/stream.m3u8',
    };
  },

  async startStream(customVideoPath?: string): Promise<{ success: boolean; message: string; streamUrl: string }> {
    if (state.active) {
      return {
        success: true,
        message: 'Live stream is already running.',
        streamUrl: '/streams/live/stream.m3u8',
      };
    }

    // Default sample video search if none specified
    let targetPath = customVideoPath;
    if (!targetPath) {
      const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'data/uploads');
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir).filter((f) => /\.(mp4|mov|avi|webm|mkv)$/i.test(f));
        if (files.length > 0) {
          targetPath = path.join(uploadDir, files[0]);
        }
      }
    }

    if (!targetPath || !fs.existsSync(targetPath)) {
      targetPath = 'synthetic';
    }

    // Clear old HLS segments before starting fresh stream
    try {
      const oldFiles = fs.readdirSync(streamDir);
      for (const file of oldFiles) {
        if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
          fs.unlinkSync(path.join(streamDir, file));
        }
      }
    } catch {
      // directory clean error ignored
    }

    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const scriptPath = path.resolve(__dirname, '../../../ml/stream_inference.py');
    const modelPath = process.env.YOLO_MODEL_PATH || path.resolve(__dirname, '../../../ml/yolov11_flood.pt');

    console.log(`🎬 Launching stream pipeline: ${pythonBin} ${scriptPath} on ${targetPath}`);

    pythonProcess = spawn(pythonBin, [scriptPath, targetPath, modelPath, '0.35', '15'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    state.active = true;
    state.videoPath = targetPath;
    state.startedAt = new Date().toISOString();
    state.frameIndex = 0;

    const rl = readline.createInterface({
      input: pythonProcess.stderr!,
      terminal: false,
    });

    rl.on('line', (line) => {
      try {
        const data = JSON.parse(line);

        if (data.type === 'HANDSHAKE') {
          state.width = data.width || 1280;
          state.height = data.height || 720;
          state.fps = data.fps || 15;

          console.log(`📹 Video format: ${state.width}x${state.height} @ ${state.fps} fps`);

          // Spawn FFmpeg to convert raw BGR stream to HLS segments
          const hlsPlaylist = path.join(streamDir, 'stream.m3u8');
          ffmpegProcess = spawn('ffmpeg', [
            '-y',
            '-f', 'rawvideo',
            '-vcodec', 'rawvideo',
            '-pix_fmt', 'bgr24',
            '-s', `${state.width}x${state.height}`,
            '-r', `${state.fps}`,
            '-i', 'pipe:0',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-pix_fmt', 'yuv420p',
            '-g', '30',
            '-hls_time', '1',
            '-hls_list_size', '3',
            '-hls_flags', 'delete_segments+split_by_time',
            hlsPlaylist,
          ]);

          ffmpegProcess.stderr?.on('data', (chunk) => {
            // Keep debug clean, log only if error
            const str = chunk.toString();
            if (str.includes('Error') || str.includes('fatal')) {
              console.error('[FFmpeg Error]', str);
            }
          });

          ffmpegProcess.on('error', (err) => {
            console.error('[FFmpeg Process Error]', err.message);
            streamService.stopStream();
          });

          ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
          });

          // Pipe Python stdout directly into FFmpeg stdin
          if (pythonProcess?.stdout && ffmpegProcess?.stdin) {
            pythonProcess.stdout.pipe(ffmpegProcess.stdin);
          }
        } else if (data.type === 'FRAME_DATA') {
          state.frameIndex = data.frameIndex;
          state.latestDetections = data;

          const io = tryGetIO();
          if (io) {
            io.emit('detection:new', data);

            // Auto-trigger critical alert if victims detected and cooldown elapsed (30s)
            const now = Date.now();
            if (data.victimsCount > 0 && now - lastAutoAlertTime > 30000) {
              lastAutoAlertTime = now;
              const alertData = {
                id: `ALT-AUTO-${now}`,
                createdAt: new Date(),
                title: `🚨 ${data.victimsCount} Victim(s) Detected in Live Feed`,
                severity: 'Critical',
                area: 'Live Drone Survey Sector',
                time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' UTC',
                reach: 'All Field Units',
                body: `Immediate rescue intervention required: Drone AI vision identified ${data.victimsCount} person(s) in active water zone (Water Coverage: ${data.waterCoverage}%).`,
              };

              store.alert.create({ data: alertData }).catch(() => null);
              io.emit('alert:new', alertData);
            }
          }
        }
      } catch {
        // non-json diagnostic output from python
      }
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python stream process exited with code ${code}`);
      streamService.stopStream();
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to spawn Python stream process:', err);
      streamService.stopStream();
    });

    return {
      success: true,
      message: 'Video inference and HLS streaming pipeline started.',
      streamUrl: '/streams/live/stream.m3u8',
    };
  },

  stopStream(): { success: boolean; message: string } {
    if (pythonProcess) {
      pythonProcess.kill('SIGTERM');
      pythonProcess = null;
    }
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGTERM');
      ffmpegProcess = null;
    }

    state.active = false;
    state.startedAt = null;

    const io = tryGetIO();
    if (io) {
      io.emit('stream:stopped', { active: false });
    }

    return {
      success: true,
      message: 'Streaming pipeline terminated.',
    };
  },
};
