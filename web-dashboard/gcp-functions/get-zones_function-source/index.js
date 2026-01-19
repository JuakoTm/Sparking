const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.getZones = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    // Obtener zonas ordenadas por el campo 'order'
    const snapshot = await firestore
      .collection('parking_zones')
      .orderBy('order', 'asc')
      .get();

    const zones = [];
    snapshot.forEach(doc => {
      zones.push(doc.data());
    });
    
    console.log(`📦 Zonas obtenidas: ${zones.length}`);

    // Si no hay zonas, devolvemos una por defecto
    if (zones.length === 0) {
      console.log('⚠️ No hay zonas. Devolviendo zona por defecto.');
      zones.push({
        id: 'General',
        name: 'General',
        order: 1,
        desc: 'Zona general por defecto',
        color: 'blue',
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    res.status(200).json(zones);

  } catch (error) {
    console.error('❌ Error en getZones:', error);
    res.status(500).json({ error: 'Error interno: ' + error.message });
  }
};
