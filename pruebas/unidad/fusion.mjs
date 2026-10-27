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
