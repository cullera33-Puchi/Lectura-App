// Acceso mínimo a IndexedDB. En la fase 0 solo se usa el almacén "ajustes"
// como clave-valor (perfil, nombre del dispositivo y sesión de Google).

const NOMBRE_BD = 'lector-epub';
const VERSION_BD = 1;

let bdPromesa = null;

function abrir() {
  if (bdPromesa) return bdPromesa;
  bdPromesa = new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('ajustes')) bd.createObjectStore('ajustes');
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
  return bdPromesa;
}

async function operar(almacen, modo, accion) {
  const bd = await abrir();
  return new Promise((resolver, rechazar) => {
    const tx = bd.transaction(almacen, modo);
    const peticion = accion(tx.objectStore(almacen));
    tx.oncomplete = () => resolver(peticion.result);
    tx.onerror = () => rechazar(tx.error);
    tx.onabort = () => rechazar(tx.error);
  });
}

export function leerAjuste(clave) {
  return operar('ajustes', 'readonly', (a) => a.get(clave));
}

export function guardarAjuste(clave, valor) {
  return operar('ajustes', 'readwrite', (a) => a.put(valor, clave));
}

export function borrarAjuste(clave) {
  return operar('ajustes', 'readwrite', (a) => a.delete(clave));
}
