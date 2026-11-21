# Integrar Renta Work al CRM de Data Work

Guía técnica para integrar Renta Work al CRM. Sirve para hacerlo a mano o con Claude: al final está el prompt listo para pegar.

## 1. Qué es Renta Work

Es una sección de inversiones en dólares dentro del CRM. Cada agente habilitado compra **Tokens RW** de USD 100, que rinden un **12 % anual** de interés simple. Los intereses se liquidan **cada 6 meses desde la fecha de cada aporte** y se pueden cobrar o reinvertir en tokens enteros. También están cargados los préstamos que dos titulares ya tenían con ALFAH.

## 2. Qué tiene que ver el usuario

La app tiene **dos solapas**, más una de administración que solo ve el administrador.

| Solapa | Ruta | Qué muestra |
| --- | --- | --- |
| **Inversión** (general, la misma para todos) | `/inversion` | Contador en vivo de los intereses generados entre todos; capital trabajando; generación por día, mes y año; **lista de inversores de mayor a menor** (nombre, cuánto puso, intereses generados, genera por mes) con detalle desplegable de aportes; gráfico general; próximos cobros de todos |
| **Mi panel** (individual, uno por usuario) | `/` | Saludo; contador en vivo de sus intereses; "hoy tenés"; aviso para reinvertir; simulador "¿Y si sumás más?"; próximos cobros; gráfico; "Tu plata, en metros del depto" (solo tokens); logros; aportes desplegables; últimos movimientos |
| Administrar (solo admin) | `/admin/*` | Solicitudes, liquidaciones, titulares, emisiones, comisiones, movimientos, documentos, usuarios, auditoría |

Pantallas que se abren desde **Mi panel**:

| Pantalla | Ruta | Qué hace |
| --- | --- | --- |
| Invertir | `/invertir` | Barra tipo simulador para elegir tokens, origen de los fondos (transferencia o comisión en USD) y confirmación |
| Festejo | `/listo` | Después de invertir o reinvertir: lo que va a ganar, tokens, m² y logro desbloqueado |
| Tus intereses | `/intereses` | Cobrar y reinvertir lado a lado (reinvertir como recomendado) y reinversión automática |
| Movimientos | `/movimientos` | Línea de tiempo por mes con íconos; los cobros de intereses quedan destacados; filtros y descarga CSV |
| Rescate | `/rescatar` | Solicitud de devolución de capital, sujeta al contrato |

**Una vista de referencia sin datos reales** está en `docs/vista-ejemplo/index.html`: se abre con doble clic y muestra el panel de un inversor ficticio tal como tiene que quedar.

## 3. Estética

Fondo gris cálido (`#f3f2ef`), tarjetas blancas con borde fino, azul marino para el capital y verde para los intereses, totales grandes y destacados con borde verde. Los tokens están en `app/globals.css` (incluye modo oscuro). Se puede adaptar a la estética del CRM, pero conviene conservar el tono simple y lúdico: está pensado para personas sin experiencia financiera.

## 4. Qué hay en el código

| Parte | Archivos | ¿Se copia tal cual? |
| --- | --- | --- |
| Motor de cálculo (interés, liquidaciones, reinversión, XIRR) | `lib/engine.ts`, `lib/dates.ts`, `lib/money.ts` | **Sí.** TypeScript puro; solo depende de `decimal.js` |
| Operaciones y saldos (solicitudes, liquidar, reinvertir, reversos, préstamos importados) | `lib/ledger.ts` | Sí, adaptando el acceso a la base |
| Lecturas para pantallas (panel, vista general, gráficos, m²) | `lib/views.ts` | Sí, adaptando el acceso a la base |
| Esquema de tablas | `lib/db.ts` | Traducirlo al motor de base del CRM |
| Pantallas | `app/(app)/**`, `components/**` | Adaptar al framework de UI del CRM |
| Interacciones (contador en vivo, simulador) | `public/rw-enhance.js` | Sí: JS sin dependencias que actúa sobre atributos `data-ticker` y `data-sim` |
| Acciones del servidor | `app/actions.ts` | Adaptar a la forma en que el CRM maneja formularios |
| Carga de datos reales | `scripts/seed.ts` | Pasar estos datos a la base del CRM |
| Liquidación diaria | `scripts/liquidar.ts` | Programarla en el CRM |
| Tests (40) | `tests/` | **Sí**: tienen que seguir pasando |

Stack actual: Next.js 15, React 19, SQLite (better-sqlite3), TypeScript. Para probarla sola, ver `README.md`.

## 5. Puntos de conexión con el CRM

1. **Usuarios y roles** (`lib/auth.ts`): reemplazar por la sesión del CRM. Renta Work solo necesita el `id`, el `name` y si el usuario es `admin` o `agent`.
2. **Titular ↔ usuario** (`holders.user_id`): cada usuario habilitado en Renta Work es un titular vinculado a su usuario del CRM. Así cada uno ve **su** panel.
3. **Rendiciones** (`commissions`): reemplazar el alta manual por las rendiciones en dólares del CRM con estado "disponible". Solo esas se pueden invertir; las comisiones en pesos no participan.
4. **Documentos** (`documents`): usar el repositorio documental del CRM. Cada titular ve solo los suyos.
5. **Liquidación diaria**: ejecutar `runSettlements(hoy)` una vez por día. Es idempotente: correrla dos veces no duplica nada.

## 6. Reglas que no se pueden romper

- Los saldos salen **solo** de movimientos completados. Nada se edita ni se borra: los errores se corrigen con reversos.
- Interés = capital × 0,12 × días reales / 365, por aporte. Se liquida cada 6 meses desde la fecha de cada aporte. El residuo menor a un centavo pasa al período siguiente.
- Solo tokens enteros de USD 100. Lo que sobra queda disponible y no genera interés.
- Una solicitud (invertir, cobrar, rescatar) no cambia saldos hasta que el administrador la completa.
- Los préstamos de ALFAH son saldos importados: no compran ni reinvierten tokens, no consumen cupo, no capitalizan intereses y no se atribuyen a la unidad K01.
- La recepción real de dinero sigue **deshabilitada** (`OPERACIONES_REALES`) hasta validar emisor, contratos, respaldo, impuestos y encuadre regulatorio.
- **Transparencia**: todos los participantes se ven entre sí en la lista de la solapa Inversión. El administrador puede ocultar a alguien puntual (`holders.consent`).
- La tasa se muestra siempre como **pactada, no garantizada**, y los montos futuros como **estimados**.

## 7. Datos reales a cargar

`npm run seed` carga:
- El proyecto Pipi Collection, unidad K01: 77,88 m², referencia USD 77.880 y USD 1.000 por m².
- La emisión: 12 %, plazo de 24 meses como **propuesta**, cupo **sin definir**.
- Las 7 posiciones de la planilla ClaudeFinanciero:

| Titular | Fecha base | Capital (USD) |
| --- | --- | --- |
| Leonardo Misuraca | 31/07/2026 | 57.330 |
| Leonardo Misuraca | 05/08/2026 | 57.330 |
| Leonardo Misuraca | 21/09/2026 | 58.800 |
| Leonardo Misuraca | 21/09/2026 | 58.800 |
| Sebastián David | 31/07/2026 | 30.000 |
| Sebastián David | 31/07/2026 | 20.000 |
| Sebastián David | 02/08/2026 | 20.000 |

Son siete posiciones distintas: no hay que eliminar ninguna aunque coincidan en importe y fecha. Después de cargarlas, vincular a Leonardo y a Sebastián con sus usuarios del CRM (Administrar → Titulares).

## 8. Decisiones pendientes

| Tema | Estado |
| --- | --- |
| ¿Los titulares de préstamos (Leonardo, Sebastián) pueden sumar plata nueva en tokens desde su panel? | **Sin definir.** Hoy ven el simulador, pero sin botón de invertir ni sección de m² |
| Cupo de la emisión | Sin definir. Es configurable y por defecto incluye reinversiones |
| Plazo de 24 meses | Propuesta, pendiente de confirmación |
| Vencimiento de los préstamos de ALFAH | No documentado |
| Emisor, contratos, impuestos y encuadre legal | Sin definir. Por eso la recepción real de dinero está deshabilitada |

## 9. Prompt para Claude

Pegar en la sesión de Claude que tenga abierto el repositorio del CRM, con este proyecto disponible (el zip descomprimido en una carpeta, o el repositorio `remaxmisu-wq/Renta-Work`, rama `claude/wizardly-cannon-zgm59e`):

> Tengo que integrar Renta Work al CRM de Data Work que está en este repositorio. El código de Renta Work está en [carpeta o repositorio].
>
> 1. Leé primero `LEEME-PRIMERO.md`, `docs/INTEGRACION.md` y `docs/ESPECIFICACION.md` de Renta Work, y abrí `docs/vista-ejemplo/index.html` para ver cómo tiene que quedar.
> 2. Después estudiá el CRM: autenticación y roles, base de datos, rendiciones o comisiones en dólares, documentos, framework de UI y navegación.
> 3. Antes de escribir código, presentame un plan con: qué tablas agregar (a partir de `lib/db.ts`), cómo vincular usuarios del CRM con titulares, cómo conectar las rendiciones en dólares disponibles, dónde van las dos solapas ("Inversión" y "Mi panel") y la administración, qué componentes del CRM reutilizar y cómo programar la liquidación diaria.
> 4. Reglas: copiá `lib/engine.ts`, `lib/dates.ts`, `lib/money.ts` y `lib/ledger.ts` sin cambiar la lógica de cálculo; portá los tests de `tests/` y que pasen; respetá las reglas de la sección 6 de `docs/INTEGRACION.md`; mantené el estilo simple y lúdico de "Mi panel" (contador en vivo, simulador, logros, festejo); no habilites la recepción real de dinero; no inventes datos.
> 5. Cargá los datos reales de la sección 7 y dejame vincular cada titular con su usuario.
> 6. Cuando apruebe el plan, implementalo en una rama nueva y mostrame cómo probarlo.
