# Lector EPUB personal

## Contexto

App web personal para leer EPUB en un iPhone y en una tablet de tinta electrónica (Onyx Boox Note Air 4C, Android), con biblioteca y avance de lectura sincronizados mediante una carpeta de Google Drive. Usuario único, sin backend.

El diseño funcional completo está en `docs/diseno-funcional-lector-epub.md`. Léelo entero antes de escribir código. Si algo del diseño no es viable técnicamente, avísame y propón una alternativa antes de cambiarlo.

## Cómo trabajamos

1. Construcción por fases, según el punto 13 del diseño. No empieces una fase hasta que yo confirme que la anterior funciona en los dos dispositivos.
2. Al cerrar cada fase, entrega un resumen corto: qué se ha hecho, cómo probarlo en el iPhone y en la tablet, y qué queda pendiente.
3. Commits pequeños, con mensajes en español.
4. Pregunta antes de añadir cualquier dependencia nueva.
5. Si una decisión no está en el diseño, pregunta antes de asumir.

## Decisiones técnicas

| Tema | Decisión |
|---|---|
| Lenguaje | JavaScript con módulos ES, sin framework y sin paso de compilación. Se publica tal cual en GitHub Pages |
| Lectura de EPUB | epub.js y JSZip, copiadas en `vendor/` con versión fijada, para que funcionen sin conexión |
| Almacenamiento local | IndexedDB |
| Login de Google | Google Identity Services, modelo de token en navegador |
| Acceso a Drive | API REST de Drive v3 con `fetch`, sin la librería gapi |
| Permiso de Drive | Solo `https://www.googleapis.com/auth/drive.file` |
| Fuentes | Incluidas en `fonts/` |
| App instalable | `manifest.webmanifest` y service worker que guarda en caché la aplicación |

## Estructura del repositorio

```
/
├── index.html
├── manifest.webmanifest
├── sw.js
├── config.js            ID de cliente OAuth
├── src/
│   ├── app.js
│   ├── datos/           IndexedDB
│   ├── biblioteca/
│   ├── lector/
│   ├── sync/            Drive y fusión de JSON
│   └── ui/              temas, perfiles y componentes
├── vendor/
├── fonts/
└── docs/
    └── diseno-funcional-lector-epub.md
```

## Configuración

El ID de cliente OAuth va en `config.js`. En una app que solo funciona en el navegador ese ID es público, así que puede estar en el repositorio. No hay clave secreta ni ningún otro secreto.

## Reglas fijas

1. Las posiciones de lectura se guardan siempre como CFI, nunca como número de página.
2. Los JSON de Drive se fusionan entrada a entrada. Nunca se sobrescribe un archivo remoto sin leerlo y fusionarlo antes.
3. Cada dispositivo solo escribe su propio archivo de sesiones.
4. Los JSON de Drive llevan siempre el campo `version`.
5. Perfil Tinta electrónica: sin animaciones, sin transiciones, sin grises ni degradados.
6. Interfaz en español.
7. Ningún servicio externo salvo Google Drive y el login de Google.

## Primer encargo: fase 0

Objetivo: validar los riesgos del punto 12 del diseño antes de construir la app.

Entregable: una página mínima publicada en GitHub Pages con estas funciones:

1. Botón "Conectar con Google" con el permiso `drive.file`.
2. Crear o localizar la carpeta "Lector EPUB", marcada con `appProperties: { "app": "lector-epub" }`.
3. Escribir y leer en esa carpeta un `prueba.json` con la fecha y el nombre del dispositivo, para comprobar que el otro dispositivo lo ve.
4. Importar un EPUB desde el selector de archivos y mostrarlo paginado con epub.js, pasando página con toques en los laterales. Con animación en el perfil Móvil y sin ella en el perfil Tinta electrónica.
5. Pantalla de diagnóstico con: navegador, si la app está instalada en la pantalla de inicio (`display-mode: standalone`), estado de la sesión de Google, caducidad del token y resultado de `navigator.storage.persist()`.

Pruebas que haré:

| Prueba | Dispositivo |
|---|---|
| Login, escritura y lectura de `prueba.json` con la app instalada en la pantalla de inicio | iPhone |
| Login, escritura y lectura de `prueba.json` | Tablet |
| El `prueba.json` escrito en un dispositivo se lee en el otro | Ambos |
| Renovación de la sesión tras más de una hora | Ambos |
| Paso de página fluido | iPhone |
| Paso de página sin animación ni retardo visible | Tablet |

Cuando la fase 0 esté lista, para y espera mi validación antes de empezar la fase 1.
