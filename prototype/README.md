# TITA Pricing Intelligence 360° — prototipo navegable

Prototipo interactivo (React 18 + htm, sin build) de la plataforma SaaS de inteligencia de precios de Tita Media.

- `index.html`: estilos y carga de librerías (cdnjs / unpkg).
- `js/data.js`: datos de demostración determinísticos, modelo hedónico log-lineal (OLS, validación cruzada en 5 particiones, banda P10–P90, atípicos, abstención), similitud de productos, homologación de categorías, white spaces y simulaciones de Pulse.
- `js/ui.js`: componentes y visualizaciones SVG.
- `js/core.js`: motor de estado, onboarding, Overview y Market Intelligence.
- `js/modules.js`: Price Advisor, Product Launch, Promotion Optimizer, Pulse WTP, Revenue Learning y Configuración.
- `js/main.js`: copiloto (reglas, sin LLM), navegación y arranque.

Todos los catálogos, marcas, costos, ventas y respuestas de encuestas son ficticios. La pestaña Configuración › Transparencia del prototipo lista qué funciona, qué se simula y qué falta para producción.

Para verlo localmente: `python3 -m http.server` dentro de `prototype/` y abrir http://localhost:8000.
