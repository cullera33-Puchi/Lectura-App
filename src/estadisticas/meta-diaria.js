// Meta diaria de minutos de lectura. Se fija en Estadísticas y viaja con los
// objetivos anuales en biblioteca.json. Al cumplirla mientras se lee, aparece
// un aviso una sola vez al día en cada dispositivo.

import { leerObjetivos } from '../datos/colecciones.js';
import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { obtenerEstadisticas } from './datos.js';
import { claveDia, formatoDuracion } from './calculo.js';
import { mostrarAviso } from '../ui/aviso.js';
import { registrar } from '../ui/registro.js';

const CLAVE_AVISADA = 'metaDiariaAvisada';
const INTERVALO_MS = 60 * 1000; // no recalcula en cada página
let ultimaComprobacion = 0;

// Se llama al pasar página. Como mucho, una comprobación por minuto.
export async function comprobarMetaDiaria() {
  const ahora = Date.now();
  if (ahora - ultimaComprobacion < INTERVALO_MS) return;
  ultimaComprobacion = ahora;
  try {
    const minutos = (await leerObjetivos()).diario?.minutos;
    if (!minutos) return;
    const hoy = claveDia(new Date(ahora));
    if ((await leerAjuste(CLAVE_AVISADA)) === hoy) return;
    const e = await obtenerEstadisticas(new Date(ahora));
    if (e.hoy.ms < minutos * 60000) return;
    await guardarAjuste(CLAVE_AVISADA, hoy);
    registrar(`Meta diaria cumplida: ${formatoDuracion(e.hoy.ms)} de ${minutos} min`);
    mostrarAviso(`Meta de hoy cumplida: ${formatoDuracion(e.hoy.ms)} de lectura`, 5000);
  } catch (e) {
    console.error('Meta diaria:', e);
  }
}
