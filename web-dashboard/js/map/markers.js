// js/map/markers.js
import { mapState } from './core.js';
import { reserveSpot } from '../api/parking.js'; // Para validaciones futuras si es necesario
import { openModal } from '../ui/modals.js';
import { formatLicensePlate } from '../utils/formatters.js';

// Cache local de marcadores de puestos { spotId: AdvancedMarkerElement }
const markersCache = {};
// Cache de marcadores de zonas { zoneId: AdvancedMarkerElement }
const zoneMarkersCache = {};

// Umbral de zoom: por encima mostramos puestos; por debajo mostramos zonas agregadas
const CLUSTER_ZOOM_THRESHOLD = 17; // Ajustable según densidad

// Variables para el escalado dinámico de marcadores
let currentZoom = 17;
let isZoomListenerAttached = false;



/**
 * Actualiza los marcadores en el mapa basándose en la data nueva
 * @param {Array} spots - Lista de puestos
 * @param {Function} onMarkerClick - Callback cuando se hace click en un pin
 */
// Renderiza únicamente los marcadores de puestos (sin lógica de zonas)
function renderSpotMarkers(spots, onMarkerClick) {
    if (!mapState.map || !mapState.AdvancedMarkerElement) return;
    
    // Adjuntar listener de zoom solo una vez
    attachZoomListener();

    // 1. Marcar todos como "no visitados" para detectar eliminados
    const activeIds = new Set(spots.map(s => s.id));

    // 2. Eliminar marcadores que ya no existen en la data
    Object.keys(markersCache).forEach(id => {
        if (!activeIds.has(id)) {
            markersCache[id].map = null; // Quitar del mapa
            delete markersCache[id];
        }
    });

    // 3. Crear o Actualizar marcadores
    spots.forEach(spot => {
        const pinContent = document.createElement('div');
        pinContent.className = getPinClass(spot.status);

        if (markersCache[spot.id]) {
            // ACTUALIZAR existente
            const marker = markersCache[spot.id];
            // Solo actualizamos si cambió algo visual (clase CSS)
            if (marker.content.className !== pinContent.className) {
                marker.content.className = pinContent.className;
            }
            // Actualizar posición si se movió (Admin mode)
            marker.position = { lat: spot.lat, lng: spot.lng };
            // Si el marcador estaba oculto (map=null) por clustering, volver a asignarlo
            if (!marker.map) {
                marker.map = mapState.map;
            }
        } else {
            // CREAR nuevo
            const marker = new mapState.AdvancedMarkerElement({
                map: mapState.map,
                position: { lat: spot.lat, lng: spot.lng },
                content: pinContent,
                title: spot.id
            });

            // Evento Click
            marker.addListener('click', () => {
                // Abrir InfoWindow pequeña
                showMiniInfoWindow(marker, spot);
                // Ejecutar callback (abrir modal principal)
                if (onMarkerClick) onMarkerClick(spot);
            });

            markersCache[spot.id] = marker;
        }
    });
}

// Renderiza marcadores de zonas agregando conteos (libres / ocupados)
function renderZoneMarkers(spots, zones) {
    if (!mapState.map || !mapState.AdvancedMarkerElement) return;

    const activeZoneIds = new Set();

    zones.forEach(zone => {
        // Agrupar spots de la zona
        const zoneIdentifier = zone.id || zone.zone_id || zone.code || zone.name; // tolerancia a diferentes esquemas
        const zoneSpots = spots.filter(s => {
            const sid = s.zone_id || s.zoneId || s.zone || '';
            return sid === zoneIdentifier;
        });
        if (!zoneSpots.length) return; // No crear marcador si no hay puestos asignados

        activeZoneIds.add(zoneIdentifier);
        const free = zoneSpots.filter(s => s.status === 1).length;
        // Consideramos ocupados = status 0 + reservados 2
        const occupied = zoneSpots.filter(s => s.status === 0 || s.status === 2).length;

        // Centro simple por promedio (podría mejorarse con bounding box)
        const avgLat = zoneSpots.reduce((acc, s) => acc + s.lat, 0) / zoneSpots.length;
        const avgLng = zoneSpots.reduce((acc, s) => acc + s.lng, 0) / zoneSpots.length;

        const content = document.createElement('div');
        content.className = 'zone-marker';
        content.innerHTML = `
            <div class="zone-title">${zone.name || zone.id || 'Zona'}</div>
            <div class="zone-counts"><span class="zone-free">Libre: ${free}</span> • <span class="zone-occupied">Ocupado: ${occupied}</span></div>
        `;

        if (zoneMarkersCache[zoneIdentifier]) {
            const marker = zoneMarkersCache[zoneIdentifier];
            marker.position = { lat: avgLat, lng: avgLng };
            // Actualizar contenido si cambió
            marker.content.innerHTML = content.innerHTML;
            // Si estaba oculto por cambio de zoom, volver a mostrar
            if (!marker.map) {
                marker.map = mapState.map;
            }
        } else {
            const marker = new mapState.AdvancedMarkerElement({
                map: mapState.map,
                position: { lat: avgLat, lng: avgLng },
                content,
                title: zone.name || zoneIdentifier
            });
            zoneMarkersCache[zoneIdentifier] = marker;
        }
    });

    // Limpiar marcadores de zonas que ya no son activos
    Object.keys(zoneMarkersCache).forEach(id => {
        if (!activeZoneIds.has(id)) {
            zoneMarkersCache[id].map = null;
            delete zoneMarkersCache[id];
        }
    });
}

// Ajusta el tamaño de los marcadores según el nivel de zoom
function updateMarkerScale() {
    if (!mapState.map) return;
    const zoom = mapState.map.getZoom();
    currentZoom = zoom;
    
    // Escala más agresiva y progresiva
    // zoom 19+: scale = 1.0 (tamaño completo)
    // zoom 18: scale = 0.8
    // zoom 17: scale = 0.6
    // zoom 16: scale = 0.45
    // zoom 15: scale = 0.3 (muy pequeños antes de agruparse)
    // zoom 14-: scale = 0.2 (mínimo)
    let scale = 1;
    
    if (zoom >= 19) {
        scale = 1.0;
    } else if (zoom >= 18) {
        scale = 0.8;
    } else if (zoom >= 17) {
        scale = 0.6;
    } else if (zoom >= 16) {
        scale = 0.45;
    } else if (zoom >= 15) {
        scale = 0.3;
    } else {
        scale = 0.2;
    }
    
    // Aplicar escala a todos los marcadores visibles
    Object.values(markersCache).forEach(marker => {
        if (marker.content) {
            marker.content.style.transform = `scale(${scale})`;
        }
    });
}

// Adjunta el listener de zoom para escalar marcadores dinámicamente
function attachZoomListener() {
    if (isZoomListenerAttached || !mapState.map) return;
    
    mapState.map.addListener('zoom_changed', () => {
        updateMarkerScale();
    });
    
    isZoomListenerAttached = true;
    // Aplicar escala inicial
    updateMarkerScale();
}

// Alterna entre vista de puestos y vista de zonas según zoom
export function updateClusterView(spots, zones, onMarkerClick) {
    if (!mapState.map) return;
    const zoom = mapState.map.getZoom();
    if (zoom >= CLUSTER_ZOOM_THRESHOLD) {
        // Mostrar puestos
        renderSpotMarkers(spots, onMarkerClick);
        // Ocultar zonas
        Object.values(zoneMarkersCache).forEach(m => { m.map = null; });
        // Aplicar escala actual
        updateMarkerScale();
    } else {
        // Ocultar puestos
        Object.values(markersCache).forEach(m => { m.map = null; });
        // Mostrar zonas
        renderZoneMarkers(spots, zones);
    }
}

// API anterior para compatibilidad: delega en updateClusterView (asumiendo zoom actual)
export function renderMarkers(spots, onMarkerClick) {
    updateClusterView(spots, [], onMarkerClick);
}

/**
 * Retorna la clase CSS según estado
 */
function getPinClass(status) {
    // Definidas en styles.css (.parking-pin)
    const base = 'parking-pin';
    if (status === 1) return `${base} pin-free`;     // Verde
    if (status === 0) return `${base} pin-occupied`; // Rojo
    if (status === 2) return `${base} pin-reserved`; // Ambar
    return `${base} pin-unknown`;
}

/**
 * Muestra el globito pequeño sobre el pin
 */
function showMiniInfoWindow(marker, spot) {
    if (!mapState.infoWindow) return;

    let statusText = spot.status === 1 ? 'Libre' : spot.status === 0 ? 'Ocupado' : 'Reservado';
    
    const content = `
        <div class="px-2 py-1 text-center">
            <h3 class="font-bold text-slate-800">${spot.id}</h3>
            <p class="text-xs text-slate-500">${statusText}</p>
        </div>
    `;
    
    mapState.infoWindow.setContent(content);
    mapState.infoWindow.open(mapState.map, marker);
}

// Exportamos getter para uso de Admin
export function getMarker(id) {
    return markersCache[id];
}

// Export opcional para pruebas
export function _debugCaches() {
    return { spots: Object.keys(markersCache).length, zones: Object.keys(zoneMarkersCache).length };
}

// Resalta un marcador específico (añade clase de animación temporal)
export function highlightSpot(spotId) {
    const marker = markersCache[spotId];
    if (!marker || !marker.content) return;
    
    // Remover highlight previo de todos los marcadores
    Object.values(markersCache).forEach(m => {
        if (m.content) m.content.classList.remove('pin-highlight');
    });
    
    // Añadir highlight al seleccionado
    marker.content.classList.add('pin-highlight');
    
    // Remover después de 3 segundos
    setTimeout(() => {
        if (marker.content) marker.content.classList.remove('pin-highlight');
    }, 3000);
}