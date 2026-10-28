// Fechas de los cambios que se fusionan por "gana la fecha más reciente".
// Si la hora de un dispositivo va atrasada, un cambio hecho en él después de
// recibir otro del otro dispositivo llevaría una fecha anterior y perdería al
// fusionar (mejora 18). Por eso la fecha de un cambio es siempre posterior a
// la del dato que sustituye.

const comoMs = (f) => (f ? Date.parse(f) : NaN);

export function fechaPosterior(...anteriores) {
  const previas = anteriores.map(comoMs).filter(Number.isFinite);
  const ultima = previas.length ? Math.max(...previas) : -Infinity;
  return new Date(Math.max(Date.now(), ultima + 1)).toISOString();
}

// Diferencia entre la hora del dispositivo y la de Google, medida con la
// fecha que Drive pone a un JSON al subirlo. Positiva: el dispositivo va
// atrasado. Solo vale si la petición fue rápida.
export function medirDesfase(antesMs, despuesMs, fechaServidor) {
  const servidor = comoMs(fechaServidor);
  if (!Number.isFinite(servidor) || despuesMs - antesMs > 10000) return null;
  return Math.round(servidor - (antesMs + despuesMs) / 2);
}
