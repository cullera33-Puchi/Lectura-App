# Lector EPUB personal. Diseño funcional v1

## 1. Objetivo

Aplicación web personal para leer libros EPUB en dos dispositivos:

| Dispositivo | Navegador | Perfil en la app |
|---|---|---|
| iPhone | Safari, añadida a la pantalla de inicio | Móvil |
| Onyx Boox Note Air 4C (tinta electrónica en color, Android) | Navegador Android | Tinta electrónica |

Los libros se importan una vez desde cualquiera de los dos dispositivos y aparecen en ambos. El avance de lectura se sincroniza con un botón manual a través de una carpeta de Google Drive. No es necesaria la sincronización en tiempo real.

Usuario único. No hay backend propio.

## 2. Alcance

| Dentro de la v1 | Fuera de la v1 |
|---|---|
| Importar EPUB desde el selector de archivos del dispositivo | Subrayados, notas y marcadores |
| Biblioteca común en los dos dispositivos | Diccionario y traducción |
| Lector paginado con índice | PDF y otros formatos |
| Ajustes de tema, fuente, tamaño, interlineado, márgenes y justificación | Estadísticas de lectura |
| Gestos al estilo de la app Libros de Apple en el iPhone | Libros con DRM (Adobe, Kindle, Apple Books) |
| Sincronización manual de libros y avance vía Google Drive | Sincronización automática o en tiempo real |
| Funcionamiento sin conexión para libros descargados | Importar desde Google Drive con selector |

Las mejoras posteriores están en el roadmap del punto 16.

## 3. Arquitectura

| Elemento | Decisión |
|---|---|
| Tipo de app | Web estática instalable (PWA): manifest y service worker |
| Hosting | GitHub Pages |
| Almacén común | Carpeta de Google Drive del usuario |
| Acceso a Drive | Google Identity Services (modelo de token en navegador) y API de Drive v3 |
| Permiso de Drive | Solo `https://www.googleapis.com/auth/drive.file` |
| Almacenamiento local | IndexedDB (libros descargados, metadatos, progreso, cola de pendientes, ajustes) |
| Motor de lectura | epub.js, en modo paginado. Las posiciones se guardan como CFI |
| Persistencia local | Pedir `navigator.storage.persist()` para reducir el riesgo de que el navegador borre la biblioteca |

Notas para la implementación:

1. Con `drive.file`, la app solo ve los archivos que ella misma ha creado. Como los dos dispositivos usan el mismo ID de cliente OAuth y la misma cuenta de Google, ambos ven la misma carpeta.
2. El usuario nunca entra en la carpeta de Drive. Los libros siempre se importan desde la app.
3. Las fuentes se incluyen en el repositorio para que funcionen sin conexión y se vean igual en iOS y Android.

## 4. Estructura en Google Drive

```
Lector EPUB/
├── libros/          <id>.epub
├── portadas/        <id>.jpg      (miniatura, unos 300 px de alto)
├── biblioteca.json  catálogo de libros
└── progreso.json    posición de lectura por libro
```

La carpeta raíz se marca con `appProperties: { "app": "lector-epub" }` para localizarla sin depender del nombre.

`<id>` es la huella SHA-256 del archivo EPUB. Sirve para reconocer el mismo libro en los dos dispositivos y evitar duplicados.

## 5. Modelo de datos

### biblioteca.json

```json
{
  "version": 1,
  "libros": [
    {
      "id": "sha256...",
      "titulo": "Título",
      "autor": "Autor",
      "idioma": "es",
      "identificadorEpub": "urn:isbn:...",
      "archivoDriveId": "...",
      "portadaDriveId": "...",
      "tamanoBytes": 1834221,
      "fechaAlta": "2026-10-27T21:10:00Z",
      "eliminado": false,
      "fechaModificacion": "2026-10-27T21:10:00Z"
    }
  ]
}
```

Un libro eliminado se mantiene con `eliminado: true` para que la baja llegue al otro dispositivo.

### progreso.json

```json
{
  "version": 1,
  "progreso": {
    "sha256...": {
      "cfi": "epubcfi(/6/14!/4/2/10:0)",
      "porcentaje": 0.62,
      "capitulo": "Capítulo 14",
      "estado": "leyendo",
      "dispositivo": "iPhone",
      "fecha": "2026-10-27T22:45:00Z"
    }
  }
}
```

`estado` admite `pendiente`, `leyendo` o `terminado`.

### Datos locales (IndexedDB)

| Almacén | Contenido |
|---|---|
| libros | Metadatos, portada y, si está descargado, el archivo EPUB |
| progreso | Última posición local por libro, con fecha |
| pendientes | Libros importados aún no subidos y cambios de progreso no sincronizados |
| ajustes | Perfil, nombre del dispositivo, tema, fuente, tamaño, interlineado, márgenes y justificación |
| sincronizacion | Fecha de la última sincronización y última copia de los JSON remotos |
| sesiones | Registro de cada sesión de lectura: libro, inicio, fin y páginas leídas. Se guarda desde la v1 para alimentar las estadísticas de la v2 (ver punto 16) |

Una sesión empieza al abrir un libro y termina al cerrarlo o tras 5 minutos sin pasar página.

## 6. Primer uso

1. Pantalla de bienvenida con dos pasos.
2. Elegir perfil: "Móvil" o "Tinta electrónica". Se puede cambiar después en Ajustes.
3. Nombre del dispositivo, con valor propuesto según el perfil ("iPhone" o "Note Air 4C"). Es el nombre que aparece en los avisos de sincronización.
4. Botón "Conectar con Google". Tras autorizar, la app busca la carpeta y, si no existe, la crea.
5. Primera sincronización automática para traer la biblioteca existente.

## 7. Biblioteca

### Importar

1. Botón "Añadir libro" que abre el selector de archivos del dispositivo (`<input type="file" accept=".epub,application/epub+zip" multiple>`).
2. En el iPhone el selector muestra la app Archivos (Descargas, iCloud Drive y demás ubicaciones). En la tablet, el selector de Android.
3. Por cada archivo: calcular la huella, leer título, autor, idioma, identificador y portada.
4. Si la huella ya existe en la biblioteca, avisar y no duplicar.
5. Si el EPUB tiene DRM o está dañado, mensaje claro: "Este libro no se puede abrir. Puede tener protección DRM."
6. El libro queda en estado "Pendiente de subir". Se sube a Drive al pulsar Sincronizar.

### Vista

| Elemento | Detalle |
|---|---|
| Diseño | Rejilla de portadas en el perfil Móvil. Lista con portada pequeña en el perfil Tinta electrónica |
| Información por libro | Título, autor, porcentaje leído, último dispositivo y fecha |
| Orden | Último leído (por defecto), título o autor |
| Filtro | Todos, pendiente, leyendo o terminado |
| Botón Sincronizar | Siempre visible en la cabecera, con indicador de cambios pendientes |

### Estados de un libro

| Estado | Indicador | Comportamiento |
|---|---|---|
| Descargado | Portada normal | Se abre y se lee sin conexión |
| Solo en la nube | Icono de nube | Se descarga al abrirlo |
| Pendiente de subir | Icono de envío | Se sube en la próxima sincronización |
| Descargando | Barra de progreso | No se puede abrir hasta terminar |

En el perfil Tinta electrónica hay una opción "Descargar todos".

### Acciones sobre un libro

| Acción | Efecto |
|---|---|
| Abrir | Abre el lector en la última posición |
| Marcar como terminado | Cambia el estado y se sincroniza |
| Quitar de este dispositivo | Borra la copia local. Sigue en Drive y en el otro dispositivo |
| Eliminar de la biblioteca | Marca el libro como eliminado y borra el archivo y la portada de Drive. Desaparece en el otro dispositivo al sincronizar. Pide confirmación |

## 8. Lector

### Comportamiento general

1. Lectura paginada, sin scroll, a una sola columna.
2. Se abre en la última posición local.
3. Al abrir, si la última posición sincronizada de otro dispositivo es más reciente y distinta, aviso: "Leíste hasta el capítulo 14 (62 %) en el iPhone el 27 de octubre. ¿Continuar allí?". Opciones: "Ir allí" o "Quedarme aquí".
4. La posición se guarda en local en cada cambio de página.
5. Al cerrar el libro se actualiza el progreso local y se marca como pendiente de sincronizar.

### Gestos en el perfil Móvil (al estilo de Libros de Apple)

| Gesto | Acción |
|---|---|
| Tocar el lado derecho | Página siguiente |
| Tocar el lado izquierdo | Página anterior |
| Deslizar a izquierda o derecha | Pasar página con animación de deslizamiento |
| Tocar el centro | Mostrar u ocultar los controles |
| Deslizar hacia abajo | Cerrar el libro y volver a la biblioteca |
| Pulsación larga | Sin acción en la v1 (reservada para subrayados) |

Zonas táctiles orientativas: tercio izquierdo, tercio central y tercio derecho de la pantalla.

Nota técnica: epub.js pinta el libro dentro de un iframe, así que los eventos táctiles hay que capturarlos dentro del iframe con los hooks de la rendition.

### Gestos en el perfil Tinta electrónica

Mismos toques y deslizamientos, sin ninguna animación: la página cambia de golpe. Áreas táctiles grandes. Sin transiciones en menús y paneles.

### Controles (al tocar el centro)

| Zona | Contenido |
|---|---|
| Barra superior | Cerrar, título del libro, índice y botón Sincronizar |
| Barra inferior | Capítulo actual, porcentaje del libro, páginas restantes del capítulo y botón "Aa" |

### Índice

Lista de capítulos del EPUB. El capítulo actual aparece marcado. Al tocar uno, salta a él.

### Panel "Aa"

Panel inferior, como en Libros de Apple:

| Ajuste | Opciones |
|---|---|
| Tema | Según el perfil (ver punto 9) |
| Tamaño de letra | Botones A pequeña y A grande, por pasos |
| Fuente | Original del libro, Literata, Open Sans y una tercera serif |
| Interlineado | Compacto, normal o amplio |
| Márgenes | Estrechos, normales o anchos |
| Justificación | Justificado o alineado a la izquierda |

Los ajustes son por dispositivo y no se sincronizan. Se aplican a todos los libros.

## 9. Temas

### Perfil Móvil

| Tema | Fondo | Texto |
|---|---|---|
| Claro | Blanco | Casi negro (#1A1A1A) |
| Sepia | Crema (#F8F1E3) | Marrón oscuro (#4F3A28) |
| Oscuro | Negro (#000000) | Gris claro (#D0D0D0), no blanco puro |
| Automático | Claro u oscuro según el modo del iPhone | |

Los tonos son orientativos. El objetivo es que Sepia y Oscuro se parezcan a los de Libros de Apple.

La interfaz (biblioteca, barras y paneles) sigue el tema elegido.

### Perfil Tinta electrónica

| Tema | Fondo | Texto |
|---|---|---|
| Negro sobre blanco | #FFFFFF | #000000 |
| Blanco sobre negro | #000000 | #FFFFFF |

Sin grises, sin sombras, sin degradados. Bordes nítidos.

## 10. Sincronización

### Qué se sincroniza

| Se sincroniza | No se sincroniza |
|---|---|
| Libros (archivo y portada) | Ajustes de lectura |
| Catálogo y bajas | Perfil y nombre del dispositivo |
| Posición, porcentaje, capítulo y estado de cada libro | |

### Cuándo

Solo al pulsar Sincronizar (en la biblioteca o en la barra superior del lector), más una sincronización automática tras el primer uso.

### Pasos del botón Sincronizar

1. Comprobar la sesión de Google. Si el token ha caducado (dura una hora), renovarlo en silencio. Si no es posible, pedir inicio de sesión.
2. Localizar la carpeta de la app.
3. Subir los libros pendientes y sus portadas, salvo que ya existan en remoto con la misma huella.
4. Descargar `biblioteca.json` y `progreso.json`.
5. Fusionar la biblioteca: unión por `id`. Si un libro está en ambos lados, gana la versión con `fechaModificacion` más reciente (así se propagan las bajas).
6. Fusionar el progreso libro a libro: gana la entrada con `fecha` más reciente. Nunca se sustituye el archivo entero sin fusionar.
7. Escribir los dos JSON en Drive solo si han cambiado.
8. Actualizar los datos locales: libros nuevos como "Solo en la nube", libros eliminados fuera de la vista, copia local de los JSON remotos.
9. Mostrar un resumen breve, por ejemplo: "2 libros nuevos, 1 posición actualizada". Si no hay cambios: "Todo al día".

### Sin conexión

Se puede leer cualquier libro descargado. Los cambios quedan en la cola de pendientes y el botón Sincronizar muestra un indicador. Si se pulsa sin conexión: "Sin conexión. Se sincronizará cuando vuelvas a pulsar con conexión."

### Errores

| Situación | Comportamiento |
|---|---|
| Fallo a mitad de la sincronización | No se pierde nada local. Lo no subido sigue pendiente |
| Libro remoto que ya no existe en Drive | Se marca como no disponible y se avisa |
| Cuota de Drive llena | Mensaje claro. Los libros quedan pendientes de subir |

## 11. Requisitos no funcionales

1. Interfaz en español.
2. Funciona en Safari de iOS y en el navegador de la tablet Android.
3. La app se instala en la pantalla de inicio de ambos dispositivos.
4. Sin dependencias de servidores propios.
5. Libros de prueba de hasta 10 MB sin bloqueos al abrir ni al paginar.
6. Ningún dato sale del dispositivo salvo hacia la carpeta de Google Drive del usuario.

## 12. Riesgos a validar primero

| Riesgo | Por qué | Cómo validarlo |
|---|---|---|
| Inicio de sesión de Google en el iPhone con la app en la pantalla de inicio | La ventana de login a veces falla en apps web instaladas en iOS | Prototipo mínimo: conectar, crear la carpeta y escribir un JSON |
| Renovación del token | El token del navegador caduca a la hora | Probar Sincronizar tras más de una hora |
| Navegador de la tablet | Rendimiento y ventanas emergentes en tinta electrónica | Probar el login y el paso de página en la Note Air 4C |
| Borrado del almacenamiento local en iOS | Safari puede borrar datos de webs poco usadas | Instalar en pantalla de inicio y pedir almacenamiento persistente. Al estar todo en Drive, una sincronización recupera la biblioteca |

## 13. Plan de construcción propuesto

| Fase | Entregable | Criterio de cierre |
|---|---|---|
| 0. Prototipo de riesgos | Login de Google, carpeta en Drive, escritura de un JSON y un EPUB de prueba paginado con toques | Funciona en el iPhone instalado y en la tablet |
| 1. Biblioteca y lector local | Importar, biblioteca, lector, gestos, panel "Aa" y temas por perfil | Se lee un libro completo en ambos dispositivos sin conexión |
| 2. Sincronización | Subida de libros, fusión de JSON, aviso de posición, estados de libro | Importar en un dispositivo y continuar la lectura en el otro |
| 3. Acabado | PWA instalable, sin conexión, errores, ajustes finos de tinta electrónica | Uso real durante una semana sin incidencias |

## 14. Criterios de aceptación

1. Importo un EPUB en el iPhone, pulso Sincronizar y, tras sincronizar en la tablet, el libro aparece allí con su portada.
2. Leo hasta el capítulo 5 en la tablet y sincronizo. En el iPhone, sincronizo, abro el libro y la app me ofrece ir al capítulo 5 en el punto exacto.
3. Cambiar el tamaño de letra en un dispositivo no altera el punto de lectura que recibe el otro.
4. Importar el mismo EPUB dos veces no crea un duplicado.
5. Eliminar un libro de la biblioteca en un dispositivo lo hace desaparecer del otro al sincronizar.
6. Sin conexión puedo leer los libros descargados, y los cambios se sincronizan después.
7. En la tablet no hay ninguna animación en el paso de página ni en los menús.
8. En el iPhone, los gestos de la tabla del punto 8 funcionan como se describen.

## 15. Configuración previa (a cargo del usuario)

1. Crear el repositorio en GitHub y activar GitHub Pages. Anotar la URL resultante.
2. En Google Cloud: crear un proyecto y activar la API de Google Drive.
3. Configurar la pantalla de consentimiento OAuth con el permiso `drive.file` y publicarla en producción (no requiere verificación con ese permiso).
4. Crear un ID de cliente OAuth de tipo "Aplicación web" con la URL de GitHub Pages como origen de JavaScript autorizado. Añadir también `http://localhost` con el puerto de desarrollo.
5. Facilitar el ID de cliente a Claude Code. No hace falta clave secreta: la app funciona solo en el navegador.

## 16. Roadmap

Orden de prioridad acordado para después de la v1. El esfuerzo es orientativo: bajo, medio o alto.

### Preparación en la v1

Para que las versiones siguientes no obliguen a rehacer nada:

1. Registrar las sesiones de lectura en local desde el primer día (almacén `sesiones`), para que las estadísticas de la v2 tengan histórico.
2. Mantener el campo `version` en los JSON de Drive y prever migraciones de esquema.
3. Al importar, leer y guardar los metadatos de serie si existen (`calibre:series` y `calibre:series_index` en EPUB 2, `belongs-to-collection` en EPUB 3), aunque no se muestren hasta la v2.

### v2. Organización y estadísticas

| Mejora | Qué aporta | Esfuerzo |
|---|---|---|
| Colecciones | Agrupar libros a mano (por ejemplo, "Novela negra" o "Pendientes de verano") | Medio |
| Series | Agrupar las sagas y mostrar el orden de lectura, a partir de los metadatos del EPUB o editándolo a mano | Medio |
| Estadísticas de lectura | Tiempo diario, páginas, rachas y libros terminados por mes y por año, sumando los dos dispositivos | Medio |
| Objetivo anual | Meta de libros al año y seguimiento del avance | Bajo |

Impacto en el diseño:

1. `biblioteca.json` incorpora una lista de colecciones y, por libro, `colecciones`, `serie` y `numeroSerie`.
2. Las sesiones se sincronizan en un archivo por dispositivo (`sesiones-<dispositivo>.json`). Cada dispositivo solo escribe el suyo, así no hay conflictos, y las estadísticas se calculan sumando ambos.
3. Nueva pestaña "Estadísticas", con un resumen en "Leyendo ahora". En el perfil Tinta electrónica, gráficos en blanco y negro sin degradados.

Criterios de aceptación de la v2:

1. Una hora leída en la tablet aparece en las estadísticas del iPhone tras sincronizar, y al revés.
2. En la primera sincronización de la v2, cada dispositivo sube todo su histórico de sesiones registrado desde la v1, y cuenta en el total.
3. No hay doble conteo: cada dispositivo solo escribe su propio archivo de sesiones.
4. Las sesiones leídas sin conexión se suman al total tras la siguiente sincronización.

### v3. Ajustes rápidos

| Mejora | Qué aporta | Esfuerzo |
|---|---|---|
| Sincronización automática opcional | Al cerrar un libro y al abrir la app, si hay conexión. El botón manual se mantiene | Bajo |
| Tiempo restante del capítulo y del libro | Estimado con la velocidad real de lectura que ya registran las sesiones | Bajo |
| Búsqueda en la biblioteca | Por título, autor o serie | Bajo |
| Edición de metadatos y portada | Corregir datos mal informados en algunos EPUB | Bajo |

### Copia de seguridad (adelantada a la v4)

Protege avances, estadísticas, colecciones y objetivos de los dos dispositivos. No incluye los EPUB, que ya están en Drive.

| Función | Detalle |
|---|---|
| Copia automática en Drive | En la primera sincronización de cada día se crea `copias/copia-AAAA-MM-DD.json`. Nunca se sobrescribe. Si el otro dispositivo ya ha hecho la del día, no se repite |
| Antigüedad | Se conservan las 30 últimas diarias y la primera de cada mes durante 12 meses. Las demás van a la papelera de Drive |
| Descarga manual | Desde Ajustes. En el iPhone se abre la hoja de compartir para guardarla en Archivos |
| Restaurar | Desde una copia de Drive o desde un archivo. Se fusiona entrada a entrada y gana lo más reciente, así que no se pierde nada posterior a la copia. Lo restaurado se envía a Drive al sincronizar |

Contenido del archivo: `tipo`, `version`, `fecha`, dispositivo de origen, libros (sin los campos locales), colecciones, objetivos, progreso fusionado y sesiones de cada dispositivo.

Regla: cada dispositivo solo escribe su propio archivo de sesiones, también al restaurar. Las sesiones de otro dispositivo se recuperan restaurando la misma copia en ese dispositivo. Una sesión restaurada conserva su identificador original, así la fusión la reconoce y no se cuenta dos veces.

### v4. Lectura activa

| Mejora | Qué aporta | Esfuerzo |
|---|---|---|
| Subrayados en colores y notas | Con pulsación larga sobre el texto. Se sincronizan entre dispositivos | Medio |
| Marcadores | Volver a pasajes concretos | Bajo |
| Exportar subrayados y notas a Markdown | Llevarse las ideas de un libro a otro sitio | Bajo |
| Búsqueda dentro del libro | Localizar un nombre o una frase | Medio |
| Diccionario | Definición de una palabra con pulsación larga, consultando un diccionario en línea | Medio |

Impacto en el diseño: nuevo archivo `anotaciones.json` en Drive, con cada subrayado anclado por un rango CFI. Se fusiona por identificador de anotación, con borrados marcados igual que los libros.

En el perfil Tinta electrónica, los colores de subrayado se sustituyen por subrayado simple o fondo gris, según cómo se vean en la pantalla de la tablet.

### Ideas a valorar (sin fecha)

| Idea | Comentario |
|---|---|
| Compartir un EPUB desde otra app directamente al lector | Viable en la tablet, porque Android lo permite a las apps web instaladas. En el iPhone, Safari no lo permite |
| Refresco forzado en tinta electrónica cada cierto número de páginas | Para limpiar restos de páginas anteriores. Validar antes si la tablet ya lo gestiona por sí sola |
| Tercer dispositivo (ordenador) | Cabe en el diseño actual sin cambios |
