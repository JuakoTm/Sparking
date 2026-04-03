// js/map/builder.js
import { mapState } from './core.js';
import { createSpot } from '../api/parking.js';
import { showToast } from '../ui/toasts.js';

let isBuilding = false;
let startPoint = null;
let previewPolyline = null;
let ghostMarkers = [];

function toLatLngObj(p) {
    if (!p) return { lat: 0, lng: 0 };
    if (typeof p.lat === 'function' && typeof p.lng === 'function') {
        return { lat: p.lat(), lng: p.lng() };
    }
    return { lat: Number(p.lat), lng: Number(p.lng) };
}

function toLatLngAccessor(p) {
    const point = toLatLngObj(p);
    return {
        lat: () => point.lat,
        lng: () => point.lng
    };
}

export function toggleLineBuilder(enable) {
    isBuilding = enable;
    if (!enable) resetBuilder();
}

// Exportar propiedad isBuilding
export { isBuilding };

export function handleMapClick(latLng) {
    if (!isBuilding || !mapState.map) return;

    if (!startPoint) {
        // Click 1: Punto de Inicio
        startPoint = latLng;
        
        // Marcador visual de inicio
        const pinDiv = document.createElement('div');
        pinDiv.className = 'w-4 h-4 bg-blue-500 rounded-full border-2 border-white';
        
        const startMarker = new mapState.AdvancedMarkerElement({
            map: mapState.map,
            position: startPoint,
            content: pinDiv
        });
        ghostMarkers.push(startMarker);
        
        showToast("Selecciona el punto final de la línea", "info");

    } else {
        // Click 2: Punto Final (Abre panel de config en UI - gestionado por main.js)
        // Aquí solo retornamos los puntos para que la UI sepa qué hacer
        return { start: startPoint, end: latLng };
    }
}

/**
 * Previsualiza los puntos en la línea
 */
export function previewLine(start, end, count) {
    if (!window.L || !mapState.map || !mapState.geometry?.spherical) return;

    // Limpiar previos
    clearGhosts();

    const startPoint = toLatLngObj(start);
    const endPoint = toLatLngObj(end);
    const path = [
        [startPoint.lat, startPoint.lng],
        [endPoint.lat, endPoint.lng]
    ];
    
    // Dibujar línea
    previewPolyline = window.L.polyline(path, {
        color: '#3b82f6',
        opacity: 0.5,
        weight: 2,
        dashArray: '6 8'
    }).addTo(mapState.map);

    // Calcular interpolación
    const spherical = mapState.geometry.spherical;
    const distance = spherical.computeDistanceBetween(startPoint, endPoint);
    const heading = spherical.computeHeading(startPoint, endPoint);
    const step = distance / (count - 1 || 1);

    for (let i = 0; i < count; i++) {
        const pos = spherical.computeOffset(startPoint, i * step, heading);
        const posObj = toLatLngObj(pos);
        
        // Pin fantasma
        const div = document.createElement('div');
        div.className = 'w-3 h-3 bg-blue-300 rounded-full opacity-50';
        
        const marker = new mapState.AdvancedMarkerElement({
            map: mapState.map,
            position: posObj,
            content: div
        });
        ghostMarkers.push(marker);
    }
}

/**
 * Ejecuta la creación masiva
 */
export async function executeBatchCreate(start, end, config) {
    if (!mapState.geometry?.spherical) return 0;

    const startPoint = toLatLngObj(start);
    const endPoint = toLatLngObj(end);

    // config = { count, prefix, startNum }
    const spherical = mapState.geometry.spherical;
    const distance = spherical.computeDistanceBetween(startPoint, endPoint);
    const heading = spherical.computeHeading(startPoint, endPoint);
    const step = distance / (config.count - 1 || 1);

    let createdCount = 0;

    for (let i = 0; i < config.count; i++) {
        const pos = toLatLngAccessor(spherical.computeOffset(startPoint, i * step, heading));
        // Formato ID: A-01, A-02...
        const num = parseInt(config.startNum) + i;
        const id = `${config.prefix}${num.toString().padStart(2, '0')}`;
        
        await createSpot({
            id: id,
            lat: pos.lat(),
            lng: pos.lng(),
            desc: `Puesto ${id}`
        });
        createdCount++;
    }

    resetBuilder();
    return createdCount;
}

function clearGhosts() {
    ghostMarkers.forEach(m => m.map = null);
    ghostMarkers = [];
    if (previewPolyline) {
        previewPolyline.remove();
        previewPolyline = null;
    }
}

function resetBuilder() {
    startPoint = null;
    clearGhosts();
}
