// Pantalla del lector (punto 8 del diseño): controles, índice, panel "Aa",
// guardado de la posición y registro de sesiones.
//
// Controles al estilo de Libros de Apple: al tocar el centro aparecen botones
// flotantes (cerrar arriba y menú abajo). El menú abre Contenido, Temas y
// ajustes, y Sincronizar.

import { abrirLibro, AperturaCancelada, MENSAJE_LIBRO_ILEGIBLE } from './lector.js';
import { leerLibro, leerArchivo, leerUbicaciones, guardarUbicaciones } from '../datos/libros.js';
import { leerProgreso, guardarProgreso, cambiarEstado } from '../datos/progreso.js';
import { RegistroSesiones } from '../datos/sesiones.js';
import {
  preferencias, cambiarLectura, nombreDispositivo, idDispositivo, alCambiarPreferencias,
} from '../datos/preferencias.js';
import {
  TEMAS, TAMANOS, FUENTES, INTERLINEADOS, MARGENES, JUSTIFICACIONES, idTemaElegido, alCambiarModoSistema,
} from '../ui/temas.js';
import { registrar } from '../ui/registro.js';
import { leerSincronizacion } from '../datos/pendientes.js';
import { mostrarHoja } from '../ui/hoja.js';
import { cargarRitmo, anotarPagina, reiniciarReferencia, tiempoRestante } from './ritmo.js';
import {
  abrirCapa, cerrarCapa, capaAbierta, cerrarDeslizando,
} from '../ui/paneles.js';
import { svgIcono } from '../ui/iconos.js';

const $ = (id) => document.getElementById(id);
const MARGEN_REPAGINADO_MS = 2000;
const ESPERA_AJUSTES_MS = 250;

let actual = null; // { id, motor, sesiones, progreso, ultimoCfi, repaginandoHasta }
let alCerrar = () => {};
// Cada apertura o cierre incrementa el turno. Una apertura que termina cuando
// ya no es el turno vigente (otro toque, o se cerró mientras se abría) se descarta.
let turno = 0;

const PANELES = ['panel-menu', 'panel-indice', 'panel-aa'];

function controlesVisibles(visibles) {
  if (visibles) abrirCapa($('controles-lector'));
  else cerrarCapa($('controles-lector'));
}

function hayPanelAbierto() {
  return PANELES.some((id) => capaAbierta($(id)));
}

// Para el botón Atrás de Android: cierra el panel abierto, si lo hay.
export function cerrarPanelAbierto() {
  if (!actual || !hayPanelAbierto()) return false;
  cerrarPaneles();
  return true;
}

function cerrarPaneles() {
  PANELES.forEach((id) => cerrarCapa($(id)));
  cerrarCapa($('fondo-panel'));
}

function abrirPanel(id) {
  PANELES.filter((p) => p !== id).forEach((p) => cerrarCapa($(p)));
  abrirCapa($('fondo-panel'));
  abrirCapa($(id));
}

// Por ejemplo: "45 %. Capítulo: 3 páginas, 4 min. Libro: 3 h 20 min".
function textoProgreso(info) {
  const partes = [];
  if (info.porcentaje != null) partes.push(`${Math.round(info.porcentaje * 100)} %`);
  const queda = tiempoRestante(info);
  if (info.paginasRestantesCapitulo != null) {
    const n = info.paginasRestantesCapitulo;
    const paginas = n === 0 ? 'última página' : `${n} ${n === 1 ? 'página' : 'páginas'}`;
    partes.push(`Capítulo: ${paginas}${queda.capitulo ? `, ${queda.capitulo}` : ''}`);
  }
  if (queda.libro) partes.push(`Libro: ${queda.libro}`);
  return partes.join('. ');
}

async function alCambiarPosicion(info) {
  const a = actual; // la pantalla puede cerrarse durante una escritura
  if (!a) return;
  a.info = info;
  $('info-capitulo').textContent = info.capitulo || a.titulo;
  $('info-progreso').textContent = textoProgreso(info);
  if (!$('panel-indice').hidden) pintarIndice();

  const p = a.progreso;
  const porcentaje = info.porcentaje ?? p?.porcentaje ?? null;
  const datos = (cfi, estado) => ({
    cfi,
    porcentaje,
    capitulo: info.capitulo,
    estado,
    fechaTerminado: estado === 'terminado' ? (p?.fechaTerminado || null) : null,
    dispositivo: nombreDispositivo(),
    dispositivoId: idDispositivo(),
  });

  // Al abrir y al repaginar por un cambio de ajustes, el punto de lectura no
  // cambia aunque el CFI de inicio de página sí lo haga. No se guarda como
  // avance, para no alterar la posición que recibirá el otro dispositivo.
  const mismaPosicion = Date.now() < a.repaginandoHasta || info.cfi === a.ultimoCfi;
  anotarPagina(info, { contar: !mismaPosicion });
  if (mismaPosicion) {
    a.ultimoCfi = info.cfi; // referencia para detectar el siguiente paso de página
    // Abrir sin pasar página no es un avance: se guarda sin fecha (provisional)
    // para no pisar en Drive la posición del otro dispositivo.
    if (!p) {
      a.progreso = await guardarProgreso(a.id, datos(info.cfi, 'leyendo'), { provisional: true });
    } else if (p.estado === 'pendiente') {
      a.progreso = await guardarProgreso(a.id, { ...p, ...datos(p.cfi || info.cfi, 'leyendo') }, { provisional: !p.fecha });
    } else if (porcentaje !== p.porcentaje) {
      a.progreso = await guardarProgreso(a.id, { ...p, porcentaje }, { mantenerFecha: true });
    }
    return;
  }

  a.ultimoCfi = info.cfi;
  const estado = p?.estado === 'terminado' ? 'terminado' : 'leyendo';
  a.progreso = await guardarProgreso(a.id, datos(info.cfi, estado));
  if (actual === a) a.sesiones.paginaPasada(); // si se ha cerrado, la sesión ya terminó
  if (info.final && estado !== 'terminado' && !a.propuestoTerminar && actual === a) proponerTerminar(a);
}

// Al llegar a la última página se propone marcar el libro como terminado
// (una vez por apertura).
async function proponerTerminar(a) {
  a.propuestoTerminar = true;
  const eleccion = await mostrarHoja(`Has llegado al final de "${a.titulo}".`, [
    { id: 'terminar', texto: 'Marcar como terminado' },
  ]);
  if (eleccion !== 'terminar' || actual !== a) return;
  a.progreso = await cambiarEstado(a.id, 'terminado');
  registrar(`"${a.titulo}" terminado`);
}

// --- Índice ---

function pintarIndice() {
  const lista = $('lista-indice');
  lista.replaceChildren();
  const seccionActual = actual.info?.seccion ?? -1;
  // El capítulo actual es la última entrada cuya sección no supera la actual.
  let marcado = -1;
  actual.motor.indice.forEach((e, i) => {
    if (e.seccion !== null && e.seccion <= seccionActual) marcado = i;
  });
  actual.motor.indice.forEach((entrada, i) => {
    const li = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    const texto = document.createElement('span');
    texto.textContent = entrada.etiqueta;
    boton.appendChild(texto);
    boton.style.paddingLeft = `${16 + entrada.nivel * 18}px`;
    if (i === marcado) {
      boton.classList.add('actual');
      boton.setAttribute('aria-current', 'true');
      boton.insertAdjacentHTML('beforeend', svgIcono('check'));
    }
    boton.addEventListener('click', async () => {
      cerrarPaneles();
      controlesVisibles(false);
      await actual.motor.irA(entrada.href);
    });
    li.appendChild(boton);
    lista.appendChild(li);
  });
  if (!actual.motor.indice.length) {
    const li = document.createElement('li');
    li.className = 'fila';
    li.textContent = 'Este libro no tiene índice.';
    lista.appendChild(li);
  }
  return marcado;
}

function abrirIndice() {
  const marcado = pintarIndice();
  abrirPanel('panel-indice');
  if (marcado >= 0) $('lista-indice').children[marcado]?.scrollIntoView({ block: 'center' });
}

// --- Temas y ajustes ("Aa") ---

function boton(texto, clase, alPulsar) {
  const b = document.createElement('button');
  b.type = 'button';
  if (clase) b.className = clase;
  b.textContent = texto;
  b.addEventListener('click', alPulsar);
  return b;
}

// Fila con etiqueta encima y control segmentado de iOS a todo el ancho.
function filaSegmentada(titulo, opciones, valorActual, alElegir) {
  const fila = document.createElement('div');
  fila.className = 'fila fila-columna';
  const etiqueta = document.createElement('span');
  etiqueta.className = 'etiqueta-ajuste';
  etiqueta.textContent = titulo;
  const control = document.createElement('div');
  control.className = 'segmentado';
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', titulo);
  for (const o of opciones) {
    const b = boton(o.nombre, '', () => alElegir(o.id));
    b.setAttribute('aria-pressed', String(o.id === valorActual));
    control.appendChild(b);
  }
  fila.append(etiqueta, control);
  return fila;
}

function pintarPanelAa() {
  const { dispositivo, lectura } = preferencias();
  const perfil = dispositivo.perfil;
  const panel = $('panel-aa');
  panel.replaceChildren();

  const asa = document.createElement('div');
  asa.className = 'asa';
  const cabecera = document.createElement('div');
  cabecera.className = 'hoja-cabecera';
  const h = document.createElement('h2');
  h.textContent = 'Temas y ajustes';
  const cerrar = boton('', 'boton-redondo pequeno', cerrarPaneles);
  cerrar.innerHTML = svgIcono('cerrar');
  cerrar.setAttribute('aria-label', 'Cerrar');
  cabecera.append(h, cerrar);
  panel.append(asa, cabecera);

  // Tamaño de letra
  const posicion = TAMANOS.indexOf(lectura.tamano);
  // El tamaño se lee al pulsar, no al pintar: dos toques rápidos suman dos pasos.
  const cambiarTamano = (paso) => {
    const i = TAMANOS.indexOf(preferencias().lectura.tamano);
    const nuevo = TAMANOS[Math.min(TAMANOS.length - 1, Math.max(0, i + paso))];
    cambiarLectura({ tamano: nuevo });
  };
  const filaTamano = document.createElement('div');
  filaTamano.className = 'aa-tamano';
  const pastilla = document.createElement('div');
  pastilla.className = 'pastilla';
  const menor = boton('', '', () => cambiarTamano(-1));
  menor.innerHTML = '<span style="font-size:15px">A</span>';
  menor.setAttribute('aria-label', 'Letra más pequeña');
  menor.disabled = posicion <= 0;
  const mayor = boton('', '', () => cambiarTamano(1));
  mayor.innerHTML = '<span style="font-size:24px">A</span>';
  mayor.setAttribute('aria-label', 'Letra más grande');
  mayor.disabled = posicion >= TAMANOS.length - 1;
  pastilla.append(menor, mayor);
  const valor = document.createElement('span');
  valor.className = 'aa-valor';
  valor.textContent = `${lectura.tamano} %`;
  filaTamano.append(pastilla, valor);
  panel.appendChild(filaTamano);

  // Temas como muestras de color
  const claveTema = perfil === 'tinta' ? 'temaTinta' : 'temaMovil';
  const temaActual = idTemaElegido(perfil, lectura);
  const temas = document.createElement('div');
  temas.className = 'aa-temas';
  for (const tema of TEMAS[perfil]) {
    const muestra = boton('', 'muestra', () => cambiarLectura({ [claveTema]: tema.id }));
    muestra.setAttribute('aria-pressed', String(tema.id === temaActual));
    const caja = document.createElement('span');
    caja.className = 'm-caja';
    caja.textContent = 'Aa';
    if (tema.fondo) {
      caja.style.background = tema.fondo;
      caja.style.color = tema.texto;
    } else {
      caja.classList.add('automatica');
    }
    const nombre = document.createElement('span');
    nombre.textContent = tema.nombre;
    muestra.append(caja, nombre);
    temas.appendChild(muestra);
  }
  panel.appendChild(temas);

  // Fuentes, con cada nombre en su tipo de letra
  const fuentes = document.createElement('div');
  fuentes.className = 'grupo';
  for (const f of FUENTES) {
    const fila = boton('', 'fila fila-fuente', () => cambiarLectura({ fuente: f.id }));
    fila.setAttribute('aria-pressed', String(f.id === lectura.fuente));
    const nombre = document.createElement('span');
    nombre.textContent = f.id === 'original' ? 'Original del libro' : f.nombre;
    if (f.familia) nombre.style.fontFamily = f.familia;
    fila.appendChild(nombre);
    if (f.id === lectura.fuente) fila.insertAdjacentHTML('beforeend', svgIcono('check'));
    fuentes.appendChild(fila);
  }
  panel.appendChild(fuentes);

  const formato = document.createElement('div');
  formato.className = 'grupo';
  formato.append(
    filaSegmentada('Interlineado', INTERLINEADOS, lectura.interlineado, (id) => cambiarLectura({ interlineado: id })),
    filaSegmentada('Márgenes', MARGENES, lectura.margenes, (id) => cambiarLectura({ margenes: id })),
    filaSegmentada('Justificación', JUSTIFICACIONES, lectura.justificacion, (id) => cambiarLectura({ justificacion: id })),
  );
  // Doble página con la pantalla en horizontal: solo en pantallas grandes.
  if (Math.min(window.screen.width, window.screen.height) >= 500) {
    formato.appendChild(filaSegmentada('Dos páginas en horizontal', [
      { id: 'si', nombre: 'Sí' }, { id: 'no', nombre: 'No' },
    ], lectura.dosPaginas === false ? 'no' : 'si', (id) => cambiarLectura({ dosPaginas: id === 'si' })));
  }
  panel.appendChild(formato);
}

function abrirPanelAa() {
  pintarPanelAa();
  abrirPanel('panel-aa');
}

// Los cambios de ajustes se agrupan: varios toques seguidos en A+ provocan un
// solo repaginado. El panel se repinta al momento.
let temporizadorAjustes = null;

function aplicarPreferencias() {
  if (!actual) return;
  if (capaAbierta($('panel-aa'))) pintarPanelAa();
  clearTimeout(temporizadorAjustes);
  temporizadorAjustes = setTimeout(() => {
    if (!actual?.motor) return;
    const { dispositivo, lectura } = preferencias();
    actual.motor.aplicarAjustes(dispositivo.perfil, lectura);
  }, ESPERA_AJUSTES_MS);
}

// --- Abrir y cerrar ---

// Punto 8.3 del diseño: si la última posición sincronizada de otro dispositivo
// es más reciente y distinta, se ofrece ir allí. Devuelve el progreso con el
// que abrir el libro.
async function decidirPosicion(id, local) {
  const remota = (await leerSincronizacion('progresoRemoto'))?.progreso?.[id];
  // Se compara por identificador de dispositivo; las entradas antiguas, sin
  // identificador, por nombre.
  const esDeOtro = remota?.cfi && (remota.dispositivoId
    ? remota.dispositivoId !== idDispositivo()
    : remota.dispositivo && remota.dispositivo !== nombreDispositivo());
  const masReciente = remota && (remota.fecha || '') > (local?.fecha || '');
  if (!esDeOtro || !masReciente || remota.cfi === local?.cfi) return local;

  const porcentaje = remota.porcentaje != null ? ` (${Math.round(remota.porcentaje * 100)} %)` : '';
  const donde = remota.capitulo ? `hasta "${remota.capitulo}"` : 'más adelante';
  const fecha = new Date(remota.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  const eleccion = await mostrarHoja(
    `Leíste ${donde}${porcentaje} en el ${remota.dispositivo} el ${fecha}. ¿Continuar allí?`,
    [
      { id: 'ir', texto: 'Ir allí' },
      { id: 'quedarme', texto: 'Quedarme aquí' },
    ],
  );
  if (eleccion === 'ir') {
    registrar(`Posición del ${remota.dispositivo} aceptada`);
    // Se conserva la fecha remota: es la misma lectura, no un avance nuevo.
    return guardarProgreso(id, { ...remota }, { mantenerFecha: true });
  }
  if (eleccion === 'quedarme' && local) {
    // La posición local pasa a ser la más reciente para que gane al sincronizar.
    registrar('Se mantiene la posición de este dispositivo');
    return guardarProgreso(id, { ...local, dispositivo: nombreDispositivo(), dispositivoId: idDispositivo() });
  }
  return local; // cancelar no cambia nada
}

export async function abrirPantallaLector(id) {
  if (actual) await cerrarPantallaLector();
  const miTurno = ++turno;
  const cancelado = () => miTurno !== turno;
  const [libro, datos, progresoLocal, ubicaciones] = await Promise.all([
    leerLibro(id), leerArchivo(id), leerProgreso(id), leerUbicaciones(id),
  ]);
  if (!libro || !datos) throw new Error('El archivo de este libro no está en el dispositivo.');
  const progreso = await decidirPosicion(id, progresoLocal);
  if (cancelado()) throw new AperturaCancelada();

  document.body.classList.add('leyendo');
  $('lector').hidden = false;
  $('controles-lector').hidden = true;
  $('controles-lector').classList.remove('abierta');
  cerrarPaneles();
  $('titulo-libro').textContent = libro.titulo;
  $('menu-titulo').textContent = libro.titulo;
  $('info-capitulo').textContent = libro.titulo;
  $('info-progreso').textContent = '';

  reiniciarReferencia();
  const sesiones = new RegistroSesiones(id, nombreDispositivo());
  const nuevo = {
    id,
    titulo: libro.titulo,
    motor: null,
    sesiones,
    progreso: progreso || null,
    ultimoCfi: progreso?.cfi || null,
    repaginandoHasta: Infinity, // hasta que termine la apertura
    info: null,
  };
  actual = nuevo;
  const { dispositivo, lectura } = preferencias();
  try {
    nuevo.motor = await abrirLibro($('visor'), datos, {
      perfil: dispositivo.perfil,
      ajustes: lectura,
      cfiInicial: progreso?.cfi || null,
      ubicaciones: ubicaciones || null,
      cancelado,
      avisos: {
        alCambiarPosicion,
        alTocarCentro: () => {
          if (hayPanelAbierto()) cerrarPaneles();
          else controlesVisibles(!capaAbierta($('controles-lector')));
        },
        alDeslizarAbajo: () => alCerrar(),
        alGenerarUbicaciones: (json) => guardarUbicaciones(id, json),
        // Repaginar (ajustes o giro de pantalla) no es pasar página.
        alRepaginar: () => {
          if (actual === nuevo && nuevo.repaginandoHasta !== Infinity) {
            nuevo.repaginandoHasta = Date.now() + MARGEN_REPAGINADO_MS;
          }
        },
      },
    });
  } catch (e) {
    if (actual === nuevo) {
      actual = null;
      $('visor').replaceChildren();
      $('lector').hidden = true;
      document.body.classList.remove('leyendo');
    }
    if (e instanceof AperturaCancelada) throw e;
    throw new Error(e.message || MENSAJE_LIBRO_ILEGIBLE);
  }
  nuevo.repaginandoHasta = Date.now() + 500;
  sesiones.iniciar();
}

export function idLibroAbierto() {
  return actual?.id || null;
}

export async function cerrarPantallaLector() {
  turno += 1; // cancela una apertura en curso
  clearTimeout(temporizadorAjustes);
  if (!actual) return;
  const cerrado = actual;
  actual = null;
  cerrarPaneles();
  $('controles-lector').hidden = true;
  cerrado.motor?.destruir();
  $('visor').replaceChildren();
  $('lector').hidden = true;
  document.body.classList.remove('leyendo');
  await cerrado.sesiones.cerrar();
  registrar(`Libro cerrado: "${cerrado.titulo}"`);
}

export function lectorAbierto() {
  return Boolean(actual);
}

export function prepararPantallaLector({ cerrar }) {
  alCerrar = cerrar;
  cargarRitmo().catch(() => {});
  $('btn-cerrar-libro').addEventListener('click', () => alCerrar());
  $('btn-menu-lector').addEventListener('click', () => abrirPanel('panel-menu'));
  $('btn-indice').addEventListener('click', abrirIndice);
  $('btn-cerrar-indice').addEventListener('click', cerrarPaneles);
  $('btn-aa').addEventListener('click', abrirPanelAa);
  $('btn-sincronizar-lector').addEventListener('click', cerrarPaneles);
  $('fondo-panel').addEventListener('click', cerrarPaneles);
  for (const id of PANELES) cerrarDeslizando($(id), cerrarPaneles, $('fondo-panel'));
  alCambiarPreferencias((_, tipo) => {
    if (tipo === 'lectura') aplicarPreferencias();
  });
  alCambiarModoSistema(() => {
    const { dispositivo, lectura } = preferencias();
    if (dispositivo.perfil === 'movil' && lectura.temaMovil === 'automatico') aplicarPreferencias();
  });
}
