const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

// Util para formatear la hora clave: YYYY-MM-DD-HH
function buildHourKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  return `${y}-${m}-${d}-${h}`; // UTC para consistencia
}

// Agrega los contadores a un objeto acumulador
function addStatusCounts(acc, status) {
  // status: 1=libre, 0=ocupado, 2=reservado
  if (!acc.total) acc.total = 0;
  acc.total += 1;
  if (status === 1) acc.free = (acc.free || 0) + 1;
  else if (status === 0) acc.occupied = (acc.occupied || 0) + 1;
  else if (status === 2) acc.reserved = (acc.reserved || 0) + 1;
}

exports.saveHourlySnapshot = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido. Use GET o POST.' });
    return;
  }

  try {
    // Soporte para generar snapshots históricos (modo desarrollo)
    // POST con { hoursAgo: N, mockData: true } genera snapshot de prueba
    let targetDate = new Date();
    let isDevelopment = false;
    let useMockData = false;
    
    if (req.method === 'POST' && req.body && req.body.hoursAgo) {
      const hoursAgo = parseInt(req.body.hoursAgo, 10);
      targetDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      isDevelopment = true;
      useMockData = req.body.mockData === true;
      console.log(`🧪 Modo desarrollo: generando snapshot de hace ${hoursAgo} horas${useMockData ? ' (MOCK)' : ''}`);
    }
    
    const hourKey = buildHourKey(targetDate);
    console.log(`⏱️ Generando snapshot horario: ${hourKey}`);

    const zonesMap = {}; // zoneId -> counts
    const globalCounts = {};

    if (useMockData) {
      // MOCK DATA: Generar datos realistas para estacionamiento universitario
      const hourOfDay = targetDate.getUTCHours();
      const dayOfWeek = targetDate.getUTCDay(); // 0=domingo, 6=sábado
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Zonas: Federico Froebel (A-01 a A-20 = 20 puestos) e Interior DUOC (I-01 a I-16 = 16 puestos)
      const froebelTotal = 20;
      const interiorTotal = 16;
      const totalSpots = froebelTotal + interiorTotal;
      
      // Patrones de ocupación para universidad (hora Chile = UTC-3)
      let froebelOccupancy = 0.15; // Base muy baja
      let interiorOccupancy = 0.10;
      
      if (!isWeekend) {
        // LUNES A VIERNES - Patrones universitarios típicos (Chile = UTC-3, entonces sumamos 3 a hora Chile para UTC)
        if (hourOfDay >= 11 && hourOfDay <= 13) { // 8:00-10:00 Chile (horario de entrada)
          froebelOccupancy = 0.70 + Math.random() * 0.15; // 70-85%
          interiorOccupancy = 0.75 + Math.random() * 0.15; // 75-90%
        } else if (hourOfDay >= 14 && hourOfDay <= 18) { // 11:00-15:00 Chile (hora pico)
          froebelOccupancy = 0.85 + Math.random() * 0.10; // 85-95%
          interiorOccupancy = 0.88 + Math.random() * 0.10; // 88-98%
        } else if (hourOfDay >= 19 && hourOfDay <= 22) { // 16:00-19:00 Chile (clases tarde)
          froebelOccupancy = 0.65 + Math.random() * 0.15; // 65-80%
          interiorOccupancy = 0.70 + Math.random() * 0.15; // 70-85%
        } else if (hourOfDay >= 23 || hourOfDay <= 1) { // 20:00-22:00 Chile (salida nocturna)
          froebelOccupancy = 0.40 + Math.random() * 0.15; // 40-55%
          interiorOccupancy = 0.45 + Math.random() * 0.15; // 45-60%
        } else if (hourOfDay >= 2 && hourOfDay <= 4) { // 23:00-01:00 Chile (clases nocturnas finales)
          froebelOccupancy = 0.20 + Math.random() * 0.15; // 20-35%
          interiorOccupancy = 0.25 + Math.random() * 0.15; // 25-40%
        } else { // Madrugada (universidad cerrada)
          froebelOccupancy = 0.03 + Math.random() * 0.07; // 3-10%
          interiorOccupancy = 0.02 + Math.random() * 0.06; // 2-8%
        }
      } else {
        // FIN DE SEMANA - Muy poca ocupación (universidad casi vacía)
        if (hourOfDay >= 14 && hourOfDay <= 22) { // 11:00-19:00 Chile (alguna actividad menor)
          froebelOccupancy = 0.10 + Math.random() * 0.12; // 10-22%
          interiorOccupancy = 0.08 + Math.random() * 0.10; // 8-18%
        } else {
          froebelOccupancy = 0.01 + Math.random() * 0.04; // 1-5%
          interiorOccupancy = 0.01 + Math.random() * 0.03; // 1-4%
        }
      }
      
      // Calcular puestos por zona
      const froebelOccupied = Math.floor(froebelTotal * froebelOccupancy);
      const froebelReserved = Math.floor(froebelTotal * 0.03); // 3% reservado
      const froebelUsed = Math.min(froebelOccupied + froebelReserved, froebelTotal);
      const froebelFree = froebelTotal - froebelUsed;
      
      const interiorOccupied = Math.floor(interiorTotal * interiorOccupancy);
      const interiorReserved = Math.floor(interiorTotal * 0.04); // 4% reservado
      const interiorUsed = Math.min(interiorOccupied + interiorReserved, interiorTotal);
      const interiorFree = interiorTotal - interiorUsed;
      
      // Zona Federico Froebel (20 puestos A-01 a A-20)
      zonesMap['zone_1764307623391'] = {
        free: froebelFree,
        occupied: Math.min(froebelOccupied, froebelTotal - froebelReserved),
        reserved: froebelReserved,
        total: froebelTotal
      };
      
      // Zona Interior DUOC (16 puestos I-01 a I-16)
      zonesMap['zone_1764306251630'] = {
        free: interiorFree,
        occupied: Math.min(interiorOccupied, interiorTotal - interiorReserved),
        reserved: interiorReserved,
        total: interiorTotal
      };
      
      // Totales globales
      globalCounts.free = froebelFree + interiorFree;
      globalCounts.occupied = zonesMap['zone_1764307623391'].occupied + zonesMap['zone_1764306251630'].occupied;
      globalCounts.reserved = froebelReserved + interiorReserved;
      globalCounts.total = totalSpots;
      
    } else {
      // DATOS REALES: Leer de Firestore
      const spotsSnap = await firestore.collection('parking_spots').get();
      
      spotsSnap.forEach(doc => {
        const data = doc.data();
        const zoneId = data.zone_id || 'SinZona';
        const status = data.status; // 1 libre, 0 ocupado, 2 reservado
        if (!zonesMap[zoneId]) zonesMap[zoneId] = {};
        addStatusCounts(zonesMap[zoneId], status);
        addStatusCounts(globalCounts, status);
      });
    }

    // Calcular porcentaje de ocupación global (ocupado + reservado sobre total)
    const occupiedPlusReserved = (globalCounts.occupied || 0) + (globalCounts.reserved || 0);
    const rawPct = globalCounts.total ? (occupiedPlusReserved / globalCounts.total) * 100 : 0;
    const occupancyPct = Math.min(100, Math.max(0, Math.round(rawPct))); // Asegurar rango 0-100

    // Construir documento
    const docData = {
      hour_key: hourKey,
      timestamp: targetDate.toISOString(), // ISO string para auditoría
      ts: targetDate.getTime(), // número para queries eficientes
      global: {
        free: globalCounts.free || 0,
        occupied: globalCounts.occupied || 0,
        reserved: globalCounts.reserved || 0,
        total: globalCounts.total || 0,
        occupancyPct
      },
      zones: {},
      created_at: targetDate
    };

    Object.keys(zonesMap).forEach(zoneId => {
      const z = zonesMap[zoneId];
      const occPlusRes = (z.occupied || 0) + (z.reserved || 0);
      const pct = z.total ? Math.round((occPlusRes / z.total) * 100) : 0;
      docData.zones[zoneId] = {
        free: z.free || 0,
        occupied: z.occupied || 0,
        reserved: z.reserved || 0,
        total: z.total || 0,
        occupancyPct: pct
      };
    });

    // Guardar (id = hour_key para idempotencia)
    const ref = firestore.collection('occupancy_history').doc(hourKey);
    await ref.set(docData, { merge: true });
    console.log(`✅ Snapshot guardado: occupancy_history/${hourKey}`);

    // Retención: eliminar > 30 días
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const oldQuery = await firestore
      .collection('occupancy_history')
      .where('ts', '<', cutoffMs)
      .get();

    let deleted = 0;
    if (!oldQuery.empty) {
      const batch = firestore.batch();
      oldQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
        deleted += 1;
      });
      await batch.commit();
      console.log(`🧹 Retención aplicada. Documentos borrados: ${deleted}`);
    } else {
      console.log('🧹 No hay documentos para borrar por retención.');
    }

    res.status(200).json({
      success: true,
      message: isDevelopment ? 'Snapshot histórico generado (dev)' : 'Snapshot horario generado',
      hour_key: hourKey,
      timestamp: targetDate.toISOString(),
      retention_deleted: deleted,
      global: docData.global,
      zones_count: Object.keys(docData.zones).length,
      development_mode: isDevelopment
    });
  } catch (error) {
    console.error('❌ Error en saveHourlySnapshot:', error);
    res.status(500).json({ error: 'Error interno: ' + error.message });
  }
};
