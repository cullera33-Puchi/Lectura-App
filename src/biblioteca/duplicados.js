// Aviso de duplicados (punto 7): el mismo libro importado dos veces desde
// archivos distintos (otra edición, otra conversión). Como cada archivo tiene
// su huella, la app los trata como libros diferentes. Se detectan por el
// identificador del EPUB o, si no coincide, por título y autor.
//
// Desde la biblioteca se revisan: "Quedarme con este" elimina las otras copias
// (con la misma baja sincronizada de siempre) y "No son el mismo libro" deja
// de avisar de ese grupo en este dispositivo.

import { eliminarLibro } from '../datos/libros.js';
import { leerAjuste, guardarAjuste } from '../datos/almacen.js';
import { crearPortada, textoEstado } from './portadas.js';
import { abrirFicha, cerrarFicha } from '../ui/ficha.js';
import { mostrarHoja } from '../ui/hoja.js';
import { mostrarAviso } from '../ui/aviso.js';
import { registrar } from '../ui/registro.js';

const CLAVE_IGNORADOS = 'duplicadosIgnorados';

function normalizar(texto) {
  return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ').trim();
}

// Identificadores que no sirven para comparar (vacíos o genéricos).
function identificadorUtil(id) {
  const n = normalizar(id);
  return n.length >= 6 && !/^(urn )?(uuid )?0+$/.test(n) ? n : null;
}

// Grupos de libros que parecen el mismo. Cada grupo lleva una clave estable
// (los id ordenados) para poder ignorarlo.
export function gruposDuplicados(libros, ignorados = []) {
  const vivos = libros.filter((l) => !l.eliminado);
  const padre = new Map(vivos.map((l) => [l.id, l.id]));
  const raiz = (id) => (padre.get(id) === id ? id : raiz(padre.get(id)));
  const unir = (a, b) => padre.set(raiz(a), raiz(b));
  const porClave = new Map();
  for (const l of vivos) {
    const claves = [];
    const ident = identificadorUtil(l.identificadorEpub);
    if (ident) claves.push(`i:${ident}`);
    const titulo = normalizar(l.titulo);
    if (titulo) claves.push(`t:${titulo}|${normalizar(l.autor)}`);
    for (const c of claves) {
      if (porClave.has(c)) unir(l.id, porClave.get(c));
      else porClave.set(c, l.id);
    }
  }
  const grupos = new Map();
  for (const l of vivos) {
    const r = raiz(l.id);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(l);
  }
  const ignorar = new Set(ignorados);
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((libros) => ({ clave: libros.map((l) => l.id).sort().join('+'), libros }))
    .filter((g) => !ignorar.has(g.clave));
}

export async function leerIgnorados() {
  return (await leerAjuste(CLAVE_IGNORADOS)) || [];
}

async function ignorar(clave) {
  const actuales = await leerIgnorados();
  await guardarAjuste(CLAVE_IGNORADOS, [...new Set([...actuales, clave])]);
}

function tamano(bytes) {
  if (!bytes) return null;
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`;
}

function fecha(iso) {
  return iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '') : null;
}

// leerLibros(): los libros con su progreso (librosParaMostrar). alCambiar:
// repinta la biblioteca. Tras cada decisión se vuelve a mostrar la revisión
// con los grupos que quedan, o se cierra si ya no queda ninguno.
export async function revisarDuplicados(leerLibros, alCambiar) {
  const grupos = gruposDuplicados(await leerLibros(), await leerIgnorados());
  const partes = [];
  const seguir = async () => {
    await alCambiar();
    const quedan = gruposDuplicados(await leerLibros(), await leerIgnorados());
    if (quedan.length) await revisarDuplicados(leerLibros, alCambiar);
    else {
      cerrarFicha();
      mostrarAviso('Revisión de duplicados terminada');
    }
  };
  if (!grupos.length) {
    cerrarFicha();
    return;
  }
  const intro = document.createElement('p');
  intro.className = 'tarjeta-texto resumen-intro';
  intro.textContent = 'Estos libros parecen el mismo importado desde archivos distintos. Quédate con una copia y las demás se eliminarán, también de Drive y del otro dispositivo al sincronizar.';
  partes.push(intro);

  for (const grupo of grupos) {
    const caja = document.createElement('div');
    caja.className = 'grupo grupo-duplicados';
    for (const libro of grupo.libros) {
      const fila = document.createElement('div');
      fila.className = 'fila fila-duplicado';
      const texto = document.createElement('div');
      texto.className = 'duplicado-texto';
      const t = document.createElement('div');
      t.className = 't-titulo';
      t.textContent = libro.titulo;
      const autor = document.createElement('div');
      autor.className = 't-fecha';
      autor.textContent = libro.autor || '';
      const estado = document.createElement('div');
      estado.className = 't-fecha';
      estado.textContent = textoEstado(libro);
      const d = document.createElement('div');
      d.className = 't-fecha';
      d.textContent = [tamano(libro.tamanoBytes), fecha(libro.fechaAlta) && `añadido el ${fecha(libro.fechaAlta)}`]
        .filter(Boolean).join(', ');
      const quedarme = document.createElement('button');
      quedarme.type = 'button';
      quedarme.className = 'boton-secundario';
      quedarme.textContent = 'Quedarme con este';
      quedarme.addEventListener('click', async () => {
        const otros = grupo.libros.filter((l) => l.id !== libro.id);
        const confirmar = await mostrarHoja(
          `Se eliminará ${otros.length === 1 ? 'la otra copia' : `las otras ${otros.length} copias`} de "${libro.titulo}", con su avance. ¿Continuar?`,
          [{ id: 'si', texto: 'Eliminar las demás', destructivo: true }],
        );
        if (confirmar !== 'si') return;
        for (const o of otros) await eliminarLibro(o.id);
        registrar(`Duplicados de "${libro.titulo}": eliminadas ${otros.length} copias`);
        await seguir();
      });
      texto.append(t, autor, estado, d, quedarme);
      fila.append(await crearPortada(libro), texto);
      caja.appendChild(fila);
    }
    const noSon = document.createElement('button');
    noSon.type = 'button';
    noSon.className = 'fila fila-boton';
    noSon.textContent = 'No son el mismo libro';
    noSon.addEventListener('click', async () => {
      await ignorar(grupo.clave);
      registrar(`Duplicados ignorados: ${grupo.libros[0].titulo}`);
      await seguir();
    });
    caja.appendChild(noSon);
    partes.push(caja);
  }
  abrirFicha('Posibles duplicados', partes);
}
