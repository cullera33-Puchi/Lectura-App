// Acceso a IndexedDB.
//
// Almacenes (punto 5 del diseño):
//   ajustes        clave-valor: perfil, dispositivo, lectura, sesión de Google
//   libros         metadatos por id (huella SHA-256)
//   archivos       EPUB descargado por id (Blob). Separado de libros para no
//                  cargar todos los archivos al pintar la biblioteca
//   portadas       miniatura JPEG por id (Blob)
//   ubicaciones    caché de las ubicaciones de epub.js por id, para calcular
//                  el porcentaje sin regenerarlas en cada apertura
//   progreso       última posición local por id
//   pendientes     cambios aún no sincronizados, por clave "<tipo>:<id>"
//   sincronizacion fecha de la última sincronización y copia de los JSON remotos
//   sesiones       sesiones de lectura (autoincremental)

const NOMBRE_BD = 'lector-epub';
const VERSION_BD = 2;

let bdPromesa = null;
const oyentesEscritura = new Set();

// Aviso tras cada escritura, con los almacenes afectados.
export function alEscribir(fn) {
  oyentesEscritura.add(fn);
}

function avisarEscritura(almacenes) {
  const lista = Array.isArray(almacenes) ? almacenes : [almacenes];
  oyentesEscritura.forEach((fn) => fn(lista));
}

function abrir() {
  if (bdPromesa) return bdPromesa;
  bdPromesa = new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      const crear = (nombre, opciones) => {
        if (!bd.objectStoreNames.contains(nombre)) return bd.createObjectStore(nombre, opciones);
        return null;
      };
      crear('ajustes');
      crear('libros', { keyPath: 'id' });
      crear('archivos');
      crear('portadas');
      crear('ubicaciones');
      crear('progreso', { keyPath: 'id' });
      crear('pendientes', { keyPath: 'clave' });
      crear('sincronizacion');
      const sesiones = crear('sesiones', { keyPath: 'clave', autoIncrement: true });
      sesiones?.createIndex('libro', 'libroId');
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
    peticion.onblocked = () => rechazar(new Error('Hay otra pestaña de la app abierta con una versión anterior. Ciérrala y recarga.'));
  });
  return bdPromesa;
}

async function operar(almacenes, modo, accion) {
  const bd = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(almacenes, modo);
    let resultado;
    const valor = accion(tx);
    if (valor && 'onsuccess' in valor) valor.onsuccess = () => { resultado = valor.result; };
    else resultado = valor;
    tx.oncomplete = () => {
      if (modo === 'readwrite') avisarEscritura(almacenes);
      resolver(resultado);
    };
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error || new Error('Operación cancelada'));
  });
}

export function leer(almacen, clave) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).get(clave));
}

export function leerTodos(almacen) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).getAll());
}

// Con keyPath, la clave va dentro del valor y no se pasa.
export function guardar(almacen, valor, clave) {
  return operar(almacen, 'readwrite', (tx) => {
    const a = tx.objectStore(almacen);
    return clave === undefined ? a.put(valor) : a.put(valor, clave);
  });
}

export function borrar(almacen, clave) {
  return operar(almacen, 'readwrite', (tx) => tx.objectStore(almacen).delete(clave));
}

// Varias escrituras en una sola transacción: [{ almacen, valor, clave, borrar }]
export function escribirVarios(operaciones) {
  const almacenes = [...new Set(operaciones.map((o) => o.almacen))];
  return operar(almacenes, 'readwrite', (tx) => {
    for (const o of operaciones) {
      const a = tx.objectStore(o.almacen);
      if (o.borrar) a.delete(o.clave);
      else if (o.clave === undefined) a.put(o.valor);
      else a.put(o.valor, o.clave);
    }
    return null;
  });
}

export const leerAjuste = (clave) => leer('ajustes', clave);
export const guardarAjuste = (clave, valor) => guardar('ajustes', valor, clave);
export const borrarAjuste = (clave) => borrar('ajustes', clave);

export function leerClaves(almacen) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).getAllKeys());
}
