# AGENTS.md

Guia operativa para agentes de codigo en este repositorio (`Sparking`).

## 1) Contexto del proyecto

- Proyecto: S-Parking (IoT + Cloud + Web Dashboard).
- Capas principales:
  - `firmware/S-Parking/` -> firmware ESP32 (Arduino/C++).
  - `web-dashboard/` -> frontend estatico (HTML/CSS/Vanilla JS ESM).
  - `web-dashboard/gcp-functions/*` -> funciones backend Node.js para GCP.
- Persistencia: Firestore.
- Hosting frontend: Firebase Hosting.
- Runtime backend: Node.js 20 (segun README).

## 2) Init (first-time setup)

Ejecutar estos pasos antes de desarrollar:

1. Clonar repo y entrar a `Sparking/`.
2. Crear archivos de secretos locales desde ejemplos:
   - `web-dashboard/js/config/config.example.js` -> `web-dashboard/js/config/config.js`
   - `firmware/S-Parking/arduino_secrets.example.h` -> `firmware/S-Parking/arduino_secrets.h`
3. Completar credenciales/API keys en esos archivos locales.
4. Instalar dependencias de cada funcion que vayas a tocar:
   - entrar al directorio de la funcion en `web-dashboard/gcp-functions/...`
   - ejecutar `npm install`
5. (Opcional despliegue) instalar CLIs:
   - `npm install -g firebase-tools`
   - Google Cloud SDK (`gcloud`)

Nota: este repo no usa un `package.json` raiz.

## 3) Comandos de build/lint/test

### 3.1 Frontend web (`web-dashboard/`)

No hay build step (sin bundler). Son archivos estaticos + modulos ESM.

- Servir local (opcion simple):
  - desde `web-dashboard/`: `python -m http.server 8080`
- Servir con Firebase Hosting emulado:
  - desde `web-dashboard/`: `firebase emulators:start --only hosting`
- Deploy hosting:
  - desde `web-dashboard/`: `firebase deploy --only hosting`

### 3.2 Backend funciones (`web-dashboard/gcp-functions/*`)

Cada funcion tiene su propio `package.json` (sin monorepo scripts compartidos).

Patron base por funcion:
- `npm install`
- Correr local con Functions Framework (si aplica):
  - `npx functions-framework --target=<FunctionName> --source=index.js --signature-type=http`

Ejemplos de target detectados:
- `ingestParkingData`
- `createParkingSpot`
- `deleteParkingSpot`
- `getZones`
- `manageZones`
- `getOccupancyHistory`
- `saveHourlySnapshot`
- `reserveParkingSpot`
- `releaseParkingSpot`
- `getParkingStatus`

Deploy Cloud Run (documentado):
- `gcloud builds submit --tag gcr.io/<project-id>/<service-name>`
- `gcloud run deploy <service-name> --image gcr.io/<project-id>/<service-name> --platform managed --allow-unauthenticated`

### 3.3 Firmware (`firmware/S-Parking/`)

No hay comandos de build automatizados en repo (sin `platformio.ini` ni Makefile).
Compilar/subir con Arduino IDE o PlatformIO manualmente.

### 3.4 Linting

No hay ESLint/Prettier configurados actualmente.
No inventar reglas nuevas sin acordarlo antes.
Mantener estilo local del archivo tocado.

### 3.5 Testing

No hay testing automatizado implementado hoy (ni unit ni e2e).
Referencia: `docs/DOCUMENTACION_TECNICA.txt` seccion Testing.

Validacion esperada hoy:
- smoke/manual testing del flujo afectado.
- verificar UI en `dashboard.html`, `login.html`, `index.html`.
- verificar endpoint modificado con request HTTP real.

### 3.6 Como correr un "single test" en este repo

Como no hay test runner, "single test" = probar un endpoint o flujo puntual.

Pasos recomendados para una sola funcion backend:
1. Levantar solo esa funcion con functions-framework.
2. Ejecutar un request directo (`curl`, Postman o cliente HTTP).
3. Validar codigo HTTP + payload + logs.

Ejemplo conceptual:
- levantar `getParkingStatus`
- hacer `GET` local al endpoint
- comprobar respuesta JSON valida y errores controlados

## 4) Convenciones de codigo

### 4.1 Imports y modulos

Frontend:
- usar ESM (`import/export`) con rutas relativas y extension `.js`.
- agrupar imports externos primero, luego internos (si aplica).
- evitar imports no usados.

Backend funciones:
- usar CommonJS (`require`, `exports` / `functions.http`).
- no mezclar ESM y CommonJS en la misma funcion.

### 4.2 Formato y estructura

- Respetar el estilo existente del archivo (hay mezcla 2 y 4 espacios).
- Mantener `;` cuando el archivo ya los usa.
- Evitar refactors masivos de formato.
- Mantener funciones cortas y orientadas a una responsabilidad.
- Extraer helpers cuando un bloque crezca o se repita.

### 4.3 Tipos y contratos de datos

- El repo es JavaScript/Arduino C++; no TypeScript.
- Usar JSDoc en utilidades publicas cuando agregues funciones no triviales.
- Validar entrada de API al inicio (campos requeridos y tipos).
- Normalizar IDs y campos criticos antes de persistir.
- Mantener consistencia con campos Firestore existentes (`snake_case` frecuente, ej. `zone_id`, `created_at`, `updated_at`).

### 4.4 Nomenclatura

- Variables/funciones JS: `camelCase`.
- Constantes: `UPPER_SNAKE_CASE`.
- Archivos JS: nombres descriptivos y cortos (`parking.js`, `modals.js`, etc.).
- Mantener naming consistente con el modulo donde se trabaja.

### 4.5 Error handling y logging

Frontend:
- usar `try/catch` en operaciones async de red.
- en capa API, propagar o retornar errores segun el patron existente.
- preferir `logger` (`web-dashboard/js/utils/logger.js`) para logs de app.

Backend:
- devolver codigos HTTP correctos:
  - `400` validacion/inputs invalidos.
  - `500` errores internos inesperados.
- responder JSON consistente para errores (`{ error: "..." }`).
- manejar CORS y `OPTIONS` cuando corresponda.
- no exponer stack traces en produccion.

### 4.6 Estado, cache y side effects (frontend)

- Respetar patrones de cache ya implementados (`localStorage` + memoria + TTL).
- Invalidar cache explicitamente en mutaciones (create/update/delete/reserve/release).
- Evitar side effects globales nuevos salvo necesidad real.

### 4.7 Seguridad y secretos

- Nunca commitear credenciales reales.
- Archivos sensibles esperados en local:
  - `**/config.js`
  - `**/arduino_secrets.h`
- Mantener ejemplos seguros:
  - `config.example.js`
  - `arduino_secrets.example.h`

## 5) Reglas de cambios para agentes

- Hacer cambios minimos y enfocados.
- No cambiar arquitectura o naming global sin necesidad.
- Si no hay tests automaticos, describir validacion manual ejecutada.
- Si se agregan dependencias o tooling (lint/test), documentar comandos exactos y alcance.
- Si se tocan API/contracts, actualizar docs relevantes.

## 6) Cursor/Copilot rules

No se encontraron reglas en:
- `.cursor/rules/`
- `.cursorrules`
- `.github/copilot-instructions.md`

Si se agregan en el futuro, esta seccion debe actualizarse y esas reglas pasan a ser prioritarias.
