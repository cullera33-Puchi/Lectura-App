// Acceso a IndexedDB.
//
// Almacenes (punto 5 del diseño):
//   ajustes        clave-valor: perfil, dispositivo, lectura, sesión de Google
//   libros         metadatos por id (huella SHA-256)
//   archivos       EPUB descargado por id (ArrayBuffer). Separado de libros para
//                  no cargar todos los archivos al pintar la biblioteca
//   portadas       miniatura JPEG por id (Blob)
//   ubicaciones    caché de las ubicaciones de epub.js por id, para calcular
//                  el porcentaje sin regenerarlas en cada apertura
//   progreso       última posición local por id
//   pendientes     cambios aún no sincronizados, por clave "<tipo>:<id>"
//   sincronizacion copia de los JSON remotos y datos de la última sincronización
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

// iOS puede cerrar la conexión cuando suspende la app. En ese caso se olvida
// la conexión y la siguiente operación abre otra.
function olvidarConexion() {
  bdPromesa = null;
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
    peticion.onsuccess = () => {
      const bd = peticion.result;
      bd.onclose = olvidarConexion;
      bd.onversionchange = () => {
        bd.close();
        olvidarConexion();
      };
      resolver(bd);
    };
    peticion.onerror = () => {
      olvidarConexion();
      rechazar(peticion.error);
    };
    // Otra pestaña con una versión anterior tiene la base abierta. La apertura
    // se completa sola cuando esa pestaña la cierra; mientras, se avisa.
    peticion.onblocked = () => console.warn('IndexedDB: esperando a que otra pestaña cierre la base de datos');
  });
  return bdPromesa;
}

function ejecutar(bd, almacenes, modo, accion, avisados = almacenes) {
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(almacenes, modo);
    // accion devuelve una petición (su resultado), una función que da el
    // resultado al terminar la transacción, o un valor.
    let resultado;
    const valor = accion(tx);
    if (valor && 'onsuccess' in valor) valor.onsuccess = () => { resultado = valor.result; };
    else resultado = valor;
    tx.oncomplete = () => {
      if (modo === 'readwrite' && avisados.length) avisarEscritura(avisados);
      resolver(typeof resultado === 'function' ? resultado() : resultado);
    };
    // El error de una petición llega aquí antes de que la transacción tenga
    // tx.error: se usa el de la propia petición.
    tx.onerror = (ev) => rechazar(ev.target?.error || tx.error || new Error('Error de la base de datos'));
    tx.onabort = () => rechazar(tx.error || new Error('Operación cancelada'));
  });
}

async function operar(almacenes, modo, accion, avisados) {
  let bd = await abrir();
  try {
    return await ejecutar(bd, almacenes, modo, accion, avisados);
  } catch (e) {
    // Conexión cerrada por el sistema: se reabre y se reintenta una vez.
    if (e?.name !== 'InvalidStateError' && e?.name !== 'UnknownError') throw e;
    olvidarConexion();
    bd = await abrir();
    return ejecutar(bd, almacenes, modo, accion, avisados);
  }
}

export function leer(almacen, clave) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).get(clave));
}

export function leerTodos(almacen) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).getAll());
}

export function leerClaves(almacen) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).getAllKeys());
}

export function contar(almacen) {
  return operar(almacen, 'readonly', (tx) => tx.objectStore(almacen).count());
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
// sinAviso: almacenes cuya escritura no hace falta avisar (por ejemplo, un
// pendiente que ya existía y solo cambia de fecha).
export function escribirVarios(operaciones, { sinAviso = [] } = {}) {
  const almacenes = [...new Set(operaciones.map((o) => o.almacen))];
  const avisados = almacenes.filter((a) => !sinAviso.includes(a));
  return operar(almacenes, 'readwrite', (tx) => {
    for (const o of operaciones) {
      const a = tx.objectStore(o.almacen);
      if (o.borrar) a.delete(o.clave);
      else if (o.clave === undefined) a.put(o.valor);
      else a.put(o.valor, o.clave);
    }
    return null;
  }, avisados);
}

// Lee un registro y escribe su nueva versión en la misma transacción, para que
// ninguna otra escritura se cuele entre la lectura y la escritura.
// transformar(actual) devuelve { operaciones, resultado } o null para no hacer nada.
export function leerYEscribir(almacenes, almacenLectura, clave, transformar) {
  return operar(almacenes, 'readwrite', (tx) => {
    const salida = { resultado: undefined };
    const peticion = tx.objectStore(almacenLectura).get(clave);
    peticion.onsuccess = () => {
      const cambio = transformar(peticion.result);
      if (!cambio) return;
      salida.resultado = cambio.resultado;
      for (const o of cambio.operaciones) {
        const a = tx.objectStore(o.almacen);
        if (o.borrar) a.delete(o.clave);
        else if (o.clave === undefined) a.put(o.valor);
        else a.put(o.valor, o.clave);
      }
    };
    return () => salida.resultado;
  });
}

export const leerAjuste = (clave) => leer('ajustes', clave);
export const guardarAjuste = (clave, valor) => guardar('ajustes', valor, clave);
export const borrarAjuste = (clave) => borrar('ajustes', clave);
