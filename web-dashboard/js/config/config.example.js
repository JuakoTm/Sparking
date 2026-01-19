// js/config/config.example.js

export const CONFIG = {
    // Habilita logs de depuración en el cliente (false en producción)
    DEBUG: true,
    
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
    GOOGLE_MAPS_API_KEY: "TU_API_KEY_AQUI", 
    GOOGLE_MAPS_ID: "TU_MAP_ID_AQUI",
    
    // --- URLs (API ENDPOINTS) ---
    GET_STATUS_API_URL: "https://tu-servicio-status.run.app",
    RESERVATION_API_URL: "https://tu-region-proyecto.cloudfunctions.net/reserve-spot",
    RELEASE_API_URL: "https://tu-region-proyecto.cloudfunctions.net/release-parking-spot",
    CREATE_SPOT_URL: "https://tu-region-proyecto.cloudfunctions.net/create-parking-spot",
    DELETE_SPOT_URL: "https://tu-region-proyecto.cloudfunctions.net/delete-parking-spot",
    GET_ZONES_URL: "https://tu-region-proyecto.cloudfunctions.net/get-zones",
    MANAGE_ZONES_URL: "https://tu-region-proyecto.cloudfunctions.net/manage-zones",
    GET_HISTORY_URL: "https://tu-region-proyecto.cloudfunctions.net/get-occupancy-history",

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

    FIREBASE: {
        apiKey: "TU_FIREBASE_KEY",
        authDomain: "tu-proyecto.firebaseapp.com",
        projectId: "tu-id-de-proyecto",
        storageBucket: "tu-proyecto.appspot.com",
        messagingSenderId: "123456789",
        appId: "1:12345:web:abcdef"
    }
};

// Retro-compatibilidad para evitar errores en scripts legacy o HTML directo
window.CONFIG = CONFIG;