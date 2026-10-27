# Librerías de terceros

Copiadas tal cual desde npm, con versión fijada, para que la app funcione sin conexión.

| Archivo | Paquete | Versión | Licencia | SHA-256 |
|---|---|---|---|---|
| `epub-0.3.93.min.js` | epubjs (`dist/epub.min.js`) | 0.3.93 | BSD-2-Clause (`LICENSE-epubjs.txt`) | `06eae15745107b4aa508c95538275251f69bfb9f1175621fc458d9f42ed082d4` |
| `jszip-3.10.1.min.js` | jszip (`dist/jszip.min.js`) | 3.10.1 | MIT o GPLv3 (`LICENSE-jszip.md`) | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |

Se cargan como scripts clásicos antes de los módulos de la app: JSZip expone `window.JSZip` y epub.js lo usa y expone `window.ePub`.

Para actualizar: `npm pack epubjs@<versión>`, copiar el archivo de `dist/`, cambiar el nombre con la nueva versión y actualizar esta tabla y `index.html`.
