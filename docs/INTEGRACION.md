# Integrar Renta Work al CRM de Data Work

Guía para quien integre Renta Work al CRM, con o sin ayuda de Claude.

## Qué hay en este repositorio

| Parte | Archivo | ¿Se copia tal cual? |
| --- | --- | --- |
| Motor de cálculo (interés, liquidaciones, reinversión, XIRR) | `lib/engine.ts`, `lib/dates.ts`, `lib/money.ts` | Sí. Es TypeScript puro, sin dependencias salvo `decimal.js` |
| Operaciones y saldos (solicitudes, liquidar, reinvertir, reversos) | `lib/ledger.ts` | Sí, adaptando el acceso a la base |
| Esquema de tablas | `lib/db.ts` | Traducirlo al motor de base del CRM |
| Pantallas | `app/(app)/**` | Adaptar al framework de UI del CRM |
| Reglas y decisiones pendientes | `docs/ESPECIFICACION.md` | Leer antes de tocar nada |
| Tests (40) | `tests/` | Sí: deben seguir pasando después de integrar |

## Puntos de conexión con el CRM

1. **Usuarios y roles** (`lib/auth.ts`): reemplazar por la sesión del CRM. Renta Work sólo necesita `id`, `name` y si el usuario es `admin` o `agent`.
2. **Titular ↔ usuario** (`holders.user_id`): cada agente con portfolio es un titular vinculado a su usuario del CRM.
3. **Rendiciones** (`commissions`): reemplazar el alta manual por las rendiciones en dólares del CRM con estado "disponible". Sólo esas se pueden invertir; las comisiones en pesos no participan.
4. **Documentos** (`documents`, `/api/documentos/[id]`): usar el repositorio documental del CRM, conservando que cada titular sólo ve los suyos.
5. **Liquidación diaria**: programar `runSettlements(hoy)` una vez por día (hoy existe `npm run liquidar`). Es idempotente.

## Reglas que no se pueden romper al integrar

- Los saldos salen sólo de movimientos completados; nada se edita ni se borra, se corrige con reversos.
- Interés = capital × 0,12 × días reales / 365, por posición, liquidado cada 6 meses desde su propia activación. El residuo menor a un centavo pasa al período siguiente.
- Sólo tokens enteros de USD 100. El remanente queda disponible y no genera interés.
- Los préstamos de ALFAH son saldos importados: no compran ni reinvierten tokens, no consumen cupo y no capitalizan intereses.
- La recepción real de dinero sigue deshabilitada (`OPERACIONES_REALES`) hasta validar emisor, contratos, respaldo, impuestos y encuadre regulatorio.
- "Inversores" sólo muestra a quien dio consentimiento.

## Datos reales a cargar

El script `npm run seed` carga el proyecto Pipi Collection K01, la emisión (12 %, plazo de 24 meses como propuesta, cupo sin definir) y las 7 posiciones de la planilla ClaudeFinanciero. Al integrar, cargar los mismos datos en la base del CRM y vincular cada titular con su usuario.

## Prompt sugerido para Claude

Copiar y pegar en la sesión de Claude que tenga abierto el repositorio del CRM, con este repositorio también disponible:

> Tengo que integrar Renta Work (repositorio `remaxmisu-wq/Renta-Work`, rama `claude/wizardly-cannon-zgm59e`) al CRM de Data Work que está en este repositorio.
> Primero leé `docs/ESPECIFICACION.md` y `docs/INTEGRACION.md` de Renta Work, y después la arquitectura del CRM: autenticación, roles, base de datos, rendiciones y componentes de UI.
> Antes de escribir código, presentame un plan con: qué tablas agregar al CRM (a partir de `lib/db.ts`), cómo mapear usuarios y roles, cómo conectar las rendiciones en dólares disponibles, dónde van las pantallas y qué componentes del CRM reutilizar.
> Reglas: copiá `lib/engine.ts`, `lib/dates.ts`, `lib/money.ts` y `lib/ledger.ts` sin cambiar la lógica de cálculo; portá los tests de `tests/` y que pasen; respetá la estética del CRM; no habilites recepción real de dinero; no inventes datos.
> Cuando apruebe el plan, implementalo en una rama nueva.
