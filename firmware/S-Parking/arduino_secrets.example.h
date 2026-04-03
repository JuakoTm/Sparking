#pragma once

// --- CREDENCIALES WIFI ---
#define SECRET_SSID "NOMBRE_DE_TU_WIFI"
#define SECRET_PASS "PASSWORD_DE_TU_WIFI"

// --- TUS URLs DE BACKEND (Supabase Edge Functions recomendado) ---

// 1. URL para ENVIAR datos (ingest-parking-data)
#define SECRET_GCP_URL_INGEST "https://tu-project-ref.supabase.co/functions/v1/ingest-parking-data"

// 2. URL para LEER estado (get-parking-status)
// NOTA: Esta funcion devuelve TODOS los puestos. El ESP32 buscará su ID en la lista.
#define SECRET_GCP_URL_GET "https://tu-project-ref.supabase.co/functions/v1/get-parking-status"

// 3. Identificación del Puesto
#define SECRET_SPOT_ID "A-01"
