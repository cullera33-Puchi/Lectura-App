// Primer uso (punto 6 del diseño): perfil, nombre del dispositivo, conexión
// con Google y primera sincronización automática para traer la biblioteca.

import { cambiarDispositivo, NOMBRE_PROPUESTO, tipoDispositivo } from '../datos/preferencias.js';
import { conectarConVentana } from '../sync/google.js';
import { prepararCarpeta } from '../sync/carpeta.js';
import { registrar } from './registro.js';
import { ejecutarSincronizacion } from './sincronizacion.js';

const $ = (id) => document.getElementById(id);

let alTerminar = () => {};

function mostrarPaso(n) {
  $('bienvenida-paso1').hidden = n !== 1;
  $('bienvenida-paso2').hidden = n !== 2;
}

function mensaje(texto, esError = false) {
  const caja = $('bienvenida-mensaje');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
}

async function terminar() {
  const nombre = $('bienvenida-nombre').value.trim() || NOMBRE_PROPUESTO[tipoDispositivo()];
  await cambiarDispositivo({
    dispositivo: nombre,
    nombreEditado: nombre !== NOMBRE_PROPUESTO[tipoDispositivo()],
    bienvenidaCompleta: true,
  });
  registrar(`Primer uso completado como ${nombre}`);
  alTerminar();
}

export function mostrarBienvenida() {
  mostrarPaso(1);
  mensaje('');
}

export function prepararBienvenida({ terminado }) {
  alTerminar = terminado;

  document.querySelectorAll('#bienvenida-paso1 .opcion-grande').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const tipo = boton.dataset.tipo;
      await cambiarDispositivo({ tipo, dispositivo: NOMBRE_PROPUESTO[tipo] });
      $('bienvenida-nombre').value = NOMBRE_PROPUESTO[tipo];
      mostrarPaso(2);
    });
  });

  $('bienvenida-atras').addEventListener('click', () => mostrarPaso(1));
  $('bienvenida-omitir').addEventListener('click', terminar);

  $('bienvenida-conectar').addEventListener('click', () => {
    const promesa = conectarConVentana(); // sin await previo: dentro del gesto
    (async () => {
      try {
        mensaje('Conectando con Google...');
        const token = await promesa;
        mensaje(await prepararCarpeta(token));
        await terminar();
        await ejecutarSincronizacion(Promise.resolve(token));
      } catch (e) {
        mensaje(`${e.message}\nPuedes intentarlo de nuevo o conectar más tarde desde Ajustes.`, true);
        registrar(e.message, 'error');
      }
    })();
  });
}
