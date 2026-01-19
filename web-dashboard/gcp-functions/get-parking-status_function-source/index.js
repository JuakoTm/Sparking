const functions = require('@google-cloud/functions-framework');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const cors = require('cors')({ origin: true });

const firestore = new Firestore();

functions.http('getParkingStatus', (req, res) => {
  cors(req, res, async () => {
    try {
      const spotsCollection = firestore.collection('parking_spots');
      const snapshot = await spotsCollection.get();
      
      const spots = [];
      const now = new Date();
      const batch = firestore.batch(); // Para hacer varias actualizaciones juntas
      let hayExpirados = false;

      snapshot.forEach(doc => {
        let data = doc.data();
        let status = data.status;
        const spotId = doc.id;

        // --- LÓGICA DE EXPIRACIÓN ---
        // Si está RESERVADO (2) y tiene fecha de vencimiento...
        if (status === 2 && data.reservation_data && data.reservation_data.expires_at) {
          
          // Convertimos el Timestamp de Firestore a objeto Date de JS
          const expiresAt = data.reservation_data.expires_at.toDate();
          
          // Si la hora actual es MAYOR que la de expiración...
          if (now > expiresAt) {
            console.log(`Reserva vencida en ${spotId}. Liberando puesto...`);
            
            // 1. Preparamos la actualización en la BD (volver a status 1)
            const docRef = spotsCollection.doc(spotId);
            batch.update(docRef, {
              status: 1, // Volver a Disponible
              last_changed: FieldValue.serverTimestamp(),
              reservation_data: FieldValue.delete() // Borrar datos de reserva
            });
            
            hayExpirados = true;
            
            // 2. Falseamos el dato localmente para que el Dashboard lo vea libre YA
            // (sin tener que esperar a la próxima consulta)
            status = 1; 
            data.status = 1;
          }
        }

        spots.push({ id: spotId, ...data });
      });

      // Si encontramos vencidos, ejecutamos las actualizaciones en la BD en segundo plano
      if (hayExpirados) {
        await batch.commit();
        console.log('Limpieza de reservas completada.');
      }

      // Enviamos la lista (con los estados ya corregidos)
      res.status(200).json(spots);
      
    } catch (error) {
      console.error("Error en getParkingStatus:", error);
      res.status(500).send('Error interno del servidor');
    }
  });
});
