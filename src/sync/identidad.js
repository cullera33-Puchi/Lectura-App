// Seguir como un dispositivo anterior. Al estrenar la app en otra dirección
// (por ejemplo, al pasar de GitHub Pages a Cloudflare), el navegador empieza
// sin datos y el dispositivo recibe un identificador nuevo. Si en Drive ya hay
// archivos de sesiones de otros dispositivos, se ofrece seguir como uno de
// ellos: sus estadísticas siguen unidas y no aparece dos veces en "Por
// dispositivo". Las sesiones de ese archivo se traen en la sincronización.

import { localizarCarpeta, buscarPorPrefijo, leerJson } from './drive.js';
import { normalizarSesiones } from './fusion.js';
import { idDispositivo } from '../datos/preferencias.js';
import { registrar } from '../ui/registro.js';

const PREFIJO = 'sesiones-';

// Dispositivos con archivo de sesiones en Drive, salvo este: { id, nombre,
// ultima } con la fecha de su última sesión, de la más reciente a la más antigua.
export async function dispositivosAnteriores(token) {
  const { carpeta } = await localizarCarpeta(token);
  const archivos = (await buscarPorPrefijo(token, carpeta.id, PREFIJO))
    .filter((a) => a.name.endsWith('.json') && !a.name.includes('.danado-'));
  const propio = idDispositivo();
  const lista = [];
  for (const a of archivos) {
    const id = a.name.slice(PREFIJO.length, -'.json'.length);
    if (!id || id === propio) continue;
    try {
      const datos = normalizarSesiones(await leerJson(token, a.id));
      const ultima = datos.sesiones.map((s) => s.fin || s.inicio || '').sort().pop() || a.modifiedTime;
      lista.push({ id, nombre: datos.dispositivo || 'Dispositivo sin nombre', ultima });
    } catch (e) {
      registrar(`No se pudo leer ${a.name}: ${e.message}`, 'error');
    }
  }
  return lista.sort((x, y) => (y.ultima || '').localeCompare(x.ultima || ''));
}
