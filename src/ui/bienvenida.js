// Primer uso (punto 6 del diseño): perfil, nombre del dispositivo y conexión
// con Google. La primera sincronización llega con la fase 2.

import { preferencias, cambiarDispositivo, NOMBRE_PROPUESTO } from '../datos/preferencias.js';
import { conectarConVentana } from '../sync/google.js';
import { prepararCarpeta } from '../sync/carpeta.js';
import { registrar } from './registro.js';

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
  const nombre = $('bienvenida-nombre').value.trim() || preferencias().dispositivo.dispositivo;
  const { dispositivo } = preferencias();
  await cambiarDispositivo({
    dispositivo: nombre,
    nombreEditado: nombre !== NOMBRE_PROPUESTO[dispositivo.perfil],
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
      const perfil = boton.dataset.perfil;
      await cambiarDispositivo({ perfil, dispositivo: NOMBRE_PROPUESTO[perfil] });
      $('bienvenida-nombre').value = NOMBRE_PROPUESTO[perfil];
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
        const texto = await prepararCarpeta(await promesa);
        mensaje(texto);
        await terminar();
      } catch (e) {
        mensaje(`${e.message}\nPuedes intentarlo de nuevo o conectar más tarde desde Ajustes.`, true);
        registrar(e.message, 'error');
      }
    })();
  });
}
