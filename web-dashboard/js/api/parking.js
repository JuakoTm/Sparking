// js/api/parking.js
import { CONFIG } from '../config/config.js';
import { logger } from '../utils/logger.js';

const STORAGE_KEY_SPOTS = 'sparking_spots_local';
const STORAGE_KEY_SPOTS_SYNC = 'sparking_spots_synced_at';

// Cache en memoria para reducir llamadas a API
let cachedStatus = null;
let cacheStatusTimestamp = null;

/**
 * Obtiene el estado actual de todos los puestos
 */
export async function fetchParkingStatus() {
    const now = Date.now();
    const cacheDuration = CONFIG.PERFORMANCE?.CACHE_PARKING_STATUS || 15000;
    
    // Retornar cache si es válido
    if (cachedStatus && cacheStatusTimestamp && (now - cacheStatusTimestamp < cacheDuration)) {
        logger.debug('📦 Usando estado de puestos desde cache en memoria');
        return cachedStatus;
    }
    
    try {
        logger.debug('📍 Obteniendo estado de puestos de API...');
        const response = await fetch(CONFIG.GET_STATUS_API_URL);
        if (!response.ok) throw new Error('Error de red al obtener status');
        const data = await response.json();
        logger.debug('✅ Puestos obtenidos:', data.length);
        
        // Actualizar cache en memoria
        cachedStatus = data;
        cacheStatusTimestamp = now;
        
        // Guardar en localStorage
        localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(data));
        localStorage.setItem(STORAGE_KEY_SPOTS_SYNC, new Date().toISOString());
        
        return data;
    } catch (error) {
        console.error("⚠️ Error obteniendo puestos:", error);
        
        // Fallback: usar localStorage
        try {
            const stored = localStorage.getItem(STORAGE_KEY_SPOTS);
            if (stored) {
                logger.debug('💾 Usando puestos almacenados localmente');
                return JSON.parse(stored);
            }
        } catch (parseError) {
            console.error('❌ Error leyendo localStorage:', parseError);
        }
        
        throw error;
    }
}

/**
 * Invalida el cache de estado de puestos
 */
export function invalidateParkingCache() {
    cachedStatus = null;
    cacheStatusTimestamp = null;
    logger.debug('🗑️ Cache de estado de puestos invalidado');
}

/**
 * Crea o actualiza un puesto (Solo Admin)
 */
export async function createSpot(data) {
    // data = { id, lat, lng, desc, zone_id?, status? }
    try {
        // Invalidar cache para reflejar cambios
        invalidateParkingCache();
        logger.debug('🏗️ Creando puesto:', data);
        const response = await fetch(CONFIG.CREATE_SPOT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        logger.debug('✅ Puesto creado:', result);
        
        // Refrescar cache local
        try {
            const spots = await fetchParkingStatus();
            localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
        } catch (e) {
            console.warn('No se pudo actualizar cache');
        }
        
        return result;
    } catch (error) {
        console.error("❌ Error creando puesto:", error);
        
        // Fallback local
        try {
            let spots = [];
            const stored = localStorage.getItem(STORAGE_KEY_SPOTS);
            if (stored) spots = JSON.parse(stored);
            
            const newSpot = {
                ...data,
                id: data.id.toUpperCase(),
                status: data.status || 1,
                created_at: new Date().toISOString(),
                _local: true
            };
            spots.push(newSpot);
            localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
            logger.debug('✅ Puesto creado localmente:', newSpot);
            return { success: true, spot: newSpot, _local: true };
        } catch (e) {
            console.error('Error en fallback local:', e);
            return null;
        }
    }
}

/**
 * Actualiza información de un puesto (Solo Admin)
 */
export async function updateSpot(spotId, data) {
    // data puede contener: desc, zone_id, lat, lng, status, etc
    try {
        // Invalidar cache para reflejar cambios
        invalidateParkingCache();
        logger.debug('✏️ Actualizando puesto:', spotId, data);
        const updateUrl = CONFIG.UPDATE_SPOT_URL || CONFIG.CREATE_SPOT_URL;
        const response = await fetch(updateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: spotId, ...data })
        });
        // Intentar leer cuerpo JSON (si lo hay)
        let result = null;
        try { result = await response.json(); } catch (e) { result = null; }
        if (!response.ok) {
            const msg = (result && (result.message || result.error)) ? (result.message || result.error) : `Status ${response.status}`;
            throw new Error('API error actualizando puesto: ' + msg);
        }
        logger.debug('✅ Puesto actualizado:', result);
        
        // Actualizar en localStorage
        try {
            let spots = [];
            const stored = localStorage.getItem(STORAGE_KEY_SPOTS);
            if (stored) spots = JSON.parse(stored);
            
            const idx = spots.findIndex(s => s.id === spotId);
            if (idx !== -1) {
                spots[idx] = { ...spots[idx], ...data, updated_at: new Date().toISOString() };
                localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
            }
        } catch (e) {
            console.warn('No se pudo actualizar cache local');
        }
        
        return result;
    } catch (error) {
        console.error("❌ Error actualizando puesto:", error);
        
        // Fallback local
        try {
            let spots = [];
            const stored = localStorage.getItem(STORAGE_KEY_SPOTS);
            if (stored) spots = JSON.parse(stored);
            
            const idx = spots.findIndex(s => s.id === spotId);
            if (idx !== -1) {
                spots[idx] = { ...spots[idx], ...data, updated_at: new Date().toISOString(), _local: true };
                localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
                logger.debug('✅ Puesto actualizado localmente:', spots[idx]);
                return { success: true, spot: spots[idx], _local: true };
            }
        } catch (e) {
            console.error('Error en fallback local:', e);
        }
        
        return null;
    }
}

/**
 * Elimina un puesto (Solo Admin)
 */
export async function deleteSpot(id) {
    try {
        // Invalidar cache para reflejar eliminación
        invalidateParkingCache();
        logger.debug('🗑️ Eliminando puesto:', id);
        await fetch(CONFIG.DELETE_SPOT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        logger.debug('✅ Puesto eliminado');
        
        // Actualizar localStorage
        try {
            let spots = [];
            const stored = localStorage.getItem(STORAGE_KEY_SPOTS);
            if (stored) spots = JSON.parse(stored);
            
            spots = spots.filter(s => s.id !== id);
            localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
        } catch (e) {
            console.warn('No se pudo actualizar cache local');
        }
        
        return true;
    } catch (error) {
        console.error("❌ Error eliminando puesto:", error);
        
        // Fallback local
        try {
            let spots = [];
            const stored = localStorage.getItem(STORAGE_KEY_SPOTS);
            if (stored) spots = JSON.parse(stored);
            
            spots = spots.filter(s => s.id !== id);
            localStorage.setItem(STORAGE_KEY_SPOTS, JSON.stringify(spots));
            logger.debug('✅ Puesto eliminado localmente');
            return true;
        } catch (e) {
            console.error('Error en fallback local:', e);
            return false;
        }
    }
}

/**
 * Reserva un puesto
 */
export async function reserveSpot(spotId, licensePlate, durationMinutes) {
    try {
        // Invalidar cache para forzar refresh
        invalidateParkingCache();
        const response = await fetch(CONFIG.RESERVATION_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                spot_id: spotId, 
                license_plate: licensePlate, 
                duration_minutes: durationMinutes 
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || 'Error al reservar');
        }
        
        return await response.json();
    } catch (error) {
        throw error; // Importante para mostrar el error en el modal
    }
}

/**
 * Libera un puesto (Cancelar reserva)
 */
export async function releaseSpot(spotId) {
    try {
        // Invalidar cache para forzar refresh
        invalidateParkingCache();
        const response = await fetch(CONFIG.RELEASE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spot_id: spotId })
        });
        
        if (!response.ok) throw new Error('Falló la liberación del puesto');
        return true;
    } catch (error) {
        console.error("API Error (Release):", error);
        return false;
    }
}

/**
 * Asigna una zona a múltiples puestos (operación cliente que usa updateSpot)
 * @param {string} zoneId - id de la zona destino ('' para sin asignar)
 * @param {Array<string>} spotIds - lista de IDs de puestos
 */
export async function bulkAssignSpots(zoneId, spotIds) {
    const results = [];
    for (const id of spotIds) {
        try {
            const res = await updateSpot(id, { zone_id: zoneId || '' });
            results.push({ id, success: true, res });
        } catch (err) {
            console.error('Error asignando spot', id, err);
            results.push({ id, success: false, error: err });
        }
    }
    return results;
}

/**
 * Elimina varios puestos en serie (usa deleteSpot)
 * @param {Array<string>} spotIds
 */
export async function bulkDeleteSpots(spotIds) {
    const results = [];
    for (const id of spotIds) {
        try {
            const res = await deleteSpot(id);
            results.push({ id, success: !!res });
        } catch (err) {
            console.error('Error eliminando spot', id, err);
            results.push({ id, success: false, error: err });
        }
    }
    return results;
}