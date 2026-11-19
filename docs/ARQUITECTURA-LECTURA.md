# Motor de lectura e inteligencia competitiva

Este documento describe cómo Tita Pricing Intelligence 360° lee una tienda, cómo evalúa a los competidores y qué protecciones aplica. El código está en `app/server/`.

## 1. Diagnóstico inicial (fase 1)

Causas verificadas en el código antes de esta iteración:

| Problema | Causa | Corrección |
|---|---|---|
| SSRF (crítico) | El endpoint público `/api/quick` y las URL de competidores propuestas por la IA se descargaban sin validar el destino ni las redirecciones. | `server/net.js`: validación de URL, DNS al conectar, bloqueo de redes privadas y metadatos de nube, cada redirección validada. |
| Errores genéricos | Todo fallo terminaba en `no_catalog` o `unreachable`; se perdían el código HTTP, el tiempo agotado y la lectura parcial. | Taxonomía de errores y diagnóstico por intento (`ReadError`, `diag`). |
| Sin reintentos | Una respuesta 429/5xx o un corte de red hacía fallar la lectura. | Reintentos con espera creciente en `safeFetch`. |
| Sin moneda ni procedencia | No se detectaba la moneda; los productos no guardaban de dónde ni cuándo salió el precio. | Moneda desde API, JSON-LD y página; cada producto guarda `src`, `cur` y `at`. |
| Productos sin precio invisibles | Se descartaban sin contarlos. | Se cuentan (`found` frente a `priced`) y existe el código `no_prices`. |
| Sin contenido dinámico | No había nivel para tiendas que cargan productos con JavaScript. | Nivel 3 con navegador sin interfaz (Playwright), opcional. |
| Competidores descartados en silencio | Un único estado "rechazado" mezclaba relevancia, legibilidad y comparabilidad; umbrales rígidos (10 productos, 6× el precio); la búsqueda se cortaba en 6. | Evaluación en tres preguntas, clasificación por tipo, nada se elimina, reintento solo de fallidos. |
| Dominios inventados | La IA proponía dominios que no existen. | Búsqueda con Perplexity Sonar + verificación de DNS y respuesta antes de mostrar. |

Limitaciones externas (no son errores del producto): tiendas con protección anti-bots (Cloudflare, Akamai), tiendas cuyo robots.txt prohíbe la lectura y tiendas sin catálogo público. No se evaden.

## 2. Pipeline de lectura (`server/scrape.js`)

```
URL → validación y DNS (net.js) → página de inicio (redirecciones, selector de país, inicio de sesión, WAF)
    → plataforma y moneda (firmas en el HTML)
    → Nivel 1  API pública: Shopify /products.json · VTEX catalog_system · WooCommerce Store API
    → Nivel 2  sitemap + JSON-LD schema.org (Product, ProductGroup, variantes) + Open Graph / microdatos
    → Nivel 2b texto de páginas de categoría → extracción con IA (solo HTML publicado)
    → Nivel 3  navegador sin interfaz (Playwright o BROWSER_WS_ENDPOINT) → JSON-LD renderizado + texto con IA
    → Nivel 4  recuperación: archivo CSV/Excel o conexión autenticada (server/connectors.js)
```

- Todo pasa por `robots.txt` (RFC 9309: 4xx = sin restricciones; 5xx o sin respuesta = no se lee).
- El navegador del nivel 3 bloquea imágenes, fuentes y video, valida cada petición contra la misma política SSRF y tiene límites de páginas y tiempo.
- La plataforma detectada se prueba primero.

### Estados y códigos

| Código | Significado para el usuario |
|---|---|
| `invalid_url` | La dirección no es válida o apunta a una red privada. |
| `unreachable` | El dominio no existe o no responde (`reason`: `dns_not_found`, código de red). |
| `restricted` | El sitio no permite la lectura (`reason`: `robots`, `robots_unavailable`, `waf`, `login`). |
| `country_selector` | La dirección es una página para elegir país; se ofrecen los sitios. |
| `no_catalog` | No hay catálogo público legible con ningún método. |
| `no_prices` | Hay productos pero sin precio visible. |
| `timeout` | La tienda tardó demasiado. |
| `ai_error` | La IA no pudo extraer productos del texto. |
| `persistence_error` | La base de datos no respondió (lo devuelve la API, con número de referencia). |
| lectura `ok` / `partial` | Éxito completo o parcial (se conservan los productos leídos y se advierte por qué se cortó). |

### Diagnóstico de conexión (`diag`)

Cada lectura devuelve: tienda, plataforma, país, moneda, método, productos encontrados, productos con precio válido, categorías, etapa (`connect`, `platform`, `catalog`, `validate`, `categories`, `partial`, `done`, `failed`), advertencias y la lista de intentos por nivel con resultado, detalle y tiempo. Se guarda sin datos sensibles (`jobs.publicDiag`) y se muestra en el componente **Diagnóstico de conexión** (`web/js/onboard.js`).

El "porcentaje" que se muestra es el de productos con precio válido sobre productos encontrados, que tiene un denominador confiable. No se muestra un porcentaje de cobertura del catálogo total porque las tiendas no publican ese total de forma confiable.

## 3. Competidores (`server/jobs.js`)

1. **Descubrimiento:** dos búsquedas web en paralelo (Perplexity Sonar en el gateway), con país, moneda, categorías y precio mediano de la tienda, más el **registro de tiendas verificadas** (`stores_registry`) del mismo país y tipo de producto.
2. **Verificación:** antes de mostrarlo, cada dominio se resuelve por DNS y se pide su página de inicio. Los no verificados aparecen marcados y desmarcados.
3. **Confirmación:** el usuario marca, quita o agrega. Hasta 16.
4. **Lectura:** todos los confirmados, 4 en paralelo, 60 s máximo por tienda. Cada uno se marca antes de leerlo (si el proceso se corta, no se repite en bucle). Solo se leen productos relacionados con el vocabulario del catálogo propio.
5. **Evaluación en tres preguntas** (`evaluateCompetitor`):
   - **A. ¿Es relevante?** Vocabulario de producto compartido, posicionamiento por precio y mercado.
   - **B. ¿Se pudo leer?** Método, productos, moneda y fecha (`read`).
   - **C. ¿Es comparable?** `alta` (20 o más productos relacionados), `media` (10 a 19), `baja` (1 a 9), `sin_productos`, `no_comparable` (otra moneda o escala) u `otro_mercado`.
6. **Tipo:**
   - `directo`: mismo vocabulario y precio entre 0,6 y 1,6 veces.
   - `aspiracional`: más de 1,6 veces.
   - `económico`: menos de 0,6 veces.
   - `indirecto`: comparte poco vocabulario.
   - `referente`: otro país, o catálogo grande con muchas categorías.
7. **Puntaje de evidencia** (0 a 1): suma de evidencias verificadas, cada una escrita (dominio verificado 0,10 · catálogo leído 0,15 · vocabulario compartido hasta 0,35 · misma moneda 0,15 · mismo país 0,10 · productos relacionados hasta 0,15). No es una probabilidad: es un resumen auditable.
8. **Nada se elimina en silencio:**
   - Los que no se pueden leer quedan como **referencia pendiente**, con su motivo.
   - Los de otra moneda o país quedan como **referencia**, fuera de la comparación de precios.
   - Se reintentan solo las lecturas fallidas con `POST /api/quick/:org/retry`, también después de terminar el análisis.
   - Se rechaza por precio solo cuando la escala difiere más de 15 veces sin moneda confirmada: es casi seguro otra moneda o unidad.

## 4. Homologación de productos (`web/js/engine.js`)

`TP.similarity` combina:
- tipo y material clasificados;
- niveles de atributos, contando solo los atributos con evidencia en ambos productos;
- **tamaño o presentación** leído del nombre: medidas (140×190), tallas de cama, volumen y peso. Si no coinciden por más de 15 %, la similitud queda por debajo del umbral de comparación;
- palabras del nombre en común.

Devuelve `why`, la lista de evidencias que se muestra junto a cada comparable. Sin el modelo hedónico, el Pricing Advisor recomienda un cambio solo con 3 o más comparables cercanos y precio fuera de su rango P25–P75; si no, se abstiene.

## 5. Seguridad

- **SSRF:** `net.js`, con lookup validado al conectar (evita cambios de DNS entre validación y conexión), puertos 80/443, sin usuario/contraseña en la URL, redirecciones validadas, tamaño máximo de respuesta. `ALLOW_PRIVATE_NETWORK=1` solo para pruebas locales.
- **CSRF:** cookies `SameSite=Lax`, cuerpo JSON obligatorio en POST/PUT y verificación de `Origin` en peticiones que cambian datos.
- **Autorización:** por rol en el servidor (sin cambios). Aislamiento por cuenta en cada ruta `/api/orgs/:org`. Los invitados solo ven su análisis rápido.
- **Límites:**
  - Análisis rápidos por IP y por día; tope diario global.
  - Tokens de IA por cuenta y día (`QUICK_AI_TOKENS_DAY`, `ORG_AI_TOKENS_DAY`).
  - Intentos de conexión autenticada (6 por hora).
  - Inicio de sesión (10 cada 15 minutos).
- **Credenciales de conectores:** se usan una vez, no se guardan, no se registran (los logs ocultan claves que parezcan secretos) y no vuelven al navegador.
- **Trabajos:** concesión con vencimiento (`lease_until`) y `for update skip locked`. Un trabajo cortado lo retoma otro proceso. Las lecturas se marcan antes de empezar (idempotencia).
- **Logs estructurados** (`server/log.js`) en una línea JSON. Los errores internos devuelven al usuario un número de referencia, no el detalle técnico.
