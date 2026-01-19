// js/map/admin.js
import { mapState } from './core.js';
import { getMarker } from './markers.js';
import { createSpot, deleteSpot } from '../api/parking.js';
import { showToast } from '../ui/toasts.js';
import { showConfirmModal } from '../ui/modals.js';

let isAdminMode = false;
let tempMarker = null;     // Pin temporal al crear
let rulerLine = null;      // Línea de la regla

/**
 * Activa/Desactiva modo admin
 */
export function toggleAdminMode(enable, allSpots) {
    isAdminMode = enable;
    
    // Nota: ya no activamos drag&drop en marcadores existentes.
    // La funcionalidad de arrastrar pines creados previamente se eliminó por UX.
    // Solo el pin temporal creado con `startCreateSpot()` seguirá siendo arrastrable.

    if (!enable && rulerLine) {
        rulerLine.setMap(null); // Limpiar regla al salir
    }
}

/**
 * Lógica al soltar un pin (Guardar posición)
 */
async function handleDragEnd(marker, allSpots) {
    if (!isAdminMode) return;
    
    const id = marker.title;
    const newPos = marker.position;
    
    // Buscar datos originales para mantener descripción
    const originalSpot = allSpots.find(s => s.id === id) || {};

    const success = await createSpot({
        id: id,
        lat: newPos.lat,
        lng: newPos.lng,
        desc: originalSpot.desc || 'Actualizado'
    });

    if (success) {
        showToast(`Posición de ${id} actualizada`);
        if (rulerLine) rulerLine.setMap(null); // Ocultar regla tras soltar
    } else {
        showToast('Error al actualizar posición', 'error');
    }
}

/**
 * Dibuja la línea verde (Smart Ruler) al vecino más cercano
 */
function updateRuler(movingMarker, allSpots) {
    if (!mapState.map || !google.maps.geometry) return;

    let minDist = Infinity;
    let nearest = null;

    const currentPos = movingMarker.position;

    // Buscar el vecino más cercano
    allSpots.forEach(spot => {
        if (spot.id === movingMarker.title) return; // Ignorarse a sí mismo
        const otherLoc = new google.maps.LatLng(spot.lat, spot.lng);
        const dist = google.maps.geometry.spherical.computeDistanceBetween(currentPos, otherLoc);
        
        if (dist < minDist && dist < 20) { // Solo si está a menos de 20 metros
            minDist = dist;
            nearest = otherLoc;
        }
    });

    // Dibujar línea
    if (nearest) {
        if (!rulerLine) {
            rulerLine = new google.maps.Polyline({
                map: mapState.map,
                strokeColor: '#10b981', // Verde
                strokeOpacity: 1.0,
                strokeWeight: 2
            });
        }
        rulerLine.setPath([currentPos, nearest]);
    } else if (rulerLine) {
        rulerLine.setMap(null);
        rulerLine = null;
    }
}

/**
 * Crea un pin temporal en el centro del mapa para nuevo puesto
 */
export function startCreateSpot() {
    if (!mapState.map) return;
    
    const center = mapState.map.getCenter();
    
    // Crear elemento DOM para el pin
    const pinDiv = document.createElement('div');
    pinDiv.className = 'parking-pin pin-edit'; // Clase azul animada
    
    tempMarker = new mapState.AdvancedMarkerElement({
        map: mapState.map,
        position: center,
        content: pinDiv,
        gmpDraggable: true,
        title: "Nuevo Puesto"
    });

    showToast("Arrastra el pin azul a la posición deseada");
}

/**
 * Guarda el pin temporal
 */
export async function saveTempSpot(id, desc) {
    if (!tempMarker) return;
    
    const pos = tempMarker.position;
    const result = await createSpot({
        id, 
        lat: pos.lat, 
        lng: pos.lng, 
        desc
    });

    if (result) {
        tempMarker.map = null; // Quitar temporal
        tempMarker = null;
        showToast("Puesto creado exitosamente");
        return true;
    }
    return false;
}

/**
 * Crear un pin de previsualización en una posición dada con botones aceptar/cancelar
 * onAccept: callback()
 * onCancel: callback()
 */
export function createPreviewSpotAt(latLng, onAccept, onCancel) {
    if (!mapState.map) return null;

    // Limpiar preview anterior
    if (tempMarker) {
        tempMarker.map = null;
        tempMarker = null;
    }

    // Crear wrapper con pin azul; los controles se posicionan absolutamente
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-pin-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '40px';
    wrapper.style.height = '40px';

    const pinDiv = document.createElement('div');
    pinDiv.className = 'parking-pin pin-edit';
    pinDiv.style.pointerEvents = 'none';
    pinDiv.style.margin = '0 auto';
    pinDiv.style.width = '28px';
    pinDiv.style.height = '28px';

    const controls = document.createElement('div');
    controls.className = 'preview-controls';
    controls.style.position = 'absolute';
    controls.style.left = '46px';
    controls.style.top = '50%';
    controls.style.transform = 'translateY(-50%)';
    controls.style.display = 'flex';
    controls.style.flexDirection = 'column';
    controls.style.gap = '6px';

    const btnAccept = document.createElement('button');
    btnAccept.className = 'preview-accept';
    btnAccept.innerText = '✓';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'preview-cancel';
    btnCancel.innerText = '✕';

    controls.appendChild(btnAccept);
    controls.appendChild(btnCancel);
    wrapper.appendChild(pinDiv);
    wrapper.appendChild(controls);

    tempMarker = new mapState.AdvancedMarkerElement({
        map: mapState.map,
        position: { lat: latLng.lat(), lng: latLng.lng() },
        content: wrapper,
        gmpDraggable: true,
        title: 'Preview'
    });

    // Wire buttons
    btnAccept.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onAccept) {
            // Pass current position to callback
            const pos = tempMarker.position;
            const latVal = (typeof pos.lat === 'function') ? pos.lat() : pos.lat;
            const lngVal = (typeof pos.lng === 'function') ? pos.lng() : pos.lng;
            onAccept({ lat: latVal, lng: lngVal });
        }
    });
    btnCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        // remove preview
        if (tempMarker) { tempMarker.map = null; tempMarker = null; }
        if (onCancel) onCancel();
    });

    return tempMarker;
}

export function clearPreviewSpot() {
    if (tempMarker) {
        tempMarker.map = null;
        tempMarker = null;
    }
}