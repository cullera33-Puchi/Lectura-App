// Drive falso en memoria para Playwright: comparte estado entre contextos.
const archivos = new Map(); // id -> { id, name, mimeType, parents, appProperties, trashed, contenido(Buffer), createdTime, modifiedTime }
let n = 0;
const subidas = new Map();
const ahora = () => new Date(Date.now() + n).toISOString();

function crear(meta, contenido) {
  const id = 'f' + (++n);
  const a = { id, name: meta.name, mimeType: meta.mimeType || 'application/octet-stream', parents: meta.parents || [], appProperties: meta.appProperties || {}, trashed: false, contenido: contenido || Buffer.alloc(0), createdTime: ahora(), modifiedTime: ahora() };
  archivos.set(id, a);
  return a;
}
const publico = (a) => ({ id: a.id, name: a.name, createdTime: a.createdTime, modifiedTime: a.modifiedTime, size: String(a.contenido.length), trashed: a.trashed });

function filtrar(q) {
  let r = [...archivos.values()];
  if (q.includes('trashed = false')) r = r.filter((a) => !a.trashed);
  let m;
  if ((m = /mimeType = '([^']+)'/.exec(q))) r = r.filter((a) => a.mimeType === m[1]);
  if ((m = /name = '([^']+)'/.exec(q))) r = r.filter((a) => a.name === m[1]);
  if ((m = /name contains '([^']+)'/.exec(q))) r = r.filter((a) => a.name.includes(m[1]));
  if ((m = /'([^']+)' in parents/.exec(q))) r = r.filter((a) => a.parents.includes(m[1]));
  const re = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/g;
  while ((m = re.exec(q))) { const [k, v] = [m[1], m[2]]; r = r.filter((a) => a.appProperties[k] === v); }
  return r.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
}

function partesMultipart(cuerpo, tipo) {
  const limite = '--' + /boundary=([^;]+)/.exec(tipo)[1];
  const partes = [];
  let i = cuerpo.indexOf(limite);
  while (i !== -1) {
    const inicio = i + limite.length;
    if (cuerpo.slice(inicio, inicio + 2).toString() === '--') break;
    const sig = cuerpo.indexOf(limite, inicio);
    let parte = cuerpo.slice(inicio + 2, sig); // salta \r\n
    const sep = parte.indexOf('\r\n\r\n');
    let datos = parte.slice(sep + 4);
    if (datos.slice(-2).toString() === '\r\n') datos = datos.slice(0, -2);
    partes.push(datos);
    i = sig;
  }
  return partes;
}

async function manejar(route) {
  const req = route.request();
  const u = new URL(req.url());
  const metodo = req.method();
  const json = (d, extra = {}) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d), headers: { 'Access-Control-Expose-Headers': 'Location', ...extra } });
  const no = () => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { message: 'File not found' } }) });
  if (u.pathname === '/drive/v3/about') return json({ user: { emailAddress: 'yo@ejemplo.com' } });
  if (u.pathname === '/drive/v3/files' && metodo === 'GET') return json({ files: filtrar(u.searchParams.get('q')).map(publico) });
  if (u.pathname === '/drive/v3/files' && metodo === 'POST') return json(publico(crear(JSON.parse(req.postData()))));
  if (u.pathname === '/upload/drive/v3/files' && metodo === 'POST') {
    const tipo = u.searchParams.get('uploadType');
    if (tipo === 'multipart') {
      const [meta, contenido] = partesMultipart(req.postDataBuffer(), req.headers()['content-type']);
      return json(publico(crear(JSON.parse(meta.toString()), contenido)));
    }
    if (tipo === 'resumable') {
      const id = 'u' + (++n); subidas.set(id, JSON.parse(req.postData()));
      return json({}, { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}` });
    }
  }
  if (u.pathname === '/upload/drive/v3/files' && metodo === 'PUT') {
    const meta = subidas.get(u.searchParams.get('upload_id'));
    return json(publico(crear(meta, req.postDataBuffer())));
  }
  const m = /\/files\/([^/]+)$/.exec(u.pathname);
  const a = m && archivos.get(m[1]);
  if (!a) return no();
  if (metodo === 'PATCH' && u.pathname.startsWith('/upload')) { a.contenido = req.postDataBuffer(); a.modifiedTime = ahora(); return json(publico(a)); }
  if (metodo === 'PATCH') { Object.assign(a, JSON.parse(req.postData())); return json(publico(a)); }
  if (u.searchParams.get('alt') === 'media') return route.fulfill({ status: 200, body: a.contenido, headers: { 'Content-Length': String(a.contenido.length), 'Content-Type': a.mimeType } });
  return json(publico(a));
}

const GIS = `window.google = { accounts: { oauth2: {
  initTokenClient: (c) => ({ requestAccessToken: () => setTimeout(() => c.callback({ access_token: 'T', expires_in: 3599 }), 30) }),
  hasGrantedAllScopes: () => true, revoke: (t, cb) => cb && cb() } } };`;

async function instalar(ctx) {
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: GIS }));
  await ctx.route('https://www.googleapis.com/**', manejar);
}

function estado() {
  const vivos = [...archivos.values()].filter((a) => !a.trashed);
  const json = (nombre) => { const a = vivos.find((x) => x.name === nombre); return a ? JSON.parse(a.contenido.toString()) : null; };
  const sesiones = vivos.filter((x) => x.name.startsWith('sesiones-')).map((x) => JSON.parse(x.contenido.toString()));
  return { sesiones, vivos: vivos.map((a) => a.name), papelera: [...archivos.values()].filter((a) => a.trashed).map((a) => a.name), biblioteca: json('biblioteca.json'), progreso: json('progreso.json') };
}
module.exports = { instalar, estado };
module.exports.danar = (nombre) => { for (const a of archivos.values()) if (a.name === nombre && !a.trashed) a.contenido = Buffer.from('{ esto no es json'); };
module.exports.aPapelera = (nombre) => { for (const a of archivos.values()) if (a.name === nombre) a.trashed = true; };
module.exports.archivos = archivos;
