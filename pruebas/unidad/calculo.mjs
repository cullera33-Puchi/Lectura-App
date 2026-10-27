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

// Previsión de fin: 2 h dedicadas al 40 % dejan 3 h; con 30 min al día de
// media en los últimos 14 días (7 h), son 6 días.
const reciente = Array.from({ length: 7 }, (_, i) => s(`2026-10-${String(14 + i * 2).padStart(2, '0')}`, 60, 20));
const pf = c.previsionFin({ msLibro: 120 * 60000, fraccion: 0.4, sesiones: reciente, ahora });
ok(pf && Math.round(pf.msRestante / 60000) === 180 && pf.dias === 6 && pf.fecha === '2026-11-02', `previsión de fin: ${JSON.stringify(pf && { dias: pf.dias, fecha: pf.fecha })}`);
ok(c.previsionFin({ msLibro: 120 * 60000, fraccion: 0.02, sesiones: reciente, ahora }) === null, 'sin previsión con menos del 5 % leído');
ok(c.previsionFin({ msLibro: 120 * 60000, fraccion: 0.4, sesiones: [s('2026-09-01', 60, 20)], ahora }) === null, 'sin previsión si no se ha leído en los últimos 14 días');
ok(c.previsionFin({ msLibro: 5 * 60000, fraccion: 0.4, sesiones: reciente, ahora }) === null, 'sin previsión con menos de 10 min en el libro');

// Una sesión de 23:40 a 00:40 cuenta 20 min el primer día y 40 min el segundo.
const noche = c.calcularEstadisticas({ sesiones: [{ libroId: 'a', inicio: '2026-10-26T23:40:00', fin: '2026-10-27T00:40:00', paginas: 30 }], terminados: [], objetivo: null, ahora });
ok(Math.round(noche.hoy.ms / 60000) === 40 && Math.round(noche.semana[0].ms / 60000) === 20, `sesión que pasa la medianoche: ${Math.round(noche.semana[0].ms / 60000)} y ${Math.round(noche.hoy.ms / 60000)} min`);

// Detalle de un mes: libros con su tiempo, días y terminados del mes.
const dm = c.detalleMes({
  sesiones: [s('2026-10-01', 30, 10), s('2026-10-02', 20, 8, 'Note Air 4C'), { ...s('2026-10-03', 15, 5), libroId: 'b' }, s('2026-09-30', 40, 12)],
  terminados: [{ libroId: 'b', fecha: '2026-10-05T20:00:00' }, { libroId: 'c', fecha: '2026-10-20T20:00:00' }, { libroId: 'a', fecha: '2026-11-02T10:00:00' }],
  anio: 2026,
  mes: 9,
});
ok(Math.round(dm.ms / 60000) === 65 && dm.dias === 3 && dm.paginas === 23, `detalle del mes: totales (${Math.round(dm.ms / 60000)} min, ${dm.dias} días)`);
ok(dm.libros.map((l) => l.libroId).join() === 'a,b,c' && Math.round(dm.libros[0].ms / 60000) === 50 && dm.libros[1].terminado && !dm.libros[0].terminado, 'detalle del mes: libros por tiempo y terminados');
ok(dm.terminados === 2 && dm.dispositivos.length === 2 && dm.nombre === 'octubre', 'detalle del mes: terminados, dispositivos y nombre');
