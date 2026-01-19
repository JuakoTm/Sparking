// js/utils/helpers.js

/**
 * Función Debounce para limitar la frecuencia de ejecución
 * (Usado en la búsqueda para no filtrar en cada tecla presionada)
 * @param {Function} func - La función a ejecutar
 * @param {number} wait - Tiempo de espera en ms
 * @returns {Function}
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Genera un ID aleatorio simple (útil para pruebas o IDs temporales)
 * @returns {string}
 */
export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

/**
 * Throttle: Ejecuta una función como máximo una vez cada X ms
 * (Útil para eventos como scroll o resize)
 * @param {Function} func 
 * @param {number} limit 
 * @returns {Function}
 */
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Pausa la ejecución por X milisegundos (útil con async/await)
 * @param {number} ms 
 * @returns {Promise}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Copia texto al portapapeles
 * @param {string} text 
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Error al copiar:', err);
        return false;
    }
}

/**
 * Detecta si el usuario está en un dispositivo móvil
 * @returns {boolean}
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Formatea números grandes (ej: 1000 → 1K, 1000000 → 1M)
 * @param {number} num 
 * @returns {string}
 */
export function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}