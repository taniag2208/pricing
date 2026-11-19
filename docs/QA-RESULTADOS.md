# Resultados de la batería de QA

Generado por `node test/battery.js` el 2026-11-19 13:39 UTC, con servidores de prueba controlados (no tiendas reales).

| Id | Caso | Esperado | Obtenido | Método | Productos válidos | Motivo o limitación | Tiempo | Llamadas a IA | Estado |
|---|---|---|---|---|---|---|---|---|---|
| L01 | Tienda Shopify | lectura completa por API de Shopify, 32 productos | lectura ok · api_shopify | api_shopify | 32 | No pudimos confirmar la moneda de los precios | 0.0 s | 0 | Aprobado |
| L02 | Tienda VTEX | API de VTEX, moneda COP detectada en la página | lectura ok · api_vtex · COP | api_vtex | 41 | — | 0.0 s | 0 | Aprobado |
| L03 | Tienda WooCommerce | API de WooCommerce con moneda de la API | lectura ok · api_woocommerce · COP | api_woocommerce | 41 | — | 0.0 s | 0 | Aprobado |
| L04 | Ecommerce con contenido dinámico (JavaScript) | nivel 3: navegador sin interfaz, productos desde JSON-LD inyectado | lectura ok · headless | headless | 8 | No pudimos confirmar la moneda de los precios | 4.9 s | 0 | Aprobado |
| L05 | Catálogo parcial (la página 2 responde 500) | lectura parcial: se conservan los 25 productos de la página 1 y se advierte | lectura partial · api_shopify | api_shopify | 25 | La lectura se cortó antes de terminar; se conservan los productos leídos · No pudimos confirmar la moneda de los precios | 0.0 s | 0 | Aprobado |
| L06 | Acceso restringido (WAF 403) | restricted / waf, sin intentar evadir | error restricted (waf) | api_shopify:blocked, api_vtex:blocked, api_woocommerce:blocked, sitemap:fail, ai_text:skip, headless:fail | 0 | La tienda bloquea las lecturas automáticas | 0.6 s | 0 | Aprobado |
| L07 | URL inválida | invalid_url | error invalid_url | — | 0 | La dirección no es válida | 0.0 s | 0 | Aprobado |
| L08 | Sitio con redirecciones (301 a otro dominio) | sigue la redirección y lee el destino | lectura ok · api_shopify | api_shopify | 32 | La dirección redirige a 127.0.0.1:4501 · No pudimos confirmar la moneda de los precios | 0.0 s | 0 | Aprobado |
| L12 | Productos sin precios | no_prices (productos encontrados sin precio visible) | error no_prices | api_shopify:fail, api_vtex:fail, api_woocommerce:fail, sitemap:empty, ai_text:skip, headless:fail | 0 | Encontramos productos pero sin precios visibles | 0.7 s | 0 | Aprobado |
| L13 | Conexión autenticada de la tienda propia (WooCommerce REST) | lee el catálogo con credenciales válidas; con credenciales inválidas responde auth_failed; no guarda credenciales | 31 productos · auth_woocommerce · credenciales inválidas: auth_failed | auth_woocommerce | 31 | credenciales de un solo uso | 0.0 s | 0 | Aprobado |
| L14 | Respuesta de API muy pesada (VTEX, 11.7 MB por página, HTTP 206) | se lee completa por la API de VTEX | lectura ok · api_vtex | api_vtex | 50 | No pudimos confirmar la moneda de los precios | 0.1 s | 0 | Aprobado |
| L07b | Protección SSRF (destinos internos y metadatos de nube) | todas bloqueadas como invalid_url | invalid_url,invalid_url,invalid_url,invalid_url,invalid_url,invalid_url | — | 0 | net.safeFetch + validación de DNS y de cada redirección | 0.1 s | 0 | Aprobado |
| C09 | Competidor con menos de 10 productos | se incluye con comparabilidad baja (no se rechaza) | tipo directo · comparabilidad baja · en análisis: sí · evidencia 0.9 | api_shopify | 6 | Pocos productos comparables: sus resultados son orientativos. | 0.0 s | 0 | Aprobado |
| C10 | Competidor premium (precios ~2,5 veces) | aspiracional, incluido | tipo aspiracional · comparabilidad alta · en análisis: sí · evidencia 0.93 | api_shopify | 30 | precio mediano 165 % más alto que el tuyo | 0.0 s | 0 | Aprobado |
| C11 | Competidor de otro país | referente, se conserva fuera de la comparación de precios | tipo referente · comparabilidad otro_mercado · en análisis: no · evidencia 0.9 | api_shopify | 32 | Se conserva como referencia: otro país. | 0.0 s | 0 | Aprobado |
| C13 | Monedas diferentes (USD frente a COP) | no comparable sin tasa de cambio, se conserva como referencia | tipo directo · comparabilidad no_comparable · en análisis: no · evidencia 0.78 | api_woocommerce | 30 | Se conserva como referencia: otra moneda. | 0.0 s | 0 | Aprobado |
| J14 | Trabajo interrumpido | otro proceso retoma el trabajo vencido; la lectura cortada queda como pendiente y el análisis termina | estado done · 127.0.0.1: failed, 127.0.0.1: ok, 127.0.0.1: failed | lease vencido + claim | 1 | la lectura se interrumpió por tiempo | 2.5 s | 6 | Aprobado |
| J15 | Reintento de lectura (solo las fallidas) | se reintentan solo las fallidas; las que ahora responden entran al análisis | reintentadas 2 · 127.0.0.1: ok, 127.0.0.1: ok, 127.0.0.1: ok · estado done | /retry | 3 | — | 0.7 s | 3 | Aprobado |
| J16 | Error de API de IA (sobrecarga en todas las llamadas) | el catálogo se lee igual (no usa IA); la búsqueda web informa el error y el análisis espera al usuario con lo que hay (registro de tiendas verificadas o competidores a mano), sin caerse | estado waiting · fase confirm_comps · La búsqueda web no respondió; puedes agregar competidores a mano. | api_woocommerce | 41 | La búsqueda web no respondió; puedes agregar competidores a mano. | 2.0 s | 6 | Aprobado |

**19 de 19 casos aprobados.**

## Otras suites

- `test/math.js`: el modelo hedónico, el conjoint L18, Van Westendorp, diferencias en diferencias y la homologación por tamaño recuperan parámetros conocidos.
- `test/crawl.js`: API de Shopify, sitemap + JSON-LD con robots.txt que bloquea la API, filtro por palabras, redirección, selector de país y dominio inexistente.
- `test/e2e.js`: consola Tita, cuentas, roles, permisos (403 cruzados entre cuentas), publicación, aprobaciones y copiloto.
- `test/quick.js`: análisis rápido completo en navegador: confirmación con verificación de dominios, referencias pendientes con motivo, competidores escritos a mano, catálogo por archivo, selector de país, registro de tiendas y límite por IP.
- `test/ux.js`: 5 pantallas × 3 tamaños (390, 820 y 1440 px): sin desbordamiento horizontal, sin controles sin nombre, sin imágenes sin alt y sin texto con contraste menor a WCAG AA.

## Pendiente: validación con tiendas reales

Estos casos se probaron con servidores controlados. La lectura de tiendas reales nuevas (contenido dinámico real, WAF reales, conectores autenticados con credenciales reales) requiere ejecutar la medición de cobertura (`server/bench.js`) en un despliegue con acceso a internet. No se declara aprobado lo que no se probó.
