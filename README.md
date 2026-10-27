# Lector EPUB

Lector EPUB personal para iPhone y tablet de tinta electrónica, con biblioteca y avance sincronizados en una carpeta de Google Drive. Sin backend.

- Diseño funcional: `docs/diseno-funcional-lector-epub.md`
- Instrucciones de trabajo: `CLAUDE.md`

## Estado

- Fase 0 (prototipo de riesgos): validada en el iPhone y en la tablet. Queda pendiente la prueba de renovación de la sesión tras más de una hora.
- Fase 1 (biblioteca y lector local): importar EPUB, biblioteca, lector con gestos, índice, panel "Aa" y temas por perfil. Funciona sin conexión.
- Fase 2 (sincronización): subida de libros y portadas a Drive, fusión de `biblioteca.json` y `progreso.json`, aviso de posición al abrir, estados de libro, quitar del dispositivo y descargar todos.

## Configuración

1. Google Cloud: proyecto con la API de Google Drive activada y pantalla de consentimiento con el permiso `drive.file`. En modo Prueba, con la cuenta del usuario como usuario de prueba.
2. ID de cliente OAuth de tipo "Aplicación web":
   - Orígenes de JavaScript autorizados: `https://<usuario>.github.io` y `http://localhost:8080`.
3. Copiar el ID de cliente en `config.js`.

## Desarrollo local

```
python3 -m http.server 8080
```

Abrir `http://localhost:8080/`. No hay paso de compilación.
