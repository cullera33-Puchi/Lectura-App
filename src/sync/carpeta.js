// Localiza o crea la carpeta de la app en Drive y guarda su id.

import { obtenerUsuario, localizarCarpeta } from './drive.js';
import { fijarEmail } from './google.js';
import { guardarAjuste } from '../datos/almacen.js';
import { registrar } from '../ui/registro.js';

export async function prepararCarpeta(token) {
  const usuario = await obtenerUsuario(token).catch((e) => {
    registrar(`No se pudo leer el usuario de Drive: ${e.message}`, 'error');
    return null;
  });
  if (usuario?.emailAddress) await fijarEmail(usuario.emailAddress);
  const { carpeta, creada, total } = await localizarCarpeta(token);
  await guardarAjuste('carpetaId', carpeta.id);
  const texto = `Carpeta "${carpeta.name}" ${creada ? 'creada' : 'localizada'} en Google Drive.`;
  registrar(`${texto} id=${carpeta.id}${total > 1 ? ` (hay ${total} carpetas marcadas; se usa la más antigua)` : ''}`);
  return texto;
}
