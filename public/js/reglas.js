// Reglas de negocio del Teatro CaPaz S.A.
// Todas las decisiones (descuento de socio, promociones, disponibilidad, cuotas,
// reprogramación y cancelación) se calculan acá a partir de los datos actuales.

import { db, idx, config } from './estado.js';

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

export const pad = (n, l = 2) => String(n).padStart(l, '0');
export const isoFecha = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const horaActual = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const hoyIso = () => isoFecha(new Date());
export function aFecha(iso, hora = '00:00') {
  const [a, m, d] = iso.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  return new Date(a, m - 1, d, h || 0, mi || 0);
}
export function sumarDias(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
export function fechaHoraFuncion(f) {
  return aFecha(f.fecha, f.hora);
}
export function edad(fechaNac, ref = new Date()) {
  const n = aFecha(fechaNac);
  let e = ref.getFullYear() - n.getFullYear();
  const m = ref.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < n.getDate())) e--;
  return e;
}

// ---------------------------------------------------------------------------
// Cuotas de socios
// Vencen el día configurado de cada mes; si es inhábil (sábado, domingo o feriado)
// el plazo se extiende al primer día hábil siguiente. No hay días de gracia.
// ---------------------------------------------------------------------------

export function esInhabil(d) {
  const feriados = new Set((db.feriados || []).map((f) => f.fecha));
  return d.getDay() === 0 || d.getDay() === 6 || feriados.has(isoFecha(d));
}

export function vencimiento(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  let d = new Date(a, m - 1, config('diaVencimientoCuota', 10));
  while (esInhabil(d)) d = sumarDias(d, 1);
  return isoFecha(d);
}

export function periodos(desde, hasta) {
  const lista = [];
  let [a, m] = desde.split('-').map(Number);
  const [ah, mh] = hasta.split('-').map(Number);
  while (a < ah || (a === ah && m <= mh)) {
    lista.push(`${a}-${pad(m)}`);
    if (++m > 12) {
      m = 1;
      a++;
    }
  }
  return lista;
}

export function mesesEntre(desdePeriodo, hastaPeriodo) {
  return periodos(desdePeriodo, hastaPeriodo).length;
}

/**
 * Estado de cuenta de un socio a una fecha.
 * - pendientes: períodos sin pagar desde el alta hasta el mes actual
 * - vencidas: pendientes cuyo vencimiento ya pasó (son deuda)
 * - alDia: no tiene cuotas vencidas impagas
 */
export function estadoSocio(socio, ref = hoyIso()) {
  const cuotas = (idx.cuotasPorSocio?.get(socio.id) || []).slice().sort((a, b) => a.periodo.localeCompare(b.periodo));
  const pagadas = new Set(cuotas.map((c) => c.periodo));
  const hasta = socio.estado === 'baja' && socio.fechaBaja ? socio.fechaBaja.slice(0, 7) : ref.slice(0, 7);
  const todos = periodos(socio.fechaAlta.slice(0, 7), hasta);
  const importeActual = config('cuotaMensual', 12000);
  const pendientes = todos
    .filter((p) => !pagadas.has(p))
    .map((p) => ({ periodo: p, vencimiento: vencimiento(p), importe: importeActual }));
  const vencidas = pendientes.filter((p) => p.vencimiento < ref);
  const ultima = cuotas[cuotas.length - 1] || null;
  let estado = 'aldia';
  if (socio.estado === 'baja') estado = 'baja';
  else if (vencidas.length) estado = 'deuda';
  return {
    estado,
    alDia: estado === 'aldia',
    cuotas,
    pendientes: socio.estado === 'baja' ? [] : pendientes,
    vencidas: socio.estado === 'baja' ? [] : vencidas,
    deuda: vencidas.reduce((s, p) => s + p.importe, 0),
    ultimaPagada: ultima,
    proxima: socio.estado === 'baja' ? null : pendientes.find((p) => p.vencimiento >= ref) || null,
  };
}

export function socioPorDocumento(nroDoc, incluirBajas = false) {
  const doc = String(nroDoc).replace(/\D/g, '');
  return (db.socios || []).find((s) => s.nroDoc === doc && (incluirBajas || s.estado !== 'baja')) || null;
}

export function socioDeUsuario(usuario) {
  if (!usuario) return null;
  return socioPorDocumento(usuario.nroDoc, true);
}

// ---------------------------------------------------------------------------
// Ubicaciones de la sala
// Platea baja: 350 butacas (14 filas × 25). Palcos en planta alta: 250 (10 × 25).
// ---------------------------------------------------------------------------

let _ubicaciones = null;
export function ubicaciones() {
  if (_ubicaciones && _ubicaciones.version === db.sectores) return _ubicaciones.lista;
  const lista = [];
  for (const s of db.sectores || []) {
    const pref = s.tipoUbicacionId === 'TU1' ? 'P' : 'K';
    for (let f = s.filaDesde; f <= s.filaHasta; f++)
      for (let c = s.colDesde; c <= s.colHasta; c++) {
        const numero = (f - 1) * 25 + c;
        lista.push({ codigo: `${pref}-${numero}`, tipo: pref, fila: f, col: c, numero, sectorId: s.id });
      }
  }
  lista.sort((a, b) => (a.tipo === b.tipo ? a.numero - b.numero : a.tipo === 'P' ? -1 : 1));
  _ubicaciones = { version: db.sectores, lista, mapa: new Map(lista.map((u) => [u.codigo, u])) };
  return lista;
}
export function ubicacion(codigo) {
  ubicaciones();
  return _ubicaciones.mapa.get(codigo);
}
export function describirUbicacion(codigo) {
  const u = ubicacion(codigo);
  if (!u) return codigo;
  const s = idx.sectores.get(u.sectorId);
  return u.tipo === 'P'
    ? `${s.nombre} · Fila ${u.fila} · Butaca ${u.numero}`
    : `${s.nombre} · Fila ${u.fila} · Palco ${u.numero}`;
}
export function ubicacionCorta(codigo) {
  const u = ubicacion(codigo);
  if (!u) return codigo;
  return u.tipo === 'P' ? `Platea ${u.numero}` : `Palco ${u.numero}`;
}

/** Reservas online sin pagar que superaron el tiempo de espera */
export function reservaVencida(venta) {
  if (venta.estado !== 'pendiente') return false;
  const min = config('minutosReserva', 10);
  return Date.now() - aFecha(venta.fecha, venta.hora).getTime() > (min + 1) * 60000;
}

/** Ubicaciones no disponibles de una función (vendidas, usadas o reservadas) */
export function ocupadas(funcionId) {
  const set = new Set();
  for (const e of idx.entradasPorFuncion?.get(funcionId) || []) {
    if (e.estado === 'valida' || e.estado === 'usada') set.add(e.ubicacion);
    else if (e.estado === 'reservada') {
      const v = idx.ventas.get(e.ventaId);
      if (v && !reservaVencida(v)) set.add(e.ubicacion);
    }
  }
  return set;
}

export function disponibilidad(funcionId) {
  const total = ubicaciones().length;
  const occ = ocupadas(funcionId).size;
  return { total, ocupadas: occ, libres: total - occ, porcentaje: total ? occ / total : 0 };
}

export function libresPorSector(funcionId) {
  const occ = ocupadas(funcionId);
  const r = {};
  for (const u of ubicaciones()) {
    if (!r[u.sectorId]) r[u.sectorId] = 0;
    if (!occ.has(u.codigo)) r[u.sectorId]++;
  }
  return r;
}

/** Elige automáticamente las mejores N ubicaciones libres y contiguas de un sector */
export function mejoresUbicaciones(funcionId, sectorId, cantidad, excluir = new Set()) {
  const occ = ocupadas(funcionId);
  const s = idx.sectores.get(sectorId);
  const centro = (s.colDesde + s.colHasta) / 2;
  const libres = ubicaciones().filter((u) => u.sectorId === sectorId && !occ.has(u.codigo) && !excluir.has(u.codigo));
  const porFila = new Map();
  for (const u of libres) {
    if (!porFila.has(u.fila)) porFila.set(u.fila, []);
    porFila.get(u.fila).push(u);
  }
  let mejor = null;
  for (const [fila, lista] of porFila) {
    lista.sort((a, b) => a.col - b.col);
    for (let i = 0; i + cantidad <= lista.length; i++) {
      const tramo = lista.slice(i, i + cantidad);
      if (tramo[cantidad - 1].col - tramo[0].col !== cantidad - 1) continue;
      const medio = (tramo[0].col + tramo[cantidad - 1].col) / 2;
      const puntaje = fila * 3 + Math.abs(medio - centro);
      if (!mejor || puntaje < mejor.puntaje) mejor = { puntaje, tramo };
    }
  }
  if (mejor) return mejor.tramo.map((u) => u.codigo);
  // Si no hay contiguas, las más cercanas al escenario
  return libres
    .sort((a, b) => a.fila - b.fila || Math.abs(a.col - centro) - Math.abs(b.col - centro))
    .slice(0, cantidad)
    .map((u) => u.codigo);
}

// ---------------------------------------------------------------------------
// Precios, descuentos y promociones
// ---------------------------------------------------------------------------

export function precio(funcionId, sectorId) {
  return idx.precios.get(funcionId + '|' + sectorId) || 0;
}
export function precioDesde(funcionId) {
  const ps = (db.sectores || []).map((s) => precio(funcionId, s.id)).filter(Boolean);
  return ps.length ? Math.min(...ps) : 0;
}

export function promocionesAplicables(funcion, fechaVenta = hoyIso()) {
  return (db.promociones || []).filter((p) => {
    if (p.estado !== 'activa') return false;
    if (fechaVenta < p.vigenciaDesde || fechaVenta > p.vigenciaHasta) return false;
    if (p.condicion === 'funcion-martes') return aFecha(funcion.fecha).getDay() === 2;
    if (p.condicion.startsWith('funcion-desde:')) return funcion.fecha >= p.condicion.split(':')[1];
    return p.condicion === 'todas';
  });
}

/**
 * Calcula el importe de una operación.
 * El descuento de socio (30 %) y las promociones no se combinan: se aplica el beneficio mayor.
 * El cargo por servicio solo se cobra en la venta online.
 */
export function calcularImporte({ funcion, codigos, canal, socioAlDia }) {
  const lineas = codigos.map((c) => {
    const u = ubicacion(c);
    return { codigo: c, sectorId: u.sectorId, precio: precio(funcion.id, u.sectorId) };
  });
  const subtotal = lineas.reduce((s, l) => s + l.precio, 0);
  const pctSocio = config('descuentoSocio', 30);
  const promos = promocionesAplicables(funcion);
  const mejorPromo = promos.sort((a, b) => b.valor - a.valor)[0] || null;
  let beneficio = null;
  if (socioAlDia && (!mejorPromo || pctSocio >= mejorPromo.valor)) beneficio = { tipo: 'socio', nombre: 'Socio al día', valor: pctSocio };
  else if (mejorPromo) beneficio = { tipo: 'promo', nombre: mejorPromo.nombre, valor: mejorPromo.valor, promo: mejorPromo };
  const descuento = beneficio ? Math.round((subtotal * beneficio.valor) / 100) : 0;
  const cargo = canal === 'online' ? Math.round((subtotal * config('cargoServicioOnline', 10)) / 100) : 0;
  return {
    lineas,
    subtotal,
    beneficio,
    descuento,
    detalle: beneficio ? `${beneficio.nombre} ${beneficio.valor} %` : '',
    cargo,
    total: subtotal - descuento + cargo,
    promoDisponible: mejorPromo,
  };
}

// ---------------------------------------------------------------------------
// Reprogramación y cancelación (reglas definidas por el grupo para el TPI)
// ---------------------------------------------------------------------------

export function horasHasta(funcion) {
  return (fechaHoraFuncion(funcion).getTime() - Date.now()) / 36e5;
}
export function diasHasta(funcion) {
  return Math.floor(horasHasta(funcion) / 24);
}

export function politicaCancelacion(funcion) {
  const dias = diasHasta(funcion);
  if (horasHasta(funcion) <= 0) return { puede: false, porcentaje: 0, dias, motivo: 'La función ya se realizó.' };
  if (dias >= config('reintegroTotalDias', 15)) return { puede: true, porcentaje: 100, dias };
  if (dias >= config('reintegroParcialDias', 7)) return { puede: true, porcentaje: 50, dias };
  return { puede: true, porcentaje: 0, dias };
}

/**
 * Funciones a las que se puede reprogramar una entrada:
 * misma obra, otra fecha, al menos 48 h antes de ambas funciones,
 * mismo precio para el sector y lugares libres suficientes en ese sector.
 */
export function opcionesReprogramacion(entradasVenta) {
  const e0 = entradasVenta[0];
  const actual = idx.funciones.get(e0.funcionId);
  const minHoras = config('reprogramarHorasAntes', 48);
  const sectorId = e0.sectorId;
  const cant = entradasVenta.length;
  const motivo = [];
  if (entradasVenta.some((e) => e.reprogramada)) motivo.push('Las entradas ya fueron reprogramadas una vez.');
  if (horasHasta(actual) < minHoras) motivo.push(`Se puede reprogramar hasta ${minHoras} h antes de la función.`);
  const opciones = (db.funciones || [])
    .filter((f) => f.obraId === actual.obraId && f.id !== actual.id && f.estado === 'programada')
    .map((f) => {
      const libres = libresPorSector(f.id)[sectorId] || 0;
      const mismoPrecio = precio(f.id, sectorId) === precio(actual.id, sectorId);
      const aTiempo = horasHasta(f) >= minHoras;
      let razon = '';
      if (!aTiempo) razon = 'Faltan menos de 48 h';
      else if (!mismoPrecio) razon = 'Precio distinto para el sector';
      else if (libres < cant) razon = 'Sin lugares suficientes en el sector';
      return { funcion: f, libres, ok: !razon, razon };
    });
  return { permitido: motivo.length === 0, motivo, opciones, sectorId, cantidad: cant };
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------

export const ESTADO_VENTA = {
  confirmada: ['Confirmada', 'exito'],
  pendiente: ['Esperando pago', 'alerta'],
  cancelada: ['Cancelada', 'error'],
  rechazada: ['Pago rechazado', 'error'],
  vencida: ['Reserva vencida', 'error'],
};
export const ESTADO_ENTRADA = {
  valida: ['Válida', 'exito'],
  usada: ['Ingresó', 'info'],
  reservada: ['Reservada', 'alerta'],
  cancelada: ['Cancelada', 'error'],
  anulada: ['Anulada', 'error'],
};
export const ESTADO_SOCIO = {
  aldia: ['Al día', 'exito'],
  deuda: ['Con deuda', 'alerta'],
  baja: ['Baja', 'error'],
};
