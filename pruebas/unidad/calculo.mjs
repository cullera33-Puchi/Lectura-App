// Cálculo de estadísticas (funciones puras).
const c = await import(new URL('../../src/estadisticas/calculo.js', import.meta.url));
const ok = (x, m) => console.log(x ? 'OK ' : 'FALLO', m);
const ahora = new Date('2026-10-27T18:00:00');
const s = (dia, min, pag, disp = 'iPhone') => ({ libroId: 'a', inicio: `${dia}T10:00:00`, fin: new Date(Date.parse(`${dia}T10:00:00`) + min * 60000).toISOString(), paginas: pag, dispositivo: disp });
const ses = [s('2026-10-27', 30, 20), s('2026-10-27', 60, 40, 'Note Air 4C'), s('2026-10-26', 10, 5), s('2026-10-25', 5, 3), s('2026-10-20', 20, 10), s('2026-10-19', 20, 10), s('2026-10-18', 20, 10), s('2026-10-17', 20, 10), s('2025-03-01', 100, 50)];
const r = c.calcularEstadisticas({ sesiones: ses, terminados: [{ libroId: 'a', fecha: '2026-10-27T17:00:00' }, { libroId: 'b', fecha: '2026-02-01T10:00:00' }, { libroId: 'c', fecha: '2025-05-01T10:00:00' }], objetivo: 24, ahora });
ok(Math.round(r.hoy.ms / 60000) === 90, 'minutos de hoy suman los dos dispositivos');
ok(r.racha.actual === 3 && r.racha.record === 4, `racha actual 3 y récord 4 (${r.racha.actual}, ${r.racha.record})`);
ok(r.semana[0].etiqueta === 'L' && r.semana[0].clave === '2026-10-26' && Math.round(r.totalSemanaMs / 60000) === 100, 'semana de lunes a domingo');
ok(r.meses[9].terminados === 1 && r.meses[1].terminados === 1 && r.delAnio.terminados === 2, 'terminados por mes y año');
ok(r.objetivo.hechos === 2 && r.objetivo.libros === 24, 'objetivo anual');
ok(r.anios.length === 2 && r.anios[1].anio === 2025 && r.anios[1].terminados === 1, 'histórico por años');
ok(r.dispositivos.length === 2 && r.dispositivos[0].nombre === 'iPhone', 'desglose por dispositivo');
ok(c.formatoDuracion(90 * 60000) === '1 h 30 min' && c.formatoDuracion(5 * 60000) === '5 min', 'formato de duración');
