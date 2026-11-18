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
- **Lectura de catálogos:** primero la API pública de la plataforma (Shopify, WooCommerce, VTEX); si no existe o el robots.txt de la tienda la bloquea, el sitemap de productos y los datos estructurados schema.org de cada ficha (funciona en casi cualquier plataforma). Se prueba el dominio con y sin `www`.
- **Competidores:** en el modo gateway los busca Perplexity Sonar (búsqueda web real); se leen solo los productos cuyo nombre o categoría coincide con el vocabulario del catálogo propio. Si no aparecen competidores legibles, el usuario escribe sus links.
- **Precio de comparación:** el precio de venta actual (con promoción si la hay), no el precio de lista tachado; `priceBasis: 'list'` en la configuración de la cuenta vuelve al precio de lista. Combos, sets y obsequios quedan fuera de la comparación.
- **Sin modelo hedónico** (muestra insuficiente), una sugerencia de cambio exige al menos 3 comparables cercanos y que el precio quede fuera de su rango P25–P75.
- `npm run test:unit` valida el motor con datos simulados de parámetros conocidos (hedónico, conjoint L18, Van Westendorp, diferencias en diferencias) y el lector de catálogos.

## Variables
Ver `.env.example`. Las más importantes: `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `REFRESH_CRON` (por defecto 5:17 a. m. hora de Bogotá), `AI_MODEL`.

## Consideraciones
- **Rastreo:** solo se leen catálogos públicos en formato JSON de la plataforma, respetando robots.txt y con pausa entre páginas. Antes de comercializar, valida con jurídico los términos de uso de los sitios de la competencia de cada cliente.
- **Costo de IA:** cada clasificación, propuesta y pregunta del copiloto consume tokens de la cuenta de Anthropic de Tita; el consumo queda en la tabla `ai_usage` por cuenta y tipo.
- **Fotos de la competencia:** la clasificación usa nombre y ficha; el análisis de imagen se usa en Product Launch.
