// Pantalla del lector (punto 8 del diseño): controles, índice, panel "Aa",
// guardado de la posición y registro de sesiones.
//
// Controles al estilo de Libros de Apple: al tocar el centro aparecen botones
// flotantes (cerrar arriba y menú abajo). El menú abre Contenido, Temas y
// ajustes, y Sincronizar.

import { abrirLibro, AperturaCancelada, MENSAJE_LIBRO_ILEGIBLE } from './lector.js';
import {
  leerLibro, leerArchivo, leerUbicaciones, guardarUbicaciones, valorarLibro,
} from '../datos/libros.js';
import { leerProgreso, guardarProgreso, cambiarEstado } from '../datos/progreso.js';
import { RegistroSesiones } from '../datos/sesiones.js';
import { comprobarMetaDiaria } from '../estadisticas/meta-diaria.js';
import { anotacionesDeLibro, crearMarcador, eliminarAnotacion } from '../datos/anotaciones.js';
import { mostrarAviso } from '../ui/aviso.js';
import {
  preferencias, nombreDispositivo, idDispositivo, alCambiarPreferencias,
  lecturaDeLibro, tieneAjustesPropios, activarAjustesPropios, cambiarLecturaDeLibro,
} from '../datos/preferencias.js';
import {
  TEMAS, TAMANOS, FUENTES, INTERLINEADOS, MARGENES, JUSTIFICACIONES, idTemaElegido, alCambiarModoSistema,
} from '../ui/temas.js';
import { registrar } from '../ui/registro.js';
import { leerSincronizacion } from '../datos/pendientes.js';
import { mostrarHoja, mostrarTexto, hojaAbierta } from '../ui/hoja.js';
import { sincronizacionEnCurso } from '../sync/sincronizar.js';
import { cargarRitmo, anotarPagina, reiniciarReferencia, tiempoRestante } from './ritmo.js';
import {
  abrirCapa, cerrarCapa, capaAbierta, cerrarDeslizando,
} from '../ui/paneles.js';
import { svgIcono } from '../ui/iconos.js';

const $ = (id) => document.getElementById(id);
const MARGEN_REPAGINADO_MS = 2000;
const ESPERA_AJUSTES_MS = 250;
const ESPERA_SINCRONIZACION_MS = 3000; // al abrir un libro con la sincronización en marcha

let actual = null; // { id, motor, sesiones, progreso, ultimoCfi, repaginandoHasta }
let alCerrar = () => {};
// Cada apertura o cierre incrementa el turno. Una apertura que termina cuando
// ya no es el turno vigente (otro toque, o se cerró mientras se abría) se descarta.
let turno = 0;

const PANELES = ['panel-menu', 'panel-indice', 'panel-buscar', 'panel-marcadores', 'panel-aa'];

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

// --- Marcadores (v4) ---

async function cargarMarcadores(a = actual) {
  if (!a) return;
  a.marcadores = await anotacionesDeLibro(a.id, 'marcador');
  pintarBotonMarcador();
}

function marcadoresDePagina() {
  const a = actual;
  if (!a?.motor || !a.marcadores) return [];
  return a.marcadores.filter((m) => a.motor.enPaginaActual(m.cfi));
}

function pintarBotonMarcador() {
  const hay = marcadoresDePagina().length > 0;
  const boton = $('btn-marcador');
  boton.setAttribute('aria-pressed', String(hay));
  boton.setAttribute('aria-label', hay ? 'Quitar el marcador de esta página' : 'Añadir marcador');
}

let marcadorOcupado = false;

async function alternarMarcador() {
  const a = actual;
  if (!a?.motor || marcadorOcupado) return; // doble toque (habitual en tinta)
  marcadorOcupado = true;
  try {
    await alternarMarcadorAhora(a);
  } finally {
    marcadorOcupado = false;
  }
}

async function alternarMarcadorAhora(a) {
  const enPagina = marcadoresDePagina();
  if (enPagina.length) {
    for (const m of enPagina) await eliminarAnotacion(m.id);
    registrar(`Marcador quitado en "${a.titulo}"`);
  } else {
    const datos = a.motor.datosPaginaActual();
    if (!datos) return;
    await crearMarcador(a.id, datos);
    registrar(`Marcador añadido en "${a.titulo}" (${datos.capitulo || ''})`);
    mostrarAviso('Marcador añadido.', 1800);
  }
  await cargarMarcadores(a);
}

// Tras sincronizar, por si llegan marcadores del otro dispositivo.
export function refrescarMarcadores() {
  return cargarMarcadores();
}

function pintarMarcadores() {
  const a = actual;
  const lista = $('lista-marcadores');
  lista.replaceChildren();
  const marcadores = [...(a?.marcadores || [])].sort((x, y) => (x.porcentaje ?? 0) - (y.porcentaje ?? 0));
  $('marcadores-vacio').hidden = marcadores.length > 0;
  for (const m of marcadores) {
    const li = document.createElement('li');
    li.className = 'marcador-fila';
    const ir = document.createElement('button');
    ir.type = 'button';
    const cabecera = document.createElement('span');
    cabecera.className = 'resultado-capitulo';
    const pct = m.porcentaje != null ? `${Math.round(m.porcentaje * 100)} %` : '';
    const fecha = new Date(m.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
    cabecera.textContent = [m.capitulo, pct, fecha].filter(Boolean).join(', ');
    const texto = document.createElement('span');
    texto.className = 'resultado-texto';
    texto.textContent = m.texto ? `${m.texto}...` : 'Página guardada';
    ir.append(cabecera, texto);
    ir.addEventListener('click', async () => {
      cerrarPaneles();
      controlesVisibles(false);
      await saltar(m.cfi);
    });
    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.className = 'marcador-quitar';
    quitar.setAttribute('aria-label', 'Quitar este marcador');
    quitar.innerHTML = svgIcono('papelera');
    quitar.addEventListener('click', async () => {
      await eliminarAnotacion(m.id);
      await cargarMarcadores(a);
      pintarMarcadores();
    });
    li.append(ir, quitar);
    lista.appendChild(li);
  }
}

async function abrirMarcadores() {
  await cargarMarcadores();
  pintarMarcadores();
  abrirPanel('panel-marcadores');
}

// --- Volver a donde estabas (punto 2) ---
// Tras un salto (índice, búsqueda, barra, marcador o enlace del libro) aparece
// un botón para regresar. Después de regresar, el mismo botón permite ir otra
// vez al destino. Desaparece al pasar varias páginas o al cerrar el libro.
const PASOS_PARA_OCULTAR_VOLVER = 5;
const MARGEN_SALTO_MS = 1200; // el propio salto también avisa de la nueva posición

function pintarVolver() {
  const v = actual?.volver;
  $('btn-volver-lectura').hidden = !v;
  if (v) $('texto-volver').textContent = v.etiqueta;
}

function anotarSalto(a, cfi, info) {
  if (!a || !cfi) return;
  const donde = info?.capitulo ? `«${info.capitulo}»` : 'la página anterior';
  const pct = info?.porcentaje != null ? `, ${Math.round(info.porcentaje * 100)} %` : '';
  a.volver = { cfi, etiqueta: `Volver a ${donde}${pct}`, desde: Date.now(), pasos: 0 };
  pintarVolver();
}

// Salto a otra parte del libro, recordando de dónde se sale.
async function saltar(destino) {
  const a = actual;
  if (!a?.motor) return;
  const volverAntes = a.volver;
  if (a.info?.cfi) anotarSalto(a, a.info.cfi, a.info);
  try {
    await a.motor.irA(destino);
  } catch (e) {
    // El salto no se ha hecho: el botón de volver no debe apuntar a él.
    a.volver = volverAntes;
    pintarVolver();
    registrar(`Lector: no se pudo ir al destino (${e.message})`, 'error');
  }
}

async function volver() {
  const a = actual;
  const v = a?.volver;
  // Doble toque (habitual en tinta): el segundo llegaría con la posición de
  // partida y borraría el camino de vuelta. Se libera al llegar.
  if (!v || !a.motor || a.volviendo) return;
  a.volviendo = true;
  registrar('Lector: vuelta a la posición anterior al salto');
  if (a.info?.cfi) anotarSalto(a, a.info.cfi, a.info);
  else a.volver = null;
  try {
    await a.motor.irA(v.cfi);
  } catch (e) {
    a.volviendo = false;
    a.volver = v;
    pintarVolver();
    registrar(`Lector: no se pudo volver (${e.message})`, 'error');
  }
}

// Cada paso de página normal cuenta para ocultar el botón.
function contarPasoParaVolver(a) {
  const v = a.volver;
  if (!v || Date.now() - v.desde < MARGEN_SALTO_MS) return;
  v.pasos += 1;
  if (v.pasos >= PASOS_PARA_OCULTAR_VOLVER) {
    a.volver = null;
    pintarVolver();
  }
}

// --- Barra para recorrer el libro (punto 3) ---
// Mientras se arrastra, la tarjeta muestra el capítulo y el porcentaje de
// destino; al soltar, se salta allí.
let arrastrandoBarra = false;

function pintarBarra(info) {
  const barra = $('barra-libro');
  const lista = Boolean(actual?.motor?.hayUbicaciones());
  barra.disabled = !lista;
  barra.title = lista ? '' : 'Calculando las páginas del libro...';
  if (!arrastrandoBarra && info?.porcentaje != null) barra.value = String(Math.round(info.porcentaje * 1000));
}

function previsualizarBarra() {
  const a = actual;
  if (!a) return;
  arrastrandoBarra = true;
  const proporcion = Number($('barra-libro').value) / 1000;
  const destino = a.motor.destinoDePorcentaje(proporcion);
  $('info-capitulo').textContent = destino?.capitulo || a.titulo;
  $('info-progreso').textContent = `Ir al ${Math.round(proporcion * 100)} %`;
}

function pintarInfo(a, info) {
  $('info-capitulo').textContent = info.capitulo || a.titulo;
  $('info-progreso').textContent = textoProgreso(info);
}

function terminarArrastreBarra() {
  if (!arrastrandoBarra || !actual?.info) return;
  arrastrandoBarra = false;
  pintarInfo(actual, actual.info);
  pintarBarra(actual.info);
}

async function saltarConBarra() {
  const a = actual;
  if (!a) return;
  const destino = a.motor.destinoDePorcentaje(Number($('barra-libro').value) / 1000);
  arrastrandoBarra = false;
  if (!destino) return;
  registrar(`Barra del libro: salto al ${Math.round((Number($('barra-libro').value) / 1000) * 100)} %`);
  await saltar(destino.cfi);
}

async function alCambiarPosicion(info) {
  const a = actual; // la pantalla puede cerrarse durante una escritura
  if (!a) return;
  a.info = info;
  a.volviendo = false;
  if (!arrastrandoBarra) pintarInfo(a, info);
  pintarBarra(info);
  pintarBotonMarcador();
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
  contarPasoParaVolver(a);
  const estado = p?.estado === 'terminado' ? 'terminado' : 'leyendo';
  a.progreso = await guardarProgreso(a.id, datos(info.cfi, estado));
  if (actual === a) a.sesiones.paginaPasada().then(comprobarMetaDiaria); // si se ha cerrado, la sesión ya terminó
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
  // Punto 5: se propone valorarlo.
  const estrellas = await mostrarHoja(`¿Qué te ha parecido "${a.titulo}"?`, [5, 4, 3, 2, 1].map((n) => ({
    id: String(n), texto: `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`,
  })));
  if (!estrellas) return;
  await valorarLibro(a.id, { estrellas: Number(estrellas) });
  registrar(`"${a.titulo}" valorado con ${estrellas} estrellas`);
}

// --- Índice ---

function pintarIndice() {
  const lista = $('lista-indice');
  lista.replaceChildren();
  const seccionActual = actual.info?.seccion ?? -1;
  // El capítulo actual: la entrada que da el lector (tiene en cuenta las anclas
  // dentro de un mismo archivo) o, si no, la última cuya sección no supera la
  // actual.
  let marcado = actual.info?.entrada ?? -1;
  if (marcado < 0) {
    actual.motor.indice.forEach((e, i) => {
      if (e.seccion !== null && e.seccion <= seccionActual) marcado = i;
    });
  }
  actual.motor.indice.forEach((entrada, i) => {
    const li = document.createElement('li');
    // Un título sin enlace ni capítulos con enlace debajo no lleva a ningún
    // sitio: se muestra como texto, no como botón.
    const boton = document.createElement(entrada.destino ? 'button' : 'div');
    if (entrada.destino) boton.type = 'button';
    else boton.className = 'indice-titulo';
    const texto = document.createElement('span');
    texto.textContent = entrada.etiqueta;
    boton.appendChild(texto);
    boton.style.paddingLeft = `${16 + entrada.nivel * 18}px`;
    if (i === marcado) {
      boton.classList.add('actual');
      boton.setAttribute('aria-current', 'true');
      boton.insertAdjacentHTML('beforeend', svgIcono('check'));
    }
    if (entrada.destino) {
      boton.addEventListener('click', async () => {
        cerrarPaneles();
        controlesVisibles(false);
        await saltar(entrada.destino);
      });
    }
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

// --- Buscar en el libro (v4) ---

const busqueda = { texto: '', numero: 0, libro: null, completa: false };
let temporizadorBusqueda = null;

function fragmento(r) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  const capitulo = document.createElement('span');
  capitulo.className = 'resultado-capitulo';
  capitulo.textContent = r.capitulo || '';
  const texto = document.createElement('span');
  texto.className = 'resultado-texto';
  const marca = document.createElement('mark');
  marca.textContent = r.coincidencia;
  texto.append(`${r.cortadoAntes ? '...' : ''}${r.antes}`, marca, `${r.despues}${r.cortadoDespues ? '...' : ''}`);
  b.append(capitulo, texto);
  b.addEventListener('click', async () => {
    const a = actual;
    if (!a) return;
    cerrarPaneles();
    controlesVisibles(false);
    await saltar(r.cfi);
    if (actual === a) a.motor.resaltar(r.cfi);
  });
  li.appendChild(b);
  return li;
}

async function lanzarBusqueda() {
  const a = actual;
  if (!a) return;
  const texto = $('buscar-en-libro').value.trim();
  // La misma búsqueda no se repite si terminó (sí si se cortó al cerrar el libro).
  if (texto === busqueda.texto && busqueda.libro === a.id && busqueda.completa) return;
  const numero = ++busqueda.numero;
  busqueda.texto = texto;
  busqueda.libro = a.id;
  busqueda.completa = false;
  const lista = $('lista-busqueda');
  const estado = $('estado-busqueda');
  lista.replaceChildren();
  if (texto.length < 2) {
    estado.textContent = texto ? 'Escribe al menos dos letras.' : '';
    busqueda.completa = true;
    return;
  }
  const vigente = () => numero === busqueda.numero && actual === a;
  let total = 0;
  estado.textContent = 'Buscando...';
  await a.motor.buscar(texto, {
    cancelado: () => !vigente(),
    alAvanzar: (i, n) => {
      if (vigente()) estado.textContent = `Buscando... capítulo ${i} de ${n}.${total ? ` ${total === 1 ? '1 resultado' : `${total} resultados`}.` : ''}`;
    },
    alResultados: (resultados) => {
      if (!vigente()) return;
      total += resultados.length;
      lista.append(...resultados.map(fragmento));
    },
  });
  if (!vigente()) return;
  busqueda.completa = true;
  estado.textContent = total
    ? (total >= 300 ? 'Más de 300 resultados: se muestran los 300 primeros.' : `${total === 1 ? '1 resultado' : `${total} resultados`}`)
    : `No se ha encontrado "${texto}".`;
  registrar(`Búsqueda en el libro: "${texto}", ${total} resultados`);
}

function abrirBuscar() {
  // Al cambiar de libro, la búsqueda anterior no vale.
  if (busqueda.libro !== actual?.id) {
    $('buscar-en-libro').value = '';
    $('lista-busqueda').replaceChildren();
    $('estado-busqueda').textContent = '';
    busqueda.texto = '';
  }
  abrirPanel('panel-buscar');
  setTimeout(() => $('buscar-en-libro').focus(), 350);
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
function filaSegmentada(titulo, opciones, valorActual, alElegir, clave) {
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
    if (clave) {
      b.dataset.ajuste = clave;
      b.dataset.valor = o.id;
    }
    control.appendChild(b);
  }
  fila.append(etiqueta, control);
  return fila;
}

// Ajustes de lectura del libro abierto: los propios si los tiene.
function lecturaActual() {
  return actual ? lecturaDeLibro(actual.id) : preferencias().lectura;
}

function cambiarLectura(cambios) {
  return cambiarLecturaDeLibro(actual?.id, cambios);
}

function pintarPanelAa() {
  const { dispositivo } = preferencias();
  const lectura = lecturaActual();
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
    const i = TAMANOS.indexOf(lecturaActual().tamano);
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
  menor.dataset.tamano = 'menos';
  menor.disabled = posicion <= 0;
  const mayor = boton('', '', () => cambiarTamano(1));
  mayor.innerHTML = '<span style="font-size:24px">A</span>';
  mayor.setAttribute('aria-label', 'Letra más grande');
  mayor.dataset.tamano = 'mas';
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
    muestra.dataset.ajuste = 'tema';
    muestra.dataset.valor = tema.id;
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
    fila.dataset.ajuste = 'fuente';
    fila.dataset.valor = f.id;
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
    filaSegmentada('Interlineado', INTERLINEADOS, lectura.interlineado, (id) => cambiarLectura({ interlineado: id }), 'interlineado'),
    filaSegmentada('Márgenes', MARGENES, lectura.margenes, (id) => cambiarLectura({ margenes: id }), 'margenes'),
    filaSegmentada('Justificación', JUSTIFICACIONES, lectura.justificacion, (id) => cambiarLectura({ justificacion: id }), 'justificacion'),
  );
  // Doble página con la pantalla en horizontal: solo en pantallas grandes.
  if (Math.min(window.screen.width, window.screen.height) >= 500) {
    formato.appendChild(filaSegmentada('Dos páginas en horizontal', [
      { id: 'si', nombre: 'Sí' }, { id: 'no', nombre: 'No' },
    ], lectura.dosPaginas === false ? 'no' : 'si', (id) => cambiarLectura({ dosPaginas: id === 'si' }), 'dosPaginas'));
  }
  panel.appendChild(formato);

  // Ajustes propios de este libro (punto 4)
  if (actual) {
    const propio = document.createElement('div');
    propio.className = 'grupo';
    const fila = document.createElement('label');
    fila.className = 'fila fila-interruptor';
    const texto = document.createElement('span');
    texto.textContent = 'Solo para este libro';
    const interruptor = document.createElement('input');
    interruptor.type = 'checkbox';
    interruptor.className = 'interruptor';
    interruptor.setAttribute('role', 'switch');
    interruptor.id = 'ajustes-propios';
    interruptor.checked = tieneAjustesPropios(actual.id);
    interruptor.addEventListener('change', () => {
      activarAjustesPropios(actual.id, interruptor.checked);
      registrar(`Ajustes propios de "${actual.titulo}": ${interruptor.checked ? 'activados' : 'desactivados'}`);
    });
    fila.append(texto, interruptor);
    propio.appendChild(fila);
    const pie = document.createElement('p');
    pie.className = 'pie-grupo';
    pie.id = 'pie-ajustes-propios';
    pie.textContent = textoAjustesPropios(interruptor.checked);
    panel.append(propio, pie);
  }
}

function textoAjustesPropios(activos) {
  return activos
    ? 'Tamaño, letra, interlineado, márgenes y justificación se aplican solo a este libro. El tema es común.'
    : 'Actívalo para que este libro tenga su propio tamaño, letra, interlineado, márgenes y justificación.';
}

// Con el panel abierto, cada toque cambia solo lo que corresponde, sin
// rehacer el panel: en tinta electrónica no se redibuja entero y un toque
// rápido no cae en un botón que se está sustituyendo.
function actualizarPanelAa() {
  const panel = $('panel-aa');
  if (!panel.querySelector('[data-ajuste]')) {
    pintarPanelAa();
    return;
  }
  const lectura = lecturaActual();
  const valores = {
    tema: idTemaElegido(preferencias().dispositivo.perfil, lectura),
    fuente: lectura.fuente,
    interlineado: lectura.interlineado,
    margenes: lectura.margenes,
    justificacion: lectura.justificacion,
    dosPaginas: lectura.dosPaginas === false ? 'no' : 'si',
  };
  for (const b of panel.querySelectorAll('[data-ajuste]')) {
    const marcado = String(valores[b.dataset.ajuste]) === b.dataset.valor;
    if (b.getAttribute('aria-pressed') !== String(marcado)) b.setAttribute('aria-pressed', String(marcado));
    if (b.dataset.ajuste === 'fuente') {
      const marca = b.querySelector('.icono');
      if (marcado && !marca) b.insertAdjacentHTML('beforeend', svgIcono('check'));
      else if (!marcado && marca) marca.remove();
    }
  }
  const i = TAMANOS.indexOf(lectura.tamano);
  panel.querySelector('[data-tamano="menos"]').disabled = i <= 0;
  panel.querySelector('[data-tamano="mas"]').disabled = i >= TAMANOS.length - 1;
  panel.querySelector('.aa-valor').textContent = `${lectura.tamano} %`;
  const interruptor = $('ajustes-propios');
  if (interruptor && actual) {
    interruptor.checked = tieneAjustesPropios(actual.id);
    $('pie-ajustes-propios').textContent = textoAjustesPropios(interruptor.checked);
  }
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
  if (capaAbierta($('panel-aa'))) actualizarPanelAa();
  clearTimeout(temporizadorAjustes);
  temporizadorAjustes = setTimeout(() => {
    if (!actual?.motor) return;
    actual.motor.aplicarAjustes(preferencias().dispositivo.perfil, lecturaActual());
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
  // Aunque no se adopte la posición remota, se conserva su estado (por
  // ejemplo, terminado en el otro dispositivo): si no, el primer paso de
  // página lo devolvería a "leyendo". Sin entrada local, se parte de la remota.
  // No se guarda aquí: la fecha local no cambia.
  let base = local;
  if (masReciente) {
    base = local
      ? { ...local, estado: remota.estado || local.estado, fechaTerminado: remota.fechaTerminado ?? null }
      : { ...remota, id };
  }
  if (!esDeOtro || !masReciente || remota.cfi === local?.cfi) return base;
  // Si se rechaza la posición del otro dispositivo sin tener una propia, se
  // empieza por el principio, pero con su estado (terminado).
  // Sin fecha (provisional): no debe pisar en Drive la posición remota.
  if (!local) base = remota.estado === 'terminado' ? { ...remota, id, cfi: null, porcentaje: null, capitulo: null, fecha: null } : null;

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
    return guardarProgreso(id, { ...base, dispositivo: nombreDispositivo(), dispositivoId: idDispositivo() });
  }
  return base; // cancelar no cambia nada
}

// Tras una sincronización con un libro abierto: si ha llegado una posición del
// otro dispositivo más reciente que la última de aquí, se ofrece ir allí, como
// al abrir. Cubre abrir el libro mientras la sincronización de entrada aún no
// había terminado y volver a la app con un libro abierto desde el día antes.
export async function revisarPosicionRemota() {
  const a = actual;
  if (!a?.motor || hojaAbierta()) return;
  const remota = (await leerSincronizacion('progresoRemoto'))?.progreso?.[a.id];
  const esDeOtro = remota?.cfi && (remota.dispositivoId
    ? remota.dispositivoId !== idDispositivo()
    : remota.dispositivo && remota.dispositivo !== nombreDispositivo());
  const conocida = [a.fechaAlAbrir, a.progreso?.fecha, a.remotaOfrecida].filter(Boolean).sort().pop() || '';
  if (!esDeOtro || (remota.fecha || '') <= conocida || remota.cfi === a.ultimoCfi) return;
  a.remotaOfrecida = remota.fecha; // una sola vez por cada posición recibida
  const porcentaje = remota.porcentaje != null ? ` (${Math.round(remota.porcentaje * 100)} %)` : '';
  const donde = remota.capitulo ? `hasta "${remota.capitulo}"` : 'más adelante';
  const fecha = new Date(remota.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
  const eleccion = await mostrarHoja(
    `Leíste ${donde}${porcentaje} en el ${remota.dispositivo} el ${fecha}. ¿Continuar allí?`,
    [{ id: 'ir', texto: 'Ir allí' }, { id: 'quedarme', texto: 'Quedarme aquí' }],
  );
  if (actual !== a || !a.motor) return;
  if (eleccion === 'ir') {
    registrar(`Posición del ${remota.dispositivo} aceptada tras sincronizar`);
    a.progreso = await guardarProgreso(a.id, { ...remota }, { mantenerFecha: true });
    a.repaginandoHasta = Date.now() + MARGEN_REPAGINADO_MS; // el salto no es un avance
    await a.motor.irA(remota.cfi);
  } else if (eleccion === 'quedarme') {
    registrar('Se mantiene la posición de este dispositivo');
    a.progreso = await guardarProgreso(a.id, {
      ...(a.progreso || {}), cfi: a.ultimoCfi, estado: remota.estado || a.progreso?.estado || 'leyendo',
      fechaTerminado: remota.fechaTerminado ?? null, dispositivo: nombreDispositivo(), dispositivoId: idDispositivo(),
    });
  }
}

export async function abrirPantallaLector(id) {
  if (actual) await cerrarPantallaLector();
  const miTurno = ++turno;
  const cancelado = () => miTurno !== turno;
  const [libro, datos, progresoLocal, ubicaciones] = await Promise.all([
    leerLibro(id), leerArchivo(id), leerProgreso(id), leerUbicaciones(id),
  ]);
  if (!libro || libro.eliminado) throw new Error('Este libro ya no está en la biblioteca.');
  if (!datos) throw new Error('El archivo de este libro no está en el dispositivo.');
  // Si la sincronización de entrada está en marcha, se espera un poco: puede
  // traer una posición más reciente del otro dispositivo.
  const enMarcha = sincronizacionEnCurso();
  if (enMarcha) await Promise.race([enMarcha.catch(() => {}), new Promise((r) => setTimeout(r, ESPERA_SINCRONIZACION_MS))]);
  if (cancelado()) throw new AperturaCancelada();
  const progreso = await decidirPosicion(id, progresoLocal);
  if (cancelado()) throw new AperturaCancelada();
  // La posición remota que había al abrir ya se ha tenido en cuenta.
  const remotaAlAbrir = (await leerSincronizacion('progresoRemoto'))?.progreso?.[id]?.fecha || null;

  document.body.classList.add('leyendo');
  $('lector').hidden = false;
  $('controles-lector').hidden = true;
  $('controles-lector').classList.remove('abierta');
  cerrarPaneles();
  $('titulo-libro').textContent = libro.titulo;
  $('menu-titulo').textContent = libro.titulo;
  $('info-capitulo').textContent = libro.titulo;
  $('info-progreso').textContent = '';
  $('barra-libro').value = '0';
  $('barra-libro').disabled = true;
  arrastrandoBarra = false;

  reiniciarReferencia();
  const sesiones = new RegistroSesiones(id, nombreDispositivo());
  const nuevo = {
    id,
    titulo: libro.titulo,
    motor: null,
    sesiones,
    progreso: progreso || null,
    ultimoCfi: progreso?.cfi || null,
    fechaAlAbrir: progreso?.fecha || null,
    remotaOfrecida: remotaAlAbrir,
    repaginandoHasta: Infinity, // hasta que termine la apertura
    info: null,
  };
  actual = nuevo;
  const { dispositivo } = preferencias();
  const lectura = lecturaDeLibro(id); // con los ajustes propios del libro, si los tiene
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
        // Como en Libros de Apple: al pasar página se ocultan los controles.
        alPasarPagina: () => {
          if (capaAbierta($('controles-lector')) && !hayPanelAbierto()) controlesVisibles(false);
        },
        alSaltarPorEnlace: (cfi, info) => {
          if (actual === nuevo) anotarSalto(nuevo, cfi, info);
        },
        // Nota al pie (mejora 22): su texto en la hoja, sin salir de la página.
        alTocarNota: async ({ titulo, parrafos, irALaNota }) => {
          if (actual !== nuevo || hojaAbierta()) return;
          registrar(`Nota al pie: ${titulo}`);
          const eleccion = await mostrarTexto(titulo, parrafos, [{ id: 'ir', texto: 'Ir a la nota' }]);
          if (eleccion === 'ir' && actual === nuevo) irALaNota();
        },
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
  cargarMarcadores(nuevo).catch(() => {});
}

export function idLibroAbierto() {
  return actual?.id || null;
}

export async function cerrarPantallaLector() {
  turno += 1; // cancela una apertura en curso
  clearTimeout(temporizadorAjustes);
  clearTimeout(temporizadorBusqueda);
  // Una búsqueda cortada al cerrar el libro no se conserva (sí una terminada).
  if (!busqueda.completa) {
    busqueda.numero += 1;
    busqueda.libro = null;
  }
  if (!actual) return;
  const cerrado = actual;
  actual = null;
  cerrarPaneles();
  $('controles-lector').hidden = true;
  $('btn-volver-lectura').hidden = true;
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
  $('btn-buscar-libro').addEventListener('click', abrirBuscar);
  $('barra-libro').addEventListener('input', previsualizarBarra);
  $('btn-marcador').addEventListener('click', alternarMarcador);
  $('btn-volver-lectura').addEventListener('click', volver);
  $('btn-marcadores').addEventListener('click', abrirMarcadores);
  $('btn-cerrar-marcadores').addEventListener('click', cerrarPaneles);
  $('barra-libro').addEventListener('change', saltarConBarra);
  // Si se suelta en el mismo valor no hay 'change': se sale del arrastre. Con
  // margen, para no adelantarse al 'change' de una suelta normal.
  for (const tipo of ['pointerup', 'touchend', 'blur']) {
    $('barra-libro').addEventListener(tipo, () => setTimeout(terminarArrastreBarra, 300));
  }
  $('btn-cerrar-buscar').addEventListener('click', cerrarPaneles);
  $('buscar-en-libro').addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    temporizadorBusqueda = setTimeout(lanzarBusqueda, 450);
  });
  $('buscar-en-libro').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    clearTimeout(temporizadorBusqueda);
    $('buscar-en-libro').blur(); // cierra el teclado para ver los resultados
    lanzarBusqueda();
  });
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
