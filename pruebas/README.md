# Pruebas automáticas

Simulan el iPhone y la tablet en un navegador (Chromium, con Playwright) y una carpeta de Google Drive en memoria. Importan libros, pasan páginas, sincronizan entre los dos dispositivos y comprueban que el resultado es el esperado. La app publicada no las usa ni las descarga.

## Ejecutarlas

Requisitos: Node.js 18 o superior.

```
cd pruebas
npm install
npx playwright install chromium
npm test
```

`npm test` levanta un servidor local con la app, ejecuta todas las pruebas y termina con un resumen. Para ejecutar solo algunas, indica parte del nombre:

```
node ejecutar.js ficha copias
```

Una prueba falla si termina con error, si escribe una línea `FALLO` o si la página informa de errores. Las capturas y archivos temporales van a la carpeta temporal del sistema (`lector-pruebas`), o a la que indique `PRUEBAS_SALIDA`.

## Contenido

| Carpeta | Qué hay |
|---|---|
| `unidad/` | Fusión de los JSON de Drive y cálculo de estadísticas, sin navegador |
| `casos/` | Recorridos completos en el navegador, con uno o dos dispositivos |
| `lib/` | Drive falso en memoria (con el login de Google simulado) y datos comunes |
| `epubs/` | Libros de prueba: con y sin portada, con sinopsis, con DRM, dañado y con scripts |

Antes de publicar cada versión deben pasar todas.
