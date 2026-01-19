// js/api/history.js
import { CONFIG } from '../config/config.js';

const HISTORY_API_URL = 'https://southamerica-west1-s-parking-476007.cloudfunctions.net/get-occupancy-history';

// Cache en memoria
let cachedHistory = null;
let cacheTimestamp = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos (optimizado para reducir costos)

/**
 * Obtiene el historial de ocupación desde el servidor
 * @param {number} days - Días de historial (1-30)
 * @param {string|null} zoneId - ID de zona opcional para filtrar
 * @returns {Promise<Object>} - { success, days, count, samples }
 */
export async function fetchOccupancyHistory(days = 1, zoneId = null) {
    const now = Date.now();
    const cacheKey = `${days}_${zoneId || 'all'}`;
    
    // Retornar cache si es válido
    if (cachedHistory && cachedHistory.key === cacheKey && cacheTimestamp && (now - cacheTimestamp < CACHE_DURATION)) {
        console.log('📦 Usando historial desde cache');
        return cachedHistory.data;
    }

    try {
        const params = new URLSearchParams({ days: days.toString() });
        if (zoneId) params.append('zoneId', zoneId);
        
        const url = `${HISTORY_API_URL}?${params.toString()}`;
        console.log(`📥 Obteniendo historial: ${days} días${zoneId ? ' zona=' + zoneId : ''}`);
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        
        // Cachear resultado
        cachedHistory = { key: cacheKey, data };
        cacheTimestamp = now;
        
        console.log(`✅ Historial obtenido: ${data.count} muestras`);
        return data;
    } catch (error) {
        console.error('❌ Error obteniendo historial:', error);
        return { success: false, days, count: 0, samples: [] };
    }
}

/**
 * Extrae datos de ocupación global (porcentajes por hora)
 * @param {Array} samples - Muestras del historial
 * @returns {Array<number>} - Array de porcentajes de ocupación
 */
export function extractGlobalOccupancy(samples) {
    if (!samples || samples.length === 0) return [];
    return samples.map(s => s.global?.occupancyPct || 0);
}

/**
 * Extrae datos de ocupación para una zona específica
 * @param {Array} samples - Muestras del historial
 * @param {string} zoneId - ID de la zona
 * @returns {Array<number>} - Array de porcentajes de ocupación
 */
export function extractZoneOccupancy(samples, zoneId) {
    if (!samples || samples.length === 0) {
        return [];
    }
    
    return samples.map((s) => {
        // Si la muestra tiene datos por zona directos
        if (s.zone) return s.zone.occupancyPct || 0;
        
        // Si tiene resumen de zonas
        if (s.zones_summary && Array.isArray(s.zones_summary)) {
            const zone = s.zones_summary.find(z => z.id === zoneId);
            if (zone) {
                return zone.occupancyPct || 0;
            }
        }
        
        return 0;
    });
}

/**
 * Calcula ocupación global agregada a partir de zones_summary por muestra
 * Se usa para validar que el gráfico global coincida con la suma/medio de zonas
 * @param {Array} samples - Muestras del historial
 * @returns {Array<number>} - Array de porcentajes agregados por muestra
 */
export function aggregateGlobalFromZones(samples) {
    if (!samples || samples.length === 0) return [];
    return samples.map((s) => {
        if (s.zones_summary && Array.isArray(s.zones_summary) && s.zones_summary.length > 0) {
            // Usar promedio ponderado por capacidad total de cada zona
            // Excluir zonas placeholder como 'SinZona' y aquellas sin 'total'
            const zones = s.zones_summary.filter(z => z && z.id !== 'SinZona' && typeof z.total === 'number' && z.total > 0);
            if (zones.length > 0) {
                const weightedSum = zones.reduce((sum, z) => {
                    const occupiedPct = typeof z.occupancyPct === 'number'
                        ? z.occupancyPct
                        : ((z.occupied + z.reserved) / z.total) * 100;
                    return sum + (occupiedPct * z.total);
                }, 0);
                const totalCapacity = zones.reduce((t, z) => t + z.total, 0);
                const weightedAvg = totalCapacity > 0 ? weightedSum / totalCapacity : 0;
                return Math.round(weightedAvg);
            }
        }
        // Fallback a global si no hay zones_summary
        return s.global?.occupancyPct ?? 0;
    });
}

/**
 * Calcula la tendencia (cambio porcentual entre primera y última muestra)
 * @param {Array<number>} data - Array de valores numéricos
 * @returns {number} - Cambio porcentual
 */
export function calculateTrend(data) {
    if (!data || data.length < 2) return 0;
    const first = data[0];
    const last = data[data.length - 1];
    if (first === 0) return last > 0 ? 100 : 0;
    return Math.round(((last - first) / first) * 100);
}

/**
 * Obtiene el último snapshot disponible
 * @param {Array} samples - Muestras del historial
 * @returns {Object|null} - Última muestra o null
 */
export function getLatestSnapshot(samples) {
    if (!samples || samples.length === 0) return null;
    return samples[samples.length - 1];
}

/**
 * Invalida el cache (útil tras cambios en datos)
 */
export function invalidateCache() {
    cachedHistory = null;
    cacheTimestamp = null;
    console.log('🗑️ Cache de historial invalidado');
}
