// Edición a mano de los datos de un libro (v3): título, autor, serie, número
// en la serie y portada. Los cambios viajan al otro dispositivo al sincronizar.

import { editarMetadatos, cambiarPortada } from '../datos/libros.js';
import { reducirPortada } from './importar.js';
import { crearPortada } from './portadas.js';
import { mostrarFormulario } from '../ui/hoja.js';
import { mostrarAviso } from '../ui/aviso.js';
import { registrar } from '../ui/registro.js';

function campo(etiqueta, valor, opciones = {}) {
  const fila = document.createElement('label');
  fila.className = 'campo-formulario';
  const texto = document.createElement('span');
  texto.textContent = etiqueta;
  const entrada = document.createElement('input');
  entrada.type = opciones.tipo || 'text';
  entrada.value = valor ?? '';
  entrada.autocomplete = 'off';
  if (opciones.placeholder) entrada.placeholder = opciones.placeholder;
  if (entrada.type === 'number') {
    entrada.inputMode = 'decimal';
    entrada.min = '0';
    entrada.step = 'any';
  }
  fila.append(texto, entrada);
  return { fila, entrada };
}

// Devuelve true si se ha cambiado algo.
export async function editarLibro(libro) {
  const titulo = campo('Título', libro.titulo);
  const autor = campo('Autor', libro.autor, { placeholder: 'Autor desconocido' });
  const serie = campo('Serie', libro.serie, { placeholder: 'Ninguna' });
  const numero = campo('Número en la serie', libro.numeroSerie, { tipo: 'number', placeholder: 'Ninguno' });

  // Portada: la actual y un botón para elegir otra imagen.
  let nuevaPortada = null;
  const filaPortada = document.createElement('div');
  filaPortada.className = 'campo-portada';
  const muestra = document.createElement('div');
  muestra.className = 'muestra-portada';
  muestra.appendChild(await crearPortada(libro));
  const elegir = document.createElement('label');
  elegir.className = 'boton-secundario';
  elegir.textContent = 'Cambiar portada';
  const archivo = document.createElement('input');
  archivo.type = 'file';
  archivo.accept = 'image/*';
  archivo.hidden = true;
  elegir.appendChild(archivo);
  archivo.addEventListener('change', async () => {
    const elegido = archivo.files?.[0];
    archivo.value = '';
    if (!elegido) return;
    try {
      nuevaPortada = await reducirPortada(elegido);
      const img = document.createElement('img');
      img.className = 'portada';
      img.alt = '';
      img.src = URL.createObjectURL(nuevaPortada);
      img.onload = () => URL.revokeObjectURL(img.src);
      muestra.replaceChildren(img);
    } catch {
      mostrarAviso('No se puede leer esa imagen. Prueba con un JPEG o PNG.', 6000);
    }
  });
  filaPortada.append(muestra, elegir);

  const guardar = await mostrarFormulario('Editar información', [
    filaPortada, titulo.fila, autor.fila, serie.fila, numero.fila,
  ]);
  if (!guardar) return false;

  const cambios = {};
  const texto = (e) => e.value.trim() || null;
  const nuevoTitulo = texto(titulo.entrada);
  if (nuevoTitulo && nuevoTitulo !== libro.titulo) cambios.titulo = nuevoTitulo;
  if (texto(autor.entrada) !== (libro.autor || null)) cambios.autor = texto(autor.entrada);
  if (texto(serie.entrada) !== (libro.serie || null)) cambios.serie = texto(serie.entrada);
  const n = numero.entrada.value === '' ? null : Number(numero.entrada.value);
  const nuevoNumero = Number.isFinite(n) && n >= 0 ? n : null;
  if (nuevoNumero !== (libro.numeroSerie ?? null)) cambios.numeroSerie = nuevoNumero;

  if (!Object.keys(cambios).length && !nuevaPortada) return false;
  if (Object.keys(cambios).length) await editarMetadatos(libro.id, cambios);
  if (nuevaPortada) await cambiarPortada(libro.id, nuevaPortada);
  registrar(`Editada la información de "${cambios.titulo || libro.titulo}"`);
  mostrarAviso('Cambios guardados. Llegarán al otro dispositivo al sincronizar.', 4500);
  return true;
}
