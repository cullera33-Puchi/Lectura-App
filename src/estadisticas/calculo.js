// Cálculo de las estadísticas de lectura (v2). Funciones puras.
//
// sesiones: [{ libroId, inicio, fin, paginas, dispositivo }] de todos los
//           dispositivos (las de este, de la base local; las de los demás, de
//           la última sincronización). Ninguna sesión aparece dos veces.
// terminados: [{ libroId, fecha }] con la fecha en que se terminó cada libro.

const MAX_SESION_MS = 6 * 60 * 60 * 1000; // una sesión anómala no infla los totales
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Clave de día en hora local: AAAA-MM-DD.
export function claveDia(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function duracionMs(s) {
  const ms = Date.parse(s.fin) - Date.parse(s.inicio);
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), MAX_SESION_MS) : 0;
}

function sumarDia(dias, clave, ms, paginas) {
  const d = dias.get(clave) || { ms: 0, paginas: 0 };
  d.ms += ms;
  d.paginas += paginas;
  dias.set(clave, d);
}

// Racha: días seguidos con lectura que terminan hoy (o ayer, si hoy aún no se
// ha leído). Récord: la racha más larga del histórico.
function rachas(diasConLectura, hoy) {
  const conLectura = new Set(diasConLectura);
  const diaAnterior = (clave) => {
    const d = new Date(`${clave}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return claveDia(d);
  };
  let actual = 0;
  let dia = conLectura.has(hoy) ? hoy : diaAnterior(hoy);
  while (conLectura.has(dia)) {
    actual += 1;
    dia = diaAnterior(dia);
  }
  let record = 0;
  for (const clave of conLectura) {
    if (conLectura.has(diaAnterior(clave))) continue; // no es inicio de racha
    let largo = 0;
    let d = clave;
    while (conLectura.has(d)) {
      largo += 1;
      const siguiente = new Date(`${d}T12:00:00`);
      siguiente.setDate(siguiente.getDate() + 1);
      d = claveDia(siguiente);
    }
    record = Math.max(record, largo);
  }
  return { actual, record: Math.max(record, actual) };
}

export function calcularEstadisticas({ sesiones, terminados, objetivo, ahora = new Date() }) {
  const hoy = claveDia(ahora);
  const anio = ahora.getFullYear();
  const dias = new Map();
  const porDispositivo = new Map();
  const porMes = Array.from({ length: 12 }, () => ({ ms: 0, paginas: 0, terminados: 0 }));
  const porAnio = new Map();

  for (const s of sesiones) {
    const ms = duracionMs(s);
    const paginas = Number(s.paginas) || 0;
    if (!ms && !paginas) continue;
    sumarDia(dias, claveDia(s.inicio), ms, paginas);
    const fecha = new Date(s.inicio);
    const a = fecha.getFullYear();
    const totalAnio = porAnio.get(a) || { ms: 0, paginas: 0, terminados: 0 };
    totalAnio.ms += ms;
    totalAnio.paginas += paginas;
    porAnio.set(a, totalAnio);
    if (a === anio) {
      porMes[fecha.getMonth()].ms += ms;
      porMes[fecha.getMonth()].paginas += paginas;
      const nombre = s.dispositivo || 'Otro dispositivo';
      porDispositivo.set(nombre, (porDispositivo.get(nombre) || 0) + ms);
    }
  }

  for (const t of terminados) {
    const fecha = new Date(t.fecha);
    if (Number.isNaN(fecha.getTime())) continue;
    const a = fecha.getFullYear();
    const totalAnio = porAnio.get(a) || { ms: 0, paginas: 0, terminados: 0 };
    totalAnio.terminados += 1;
    porAnio.set(a, totalAnio);
    if (a === anio) porMes[fecha.getMonth()].terminados += 1;
  }

  // Semana actual, de lunes a domingo.
  const lunes = new Date(ahora);
  lunes.setHours(12, 0, 0, 0);
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  const semana = DIAS_SEMANA.map((etiqueta, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    const clave = claveDia(d);
    return { etiqueta, clave, ms: dias.get(clave)?.ms || 0, futuro: clave > hoy };
  });

  const delAnio = porAnio.get(anio) || { ms: 0, paginas: 0, terminados: 0 };
  const diasConLectura = [...dias.entries()].filter(([, d]) => d.ms >= 60 * 1000 || d.paginas > 0).map(([k]) => k);

  return {
    hoy: dias.get(hoy) || { ms: 0, paginas: 0 },
    racha: rachas(diasConLectura, hoy),
    semana,
    totalSemanaMs: semana.reduce((t, d) => t + d.ms, 0),
    meses: porMes.map((m, i) => ({ ...m, etiqueta: MESES[i], nombre: NOMBRES_MES[i], futuro: i > ahora.getMonth() })),
    anio,
    delAnio,
    objetivo: objetivo ? { libros: objetivo, hechos: delAnio.terminados } : null,
    anios: [...porAnio.entries()].sort((a, b) => b[0] - a[0]).map(([a, d]) => ({ anio: a, ...d })),
    dispositivos: [...porDispositivo.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, ms]) => ({ nombre, ms })),
  };
}

export function formatoDuracion(ms) {
  const minutos = Math.round(ms / 60000);
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
