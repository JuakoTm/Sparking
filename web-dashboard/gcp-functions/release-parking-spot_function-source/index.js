const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const cors = require('cors')({ origin: true });
const firestore = new Firestore();

functions.http('releaseParkingSpot', (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    const { spot_id } = req.body;
    if (!spot_id) return res.status(400).json({ error: 'Falta spot_id' });

    const docRef = firestore.collection('parking_spots').doc(spot_id);

    try {
      await firestore.runTransaction(async (t) => {
        const doc = await t.get(docRef);
        if (!doc.exists) throw new Error("El puesto no existe");
        
        const data = doc.data();

        // Solo liberamos si está en estado 2 (Reservado)
        if (data.status !== 2) {
            throw new Error("El puesto no tiene una reserva activa para cancelar.");
        }

        // Volver a Disponible (1)
        t.update(docRef, {
            status: 1,
            last_changed: FieldValue.serverTimestamp(),
            reservation_data: FieldValue.delete()
        });
      });

      console.log(`Reserva cancelada para ${spot_id}`);
      res.status(200).json({ success: true });

    } catch (e) {
      console.warn("Error cancelando:", e.message);
      res.status(409).json({ error: e.message });
    }
  });
});
