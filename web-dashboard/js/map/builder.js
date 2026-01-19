// js/map/builder.js
import { mapState } from './core.js';
import { createSpot } from '../api/parking.js';
import { showToast } from '../ui/toasts.js';

let isBuilding = false;
let startPoint = null;
let previewPolyline = null;
let ghostMarkers = [];

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
    // Limpiar previos
    clearGhosts();

    const path = [start, end];
    
    // Dibujar línea
    previewPolyline = new google.maps.Polyline({
        map: mapState.map,
        path: path,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.5,
        strokeWeight: 2,
        icons: [{
            icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW },
            offset: '100%'
        }]
    });

    // Calcular interpolación
    const spherical = google.maps.geometry.spherical;
    const distance = spherical.computeDistanceBetween(start, end);
    const heading = spherical.computeHeading(start, end);
    const step = distance / (count - 1 || 1);

    for (let i = 0; i < count; i++) {
        const pos = spherical.computeOffset(start, i * step, heading);
        
        // Pin fantasma
        const div = document.createElement('div');
        div.className = 'w-3 h-3 bg-blue-300 rounded-full opacity-50';
        
        const marker = new mapState.AdvancedMarkerElement({
            map: mapState.map,
            position: pos,
            content: div
        });
        ghostMarkers.push(marker);
    }
}

/**
 * Ejecuta la creación masiva
 */
export async function executeBatchCreate(start, end, config) {
    // config = { count, prefix, startNum }
    const spherical = google.maps.geometry.spherical;
    const distance = spherical.computeDistanceBetween(start, end);
    const heading = spherical.computeHeading(start, end);
    const step = distance / (config.count - 1 || 1);

    let createdCount = 0;

    for (let i = 0; i < config.count; i++) {
        const pos = spherical.computeOffset(start, i * step, heading);
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
        previewPolyline.setMap(null);
        previewPolyline = null;
    }
}

function resetBuilder() {
    startPoint = null;
    clearGhosts();
}