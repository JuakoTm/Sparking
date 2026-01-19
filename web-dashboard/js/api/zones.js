// js/api/zones.js
import { CONFIG } from '../config/config.js';
import { logger } from '../utils/logger.js';

// ===== LOCALSTORAGE KEYS =====
const STORAGE_KEY_ZONES = 'sparking_zones_local';
const STORAGE_KEY_ZONES_SYNC = 'sparking_zones_synced_at';

// Cache en memoria para reducir llamadas
let cachedZones = null;
let cacheZonesTimestamp = null;

// ===== Obtener zonas de API o localStorage =====
export async function fetchZones() {
    const now = Date.now();
    const cacheDuration = CONFIG.PERFORMANCE?.CACHE_ZONES || (5 * 60 * 1000);
    
    // Retornar cache si es válido
    if (cachedZones && cacheZonesTimestamp && (now - cacheZonesTimestamp < cacheDuration)) {
        logger.debug('📦 Usando zonas desde cache en memoria');
        return cachedZones;
    }
    
    try {
        logger.debug('📦 Obteniendo zonas de API...');
        const response = await fetch(CONFIG.GET_ZONES_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        logger.debug('✅ Zonas obtenidas de API:', data);
        
        const zones = Array.isArray(data) ? data : (data.zones || []);
        
        // Actualizar cache en memoria
        cachedZones = zones;
        cacheZonesTimestamp = now;
        
        // Guardar en localStorage como respaldo
        localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
        localStorage.setItem(STORAGE_KEY_ZONES_SYNC, new Date().toISOString());
        
        return zones;
    } catch (error) {
        console.error("⚠️ Error obteniendo zonas de API:", error);
        
        // Fallback: intentar cargar de localStorage
        try {
            const stored = localStorage.getItem(STORAGE_KEY_ZONES);
            if (stored) {
                logger.debug('💾 Usando zonas almacenadas localmente');
                return JSON.parse(stored);
            }
        } catch (parseError) {
            console.error('❌ Error leyendo localStorage:', parseError);
        }
        
        // Si todo falla, devolver array vacío
        return [];
    }
}

/**
 * Invalida el cache de zonas
 */
export function invalidateZonesCache() {
    cachedZones = null;
    cacheZonesTimestamp = null;
    logger.debug('🗑️ Cache de zonas invalidado');
}

// ===== Crear/Actualizar/Eliminar zona =====
export async function manageZone(action, zoneData) {
    // action: 'create' | 'delete' | 'update'
    // zoneData: { id?, name, order?, desc?, color? }
    
    try {
        // Invalidar cache para reflejar cambios
        invalidateZonesCache();
        logger.debug(`🌐 Llamando API manageZone: action=${action}`, zoneData);
        
        const response = await fetch(CONFIG.MANAGE_ZONES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...zoneData })
        });
        
        logger.debug('📡 Respuesta status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        logger.debug(`✅ manageZone (${action}) exitoso:`, result);
        
        // Éxito en API: refrescar localStorage
        const zones = await fetchZones();
        localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
        
        return result;
    } catch (error) {
        console.error(`❌ Error en manageZone (${action}):`, error);
        
        // Fallback: guardar localmente
        logger.debug('💾 Guardando cambio localmente como respaldo...');
        try {
            let zones = [];
            const stored = localStorage.getItem(STORAGE_KEY_ZONES);
            if (stored) {
                zones = JSON.parse(stored);
            }
            
            if (action === 'create') {
                const newZone = {
                    id: zoneData.id || `zone_${Date.now()}`,
                    name: zoneData.name,
                    order: zoneData.order || 999,
                    desc: zoneData.desc || '',
                    color: zoneData.color || 'blue',
                    created_at: new Date().toISOString(),
                    _local: true // Marca que está guardado solo localmente
                };
                zones.push(newZone);
                localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
                logger.debug('✅ Zona creada localmente:', newZone);
                return { success: true, zone: newZone, _local: true };
            }
            else if (action === 'update' && zoneData.id) {
                const idx = zones.findIndex(z => z.id === zoneData.id);
                if (idx !== -1) {
                    zones[idx] = { ...zones[idx], ...zoneData, updated_at: new Date().toISOString(), _local: true };
                    localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
                    logger.debug('✅ Zona actualizada localmente:', zones[idx]);
                    return { success: true, zone: zones[idx], _local: true };
                }
            }
            else if (action === 'delete' && zoneData.id) {
                zones = zones.filter(z => z.id !== zoneData.id);
                localStorage.setItem(STORAGE_KEY_ZONES, JSON.stringify(zones));
                logger.debug('✅ Zona eliminada localmente');
                return { success: true, _local: true };
            }
        } catch (localError) {
            console.error('❌ Error guardando localmente:', localError);
        }
        
        return null;
    }
}