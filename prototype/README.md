# TITA Pricing Intelligence 360° — app funcional (claude.ai)

Aplicación de inteligencia de precios que corre como artifact de claude.ai, con base de datos compartida del espacio de trabajo, identidad de usuarios y Claude como motor de IA.

## Flujo
1. **Configuración inicial**: tienda propia, mercado y prioridad.
2. **Catálogos**: tu tienda y competidores desde su catálogo público (Shopify `/products.json`, WooCommerce Store API, VTEX catalog search), CSV, Excel o texto de una página (Claude extrae los productos).
3. **Categorías y rúbricas**: Claude propone categorías comparables y atributos de 5 niveles; el equipo edita y aprueba.
4. **Clasificación**: Claude mapea etiquetas por uso y califica cada producto (tipo, material, color, niveles con evidencia), por lotes; revisión humana de los dudosos.
5. **Análisis**: homologación, precio vs. atributos, escalera, rangos, pirámide, territorios, white spaces, composición, cápsulas, modelo hedónico con validación cruzada y abstención, Price Advisor con aprobaciones por usuario y archivo de carga.
6. **Datos privados**: costos, rotación y ventas semanales (CSV/Excel) para margen, promociones y Revenue Learning (diferencias en diferencias).
7. **Pulse WTP**: cuestionarios Van Westendorp, Gabor-Granger y conjoint por calificación; las respuestas se importan.
8. **Copiloto**: Claude con herramientas sobre los datos del espacio (respaldo por reglas).

## Archivos
- `js/engine.js` — analítica (homologación, OLS/ridge, validación cruzada, similitud, diagnóstico, white spaces, VW/GG/conjoint, DiD).
- `js/ingest.js` — parsers de plataformas/CSV/Excel, prompts de Claude, construcción del dataset.
- `js/live.js` — base de datos del artifact, permisos, nombres, descargas.
- `js/ui.js` — componentes y gráficos SVG.
- `js/core.js` — motor de estado, Overview, Market Intelligence.
- `js/setup.js` — asistente inicial y módulo Catálogo y clasificación.
- `js/modules.js` — Price Advisor, Product Launch, Promotion Optimizer, Pulse, Revenue Learning, Configuración.
- `js/main.js` — copiloto, navegación y arranque.

Capacidades del artifact: `db` (costos y ventas solo para Colaboradores o más), `user`, `sample` (con imágenes), `downloads`.

## Límites de esta versión
La página no puede descargar sitios de terceros ni sus imágenes: los catálogos se pegan o suben. La clasificación se lanza por lotes con un clic y usa la cuota de Claude de quien la lanza. La siguiente fase (plataforma SaaS independiente) agrega rastreo programado, fotos, conectores ERP con escritura y multi-cliente.
