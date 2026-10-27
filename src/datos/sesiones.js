// Sesiones de lectura (punto 5 del diseño). Se guardan desde la v1 para las
// estadísticas de la v2. Una sesión empieza al abrir un libro y termina al
// cerrarlo o tras 5 minutos sin pasar página. El registro se actualiza en cada
// página, así no se pierde si el sistema cierra la app.

import { guardar, borrar } from './almacen.js';

const INACTIVIDAD_MS = 5 * 60 * 1000;
const DURACION_MINIMA_MS = 5 * 1000;

export class RegistroSesiones {
  constructor(libroId, dispositivo) {
    this.libroId = libroId;
    this.dispositivo = dispositivo;
    this.sesion = null;
    this.ultimaActividad = 0;
    this.cola = Promise.resolve();
  }

  // Las operaciones se encadenan para que no se solapen escrituras.
  encolar(fn) {
    this.cola = this.cola.then(fn).catch((e) => console.error('Sesión de lectura:', e));
    return this.cola;
  }

  iniciar() {
    return this.encolar(() => this.iniciarAhora());
  }

  paginaPasada() {
    return this.encolar(() => this.paginaPasadaAhora());
  }

  cerrar() {
    return this.encolar(() => this.cerrarAhora());
  }

  async iniciarAhora() {
    const ahora = Date.now();
    this.ultimaActividad = ahora;
    this.sesion = {
      libroId: this.libroId,
      dispositivo: this.dispositivo,
      inicio: new Date(ahora).toISOString(),
      fin: new Date(ahora).toISOString(),
      paginas: 0,
    };
    this.sesion.clave = await guardar('sesiones', this.sesion);
  }

  async paginaPasadaAhora() {
    const ahora = Date.now();
    if (!this.sesion || ahora - this.ultimaActividad > INACTIVIDAD_MS) {
      await this.cerrarAhora();
      await this.iniciarAhora();
    }
    this.ultimaActividad = ahora;
    this.sesion.paginas += 1;
    this.sesion.fin = new Date(ahora).toISOString();
    await guardar('sesiones', this.sesion);
  }

  async cerrarAhora() {
    if (!this.sesion) return;
    const sesion = this.sesion;
    this.sesion = null;
    const fin = Math.min(Date.now(), this.ultimaActividad + INACTIVIDAD_MS);
    const inicio = Date.parse(sesion.inicio);
    if (sesion.paginas === 0 && fin - inicio < DURACION_MINIMA_MS) {
      await borrar('sesiones', sesion.clave);
      return;
    }
    sesion.fin = new Date(fin).toISOString();
    await guardar('sesiones', sesion);
  }
}
