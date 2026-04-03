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

function toLatLng(input) {
    if (!input) return { lat: 0, lng: 0 };
    if (typeof input.lat === 'function' && typeof input.lng === 'function') {
        return { lat: input.lat(), lng: input.lng() };
    }
    return { lat: Number(input.lat), lng: Number(input.lng) };
}

function normalizePoint(input) {
    const p = toLatLng(input);
    return {
        lat: Number(p.lat) || 0,
        lng: Number(p.lng) || 0
    };
}

function toRadians(deg) { return (deg * Math.PI) / 180; }
function toDegrees(rad) { return (rad * 180) / Math.PI; }

function computeDistanceBetween(a, b) {
    const p1 = normalizePoint(a);
    const p2 = normalizePoint(b);
    const R = 6371000;
    const dLat = toRadians(p2.lat - p1.lat);
    const dLng = toRadians(p2.lng - p1.lng);
    const lat1 = toRadians(p1.lat);
    const lat2 = toRadians(p2.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const aa = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
}

function computeHeading(a, b) {
    const p1 = normalizePoint(a);
    const p2 = normalizePoint(b);
    const lat1 = toRadians(p1.lat);
    const lat2 = toRadians(p2.lat);
    const dLng = toRadians(p2.lng - p1.lng);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return toDegrees(Math.atan2(y, x));
}

function computeOffset(from, distanceMeters, headingDegrees) {
    const p = normalizePoint(from);
    const R = 6371000;
    const d = distanceMeters / R;
    const heading = toRadians(headingDegrees);
    const lat1 = toRadians(p.lat);
    const lng1 = toRadians(p.lng);

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(heading)
    );
    const lng2 = lng1 + Math.atan2(
        Math.sin(heading) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );

    return {
        lat: () => toDegrees(lat2),
        lng: () => toDegrees(lng2)
    };
}

class LeafletInfoWindow {
    constructor() {
        this._content = '';
        this._popup = null;
    }

    setContent(content) {
        this._content = content;
        if (this._popup) this._popup.setContent(content);
    }

    open(map, marker) {
        if (!window.L || !map || !marker || !marker._marker) return;
        if (!this._popup) {
            this._popup = window.L.popup({ closeButton: false, autoClose: true, className: 'sparking-popup' });
        }
        this._popup.setLatLng(marker._marker.getLatLng());
        this._popup.setContent(this._content || '');
        this._popup.openOn(map);
    }
}

class LeafletAdvancedMarker {
    constructor({ map, position, content, title, gmpDraggable }) {
        if (!window.L) throw new Error('Leaflet no disponible');
        this.content = content || document.createElement('div');
        this.title = title || '';
        this._map = null;
        this._listeners = [];
        this._marker = window.L.marker([position.lat, position.lng], {
            draggable: !!gmpDraggable,
            icon: window.L.divIcon({
                className: 'sparking-marker',
                html: this.content,
                iconSize: null
            }),
            keyboard: false
        });
        if (this.title) {
            this._marker.bindTooltip(this.title, { permanent: false, direction: 'top' });
        }
        if (map) this.map = map;
    }

    addListener(eventName, cb) {
        if (!this._marker) return;
        const eventMap = {
            click: 'click',
            drag: 'drag',
            dragend: 'dragend'
        };
        const leafletEvent = eventMap[eventName] || eventName;
        const handler = (e) => cb(e);
        this._marker.on(leafletEvent, handler);
        this._listeners.push({ leafletEvent, handler });
    }

    set map(nextMap) {
        if (this._map === nextMap) return;
        if (this._map) {
            this._marker.removeFrom(this._map);
        }
        this._map = nextMap || null;
        if (this._map) {
            this._marker.addTo(this._map);
        }
    }

    get map() {
        return this._map;
    }

    set position(nextPosition) {
        const p = normalizePoint(nextPosition);
        this._marker.setLatLng([p.lat, p.lng]);
    }

    get position() {
        const p = this._marker.getLatLng();
        return { lat: p.lat, lng: p.lng };
    }
}

function ensureLeafletLoaded() {
    return new Promise((resolve, reject) => {
        if (window.L) {
            resolve();
            return;
        }

        const leafletCss = document.querySelector('link[data-leaflet="true"]');
        if (!leafletCss) {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            css.setAttribute('data-leaflet', 'true');
            document.head.appendChild(css);
        }

        const existingScript = document.querySelector('script[data-leaflet="true"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve());
            existingScript.addEventListener('error', () => reject(new Error('No se pudo cargar Leaflet')));
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-leaflet', 'true');
        script.onload = () => {
            logger.debug('✅ Leaflet cargado correctamente.');
            resolve();
        };
        script.onerror = () => {
            reject(new Error('No se pudo cargar el script de Leaflet'));
        };
        document.head.appendChild(script);
    });
}

export async function initMap(containerId) {
    try {
        await ensureLeafletLoaded();
        let mapElement = document.getElementById(containerId);
        if (!mapElement) {
            console.warn(`El elemento con id '${containerId}' no fue encontrado. Intentando con id 'map' como alternativa.`);
            mapElement = document.getElementById('map');
        }
        if (!mapElement) throw new Error(`El div con id '${containerId}' ni 'map' existe en el DOM.`);

        const center = CONFIG.MAP_CENTER || { lat: -33.43306733282499, lng: -70.61471532552095 };
        const zoom = CONFIG.MAP_ZOOM || 19;

        const map = window.L.map(mapElement, {
            zoomControl: false,
            attributionControl: true
        }).setView([center.lat, center.lng], zoom);

        window.L.tileLayer(
            CONFIG.MAP_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                attribution: CONFIG.MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }
        ).addTo(map);

        map.addListener = (eventName, cb) => {
            if (eventName === 'zoom_changed') {
                map.on('zoomend', () => cb());
                return;
            }
            if (eventName === 'click') {
                map.on('click', (e) => {
                    cb({
                        latLng: {
                            lat: () => e.latlng.lat,
                            lng: () => e.latlng.lng
                        },
                        lat: e.latlng.lat,
                        lng: e.latlng.lng,
                        originalEvent: e
                    });
                });
                return;
            }
            map.on(eventName, cb);
        };

        mapState.map = map;
        mapState.AdvancedMarkerElement = LeafletAdvancedMarker;
        mapState.PinElement = null;
        mapState.geometry = {
            spherical: {
                computeDistanceBetween,
                computeHeading,
                computeOffset
            }
        };
        mapState.infoWindow = new LeafletInfoWindow();

        logger.debug('✅ OpenStreetMap (Leaflet) inicializado.');
        return mapState;

    } catch (error) {
        console.error("☠️ Error fatal iniciando mapa:", error);
        throw error;
    }
}
