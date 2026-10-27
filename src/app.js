// Fase 0: prototipo de riesgos. Login de Google, carpeta y prueba.json en
// Drive, lector paginado y diagnóstico.

import { leerAjuste, guardarAjuste } from './datos/almacen.js';
import {
  iniciarSesionGoogle, suscribirSesion, estadoSesion, tokenVigente, asegurarToken,
  conectarConVentana, conectarConRedireccion, forzarCaducidad, invalidarToken,
  cerrarSesion, fijarEmail,
} from './sync/google.js';
import { obtenerUsuario, localizarCarpeta, ErrorDrive } from './sync/drive.js';
import { escribirPrueba, leerPrueba, NOMBRE_PRUEBA } from './sync/prueba.js';
import { abrirLibro } from './lector/lector.js';
import { registrar, suscribirRegistro, entradasRegistro, horaCorta, registroComoTexto } from './ui/registro.js';
import {
  datosDiagnostico, diagnosticoComoTexto, pedirPersistencia, estaInstalada, nombreNavegador,
} from './ui/diagnostico.js';

const NOMBRE_PROPUESTO = { movil: 'iPhone', tinta: 'Note Air 4C' };

const $ = (id) => document.getElementById(id);

const ajustes = { perfil: 'movil', dispositivo: 'iPhone', nombreEditado: false };
let carpetaId = null;
let lectorActivo = null;

// --- Este dispositivo ---

function aplicarPerfil() {
  document.body.dataset.perfil = ajustes.perfil;
  document.querySelectorAll('input[name="perfil"]').forEach((r) => {
    r.checked = r.value === ajustes.perfil;
  });
  $('nombre-dispositivo').value = ajustes.dispositivo;
}

async function cargarAjustes() {
  const guardados = await leerAjuste('dispositivo');
  if (guardados) {
    Object.assign(ajustes, guardados);
  } else {
    ajustes.perfil = /Android/.test(navigator.userAgent) ? 'tinta' : 'movil';
    ajustes.dispositivo = NOMBRE_PROPUESTO[ajustes.perfil];
    await guardarAjuste('dispositivo', { ...ajustes });
  }
  carpetaId = (await leerAjuste('carpetaId')) || null;
  aplicarPerfil();
}

function prepararDispositivo() {
  document.querySelectorAll('input[name="perfil"]').forEach((r) => {
    r.addEventListener('change', async () => {
      ajustes.perfil = r.value;
      if (!ajustes.nombreEditado) ajustes.dispositivo = NOMBRE_PROPUESTO[r.value];
      aplicarPerfil();
      await guardarAjuste('dispositivo', { ...ajustes });
      registrar(`Perfil: ${r.value === 'tinta' ? 'Tinta electrónica' : 'Móvil'}`);
      pintarDiagnostico();
    });
  });
  $('nombre-dispositivo').addEventListener('change', async (e) => {
    const nombre = e.target.value.trim();
    if (!nombre) {
      e.target.value = ajustes.dispositivo;
      return;
    }
    ajustes.dispositivo = nombre;
    ajustes.nombreEditado = true;
    await guardarAjuste('dispositivo', { ...ajustes });
    registrar(`Nombre del dispositivo: ${nombre}`);
  });
}

// --- Google Drive ---

function mostrarDrive(texto, esError = false) {
  const caja = $('resultado-drive');
  caja.textContent = texto;
  caja.classList.toggle('error', esError);
}

function pintarSesion() {
  const s = estadoSesion();
  let texto;
  if (!s.token) texto = 'Sin conectar.';
  else if (tokenVigente()) texto = `Conectado${s.email ? ` como ${s.email}` : ''}.`;
  else texto = 'La sesión ha caducado. Se renovará al pulsar cualquier botón de Drive.';
  $('estado-sesion').textContent = texto;
}

async function prepararCarpeta(token) {
  const usuario = await obtenerUsuario(token).catch((e) => {
    registrar(`No se pudo leer el usuario de Drive: ${e.message}`, 'error');
    return null;
  });
  if (usuario?.emailAddress) await fijarEmail(usuario.emailAddress);
  const { carpeta, creada, total } = await localizarCarpeta(token);
  carpetaId = carpeta.id;
  await guardarAjuste('carpetaId', carpetaId);
  const texto = `Carpeta "${carpeta.name}" ${creada ? 'creada' : 'localizada'} en Drive.`;
  registrar(`${texto} id=${carpeta.id}${total > 1 ? ` (hay ${total} carpetas marcadas; se usa la más antigua)` : ''}`);
  return texto;
}

// Ejecuta una operación de Drive. asegurarToken() se llama sin await previo
// para que la ventana de Google, si hace falta, se abra dentro del gesto.
function conDrive(operacion) {
  const renovando = !tokenVigente();
  const promesaToken = asegurarToken();
  (async () => {
    try {
      mostrarDrive(renovando ? 'Conectando con Google...' : 'Trabajando...');
      const token = await promesaToken;
      if (renovando) registrar('Sesión lista tras renovar');
      const texto = await operacion(token);
      if (texto) mostrarDrive(texto);
    } catch (e) {
      if (e instanceof ErrorDrive && e.estadoHttp === 401) {
        await invalidarToken();
        mostrarDrive('Google ha rechazado la sesión. Pulsa de nuevo para renovarla.', true);
      } else {
        mostrarDrive(e.message, true);
      }
      registrar(e.message, 'error');
    } finally {
      pintarDiagnostico();
    }
  })();
}

async function asegurarCarpeta(token) {
  if (!carpetaId) await prepararCarpeta(token);
  return carpetaId;
}

function pintarTablaPrueba(datos) {
  const filas = Object.values(datos.escrituras).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const tabla = document.createElement('table');
  tabla.innerHTML = '<thead><tr><th>Dispositivo</th><th>Escrito</th><th>Perfil</th><th>Instalada</th></tr></thead>';
  const cuerpo = document.createElement('tbody');
  for (const f of filas) {
    const tr = document.createElement('tr');
    const celdas = [
      f.dispositivo + (f.dispositivo === ajustes.dispositivo ? ' (este)' : ''),
      new Date(f.fecha).toLocaleString('es-ES'),
      f.perfil === 'tinta' ? 'Tinta electrónica' : 'Móvil',
      f.instalada ? 'sí' : 'no',
    ];
    for (const c of celdas) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.appendChild(td);
    }
    cuerpo.appendChild(tr);
  }
  tabla.appendChild(cuerpo);
  $('tabla-prueba').replaceChildren(tabla);
}

function prepararDrive() {
  $('btn-conectar').addEventListener('click', () => {
    const promesa = conectarConVentana();
    conDriveConPromesa(promesa, prepararCarpeta);
  });

  $('btn-redireccion').addEventListener('click', () => {
    conectarConRedireccion().catch((e) => mostrarDrive(e.message, true));
  });

  $('btn-escribir').addEventListener('click', () => conDrive(async (token) => {
    const id = await asegurarCarpeta(token);
    const entrada = {
      dispositivo: ajustes.dispositivo,
      perfil: ajustes.perfil,
      fecha: new Date().toISOString(),
      navegador: nombreNavegador(),
      instalada: estaInstalada(),
    };
    const datos = await escribirPrueba(token, id, entrada);
    registrar(`${NOMBRE_PRUEBA} escrito (${Object.keys(datos.escrituras).length} dispositivos en el archivo)`);
    pintarTablaPrueba(datos);
    return `${NOMBRE_PRUEBA} escrito a las ${horaCorta(new Date())}.`;
  }));

  $('btn-leer').addEventListener('click', () => conDrive(async (token) => {
    const id = await asegurarCarpeta(token);
    const leido = await leerPrueba(token, id);
    if (!leido) {
      $('tabla-prueba').replaceChildren();
      return `No existe ${NOMBRE_PRUEBA} en la carpeta. Pulsa "Escribir prueba.json".`;
    }
    registrar(`${NOMBRE_PRUEBA} leído. Modificado en Drive: ${new Date(leido.archivo.modifiedTime).toLocaleString('es-ES')}`);
    pintarTablaPrueba(leido.datos);
    return `${NOMBRE_PRUEBA} leído a las ${horaCorta(new Date())}.`;
  }));

  $('btn-caducar').addEventListener('click', async () => {
    await forzarCaducidad();
    mostrarDrive('Token marcado como caducado. Pulsa "Escribir prueba.json" para probar la renovación.');
  });

  $('btn-cerrar-sesion').addEventListener('click', async () => {
    await cerrarSesion();
    carpetaId = null;
    await guardarAjuste('carpetaId', null);
    $('tabla-prueba').replaceChildren();
    mostrarDrive('Sesión cerrada.');
  });

  suscribirSesion(() => {
    pintarSesion();
    pintarDiagnostico();
  });
}

function conDriveConPromesa(promesaToken, operacion) {
  (async () => {
    try {
      mostrarDrive('Conectando con Google...');
      const token = await promesaToken;
      mostrarDrive(await operacion(token));
    } catch (e) {
      mostrarDrive(e.message, true);
      registrar(e.message, 'error');
    } finally {
      pintarDiagnostico();
    }
  })();
}

// Al volver de la redirección de Google (plan B), se localiza la carpeta.
async function continuarTrasRedireccion() {
  const s = estadoSesion();
  if (s.metodo === 'redireccion' && tokenVigente() && !s.email) {
    try {
      mostrarDrive(await prepararCarpeta(s.token));
    } catch (e) {
      mostrarDrive(e.message, true);
      registrar(e.message, 'error');
    }
  }
}

// --- Lector ---

function mostrarControles(visibles) {
  $('barra-superior').hidden = !visibles;
  $('barra-inferior').hidden = !visibles;
}

function cerrarLibro() {
  lectorActivo?.destruir();
  lectorActivo = null;
  $('visor').replaceChildren();
  $('lector').hidden = true;
  document.body.classList.remove('leyendo');
  $('archivo-epub').value = '';
  registrar('Libro cerrado');
}

function prepararLector() {
  $('archivo-epub').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const caja = $('resultado-lector');
    caja.classList.remove('error');
    caja.textContent = `Abriendo ${archivo.name}...`;
    registrar(`Abriendo ${archivo.name} (${(archivo.size / 1024 / 1024).toFixed(1)} MB)`);
    try {
      const datos = await archivo.arrayBuffer();
      document.body.classList.add('leyendo');
      $('lector').hidden = false;
      mostrarControles(false);
      lectorActivo = await abrirLibro($('visor'), datos, ajustes.perfil, {
        alTocarCentro: () => mostrarControles($('barra-superior').hidden),
        alDeslizarAbajo: cerrarLibro,
        alCambiarPosicion: (p) => {
          const paginas = p.pagina ? `, página ${p.pagina} de ${p.paginasCapitulo} del capítulo` : '';
          $('info-capitulo').textContent = `${p.capitulo}${paginas}`;
          $('info-cfi').textContent = p.cfi;
        },
      });
      $('titulo-libro').textContent = lectorActivo.titulo;
      caja.textContent = '';
    } catch (err) {
      cerrarLibro();
      caja.textContent = err.message;
      caja.classList.add('error');
    }
  });

  $('btn-cerrar-libro').addEventListener('click', cerrarLibro);
}

// --- Diagnóstico y registro ---

let pintandoDiagnostico = false;

async function pintarDiagnostico() {
  if (pintandoDiagnostico) return;
  pintandoDiagnostico = true;
  try {
    const filas = await datosDiagnostico();
    const dl = $('tabla-diagnostico');
    dl.replaceChildren();
    for (const [clave, valor] of filas) {
      const dt = document.createElement('dt');
      dt.textContent = clave;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      dl.append(dt, dd);
    }
  } finally {
    pintandoDiagnostico = false;
  }
}

function pintarEntrada(entrada) {
  const li = document.createElement('li');
  li.textContent = `${horaCorta(entrada.fecha)} ${entrada.texto}`;
  if (entrada.tipo === 'error') li.className = 'error';
  $('lista-registro').prepend(li);
}

function prepararDiagnostico() {
  entradasRegistro().reverse().forEach(pintarEntrada);
  suscribirRegistro(pintarEntrada);

  $('btn-actualizar-diagnostico').addEventListener('click', pintarDiagnostico);

  $('btn-persistir').addEventListener('click', async () => {
    const resultado = await pedirPersistencia();
    registrar(`navigator.storage.persist(): ${resultado}`);
    pintarDiagnostico();
  });

  $('btn-copiar').addEventListener('click', async () => {
    const texto = `${diagnosticoComoTexto(await datosDiagnostico())}\n\nRegistro:\n${registroComoTexto()}`;
    try {
      await navigator.clipboard.writeText(texto);
      registrar('Diagnóstico copiado al portapapeles');
    } catch {
      const area = $('texto-copiar');
      area.value = texto;
      area.hidden = false;
      area.select();
      registrar('No se pudo copiar automáticamente. Selecciona el texto del recuadro.');
    }
  });

  // Refresco periódico de la caducidad, salvo en tinta electrónica para no
  // provocar refrescos de pantalla innecesarios.
  setInterval(() => {
    if (ajustes.perfil === 'movil' && !lectorActivo) pintarDiagnostico();
  }, 60 * 1000);
}

// --- Arranque ---

async function iniciar() {
  registrar(`Inicio. ${estaInstalada() ? 'App instalada (standalone)' : 'En pestaña del navegador'}`);
  prepararDiagnostico();
  await cargarAjustes();
  prepararDispositivo();
  prepararDrive();
  prepararLector();

  const persistencia = await pedirPersistencia();
  registrar(`navigator.storage.persist(): ${persistencia}`);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => registrar(`Service worker no registrado: ${e.message}`, 'error'));
  }

  await iniciarSesionGoogle();
  pintarSesion();
  await continuarTrasRedireccion();
  pintarDiagnostico();
}

iniciar().catch((e) => registrar(`Error al iniciar: ${e.message}`, 'error'));
