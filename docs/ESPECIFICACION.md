# Renta Work — Especificación

Primera versión navegable de Renta Work: sección de inversiones en dólares con Token RW (USD 100 por token), 12 % nominal anual, liquidación semestral por posición y reinversión en tokens enteros.

> **Contexto de esta entrega.** El repositorio del CRM de Data Work no estaba disponible en esta sesión. Renta Work se construyó como aplicación independiente (Next.js + SQLite) con límites claros para integrarla al CRM: usuarios/roles, rendiciones y documentos están detrás de módulos propios (`lib/auth.ts`, `lib/commissions.ts`, `lib/documents.ts`) que se reemplazan por los del CRM al integrar.

## 1. Pantallas

### Agente / inversor

| Pantalla | Ruta | Contenido |
| --- | --- | --- |
| Mi portfolio (principal) | `/` | 5 tarjetas (capital invertido, mis tokens, intereses en curso, intereses disponibles, total de mi cartera), barra "Próximo token", gráfico de evolución, próximas liquidaciones por posición (la más cercana destacada), próximos vencimientos, información complementaria, botones de acción, solicitudes en curso |
| Invertir | `/invertir` | Elegir cantidad de tokens; origen: transferencia o comisión en dólares disponible; resumen y confirmación de condiciones |
| Reinvertir intereses | `/reinvertir` | Reinversión manual (cantidad de tokens) y activación/desactivación de la automática; resumen previo: importe, tokens, saldo restante, fecha de activación, tasa, vencimiento |
| Solicitar cobro | `/cobrar` | Importe a cobrar de intereses disponibles; queda como solicitud pendiente |
| Solicitar rescate | `/rescatar` | Cantidad de tokens y condiciones de la emisión; sin promesas de liquidez |
| Mis movimientos | `/movimientos` | Lista con filtros por fecha, tipo y estado; detalle por movimiento; descarga CSV |
| Mis documentos | `/documentos` | Contratos, comprobantes y rendiciones privadas del titular |
| Proyecto referencial | `/proyecto` | Ficha de la unidad y equivalencia orientativa en m² |
| Inversores | `/inversores` | Fila desplegable por titular, respetando el consentimiento de cada uno |

### Administrador

| Pantalla | Ruta | Contenido |
| --- | --- | --- |
| Resumen | `/admin` | Capital pendiente, intereses en curso y liquidados pendientes, cupo, dinero nuevo vs reinversiones, calendario de liquidaciones y vencimientos, proyección de caja con supuestos |
| Solicitudes | `/admin/solicitudes` | Aprobar, completar (al confirmar fondos) o rechazar inversiones, cobros y rescates |
| Liquidaciones | `/admin/liquidaciones` | Ejecutar liquidaciones vencidas hasta una fecha (idempotente) |
| Titulares | `/admin/titulares` | Alta de titulares, vínculo con usuario, consentimiento, reinversión automática, posiciones |
| Emisiones y proyecto | `/admin/emisiones` | Tasa, plazo (con estado "propuesta"/"confirmado"), cupo y si incluye reinversiones, condiciones de salida; valores referenciales del m² con fecha y fuente |
| Comisiones | `/admin/comisiones` | Comisiones en USD disponibles por agente (puente con rendiciones) |
| Movimientos | `/admin/movimientos` | Reversos trazables y ajustes |
| Documentos | `/admin/documentos` | Carga de documentos por titular |
| Usuarios | `/admin/usuarios` | Alta de usuarios y roles |
| Auditoría | `/admin/auditoria` | Responsable, fecha y detalle de cada acción administrativa |

## 2. Modelo de datos

Importes en centavos de USD (enteros). Residuos de interés en decimal de alta precisión (texto). Fechas `AAAA-MM-DD`.

| Tabla | Campos clave | Notas |
| --- | --- | --- |
| `users` | email, nombre, rol (`admin` / `agent`), hash de clave | En el CRM se reemplaza por su tabla de usuarios |
| `holders` | nombre, `user_id` opcional, `kind` (`token` / `prestamo`), consentimiento, reinversión automática, `is_demo` | Titular de posiciones; puede no tener usuario (préstamos importados) |
| `projects`, `m2_prices` | ficha de la unidad; historial de precio del m² con fecha y fuente | |
| `emissions` | tasa (pb), plazo y estado del plazo, cupo, `cap_includes_reinvestments`, condiciones de rescate y salida | Cupo configurable aparte del valor de la unidad |
| `positions` | titular, emisión, origen, tokens, capital original, capital pendiente, tasa, activación, vencimiento, liquidaciones hechas, `accrual_from`, `carry` | Una fila por aporte o reinversión |
| `movements` | tipo, estado, deltas de capital / tokens / disponible, saldos resultantes, referencia, `reverses_id`, `idempotency_key` | Fuente de verdad de los saldos; sólo suman los `completada` |
| `commissions` | agente, referencia de rendición, importe USD, cobrado, invertido, reservado | Puente con rendiciones |
| `documents` | titular, título, tipo, archivo | Privados por titular |
| `audit_log` | actor, acción, entidad, datos, fecha | |
| `sessions` | token, usuario, vencimiento | |

## 3. Reglas de cálculo

1. **Interés simple diario:** `interés = capital pendiente × 0,12 × días reales / 365`. Se acumula desde `accrual_from` hasta la fecha consultada, más el `carry`.
2. **Liquidación por posición:** cada 6 meses desde la fecha de activación de esa posición (`activación + 6·k meses`, con ajuste a fin de mes: 31/08 + 6 meses = 28/02 o 29/02). Si el vencimiento cae antes, la última liquidación es al vencimiento.
3. **Redondeo:** se liquida el importe truncado al centavo; la fracción menor a un centavo queda en `carry` y se suma al período siguiente. En la liquidación final se redondea al centavo más cercano para no dejar residuos.
4. **Tres estados del interés:** en curso (generado, no liquidado), disponible (liquidado, sin cobrar ni reinvertir; no genera interés) y cobrado / reinvertido.
5. **Cambios de capital a mitad de período** (rescate o devolución parcial): primero se devenga lo generado hasta ese día en `carry`, luego cambia el capital.
6. **Reinversión:** `tokens = piso(disponible / 100)`, limitado por el cupo si la emisión cuenta reinversiones. El remanente queda disponible. Cada reinversión es una posición nueva con su propia fecha de activación, su propio calendario y el vencimiento aceptado al confirmarla; no extiende el vencimiento de otras posiciones.
7. **Reinversión automática:** al liquidar, si el titular la autorizó, convierte en tokens todos los bloques completos que entren en el cupo; si el cupo no alcanza, deja el resto disponible y registra un aviso.
8. **Totales:** capital invertido = aportes + reinversiones − devoluciones; total de cartera = capital + en curso + disponibles. Lo cobrado o reinvertido no se vuelve a sumar.
9. **TEA teórica 12,36 %:** `(1 + 0,06)² − 1`. Sólo referencia matemática.
10. **Rentabilidad personal (XIRR):** flujos = aportes externos (negativos), cobros y devoluciones (positivos), valor de cartera hoy (positivo). Las reinversiones no son flujos externos. Con menos de 30 días de historia o sin flujos suficientes: "Todavía no disponible".
11. **Equivalencia en m²:** `capital activo / precio referencial vigente del m²`. Con USD 1.000/m², USD 100 = 0,10 m². Es orientativa: no son metros propios.
12. **Cupo:** usado = capital emitido en tokens de la emisión (aportes y comisiones; reinversiones según `cap_includes_reinvestments`, por defecto sí). Los préstamos importados no consumen cupo.
13. **Idempotencia:** cada liquidación tiene clave `liq:<posición>:<n>`; cada solicitud del usuario lleva una clave única generada en el formulario, así un doble clic o reintento no duplica.
14. **Correcciones:** nunca se edita un movimiento completado; se registra un reverso o un ajuste trazable.

## 4. Préstamos preexistentes de ALFAH

Se importan como saldo inicial (`saldo_inicial_importado`), titulares de tipo `prestamo`: no compran ni reinvierten tokens, no consumen cupo, no se atribuyen a la K01. Siete posiciones distintas al 12 % (Leonardo Misuraca USD 232.260; Sebastián David USD 70.000; total USD 302.260). Vencimiento: no documentado → "Pendiente". El consentimiento para mostrarlos en "Inversores" arranca como no otorgado hasta que el administrador lo registre.

## 5. Decisiones pendientes

| Tema | Situación en esta versión |
| --- | --- |
| Plazo de 24 meses | Cargado como **propuesta**; se muestra "propuesta, pendiente de confirmación" |
| Devolución anticipada y condiciones de salida | Texto configurable por emisión; vacío = "A definir por contrato" |
| Cupo de la emisión | Configurable; por defecto incluye reinversiones (respuesta en el doc) |
| Cupo inicial | Sin valor por defecto: lo define el administrador (no se toma USD 77.880) |
| Vencimiento de los préstamos ALFAH | No documentado |
| Interés tras el vencimiento si el capital no se devuelve | No se devenga; a definir por contrato |
| ¿Un rescate libera cupo? | No en esta versión |
| Consentimiento de los titulares importados | No otorgado hasta que el administrador lo registre |
| Emisor, contratos, respaldo, impuestos y encuadre regulatorio | Sin definir. Por eso la recepción real de dinero está **deshabilitada** (`OPERACIONES_REALES=false`): sólo se pueden completar operaciones de titulares de demostración |
| Integración con el CRM (usuarios, rendiciones, documentos) | Módulos puente listos para reemplazar |

## 6. Cambios de alcance acordados después

- **Panel lúdico por usuario.** Cada usuario habilitado ve su propio panel: contador de intereses en vivo, simulador "¿Y si sumás más?", próximos cobros, gráfico, equivalencia en m² (sólo tokens), logros y detalle desplegable de cada aporte.
- **Transparencia entre participantes.** Por decisión del negocio todos los participantes se ven entre sí en una **tabla de posiciones** en la pantalla principal (nombre, plata puesta, intereses generados, ordenados por plata puesta). Esto reemplaza la regla original de "sin rankings" y el consentimiento por defecto pasa a `completo`; el administrador puede ocultar o anonimizar a alguien puntual.
