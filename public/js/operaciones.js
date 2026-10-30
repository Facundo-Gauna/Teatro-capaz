// Operaciones del sistema que modifican los datos y los guardan en los archivos.
// Cada función corresponde a una actividad de los procesos de negocio.
import { db, idx, guardar, nuevoId, siguienteNumero, config } from './estado.js';
import { hoyIso, horaActual, estadoSocio, ocupadas, politicaCancelacion, ubicacion, precio, vencimiento } from './reglas.js';

function codigoEntrada() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s;
  const existentes = new Set((db.entradas || []).map((e) => e.codigo));
  do {
    s = 'CPZ-';
    for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
  } while (existentes.has(s));
  return s;
}

/**
 * Registrar la venta (online queda "pendiente" hasta que la plataforma externa confirme el pago;
 * presencial se registra confirmada después del cobro en boletería).
 */
export async function registrarVenta({ canal, funcion, codigos, cliente, socio, calc, vendedorId = '', estado }) {
  const occ = ocupadas(funcion.id);
  const tomadas = codigos.filter((c) => occ.has(c));
  if (tomadas.length) {
    const err = new Error('Algunas ubicaciones ya no están disponibles');
    err.tomadas = tomadas;
    throw err;
  }
  const venta = {
    id: nuevoId('ventas', 'V'), nro: siguienteNumero('ventas', 'nro'), fecha: hoyIso(), hora: horaActual(), canal,
    funcionId: funcion.id, usuarioId: cliente.usuarioId || '', clienteTipoDoc: cliente.tipoDoc || 'DNI', clienteDoc: cliente.nroDoc || '',
    clienteNombre: cliente.nombre, clienteEmail: cliente.email || '', esSocio: calc.beneficio?.tipo === 'socio', socioId: calc.beneficio?.tipo === 'socio' ? socio.id : '',
    cantidad: codigos.length, subtotal: calc.subtotal, descuento: calc.descuento, detalleDescuento: calc.detalle,
    cargoServicio: calc.cargo, total: calc.total, estado, reintegro: 0, vendedorId, emailEnviado: false,
  };
  db.ventas.push(venta);
  let n = parseInt(nuevoId('entradas', 'E').slice(1), 10);
  for (const c of codigos) {
    const u = ubicacion(c);
    db.entradas.push({
      id: 'E' + String(n++).padStart(5, '0'), ventaId: venta.id, funcionId: funcion.id, ubicacion: c, sectorId: u.sectorId,
      precio: precio(funcion.id, u.sectorId), codigo: codigoEntrada(), estado: estado === 'confirmada' ? 'valida' : 'reservada',
      reprogramada: false, funcionOriginalId: '', fechaIngreso: '',
    });
  }
  await guardar(['ventas', 'entradas'], `venta ${canal}`);
  return venta;
}

export function registrarPagoSinGuardar({ tipo, origenId, plataforma, medio, importe, estado, referencia = '' }) {
  const p = {
    id: nuevoId('pagos', 'P'), tipo, origenId, plataforma, medio, importe, estado, fecha: hoyIso(), hora: horaActual(),
    referencia: referencia || (estado === 'aprobado' ? 'PS-' + Math.random().toString(36).slice(2, 12).toUpperCase() : ''),
  };
  db.pagos.push(p);
  return p;
}

/** La plataforma externa informa el resultado del pago de una venta online */
export async function resultadoPagoVenta(venta, { aprobado, medio }) {
  registrarPagoSinGuardar({ tipo: 'venta', origenId: venta.id, plataforma: 'PagoSeguro (externa)', medio, importe: venta.total, estado: aprobado ? 'aprobado' : 'rechazado' });
  if (aprobado) {
    venta.estado = 'confirmada';
    for (const e of idx.entradasPorVenta.get(venta.id) || []) if (e.estado === 'reservada') e.estado = 'valida';
  }
  await guardar(['pagos', 'ventas', 'entradas'], aprobado ? 'pago aprobado' : 'pago rechazado');
}

/** Se abandona una compra online pendiente: se liberan las ubicaciones */
export async function anularVentaPendiente(venta, estado = 'rechazada') {
  venta.estado = estado;
  for (const e of idx.entradasPorVenta.get(venta.id) || []) e.estado = 'anulada';
  await guardar(['ventas', 'entradas'], 'venta anulada');
}

export async function marcarEmailEnviado(venta) {
  venta.emailEnviado = true;
  await guardar(['ventas'], 'tickets enviados');
}

// ---------------------------------------------------------------------------
// Socios y cuotas
// ---------------------------------------------------------------------------

export async function altaSocio(datos, { canal, registradoPor, medio }) {
  const existente = (db.socios || []).find((s) => s.nroDoc === datos.nroDoc);
  let socio;
  if (existente) {
    // Reasociación de alguien que se había dado de baja
    socio = existente;
    Object.assign(socio, datos, { estado: 'activo', fechaAlta: hoyIso(), fechaBaja: '', motivoBaja: '' });
  } else {
    socio = {
      id: nuevoId('socios', 'S', 3), nroSocio: siguienteNumero('socios', 'nroSocio') || 1001, tipoDoc: datos.tipoDoc, nroDoc: datos.nroDoc,
      nombre: datos.nombre, apellido: datos.apellido, telefono: datos.telefono, email: datos.email, fechaNac: datos.fechaNac,
      fechaAlta: hoyIso(), estado: 'activo', fechaBaja: '', motivoBaja: '',
    };
    db.socios.push(socio);
  }
  const cuotas = registrarCuotasSinGuardar(socio, [hoyIso().slice(0, 7)], { canal, registradoPor, medio });
  await guardar(['socios', 'cuotas', 'pagos'], 'alta de socio');
  return { socio, cuotas };
}

function registrarCuotasSinGuardar(socio, periodos, { canal, registradoPor, medio }) {
  const recibo = siguienteNumero('cuotas', 'reciboNro');
  const importe = config('cuotaMensual', 12000);
  let n = parseInt(nuevoId('cuotas', 'C', 4).slice(1), 10);
  const nuevas = periodos.map((p) => ({
    id: 'C' + String(n++).padStart(4, '0'), socioId: socio.id, periodo: p, vencimiento: vencimiento(p), importe,
    fechaPago: hoyIso(), horaPago: horaActual(), canal, reciboNro: recibo, registradoPor,
  }));
  db.cuotas.push(...nuevas);
  registrarPagoSinGuardar({
    tipo: 'cuota', origenId: nuevas.map((c) => c.id).join(','), plataforma: canal === 'online' ? 'PagoSeguro (externa)' : 'Boletería',
    medio, importe: importe * nuevas.length, estado: 'aprobado', referencia: 'Recibo ' + recibo,
  });
  return nuevas;
}

/** Registrar el pago de cuotas (una o la deuda total) y actualizar el estado de cuenta */
export async function pagarCuotas(socio, periodos, { canal, registradoPor, medio }) {
  const cuotas = registrarCuotasSinGuardar(socio, periodos, { canal, registradoPor, medio });
  await guardar(['cuotas', 'pagos'], 'pago de cuotas');
  return { cuotas, estado: estadoSocio(socio) };
}

/** El socio que adeuda más de un período decide no continuar: se registra la baja */
export async function bajaSocio(socio, motivo = 'Adeudaba más de un período y no desea continuar asociado') {
  socio.estado = 'baja';
  socio.fechaBaja = hoyIso();
  socio.motivoBaja = motivo;
  await guardar(['socios'], 'baja de socio');
}

export async function modificarSocio(socio, cambios) {
  Object.assign(socio, cambios);
  await guardar(['socios'], 'modificación de socio');
}

// ---------------------------------------------------------------------------
// Cancelación, reprogramación e ingreso
// ---------------------------------------------------------------------------

export function calcularReintegro(venta) {
  const f = idx.funciones.get((idx.entradasPorVenta.get(venta.id) || [])[0]?.funcionId || venta.funcionId);
  const pol = politicaCancelacion(f);
  const base = venta.subtotal - venta.descuento; // el cargo por servicio no se devuelve
  return { ...pol, base, importe: Math.round((base * pol.porcentaje) / 100) };
}

export async function cancelarVenta(venta) {
  const r = calcularReintegro(venta);
  venta.estado = 'cancelada';
  venta.reintegro = r.importe;
  for (const e of idx.entradasPorVenta.get(venta.id) || []) if (e.estado === 'valida') e.estado = 'cancelada';
  if (r.importe > 0)
    registrarPagoSinGuardar({ tipo: 'reintegro', origenId: venta.id, plataforma: venta.canal === 'online' ? 'PagoSeguro (externa)' : 'Boletería', medio: 'Reintegro', importe: -r.importe, estado: 'aprobado' });
  await guardar(['ventas', 'entradas', 'pagos'], 'cancelación');
  return r;
}

export async function reprogramarEntradas(entradas, funcionDestino, codigos) {
  const occ = ocupadas(funcionDestino.id);
  if (codigos.some((c) => occ.has(c))) throw new Error('Alguna ubicación elegida ya fue ocupada');
  entradas.forEach((e, i) => {
    e.funcionOriginalId = e.funcionId;
    e.funcionId = funcionDestino.id;
    e.ubicacion = codigos[i];
    e.reprogramada = true;
  });
  await guardar(['entradas'], 'reprogramación');
}

export async function registrarIngreso(entrada) {
  entrada.estado = 'usada';
  entrada.fechaIngreso = `${hoyIso()} ${horaActual()}`;
  await guardar(['entradas'], 'ingreso a sala');
}
