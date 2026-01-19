// js/utils/validators.js

/**
 * Valida si una patente tiene el largo correcto (6 caracteres sin guiones)
 * @param {string} plate 
 * @returns {boolean}
 */
export function isValidChileanPlate(plate) {
    const clean = plate.replace(/[^a-zA-Z0-9]/g, '');
    return clean.length === 6; 
}

/**
 * Valida formato básico de email
 * @param {string} email 
 * @returns {boolean}
 */
export function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}