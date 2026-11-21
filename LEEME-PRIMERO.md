# Renta Work: paquete para integrar al CRM

Hola. Este paquete tiene todo lo necesario para sumar **Renta Work**, la sección de inversiones en dólares, al CRM de Data Work.

## Qué hay acá

| Qué | Dónde |
| --- | --- |
| **Cómo integrarlo** (paso a paso, reglas, datos y el prompt para Claude) | `docs/INTEGRACION.md` |
| Especificación completa y decisiones tomadas | `docs/ESPECIFICACION.md` |
| **Cómo tiene que verse** (se abre con doble clic; inversor ficticio) | `docs/vista-ejemplo/index.html` |
| Código de la app funcionando | `app/`, `components/`, `lib/`, `public/` |
| Motor de cálculo y sus 40 tests | `lib/engine.ts`, `tests/` |
| Carga de los datos reales | `scripts/seed.ts` |
| Cómo correrla sola para probar | `README.md` |

## Cómo empezar (con Claude)

1. Descomprimí este zip en una carpeta.
2. Abrí Claude Code en el repositorio del CRM y dale acceso también a esta carpeta.
3. Copiá el prompt de la **sección 9 de `docs/INTEGRACION.md`** y pegalo.
4. Claude te va a presentar un plan antes de tocar nada. Revisalo y aprobalo.

## Para verla funcionando antes de integrar

```bash
npm install
ADMIN_EMAIL=admin@ejemplo.com ADMIN_PASSWORD='una-clave-segura' npm run seed
SEED_DEMO=1 npm run seed      # opcional: usuarios de demostración
npm run build && npm start    # http://localhost:3000
npm test                      # 40 tests
```

## Importante

- **Contiene datos reales** (nombres y montos de los préstamos de ALFAH). No lo compartas fuera del equipo.
- La recepción real de dinero está **deshabilitada** a propósito, hasta que estén definidos el emisor, los contratos y el encuadre legal.
- Las decisiones que siguen abiertas están en la sección 8 de `docs/INTEGRACION.md`.
