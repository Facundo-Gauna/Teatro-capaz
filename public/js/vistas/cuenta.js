// Panel del cliente: sus entradas (descargar, reprogramar, cancelar), su situación de socio
// (estado de cuenta, pago de cuotas, alta y baja) y sus datos personales.
import { db, idx, config, guardar, usuarioActual } from '../estado.js';
import {
  estadoSocio, socioDeUsuario, opcionesReprogramacion, mejoresUbicaciones, describirUbicacion, ubicacionCorta,
  hoyIso, fechaHoraFuncion, reservaVencida, ESTADO_VENTA, ESTADO_SOCIO, ESTADO_ENTRADA,
} from '../reglas.js';
import { icono, esc, pesos, fechaMedia, fechaCorta, periodoTexto, etiqueta, nota, aviso, abrirModal, confirmar, setCargando, marcoImagen, errorCampo } from '../ui.js';
import { calcularReintegro, cancelarVenta, reprogramarEntradas, bajaSocio } from '../operaciones.js';
import { pdfTickets, pdfRecibo, descargar } from '../pdf.js';
import { crearMapa } from '../mapa.js';
import { iniciarPagoCuotas } from './compra.js';
import { ir } from '../app.js';

let raizActual = null;
let pestana = 'entradas';

export function render(raiz, { params }) {
  raizActual = raiz;
  pestana = params[0] || 'entradas';
  if (!['entradas', 'socio', 'datos'].includes(pestana)) pestana = 'entradas';
  pintar();
}
export function alActualizar() {
  if (raizActual?.isConnected && !document.querySelector('.modal-fondo')) pintar();
}

function pintar() {
  const u = usuarioActual();
  const ventas = (db.ventas || []).filter((v) => v.usuarioId === u.id && v.estado !== 'rechazada' && v.estado !== 'vencida');
  const socio = socioDeUsuario(u);
  raizActual.innerHTML = `
  <div class="panel-app">
    <div class="panel-app__cab"><div><span class="texto-3">Mi cuenta</span><h1 class="titulo-pagina">Hola, ${esc(u.nombre)}</h1></div>
      <a class="boton boton--oro" href="#/cartelera">${icono('ticket')} Comprar entradas</a></div>
    <div class="pestanas" role="tablist">
      ${[
        ['entradas', 'ticket', 'Mis entradas', ventas.filter((v) => v.estado === 'confirmada').length],
        ['socio', 'id-card', socio && socio.estado !== 'baja' ? 'Socio y cuotas' : 'Hacerme socio'],
        ['datos', 'user', 'Mis datos'],
      ]
        .map(([id, ic, t, n]) => `<button role="tab" type="button" aria-selected="${pestana === id}" data-tab="${id}">${icono(ic)} ${t}${n !== undefined ? ` <span class="contador">${n}</span>` : ''}</button>`)
        .join('')}
    </div>
    <div id="contenido"></div>
  </div>`;
  raizActual.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      pestana = b.dataset.tab;
      history.replaceState(null, '', '#/mi-cuenta/' + pestana);
      pintar();
    })
  );
  const c = raizActual.querySelector('#contenido');
  if (pestana === 'entradas') pintarEntradas(c, u, ventas);
  else if (pestana === 'socio') pintarSocio(c, u, socio);
  else pintarDatos(c, u, socio);
}

// ---------------------------------------------------------------------------
// Mis entradas
// ---------------------------------------------------------------------------

function funcionDeVenta(v) {
  const e = (idx.entradasPorVenta.get(v.id) || [])[0];
  return idx.funciones.get(e?.funcionId || v.funcionId);
}

function pintarEntradas(c, u, ventas) {
  const ahora = Date.now();
  const pendientes = ventas.filter((v) => v.estado === 'pendiente' && !reservaVencida(v));
  const proximas = ventas
    .filter((v) => v.estado === 'confirmada' && fechaHoraFuncion(funcionDeVenta(v)).getTime() > ahora)
    .sort((a, b) => fechaHoraFuncion(funcionDeVenta(a)) - fechaHoraFuncion(funcionDeVenta(b)));
  const historial = ventas
    .filter((v) => !pendientes.includes(v) && !proximas.includes(v) && v.estado !== 'pendiente')
    .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

  if (!ventas.length) {
    c.innerHTML = `<div class="vacio">${icono('ticket')}<h3>Todavía no compraste entradas</h3><p>Cuando compres, tus entradas aparecen acá para descargarlas, reprogramarlas o cancelarlas.</p><a class="boton boton--oro" href="#/cartelera">Ver la cartelera</a></div>`;
    return;
  }
  c.innerHTML = `
    ${pendientes.length ? `<h2 class="panel__titulo">Esperando pago</h2>${pendientes.map((v) => tarjetaVenta(v, 'pendiente')).join('')}<div class="mt-6"></div>` : ''}
    <h2 class="panel__titulo">Próximas funciones</h2>
    ${proximas.length ? proximas.map((v) => tarjetaVenta(v, 'proxima')).join('') : `<p class="texto-2">No tenés funciones próximas.</p>`}
    <h2 class="panel__titulo mt-6">Historial</h2>
    ${historial.length ? historial.map((v) => tarjetaVenta(v, 'historial')).join('') : `<p class="texto-2">Sin compras anteriores.</p>`}`;

  c.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const v = idx.ventas.get(b.dataset.venta);
    const acc = b.dataset.accion;
    if (acc === 'pdf') {
      setCargando(b, true, 'Generando…');
      const doc = await pdfTickets(v, (idx.entradasPorVenta.get(v.id) || []).filter((x) => x.estado === 'valida' || x.estado === 'usada'));
      descargar(doc, `entradas-capaz-venta-${v.nro}.pdf`);
      setCargando(b, false);
    }
    if (acc === 'pagar') ir(`/pago/venta/${v.id}`);
    if (acc === 'cancelar') dialogoCancelar(v);
    if (acc === 'reprogramar') dialogoReprogramar(v);
  });
}

function tarjetaVenta(v, tipo) {
  const f = funcionDeVenta(v);
  const o = idx.obras.get(f.obraId);
  const ents = (idx.entradasPorVenta.get(v.id) || []).filter((e) => e.estado !== 'anulada');
  const usadas = ents.filter((e) => e.estado === 'usada').length;
  let estado = ESTADO_VENTA[v.estado];
  if (tipo === 'historial' && v.estado === 'confirmada') estado = usadas ? ['Asististe', 'info'] : ['Función realizada', 'info'];
  const repro = ents.some((e) => e.reprogramada);
  return `<article class="compra-item">
    ${marcoImagen(f.imagen || o.imagen, o.nombre)}
    <div>
      <div class="fila" style="gap:8px">${etiqueta(estado)}${repro ? etiqueta(['Reprogramada', 'oro']) : ''}${v.esSocio ? etiqueta(['Descuento socio', 'exito']) : ''}</div>
      <h3 style="margin-top:6px">${esc(o.nombre)}</h3>
      <div class="compra-item__meta"><span>${icono('calendar')} ${esc(fechaMedia(f.fecha))} · ${f.hora} h</span><span>${icono('map-pin')} ${esc(idx.salas.get(f.salaId).nombre)}</span><span>${icono('armchair')} ${ents.map((e) => esc(ubicacionCorta(e.ubicacion))).join(', ')}</span></div>
      <p class="pequeno texto-3" style="margin-top:6px">Venta N° ${v.nro} del ${fechaCorta(v.fecha)} · ${pesos(v.total)}${v.estado === 'cancelada' ? ` · Reintegro ${pesos(v.reintegro)}` : ''}</p>
    </div>
    <div class="compra-item__acciones">
      ${tipo === 'pendiente' ? `<button class="boton boton--oro boton--chico" data-accion="pagar" data-venta="${v.id}">${icono('credit-card')} Continuar pago</button>` : ''}
      ${v.estado === 'confirmada' ? `<button class="boton boton--contorno boton--chico" data-accion="pdf" data-venta="${v.id}">${icono('download')} Entradas PDF</button>` : ''}
      ${tipo === 'proxima' ? `<button class="boton boton--fantasma boton--chico" data-accion="reprogramar" data-venta="${v.id}">${icono('calendar-sync')} Reprogramar</button>
        <button class="boton boton--peligro boton--chico" data-accion="cancelar" data-venta="${v.id}">${icono('ban')} Cancelar</button>` : ''}
    </div>
  </article>`;
}

function dialogoCancelar(v) {
  const r = calcularReintegro(v);
  const f = funcionDeVenta(v);
  const tono = r.porcentaje === 100 ? 'exito' : r.porcentaje === 50 ? 'alerta' : 'error';
  abrirModal({
    titulo: 'Cancelar la compra',
    cuerpo: `
      <p>${esc(idx.obras.get(f.obraId).nombre)} · ${esc(fechaMedia(f.fecha))} · ${v.cantidad} ${v.cantidad === 1 ? 'entrada' : 'entradas'}</p>
      ${nota(`Faltan <b>${r.dias} días</b> para la función. Corresponde un reintegro del <b>${r.porcentaje} %</b> del valor de las entradas.`, tono)}
      <div><div class="linea-total"><span>Valor pagado por las entradas</span><span>${pesos(r.base)}</span></div>
      <div class="linea-total texto-3"><span>Cargo por servicio (no se reintegra)</span><span>${pesos(v.cargoServicio)}</span></div>
      <div class="linea-total linea-total--grande"><span>Reintegro</span><span>${pesos(r.importe)}</span></div></div>
      ${r.porcentaje === 0 && opcionesReprogramacion(idx.entradasPorVenta.get(v.id).filter((e) => e.estado === 'valida')).permitido ? nota('Todavía podés reprogramar a otra fecha sin costo.', 'info') : ''}
      <p class="pequeno texto-3">Las ubicaciones se liberan y vuelven a la venta. Esta acción no se puede deshacer.</p>`,
    pie: `<button class="boton boton--fantasma" data-cerrar type="button">Conservar mis entradas</button>
          <button class="boton boton--peligro" id="si" type="button">${icono('ban')} Cancelar y reintegrar ${pesos(r.importe)}</button>`,
    alAbrir(modal, cerrar) {
      modal.querySelector('#si').addEventListener('click', async (e) => {
        setCargando(e.currentTarget, true, 'Cancelando…');
        const res = await cancelarVenta(v);
        cerrar();
        aviso('Compra cancelada', res.importe ? `Reintegro de ${pesos(res.importe)} registrado.` : 'Sin reintegro, según la anticipación.', 'exito', 6000);
        pintar();
      });
    },
  });
}

function dialogoReprogramar(v) {
  const ents = (idx.entradasPorVenta.get(v.id) || []).filter((e) => e.estado === 'valida');
  const op = opcionesReprogramacion(ents);
  const sector = idx.sectores.get(op.sectorId);
  const validas = op.opciones.filter((o) => o.ok);
  abrirModal({
    titulo: 'Reprogramar entradas',
    ancho: true,
    cuerpo: `
      <p class="texto-2">Se mantiene el sector <b>${esc(sector.nombre)}</b> y el precio. Elegí otra fecha de la misma obra.</p>
      ${!op.permitido ? nota(op.motivo.join(' '), 'alerta', 'No se puede reprogramar') : ''}
      ${op.permitido && !op.opciones.length ? nota('Esta obra no tiene otras funciones programadas.', 'info') : ''}
      ${op.permitido && op.opciones.length ? `<div class="sectores" id="opciones">${op.opciones
        .map((o) => `<button class="sector" type="button" data-f="${o.funcion.id}" ${o.ok ? '' : 'disabled aria-disabled="true" style="opacity:.55;cursor:not-allowed"'} style="--color-sector:${sector.color}">
          <span class="sector__color"></span><span><strong>${esc(fechaMedia(o.funcion.fecha))} · ${o.funcion.hora} h</strong><small>${esc(idx.salas.get(o.funcion.salaId).nombre)} · ${o.libres} libres en el sector</small></span>
          <span class="sector__precio">${o.ok ? etiqueta(['Disponible', 'exito']) : `<small>${esc(o.razon)}</small>`}</span></button>`)
        .join('')}</div>` : ''}
      ${op.permitido && op.opciones.length && !validas.length ? nota('Ninguna fecha cumple las condiciones (precio igual, 48 h de anticipación y lugares en el sector).', 'info') : ''}
      <div id="paso-mapa"></div>`,
    pie: `<button class="boton boton--fantasma" data-cerrar type="button">Cerrar</button>
          <button class="boton boton--oro" id="confirmar" type="button" disabled>${icono('calendar-sync')} Confirmar reprogramación</button>`,
    alAbrir(modal, cerrar) {
      let destino = null;
      let mapa = null;
      modal.querySelector('#opciones')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]:not([disabled])');
        if (!b) return;
        modal.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        destino = idx.funciones.get(b.dataset.f);
        const sel = new Set(mejoresUbicaciones(destino.id, op.sectorId, op.cantidad));
        modal.querySelector('#paso-mapa').innerHTML = `<p class="pequeno texto-2">Te asignamos ubicaciones en ${esc(sector.nombre)}; podés cambiarlas en el mapa (${op.cantidad} en total).</p><div id="mapa-r"></div>`;
        mapa = crearMapa(modal.querySelector('#mapa-r'), {
          funcionId: destino.id, seleccion: sel, max: op.cantidad, sectorPermitido: op.sectorId,
          alCambiar: (s) => (modal.querySelector('#confirmar').disabled = s.size !== op.cantidad),
        });
        modal.querySelector('#confirmar').disabled = sel.size !== op.cantidad;
      });
      modal.querySelector('#confirmar').addEventListener('click', async (e) => {
        const codigos = [...mapa.estado.seleccion];
        setCargando(e.currentTarget, true, 'Reprogramando…');
        try {
          await reprogramarEntradas(ents, destino, codigos);
        } catch (err) {
          setCargando(e.currentTarget, false);
          return aviso('No se pudo reprogramar', err.message, 'error');
        }
        cerrar();
        aviso('Entradas reprogramadas', `${fechaMedia(destino.fecha)} · ${destino.hora} h. Descargá el PDF actualizado.`, 'exito', 6000);
        pintar();
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Socio y cuotas
// ---------------------------------------------------------------------------

function pintarSocio(c, u, socio) {
  if (!socio || socio.estado === 'baja') {
    const reasociar = socio?.estado === 'baja';
    c.innerHTML = `
      <div class="dos-columnas">
        <div class="banda-socios" style="grid-template-columns:1fr">
          <div><h2>${reasociar ? 'Volvé a ser socio' : 'Asociate al Teatro CaPaz'}</h2>
          <p>${reasociar ? `Te diste de baja el ${fechaCorta(socio.fechaBaja)}.` : ''} Con tus cuotas al día tenés ${config('descuentoSocio', 30)} % de descuento en todas las entradas, online y en boletería.</p>
          <ul><li>${icono('check')} Cuota mensual de ${pesos(config('cuotaMensual', 12000))}</li>
          <li>${icono('check')} Vence el día ${config('diaVencimientoCuota', 10)} de cada mes (si es inhábil, el primer día hábil siguiente)</li>
          <li>${icono('check')} Pagás en el teatro o desde esta cuenta</li></ul></div>
        </div>
        <div class="panel pila">
          <h3 class="panel__titulo" style="margin:0">Confirmá tus datos</h3>
          <dl class="lista-def"><dt>Nombre</dt><dd>${esc(u.nombre)} ${esc(u.apellido)}</dd><dt>Documento</dt><dd>${esc(u.tipoDoc)} ${esc(u.nroDoc)}</dd>
          <dt>Teléfono</dt><dd>${esc(u.telefono)}</dd><dt>Correo</dt><dd>${esc(u.email)}</dd><dt>Nacimiento</dt><dd>${fechaCorta(u.fechaNac)}</dd></dl>
          <p class="pequeno texto-3">Si algo no es correcto, cambialo en “Mis datos” antes de asociarte.</p>
          <div class="linea-total linea-total--grande"><span>Primera cuota (${periodoTexto(hoyIso().slice(0, 7))})</span><span>${pesos(config('cuotaMensual', 12000))}</span></div>
          <button class="boton boton--oro boton--grande boton--bloque" id="asociar" type="button">${icono('user-plus')} Asociarme y pagar</button>
        </div>
      </div>`;
    c.querySelector('#asociar').addEventListener('click', () =>
      iniciarPagoCuotas({
        periodos: [hoyIso().slice(0, 7)],
        alta: { tipoDoc: u.tipoDoc, nroDoc: u.nroDoc, nombre: u.nombre, apellido: u.apellido, telefono: u.telefono, email: u.email, fechaNac: u.fechaNac },
      })
    );
    return;
  }

  const est = estadoSocio(socio);
  const recibos = new Map();
  for (const q of est.cuotas) {
    if (!recibos.has(q.reciboNro)) recibos.set(q.reciboNro, []);
    recibos.get(q.reciboNro).push(q);
  }
  let accion = '';
  if (est.vencidas.length > 1)
    accion = `${nota(`Adeudás <b>${est.vencidas.length} períodos</b> (${est.vencidas.map((p) => periodoTexto(p.periodo)).join(', ')}). El total es <b>${pesos(est.deuda)}</b>. ¿Querés seguir asociado?`, 'alerta', 'Tenés más de un período vencido')}
      <div class="fila"><button class="boton boton--oro" id="pagar-total" type="button">${icono('check')} Sí, pagar el total ${pesos(est.deuda)}</button>
      <button class="boton boton--peligro" id="baja" type="button">${icono('user-x')} No, darme de baja</button></div>`;
  else if (est.vencidas.length === 1)
    accion = `${nota(`La cuota de ${periodoTexto(est.vencidas[0].periodo)} venció el ${fechaCorta(est.vencidas[0].vencimiento)}. Mientras esté impaga no se aplica el descuento.`, 'alerta')}
      <div class="fila"><button class="boton boton--oro" id="pagar-total" type="button">${icono('credit-card')} Pagar ${pesos(est.deuda)}</button></div>`;
  else
    accion = `${nota(`Tus cuotas están al día: el ${config('descuentoSocio', 30)} % se aplica solo en cada compra.`, 'exito')}
      ${est.proxima ? `<div class="fila"><button class="boton boton--contorno" id="adelantar" type="button">${icono('calendar')} Adelantar ${periodoTexto(est.proxima.periodo)} (${pesos(est.proxima.importe)})</button></div>` : ''}`;

  c.innerHTML = `
    <div class="dos-columnas">
      <div class="pila">
        <div class="tarjeta-socio">
          <div class="tarjeta-socio__fila"><div><small>Socio</small><strong>${esc(socio.nombre)} ${esc(socio.apellido)}</strong></div>${etiqueta(ESTADO_SOCIO[est.estado])}</div>
          <div class="tarjeta-socio__fila"><div><small>N° de socio</small><span class="nro">${socio.nroSocio}</span></div><div style="text-align:right"><small>Desde</small><span>${fechaCorta(socio.fechaAlta)}</span></div></div>
        </div>
        ${accion}
      </div>
      <div class="panel">
        <h3 class="panel__titulo">Estado de cuenta</h3>
        <dl class="lista-def">
          <dt>Situación</dt><dd>${est.alDia ? 'Al día' : 'Con deuda'}</dd>
          <dt>Cuotas vencidas</dt><dd>${est.vencidas.length}</dd>
          <dt>Deuda</dt><dd>${pesos(est.deuda)}</dd>
          <dt>Última cuota pagada</dt><dd>${est.ultimaPagada ? periodoTexto(est.ultimaPagada.periodo) : '—'}</dd>
          <dt>Próximo vencimiento</dt><dd>${est.proxima ? `${fechaCorta(est.proxima.vencimiento)} (${periodoTexto(est.proxima.periodo)})` : '—'}</dd>
        </dl>
      </div>
    </div>
    <h3 class="panel__titulo mt-6">Historial de pagos</h3>
    <div class="tabla-envoltorio"><table class="tabla">
      <thead><tr><th>Período</th><th>Vencimiento</th><th>Pagado</th><th>Canal</th><th class="der">Importe</th><th>Recibo</th></tr></thead>
      <tbody>${est.cuotas
        .slice()
        .reverse()
        .map((q) => `<tr><td>${periodoTexto(q.periodo)}</td><td>${fechaCorta(q.vencimiento)}</td><td>${fechaCorta(q.fechaPago)}</td><td>${q.canal === 'online' ? 'Online' : 'Boletería'}</td><td class="der">${pesos(q.importe)}</td>
          <td><button class="boton boton--fantasma boton--chico" data-recibo="${q.reciboNro}">${icono('receipt')} N° ${q.reciboNro}</button></td></tr>`)
        .join('')}</tbody></table></div>`;

  c.querySelector('#pagar-total')?.addEventListener('click', () => iniciarPagoCuotas({ socioId: socio.id, periodos: est.vencidas.map((p) => p.periodo) }));
  c.querySelector('#adelantar')?.addEventListener('click', () => iniciarPagoCuotas({ socioId: socio.id, periodos: [est.proxima.periodo] }));
  c.querySelector('#baja')?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Darte de baja como socio',
      texto: `<p>Se registra la baja con fecha de hoy. La deuda de ${pesos(est.deuda)} queda registrada y dejás de recibir el descuento.</p>`,
      aceptar: 'Confirmar la baja',
      peligro: true,
    });
    if (!ok) return;
    await bajaSocio(socio);
    aviso('Baja registrada', 'Podés volver a asociarte cuando quieras.', 'info');
    pintar();
  });
  c.querySelectorAll('[data-recibo]').forEach((b) =>
    b.addEventListener('click', async () => {
      const cuotas = recibos.get(Number(b.dataset.recibo));
      const doc = await pdfRecibo(socio, cuotas, est.alDia ? 'Al día' : 'Con cuotas pendientes');
      descargar(doc, `recibo-capaz-${b.dataset.recibo}.pdf`);
    })
  );
}

// ---------------------------------------------------------------------------
// Mis datos
// ---------------------------------------------------------------------------

function pintarDatos(c, u, socio) {
  c.innerHTML = `
  <form class="panel form" id="f-datos" style="max-width:720px" novalidate>
    <h3 class="panel__titulo" style="margin:0">Datos personales</h3>
    <div class="fila-campos">
      <div class="campo"><label for="d-nombre">Nombre</label><input class="entrada" id="d-nombre" value="${esc(u.nombre)}"></div>
      <div class="campo"><label for="d-apellido">Apellido</label><input class="entrada" id="d-apellido" value="${esc(u.apellido)}"></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><span class="etiqueta-campo">Documento</span><input class="entrada" value="${esc(u.tipoDoc)} ${esc(u.nroDoc)}" disabled><span class="ayuda">Para cambiarlo, acercate a boletería.</span></div>
      <div class="campo"><label for="d-tel">Teléfono</label><input class="entrada" id="d-tel" type="tel" value="${esc(u.telefono)}"></div>
    </div>
    <div class="fila-campos">
      <div class="campo"><span class="etiqueta-campo">Correo</span><input class="entrada" value="${esc(u.email)}" disabled></div>
      <div class="campo"><span class="etiqueta-campo">Fecha de nacimiento</span><input class="entrada" value="${fechaCorta(u.fechaNac)}" disabled></div>
    </div>
    <hr class="separador">
    <h3 class="panel__titulo" style="margin:0;font-size:1.1rem">Cambiar contraseña</h3>
    <div class="fila-campos">
      <div class="campo"><label for="d-pass">Nueva contraseña</label><input class="entrada" id="d-pass" type="password" autocomplete="new-password"><span class="ayuda">Dejala vacía para no cambiarla.</span></div>
    </div>
    <div class="fila fila--fin"><button class="boton boton--oro" type="submit">${icono('check')} Guardar cambios</button></div>
  </form>`;
  c.querySelector('#f-datos').addEventListener('submit', async (e) => {
    e.preventDefault();
    const $ = (id) => c.querySelector('#' + id);
    for (const id of ['d-nombre', 'd-apellido', 'd-tel']) errorCampo($(id), $(id).value.trim() ? '' : 'Completá este dato.');
    if (c.querySelector('[aria-invalid="true"]')) return;
    if ($('d-pass').value && $('d-pass').value.length < 4) return errorCampo($('d-pass'), 'Usá al menos 4 caracteres.');
    u.nombre = $('d-nombre').value.trim();
    u.apellido = $('d-apellido').value.trim();
    u.telefono = $('d-tel').value.trim();
    if ($('d-pass').value) u.password = $('d-pass').value;
    const tablas = ['usuarios'];
    if (socio) {
      Object.assign(socio, { nombre: u.nombre, apellido: u.apellido, telefono: u.telefono });
      tablas.push('socios');
    }
    await guardar(tablas, 'modificación de datos');
    aviso('Datos actualizados', socio ? 'También se actualizó tu ficha de socio.' : '', 'exito');
    pintar();
  });
}
