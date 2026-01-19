const { Firestore, FieldValue } = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.ingestParkingData = async (req, res) => {
  const spotId = req.body.spot_id;
  const sensorStatus = req.body.status; // 0 (Ocupado) o 1 (Disponible) que viene del sensor

  if (!spotId || sensorStatus === undefined) {
    return res.status(400).send('Faltan parámetros spot_id o status');
  }

  const docRef = firestore.collection('parking_spots').doc(spotId);

  try {
    const doc = await docRef.get();
    
    if (!doc.exists) {
      // Si es nuevo, lo creamos sin preguntar
      await docRef.set({ status: sensorStatus, last_changed: FieldValue.serverTimestamp() });
      return res.status(200).send('Nuevo puesto creado');
    }

    const currentData = doc.data();
    const currentStatus = currentData.status; // El estado en la base de datos

    // --- LÓGICA DE PROTECCIÓN DE RESERVA ---
    
    // CASO 1: El puesto está RESERVADO (2) y el sensor dice DISPONIBLE (1).
    // Significa: El usuario reservó, pero el auto aún no llega.
    // ACCIÓN: Ignoramos al sensor. No borramos la reserva.
    if (currentStatus === 2 && sensorStatus === 1) {
      console.log(`Protegiendo reserva del puesto ${spotId}. Sensor dice 1, pero mantenemos 2.`);
      return res.status(200).send('Puesto reservado, esperando llegada del auto.');
    }

    // CASO 2: El puesto está RESERVADO (2) y el sensor dice OCUPADO (0).
    // Significa: El auto que reservó acaba de llegar.
    // ACCIÓN: Confirmamos la ocupación (Pasamos a 0).
    if (currentStatus === 2 && sensorStatus === 0) {
      console.log(`Reserva cumplida en ${spotId}. Auto detectado.`);
      await docRef.update({
        status: 0, // Pasa a Ocupado
        last_changed: FieldValue.serverTimestamp(),
        reservation_data: FieldValue.delete() // Limpiamos los datos de la reserva para ahorrar espacio
      });
      return res.status(200).send('Reserva completada. Puesto ahora ocupado.');
    }

    // CASO 3: Comportamiento normal (0 a 1, o 1 a 0 sin reservas de por medio)
    if (currentStatus !== sensorStatus) {
      await docRef.update({
        status: sensorStatus,
        last_changed: FieldValue.serverTimestamp()
      });
      console.log(`Actualización normal: ${spotId} cambió a ${sensorStatus}`);
    }

    res.status(200).send('Datos procesados');

  } catch (error) {
    console.error(error);
    res.status(500).send('Error interno');
  }
};