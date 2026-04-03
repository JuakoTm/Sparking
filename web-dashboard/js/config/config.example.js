// js/config/config.example.js

// ============================================================
// GUIA RAPIDA DE CLAVES
// ============================================================
// - SUPABASE_PROJECT_REF: Supabase -> Project Settings -> General -> Reference ID
// - SUPABASE.ANON_KEY: Supabase -> Project Settings -> API -> anon public
// - GOOGLE_MAPS_API_KEY / GOOGLE_MAPS_ID: opcional (ya no se usa para pintar el mapa)
//
// NO usar SUPABASE_SERVICE_ROLE_KEY en frontend.

const SUPABASE_PROJECT_REF = 'TU_PROJECT_REF';

export const CONFIG = {
    // Habilita logs de depuración en el cliente (false en producción)
    DEBUG: true,

    // Referencia del proyecto en Supabase para construir endpoints
    // Ejemplo: abcdefghijklmnop
    SUPABASE_PROJECT_REF,
    
    // --- OPTIMIZACIÓN DE RENDIMIENTO Y COSTOS ---
    PERFORMANCE: {
        POLLING_INTERVAL: 20000,         // Intervalo de polling principal (ms) - ahora 20s
        HISTORY_REFRESH: 10 * 60 * 1000, // Refrescar historial cada 10 min (era 5 min)
        TIMER_UPDATE: 5000,              // Actualizar timers UI cada 5s (era 1s)
        CACHE_PARKING_STATUS: 15000,     // Cache de estado de puestos (15s)
        CACHE_ZONES: 5 * 60 * 1000,      // Cache de zonas (5 min)
        CACHE_HISTORY: 10 * 60 * 1000,   // Cache de historial (10 min)
        DEBOUNCE_SEARCH: 400,            // Debounce para búsquedas (ms)
        LAZY_RENDER: true                // Activar renderizado lazy de elementos fuera de vista
    },
    
    // --- CREDENCIALES ---
    // Google Maps ya no es obligatorio para el mapa principal.
    GOOGLE_MAPS_API_KEY: '',
    GOOGLE_MAPS_ID: '',

    // OpenStreetMap / Leaflet
    MAP_CENTER: { lat: -33.43306733282499, lng: -70.61471532552095 },
    MAP_ZOOM: 19,
    MAP_TILE_URL: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    MAP_ATTRIBUTION: '&copy; OpenStreetMap contributors',
    
    // --- Configuracion Supabase ---
    SUPABASE: {
        URL: `https://${SUPABASE_PROJECT_REF}.supabase.co`,
        ANON_KEY: 'PEGA_AQUI_TU_SUPABASE_ANON_KEY',
        REQUIRE_EMAIL_CONFIRMATION: true,
        RESET_PASSWORD_REDIRECT_TO: 'http://localhost:8080/login.html'
    },

    // --- URLs (API ENDPOINTS Supabase Edge Functions) ---
    GET_STATUS_API_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/get-parking-status`,
    RESERVATION_API_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/reserve-parking-spot`,
    RELEASE_API_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/release-parking-spot`,
    CREATE_SPOT_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/create-parking-spot`,
    DELETE_SPOT_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/delete-parking-spot`,
    GET_ZONES_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/get-zones`,
    MANAGE_ZONES_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/manage-zones`,
    GET_HISTORY_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/get-occupancy-history`,
    SAVE_HOURLY_SNAPSHOT_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/save-hourly-snapshot`,
    INGEST_PARKING_DATA_URL: `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/ingest-parking-data`,

    // --- Reglas de recomendaciones del análisis ---
    RECOMMENDATIONS: {
        CRITICAL_OCCUPANCY_PCT: 80,     // % a partir del cual consideramos ocupación crítica por muestra
        CRITICAL_TIME_HIGH: 30,         // % del período en crítico para recomendar ampliar capacidad
        CRITICAL_TIME_MED: 10,          // % del período en crítico para advertir alta demanda
        VARIABILITY_HIGH: 30,           // Coeficiente de variación alto (%)
        VARIABILITY_MED: 15,            // Coeficiente de variación medio (%)
        AVAIL_GOOD: 40,                 // Disponibilidad promedio considerada buena (%)
        AVAIL_LOW: 20,                  // Disponibilidad promedio considerada baja (%)
        PEAK_THRESHOLD: 70,             // Umbral para considerar un pico horario (%)
        MORNING_RANGE: [7, 10],         // Rango horas pico mañana
        EVENING_RANGE: [17, 20],        // Rango horas pico tarde
        MAX_ITEMS: 4                    // Máximo de recomendaciones a mostrar
    },

    // Mantener este bloque vacio para retrocompatibilidad en scripts antiguos.
    FIREBASE: {}
};

// Retro-compatibilidad para evitar errores en scripts legacy o HTML directo
window.CONFIG = CONFIG;
