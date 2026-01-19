const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.getOccupancyHistory = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido. Use GET.' });
    return;
  }

  try {
    // Parámetros: days (1-30), zoneId opcional
    const daysParam = parseInt(req.query.days || '1', 10);
    const days = isNaN(daysParam) ? 1 : Math.min(Math.max(daysParam, 1), 30);
    const zoneId = req.query.zoneId || null;

    // Rango temporal
    const now = Date.now();
    const startTs = now - days * 24 * 60 * 60 * 1000;

    console.log(`📥 Historial: últimos ${days} días${zoneId ? ' zona=' + zoneId : ''}`);

    // Query Firestore
    const snap = await firestore
      .collection('occupancy_history')
      .where('ts', '>=', startTs)
      .orderBy('ts', 'asc')
      .get();

    const samples = [];
    snap.forEach(doc => {
      const data = doc.data();
      const entry = {
        hour_key: data.hour_key,
        ts: data.ts,
        global: data.global,
      };
      if (zoneId) {
        // Añadir solo la zona solicitada (si existe)
        const z = (data.zones && data.zones[zoneId]) ? data.zones[zoneId] : null;
        entry.zone = z;
      } else {
        // Resumen por zonas: solo los IDs y ocupación (para evitar payload gigante)
        if (data.zones) {
          entry.zones_summary = Object.keys(data.zones).map(zId => ({
            id: zId,
            occupancyPct: data.zones[zId].occupancyPct,
            free: data.zones[zId].free,
            occupied: data.zones[zId].occupied,
            reserved: data.zones[zId].reserved,
            total: data.zones[zId].total
          }));
        }
      }
      samples.push(entry);
    });

    res.status(200).json({
      success: true,
      days,
      zoneId,
      count: samples.length,
      from: new Date(startTs).toISOString(),
      to: new Date(now).toISOString(),
      samples
    });
  } catch (error) {
    console.error('❌ Error en getOccupancyHistory:', error);
    res.status(500).json({ error: 'Error interno: ' + error.message });
  }
};
