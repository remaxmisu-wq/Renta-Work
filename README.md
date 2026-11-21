# Renta Work

Sección de inversiones en dólares para agentes del CRM de Data Work. Dos solapas: **Inversión** (la vista general, con todos los inversores) y **Mi panel** (el panel individual y lúdico de cada usuario). Empezá por [`LEEME-PRIMERO.md`](LEEME-PRIMERO.md).

- **Especificación** (pantallas, modelo de datos, reglas de cálculo, decisiones pendientes): [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md)
- **Motor de cálculo** (puro, con tests): [`lib/engine.ts`](lib/engine.ts)
- **Operaciones y saldos** (todo pasa por movimientos trazables): [`lib/ledger.ts`](lib/ledger.ts)

## Puesta en marcha

Requiere Node 20 o superior.

```bash
npm install
ADMIN_EMAIL=admin@ejemplo.com ADMIN_PASSWORD='una-clave-segura' npm run seed   # datos reales: proyecto, emisión, préstamos ALFAH
SEED_DEMO=1 npm run seed                                                        # opcional: datos de demostración
npm run build && npm start                                                      # http://localhost:3000
```

Usuario de demostración: `demo@rentawork.local` / `demo1234` (sólo con `SEED_DEMO=1`).

Liquidaciones diarias (por ejemplo, con cron):

```bash
npm run liquidar            # liquida lo vencido a hoy y aplica reinversiones automáticas; es idempotente
```

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_PATH` | Archivo SQLite (por defecto `data/renta-work.db`) |
| `OPERACIONES_REALES` | `true` habilita completar inversiones de titulares reales. Por defecto deshabilitado hasta validar emisor, contratos, respaldo, impuestos y encuadre regulatorio |
| `RW_TODAY` | Fija la fecha del sistema (`AAAA-MM-DD`) para pruebas |
| `INSECURE_COOKIES` | `true` permite probar `npm start` sin HTTPS |

## Tests

```bash
npm test         # 40 tests: interés días reales/365, liquidación por posición, residuos, reinversión en bloques, cupo, XIRR, idempotencia, reversos, préstamos importados
npm run typecheck
```

## Integración con el CRM

Esta versión corre independiente porque el código del CRM no estaba disponible. Puntos de reemplazo:

| Módulo | Hoy | Al integrar |
| --- | --- | --- |
| `lib/auth.ts` | Usuarios y sesiones propias, roles `admin` / `agent` | Sesión y roles del CRM |
| `commissions` + `/admin/comisiones` | Alta manual de comisiones en USD disponibles | Lectura de rendiciones en dólares del CRM |
| `documents` + `/api/documentos/[id]` | Archivos en `data/uploads` | Repositorio documental del CRM |
| SQLite (`lib/db.ts`) | Archivo local | Base del CRM (el esquema está en `lib/db.ts`) |
