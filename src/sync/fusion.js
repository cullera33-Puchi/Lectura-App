// Fusión de los JSON de Drive con los datos locales (punto 10 del diseño).
// Funciones puras: no leen ni escriben nada.
//
// Los campos que esta versión no conoce se conservan, para no borrar lo que
// escriba una versión posterior de la app.

export const VERSION_BIBLIOTECA = 1;
export const VERSION_PROGRESO = 1;

// Campos locales de un libro que no viajan a biblioteca.json.
const CAMPOS_SOLO_LOCALES = ['noDisponible', 'progreso', 'descargado', 'pendienteSubir'];
// Campos de un libro que se completan si una de las dos versiones los tiene vacíos.
const CAMPOS_LIBRO = [
  'id', 'titulo', 'autor', 'idioma', 'identificadorEpub', 'serie', 'numeroSerie',
  'archivoDriveId', 'portadaDriveId', 'tamanoBytes', 'fechaAlta', 'eliminado', 'fechaModificacion',
];
const CAMPOS_PROGRESO = ['cfi', 'porcentaje', 'capitulo', 'estado', 'fechaTerminado', 'dispositivo', 'dispositivoId', 'fecha'];

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function ordenarClaves(objeto) {
  return Object.fromEntries(Object.keys(objeto).sort().map((k) => [k, objeto[k]]));
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function libroRemoto(libro) {
  const r = { ...libro };
  for (const c of CAMPOS_SOLO_LOCALES) delete r[c];
  for (const c of CAMPOS_LIBRO) r[c] = r[c] ?? null;
  r.eliminado = Boolean(r.eliminado);
  return ordenarClaves(r);
}

function progresoRemoto(p) {
  const r = { ...p };
  delete r.id;
  for (const c of CAMPOS_PROGRESO) r[c] = r[c] ?? null;
  return ordenarClaves(r);
}

function versionNoSoportada(nombre) {
  return new Error(`${nombre} es de una versión más nueva de la app. Actualiza la app en este dispositivo.`);
}

// Prepara los JSON remotos. Las entradas mal formadas se descartan.
export function normalizarBiblioteca(datos) {
  if (!esObjeto(datos)) return { version: VERSION_BIBLIOTECA, libros: [] };
  if ((Number(datos.version) || 1) > VERSION_BIBLIOTECA) throw versionNoSoportada('biblioteca.json');
  const libros = (Array.isArray(datos.libros) ? datos.libros : [])
    .filter((l) => esObjeto(l) && typeof l.id === 'string' && l.id);
  return { ...datos, version: VERSION_BIBLIOTECA, libros };
}

export function normalizarProgreso(datos) {
  if (!esObjeto(datos)) return { version: VERSION_PROGRESO, progreso: {} };
  if ((Number(datos.version) || 1) > VERSION_PROGRESO) throw versionNoSoportada('progreso.json');
  const progreso = {};
  for (const [id, entrada] of Object.entries(esObjeto(datos.progreso) ? datos.progreso : {})) {
    if (esObjeto(entrada)) progreso[id] = entrada;
  }
  return { ...datos, version: VERSION_PROGRESO, progreso };
}

// Une dos versiones del mismo libro. Gana la fechaModificacion más reciente;
// con la misma fecha, se completan los campos vacíos (por ejemplo, los id de
// Drive que solo conoce el dispositivo que subió el libro).
function unirLibro(local, remoto) {
  const fl = local.fechaModificacion || '';
  const fr = remoto.fechaModificacion || '';
  if (fl > fr) return { ...remoto, ...local };
  if (fr > fl) return { ...local, ...remoto };
  const r = { ...remoto, ...local };
  for (const c of Object.keys(r)) if (r[c] == null && remoto[c] != null) r[c] = remoto[c];
  r.eliminado = Boolean(local.eliminado || remoto.eliminado);
  return ordenarClaves(r);
}

const porFechaAlta = (a, b) => (a.fechaAlta || '').localeCompare(b.fechaAlta || '') || a.id.localeCompare(b.id);

// local: registros de libros locales que deben estar en Drive (incluidos los
// eliminados). remoto: biblioteca.json normalizado.
// Devuelve la biblioteca fusionada, los cambios a aplicar en local y si hay
// que escribir el archivo remoto.
export function fusionarBiblioteca(local, remoto) {
  const porIdLocal = new Map(local.map((l) => [l.id, libroRemoto(l)]));
  const porIdRemoto = new Map(remoto.libros.map((l) => [l.id, libroRemoto(l)]));
  const ids = new Set([...porIdLocal.keys(), ...porIdRemoto.keys()]);

  const libros = [];
  const cambiosLocales = []; // { libro, tipo: 'nuevo' | 'baja' | 'baja-desconocida' | 'recuperado' | 'actualizado' }
  for (const id of ids) {
    const l = porIdLocal.get(id);
    const r = porIdRemoto.get(id);
    const resultado = ordenarClaves(l && r ? unirLibro(l, r) : (l || r));
    libros.push(resultado);
    if (!l) {
      cambiosLocales.push({ libro: resultado, tipo: resultado.eliminado ? 'baja-desconocida' : 'nuevo' });
    } else if (!igual(l, resultado)) {
      let tipo = 'actualizado';
      if (resultado.eliminado && !l.eliminado) tipo = 'baja';
      else if (!resultado.eliminado && l.eliminado) tipo = 'recuperado';
      cambiosLocales.push({ libro: resultado, tipo });
    }
  }
  libros.sort(porFechaAlta);
  const remotoOrdenado = [...porIdRemoto.values()].sort(porFechaAlta);
  return {
    biblioteca: { ...remoto, version: VERSION_BIBLIOTECA, libros },
    cambiosLocales,
    escribirRemoto: !igual(remotoOrdenado, libros),
  };
}

// local: registros de progreso locales. remoto: progreso.json normalizado.
// Libro a libro gana la entrada con la fecha más reciente. Con la misma fecha,
// se completan los campos vacíos (por ejemplo, el porcentaje calculado después).
// Las entradas locales sin fecha (provisionales) no se envían.
export function fusionarProgreso(local, remoto) {
  const progreso = {};
  for (const [id, entrada] of Object.entries(remoto.progreso)) progreso[id] = progresoRemoto(entrada);
  const remotoOriginal = JSON.parse(JSON.stringify(progreso));
  for (const p of local) {
    if (!p.fecha) continue;
    const propia = progresoRemoto(p);
    const actual = progreso[p.id];
    if (!actual || p.fecha > (actual.fecha || '')) {
      progreso[p.id] = propia;
    } else if (p.fecha === actual.fecha) {
      const unida = { ...actual };
      for (const c of Object.keys(propia)) if (unida[c] == null && propia[c] != null) unida[c] = propia[c];
      progreso[p.id] = unida;
    }
  }
  const ordenado = ordenarClaves(progreso);
  return {
    progreso: { ...remoto, version: VERSION_PROGRESO, progreso: ordenado },
    escribirRemoto: !igual(ordenado, ordenarClaves(remotoOriginal)),
  };
}

// Entradas del progreso remoto más recientes que lo que este dispositivo ya
// conocía (su progreso local y la copia remota anterior). Sirve para el resumen.
export function posicionesNuevas(progresoFusionado, local, copiaAnterior) {
  const porIdLocal = new Map(local.map((p) => [p.id, p.fecha || '']));
  let n = 0;
  for (const [id, e] of Object.entries(progresoFusionado.progreso)) {
    const conocida = [porIdLocal.get(id) || '', copiaAnterior?.progreso?.[id]?.fecha || ''].sort().pop();
    if ((e.fecha || '') > conocida) n += 1;
  }
  return n;
}

// Une varios biblioteca.json (por ejemplo, si los dos dispositivos crearon el
// archivo a la vez y hay dos con el mismo nombre).
export function unirBibliotecas(lista) {
  return lista.reduce((acumulada, otra) => fusionarBiblioteca(acumulada.libros, otra).biblioteca,
    normalizarBiblioteca(null));
}

export function unirProgresos(lista) {
  return lista.reduce((acumulado, otro) => {
    const locales = Object.entries(acumulado.progreso).map(([id, p]) => ({ ...p, id }));
    return fusionarProgreso(locales, otro).progreso;
  }, normalizarProgreso(null));
}

// --- v2: colecciones, objetivo anual y sesiones ---

// Colecciones: [{ id, nombre, fechaModificacion, eliminado }]. Por id, gana la
// fechaModificacion más reciente (así se propagan las bajas).
export function fusionarColecciones(local = [], remoto = []) {
  const porId = new Map();
  for (const c of [...remoto, ...local]) {
    if (!esObjeto(c) || !c.id) continue;
    const actual = porId.get(c.id);
    if (!actual || (c.fechaModificacion || '') > (actual.fechaModificacion || '')) porId.set(c.id, { ...c });
  }
  return [...porId.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es') || a.id.localeCompare(b.id));
}

// Objetivos por año: { "2026": { libros, fecha } }, y la meta diaria en
// "diario": { minutos, fecha }. Por clave, gana la fecha más reciente.
export function fusionarObjetivos(local = {}, remoto = {}) {
  const resultado = {};
  for (const fuente of [remoto, local]) {
    for (const [anio, o] of Object.entries(esObjeto(fuente) ? fuente : {})) {
      if (!esObjeto(o)) continue;
      if (!resultado[anio] || (o.fecha || '') > (resultado[anio].fecha || '')) resultado[anio] = { ...o };
    }
  }
  return ordenarClaves(resultado);
}

// Añade a la biblioteca fusionada las colecciones y los objetivos. Devuelve
// también si eso obliga a escribir el archivo remoto.
// Lista "Quiero leer": { ids, fecha }. Se ordena a mano, así que gana entera
// la más reciente.
export function fusionarQuieroLeer(local, remoto) {
  const valida = (x) => esObjeto(x) && Array.isArray(x.ids);
  if (!valida(remoto)) return valida(local) ? local : { ids: [], fecha: null };
  if (!valida(local)) return remoto;
  return (local.fecha || '') > (remoto.fecha || '') ? local : remoto;
}

export function fusionarExtrasBiblioteca(biblioteca, remoto, extrasLocales) {
  const colecciones = fusionarColecciones(extrasLocales.colecciones, remoto.colecciones);
  const objetivos = fusionarObjetivos(extrasLocales.objetivos, remoto.objetivos);
  const quieroLeer = fusionarQuieroLeer(extrasLocales.quieroLeer, remoto.quieroLeer);
  const cambio = !igual(colecciones, fusionarColecciones([], remoto.colecciones))
    || !igual(objetivos, fusionarObjetivos({}, remoto.objetivos))
    || !igual(quieroLeer, remoto.quieroLeer ?? null)
    || !Array.isArray(remoto.colecciones) || !esObjeto(remoto.objetivos);
  return {
    biblioteca: { ...biblioteca, colecciones, objetivos, quieroLeer }, cambio, colecciones, objetivos, quieroLeer,
  };
}

export const VERSION_SESIONES = 1;

export function normalizarSesiones(datos) {
  if (!esObjeto(datos)) return { version: VERSION_SESIONES, sesiones: [] };
  if ((Number(datos.version) || 1) > VERSION_SESIONES) throw versionNoSoportada('El archivo de sesiones');
  const sesiones = (Array.isArray(datos.sesiones) ? datos.sesiones : [])
    .filter((s) => esObjeto(s) && s.id && s.inicio);
  return { ...datos, version: VERSION_SESIONES, sesiones };
}

// Sesiones de este dispositivo: unión por id; si una sesión está en los dos
// lados, gana la que termina más tarde (una sesión crece mientras se lee).
export function fusionarSesiones(locales, remoto) {
  const porId = new Map();
  for (const s of [...remoto.sesiones, ...locales]) {
    const actual = porId.get(s.id);
    if (!actual || (s.fin || '') > (actual.fin || '')) porId.set(s.id, ordenarClaves({ ...s }));
  }
  const sesiones = [...porId.values()].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
  const remotoOrdenado = [...remoto.sesiones].map((s) => ordenarClaves({ ...s }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id));
  return { sesiones, escribirRemoto: !igual(sesiones, remotoOrdenado) };
}

// --- v4: anotaciones (marcadores; más adelante, subrayados y notas) ---
// anotaciones.json: { version, anotaciones: { id: { id, libroId, tipo, cfi,
// ..., fecha, eliminado } } }. Por id gana la fecha más reciente; una baja es
// una anotación con eliminado: true, para que llegue al otro dispositivo.

export const VERSION_ANOTACIONES = 1;

export function normalizarAnotaciones(datos) {
  if (!esObjeto(datos)) return { version: VERSION_ANOTACIONES, anotaciones: {} };
  if ((Number(datos.version) || 1) > VERSION_ANOTACIONES) throw versionNoSoportada('anotaciones.json');
  const anotaciones = {};
  for (const [id, a] of Object.entries(esObjeto(datos.anotaciones) ? datos.anotaciones : {})) {
    if (esObjeto(a) && a.libroId && a.cfi) anotaciones[id] = { ...a, id };
  }
  return { ...datos, version: VERSION_ANOTACIONES, anotaciones };
}

export function fusionarAnotaciones(locales, remoto) {
  const anotaciones = { ...remoto.anotaciones };
  for (const [id, a] of Object.entries(locales || {})) {
    const otra = anotaciones[id];
    if (!otra || (a.fecha || '') > (otra.fecha || '')) anotaciones[id] = a;
  }
  const ordenado = ordenarClaves(anotaciones);
  return {
    anotaciones: { ...remoto, version: VERSION_ANOTACIONES, anotaciones: ordenado },
    escribirRemoto: !igual(ordenado, ordenarClaves(remoto.anotaciones)),
  };
}

export function unirAnotaciones(lista) {
  return lista.reduce((acumulado, otro) => fusionarAnotaciones(acumulado.anotaciones, otro).anotaciones,
    normalizarAnotaciones(null));
}
