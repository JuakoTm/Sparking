const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const cors = require('cors')({ origin: true });

const firestore = new Firestore();

functions.http('reserveParkingSpot', (req, res) => {
  // Habilitar CORS para peticiones desde el navegador
  cors(req, res, async () => {
    
    if (req.method !== 'POST') {
      return res.status(405).send('Method Not Allowed');
    }

    const { spot_id, license_plate, duration_minutes } = req.body;

    // Validar datos
    if (!spot_id || !license_plate || !duration_minutes) {
      return res.status(400).json({ error: 'Faltan datos: spot_id, license_plate, duration_minutes' });
    }

    const docRef = firestore.collection('parking_spots').doc(spot_id);

    try {
      // Usamos una transacción para evitar condiciones de carrera
      await firestore.runTransaction(async (t) => {
        const doc = await t.get(docRef);

        if (!doc.exists) {
            throw new Error("El puesto no existe.");
        }

        const data = doc.data();
        
        // 0 = Ocupado, 2 = Reservado
        if (data.status === 0) {
            throw new Error("El puesto está ocupado por un vehículo.");
        }
        if (data.status === 2) {
            throw new Error("El puesto ya tiene una reserva activa.");
        }

        // Calcular tiempo de expiración
        const expirationTime = new Date();
        expirationTime.setMinutes(expirationTime.getMinutes() + parseInt(duration_minutes));

        // Actualizar a Estado 2 (Reservado)
        t.update(docRef, {
            status: 2,
            last_changed: FieldValue.serverTimestamp(),
            reservation_data: {
                license_plate: license_plate,
                expires_at: expirationTime,
                duration: parseInt(duration_minutes)
            }
        });
      });

      // Usamos comillas invertidas simples de JS, sin escapar nada raro
      console.log(`Reserva exitosa para ${spot_id}, Placa: ${license_plate}`);
      res.status(200).json({ success: true, message: "Reserva realizada con éxito" });

    } catch (error) {
      console.warn("Error en reserva:", error.message);
      // Retornamos 409 (Conflict)
      res.status(409).json({ error: error.message });
    }
  });
});
