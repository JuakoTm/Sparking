const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.createParkingSpot = async (req, res) => {
  // 1. Headers CORS (Permitir acceso desde tu web)
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    console.log("📥 RECIBIDO:", JSON.stringify(req.body));

    const { id, lat, lng, desc, zone_id, status } = req.body;

    // Validación: ID requerido
    if (!id || id.trim() === '') {
      console.error("❌ Error: Falta ID");
      res.status(400).json({ error: 'Falta el ID del puesto' });
      return;
    }

    // Validación: Coordenadas requeridas
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      console.error("❌ Error: Coordenadas inválidas", lat, lng);
      res.status(400).json({ error: 'Coordenadas inválidas (lat/lng deben ser números)' });
      return;
    }

    const idTrimmed = id.trim().toUpperCase();
    const statusNum = status !== undefined ? parseInt(status) : 1; // 1=libre, 0=ocupado, 2=reservado

    console.log(`✅ Procesando: ID=${idTrimmed}, Lat=${latNum}, Lng=${lngNum}, Status=${statusNum}`);

    // Escribir en Firestore con merge para no sobreescribir
    await firestore.collection('parking_spots').doc(idTrimmed).set({
      id: idTrimmed,
      lat: latNum,
      lng: lngNum,
      desc: desc || `Puesto ${idTrimmed}`,
      status: statusNum,
      zone_id: zone_id || null,
      created_at: new Date(),
      updated_at: new Date()
    }, { merge: true }); // merge:true = actualiza si existe, crea si no

    console.log("💾 Guardado exitoso en Firestore");
    res.status(200).json({ 
      success: true, 
      message: 'Puesto creado/actualizado',
      spot: {
        id: idTrimmed,
        lat: latNum,
        lng: lngNum,
        desc: desc || `Puesto ${idTrimmed}`,
        status: statusNum,
        zone_id: zone_id || null
      }
    });

  } catch (error) {
    console.error("🔥 ERROR CRÍTICO:", error);
    res.status(500).json({ 
      error: 'Error interno: ' + error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
