# Tita Pricing Intelligence 360°

- `demo/` — demo comercial navegable con datos ficticios. Página estática, lista para Vercel.
- `app/` — la plataforma con servidor, base de datos, consola de Tita y vista del cliente. Ver `app/README.md`.

## Publicar la demo en Vercel
1. En Vercel: **Add New… > Project** e importa el repositorio `taniag2208/pricing`.
2. **Root Directory:** `demo` · **Framework Preset:** Other · sin comando de build ni de instalación.
3. **Deploy.** `demo/vercel.json` agrega cabeceras de seguridad y `noindex` para que la demo no aparezca en buscadores.

Vercel publica en producción desde la rama principal; otras ramas generan URLs de vista previa.
