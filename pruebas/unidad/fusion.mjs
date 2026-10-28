// Fusión de biblioteca.json y progreso.json (funciones puras).
const f = await import(new URL('../../src/sync/fusion.js', import.meta.url));
const ok = (c, m) => console.log(c ? 'OK ' : 'FALLO ', m);
const L = (id, fm, extra = {}) => ({ id, titulo: id, fechaAlta: '2026-01-01', fechaModificacion: fm, eliminado: false, archivoDriveId: null, ...extra });
// 1. libro solo local -> sube; solo remoto -> nuevo local
let r = f.fusionarBiblioteca([L('a', '1')], f.normalizarBiblioteca({ version: 1, libros: [L('b', '1')] }));
ok(r.biblioteca.libros.length === 2 && r.escribirRemoto, 'unión por id');
ok(r.cambiosLocales.length === 1 && r.cambiosLocales[0].tipo === 'nuevo' && r.cambiosLocales[0].libro.id === 'b', 'remoto nuevo en local');
// 2. baja remota más reciente gana
r = f.fusionarBiblioteca([L('a', '1')], { version: 1, libros: [L('a', '2', { eliminado: true })] });
ok(r.biblioteca.libros[0].eliminado && r.cambiosLocales[0].tipo === 'baja' && !r.escribirRemoto, 'baja remota se propaga');
// 3. baja local más reciente gana
r = f.fusionarBiblioteca([L('a', '3', { eliminado: true })], { version: 1, libros: [L('a', '2')] });
ok(r.biblioteca.libros[0].eliminado && r.escribirRemoto && r.cambiosLocales.length === 0, 'baja local se sube');
// 4. misma fecha: completa ids de Drive
r = f.fusionarBiblioteca([L('a', '1')], { version: 1, libros: [L('a', '1', { archivoDriveId: 'X' })] });
ok(r.biblioteca.libros[0].archivoDriveId === 'X' && !r.escribirRemoto && r.cambiosLocales[0].tipo === 'actualizado', 'misma fecha completa ids');
// 5. sin cambios
r = f.fusionarBiblioteca([L('a', '1', { noDisponible: true })], { version: 1, libros: [L('a', '1')] });
ok(!r.escribirRemoto && r.cambiosLocales.length === 0, 'todo al día (campos locales ignorados)');
// 6. version futura
try { f.normalizarBiblioteca({ version: 2, libros: [] }); ok(false, 'versión futura'); } catch { ok(true, 'versión futura rechazada'); }
// progreso
const P = (id, fecha, disp) => ({ id, cfi: 'c' + fecha, porcentaje: 0.1, capitulo: 'x', estado: 'leyendo', dispositivo: disp, fecha });
let p = f.fusionarProgreso([P('a', '2026-01-02', 'iPhone'), P('b', '2026-01-01', 'iPhone')], { version: 1, progreso: { a: P('a', '2026-01-01', 'Tablet'), b: P('b', '2026-01-03', 'Tablet') } });
ok(p.progreso.progreso.a.dispositivo === 'iPhone' && p.progreso.progreso.b.dispositivo === 'Tablet' && p.escribirRemoto, 'progreso libro a libro');
ok(!('id' in p.progreso.progreso.a), 'sin campo id en el JSON');
p = f.fusionarProgreso([P('a', '2026-01-01', 'iPhone')], { version: 1, progreso: { a: f.fusionarProgreso([P('a', '2026-01-01', 'iPhone')], { version: 1, progreso: {} }).progreso.progreso.a } });
ok(!p.escribirRemoto, 'progreso sin cambios no se escribe');
ok(f.posicionesNuevas({ progreso: { b: P('b', '2026-01-03', 'T') } }, [P('b', '2026-01-01')], null) === 1, 'cuenta posiciones nuevas');
ok(f.posicionesNuevas({ progreso: { b: P('b', '2026-01-03', 'T') } }, [], { progreso: { b: P('b', '2026-01-03', 'T') } }) === 0, 'no recuenta las ya conocidas');
// nuevos casos de la revisión
r = f.fusionarBiblioteca([L('a', '1')], f.normalizarBiblioteca({ version: 1, colecciones: ['x'], libros: [L('a', '1', { serieFutura: 'S' }), null, { titulo: 'sin id' }] }));
ok(r.biblioteca.colecciones?.[0] === 'x' && r.biblioteca.libros[0].serieFutura === 'S' && r.biblioteca.libros.length === 1, 'conserva campos desconocidos y descarta entradas mal formadas');
p = f.fusionarProgreso([{ ...P('a', '2026-01-01', 'iPhone'), porcentaje: 0.4 }], { version: 1, progreso: { a: { ...P('a', '2026-01-01', 'iPhone'), porcentaje: null } } });
ok(p.progreso.progreso.a.porcentaje === 0.4 && p.escribirRemoto, 'misma fecha completa el porcentaje');
p = f.fusionarProgreso([{ ...P('a', null, 'iPhone') }], { version: 1, progreso: { a: P('a', '2026-01-01', 'Tablet') } });
ok(p.progreso.progreso.a.dispositivo === 'Tablet' && !p.escribirRemoto, 'posición provisional no se envía');
const u = f.unirBibliotecas([f.normalizarBiblioteca({ version: 1, libros: [L('a', '1')] }), f.normalizarBiblioteca({ version: 1, libros: [L('b', '1'), L('a', '2', { eliminado: true })] })]);
ok(u.libros.length === 2 && u.libros.find((l) => l.id === 'a').eliminado, 'une dos biblioteca.json duplicados');
ok(f.normalizarProgreso({ version: 1, progreso: { a: null, b: P('b', '1') } }).progreso.a === undefined, 'descarta progreso nulo');

// Quiero leer (0.8.5): libro a libro, no la lista entera.
{
  const T = (h) => `2026-10-2${h}T10:00:00Z`;
  const iphone = { ids: ['A', 'B'], fecha: T(1), entradas: { A: { fecha: T(1), quitado: false }, B: { fecha: T(1), quitado: false } } };
  const tablet = { ids: ['C'], fecha: T(2), entradas: { C: { fecha: T(2), quitado: false } } };
  const r = f.fusionarQuieroLeer(tablet, iphone);
  ok(r.ids.join() === 'C,A,B', `una alta en otro dispositivo no borra la lista (${r.ids.join()})`);
  const quitaB = { ids: ['A', 'C'], fecha: T(3), entradas: { ...r.entradas, B: { fecha: T(3), quitado: true } } };
  const conD = { ids: ['C', 'A', 'B', 'D'], fecha: T(4), entradas: { ...r.entradas, D: { fecha: T(4), quitado: false } } };
  const m1 = f.fusionarQuieroLeer(quitaB, conD);
  const m2 = f.fusionarQuieroLeer(conD, quitaB);
  ok(m1.ids.join() === 'C,A,D' && m2.ids.join() === 'C,A,D', `quitar en uno y añadir en otro se combinan (${m1.ids.join()} y ${m2.ids.join()})`);
  ok(JSON.stringify(f.fusionarQuieroLeer(m1, m1)) === JSON.stringify(m1), 'fusionar consigo misma no cambia nada');
  const antigua = { ids: ['X', 'Y'], fecha: T(1) };
  ok(f.fusionarQuieroLeer(tablet, antigua).ids.join() === 'C,X,Y', 'una lista de antes de 0.8.5 se une, no se pierde');
}
