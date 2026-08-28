import { clearStore, seedStore } from './store';

async function main() {
  await clearStore();

  await seedStore({
    settlements: [
      { id: 'SET-01', name: 'Sector 12 Village', location: 'Sector 12 North Riverbank', status: 'Flood Affected', population: 620, households: 140, latitude: 28.6139, longitude: 77.2090, severity: 'CRITICAL', evacuationPriority: 'Immediate', evacuatedPercentage: 65, waterDepth: '1.4m', nearestCamp: 'Sector 14 Shelter (1.8 km)' },
      { id: 'SET-02', name: 'Riverside Colony', location: 'Sector 12 South Embankment', status: 'Partially Submerged', population: 450, households: 95, latitude: 28.6100, longitude: 77.2120, severity: 'HIGH', evacuationPriority: 'Immediate', evacuatedPercentage: 80, waterDepth: '1.8m', nearestCamp: 'Riverside High School (1.2 km)' },
      { id: 'SET-03', name: 'East Hamlet', location: 'East Levee Approach', status: 'Flood Affected', population: 280, households: 60, latitude: 28.6160, longitude: 77.2200, severity: 'HIGH', evacuationPriority: 'High', evacuatedPercentage: 50, waterDepth: '0.9m', nearestCamp: 'Camp Bravo (3.1 km)' },
      { id: 'SET-04', name: 'Old Market Settlement', location: 'Central Sector 12', status: 'Partially Submerged', population: 510, households: 115, latitude: 28.6120, longitude: 77.2050, severity: 'MODERATE', evacuationPriority: 'High', evacuatedPercentage: 40, waterDepth: '0.7m', nearestCamp: 'Sector 14 Shelter (2.4 km)' },
      { id: 'SET-05', name: 'Greenfields Basti', location: 'West Lowlands Catchment', status: 'Flood Affected', population: 340, households: 75, latitude: 28.6080, longitude: 77.2010, severity: 'CRITICAL', evacuationPriority: 'Immediate', evacuatedPercentage: 70, waterDepth: '1.1m', nearestCamp: 'South Hills Stadium (2.9 km)' },
    ],

    roadRoutes: [
      { id: 'R-01', name: 'Highway 4 Overpass', category: 'Arterial Highway', status: 'BLOCKED', waterDepth: '1.2m', clearance: 'Impassable', condition: 'Heavy debris & 1.2m standing water', alternativeRoute: 'Northern Ridge Bypass Corridor' },
      { id: 'R-02', name: 'Bridge Road Crossing', category: 'Bridge Crossing', status: 'BLOCKED', waterDepth: '1.5m', clearance: 'Impassable', condition: 'Structural safety cordon — high river shear flow', alternativeRoute: 'East Levee Causeway' },
      { id: 'R-03', name: 'Main Street Junction', category: 'Secondary Road', status: 'SUBMERGED', waterDepth: '0.85m', clearance: 'Impassable', condition: 'Water depth exceeds safe vehicular limit', alternativeRoute: 'Market Link Bypass' },
      { id: 'R-04', name: 'River Access Way', category: 'Local Street', status: 'SUBMERGED', waterDepth: '1.1m', clearance: 'Impassable', condition: 'Direct overflow from levee breach', alternativeRoute: 'None (Boat extraction active)' },
      { id: 'R-05', name: 'Sector 14 Arterial Corridor', category: 'Arterial Highway', status: 'PARTIALLY AFFECTED', waterDepth: '0.3m', clearance: 'High Clearance (>4x4)', condition: 'Single lane with police escort; shoulder inundated', alternativeRoute: 'Direct arterial transit' },
      { id: 'R-06', name: 'North Ring Corridor', category: 'Evacuation Corridor', status: 'OPEN', waterDepth: '0.0m', clearance: 'All Vehicles', condition: 'Fully dry; designated Primary Safe Evacuation Route', alternativeRoute: 'Primary corridor' },
    ],

    infrastructureAssets: [
      { id: 'B-02', asset: 'Bridge B-02', name: 'Bridge B-02 River Crossing', type: 'BRIDGE', status: 'AT RISK', confidence: 0.91, latitude: 28.6145, longitude: 77.2080, location: 'Sector 12 River Crossing', structuralIntegrity: 'Critical (60%)', waterLevel: '1.8m (Pier Submerged)', backupPower: 'Solar Active', detail: 'Flow Shear 12,000 m³/s impacting central pier foundation', actionTaken: 'Traffic cordoned; drone structural sensor active', lastInspection: '14:25 UTC' },
      { id: 'H-01', asset: 'Hospital H-01', name: 'Hospital H-01 Regional Center', type: 'HOSPITAL', status: 'SAFE', confidence: 0.99, latitude: 28.6175, longitude: 77.2210, location: 'Sector 12 East Medical Corridor', structuralIntegrity: 'Nominal (100%)', waterLevel: '0.0m (Dry)', backupPower: 'Grid Online', detail: 'Fully operational — 120 Bed Trauma & ICU', actionTaken: 'Designated primary casualty intake', lastInspection: '14:30 UTC' },
      { id: 'G-03', asset: 'Gov Building G-03', name: 'Government Building G-03', type: 'GOVERNMENT', status: 'DAMAGED', confidence: 0.87, latitude: 28.6115, longitude: 77.2055, location: 'Civic Administrative Center', structuralIntegrity: 'Monitored (85%)', waterLevel: '0.4m Ingress', backupPower: 'Generator 100%', detail: 'Ground floor water ingress; records moved to upper floors', actionTaken: 'Ops shifted to Sector 14 HQ', lastInspection: '14:15 UTC' },
      { id: 'PS-01', asset: 'Substation Sub-04', name: 'Substation Sub-04 Grid', type: 'POWER', status: 'AT RISK', confidence: 0.82, latitude: 28.6090, longitude: 77.2160, location: 'Sector 14 Grid Corridor', structuralIntegrity: 'Monitored (85%)', waterLevel: '0.5m Perimeter', backupPower: 'Battery Offline', detail: 'Telemetry offline; sandbags deployed around transformer bays', actionTaken: 'Power diverted via Sector 10 feeder', lastInspection: '14:00 UTC' },
    ],

    waterZones: [
      { id: 'Z-01', name: 'Sector 12 Riverbank & Lower Embankment', waterDepth: '3.2m', coveragePct: 88, flowDirection: 'South-East (1.8 m/s)', status: 'Critical Rise', riskLevel: 'High', lastSurvey: '14:30 UTC' },
      { id: 'Z-02', name: 'Riverside Agricultural Basin', waterDepth: '2.1m', coveragePct: 74, flowDirection: 'South-East (1.4 m/s)', status: 'Critical Rise', riskLevel: 'High', lastSurvey: '14:25 UTC' },
      { id: 'Z-03', name: 'East Lowland Catchment Area', waterDepth: '1.4m', coveragePct: 62, flowDirection: 'East (0.9 m/s)', status: 'Elevated', riskLevel: 'Medium', lastSurvey: '14:15 UTC' },
      { id: 'Z-04', name: 'Old Market Central Basin', waterDepth: '0.8m', coveragePct: 45, flowDirection: 'South (0.6 m/s)', status: 'Elevated', riskLevel: 'Medium', lastSurvey: '14:10 UTC' },
      { id: 'Z-05', name: 'North-West Ridge Drainage Corridor', waterDepth: '0.3m', coveragePct: 22, flowDirection: 'South-East (1.1 m/s)', status: 'Stable', riskLevel: 'Low', lastSurvey: '13:50 UTC' },
    ],

    missions: [
      { id: 'MISSION-DRONE-001', createdAt: new Date(), droneId: 'DRONE-001', targetArea: 'Sector 12 & Riverbend Embankment', status: 'Active', batteryPct: 84, altitudeM: 120, speedKmh: 45, latitude: 28.6139, longitude: 77.2090, signalQuality: 92, flightMode: 'AUTONOMOUS RECON' },
      { id: 'MISSION-DRONE-002', createdAt: new Date(), droneId: 'DRONE-002', targetArea: 'Sector 14 Grid Perimeter', status: 'Standby', batteryPct: 98, altitudeM: 0, speedKmh: 0, latitude: 28.6180, longitude: 77.2150, signalQuality: 98, flightMode: 'READY FOR DISPATCH' },
    ],

    fieldUnits: [
      { id: 'U-01', createdAt: new Date(), name: 'NDRF Team Alpha', type: 'Special Rescue Squad', location: 'Sector 12 (North)', status: 'En Route', personnel: 8 },
      { id: 'U-02', createdAt: new Date(), name: 'Boat Unit 03', type: 'Zodiac Swiftwater', location: 'Riverbend District', status: 'On Site', personnel: 4 },
      { id: 'U-03', createdAt: new Date(), name: 'Medical Response 1', type: 'Paramedic Mobile', location: 'Camp Bravo Base', status: 'Available', personnel: 6 },
      { id: 'U-04', createdAt: new Date(), name: 'Air Recon Wing 2', type: 'Drone & Helicopter Hub', location: 'Sector 4 Airfield', status: 'On Site', personnel: 5 },
    ],

    incidents: [
      { id: 'INC-2023-1027-01', createdAt: new Date(), date: '2023-10-27 14:45 UTC', sector: 'Sector 12 (North Riverbank)', type: 'Flash Flood & Breach', severity: 'Critical', victims: 7, status: 'Under Action' },
      { id: 'INC-2023-1027-02', createdAt: new Date(), date: '2023-10-27 12:15 UTC', sector: 'Highway 4 Overpass', type: 'Submerged Arterial Road', severity: 'Warning', victims: 0, status: 'Under Action' },
      { id: 'INC-2023-1026-08', createdAt: new Date(), date: '2023-10-26 19:30 UTC', sector: 'Sector 14 Residential Block', type: 'Power Grid Failure & Flooding', severity: 'Warning', victims: 12, status: 'Resolved' },
      { id: 'INC-2023-1026-05', createdAt: new Date(), date: '2023-10-26 10:00 UTC', sector: 'East River Dam Approach', type: 'Levee Seepage Risk', severity: 'Moderate', victims: 0, status: 'Archived' },
    ],

    reliefCamps: [
      { id: 'camp-1', createdAt: new Date(), name: 'Sector 14 Shelter', location: 'North District School', status: 'Critical', occupancy: 950, capacity: 1000, foodDays: '1 Day', foodCritical: true, waterDays: '2 Days', waterCritical: true, medsStatus: 'Low', personnel: 24 },
      { id: 'camp-2', createdAt: new Date(), name: 'Riverside High School', location: 'West Bank Zone', status: 'Warning', occupancy: 410, capacity: 500, foodDays: '5 Days', waterDays: '4 Days', medsStatus: 'Ok', personnel: 12 },
      { id: 'camp-3', createdAt: new Date(), name: 'Camp Bravo', location: 'South Hills Stadium', status: 'Stable', occupancy: 450, capacity: 1000, foodDays: '10+ Days', waterDays: '10+ Days', medsStatus: 'Ok', personnel: 30 },
    ],

    alerts: [
      { id: 'ALT-1092', createdAt: new Date(), title: 'Flash Flood Warning - Evacuate Zone 4', severity: 'Critical', area: 'Lower Basin / Sectors 11-14', time: '14:15 UTC', reach: '12,450 / 15,000 Recipients', body: 'Immediate evacuation order issued for all residents within 500m of Lower Basin Riverbank due to rapid water surge.' },
      { id: 'ALT-1091', createdAt: new Date(), title: 'Road Inundation Advisory', severity: 'Warning', area: 'Sector 4 Highway Overpass', time: '13:40 UTC', reach: '3,200 / 3,500 Recipients', body: 'Highway 4 impassable due to 1.2m water level. Heavy vehicular traffic diverted to Northern Ridge Bypass.' },
      { id: 'ALT-1090', createdAt: new Date(), title: 'Water & Ration Supply Restored', severity: 'Info', area: 'Camp Alpha Primary Shelter', time: '11:20 UTC', reach: '800 / 800 Recipients', body: 'Fresh potable drinking water and emergency ration distribution is now active at Sector 14 Shelter.' },
    ],
  });

  console.log('✅ Assessment store seeded with full operational data.');
  console.log('   → 5 settlements, 6 roads, 4 infrastructure assets');
  console.log('   → 5 water zones, 2 missions, 4 field units');
  console.log('   → 4 incidents, 3 relief camps, 3 alerts');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
