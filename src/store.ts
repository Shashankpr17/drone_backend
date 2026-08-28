import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

// ─── Entity Types ─────────────────────────────────────────────────────────────

type Snapshot = {
  id: string; recordedAt: Date; imagePath: string; mediaType: string;
  framesProcessed: number; latitude: number | null; longitude: number | null;
  annotatedImagePath?: string | null; floodMaskImagePath?: string | null;
  coveragePercentage: number; severity: string; floodAreaSqKm: number;
  spreadTrend: string; direction: string; detectionsJson: string;
};
type Settlement = {
  id: string; name: string; location: string; population: number; households: number;
  latitude: number; longitude: number; severity: string; evacuationPriority: string;
  evacuatedPercentage: number; waterDepth: string; nearestCamp: string; status: string;
};
type RoadRoute = {
  id: string; name: string; category: string; status: string; waterDepth: string;
  clearance: string; condition: string; alternativeRoute?: string | null; geometryJson?: string | null;
};
type InfrastructureAsset = {
  id: string; asset: string; name: string; type: string; status: string; confidence: number;
  latitude: number; longitude: number; location: string; structuralIntegrity: string;
  waterLevel: string; backupPower: string; detail: string; actionTaken: string; lastInspection: string;
};
type ResponsePlan = {
  id: string; createdAt: Date; priority: string; actionsJson: string;
  resourcesJson: string; snapshotId: string;
};
type AssessmentReport = {
  id: string; eventId: string; generatedAt: Date; surveyArea: string;
  overallRisk: string; parametersJson: string; pdfPath?: string | null;
};
type Mission = {
  id: string; createdAt: Date; droneId: string; targetArea: string; status: string;
  batteryPct: number; altitudeM: number; speedKmh: number;
  latitude: number; longitude: number; signalQuality: number; flightMode: string;
};
type FieldUnit = {
  id: string; createdAt: Date; name: string; type: string; location: string;
  status: string; personnel: number; assignedIncidentId?: string | null;
};
type Incident = {
  id: string; createdAt: Date; date: string; sector: string; type: string;
  severity: string; victims: number; status: string;
};
type ReliefCamp = {
  id: string; createdAt: Date; name: string; location: string; status: string;
  occupancy: number; capacity: number; foodDays: string; foodCritical?: boolean;
  waterDays: string; waterCritical?: boolean; medsStatus: string; personnel: number;
};
type Alert = {
  id: string; createdAt: Date; title: string; severity: string;
  area: string; time: string; reach: string; body: string;
};
type WaterZone = {
  id: string; name: string; waterDepth: string; coveragePct: number;
  flowDirection: string; status: string; riskLevel: string; lastSurvey: string;
};
export type MediaItem = {
  id: string;
  filename: string;
  originalName: string;
  mediaType: 'image' | 'video';
  fileSize: number;
  filePath: string;
  url: string;
  uploadedAt: Date;
  sector: string;
  waterCoverage?: number;
  victimsCount?: number;
};

type StoreData = {
  floodSnapshots: Snapshot[];
  settlements: Settlement[];
  roadRoutes: RoadRoute[];
  infrastructureAssets: InfrastructureAsset[];
  responsePlans: ResponsePlan[];
  assessmentReports: AssessmentReport[];
  missions: Mission[];
  fieldUnits: FieldUnit[];
  incidents: Incident[];
  reliefCamps: ReliefCamp[];
  alerts: Alert[];
  waterZones: WaterZone[];
  mediaItems: MediaItem[];
};

// ─── Store Internals ──────────────────────────────────────────────────────────

const storePath = path.resolve(process.env.DATA_STORE_PATH || 'data/assessment-store.json');
const emptyStore: StoreData = {
  floodSnapshots: [], settlements: [], roadRoutes: [], infrastructureAssets: [],
  responsePlans: [], assessmentReports: [], missions: [], fieldUnits: [],
  incidents: [], reliefCamps: [], alerts: [], waterZones: [], mediaItems: [],
};
let writeQueue = Promise.resolve();

function revive(data: StoreData): StoreData {
  return {
    ...emptyStore, ...data,
    floodSnapshots: (data.floodSnapshots || []).map((i) => ({ ...i, recordedAt: new Date(i.recordedAt) })),
    responsePlans: (data.responsePlans || []).map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
    assessmentReports: (data.assessmentReports || []).map((i) => ({ ...i, generatedAt: new Date(i.generatedAt) })),
    missions: (data.missions || []).map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
    fieldUnits: (data.fieldUnits || []).map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
    incidents: (data.incidents || []).map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
    reliefCamps: (data.reliefCamps || []).map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
    alerts: (data.alerts || []).map((i) => ({ ...i, createdAt: new Date(i.createdAt) })),
    waterZones: data.waterZones || [],
    mediaItems: (data.mediaItems || []).map((i) => ({ ...i, uploadedAt: new Date(i.uploadedAt) })),
  };
}
async function readStore(): Promise<StoreData> {
  if (!existsSync(storePath)) return { ...emptyStore };
  return revive(JSON.parse(await readFile(storePath, 'utf8')) as StoreData);
}
async function saveStore(data: StoreData) {
  await mkdir(path.dirname(storePath), { recursive: true });
  writeQueue = writeQueue.then(() => writeFile(storePath, JSON.stringify(data, null, 2)));
  await writeQueue;
}
function newest<T extends { recordedAt?: Date; createdAt?: Date }>(items: T[], before?: Date): T | null {
  return items
    .filter((i) => !before || (i.recordedAt || i.createdAt)! < before)
    .sort((a, b) => Number(b.recordedAt || b.createdAt) - Number(a.recordedAt || a.createdAt))[0] || null;
}

// ─── Public Store API ─────────────────────────────────────────────────────────

export const store = {
  floodSnapshot: {
    findFirst: async (options?: { where?: { recordedAt?: { lt: Date } }; orderBy?: unknown }) =>
      newest((await readStore()).floodSnapshots, options?.where?.recordedAt?.lt),
    create: async ({ data }: { data: Omit<Snapshot, 'id' | 'recordedAt'> & Partial<Pick<Snapshot, 'recordedAt'>> }) => {
      const current = await readStore();
      const item = { ...data, id: randomUUID(), recordedAt: data.recordedAt || new Date() };
      current.floodSnapshots.push(item); await saveStore(current); return item;
    },
  },
  settlement: {
    findMany: async (options?: { where?: { status?: string }; search?: string }) => {
      const rows = (await readStore()).settlements;
      if (!options) return rows;
      return rows.filter((r) =>
        (!options.where?.status || r.status === options.where.status) &&
        (!options.search || r.name.toLowerCase().includes(options.search.toLowerCase()))
      );
    },
  },
  roadRoute: {
    findMany: async (options?: { where?: { status?: string }; search?: string }) => {
      const rows = (await readStore()).roadRoutes;
      if (!options) return rows;
      return rows.filter((r) =>
        (!options.where?.status || r.status === options.where.status) &&
        (!options.search || r.name.toLowerCase().includes(options.search.toLowerCase()))
      );
    },
    count: async ({ where }: { where?: { status?: string } }) =>
      (await readStore()).roadRoutes.filter((r) => !where?.status || r.status === where.status).length,
  },
  infrastructureAsset: {
    findMany: async (options?: { where?: { status?: string }; search?: string }) => {
      const rows = (await readStore()).infrastructureAssets;
      if (!options) return rows;
      return rows.filter((r) =>
        (!options.where?.status || r.status === options.where.status) &&
        (!options.search || r.name.toLowerCase().includes(options.search.toLowerCase()))
      );
    },
    count: async ({ where }: { where?: { type?: string; status?: { in: string[] } } }) =>
      (await readStore()).infrastructureAssets.filter(
        (r) => (!where?.type || r.type === where.type) && (!where?.status?.in || where.status.in.includes(r.status))
      ).length,
  },
  responsePlan: {
    findFirst: async (_options?: unknown) =>
      newest((await readStore()).responsePlans.map((i) => ({ ...i, recordedAt: i.createdAt }))),
    create: async ({ data }: { data: Omit<ResponsePlan, 'id' | 'createdAt'> & Partial<Pick<ResponsePlan, 'createdAt'>> }) => {
      const current = await readStore();
      const item = { ...data, id: randomUUID(), createdAt: data.createdAt || new Date() };
      current.responsePlans.push(item); await saveStore(current); return item;
    },
  },
  assessmentReport: {
    create: async ({ data }: { data: Omit<AssessmentReport, 'id' | 'generatedAt'> & Partial<Pick<AssessmentReport, 'generatedAt'>> }) => {
      const current = await readStore();
      const item = { ...data, id: randomUUID(), generatedAt: data.generatedAt || new Date() };
      current.assessmentReports.push(item); await saveStore(current); return item;
    },
  },
  mission: {
    findMany: async () => (await readStore()).missions,
    findById: async (id: string) => (await readStore()).missions.find((m) => m.id === id) || null,
    create: async ({ data }: { data: Omit<Mission, 'id' | 'createdAt'> }) => {
      const current = await readStore();
      const item = { ...data, id: `MISSION-${data.droneId}-${Date.now()}`, createdAt: new Date() };
      current.missions.push(item); await saveStore(current); return item;
    },
    update: async (id: string, data: Partial<Mission>) => {
      const current = await readStore();
      const idx = current.missions.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      current.missions[idx] = { ...current.missions[idx], ...data };
      await saveStore(current); return current.missions[idx];
    },
    delete: async (id: string) => {
      const current = await readStore();
      const idx = current.missions.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      const [removed] = current.missions.splice(idx, 1);
      await saveStore(current);
      return removed;
    },
  },
  fieldUnit: {
    findMany: async () => (await readStore()).fieldUnits,
    create: async ({ data }: { data: Omit<FieldUnit, 'id' | 'createdAt'> }) => {
      const current = await readStore();
      const item = { ...data, id: `U-${Date.now()}`, createdAt: new Date() };
      current.fieldUnits.push(item); await saveStore(current); return item;
    },
    update: async (id: string, data: Partial<FieldUnit>) => {
      const current = await readStore();
      const idx = current.fieldUnits.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      current.fieldUnits[idx] = { ...current.fieldUnits[idx], ...data };
      await saveStore(current); return current.fieldUnits[idx];
    },
  },
  incident: {
    findMany: async (options?: { search?: string; severity?: string; status?: string }) => {
      const rows = (await readStore()).incidents;
      if (!options) return rows;
      return rows.filter((r) =>
        (!options.search || r.sector.toLowerCase().includes(options.search.toLowerCase()) || r.type.toLowerCase().includes(options.search.toLowerCase())) &&
        (!options.severity || r.severity === options.severity) &&
        (!options.status || r.status === options.status)
      );
    },
    create: async ({ data }: { data: Omit<Incident, 'id' | 'createdAt'> }) => {
      const current = await readStore();
      const item = { ...data, id: `INC-${Date.now()}`, createdAt: new Date() };
      current.incidents.push(item); await saveStore(current); return item;
    },
  },
  reliefCamp: {
    findMany: async (options?: { search?: string; status?: string }) => {
      const rows = (await readStore()).reliefCamps;
      if (!options) return rows;
      return rows.filter((r) =>
        (!options.search || r.name.toLowerCase().includes(options.search.toLowerCase())) &&
        (!options.status || r.status.toLowerCase() === options.status.toLowerCase())
      );
    },
    create: async ({ data }: { data: Omit<ReliefCamp, 'id' | 'createdAt'> }) => {
      const current = await readStore();
      const item = { ...data, id: `CAMP-${Date.now()}`, createdAt: new Date() };
      current.reliefCamps.push(item); await saveStore(current); return item;
    },
    update: async (id: string, data: Partial<ReliefCamp>) => {
      const current = await readStore();
      const idx = current.reliefCamps.findIndex((c) => c.id === id);
      if (idx === -1) return null;
      current.reliefCamps[idx] = { ...current.reliefCamps[idx], ...data };
      await saveStore(current); return current.reliefCamps[idx];
    },
  },
  alert: {
    findMany: async (options?: { severity?: string }) => {
      const rows = (await readStore()).alerts;
      if (!options?.severity) return rows;
      return rows.filter((r) => r.severity.toLowerCase() === options.severity!.toLowerCase());
    },
    create: async ({ data }: { data: Omit<Alert, 'id' | 'createdAt'> }) => {
      const current = await readStore();
      const item = { ...data, id: `ALT-${Date.now()}`, createdAt: new Date() };
      current.alerts.unshift(item); await saveStore(current); return item;
    },
  },
  waterZone: {
    findMany: async (options?: { riskLevel?: string }) => {
      const rows = (await readStore()).waterZones;
      if (!options?.riskLevel) return rows;
      return rows.filter((r) => r.riskLevel.toLowerCase() === options.riskLevel!.toLowerCase());
    },
  },
  mediaItem: {
    findMany: async () => {
      const rows = (await readStore()).mediaItems || [];
      return rows.sort((a, b) => Number(new Date(b.uploadedAt)) - Number(new Date(a.uploadedAt)));
    },
    findById: async (id: string) => {
      const rows = (await readStore()).mediaItems || [];
      return rows.find((m) => m.id === id) || null;
    },
    create: async (data: Omit<MediaItem, 'id' | 'uploadedAt'>) => {
      const current = await readStore();
      if (!current.mediaItems) current.mediaItems = [];
      const item: MediaItem = {
        ...data,
        id: `MEDIA-${Date.now()}-${randomUUID().slice(0, 6)}`,
        uploadedAt: new Date(),
      };
      current.mediaItems.unshift(item);
      await saveStore(current);
      return item;
    },
    delete: async (id: string) => {
      const current = await readStore();
      if (!current.mediaItems) current.mediaItems = [];
      const idx = current.mediaItems.findIndex((m) => m.id === id);
      if (idx === -1) return null;
      const [removed] = current.mediaItems.splice(idx, 1);
      await saveStore(current);
      return removed;
    },
  },
};

export async function clearStore() { await saveStore({ ...emptyStore }); }
export async function seedStore(data: Partial<StoreData>) {
  const current = await readStore();
  await saveStore({ ...current, ...data });
}
