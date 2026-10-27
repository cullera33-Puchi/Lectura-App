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

export function duracionMs(s) {
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

export function calcularEstadisticas({ sesiones, terminados, objetivo, metaDiaria = null, ahora = new Date() }) {
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

  const deHoy = dias.get(hoy) || { ms: 0, paginas: 0 };
  return {
    hoy: deHoy,
    metaDiaria: metaDiaria ? { minutos: metaDiaria, cumplida: deHoy.ms >= metaDiaria * 60000 } : null,
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

// Lectura de un libro: tiempo, páginas, sesiones, primera y última fecha y
// reparto por dispositivo.
export function resumenLibro(sesiones) {
  const porDispositivo = new Map();
  let ms = 0;
  let paginas = 0;
  let n = 0;
  let primera = null;
  let ultima = null;
  for (const s of sesiones) {
    const d = duracionMs(s);
    const p = Number(s.paginas) || 0;
    if (!d && !p) continue;
    ms += d;
    paginas += p;
    n += 1;
    if (!primera || s.inicio < primera) primera = s.inicio;
    if (!ultima || (s.fin || s.inicio) > ultima) ultima = s.fin || s.inicio;
    const nombre = s.dispositivo || 'Otro dispositivo';
    porDispositivo.set(nombre, (porDispositivo.get(nombre) || 0) + d);
  }
  return {
    ms,
    paginas,
    sesiones: n,
    primera,
    ultima,
    dispositivos: [...porDispositivo.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, t]) => ({ nombre, ms: t })),
  };
}

// Previsión de fin de un libro en curso. Lo que falta se estima con el tiempo
// ya dedicado al libro y la fracción leída: T·(1−p)/p. Ese tiempo se reparte
// según la media diaria de lectura (de todos los libros) en los últimos días,
// contando también los días sin leer. Devuelve null si no hay datos para una
// estimación razonable.
const DIAS_MEDIA = 14;
const MINIMO_LEIDO = 0.05;
const MINIMO_MS_LIBRO = 10 * 60000;
const MAXIMO_DIAS = 365;

export function previsionFin({ msLibro, fraccion, sesiones, ahora = new Date() }) {
  if (!(fraccion >= MINIMO_LEIDO && fraccion < 1) || !(msLibro >= MINIMO_MS_LIBRO)) return null;
  const desde = ahora.getTime() - DIAS_MEDIA * 86400000;
  let reciente = 0;
  for (const s of sesiones) {
    const inicio = Date.parse(s.inicio);
    if (inicio >= desde && inicio <= ahora.getTime()) reciente += duracionMs(s);
  }
  const mediaDiaria = reciente / DIAS_MEDIA;
  if (mediaDiaria < 60000) return null; // menos de un minuto al día: no hay ritmo
  const msRestante = (msLibro * (1 - fraccion)) / fraccion;
  const dias = Math.max(1, Math.ceil(msRestante / mediaDiaria));
  if (dias > MAXIMO_DIAS) return null;
  const fecha = new Date(ahora);
  fecha.setDate(fecha.getDate() + dias);
  return { msRestante, dias, fecha: claveDia(fecha), mediaDiaria };
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const FRANJAS = [
  { nombre: 'de madrugada', desde: 0, hasta: 6 },
  { nombre: 'por la mañana', desde: 6, hasta: 14 },
  { nombre: 'por la tarde', desde: 14, hasta: 21 },
  { nombre: 'por la noche', desde: 21, hasta: 24 },
];

// Resumen de un año: totales, días con lectura, racha más larga del año, mes y
// día de la semana con más lectura, franja horaria habitual, sesión más larga,
// libro con más tiempo, libros terminados y reparto por dispositivo.
export function resumenAnual({ sesiones, terminados, anio }) {
  const dias = new Map();
  const porMes = Array(12).fill(0);
  const porDiaSemana = Array(7).fill(0);
  const porFranja = Array(FRANJAS.length).fill(0);
  const porLibro = new Map();
  const porDispositivo = new Map();
  let ms = 0;
  let paginas = 0;
  let sesionMasLarga = null;

  for (const s of sesiones) {
    const fecha = new Date(s.inicio);
    if (fecha.getFullYear() !== anio) continue;
    const d = duracionMs(s);
    const p = Number(s.paginas) || 0;
    if (!d && !p) continue;
    ms += d;
    paginas += p;
    sumarDia(dias, claveDia(s.inicio), d, p);
    porMes[fecha.getMonth()] += d;
    porDiaSemana[fecha.getDay()] += d;
    const hora = fecha.getHours();
    porFranja[FRANJAS.findIndex((f) => hora >= f.desde && hora < f.hasta)] += d;
    porLibro.set(s.libroId, (porLibro.get(s.libroId) || 0) + d);
    const nombre = s.dispositivo || 'Otro dispositivo';
    porDispositivo.set(nombre, (porDispositivo.get(nombre) || 0) + d);
    if (!sesionMasLarga || d > sesionMasLarga.ms) sesionMasLarga = { ms: d, libroId: s.libroId, fecha: s.inicio };
  }

  const maximo = (lista) => {
    let i = -1;
    lista.forEach((v, j) => { if (v > 0 && (i < 0 || v > lista[i])) i = j; });
    return i;
  };
  const diasConLectura = [...dias.entries()].filter(([, v]) => v.ms >= 60 * 1000 || v.paginas > 0).map(([k]) => k);
  const mes = maximo(porMes);
  const diaSemana = maximo(porDiaSemana);
  const franja = maximo(porFranja);
  const libroTop = [...porLibro.entries()].sort((a, b) => b[1] - a[1])[0];
  const delAnio = terminados
    .filter((t) => new Date(t.fecha).getFullYear() === anio)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  return {
    anio,
    ms,
    paginas,
    dias: diasConLectura.length,
    mediaPorDiaMs: diasConLectura.length ? ms / diasConLectura.length : 0,
    rachaMasLarga: rachas(diasConLectura, `${anio}-01-01`).record,
    mes: mes >= 0 ? { nombre: NOMBRES_MES[mes], ms: porMes[mes] } : null,
    diaSemana: diaSemana >= 0 ? { nombre: NOMBRES_DIA[diaSemana], ms: porDiaSemana[diaSemana] } : null,
    franja: franja >= 0 ? FRANJAS[franja].nombre : null,
    sesionMasLarga,
    libroTop: libroTop ? { libroId: libroTop[0], ms: libroTop[1] } : null,
    terminados: delAnio,
    dispositivos: [...porDispositivo.entries()].sort((a, b) => b[1] - a[1]).map(([nombre, t]) => ({ nombre, ms: t })),
  };
}
