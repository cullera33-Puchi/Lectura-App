// API REST de Drive v3 con fetch. Con drive.file la app solo ve lo que ha creado.

const API = 'https://www.googleapis.com/drive/v3';
const API_SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
const TIPO_CARPETA = 'application/vnd.google-apps.folder';

export const NOMBRE_CARPETA = 'Lector EPUB';
const MARCA_APP = { clave: 'app', valor: 'lector-epub' };

// Tiempo máximo de una petición: corto para metadatos y JSON, largo para
// subir o descargar libros (hasta unos 10 MB por red móvil).
const LIMITE_CORTO_MS = 30 * 1000;
const LIMITE_LARGO_MS = 5 * 60 * 1000;
// Reintentos ante errores temporales de Google (429 y 5xx), con espera creciente.
const REINTENTOS = 3;
const ESPERA_BASE_MS = 1000;

export class ErrorDrive extends Error {
  constructor(mensaje, estadoHttp, detalle) {
    super(mensaje);
    this.estadoHttp = estadoHttp;
    this.detalle = detalle;
  }

  get motivo() {
    return this.detalle?.error?.errors?.[0]?.reason || '';
  }
}

function mensajeError(estadoHttp, detalle) {
  const motivo = detalle?.error?.errors?.[0]?.reason || '';
  if (estadoHttp === 401) return 'La sesión de Google ha caducado o no es válida. Pulsa de nuevo para renovarla.';
  if (motivo === 'storageQuotaExceeded') return 'La cuota de Google Drive está llena';
  if (estadoHttp === 403) return `Drive ha denegado la operación (${motivo || 'sin motivo'})`;
  if (estadoHttp === 404) return 'El archivo ya no existe en Drive';
  if (estadoHttp === 429 || estadoHttp >= 500) return 'Google Drive no responde ahora mismo. Inténtalo dentro de un momento.';
  return `Error de Drive ${estadoHttp}${detalle?.error?.message ? `: ${detalle.error.message}` : ''}`;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function esTemporal(estadoHttp, detalle) {
  const motivo = detalle?.error?.errors?.[0]?.reason || '';
  return estadoHttp === 429 || estadoHttp >= 500 || motivo === 'rateLimitExceeded' || motivo === 'userRateLimitExceeded';
}

async function peticion(token, url, opciones = {}) {
  const { limite = LIMITE_CORTO_MS, ...resto } = opciones;
  for (let intento = 1; ; intento += 1) {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        ...resto,
        cache: 'no-store',
        signal: AbortSignal.timeout ? AbortSignal.timeout(limite) : undefined,
        headers: { Authorization: `Bearer ${token}`, ...resto.headers },
      });
    } catch (e) {
      if (!navigator.onLine) throw new ErrorDrive('Sin conexión', 0);
      const agotado = e.name === 'TimeoutError' || e.name === 'AbortError';
      throw new ErrorDrive(agotado ? 'Google Drive tarda demasiado en responder. Inténtalo de nuevo.'
        : `No se pudo contactar con Drive (${e.message})`, 0);
    }
    if (respuesta.ok) return respuesta;
    let detalle = null;
    try {
      detalle = await respuesta.json();
    } catch {
      // cuerpo vacío o no JSON
    }
    // Un cuerpo de subida ya consumido no se puede reenviar: solo se reintentan
    // las peticiones sin cuerpo o con cuerpo de texto.
    const reintentable = !resto.body || typeof resto.body === 'string';
    if (intento < REINTENTOS && reintentable && esTemporal(respuesta.status, detalle)) {
      await esperar(ESPERA_BASE_MS * 2 ** (intento - 1));
      continue;
    }
    throw new ErrorDrive(mensajeError(respuesta.status, detalle), respuesta.status, detalle);
  }
}

function literal(texto) {
  return `'${String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function buscar(token, consulta, campos = 'id,name,createdTime,modifiedTime') {
  const resultados = [];
  let pagina = null;
  do {
    const parametros = new URLSearchParams({
      q: consulta,
      fields: `nextPageToken,files(${campos})`,
      orderBy: 'createdTime',
      spaces: 'drive',
      pageSize: '1000',
    });
    if (pagina) parametros.set('pageToken', pagina);
    const r = await peticion(token, `${API}/files?${parametros}`);
    const datos = await r.json();
    resultados.push(...(datos.files || []));
    pagina = datos.nextPageToken;
  } while (pagina);
  return resultados;
}

export async function obtenerUsuario(token) {
  const r = await peticion(token, `${API}/about?fields=user(displayName,emailAddress)`);
  return (await r.json()).user;
}

// Busca la carpeta de la app por su marca. Si hay varias (por ejemplo, creadas
// a la vez desde los dos dispositivos), se queda con la más antigua.
export async function localizarCarpeta(token) {
  const consulta = [
    `mimeType = ${literal(TIPO_CARPETA)}`,
    `appProperties has { key=${literal(MARCA_APP.clave)} and value=${literal(MARCA_APP.valor)} }`,
    'trashed = false',
  ].join(' and ');
  const encontradas = await buscar(token, consulta);
  if (encontradas.length) {
    return { carpeta: encontradas[0], creada: false, total: encontradas.length };
  }
  const r = await peticion(token, `${API}/files?fields=id,name,createdTime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: NOMBRE_CARPETA,
      mimeType: TIPO_CARPETA,
      appProperties: { [MARCA_APP.clave]: MARCA_APP.valor },
    }),
  });
  return { carpeta: await r.json(), creada: true, total: 1 };
}

// Subcarpeta de la app (libros o portadas), localizada por su marca dentro de la raíz.
export async function localizarSubcarpeta(token, raizId, tipo) {
  const consulta = [
    `mimeType = ${literal(TIPO_CARPETA)}`,
    `${literal(raizId)} in parents`,
    `appProperties has { key='tipo' and value=${literal(tipo)} }`,
    'trashed = false',
  ].join(' and ');
  const encontradas = await buscar(token, consulta);
  if (encontradas.length) return encontradas[0];
  const r = await peticion(token, `${API}/files?fields=id,name,createdTime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name: tipo,
      mimeType: TIPO_CARPETA,
      parents: [raizId],
      appProperties: { [MARCA_APP.clave]: MARCA_APP.valor, tipo },
    }),
  });
  return r.json();
}

// Todos los archivos con ese nombre, del más antiguo al más reciente.
export function buscarArchivos(token, carpetaId, nombre) {
  const consulta = `name = ${literal(nombre)} and ${literal(carpetaId)} in parents and trashed = false`;
  return buscar(token, consulta);
}

export async function buscarArchivo(token, carpetaId, nombre) {
  return (await buscarArchivos(token, carpetaId, nombre))[0] || null;
}

// Nombres de los archivos (no en la papelera) de una carpeta.
export async function nombresEnCarpeta(token, carpetaId) {
  const consulta = `${literal(carpetaId)} in parents and trashed = false`;
  return new Set((await buscar(token, consulta, 'id,name')).map((a) => a.name));
}

export async function obtenerMetadatos(token, archivoId) {
  const r = await peticion(token, `${API}/files/${encodeURIComponent(archivoId)}?fields=id,name,modifiedTime,trashed`);
  return r.json();
}

export class ErrorJsonIlegible extends Error {}

// Lee un JSON de Drive. Si el contenido no es JSON válido, lanza ErrorJsonIlegible.
export async function leerJson(token, archivoId) {
  const r = await peticion(token, `${API}/files/${encodeURIComponent(archivoId)}?alt=media`);
  const texto = await r.text();
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorJsonIlegible('El archivo de Drive está dañado');
  }
}

export async function renombrar(token, archivoId, nombre) {
  await peticion(token, `${API}/files/${encodeURIComponent(archivoId)}?fields=id`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: nombre }),
  });
}

export async function crearJson(token, carpetaId, nombre, datos) {
  const separador = `lector-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
  const metadatos = { name: nombre, parents: [carpetaId], mimeType: 'application/json' };
  const cuerpo = [
    `--${separador}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadatos),
    `--${separador}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(datos, null, 2),
    `--${separador}--`,
    '',
  ].join('\r\n');
  const r = await peticion(token, `${API_SUBIDA}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${separador}` },
    body: cuerpo,
  });
  return r.json();
}

export async function actualizarJson(token, archivoId, datos) {
  const url = `${API_SUBIDA}/files/${encodeURIComponent(archivoId)}?uploadType=media&fields=id,name,modifiedTime`;
  const r = await peticion(token, url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(datos, null, 2),
  });
  return r.json();
}

const LIMITE_MULTIPART = 4 * 1024 * 1024;

// Sube un archivo binario. Hasta 4 MB en una petición; por encima, con subida
// reanudable, que es lo que Drive recomienda para archivos grandes.
export async function subirArchivo(token, carpetaId, nombre, datos, tipo, propiedades = {}) {
  const metadatos = { name: nombre, parents: [carpetaId], mimeType: tipo, appProperties: propiedades };
  const tamano = datos.byteLength ?? datos.size;
  if (tamano <= LIMITE_MULTIPART) {
    const separador = `lector-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
    const cuerpo = new Blob([
      `--${separador}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadatos)}\r\n`,
      `--${separador}\r\nContent-Type: ${tipo}\r\n\r\n`,
      datos,
      `\r\n--${separador}--\r\n`,
    ]);
    const r = await peticion(token, `${API_SUBIDA}/files?uploadType=multipart&fields=id,name,size`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${separador}` },
      body: cuerpo,
      limite: LIMITE_LARGO_MS,
    });
    return r.json();
  }
  const inicio = await peticion(token, `${API_SUBIDA}/files?uploadType=resumable&fields=id,name,size`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': tipo,
      'X-Upload-Content-Length': String(tamano),
    },
    body: JSON.stringify(metadatos),
  });
  const destino = inicio.headers.get('Location');
  if (!destino) throw new ErrorDrive('Drive no ha devuelto la dirección de subida', 0);
  const r = await peticion(token, destino, {
    method: 'PUT',
    headers: { 'Content-Type': tipo },
    body: datos,
    limite: LIMITE_LARGO_MS,
  });
  return r.json();
}

// Descarga un archivo como ArrayBuffer, avisando del avance (0 a 1).
export async function descargarArchivo(token, archivoId, tamanoEsperado, alAvanzar) {
  const r = await peticion(token, `${API}/files/${encodeURIComponent(archivoId)}?alt=media`, { limite: LIMITE_LARGO_MS });
  const total = Number(r.headers.get('Content-Length')) || tamanoEsperado || 0;
  if (!r.body || !total || !alAvanzar) return r.arrayBuffer();
  const lector = r.body.getReader();
  const trozos = [];
  let recibido = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    trozos.push(value);
    recibido += value.byteLength;
    alAvanzar(Math.min(1, recibido / total));
  }
  return new Blob(trozos).arrayBuffer();
}

// Envía a la papelera de Drive. Si ya no existe, no es un error.
export async function enviarAPapelera(token, archivoId) {
  try {
    await peticion(token, `${API}/files/${encodeURIComponent(archivoId)}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ trashed: true }),
    });
  } catch (e) {
    if (e.estadoHttp !== 404) throw e;
  }
}

// Archivos de una carpeta cuyo nombre empieza por el prefijo indicado.
export async function buscarPorPrefijo(token, carpetaId, prefijo) {
  const consulta = `name contains ${literal(prefijo)} and ${literal(carpetaId)} in parents and trashed = false`;
  return (await buscar(token, consulta)).filter((a) => a.name.startsWith(prefijo));
}
