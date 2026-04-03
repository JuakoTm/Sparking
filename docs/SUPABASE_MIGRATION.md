# Migracion a Supabase (desde cero)

Este documento describe el levantamiento completo de backend y autenticacion en Supabase para S-Parking, sin importar datos desde Firebase.

## 1. Requisitos

- Cuenta en Supabase.
- Proyecto Supabase creado.
- Node.js 20+ para utilidades locales.
- Supabase CLI instalada (opcional, recomendada):
  - `npm i -g supabase`

## 2. Crear esquema base

1. Abrir SQL Editor en Supabase.
2. Copiar y ejecutar `supabase/schema.sql` completo.
3. Verificar tablas creadas:
   - `profiles`
   - `parking_zones`
   - `parking_spots`
   - `occupancy_history`
   - `spot_events`

## 3. Crear primer usuario administrador

1. Registrar usuario desde la interfaz web de login (cuando este conectada a Supabase) o desde Auth -> Users.
2. Ejecutar en SQL Editor:

```sql
update public.profiles
set role = 'admin'
where email = 'tu-correo@dominio.com';
```

## 4. Variables necesarias

En Supabase Project Settings -> API:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Uso recomendado:

- Frontend: `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- Edge Functions: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

## 5. Desplegar Edge Functions

Las funciones preparadas estan en `supabase/functions`.

Funciones incluidas:

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

Comandos ejemplo:

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF

supabase functions deploy get-parking-status
supabase functions deploy ingest-parking-data
supabase functions deploy reserve-parking-spot
supabase functions deploy release-parking-spot
supabase functions deploy create-parking-spot
supabase functions deploy delete-parking-spot
supabase functions deploy get-zones
supabase functions deploy manage-zones
supabase functions deploy save-hourly-snapshot
supabase functions deploy get-occupancy-history
```

Configurar secretos para funciones:

```bash
supabase secrets set SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

## 6. Configurar frontend

1. Crear `web-dashboard/js/config/config.js` desde el ejemplo.
2. Completar:
   - `SUPABASE.URL`
   - `SUPABASE.ANON_KEY`
   - Endpoints `.../functions/v1/...`

Formato de endpoint:

`https://TU_PROJECT_REF.supabase.co/functions/v1/<nombre-funcion>`

## 7. Configurar firmware ESP32

Editar `firmware/S-Parking/arduino_secrets.h`:

- `SECRET_GCP_URL_INGEST` -> endpoint de `ingest-parking-data`
- `SECRET_GCP_URL_GET` -> endpoint de `get-parking-status`

Nota: por seguridad, idealmente protege `ingest-parking-data` con un token de dispositivo.

## 8. Programar tareas recurrentes

En SQL Editor, ejecutar una sola vez (si `pg_cron` esta habilitado):

```sql
select cron.schedule('sparking-cleanup-expired', '* * * * *', $$select public.cleanup_expired_reservations();$$);
select cron.schedule('sparking-hourly-snapshot', '0 * * * *', $$select public.save_hourly_snapshot(date_trunc('hour', now()));$$);
```

Si tu plan no permite `pg_cron`, usa un scheduler externo para llamar:

- `save-hourly-snapshot` cada hora.
- `get-parking-status` o `cleanup_expired_reservations()` cada minuto.

## 9. Checklist de validacion

1. Login y logout correctos.
2. Carga de dashboard y lista de puestos.
3. Reserva y liberacion de puesto.
4. CRUD de zonas y puestos en modo admin.
5. Ingest desde ESP32.
6. Historial con datos y grafico funcional.
7. Snapshot horario generandose correctamente.

## 10. Corte final de Firebase

Cuando todo este validado:

1. Cambiar todas las URLs de produccion al dominio Supabase.
2. Desactivar llamados al backend Firebase/Cloud Run.
3. Mantener una ventana corta de rollback (24-48h) por seguridad.
