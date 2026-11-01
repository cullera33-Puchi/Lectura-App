# Lector EPUB

Lector EPUB personal para iPhone y tablet de tinta electrónica, con biblioteca y avance sincronizados en una carpeta de Google Drive. Sin backend.

- Diseño funcional: `docs/diseno-funcional-lector-epub.md`
- Instrucciones de trabajo: `CLAUDE.md`

## Estado

- Fase 0 (prototipo de riesgos): validada en el iPhone y en la tablet. Queda pendiente la prueba de renovación de la sesión tras más de una hora.
- Fase 1 (biblioteca y lector local): importar EPUB, biblioteca, lector con gestos, índice, panel "Aa" y temas por perfil. Funciona sin conexión.
- Fase 2 (sincronización): subida de libros y portadas a Drive, fusión de `biblioteca.json` y `progreso.json`, aviso de posición al abrir, estados de libro, quitar del dispositivo y descargar todos.
- Fase 3 (rediseño): interfaz al estilo de Libros de Apple en el iPhone, más sencilla en la tablet, y revisión general del código.
- v2 (organización y estadísticas): colecciones, series, pestaña Estadísticas, objetivo anual y sesiones sincronizadas por dispositivo (`sesiones-<id>.json`).
- v3 (ajustes rápidos): sincronización automática opcional, tiempo restante del capítulo y del libro, búsqueda en la biblioteca y edición de datos y portada.
- Mejoras 0.6: dos páginas con la tablet en horizontal, ficha del libro y resumen del año.
- Copia de seguridad: copia diaria en la subcarpeta `copias` de Drive (30 diarias y 12 mensuales), descarga manual y restauración por fusión desde Ajustes. Incluye avances, estadísticas, colecciones, objetivos y marcadores, no los EPUB.
- v4, parte hecha: búsqueda dentro del libro y marcadores (`anotaciones.json`). Quedan subrayados y notas, exportar a Markdown y diccionario.
- Mejoras 0.7: barra para recorrer el libro, volver a donde estabas, ajustes de lectura por libro, valoración y nota, lista Quiero leer, aviso de duplicados, meta diaria de minutos y fin previsto.
- Repaso 0.8: corrección de errores (0.8.0), rendimiento (0.8.1) y usabilidad (0.8.2). Lo pendiente está en el punto 16 del diseño.

## Pruebas

Las pruebas automáticas están en `pruebas/`. Ver `pruebas/README.md`. Solo se usan en desarrollo.

## Configuración

1. Google Cloud: proyecto con la API de Google Drive activada y pantalla de consentimiento con el permiso `drive.file`. En modo Prueba, con la cuenta del usuario como usuario de prueba.
2. ID de cliente OAuth de tipo "Aplicación web":
   - Orígenes de JavaScript autorizados: la dirección donde se publica la app (por ejemplo `https://lector-epub.pages.dev` en Cloudflare Pages) y `http://localhost:8080`. Al cambiar de dirección se añade la nueva en el mismo ID de cliente: con otro ID, la app no vería los archivos que ya creó en Drive (permiso `drive.file`).
3. Copiar el ID de cliente en `config.js`.

## Publicación

La app no tiene paso de compilación: se publica la raíz del repositorio tal cual. En Cloudflare Pages, conectado al repositorio de GitHub: rama `main`, sin comando de compilación y con `/` como carpeta de salida. Cloudflare Web Analytics debe quedar desactivado: añade un script de un servicio externo.

Al cambiar de dirección, cada dispositivo empieza sin datos locales y los recupera de Drive. En la bienvenida, si Drive ya tiene estadísticas de otros dispositivos, la app ofrece seguir como uno de ellos para no duplicarlo en las estadísticas.

## Desarrollo local

```
python3 -m http.server 8080
```

Abrir `http://localhost:8080/`. No hay paso de compilación.
