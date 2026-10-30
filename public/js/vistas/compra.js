// Venta online: resumen → plataforma externa de pagos (simulada) → confirmación con tickets PDF.
// También se usa para el pago online de cuotas de socio y la asociación.
import { db, idx, config, usuarioActual } from '../estado.js';
import { calcularImporte, estadoSocio, socioDeUsuario, ocupadas, describirUbicacion, reservaVencida, aFecha, hoyIso } from '../reglas.js';
import { icono, esc, pesos, fechaLarga, nota, aviso, setCargando, esperar, marcoImagen, periodoTexto, confirmar } from '../ui.js';
import { registrarVenta, resultadoPagoVenta, anularVentaPendiente, marcarEmailEnviado, pagarCuotas, altaSocio, registrarPagoSinGuardar } from '../operaciones.js';
import { pdfTickets, pdfRecibo, enviarPorCorreo, descargar } from '../pdf.js';
import { ir } from '../app.js';
import { limpiarSeleccion } from './funcion.js';
import { guardar } from '../estado.js';

let reloj = null;

export function render(raiz, ctx) {
  clearInterval(reloj);
  const modo = ctx.args[0];
  if (modo === 'resumen') return resumen(raiz);
  if (modo === 'pago') return pasarela(raiz, ctx.params[0], ctx.params[1]);
  if (modo === 'ok') return confirmacion(raiz, ctx.params[0]);
}
export function salir() {
  clearInterval(reloj);
}

function pasos(actual) {
  const nombres = ['Ubicaciones', 'Resumen', 'Pago', 'Entradas'];
  return `<ol class="pasos" aria-label="Pasos de la compra">${nombres
    .map((n, i) => `<li class="${i < actual ? 'hecho' : ''}" ${i === actual ? 'aria-current="step"' : ''}>${n}</li>`)
    .join('')}</ol>`;
}

// ---------------------------------------------------------------------------
// 1. Resumen de la compra
// ---------------------------------------------------------------------------

function resumen(raiz) {
  let carrito = null;
  try {
    carrito = JSON.parse(sessionStorage.getItem('capaz-carrito'));
  } catch {}
  const u = usuarioActual();
  const f = carrito && idx.funciones.get(carrito.funcionId);
  if (!f || !carrito.codigos?.length) {
    raiz.innerHTML = `<div class="panel-app"><div class="vacio">${icono('ticket')}<h3>No hay una compra en curso</h3><p>Elegí una función y tus ubicaciones para empezar.</p><a class="boton boton--oro" href="#/cartelera">Ir a la cartelera</a></div></div>`;
    return;
  }
  const o = idx.obras.get(f.obraId);
  const socio = socioDeUsuario(u);
  const est = socio ? estadoSocio(socio) : null;
  const occ = ocupadas(f.id);
  const tomadas = carrito.codigos.filter((c) => occ.has(c));
  const codigos = carrito.codigos.filter((c) => !occ.has(c));
  const calc = calcularImporte({ funcion: f, codigos, canal: 'online', socioAlDia: !!est?.alDia });

  raiz.innerHTML = `
  <div class="panel-app">
    <div class="panel-app__cab"><div><span class="texto-3">Compra online</span><h1 class="titulo-pagina">Revisá tu compra</h1></div>
    <a class="boton boton--fantasma" href="#/funcion/${f.id}">${icono('arrow-left')} Cambiar ubicaciones</a></div>
    ${pasos(1)}
    ${tomadas.length ? nota(`Mientras elegías, se vendieron: ${tomadas.map(describirUbicacion).join(', ')}. Las quitamos de tu compra.`, 'alerta', 'Algunas ubicaciones ya no están disponibles') : ''}
    <div class="dos-columnas" style="margin-top:var(--e-4)">
      <div class="pila">
        <div class="panel">
          <div class="fila" style="align-items:flex-start;gap:var(--e-4);flex-wrap:nowrap">
            <div style="width:140px;flex:none">${marcoImagen(f.imagen || o.imagen, o.nombre)}</div>
            <div class="pila-chica"><h2 class="display" style="font-size:1.6rem">${esc(o.nombre)}</h2>
            <p class="texto-2">${esc(fechaLarga(f.fecha))} · ${f.hora} h · ${esc(idx.salas.get(f.salaId).nombre)}</p></div>
          </div>
          <hr class="separador">
          <ul class="lista-entradas">${calc.lineas.map((l) => `<li><span>${esc(describirUbicacion(l.codigo))}</span><b>${pesos(l.precio)}</b></li>`).join('')}</ul>
        </div>
        <div class="panel">
          <h3 class="panel__titulo">Datos del comprador</h3>
          <dl class="lista-def"><dt>Nombre</dt><dd>${esc(u.nombre)} ${esc(u.apellido)}</dd><dt>Documento</dt><dd>${esc(u.tipoDoc)} ${esc(u.nroDoc)}</dd>
          <dt>Correo para las entradas</dt><dd>${esc(u.email)}</dd><dt>Socio</dt><dd>${socio ? `N° ${socio.nroSocio} · ${est.alDia ? 'al día' : est.estado === 'baja' ? 'dado de baja' : 'con deuda'}` : 'No'}</dd></dl>
        </div>
        <div class="panel">
          <h3 class="panel__titulo">Cancelación y reprogramación</h3>
          <ul class="texto-2 pequeno" style="margin:0;padding-left:18px;display:grid;gap:6px">
            <li>Podés <b>reprogramar</b> una vez a otra fecha de la misma obra, con el mismo precio de sector, hasta ${config('reprogramarHorasAntes', 48)} h antes.</li>
            <li>Si <b>cancelás</b> con ${config('reintegroTotalDias', 15)} días o más se reintegra el 100 % del valor de las entradas; entre ${config('reintegroParcialDias', 7)} y ${config('reintegroTotalDias', 15) - 1} días, el 50 %; con menos de ${config('reintegroParcialDias', 7)} días no hay reintegro.</li>
            <li>El cargo por servicio online no se reintegra.</li>
          </ul>
        </div>
      </div>
      <aside class="panel resumen-compra">
        <h3 class="panel__titulo">Importe</h3>
        <div>
          <div class="linea-total"><span>Entradas (${codigos.length})</span><span>${pesos(calc.subtotal)}</span></div>
          ${calc.descuento ? `<div class="linea-total linea-total--descuento"><span>${esc(calc.detalle)}</span><span>− ${pesos(calc.descuento)}</span></div>` : ''}
          <div class="linea-total texto-2"><span>Cargo por servicio</span><span>${pesos(calc.cargo)}</span></div>
          <div class="linea-total linea-total--grande"><span>Total a pagar</span><span>${pesos(calc.total)}</span></div>
        </div>
        ${est?.estado === 'deuda' ? nota(`Con tus ${est.vencidas.length} cuotas vencidas no corresponde el descuento de socio. <a href="#/mi-cuenta/socio">Podés regularizarlas</a> y volver.`, 'alerta') : ''}
        <label class="check"><input type="checkbox" id="acepto"> Leí y acepto las condiciones de cancelación y reprogramación.</label>
        <button class="boton boton--oro boton--grande boton--bloque" id="pagar" type="button" ${codigos.length ? '' : 'disabled'}>${icono('lock')} Ir a pagar ${pesos(calc.total)}</button>
        <p class="pequeno texto-3">Te derivamos a la plataforma externa de pagos. Reservamos tus ubicaciones por ${config('minutosReserva', 10)} minutos.</p>
      </aside>
    </div>
  </div>`;

  raiz.querySelector('#pagar').addEventListener('click', async (e) => {
    if (!raiz.querySelector('#acepto').checked) {
      aviso('Falta aceptar las condiciones', 'Marcá la casilla para continuar.', 'alerta');
      return raiz.querySelector('#acepto').focus();
    }
    setCargando(e.currentTarget, true, 'Registrando la operación…');
    try {
      const venta = await registrarVenta({
        canal: 'online', funcion: f, codigos, socio,
        cliente: { usuarioId: u.id, tipoDoc: u.tipoDoc, nroDoc: u.nroDoc, nombre: `${u.nombre} ${u.apellido}`, email: u.email },
        calc, estado: 'pendiente',
      });
      sessionStorage.removeItem('capaz-carrito');
      limpiarSeleccion(f.id);
      ir(`/pago/venta/${venta.id}`);
    } catch (err) {
      aviso('No se pudo registrar la venta', err.tomadas ? 'Otra persona compró esas ubicaciones recién.' : err.message, 'error');
      resumen(raiz);
    }
  });
}

// ---------------------------------------------------------------------------
// 2. Plataforma externa de pagos (simulada)
// ---------------------------------------------------------------------------

function ordenCuota(id) {
  try {
    const o = JSON.parse(sessionStorage.getItem('capaz-orden-' + id));
    return o;
  } catch {
    return null;
  }
}

function pasarela(raiz, tipo, id) {
  const u = usuarioActual();
  let importe, concepto, detalle, venta, orden, limite;
  if (tipo === 'venta') {
    venta = idx.ventas.get(id);
    if (!venta || venta.usuarioId !== u.id) return sinOrden(raiz);
    if (venta.estado === 'confirmada') return ir(`/compra-ok/${venta.id}`);
    if (venta.estado !== 'pendiente' || reservaVencida(venta)) return reservaCaida(raiz, venta);
    const f = idx.funciones.get(venta.funcionId);
    importe = venta.total;
    concepto = `${venta.cantidad} ${venta.cantidad === 1 ? 'entrada' : 'entradas'} · ${idx.obras.get(f.obraId).nombre}`;
    detalle = `${fechaLarga(f.fecha)} · ${f.hora} h`;
    limite = aFecha(venta.fecha, venta.hora).getTime() + config('minutosReserva', 10) * 60000;
  } else {
    orden = ordenCuota(id);
    if (!orden) return sinOrden(raiz);
    importe = orden.importe;
    concepto = orden.alta ? 'Alta de socio y primera cuota' : `Cuotas de socio (${orden.periodos.length})`;
    detalle = orden.periodos.map(periodoTexto).join(', ');
  }
  const ref = 'ORD-' + id;

  raiz.innerHTML = `
  <div class="pasarela-fondo">
    <p class="pasarela-aviso">${icono('external-link')} Estás en la plataforma externa de pagos. <b>Simulación:</b> no se procesa dinero real.</p>
    <div class="pasarela">
      <div class="pasarela__cab"><span class="pasarela__logo">${icono('shield-check')} PagoSeguro</span>
        ${limite ? `<span class="pasarela__reloj" id="reloj" role="timer">${icono('hourglass')} <span></span></span>` : ''}</div>
      <div class="pasarela__cuerpo">
        <div class="pasarela__resumen">
          <span class="texto-3">Pagás a</span><strong>Teatro CaPaz S.A.</strong>
          <span class="texto-3">Importe</span><span class="importe">${pesos(importe)}</span>
          <span class="texto-3">Concepto</span><span>${esc(concepto)}</span>
          <span class="pequeno texto-3">${esc(detalle)}</span>
          <span class="pequeno texto-3">Referencia ${esc(ref)}</span>
        </div>
        <div class="pasarela__medios" id="medios"></div>
      </div>
    </div>
    <div style="width:min(100%,720px);margin:16px auto 0;display:flex;justify-content:center">
      <button class="boton boton--pasarela-sec boton--chico" id="cancelar" type="button">Cancelar y volver al teatro</button>
    </div>
  </div>`;

  if (limite) {
    const span = raiz.querySelector('#reloj span');
    const tic = () => {
      const r = Math.max(0, limite - Date.now());
      span.textContent = `Reserva: ${String(Math.floor(r / 60000)).padStart(2, '0')}:${String(Math.floor((r % 60000) / 1000)).padStart(2, '0')}`;
      if (r <= 0) {
        clearInterval(reloj);
        anularVentaPendiente(venta, 'vencida').then(() => reservaCaida(raiz, venta));
      }
    };
    tic();
    reloj = setInterval(tic, 1000);
  }

  raiz.querySelector('#cancelar').addEventListener('click', async () => {
    if (venta) {
      const ok = await confirmar({ titulo: 'Cancelar el pago', texto: '<p>Se liberan las ubicaciones reservadas y la compra queda anulada.</p>', aceptar: 'Cancelar compra', peligro: true });
      if (!ok) return;
      await anularVentaPendiente(venta, 'rechazada');
      aviso('Compra cancelada', 'Las ubicaciones volvieron a estar disponibles.', 'info');
      return ir(`/funcion/${venta.funcionId}`);
    }
    ir('/mi-cuenta/socio');
  });

  pintarMedios(raiz, { tipo, venta, orden, importe, id, usuario: u });
}

function pintarMedios(raiz, ctx, medioActivo = 'tarjeta', error = '') {
  const cont = raiz.querySelector('#medios');
  const tabs = [
    ['tarjeta', 'credit-card', 'Tarjeta'],
    ['qr', 'qr-code', 'QR'],
    ['transferencia', 'landmark', 'Transferencia'],
  ];
  cont.innerHTML = `
    <div class="segmentado" role="tablist">${tabs
      .map(([id, ico, t]) => `<button type="button" role="tab" aria-selected="${id === medioActivo}" data-medio="${id}">${icono(ico)} ${t}</button>`)
      .join('')}</div>
    ${error ? nota(error, 'error', 'El pago fue rechazado') : ''}
    <div id="medio"></div>`;
  cont.querySelectorAll('[data-medio]').forEach((b) => b.addEventListener('click', () => pintarMedios(raiz, ctx, b.dataset.medio)));
  const m = cont.querySelector('#medio');

  if (medioActivo === 'tarjeta') {
    m.innerHTML = `<form class="form" id="f-tarjeta" novalidate>
      <div class="campo"><label for="num">Número de tarjeta</label><input class="entrada" id="num" inputmode="numeric" autocomplete="off" placeholder="4509 9535 6623 3704" maxlength="19">
        <span class="ayuda">Simulación: cualquier número de 16 dígitos se aprueba; si termina en 0000, se rechaza.</span></div>
      <div class="campo"><label for="titular">Titular</label><input class="entrada" id="titular" autocomplete="off" value="${esc((ctx.usuario.nombre + ' ' + ctx.usuario.apellido).toUpperCase())}"></div>
      <div class="fila-campos"><div class="campo"><label for="venc">Vencimiento</label><input class="entrada" id="venc" placeholder="MM/AA" maxlength="5" autocomplete="off"></div>
      <div class="campo"><label for="cvv">Código</label><input class="entrada" id="cvv" inputmode="numeric" maxlength="4" placeholder="123" autocomplete="off"></div></div>
      <div class="campo"><label for="cuotas-t">Cuotas</label><select class="entrada" id="cuotas-t"><option>1 pago</option><option>3 cuotas sin interés</option><option>6 cuotas</option></select></div>
      <button class="boton boton--pasarela boton--grande boton--bloque" type="submit">Pagar ${pesos(ctx.importe)}</button>
    </form>`;
    const num = m.querySelector('#num');
    num.addEventListener('input', () => {
      num.value = num.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    });
    m.querySelector('#venc').addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 4);
      if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
      e.target.value = v;
    });
    m.querySelector('#f-tarjeta').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = num.value.replace(/\D/g, '');
      const faltan = [];
      if (n.length !== 16) faltan.push('el número (16 dígitos)');
      if (!/^\d{2}\/\d{2}$/.test(m.querySelector('#venc').value)) faltan.push('el vencimiento');
      if (m.querySelector('#cvv').value.length < 3) faltan.push('el código');
      if (faltan.length) return pintarMedios(raiz, ctx, 'tarjeta', `Revisá ${faltan.join(', ')}.`);
      procesar(raiz, ctx, { aprobado: !n.endsWith('0000'), medio: 'Tarjeta de crédito', motivo: 'La tarjeta fue rechazada por el emisor (fondos insuficientes).' });
    });
  } else if (medioActivo === 'qr') {
    m.innerHTML = `<div class="pasarela__qr">
      <div id="qr"></div>
      <p><b>Escaneá con tu billetera virtual</b><br><span class="texto-3 pequeno">El código incluye el importe y la referencia de la operación.</span></p>
      <p class="fila" style="justify-content:center;color:#4a5566"><span class="spinner"></span> Esperando la confirmación del pago…</p>
      <div class="fila" style="justify-content:center">
        <button class="boton boton--pasarela" type="button" id="qr-ok">Simular pago aprobado</button>
        <button class="boton boton--pasarela-sec" type="button" id="qr-no">Simular rechazo</button>
      </div></div>`;
    const q = window.qrcode(0, 'M');
    q.addData(`PAGOSEGURO|TEATRO-CAPAZ|${ctx.id}|${ctx.importe}`);
    q.make();
    m.querySelector('#qr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 0, scalable: true });
    m.querySelector('#qr-ok').addEventListener('click', () => procesar(raiz, ctx, { aprobado: true, medio: 'QR billetera virtual' }));
    m.querySelector('#qr-no').addEventListener('click', () => procesar(raiz, ctx, { aprobado: false, medio: 'QR billetera virtual', motivo: 'La billetera informó que el pago no se completó.' }));
  } else {
    m.innerHTML = `<div class="pila">
      <div class="datos-transferencia">
        <div><span class="texto-3">Titular</span><b>Teatro CaPaz S.A.</b></div>
        <div><span class="texto-3">CUIT</span><b>30-71234567-8</b></div>
        <div><span class="texto-3">Alias</span><b>CAPAZ.TEATRO.SIERRAS</b></div>
        <div><span class="texto-3">CBU</span><b class="num">0000003100012345678901</b></div>
        <div><span class="texto-3">Importe exacto</span><b>${pesos(ctx.importe)}</b></div>
      </div>
      <p class="pequeno texto-3">Datos ficticios. Al confirmar, la plataforma verifica la acreditación.</p>
      <button class="boton boton--pasarela boton--grande boton--bloque" type="button" id="tr-ok">Ya transferí</button>
    </div>`;
    m.querySelector('#tr-ok').addEventListener('click', () => procesar(raiz, ctx, { aprobado: true, medio: 'Transferencia' }));
  }
}

async function procesar(raiz, ctx, { aprobado, medio, motivo }) {
  const m = raiz.querySelector('#medios');
  m.innerHTML = `<div class="pasarela__estado" role="status"><span class="spinner grande" style="width:48px;height:48px;border-width:4px;color:#1f3b73"></span>
    <b>Procesando el pago…</b><span class="texto-3 pequeno">No cierres esta ventana.</span></div>`;
  await esperar(1600);
  if (ctx.tipo === 'venta') {
    if (ctx.venta.estado !== 'pendiente') return reservaCaida(raiz, ctx.venta);
    await resultadoPagoVenta(ctx.venta, { aprobado, medio });
    if (!aprobado) return pintarMedios(raiz, ctx, 'tarjeta', `${motivo} Podés intentar con otro medio; tus ubicaciones siguen reservadas.`);
  } else {
    if (!aprobado) {
      registrarPagoSinGuardar({ tipo: 'cuota', origenId: ctx.id, plataforma: 'PagoSeguro (externa)', medio, importe: ctx.importe, estado: 'rechazado' });
      await guardar(['pagos'], 'pago de cuota rechazado');
      return pintarMedios(raiz, ctx, 'tarjeta', `${motivo} Probá con otro medio de pago.`);
    }
    const o = ctx.orden;
    let res;
    if (o.alta) res = await altaSocio(o.alta, { canal: 'online', registradoPor: ctx.usuario.id, medio });
    else res = await pagarCuotas(idx.socios.get(o.socioId), o.periodos, { canal: 'online', registradoPor: ctx.usuario.id, medio });
    o.resultado = { socioId: res.socio?.id || o.socioId, cuotas: res.cuotas.map((c) => c.id) };
    sessionStorage.setItem('capaz-orden-' + ctx.id, JSON.stringify(o));
  }
  m.innerHTML = `<div class="pasarela__estado" role="status">${icono('circle-check', 'grande')}<b>Pago aprobado</b><span class="texto-3 pequeno">Volviendo al Teatro CaPaz…</span></div>`;
  m.querySelector('.ico').style.color = '#1f7a55';
  await esperar(1000);
  ir(`/compra-ok/${ctx.tipo === 'venta' ? ctx.venta.id : ctx.id}`);
}

function sinOrden(raiz) {
  raiz.innerHTML = `<div class="panel-app"><div class="vacio">${icono('circle-alert')}<h3>No encontramos esa operación de pago</h3><a class="boton boton--oro" href="#/mi-cuenta">Ir a mi cuenta</a></div></div>`;
}
function reservaCaida(raiz, venta) {
  clearInterval(reloj);
  raiz.innerHTML = `<div class="panel-app"><div class="vacio">${icono('hourglass')}<h3>La reserva ya no está activa</h3>
    <p>${venta.estado === 'vencida' ? `Pasaron más de ${config('minutosReserva', 10)} minutos sin confirmar el pago.` : 'La compra fue cancelada.'} Las ubicaciones se liberaron.</p>
    <a class="boton boton--oro" href="#/funcion/${venta.funcionId}">Elegir ubicaciones de nuevo</a></div></div>`;
}

// ---------------------------------------------------------------------------
// 3. Confirmación: tickets generados y enviados por correo
// ---------------------------------------------------------------------------

async function confirmacion(raiz, id) {
  if (id.startsWith('V')) return confirmacionVenta(raiz, idx.ventas.get(id));
  return confirmacionCuota(raiz, id);
}

function plantillaProgreso(items) {
  return `<ol class="progreso" id="progreso">${items
    .map((t) => `<li><span class="estado-ico"><span class="spinner" style="opacity:.0"></span></span>${t}</li>`)
    .join('')}</ol>`;
}
async function avanzar(raiz, i, rapido) {
  const lis = raiz.querySelectorAll('#progreso li');
  if (lis[i]) {
    lis[i].classList.add('activo');
    lis[i].querySelector('.estado-ico').innerHTML = '<span class="spinner"></span>';
  }
  if (!rapido) await esperar(520);
}
function listo(raiz, i, texto) {
  const li = raiz.querySelectorAll('#progreso li')[i];
  if (!li) return;
  li.classList.remove('activo');
  li.classList.add('listo');
  li.querySelector('.estado-ico').innerHTML = icono('circle-check');
  if (texto) li.lastChild.textContent = texto;
}

async function confirmacionVenta(raiz, venta) {
  const u = usuarioActual();
  if (!venta || venta.usuarioId !== u.id || venta.estado !== 'confirmada') return sinOrden(raiz);
  const entradas = (idx.entradasPorVenta.get(venta.id) || []).filter((e) => e.estado !== 'anulada');
  const f = idx.funciones.get(venta.funcionId);
  const o = idx.obras.get(f.obraId);
  const rapido = venta.emailEnviado;

  raiz.innerHTML = `
  <div class="contenedor">${pasos(3)}</div>
  <section class="confirmacion" aria-live="polite">
    <div class="sello-ok">${icono('check')}</div>
    <div class="pila-chica"><h1 class="titulo-pagina">¡Listo, ${esc(u.nombre)}! Nos vemos en la sala.</h1>
    <p class="texto-2">Venta N° ${venta.nro} · ${venta.cantidad} ${venta.cantidad === 1 ? 'entrada' : 'entradas'} · ${pesos(venta.total)}</p></div>
    <div class="entrada-impresa">
      <div class="entrada-impresa__cuerpo"><small class="texto-3">TEATRO CAPAZ · ${esc(idx.salas.get(f.salaId).nombre.toUpperCase())}</small>
        <h3>${esc(o.nombre)}</h3><span class="texto-2">${esc(fechaLarga(f.fecha))} · ${f.hora} h</span>
        <span class="pequeno">${entradas.map((e) => esc(describirUbicacion(e.ubicacion))).join('<br>')}</span></div>
      <div class="entrada-impresa__talon"><div><b>${entradas.length}</b><br>${entradas.length === 1 ? 'entrada' : 'entradas'}</div></div>
    </div>
    ${plantillaProgreso(['Pago confirmado por la plataforma externa', 'Venta registrada', 'Ubicaciones actualizadas en la sala', 'Tickets electrónicos generados (PDF con QR)', `Envío a ${esc(venta.clienteEmail)}`])}
    <div class="fila" style="justify-content:center" id="acciones" hidden>
      <button class="boton boton--oro boton--grande" id="descargar" type="button">${icono('download')} Descargar entradas (PDF)</button>
      <a class="boton boton--contorno boton--grande" href="#/mi-cuenta">${icono('ticket')} Ver mis compras</a>
    </div>
    <p class="pequeno texto-3" id="nota-mail"></p>
  </section>`;

  for (let i = 0; i < 3; i++) {
    await avanzar(raiz, i, rapido);
    listo(raiz, i);
  }
  await avanzar(raiz, 3, rapido);
  const doc = await pdfTickets(venta, entradas);
  listo(raiz, 3);
  await avanzar(raiz, 4, true);
  let res;
  if (!venta.emailEnviado) {
    res = await enviarPorCorreo({
      para: venta.clienteEmail,
      asunto: `Tus entradas para ${o.nombre} — Teatro CaPaz`,
      html: `<p>Hola ${esc(u.nombre)}:</p><p>Adjuntamos tus ${entradas.length} entradas para <b>${esc(o.nombre)}</b>, ${esc(fechaLarga(f.fecha))} a las ${f.hora} h.</p><p>Presentá el código QR de cada entrada en el ingreso.</p><p>Teatro CaPaz S.A.</p>`,
      doc,
      nombreArchivo: `entradas-capaz-venta-${venta.nro}.pdf`,
    });
    if (res.enviado) await marcarEmailEnviado(venta);
  } else res = { enviado: true, simulado: false, previo: true };
  listo(raiz, 4, res.enviado ? `Entradas enviadas a ${venta.clienteEmail}` : 'No se pudo enviar el correo; descargalas desde acá');
  raiz.querySelector('#nota-mail').textContent = res.simulado
    ? 'Modo demostración: el envío de correo está simulado (configurá Gmail en el archivo .env para enviarlo de verdad).'
    : res.enviado
      ? 'También quedan guardadas en “Mis compras”.'
      : 'Tus entradas quedan guardadas en “Mis compras”.';
  raiz.querySelector('#acciones').hidden = false;
  raiz.querySelector('#descargar').addEventListener('click', () => descargar(doc, `entradas-capaz-venta-${venta.nro}.pdf`));
  if (!rapido) aviso('Entradas emitidas', 'Pago confirmado y tickets generados.', 'exito');
}

async function confirmacionCuota(raiz, id) {
  const o = ordenCuota(id);
  const u = usuarioActual();
  if (!o?.resultado) return sinOrden(raiz);
  const socio = idx.socios.get(o.resultado.socioId);
  const cuotas = db.cuotas.filter((c) => o.resultado.cuotas.includes(c.id));
  const est = estadoSocio(socio);
  raiz.innerHTML = `
  <section class="confirmacion" aria-live="polite">
    <div class="sello-ok">${icono('check')}</div>
    <div class="pila-chica"><h1 class="titulo-pagina">${o.alta ? `¡Bienvenido/a, socio N° ${socio.nroSocio}!` : 'Cuotas registradas'}</h1>
    <p class="texto-2">${cuotas.map((c) => periodoTexto(c.periodo)).join(', ')} · ${pesos(cuotas.reduce((s, c) => s + c.importe, 0))}</p></div>
    ${plantillaProgreso(['Pago confirmado por la plataforma externa', 'Pago de cuotas registrado', 'Estado de cuenta actualizado', 'Recibo de pago emitido (PDF)', `Envío a ${esc(socio.email || u.email)}`])}
    <div class="fila" style="justify-content:center" id="acciones" hidden>
      <button class="boton boton--oro boton--grande" id="descargar" type="button">${icono('download')} Descargar recibo</button>
      <a class="boton boton--contorno boton--grande" href="#/mi-cuenta/socio">${icono('id-card')} Ver mi estado de cuenta</a>
    </div>
    <p class="pequeno texto-3" id="nota-mail"></p>
  </section>`;
  const rapido = !!o.enviado;
  for (let i = 0; i < 3; i++) {
    await avanzar(raiz, i, rapido);
    listo(raiz, i, i === 2 ? `Estado de cuenta: ${est.alDia ? 'al día — 30 % de descuento habilitado' : 'con cuotas pendientes'}` : '');
  }
  await avanzar(raiz, 3, rapido);
  const doc = await pdfRecibo(socio, cuotas, est.alDia ? 'Al día' : 'Con cuotas pendientes');
  listo(raiz, 3);
  let res = { enviado: true };
  if (!o.enviado) {
    res = await enviarPorCorreo({
      para: socio.email || u.email,
      asunto: `Recibo de pago de cuota N° ${cuotas[0].reciboNro} — Teatro CaPaz`,
      html: `<p>Hola ${esc(socio.nombre)}:</p><p>Registramos el pago de ${cuotas.length} ${cuotas.length === 1 ? 'cuota' : 'cuotas'}. Adjuntamos el recibo.</p><p>Teatro CaPaz S.A.</p>`,
      doc,
      nombreArchivo: `recibo-capaz-${cuotas[0].reciboNro}.pdf`,
    });
    o.enviado = true;
    sessionStorage.setItem('capaz-orden-' + id, JSON.stringify(o));
  }
  listo(raiz, 4, res.enviado ? `Recibo enviado a ${socio.email || u.email}` : 'No se pudo enviar el correo');
  if (res.simulado) raiz.querySelector('#nota-mail').textContent = 'Modo demostración: el envío de correo está simulado.';
  raiz.querySelector('#acciones').hidden = false;
  raiz.querySelector('#descargar').addEventListener('click', () => descargar(doc, `recibo-capaz-${cuotas[0].reciboNro}.pdf`));
}

/** Prepara una orden de pago de cuotas y deriva a la plataforma externa */
export function iniciarPagoCuotas({ socioId = '', periodos, alta = null }) {
  const id = 'Q' + Date.now().toString(36).toUpperCase();
  const importe = config('cuotaMensual', 12000) * periodos.length;
  sessionStorage.setItem('capaz-orden-' + id, JSON.stringify({ id, socioId, periodos, alta, importe, creada: hoyIso() }));
  ir(`/pago/cuota/${id}`);
}
