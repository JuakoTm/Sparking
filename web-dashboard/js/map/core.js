// js/map/core.js
import { CONFIG } from '../config/config.js';
import { logger } from '../utils/logger.js';

export const mapState = {
    map: null,
    AdvancedMarkerElement: null,
    PinElement: null,
    geometry: null,
    infoWindow: null
};

/**
 * Carga la API de Google Maps de forma robusta
 */
export function loadGoogleMapsAPI() {
    return new Promise((resolve, reject) => {
        // 1. Verificación perfecta: ¿Ya tenemos la función moderna?
        if (window.google && window.google.maps && typeof google.maps.importLibrary === 'function') {
            logger.debug("✅ API de Maps moderna detectada en caché.");
            resolve();
            return;
        }

        // 2. Limpieza: Si hay un google maps viejo (sin importLibrary), avisamos
        if (window.google && window.google.maps) {
            console.warn("⚠️ Versión antigua de Maps detectada. Intentando forzar actualización...");
        }

        // 3. Callback Global para asegurar la carga asíncrona
        const callbackName = `initMap_${Date.now()}`;
        window[callbackName] = () => {
            logger.debug("✅ API de Maps cargada exitosamente vía Callback.");
            delete window[callbackName];
            resolve();
        };

        // 4. Inyección del Script (Forzando v=weekly y callback)
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${CONFIG.GOOGLE_MAPS_API_KEY}&map_ids=${CONFIG.GOOGLE_MAPS_ID}&loading=async&v=weekly&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = (e) => {
            console.error("❌ Error de red al cargar Maps:", e);
            reject(e);
        };
        
        // Evitar duplicados en el DOM
        if (!document.querySelector(`script[src*="${CONFIG.GOOGLE_MAPS_API_KEY}"]`)) {
            document.head.appendChild(script);
        } else {
            // Si el script ya estaba en el DOM pero la API no cargó, esperamos un poco
            logger.debug("⏳ El script ya está en el DOM, esperando inicialización...");
            setTimeout(() => {
                if (window.google && window.google.maps && typeof google.maps.importLibrary === 'function') {
                    resolve();
                } else {
                    reject(new Error("Timeout esperando a Google Maps"));
                }
            }, 2000);
        }
    });
}

export async function initMap(containerId) {
    try {
        await loadGoogleMapsAPI();
        // Intentamos usar la API modular (importLibrary). Si no está disponible, usamos el constructor clásico.
        let mapElement = document.getElementById(containerId);
        if (!mapElement) {
            console.warn(`El elemento con id '${containerId}' no fue encontrado. Intentando con id 'map' como alternativa.`);
            mapElement = document.getElementById('map');
        }
        if (!mapElement) throw new Error(`El div con id '${containerId}' ni 'map' existe en el DOM.`);

        try {
            if (google && google.maps && typeof google.maps.importLibrary === 'function') {
                const { Map } = await google.maps.importLibrary("maps");
                const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
                await google.maps.importLibrary("geometry");

                mapState.AdvancedMarkerElement = AdvancedMarkerElement;
                mapState.PinElement = PinElement;
                mapState.geometry = google.maps.geometry;

                mapState.map = new Map(mapElement, {
                    center: { lat: -33.43306733282499, lng: -70.61471532552095 },
                    zoom: 19,
                    mapId: CONFIG.GOOGLE_MAPS_ID,
                    tilt: 0,
                    disableDefaultUI: true,
                    zoomControl: false,
                    rotateControl: true,
                    gestureHandling: 'greedy'
                });

                mapState.infoWindow = new google.maps.InfoWindow();
                logger.debug('✅ Google Maps inicializado con importLibrary (modular).');
                return mapState;
            } else {
                throw new Error('importLibrary no disponible');
            }
        } catch (err) {
            // Fallback: API clásica
            console.warn('⚠️ importLibrary no disponible o falló. Usando constructor clásico de google.maps:', err);
            mapState.AdvancedMarkerElement = null;
            mapState.PinElement = null;
            mapState.geometry = google.maps.geometry || null;

            mapState.map = new google.maps.Map(mapElement, {
                center: { lat: -33.43306733282499, lng: -70.61471532552095 },
                zoom: 20,
                mapId: CONFIG.GOOGLE_MAPS_ID,
                tilt: 0,
                disableDefaultUI: true,
                zoomControl: false,
                rotateControl: true,
                gestureHandling: 'greedy'
            });

            mapState.infoWindow = new google.maps.InfoWindow();
            logger.debug('✅ Google Maps inicializado con API clásica.');
            return mapState;
        }

    } catch (error) {
        console.error("☠️ Error fatal iniciando mapa:", error);
        throw error;
    }
}