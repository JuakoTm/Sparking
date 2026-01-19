const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.deleteParkingSpot = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { id } = req.body;

    if (!id || id.trim() === '') {
      console.error("❌ Error: Falta ID");
      res.status(400).json({ error: 'Falta el ID del puesto' });
      return;
    }

    const idTrimmed = id.trim().toUpperCase();

    console.log(`🗑️ Eliminando puesto: ${idTrimmed}`);

    // Borrar documento de Firestore
    await firestore.collection('parking_spots').doc(idTrimmed).delete();

    console.log(`✅ Puesto eliminado: ${idTrimmed}`);
    res.status(200).json({ 
      success: true, 
      message: `Puesto ${idTrimmed} eliminado exitosamente` 
    });

  } catch (error) {
    console.error('❌ Error en deleteParkingSpot:', error);
    res.status(500).json({ 
      error: 'Error interno: ' + error.message 
    });
  }
};
