// js/utils/formatters.js

/**
 * Formatea una patente chilena automáticamente (XX-XX-XX o AA-BB-12)
 * @param {string} value - El valor crudo del input
 * @returns {string} - Patente formateada y en mayúsculas
 */
export function formatLicensePlate(value) {
    // Eliminar caracteres no alfanuméricos y pasar a mayúsculas
    let clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    
    // Aplicar guiones según la longitud (Estándar Chile)
    if (clean.length > 2 && clean.length <= 4) {
        return `${clean.slice(0, 2)}-${clean.slice(2)}`;
    } else if (clean.length > 4) {
        return `${clean.slice(0, 2)}-${clean.slice(2, 4)}-${clean.slice(4, 6)}`; // Limita a 6 caracteres visuales + guiones
    }
    return clean;
}

/**
 * Convierte milisegundos a formato MM:SS para el timer
 * @param {number} ms - Milisegundos restantes
 * @returns {string} - Cadena formateada (ej: "04:59")
 */
export function formatTimeLeft(ms) {
    if (ms <= 0) return "00:00";
    
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    
    const minStr = minutes < 10 ? "0" + minutes : minutes;
    const secStr = seconds < 10 ? "0" + seconds : seconds;
    
    return `${minStr}:${secStr}`;
}

/**
 * Devuelve un string de tiempo relativo simple
 * @param {string | Date} dateString 
 * @returns {string} (ej: "15:30")
 */
export function formatTimestamp(dateString) {
    if (!dateString) return '--:--';
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Devuelve un string representando el tiempo transcurrido desde una fecha
 * Ejemplos: "Ahora", "5m", "1h 05m", "2d 3h"
 * @param {string|Date} dateString
 * @returns {string}
 */
export function formatTimeSince(dateString) {
    if (!dateString) return '--';
    const then = new Date(dateString).getTime();
    if (isNaN(then)) return '--';
    const diff = Date.now() - then;
    if (diff < 0) return '--';

    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Ahora';

    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;

    const hrs = Math.floor(min / 60);
    const remMin = min % 60;
    if (hrs < 24) return `${hrs}h ${remMin.toString().padStart(2, '0')}m`;

    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h`;
}

/**
 * Extrae un timestamp utilizable desde un objeto `spot`.
 * Busca múltiples campos comunes y devuelve una cadena ISO o null.
 * @param {Object} spot
 * @returns {string|null}
 */
export function getSpotTimestamp(spot) {
    if (!spot || typeof spot !== 'object') return null;

    const candidates = [
        'last_changed',
        'lastChanged',
        'status_changed_at',
        'status_changed',
        'changed_at',
        'updated_at',
        'updatedAt',
        'updated',
        'created_at',
        'createdAt'
    ];

    for (const key of candidates) {
        const v = spot[key];
        if (!v) continue;
        // If it's a Firestore Timestamp-like object, try to extract .seconds
        if (typeof v === 'object' && v !== null && (v.seconds || v._seconds)) {
            const seconds = v.seconds || v._seconds;
            return new Date(seconds * 1000).toISOString();
        }
        // If it's a number (unix ms or seconds)
        if (typeof v === 'number') {
            // If > 1e12 likely milliseconds, else seconds
            const ms = v > 1e12 ? v : v * 1000;
            return new Date(ms).toISOString();
        }
        // Otherwise attempt to parse string
        const s = String(v);
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString();
    }

    return null;
}