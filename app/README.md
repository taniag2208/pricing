# TITA Pricing Intelligence 360° — plataforma

Aplicación web multi-cliente de inteligencia de precios. Tita Media configura cada cuenta desde su consola; el cliente entra con su usuario y ve el análisis de su cuenta cuando Tita la publica.

## Qué hace
- **Consola Tita**: crea cuentas de clientes, registra su tienda y sus competidores, importa catálogos, aprueba categorías y rúbricas, supervisa la clasificación, crea usuarios del cliente y publica la cuenta.
- **Importación automática** de catálogos públicos (Shopify `/products.json`, WooCommerce Store API, VTEX catalog search) respetando robots.txt, con pausa entre peticiones. Actualización diaria (cron) con registro de cambios de precio de la competencia. Importación manual por CSV, Excel o texto de página para tiendas sin catálogo público.
- **Claude en el servidor** (`claude-opus-5-5`, con respaldo automático ante rechazos `fallbacks: "default"`): propone categorías y rúbricas, mapea etiquetas por uso y clasifica atributos de cada producto con evidencia, en segundo plano. Copiloto con herramientas sobre los datos de la cuenta. La API key nunca llega al navegador.
- **Análisis** (en el navegador del usuario, sobre los datos de su cuenta): homologación de categorías, precio vs. atributos, escalera, rangos, pirámide, territorios, white spaces, composición, cápsulas, modelo hedónico log-lineal con validación cruzada y abstención, Price Advisor con aprobaciones, Product Launch (con análisis de imagen), Promotion Optimizer, Pulse WTP y Revenue Learning.

## Roles
| Rol | Ve el análisis | Propone cambios y estudios | Aprueba | Costos y ventas | Configura la cuenta |
|---|---|---|---|---|---|
| Administrador Tita | ✓ (todas las cuentas) | ✓ | ✓ | ✓ | ✓ |
| Administrador del cliente | ✓ | ✓ | ✓ | ✓ | — |
| Analista | ✓ | ✓ | — | — | — |
| Lectura | ✓ | — | — | — | — |

Los permisos se validan en el servidor. Un cliente no ve su cuenta hasta que Tita la publica.

## Arquitectura
- `server/` — Node 20+ con Express. `index.js` (API, sesión con cookie httpOnly firmada, permisos), `db.js` (PostgreSQL y migraciones), `store.js` (documentos por cuenta con sincronización incremental), `jobs.js` (cola de trabajos persistente y cron), `scrape.js` (lector de catálogos y robots.txt), `ai.js` (SDK oficial de Anthropic), `shared.js` (carga en el servidor el mismo motor analítico y los mismos parsers del front-end).
- `web/` — interfaz React 18 + htm sin paso de compilación; las librerías se sirven desde `node_modules` (`/vendor`), sin CDN.
- Base de datos: tablas `orgs`, `users`, `docs` (JSONB por cuenta y colección), `jobs`, `audit`, `ai_usage`.

## Desplegar
Necesitas: un PostgreSQL, una API key de Anthropic y un dominio con HTTPS.

**Opción A — Render (la más rápida):** en Render, *New > Blueprint*, conecta este repositorio; `render.yaml` crea el servicio web (Docker, plan Starter, siempre encendido para el cron) y la base de datos. Completa `ANTHROPIC_API_KEY`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` cuando lo pida. `SESSION_SECRET` se genera solo.

**Opción B — Servidor propio de Tita (recomendada si Tita aloja):**
1. Un servidor Ubuntu 22.04 o 24.04 con 2 vCPU, 4 GB de RAM y 40 GB de disco (AWS, GCP, Azure, DigitalOcean o un servidor físico), con los puertos 80 y 443 abiertos a internet.
2. Un registro DNS tipo A del dominio (ej. `pricing.titamedia.com`) apuntando a la IP del servidor.
3. Copia la carpeta `app/` al servidor y ejecuta `sudo ./instalar.sh`. Pide el dominio, el correo y una contraseña temporal del primer administrador, y la API key de Anthropic; genera el resto de secretos y levanta la base de datos, la aplicación, el HTTPS automático (Caddy con Let's Encrypt) y una copia diaria de la base de datos en `respaldos/` (14 días).
4. Actualizar a una versión nueva: reemplaza la carpeta (sin borrar `.env` ni `respaldos/`) y ejecuta `docker compose up -d --build`.

Lleva los respaldos también fuera del servidor (por ejemplo, sincroniza `respaldos/` con un bucket de almacenamiento).

**Primer ingreso:** entra con `ADMIN_EMAIL` / `ADMIN_PASSWORD`; el sistema pide cambiar la contraseña. Desde la consola agregas al resto del equipo de Tita.

## Desarrollo y pruebas
```bash
npm install
DATABASE_URL=postgres://... SESSION_SECRET=dev ANTHROPIC_API_KEY=... npm start
npm run test:e2e   # Postgres embebido + tiendas y API de Claude simuladas + navegador
```

## IA sin costo (Vercel AI Gateway)
Con `AI_PROVIDER=gateway` el servidor usa Vercel AI Gateway en lugar de la API de Anthropic. En Vercel se autentica solo (token OIDC del despliegue, sin API key) y consume los créditos gratuitos de AI Gateway que Vercel da cada mes (US$5). El plan gratuito no incluye los modelos Claude, por eso el modelo por defecto en este modo es `google/gemini-2.5-flash` (cambiable con `AI_MODEL`). Fuera de Vercel se usa `AI_GATEWAY_API_KEY`. Para volver a Claude directo: quita `AI_PROVIDER` y define `ANTHROPIC_API_KEY` con saldo.

## Cómo se leen y comparan los precios
- **Lectura de catálogos**, en este orden: API pública de la plataforma (Shopify, WooCommerce, VTEX); sitemap de productos con los datos estructurados schema.org o las etiquetas meta (Open Graph, microdatos) de cada ficha; y por último el texto de las páginas de categoría, del que la IA extrae nombre y precio. Siempre respetando robots.txt. Se prueba el dominio con y sin `www`. Si nada funciona, el usuario sube el catálogo en CSV o Excel y el análisis sigue.
- **Cobertura medida:** `server/bench.js` intenta leer unas 40 tiendas reales de CO, MX, PE y CL cada lunes (con el cron diario) o a pedido desde la consola de Tita ("Cobertura de lectura de tiendas").
- **Competidores:** en el modo gateway los busca Perplexity Sonar (búsqueda web real); se leen solo los productos cuyo nombre o categoría coincide con el vocabulario del catálogo propio. Se combinan dos búsquedas web con el **registro de tiendas verificadas** (`stores_registry`, alimentado por la medición semanal y por cada competidor leído) del mismo país y tipo de producto. El usuario confirma, quita o agrega competidores antes de leerlos; si ninguno se puede leer, escribe sus links. Cada competidor tiene 60 s como máximo y se descarta si sus precios están en otra moneda o en un nivel muy distinto (más de 6 veces), si redirige al sitio de otro país, o si no se puede leer; el motivo se le muestra al usuario. Las páginas para elegir país (p. ej. studiof.com) se detectan y el usuario elige el sitio.
- **Precio de comparación:** el precio de venta actual (con promoción si la hay), no el precio de lista tachado; `priceBasis: 'list'` en la configuración de la cuenta vuelve al precio de lista. Combos, sets y obsequios quedan fuera de la comparación.
- **Sin modelo hedónico** (muestra insuficiente), una sugerencia de cambio exige al menos 3 comparables cercanos y que el precio quede fuera de su rango P25–P75.
- `npm run test:unit` valida el motor con datos simulados de parámetros conocidos (hedónico, conjoint L18, Van Westendorp, diferencias en diferencias) y el lector de catálogos.

## Documentación técnica
- `../docs/ARQUITECTURA-LECTURA.md`: motor de lectura por niveles, diagnóstico, evaluación de competidores, homologación y seguridad.
- `../docs/DISENO.md`: sistema visual tomado de titamedia.com y decisiones de producto.
- `../docs/QA-RESULTADOS.md`: resultados de la batería de pruebas (`npm run test:battery`).

## Pruebas
`npm run test:all` ejecuta: matemática (`test/math.js`), lector (`test/crawl.js`), batería de casos (`test/battery.js`), cuentas y permisos (`test/e2e.js`), análisis rápido en navegador (`test/quick.js`) y responsive y accesibilidad (`test/ux.js`). Usan Postgres embebido y tiendas e IA simuladas; no tocan servicios reales.

## Variables
Ver `.env.example`. Nuevas en esta versión: `ALLOW_PRIVATE_NETWORK` (solo pruebas), `FETCH_MAX_BYTES`, `HEADLESS`, `BROWSER_WS_ENDPOINT`, `QUICK_AI_TOKENS_DAY`, `ORG_AI_TOKENS_DAY`, `ALLOWED_ORIGINS`, `LOG_SILENT`, `AI_SEARCH_MODEL`, `QUICK_COMP_TIMEOUT_MS`, `QUICK_CATS`, `QUICK_COMPS`. Las más importantes: `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REFRESH_CRON` (por defecto 5:17 a. m. hora de Bogotá), `AI_MODEL`.

## Consideraciones
- **Rastreo:** solo se leen catálogos públicos en formato JSON de la plataforma, respetando robots.txt y con pausa entre páginas. Antes de comercializar, valida con jurídico los términos de uso de los sitios de la competencia de cada cliente.
- **Costo de IA:** cada clasificación, propuesta y pregunta del copiloto consume tokens de la cuenta de Anthropic de Tita; el consumo queda en la tabla `ai_usage` por cuenta y tipo.
- **Fotos de la competencia:** la clasificación usa nombre y ficha; el análisis de imagen se usa en Product Launch.
