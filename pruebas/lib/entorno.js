// Datos comunes de las pruebas: dirección de la app, EPUB de prueba y carpeta
// de salida para capturas y archivos temporales.

const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_APP = process.env.PRUEBAS_URL || 'http://localhost:8080/';
const EPUBS = path.join(__dirname, '..', 'epubs');
const SALIDA = process.env.PRUEBAS_SALIDA || path.join(os.tmpdir(), 'lector-pruebas');
fs.mkdirSync(SALIDA, { recursive: true });

const ok = (condicion, mensaje) => console.log(condicion ? 'OK   ' : 'FALLO', mensaje);

module.exports = { URL_APP, EPUBS, SALIDA, ok };
