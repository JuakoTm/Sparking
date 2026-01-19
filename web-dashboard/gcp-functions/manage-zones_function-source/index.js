const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

exports.manageZones = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { action, id, name, order, desc, color } = req.body;

    console.log(`📋 Acción: ${action}`, { id, name, order, desc, color });

    // ===== CREATE: Crear nueva zona =====
    if (action === 'create') {
      if (!name || name.trim() === '') {
        res.status(400).json({ error: 'El nombre de la zona es requerido' });
        return;
      }

      // Generar ID automático si no se proporciona
      const zoneId = id || `zone_${Date.now()}`;
      const newOrder = order || 999; // Si no hay orden, va al final

      await firestore.collection('parking_zones').doc(zoneId).set({
        id: zoneId,
        name: name.trim(),
        order: newOrder,
        desc: desc || '',
        color: color || 'blue',
        created_at: new Date(),
        updated_at: new Date()
      });

      console.log(`✅ Zona creada: ${zoneId}`);
      res.status(200).json({ 
        success: true, 
        message: 'Zona creada exitosamente',
        zone: { id: zoneId, name, order: newOrder, desc, color }
      });
    }

    // ===== UPDATE: Editar zona existente =====
    else if (action === 'update') {
      if (!id) {
        res.status(400).json({ error: 'El ID de la zona es requerido' });
        return;
      }

      if (!name || name.trim() === '') {
        res.status(400).json({ error: 'El nombre de la zona es requerido' });
        return;
      }

      // Actualizar solo los campos que se envíen
      const updateData = {
        name: name.trim(),
        updated_at: new Date()
      };

      if (order !== undefined) updateData.order = order;
      if (desc !== undefined) updateData.desc = desc;
      if (color !== undefined) updateData.color = color;

      await firestore.collection('parking_zones').doc(id).update(updateData);

      console.log(`✅ Zona actualizada: ${id}`);
      res.status(200).json({ 
        success: true, 
        message: 'Zona actualizada exitosamente',
        zone: { id, ...updateData }
      });
    }

    // ===== DELETE: Eliminar zona =====
    else if (action === 'delete') {
      if (!id) {
        res.status(400).json({ error: 'El ID de la zona es requerido' });
        return;
      }

      await firestore.collection('parking_zones').doc(id).delete();

      console.log(`✅ Zona eliminada: ${id}`);
      res.status(200).json({ 
        success: true, 
        message: 'Zona eliminada exitosamente'
      });
    }

    // ===== Acción no reconocida =====
    else {
      res.status(400).json({ error: `Acción no válida: ${action}. Use 'create', 'update' o 'delete'` });
    }

  } catch (error) {
    console.error('❌ Error en manageZones:', error);
    res.status(500).json({ error: 'Error interno: ' + error.message });
  }
};
