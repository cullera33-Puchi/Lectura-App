// Fusión de los JSON de Drive con los datos locales (punto 10 del diseño).
// Funciones puras: no leen ni escriben nada.

export const VERSION_BIBLIOTECA = 1;
export const VERSION_PROGRESO = 1;

// Campos de un libro que viajan en biblioteca.json. Los demás son locales.
const CAMPOS_LIBRO = [
  'id', 'titulo', 'autor', 'idioma', 'identificadorEpub', 'serie', 'numeroSerie',
  'archivoDriveId', 'portadaDriveId', 'tamanoBytes', 'fechaAlta', 'eliminado', 'fechaModificacion',
];
const CAMPOS_PROGRESO = ['cfi', 'porcentaje', 'capitulo', 'estado', 'dispositivo', 'fecha'];

function elegir(objeto, campos) {
  const r = {};
  for (const c of campos) r[c] = objeto[c] ?? null;
  r.eliminado = Boolean(objeto.eliminado);
  return r;
}

export function libroRemoto(libro) {
  return elegir(libro, CAMPOS_LIBRO);
}

function progresoRemoto(p) {
  const r = {};
  for (const c of CAMPOS_PROGRESO) r[c] = p[c] ?? null;
  return r;
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Prepara los JSON remotos y aplica migraciones de esquema si las hubiera.
export function normalizarBiblioteca(datos) {
  if (!datos || typeof datos !== 'object') return { version: VERSION_BIBLIOTECA, libros: [] };
  if ((datos.version ?? 1) > VERSION_BIBLIOTECA) {
    throw new Error('biblioteca.json es de una versión más nueva de la app. Actualiza la app en este dispositivo.');
  }
  return { version: VERSION_BIBLIOTECA, libros: Array.isArray(datos.libros) ? datos.libros : [] };
}

export function normalizarProgreso(datos) {
  if (!datos || typeof datos !== 'object') return { version: VERSION_PROGRESO, progreso: {} };
  if ((datos.version ?? 1) > VERSION_PROGRESO) {
    throw new Error('progreso.json es de una versión más nueva de la app. Actualiza la app en este dispositivo.');
  }
  return { version: VERSION_PROGRESO, progreso: { ...(datos.progreso || {}) } };
}

// Une dos versiones del mismo libro. Gana la fechaModificacion más reciente;
// con la misma fecha, se completan los campos vacíos (por ejemplo, los id de
// Drive que solo conoce el dispositivo que subió el libro).
function unirLibro(local, remoto) {
  const fl = local.fechaModificacion || '';
  const fr = remoto.fechaModificacion || '';
  const [gana, pierde] = fl > fr ? [local, remoto] : (fr > fl ? [remoto, local] : [local, remoto]);
  const r = { ...gana };
  if (fl === fr) {
    for (const c of CAMPOS_LIBRO) if (r[c] == null && pierde[c] != null) r[c] = pierde[c];
    r.eliminado = Boolean(local.eliminado || remoto.eliminado);
  }
  return r;
}

// local: registros de libros locales (incluidos los eliminados).
// remoto: biblioteca.json normalizado.
// Devuelve la biblioteca fusionada, los cambios a aplicar en local y si hay
// que escribir el archivo remoto.
export function fusionarBiblioteca(local, remoto) {
  const porIdLocal = new Map(local.map((l) => [l.id, libroRemoto(l)]));
  const porIdRemoto = new Map(remoto.libros.map((l) => [l.id, libroRemoto(l)]));
  const ids = new Set([...porIdLocal.keys(), ...porIdRemoto.keys()]);

  const libros = [];
  const cambiosLocales = []; // { libro, tipo: 'nuevo' | 'baja' | 'actualizado' }
  for (const id of ids) {
    const l = porIdLocal.get(id);
    const r = porIdRemoto.get(id);
    const resultado = l && r ? unirLibro(l, r) : (l || r);
    libros.push(resultado);
    if (!l) {
      cambiosLocales.push({ libro: resultado, tipo: resultado.eliminado ? 'baja-desconocida' : 'nuevo' });
    } else if (!igual(l, resultado)) {
      const tipo = resultado.eliminado && !l.eliminado ? 'baja' : (!resultado.eliminado && l.eliminado ? 'recuperado' : 'actualizado');
      cambiosLocales.push({ libro: resultado, tipo });
    }
  }
  libros.sort((a, b) => (a.fechaAlta || '').localeCompare(b.fechaAlta || '') || a.id.localeCompare(b.id));
  const resultado = { version: VERSION_BIBLIOTECA, libros };
  const remotoOrdenado = [...porIdRemoto.values()]
    .sort((a, b) => (a.fechaAlta || '').localeCompare(b.fechaAlta || '') || a.id.localeCompare(b.id));
  return {
    biblioteca: resultado,
    cambiosLocales,
    escribirRemoto: !igual(remotoOrdenado, libros),
  };
}

// local: registros de progreso locales. remoto: progreso.json normalizado.
// Libro a libro gana la entrada con la fecha más reciente.
export function fusionarProgreso(local, remoto) {
  const progreso = {};
  for (const [id, entrada] of Object.entries(remoto.progreso)) progreso[id] = progresoRemoto(entrada);
  const remotoOriginal = JSON.parse(JSON.stringify(progreso));
  for (const p of local) {
    if (!p.fecha) continue;
    const actual = progreso[p.id];
    if (!actual || p.fecha > (actual.fecha || '')) progreso[p.id] = progresoRemoto(p);
  }
  const ordenado = Object.fromEntries(Object.keys(progreso).sort().map((k) => [k, progreso[k]]));
  const remotoOrdenado = Object.fromEntries(Object.keys(remotoOriginal).sort().map((k) => [k, remotoOriginal[k]]));
  return {
    progreso: { version: VERSION_PROGRESO, progreso: ordenado },
    escribirRemoto: !igual(ordenado, remotoOrdenado),
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
