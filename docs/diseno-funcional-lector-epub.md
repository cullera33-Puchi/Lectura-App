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
├── copias/          copia-AAAA-MM-DD.json (copia de seguridad diaria)
├── biblioteca.json  catálogo de libros, colecciones, objetivos y Quiero leer
├── progreso.json    posición de lectura por libro
├── anotaciones.json marcadores, subrayados y notas
└── sesiones-<id>.json sesiones de lectura, uno por dispositivo
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
| Pulsación larga | Selecciona texto para subrayarlo o añadir una nota (0.10.0) |

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

### Mejoras adicionales (0.6)

| Mejora | Detalle |
|---|---|
| Dos páginas en horizontal | Con la pantalla en horizontal y al menos 700 x 500 px (la tablet girada), el lector muestra doble página. En el iPhone girado no cabe y se mantiene una. Se puede desactivar en "Aa". La posición se sigue guardando como CFI |
| Ficha del libro | Desde el botón de acciones: portada, serie, avance, fechas de inicio, fin y última lectura, tiempo, sesiones, páginas y reparto por dispositivo, sinopsis y datos de la edición (editorial, publicación, idioma y temas). Todo se sincroniza: las sesiones de los dos dispositivos y los datos de la edición, que se leen del EPUB al importarlo (o al abrir la ficha en un dispositivo que lo tenga, para los libros anteriores) y viajan en `biblioteca.json` en el campo `edicion`, con la sinopsis recortada a 3.000 caracteres |
| Resumen del año | Desde Estadísticas, para el año en curso y los anteriores: libros terminados, tiempo, páginas, días con lectura, racha más larga, media por día, mes y día de la semana con más lectura, franja horaria habitual, libro con más tiempo, sesión más larga, reparto por dispositivo y lista de terminados |

### v4. Lectura activa

| Mejora | Qué aporta | Esfuerzo | Estado |
|---|---|---|---|
| Búsqueda dentro del libro | Localizar un nombre o una frase. Resultados con su contexto, salto al pasaje y resaltado temporal (subrayado en Tinta electrónica) | Medio | Hecho (0.7.0) |
| Marcadores | Volver a pasajes concretos. Botón en la barra superior y lista en el menú. Se sincronizan | Bajo | Hecho (0.7.2) |
| Subrayados en colores y notas | Con pulsación larga sobre el texto. Se sincronizan entre dispositivos | Medio | Hecho (0.10.0) |
| Exportar subrayados y notas a Markdown | Llevarse las ideas de un libro a otro sitio | Bajo | Hecho (0.10.0) |
| Diccionario | Definición de una palabra con pulsación larga | Medio | Pendiente. Choca con la regla 7 (ningún servicio externo salvo Google): habría que incluir un diccionario sin conexión o aceptar una excepción |

Impacto en el diseño: archivo `anotaciones.json` en Drive (ya creado para los marcadores), con cada anotación anclada por un CFI. Se fusiona por identificador de anotación y gana la fecha más reciente. Los borrados se conservan marcados con `eliminado`, igual que los libros. Los subrayados usan el mismo archivo con un rango CFI (0.10.0).

En el perfil Tinta electrónica (la tablet es de tinta en color), los colores de subrayado se pintan como una línea de color bajo el texto, sin fondo ni grises (0.10.1).

### Mejoras 0.7

| Mejora | Detalle | Versión |
|---|---|---|
| Barra para recorrer el libro | Deslizador bajo el texto al mostrar los controles, con vista previa del capítulo y el porcentaje antes de soltar | 0.7.1 |
| Volver a donde estabas | Tras un salto (índice, búsqueda, marcador, barra o enlace) aparece un botón para regresar, y después para ir otra vez al destino. Se oculta al pasar varias páginas | 0.7.3 |
| Ajustes de lectura por libro | Interruptor "Solo para este libro" en "Aa": tamaño, fuente, interlineado, márgenes y justificación propios de ese libro | 0.7.4 |
| Valoración y nota | Estrellas y una nota personal en la ficha. Al terminar un libro se propone valorarlo. Se sincronizan en `biblioteca.json` (`valoracion`) | 0.7.5 |
| Quiero leer | Lista ordenable de próximas lecturas, con fila propia en Leyendo ahora y grupo en la biblioteca. Viaja en `biblioteca.json` (`quieroLeer`: `ids` en orden, `fecha` y, desde 0.8.5, `entradas` con la fecha de alta o baja de cada libro, para fusionar libro a libro) | 0.7.6 |
| Aviso de duplicados | Detecta el mismo libro importado desde archivos distintos (mismo identificador del EPUB, o mismo título y autor). Avisa al importar y en la biblioteca; se elige qué copia conservar o se marca como libros distintos | 0.7.7 |
| Meta diaria de minutos | Se fija en Estadísticas, se sigue en la tarjeta Hoy y en Leyendo ahora y avisa una vez al día al cumplirla. Viaja con los objetivos (`objetivos.diario`) | 0.7.8 |
| Fin previsto | En la ficha de un libro en curso: fecha estimada con el tiempo dedicado, el porcentaje leído y la media diaria de lectura de los últimos 14 días | 0.7.9 |

### Repaso de la app (0.8)

Revisión completa del código en tres partes: lector, sincronización y datos, y biblioteca, estadísticas e interfaz.

| Versión | Contenido |
|---|---|
| 0.8.0 | Corrección de los errores confirmados: cambios en colecciones, objetivos y Quiero leer perdidos si se hacían durante una sincronización, libros eliminados que podían reaparecer, subidas sin reintento, copia de seguridad sin Quiero leer, botón Atrás de Android que cerraba la app con una hoja abierta, datos de "Hoy" sin repintar al día siguiente, sesiones que pasan la medianoche y varios detalles del lector (búsqueda, barra, marcadores, teclado) |
| 0.8.1 | Rendimiento: portadas en paralelo, motor de lectura cargado al abrir el primer libro, menos escrituras al pasar página, búsqueda más rápida, sesiones en memoria y panel "Aa" sin redibujar |
| 0.8.2 | Usabilidad: controles ocultos al pasar página, teclas y mandos para pasar página, avisos de fallos de sincronización, resumen de sincronización completo, zonas de toque de 44 px, búsqueda vacía con el filtro activo, previsión del objetivo anual y accesibilidad |
| 0.8.3 | Sincronización sin cambios con 3 peticiones a Drive a la vez (antes, unas 12 una tras otra): la carpeta se recuerda, se lista una sola vez y los JSON que no han cambiado no se descargan. Antes de escribir se sigue leyendo y fusionando |
| 0.8.4 | Detalle de un mes en Estadísticas (mejora 21): al tocar la barra de un mes, hoja con el tiempo, los días y las páginas del mes, los libros leídos con el tiempo de cada uno, los terminados y el reparto por dispositivo. Cada libro abre su ficha |
| 0.8.5 | Revisión completa del código con verificación independiente de cada hallazgo: 52 errores corregidos. Los más importantes: abrir un libro sin pasar página ya no pisa la posición del otro dispositivo, se conserva el estado "terminado" del otro dispositivo, tras sincronizar con un libro abierto se ofrece la posición más reciente del otro, el primer paso de página en el iPhone se guarda, cambiar una portada no deshace cambios del otro dispositivo, "Quiero leer" se fusiona libro a libro (regla 2), un libro que falla al subir no frena la sincronización, la app no se recarga a mitad de una importación o restauración, búsqueda con saltos de línea y espacios duros, índice con anclas en un mismo archivo, libros de derecha a izquierda en el iPhone, EPUB con BOM y textos en español en los errores de Google y Drive |
| 0.8.6 | Reloj atrasado en un dispositivo (mejora 18): la fecha de cada cambio que se fusiona por fecha (posición, Quiero leer, marcadores, libros, colecciones y objetivos) es siempre posterior a la del dato que sustituye, así un avance hecho en un dispositivo con la hora atrasada no pierde frente a uno anterior del otro. Diagnóstico muestra la diferencia de hora con Google, medida al subir un JSON a Drive |
| 0.8.7 | App servida desde la caché del dispositivo (mejora 4): arranca al momento aunque la conexión sea mala. Cada versión publicada se descarga entera en segundo plano a su propia caché y espera; se activa al abrir la app (si no se ha tocado aún) o al pasar a segundo plano, nunca con un libro abierto ni con una sincronización o importación en curso. Así no se mezclan archivos de dos versiones |
| 0.8.8 | Biblioteca más rápida (mejora 5): filtrar, buscar u ordenar no vuelve a leer la base de datos ni rehace las filas; solo se recolocan, y una fila se rehace cuando cambian los datos de su libro. Con 300 libros, volver a la lista completa pasa de unos 420 ms a unos 50 ms |
| 0.8.9 | Libros dañados y libros grandes (mejora 19): un capítulo con XHTML mal formado (por ejemplo, un `&nbsp;` sin declarar) se lee como HTML; uno que falta en el archivo muestra un aviso y se sigue leyendo. Antes, en la tablet, el lector se quedaba bloqueado. Las imágenes y fuentes se descomprimen al pintar cada capítulo y no todas al abrir: un libro de 80 MB de imágenes abre en un tercio del tiempo y sin ocupar esa memoria. Los plazos de apertura crecen con el tamaño del libro |
| 0.9.0 | Rebote en el iPhone (mejora 20): al arrastrar, Safari descuenta el desplazamiento de la página del ancho del contenido y, con una sola página cargada por delante (la penúltima del capítulo mientras se carga el siguiente), el lector creía que no había más: frenaba el arrastre y devolvía la página. Ahora mide el ancho de los capítulos cargados. Además, el capítulo siguiente se carga tres páginas antes del final y, si al llegar al final aún no está, se espera a que lo esté en lugar de devolver la página. Reproducido en las pruebas imitando la medida de Safari |
| 0.9.1 | Notas al pie emergentes (mejora 22): al tocar la llamada de una nota se muestra su texto en una hoja, sin salir de la página, con "Ir a la nota" para el salto de siempre. Reconoce notas EPUB 3 (`epub:type="noteref"`, `footnote`, `endnote`) y ARIA, las de Calibre y las de conversiones de Kindle (llamada corta, en superíndice o con identificador de nota), en el mismo archivo o en otro. Quita el enlace de vuelta y la marca repetida. Si el destino no parece una nota (un título, un texto largo), se salta como siempre |
| 0.9.2 | Pantalla encendida mientras se lee (mejora 24): con un libro abierto la pantalla no se apaga. Se suelta al cerrar el libro o tras 5 minutos sin pasar página ni tocar el libro, y se vuelve a pedir al pasar página o al volver a la app. Diagnóstico muestra su estado. La mejora 25 (tiempo restante) ya existía desde la v3 y se retira de la lista |
| 0.9.3 | Formato del editor o el mío (mejora 28): en "Aa", con un libro abierto, "Formato de este libro": "Mis ajustes" aplica la letra, el interlineado y la justificación elegidos; "Del editor" respeta los del EPUB. El tamaño, el tema y los márgenes de página siguen siendo los de "Aa". Es de cada libro y de cada dispositivo. Además, el tamaño de "Aa" ya escala los tamaños fijos (pt, px) que algunos libros ponen en sus estilos y que antes no cambiaban |
| 0.9.4 | Tercer dispositivo, el ordenador: usa el perfil Móvil y se propone el nombre "Ordenador". Los EPUB se pueden arrastrar a la ventana para añadirlos. En el lector, la rueda del ratón y el panel táctil pasan una página por gesto, además de las flechas del teclado y los clics en los laterales que ya funcionaban. En monitores de más de 1600 px el lector se limita a 1500 px centrados para que las líneas no sean demasiado largas. Diagnóstico nombra el sistema (Windows, macOS, Linux). Sesiones, posición y estadísticas ya admitían un tercer dispositivo sin cambios |
| 0.9.5 | Prueba guiada (mejora 31): en Ajustes, Diagnóstico, "Prueba guiada en este dispositivo". Explica cómo comprobar lo que no cubren las pruebas automáticas: botones físicos (muestra las teclas que recibe la app), deslizar en horizontal en el iPhone, restos de páginas en la tinta electrónica y pantalla encendida. Guarda las respuestas y las incluye en "Copiar diagnóstico y registro" |
| 0.9.6 | Ordenador como opción propia: la bienvenida y Ajustes ofrecen Móvil, Tinta electrónica y Ordenador. El ordenador usa el comportamiento del perfil Móvil y propone el nombre "Ordenador"; si se abre la app en un ordenador sin pantalla táctil, sale propuesto de entrada |
| 0.9.7 a 0.9.9 | Ajustes tras usar la app en el ordenador: la pantalla encendida no anota errores repetidos si el navegador la niega; el registro detalla la apertura del lector (modo de página, tamaño del visor, vistas cargadas si tarda y errores de epub.js); y, si hay una versión nueva esperando y la app ya se está usando, un aviso ofrece "Actualizar" (en el ordenador la pestaña rara vez pasa a segundo plano) |
| 0.9.10 | Capítulos en blanco en el ordenador: si una imagen, fuente, hoja de estilo o el propio capítulo no se podía descomprimir, epub.js lo esperaba para siempre y el capítulo se quedaba con 0 px de ancho. Ahora se leen directamente del archivo, con un plazo de 8 s: el capítulo se pinta sin el recurso dañado (o con el aviso de parte dañada) y el registro anota cuál era. Si la primera página tarda, el registro dice en qué fase está cada capítulo |
| 0.9.11 | El registro de Diagnóstico se conserva al recargar la página o reabrir la app (las últimas 150 líneas, en este dispositivo), para no perder lo que pasó antes de copiarlo |
| 0.9.12 | Libros que no abrían desde la 0.8.9 (visto con un EPUB de Penguin): si una hoja de estilo mencionaba su propio nombre, al prepararla se esperaba a sí misma y el capítulo se quedaba en blanco. Las hojas preparadas y los recursos tal cual van en memorias separadas, así ninguna hoja espera a otra ni a sí misma. Además, si la preparación de un capítulo tarda más de 5 s, se pinta sin sus imágenes y estilos y el registro anota qué faltaba. El aviso de un libro que no termina de pintarse ya no habla de DRM |
| 0.10.0 | Subrayados y notas (mejoras 26, 27 y 30). Mantener pulsado el texto (o arrastrar con el ratón) lo selecciona y aparece una barra abajo: cuatro colores (amarillo, verde, azul y rosa) y "Nota". En tinta electrónica, "Subrayar" con subrayado simple, sin colores. Tocar un subrayado permite cambiar el color, escribir o editar la nota y borrarlo. Lista "Subrayados y notas" en el menú del lector (salta al pasaje) y en la ficha del libro (abre el libro en el pasaje, con el botón para volver a donde se iba). Exportar a Markdown desde las dos listas: en el iPhone abre el menú Compartir; en el ordenador se descarga el archivo. Cita del día en Inicio: un pasaje subrayado al azar, el mismo todo el día, que abre el libro en ese punto. Se sincronizan en `anotaciones.json` (tipo `subrayado`, con `cfi` de rango, `texto`, `color` y `nota`), fusionados por identificador como los marcadores |
| 0.10.1 | Subrayados legibles: se pintan con los resaltados nativos del navegador (`::highlight`), con el color detrás de las letras, así el texto se lee con cualquier tema (en el iPhone con el tema oscuro quedaba tapado). En la tinta electrónica en color, los cuatro colores como línea gruesa bajo el texto, con tonos más intensos. Al tocar un subrayado, su nota aparece arriba y a la vista, y tocarla la edita; debajo, el pasaje recortado. El resaltado de la búsqueda usa el mismo sistema. Si el navegador no tiene resaltados nativos, se mantiene la capa de epub.js, más tenue |

### Mejoras pendientes (numeradas)

Del repaso de la app y nuevas funciones. La numeración se mantiene para poder elegirlas.

| Nº | Mejora | Esfuerzo |
|---|---|---|
| 23 | Cómics en CBR (y CBZ): importarlos, verlos en la biblioteca con su portada y leerlos página a página, con zoom, doble página en horizontal y sentido de lectura de manga. Es viable con dos decisiones previas: añadir una librería para descomprimir RAR (por ejemplo, libarchive.js en WebAssembly, copiada en `vendor/`, cargada solo al importar) y una excepción a la regla 1, porque un cómic no tiene CFI y la posición sería el número de página. Al importar se convertiría a CBZ para leerlo después con JSZip, que ya está en la app | Alto |
| 29 | Lectura en voz alta con las voces del propio dispositivo, pasando de página sola. Sin servicios externos | Medio |
| 32 | Espacio en el dispositivo: lo que ocupa cada libro y liberar el de los terminados | Bajo |
| 33 | Añadir libros desde Drive: importar EPUB que ya están en Drive sin descargarlos antes al dispositivo | Medio |
| 34 | Compartir un EPUB desde otra app al lector. Solo en la tablet: Safari no lo permite en el iPhone | Bajo |
| 35 | Exportar estadísticas a Excel: sesiones y libros terminados | Bajo |

### Ideas a valorar (sin fecha)

| Idea | Comentario |
|---|---|
| Biblioteca grande | Revisar rendimiento y memoria con varios cientos de libros (portadas, búsqueda y sincronización) |
| Botones físicos de la tablet | Pasar página con los botones de volumen o los de la funda, si el navegador de la tablet los expone. Se comprueba con la prueba guiada de Diagnóstico (0.9.5) |
| Refresco forzado en tinta electrónica cada cierto número de páginas | Para limpiar restos de páginas anteriores. Validar antes con la prueba guiada de Diagnóstico (0.9.5) si la tablet ya lo gestiona por sí sola |
