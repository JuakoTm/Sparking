# Checklist rapido Supabase (10 min)

Este checklist te permite validar que la migracion quedo operativa sin revisar todo el sistema.

## 1) Base de datos

- Ejecuta `supabase/schema.sql` en SQL Editor.
- Confirma que existen las tablas:
  - `profiles`
  - `parking_zones`
  - `parking_spots`
  - `occupancy_history`
  - `spot_events`

## 2) Usuario admin

- Crea un usuario en Auth.
- Ejecuta:

```sql
update public.profiles
set role = 'admin'
where email = 'tu-correo@dominio.com';
```

## 3) Edge Functions desplegadas

Valida que respondan 200/400 segun corresponda:

- `get-parking-status`
- `ingest-parking-data`
- `reserve-parking-spot`
- `release-parking-spot`
- `create-parking-spot`
- `delete-parking-spot`
- `get-zones`
- `manage-zones`
- `save-hourly-snapshot`
- `get-occupancy-history`

## 4) Frontend configurado

- Revisa `web-dashboard/js/config/config.js`.
- Completa:
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE.ANON_KEY`
  - `MAP_CENTER` (si necesitas otro punto inicial)
  - `MAP_ZOOM` (si necesitas otro zoom inicial)

## 5) Flujo funcional minimo

1. Entrar a `login.html` y registrar usuario.
2. Iniciar sesion con ese usuario.
3. Abrir `dashboard.html`.
4. Verificar que carga mapa y listado de puestos.
5. Crear un puesto (admin).
6. Reservar ese puesto.
7. Liberar reserva.
8. Consultar historial (modal/analitica).

## 6) Firmware

- Edita `firmware/S-Parking/arduino_secrets.h`:
  - URL ingest -> `ingest-parking-data`
  - URL lectura -> `get-parking-status`
- Verifica que el ESP32 actualice estado al backend.

## 7) Jobs recurrentes

Si `pg_cron` esta disponible, ejecutar una sola vez:

```sql
select cron.schedule('sparking-cleanup-expired', '* * * * *', $$select public.cleanup_expired_reservations();$$);
select cron.schedule('sparking-hourly-snapshot', '0 * * * *', $$select public.save_hourly_snapshot(date_trunc('hour', now()));$$);
```

Si `pg_cron` no esta disponible, programa llamadas externas a:

- limpieza de reservas cada 1 minuto
- snapshot cada 1 hora

## 8) Cierre de migracion

- Sin errores 500 en funciones clave por 24h.
- Sin dependencia activa de endpoints Firebase/Cloud Run en frontend/firmware.
- Documentacion interna actualizada con URLs y claves nuevas.
