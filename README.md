# Lector EPUB

Lector EPUB personal para iPhone y tablet de tinta electrónica, con biblioteca y avance sincronizados en una carpeta de Google Drive. Sin backend.

- Diseño funcional: `docs/diseno-funcional-lector-epub.md`
- Instrucciones de trabajo: `CLAUDE.md`

## Estado

Fase 0: prototipo de riesgos (login de Google, carpeta y `prueba.json` en Drive, lector paginado y diagnóstico).

## Configuración

1. Google Cloud: proyecto con la API de Google Drive activada y pantalla de consentimiento con el permiso `drive.file`, publicada en producción.
2. ID de cliente OAuth de tipo "Aplicación web":
   - Orígenes de JavaScript autorizados: `https://<usuario>.github.io` y `http://localhost:8080`.
   - URI de redirección autorizadas (solo para el plan B de la fase 0): `https://<usuario>.github.io/Lectura-App/` y `http://localhost:8080/`. Deben coincidir con la "URI de redirección" que muestra la pantalla de diagnóstico.
3. Copiar el ID de cliente en `config.js`.

## Desarrollo local

```
python3 -m http.server 8080
```

Abrir `http://localhost:8080/`. No hay paso de compilación.
