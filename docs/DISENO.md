# Sistema visual de TITA Pricing Intelligence 360°

Fuente: hoja de estilos y HTML públicos de https://titamedia.com/ (inspeccionados el 19/11/2026). Los tokens están en `app/web/index.html` (`:root`).

## 1. Qué viene de la marca

| Elemento | Valor en titamedia.com | Uso en el producto |
|---|---|---|
| Acento | `--tm-accent: #80E593` (menta) | Botón principal, foco de navegación, indicadores activos, selección de texto |
| Acento 2 | `--tm-accent2: #52C7CF` (turquesa) | Etapa en curso, números de pasos, serie secundaria en modo oscuro |
| Tinta | `--tm-ink: #141414`, `--tm-ink-deep: #0B0C0C`, `--tm-panel: #1A1A1A` | Navegación lateral, hero del onboarding, barra de consola, modo oscuro |
| Superficies | `#FFFFFF`, `--tm-surface-quiet: #F2F4F3` | Paneles y fondo de la aplicación |
| Verde legible | `--tm-accent-ink: #2E8C52` | Serie "tu marca" en gráficos |
| Turquesa legible | `--tm-teal-ink: #17747C` | Información, serie de líneas |
| Textos | `--tm-text-2: #4A524E`, `--tm-text-3: #5F6662` | Texto secundario y terciario |
| Línea | `rgba(20,20,20,.14)` | Bordes de 1 px y retículas |
| Menta pálida | `#BFF2C9` | Disponible para destacados |
| Tipografías | Be Vietnam Pro (200–600), IBM Plex Mono (400/500) | Texto y títulos; etiquetas en mayúsculas espaciadas, cifras de tablas |
| Títulos | peso 300, interletrado −0,028 a −0,032 em | Títulos de página y del onboarding |
| Etiquetas | Plex Mono 11 px, interletrado 0,18 em, mayúsculas | Encabezados de sección y de tablas |
| Formas | Esquinas rectas, líneas de 1 px, retículas con separación de 1 px | Paneles, botones, tablas, pasos, diagnóstico |
| Botones | Primario menta con texto tinta; secundario transparente con borde tinta; oscuro tinta con texto blanco | Igual en el producto |
| Recurso gráfico | Puntos y conexiones (red de nodos) | Patrón de puntos en el hero del onboarding |
| Monograma | `images/favicon.svg` ("T" blanca sobre tinta) | Logo de la aplicación y favicon (`web/brand/tita-mark.svg`) |

## 2. Decisiones de producto (no vienen de la marca)

- **Verde para texto pequeño `#267343`:** el `#2E8C52` de la marca da 4,21:1 sobre blanco y 3,81:1 sobre `#F2F4F3`, por debajo de WCAG AA para texto pequeño. Se usa el mismo tono oscurecido (5,26:1) para enlaces, etiquetas y badges; el original queda para gráficos y áreas grandes.
- **Colores funcionales:** ámbar `#8A5B00` (advertencia) y rojo `#B3261E` (error). La marca no los define.
- **Serie "mercado" en gris neutro `#6E7672`:** contrasta con el verde de "tu marca" sin competir con él.
- **Zonas de franjas** en grises casi blancos (`#F7F8F7`, `#EFF1F0`, `#E6E9E7`).
- **Radio de 2 px** solo en badges, chips y campos de texto, para legibilidad en tamaños pequeños. Paneles y botones van rectos, como la marca.
- **Sin animaciones decorativas:** solo el pulso de la etapa en curso del diagnóstico, que se desactiva con `prefers-reduced-motion`.

## 3. Componentes

- **Onboarding:** hero oscuro con el link, pasos numerados 01–05 y tres compromisos.
- **Stepper** de 5 pasos: Conoce tu negocio · Exploramos tu catálogo · Encontramos tu mercado · Configura tu estrategia · Descubre tus oportunidades.
- **Diagnóstico de conexión:**
  - etapas reales del lector;
  - retícula de datos (plataforma, país y moneda, método, productos, con precio válido, categorías);
  - advertencias;
  - intentos por nivel;
  - acciones de corrección.
- **Confirmación de mercado:** candidatos con estado de verificación de dominio, origen (búsqueda web o catálogo verificado antes) y posicionamiento.
- **Tablero de competidores:** estado de lectura, tipo, comparabilidad, barra de evidencia, motivos y reintento de lecturas fallidas.
- **Ficha de decisión del Pricing Advisor:**
  - precio actual y precio propuesto;
  - evidencia y confianza;
  - impacto, separando cálculo, estimación estadística y lo no estimado;
  - datos que faltan.
- **Cobertura de datos en el Overview:** cuántos productos, competidores, comparables y categorías con modelo respaldan el análisis.

## 4. Accesibilidad y responsive

`app/test/ux.js` recorre landing, confirmación, estrategia, Overview y Pricing Advisor en 390, 820 y 1440 px. En cada una revisa desbordamiento horizontal, controles sin nombre accesible, imágenes sin texto alternativo y contraste de texto (WCAG AA). Resultado actual: 15 de 15 combinaciones sin problemas.
