// Boletería (rol boletero o administrador):
// 1) Venta presencial, en el orden del BPMN: función → cantidad y disponibilidad → ubicaciones
//    → documento y verificación de socio (descuento automático) → cobro → registro y ticket.
// 2) Control de ingreso a sala con el código de la entrada.
// 3) Socios: alta, estado de cuenta, cobro de cuotas, consulta de continuidad y baja.
import { db, idx, config, usuarioActual } from '../estado.js';
import {
  calcularImporte, estadoSocio, socioPorDocumento, disponibilidad, libresPorSector, precio, mejoresUbicaciones,
  describirUbicacion, ubicacionCorta, hoyIso, ocupadas, ESTADO_SOCIO, ESTADO_ENTRADA, edad,
} from '../reglas.js';
import { icono, esc, pesos, numero, fechaMedia, fechaCorta, fechaPartes, periodoTexto, etiqueta, nota, aviso, abrirModal, confirmar, setCargando, iniciales, errorCampo, esperar } from '../ui.js';
import { registrarVenta, registrarPagoSinGuardar, pagarCuotas, bajaSocio, altaSocio, modificarSocio, registrarIngreso } from '../operaciones.js';
import { pdfTickets, pdfRecibo, enviarPorCorreo, descargar } from '../pdf.js';
import { guardar } from '../estado.js';
import { crearMapa } from '../mapa.js';

let raizActual = null;
let seccion = 'venta';
let v = null; // estado de la venta en curso
let mapa = null;
let ingreso = { funcionId: null, filtro: '', ultimo: null };
let socios = { texto: '', estado: '' };

function ventaNueva() {
  v = { paso: 0, funcionId: null, cantidad: 2, seleccion: new Set(), doc: '', tipoDoc: 'DNI', verif: null, nombre: '', email: '', medio: 'Efectivo', recibido: '', venta: null, busqueda: '' };
}
ventaNueva();

export function render(raiz, { params }) {
  raizActual = raiz;
  if (params[0] && ['venta', 'ingreso', 'socios'].includes(params[0])) seccion = params[0];
  const u = usuarioActual();
  raiz.innerHTML = `
  <div class="panel-app">
    <div class="panel-app__cab"><div><span class="texto-3">Boletería · ${esc(u.nombre)} ${esc(u.apellido)}</span><h1 class="titulo-pagina">Boletería del teatro</h1></div>
    <span class="en-vivo"><i></i> Datos sincronizados con la venta online</span></div>
    <div class="layout-lateral">
      <nav class="menu-lateral" role="tablist" aria-label="Secciones de boletería">
        ${[
          ['venta', 'ticket', 'Venta presencial', 'Cobrar y emitir tickets'],
          ['ingreso', 'scan-line', 'Control de ingreso', 'Validar entradas en sala'],
          ['socios', 'id-card', 'Socios', 'Altas, cuotas y bajas'],
        ]
          .map(([id, ic, t, s]) => `<button role="tab" type="button" aria-selected="${seccion === id}" data-sec="${id}">${icono(ic)}<span>${t}<small>${s}</small></span></button>`)
          .join('')}
      </nav>
      <div id="seccion"></div>
    </div>
  </div>`;
  raiz.querySelectorAll('[data-sec]').forEach((b) =>
    b.addEventListener('click', () => {
      seccion = b.dataset.sec;
      raiz.querySelectorAll('[data-sec]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      history.replaceState(null, '', '#/boleteria/' + seccion);
      pintarSeccion();
    })
  );
  pintarSeccion();
}

function pintarSeccion() {
  const c = raizActual.querySelector('#seccion');
  if (seccion === 'venta') pintarVenta(c);
  else if (seccion === 'ingreso') pintarIngreso(c);
  else pintarSocios(c);
}

export function alActualizar() {
  if (!raizActual?.isConnected || document.querySelector('.modal-fondo')) return;
  if (seccion === 'venta' && v.paso === 2 && mapa) {
    mapa.redibujar();
    return;
  }
  pintarSeccion();
}

// ===========================================================================
// VENTA PRESENCIAL
// ===========================================================================

const PASOS = ['Función', 'Cantidad', 'Ubicaciones', 'Cliente', 'Cobro', 'Ticket'];

function funcionesVendibles() {
  const hoy = hoyIso();
  return (db.funciones || []).filter((f) => f.estado === 'programada' && f.fecha >= hoy).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

function calcActual() {
  const f = idx.funciones.get(v.funcionId);
  return calcularImporte({ funcion: f, codigos: [...v.seleccion], canal: 'presencial', socioAlDia: !!v.verif?.est?.alDia });
}

function pintarVenta(c) {
  const f = v.funcionId && idx.funciones.get(v.funcionId);
  c.innerHTML = `
    <ol class="pasos" style="margin-top:0">${PASOS.map((p, i) => `<li class="${i < v.paso ? 'hecho' : ''}" ${i === v.paso ? 'aria-current="step"' : ''}>${p}</li>`).join('')}</ol>
    <div class="dos-columnas" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
      <div class="panel paso-boleteria" id="paso"></div>
      <aside class="panel resumen-compra" id="resumen-bol"></aside>
    </div>`;
  const paso = c.querySelector('#paso');
  [pasoFuncion, pasoCantidad, pasoUbicaciones, pasoCliente, pasoCobro, pasoTicket][v.paso](paso);
  pintarResumenBol(c.querySelector('#resumen-bol'));
}

function irPaso(n) {
  v.paso = n;
  pintarSeccion();
  raizActual.querySelector('#paso')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pintarResumenBol(r) {
  const f = v.funcionId && idx.funciones.get(v.funcionId);
  if (!f) {
    r.innerHTML = `<h3 class="panel__titulo" style="margin:0">Resumen</h3><p class="texto-2 pequeno">El resumen de la operación se completa a medida que avanzás.</p>`;
    return;
  }
  const o = idx.obras.get(f.obraId);
  const calc = calcActual();
  r.innerHTML = `
    <h3 class="panel__titulo" style="margin:0">Resumen</h3>
    <div class="pila-chica"><strong class="display" style="font-size:1.25rem">${esc(o.nombre)}</strong>
    <span class="texto-2 pequeno">${esc(fechaMedia(f.fecha))} · ${f.hora} h · ${esc(idx.salas.get(f.salaId).nombre)}</span></div>
    <dl class="lista-def">
      <dt>Cantidad</dt><dd>${v.cantidad}</dd>
      <dt>Ubicaciones</dt><dd>${v.seleccion.size ? [...v.seleccion].map(ubicacionCorta).join(', ') : '—'}</dd>
      <dt>Cliente</dt><dd>${v.verif ? esc(v.nombre || '—') : '—'}</dd>
      <dt>Socio</dt><dd>${v.verif ? (v.verif.socio ? `N° ${v.verif.socio.nroSocio} · ${ESTADO_SOCIO[v.verif.est.estado][0]}` : 'No') : '—'}</dd>
    </dl>
    ${v.seleccion.size ? `<div>
      <div class="linea-total"><span>Subtotal</span><span>${pesos(calc.subtotal)}</span></div>
      ${v.paso >= 3 && calc.descuento ? `<div class="linea-total linea-total--descuento"><span>${esc(calc.detalle)}</span><span>− ${pesos(calc.descuento)}</span></div>` : ''}
      <div class="linea-total linea-total--grande"><span>${v.paso >= 3 ? 'Total' : 'Valor de las entradas'}</span><span>${pesos(v.paso >= 3 ? calc.total : calc.subtotal)}</span></div>
      <p class="pequeno texto-3">En boletería no se cobra cargo por servicio.</p></div>` : ''}
    ${v.paso > 0 && v.paso < 5 ? `<button class="boton boton--fantasma boton--chico" type="button" id="reiniciar">${icono('rotate-ccw')} Empezar de nuevo</button>` : ''}`;
  r.querySelector('#reiniciar')?.addEventListener('click', () => {
    ventaNueva();
    pintarSeccion();
  });
}

function pasoFuncion(p) {
  const lista = funcionesVendibles();
  const t = v.busqueda.toLowerCase();
  const filtradas = lista.filter((f) => !t || idx.obras.get(f.obraId).nombre.toLowerCase().includes(t) || f.fecha.includes(t));
  p.innerHTML = `
    <h2>¿Qué función desea ver el cliente?</h2>
    <div class="buscador__barra" style="box-shadow:none">${icono('search')}
      <label class="oculto-visual" for="b-func">Buscar función</label>
      <input id="b-func" type="search" placeholder="Buscar por obra o fecha (2027-01)…" value="${esc(v.busqueda)}"></div>
    <div class="lista-funciones-bol" id="lista">
      ${filtradas.length ? filtradas
        .map((f) => {
          const o = idx.obras.get(f.obraId);
          const pt = fechaPartes(f.fecha);
          const d = disponibilidad(f.id);
          return `<button class="fila-funcion-bol" type="button" data-f="${f.id}" aria-pressed="${v.funcionId === f.id}">
            <span class="fecha-bloque"><b>${pt.dia}</b><span>${pt.semana} ${pt.mes}</span></span>
            <span><strong>${esc(o.nombre)}</strong><br><span class="pequeno texto-2">${f.hora} h · ${esc(idx.salas.get(f.salaId).nombre)} · ${esc(idx.generos.get(o.generoId).nombre)}</span></span>
            <span class="etiqueta etiqueta--${d.libres < 120 ? 'alerta' : 'exito'}">${numero(d.libres)} libres</span></button>`;
        })
        .join('') : `<div class="vacio">${icono('search')}<h3>Sin resultados</h3></div>`}
    </div>`;
  const inp = p.querySelector('#b-func');
  inp.addEventListener('input', () => {
    v.busqueda = inp.value;
    pasoFuncion(p);
    const n = p.querySelector('#b-func');
    n.focus();
    n.setSelectionRange(n.value.length, n.value.length);
  });
  p.querySelector('#lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    if (v.funcionId !== b.dataset.f) v.seleccion = new Set();
    v.funcionId = b.dataset.f;
    irPaso(1);
  });
}

function pasoCantidad(p) {
  const f = idx.funciones.get(v.funcionId);
  const max = config('maxEntradasPorCompra', 8);
  const lps = libresPorSector(f.id);
  p.innerHTML = `
    <h2>¿Cuántas entradas solicita?</h2>
    <div class="fila">
      <div class="cantidad"><button type="button" data-d="-1" aria-label="Una menos">${icono('minus')}</button>
      <input id="cant" type="number" min="1" max="${max}" value="${v.cantidad}" aria-label="Cantidad de entradas">
      <button type="button" data-d="1" aria-label="Una más">${icono('plus')}</button></div>
      <span class="texto-3 pequeno">Máximo ${max} por operación.</span>
    </div>
    <div class="tabla-envoltorio"><table class="tabla"><thead><tr><th>Sector</th><th class="der">Precio</th><th class="der">Libres</th></tr></thead>
      <tbody>${db.sectores.map((s) => `<tr><td><span class="punto" style="background:${s.color};vertical-align:-2px"></span> ${esc(s.nombre)}</td><td class="der">${pesos(precio(f.id, s.id))}</td><td class="der">${numero(lps[s.id])}</td></tr>`).join('')}</tbody></table></div>
    <div id="resultado"></div>
    <div class="fila fila--entre"><button class="boton boton--fantasma" type="button" id="atras">${icono('arrow-left')} Cambiar función</button>
    <button class="boton boton--oro" type="button" id="verificar">${icono('check')} Verificar disponibilidad</button></div>`;
  const inp = p.querySelector('#cant');
  p.querySelectorAll('[data-d]').forEach((b) =>
    b.addEventListener('click', () => {
      inp.value = Math.min(max, Math.max(1, Number(inp.value) + Number(b.dataset.d)));
    })
  );
  p.querySelector('#atras').addEventListener('click', () => irPaso(0));
  p.querySelector('#verificar').addEventListener('click', () => {
    const n = Math.min(max, Math.max(1, Number(inp.value) || 1));
    const d = disponibilidad(f.id);
    if (d.libres < n) {
      p.querySelector('#resultado').innerHTML = nota(`Quedan ${d.libres} ubicaciones libres. Informá al cliente que no hay lugares suficientes o proponé otra cantidad u otra función.`, 'error', 'No hay suficientes lugares disponibles');
      return;
    }
    v.cantidad = n;
    if (v.seleccion.size > n) v.seleccion = new Set([...v.seleccion].slice(0, n));
    irPaso(2);
  });
}

function pasoUbicaciones(p) {
  const f = idx.funciones.get(v.funcionId);
  p.innerHTML = `
    <h2>Elegí ${v.cantidad} ${v.cantidad === 1 ? 'ubicación' : 'ubicaciones'}</h2>
    <div class="fila" style="gap:8px">
      <label class="oculto-visual" for="sec-auto">Sector</label>
      <select class="entrada" id="sec-auto" style="max-width:260px">${db.sectores.map((s) => `<option value="${s.id}">${esc(s.nombre)} · ${pesos(precio(f.id, s.id))}</option>`).join('')}</select>
      <button class="boton boton--contorno" type="button" id="auto">${icono('sparkles')} Asignar las mejores</button>
    </div>
    <div id="mapa-bol"></div>
    <div class="fila fila--entre"><button class="boton boton--fantasma" type="button" id="atras">${icono('arrow-left')} Cantidad</button>
    <button class="boton boton--oro" type="button" id="seguir" ${v.seleccion.size === v.cantidad ? '' : 'disabled'}>Solicitar documento ${icono('arrow-right')}</button></div>`;
  mapa = crearMapa(p.querySelector('#mapa-bol'), {
    funcionId: f.id,
    seleccion: v.seleccion,
    max: v.cantidad,
    alCambiar: (s) => {
      p.querySelector('#seguir').disabled = s.size !== v.cantidad;
      pintarResumenBol(raizActual.querySelector('#resumen-bol'));
    },
  });
  p.querySelector('#auto').addEventListener('click', () => {
    const s = p.querySelector('#sec-auto').value;
    const el = mejoresUbicaciones(f.id, s, v.cantidad);
    if (el.length < v.cantidad) return aviso('No hay lugares suficientes en ese sector', `Quedan ${el.length}.`, 'alerta');
    mapa.seleccionar(el);
  });
  p.querySelector('#atras').addEventListener('click', () => irPaso(1));
  p.querySelector('#seguir').addEventListener('click', () => irPaso(3));
}

function verificarDocumento(doc) {
  const limpio = String(doc).replace(/\D/g, '');
  const socio = socioPorDocumento(limpio, true);
  const usuario = db.usuarios.find((u) => u.nroDoc === limpio);
  const est = socio ? estadoSocio(socio) : null;
  return { doc: limpio, socio: socio && socio.estado !== 'baja' ? socio : null, socioBaja: socio?.estado === 'baja' ? socio : null, usuario, est: socio && socio.estado !== 'baja' ? est : null };
}

function pasoCliente(p) {
  const f = idx.funciones.get(v.funcionId);
  const r = v.verif;
  let resultado = '';
  if (r) {
    const persona = r.socio || r.usuario;
    if (r.socio && r.est.alDia)
      resultado = `<div class="resultado-socio" style="border-color:var(--exito)"><span class="avatar">${esc(iniciales(r.socio.nombre, r.socio.apellido))}</span>
        <div><strong>${esc(r.socio.nombre)} ${esc(r.socio.apellido)} · Socio N° ${r.socio.nroSocio}</strong><br>${etiqueta(ESTADO_SOCIO.aldia)} <span class="pequeno texto-2">Cuotas al día — el sistema aplica el ${config('descuentoSocio', 30)} % automáticamente.</span></div></div>`;
    else if (r.socio)
      resultado = `<div class="resultado-socio" style="border-color:var(--alerta)"><span class="avatar">${esc(iniciales(r.socio.nombre, r.socio.apellido))}</span>
        <div><strong>${esc(r.socio.nombre)} ${esc(r.socio.apellido)} · Socio N° ${r.socio.nroSocio}</strong><br>${etiqueta(ESTADO_SOCIO.deuda)}
        <span class="pequeno texto-2">${r.est.vencidas.length} ${r.est.vencidas.length === 1 ? 'cuota vencida' : 'cuotas vencidas'}: ${r.est.vencidas.map((x) => periodoTexto(x.periodo)).join(', ')} · ${pesos(r.est.deuda)}. Sin descuento mientras tenga deuda.</span></div></div>
        <div class="fila"><button class="boton boton--oro boton--chico" type="button" id="cobrar-deuda">${icono('banknote')} Cobrar la deuda ahora (${pesos(r.est.deuda)})</button>
        <span class="pequeno texto-3">Si regulariza, se aplica el descuento en esta misma compra.</span></div>`;
    else if (r.socioBaja) resultado = nota(`${esc(r.socioBaja.nombre)} ${esc(r.socioBaja.apellido)} fue socio hasta el ${fechaCorta(r.socioBaja.fechaBaja)} (baja). No corresponde el descuento.`, 'info', 'No es socio activo');
    else resultado = nota(`El documento ${esc(r.doc)} no corresponde a un socio. ${persona ? `Es cliente registrado: ${esc(persona.nombre)} ${esc(persona.apellido)}.` : ''} Puede asociarse en la sección Socios.`, 'info', 'No es socio');
    const calc = calcActual();
    if (calc.beneficio?.tipo === 'promo') resultado += nota(`Se aplica la promoción ${esc(calc.beneficio.promo.descripcion)}.`, 'exito');
  }
  p.innerHTML = `
    <h2>Documento del cliente</h2>
    <p class="texto-2 pequeno">Con el documento el sistema verifica si es socio y si tiene las cuotas al día. El estado de cuenta está siempre actualizado: el descuento lo decide el sistema.</p>
    <form class="grupo-entrada" id="f-doc" novalidate>
      <label class="oculto-visual" for="tipo-doc">Tipo</label>
      <select class="entrada" id="tipo-doc" style="max-width:120px"><option ${v.tipoDoc === 'DNI' ? 'selected' : ''}>DNI</option><option ${v.tipoDoc === 'Pasaporte' ? 'selected' : ''}>Pasaporte</option></select>
      <label class="oculto-visual" for="nro-doc">Número de documento</label>
      <input class="entrada" id="nro-doc" inputmode="numeric" placeholder="Número de documento" value="${esc(v.doc)}" autocomplete="off">
      <button class="boton boton--oro" type="submit">${icono('search')} Verificar</button>
    </form>
    <div id="res-verif" class="pila-chica">${resultado}</div>
    ${r ? `<div class="fila-campos">
      <div class="campo"><label for="c-nombre">Nombre y apellido</label><input class="entrada" id="c-nombre" value="${esc(v.nombre)}"></div>
      <div class="campo"><label for="c-email">Correo (opcional)</label><input class="entrada" id="c-email" type="email" value="${esc(v.email)}" placeholder="Para enviarle las entradas"></div>
    </div>` : ''}
    <div class="fila fila--entre"><button class="boton boton--fantasma" type="button" id="atras">${icono('arrow-left')} Ubicaciones</button>
    <button class="boton boton--oro" type="button" id="seguir" ${r ? '' : 'disabled'}>Calcular importe y cobrar ${icono('arrow-right')}</button></div>`;
  p.querySelector('#f-doc').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = p.querySelector('#nro-doc');
    const doc = inp.value.replace(/\D/g, '');
    if (doc.length < 7) return errorCampo(inp, 'Ingresá un documento válido (7 a 9 dígitos).');
    v.doc = doc;
    v.tipoDoc = p.querySelector('#tipo-doc').value;
    v.verif = verificarDocumento(doc);
    const per = v.verif.socio || v.verif.socioBaja || v.verif.usuario;
    v.nombre = per ? `${per.nombre} ${per.apellido}` : '';
    v.email = per?.email || '';
    pintarSeccion();
    setTimeout(() => raizActual.querySelector(v.nombre ? '#seguir' : '#c-nombre')?.focus(), 30);
  });
  p.querySelector('#atras').addEventListener('click', () => irPaso(2));
  p.querySelector('#cobrar-deuda')?.addEventListener('click', () =>
    dialogoCobroCuotas(r.socio, r.est.vencidas.map((x) => x.periodo), () => {
      v.verif = verificarDocumento(v.doc);
      pintarSeccion();
      aviso('Socio regularizado', `Ahora está al día: se aplica el ${config('descuentoSocio', 30)} %.`, 'exito');
    })
  );
  p.querySelector('#seguir')?.addEventListener('click', () => {
    const n = p.querySelector('#c-nombre');
    if (!n.value.trim()) return errorCampo(n, 'Ingresá el nombre del cliente para el ticket.'), n.focus();
    v.nombre = n.value.trim();
    v.email = p.querySelector('#c-email').value.trim();
    irPaso(4);
  });
}

function pasoCobro(p) {
  const calc = calcActual();
  const medios = ['Efectivo', 'Tarjeta de débito', 'Tarjeta de crédito'];
  p.innerHTML = `
    <h2>Cobrar ${pesos(calc.total)}</h2>
    <div>
      ${calc.lineas.map((l) => `<div class="linea-total"><span>${esc(describirUbicacion(l.codigo))}</span><span>${pesos(l.precio)}</span></div>`).join('')}
      ${calc.descuento ? `<div class="linea-total linea-total--descuento"><span>${esc(calc.detalle)}</span><span>− ${pesos(calc.descuento)}</span></div>` : `<div class="linea-total texto-3"><span>Sin descuentos aplicables</span><span>—</span></div>`}
      <div class="linea-total linea-total--grande"><span>Importe final</span><span>${pesos(calc.total)}</span></div>
    </div>
    <div class="campo"><span class="etiqueta-campo">Medio de pago</span>
      <div class="segmentado" role="radiogroup">${medios.map((m) => `<button type="button" role="radio" aria-pressed="${v.medio === m}" aria-checked="${v.medio === m}" data-m="${m}">${icono(m === 'Efectivo' ? 'banknote' : 'credit-card')} ${m}</button>`).join('')}</div></div>
    ${v.medio === 'Efectivo' ? `<div class="fila-campos"><div class="campo"><label for="recibido">Monto recibido</label><input class="entrada" id="recibido" inputmode="numeric" value="${esc(v.recibido)}" placeholder="${calc.total}"></div>
      <div class="campo"><span class="etiqueta-campo">Vuelto</span><output class="entrada num" id="vuelto" style="display:flex;align-items:center">—</output></div></div>` : nota('Procesá el cobro en la terminal de la boletería y confirmá cuando esté aprobado.', 'info')}
    <div class="fila fila--entre">
      <button class="boton boton--peligro" type="button" id="no-pago">${icono('circle-x')} El cliente no realizó el pago</button>
      <button class="boton boton--oro boton--grande" type="button" id="cobrado">${icono('check')} Pago recibido: registrar venta</button>
    </div>
    <button class="boton boton--fantasma boton--chico" type="button" id="atras">${icono('arrow-left')} Volver a los datos del cliente</button>`;
  p.querySelectorAll('[data-m]').forEach((b) =>
    b.addEventListener('click', () => {
      v.medio = b.dataset.m;
      pasoCobro(p);
    })
  );
  const rec = p.querySelector('#recibido');
  const calcVuelto = () => {
    v.recibido = rec.value.replace(/\D/g, '');
    const n = Number(v.recibido);
    p.querySelector('#vuelto').textContent = n ? (n >= calc.total ? pesos(n - calc.total) : `Faltan ${pesos(calc.total - n)}`) : '—';
  };
  rec?.addEventListener('input', calcVuelto);
  if (rec) calcVuelto();
  p.querySelector('#atras').addEventListener('click', () => irPaso(3));
  p.querySelector('#no-pago').addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Anular la operación', texto: '<p>No se registra ninguna venta y las ubicaciones siguen disponibles.</p>', aceptar: 'Anular', peligro: true });
    if (!ok) return;
    aviso('Operación anulada', 'El cliente no realizó el pago. No se registró la venta.', 'info');
    ventaNueva();
    pintarSeccion();
  });
  p.querySelector('#cobrado').addEventListener('click', async (e) => {
    if (v.medio === 'Efectivo' && v.recibido && Number(v.recibido) < calc.total) return aviso('Monto insuficiente', `Faltan ${pesos(calc.total - Number(v.recibido))}.`, 'alerta');
    const btn = e.currentTarget;
    setCargando(btn, true, 'Registrando…');
    const f = idx.funciones.get(v.funcionId);
    try {
      const venta = await registrarVenta({
        canal: 'presencial', funcion: f, codigos: [...v.seleccion], socio: v.verif.socio, calc, estado: 'confirmada', vendedorId: usuarioActual().id,
        cliente: { usuarioId: '', tipoDoc: v.tipoDoc, nroDoc: v.doc, nombre: v.nombre, email: v.email },
      });
      registrarPagoSinGuardar({ tipo: 'venta', origenId: venta.id, plataforma: 'Boletería', medio: v.medio, importe: venta.total, estado: 'aprobado' });
      await guardar(['pagos'], 'cobro en boletería');
      v.venta = venta;
      irPaso(5);
    } catch (err) {
      setCargando(btn, false);
      aviso('No se pudo registrar', err.tomadas ? `Se vendieron online: ${err.tomadas.map(ubicacionCorta).join(', ')}. Elegí otras.` : err.message, 'error', 7000);
      if (err.tomadas) {
        err.tomadas.forEach((c) => v.seleccion.delete(c));
        irPaso(2);
      }
    }
  });
}

function pasoTicket(p) {
  const venta = v.venta;
  const ents = idx.entradasPorVenta.get(venta.id) || [];
  p.innerHTML = `
    <div class="confirmacion" style="margin:0;width:100%">
      <div class="sello-ok">${icono('check')}</div>
      <h2>Venta N° ${venta.nro} registrada</h2>
      <p class="texto-2">${venta.cantidad} ${venta.cantidad === 1 ? 'entrada' : 'entradas'} · ${pesos(venta.total)} · ${esc(v.medio)}${venta.esSocio ? ' · descuento de socio aplicado' : ''}</p>
      <ul class="lista-entradas" style="width:100%;text-align:left">${ents.map((e) => `<li><span>${esc(describirUbicacion(e.ubicacion))}</span><code>${e.codigo}</code></li>`).join('')}</ul>
      <div class="fila" style="justify-content:center">
        <button class="boton boton--oro boton--grande" type="button" id="imprimir">${icono('printer')} Emitir ticket (PDF)</button>
        ${venta.clienteEmail ? `<button class="boton boton--contorno" type="button" id="mail">${icono('mail')} Enviar a ${esc(venta.clienteEmail)}</button>` : ''}
      </div>
      <button class="boton boton--fantasma" type="button" id="nueva">${icono('plus')} Nueva venta</button>
    </div>`;
  let doc = null;
  const obtener = async () => (doc ||= await pdfTickets(venta, ents));
  p.querySelector('#imprimir').addEventListener('click', async (e) => {
    setCargando(e.currentTarget, true, 'Generando…');
    descargar(await obtener(), `ticket-capaz-venta-${venta.nro}.pdf`);
    setCargando(e.currentTarget, false);
  });
  p.querySelector('#mail')?.addEventListener('click', async (e) => {
    setCargando(e.currentTarget, true, 'Enviando…');
    const f = idx.funciones.get(venta.funcionId);
    const r = await enviarPorCorreo({
      para: venta.clienteEmail, asunto: `Tus entradas — ${idx.obras.get(f.obraId).nombre}`,
      html: `<p>Hola ${esc(venta.clienteNombre)}:</p><p>Adjuntamos las entradas compradas en la boletería del Teatro CaPaz.</p>`,
      doc: await obtener(), nombreArchivo: `entradas-capaz-venta-${venta.nro}.pdf`,
    });
    setCargando(e.currentTarget, false);
    if (r.enviado) {
      venta.emailEnviado = true;
      await guardar(['ventas'], 'envío de tickets');
    }
    aviso(r.enviado ? 'Entradas enviadas' : 'No se pudo enviar', r.simulado ? 'Envío simulado (modo demostración).' : r.error || venta.clienteEmail, r.enviado ? 'exito' : 'error');
  });
  p.querySelector('#nueva').addEventListener('click', () => {
    ventaNueva();
    pintarSeccion();
  });
}

// ===========================================================================
// COBRO DE CUOTAS (compartido entre venta y sección socios)
// ===========================================================================

function dialogoCobroCuotas(socio, periodos, alTerminar) {
  const importe = config('cuotaMensual', 12000);
  abrirModal({
    titulo: `Cobrar cuotas · Socio N° ${socio.nroSocio}`,
    cuerpo: `
      <p>${esc(socio.nombre)} ${esc(socio.apellido)} · ${esc(socio.tipoDoc)} ${esc(socio.nroDoc)}</p>
      <div>${periodos.map((p) => `<div class="linea-total"><span>${periodoTexto(p)}</span><span>${pesos(importe)}</span></div>`).join('')}
      <div class="linea-total linea-total--grande"><span>Total</span><span>${pesos(importe * periodos.length)}</span></div></div>
      <div class="campo"><label for="medio-c">Medio de pago</label><select class="entrada" id="medio-c"><option>Efectivo</option><option>Tarjeta de débito</option><option>Tarjeta de crédito</option></select></div>`,
    pie: `<button class="boton boton--fantasma" data-cerrar type="button">Volver</button>
          <button class="boton boton--oro" id="ok" type="button">${icono('receipt')} Registrar pago y emitir recibo</button>`,
    alAbrir(modal, cerrar) {
      modal.querySelector('#ok').addEventListener('click', async (e) => {
        setCargando(e.currentTarget, true, 'Registrando…');
        const { cuotas, estado } = await pagarCuotas(socio, periodos, { canal: 'presencial', registradoPor: usuarioActual().id, medio: modal.querySelector('#medio-c').value });
        const doc = await pdfRecibo(socio, cuotas, estado.alDia ? 'Al día' : 'Con cuotas pendientes');
        descargar(doc, `recibo-capaz-${cuotas[0].reciboNro}.pdf`);
        cerrar();
        aviso('Pago registrado', `Recibo N° ${cuotas[0].reciboNro} emitido. Estado: ${estado.alDia ? 'al día' : 'con pendientes'}.`, 'exito');
        alTerminar?.();
      });
    },
  });
}

// ===========================================================================
// CONTROL DE INGRESO
// ===========================================================================

function pintarIngreso(c) {
  const hoy = hoyIso();
  const funcs = (db.funciones || []).slice().sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (!ingreso.funcionId) ingreso.funcionId = (funcs.find((f) => f.fecha >= hoy) || funcs[funcs.length - 1]).id;
  const f = idx.funciones.get(ingreso.funcionId);
  const ents = (idx.entradasPorFuncion.get(f.id) || []).filter((e) => e.estado === 'valida' || e.estado === 'usada');
  const usadas = ents.filter((e) => e.estado === 'usada').length;
  const t = ingreso.filtro.toLowerCase();
  const filtradas = ents.filter((e) => {
    if (!t) return true;
    const venta = idx.ventas.get(e.ventaId);
    return `${e.codigo} ${venta.clienteNombre} ${venta.clienteDoc} ${describirUbicacion(e.ubicacion)}`.toLowerCase().includes(t);
  });
  const r = ingreso.ultimo;
  c.innerHTML = `
    <div class="pila">
      <div class="panel pila">
        <div class="fila fila--entre">
          <div class="campo" style="flex:1;min-width:240px"><label for="func-ing">Función</label>
            <select class="entrada" id="func-ing">${funcs.map((x) => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${esc(fechaMedia(x.fecha))} ${x.hora} h · ${esc(idx.obras.get(x.obraId).nombre)}${x.fecha < hoy ? ' (realizada)' : ''}</option>`).join('')}</select></div>
          <div style="min-width:200px"><small class="texto-3">Ingresaron</small><div class="fila" style="gap:10px"><b class="num" style="font-size:1.5rem">${numero(usadas)} / ${numero(ents.length)}</b>
          <div class="barra-mini" style="flex:1"><span style="width:${ents.length ? (usadas / ents.length) * 100 : 0}%"></span></div></div></div>
        </div>
        <form class="grupo-entrada" id="f-cod" novalidate>
          <label class="oculto-visual" for="codigo">Código de la entrada</label>
          <input class="entrada codigo-grande" id="codigo" placeholder="CPZ-XXXXXXXX" autocomplete="off" autofocus>
          <button class="boton boton--oro" type="submit">${icono('scan-line')} Registrar ingreso</button>
        </form>
        <p class="pequeno texto-3">Escaneá el QR con el lector de la puerta o escribí el código impreso en la entrada.</p>
        ${r ? `<div class="ingreso-resultado ingreso-resultado--${r.tipo}" role="status">${icono(r.tipo === 'ok' ? 'circle-check' : r.tipo === 'alerta' ? 'triangle-alert' : 'circle-x')}<h3>${esc(r.titulo)}</h3><p>${esc(r.texto)}</p></div>` : ''}
      </div>
      <div class="panel pila">
        <div class="fila fila--entre"><h3 class="panel__titulo" style="margin:0">Entradas de la función</h3>
        <input class="entrada" id="filtro-ing" type="search" placeholder="Buscar por código, nombre o DNI" value="${esc(ingreso.filtro)}" style="max-width:300px" aria-label="Filtrar entradas"></div>
        <div class="tabla-envoltorio" style="max-height:440px"><table class="tabla">
          <thead><tr><th>Código</th><th>Ubicación</th><th>Titular</th><th>Estado</th><th></th></tr></thead>
          <tbody>${filtradas
            .slice(0, 80)
            .map((e) => {
              const venta = idx.ventas.get(e.ventaId);
              return `<tr><td><code>${e.codigo}</code></td><td>${esc(describirUbicacion(e.ubicacion))}</td><td>${esc(venta.clienteNombre)}</td><td>${etiqueta(ESTADO_ENTRADA[e.estado])}${e.fechaIngreso ? ` <span class="pequeno texto-3">${e.fechaIngreso.slice(11)}</span>` : ''}</td>
              <td>${e.estado === 'valida' ? `<button class="boton boton--fantasma boton--chico" data-ingresar="${e.codigo}">${icono('door-open')} Ingresar</button>` : ''}</td></tr>`;
            })
            .join('') || `<tr><td colspan="5" class="texto-3">No hay entradas que coincidan.</td></tr>`}</tbody></table></div>
        ${filtradas.length > 80 ? `<p class="pequeno texto-3">Se muestran 80 de ${filtradas.length}. Usá la búsqueda para encontrar una entrada.</p>` : ''}
      </div>
    </div>`;
  c.querySelector('#func-ing').addEventListener('change', (e) => {
    ingreso.funcionId = e.target.value;
    ingreso.ultimo = null;
    pintarIngreso(c);
  });
  c.querySelector('#filtro-ing').addEventListener('input', (e) => {
    ingreso.filtro = e.target.value;
    pintarIngreso(c);
    const n = c.querySelector('#filtro-ing');
    n.focus();
    n.setSelectionRange(n.value.length, n.value.length);
  });
  c.querySelector('#f-cod').addEventListener('submit', (e) => {
    e.preventDefault();
    validarCodigo(c, c.querySelector('#codigo').value);
  });
  c.querySelectorAll('[data-ingresar]').forEach((b) => b.addEventListener('click', () => validarCodigo(c, b.dataset.ingresar)));
}

async function validarCodigo(c, texto) {
  let cod = texto.trim().toUpperCase();
  if (cod && !cod.startsWith('CPZ-')) cod = 'CPZ-' + cod.replace(/^CPZ/, '');
  const e = db.entradas.find((x) => x.codigo === cod);
  const f = idx.funciones.get(ingreso.funcionId);
  if (!e) ingreso.ultimo = { tipo: 'error', titulo: 'Código inexistente', texto: `${cod || 'El código'} no corresponde a ninguna entrada emitida.` };
  else if (e.estado === 'cancelada' || e.estado === 'anulada') ingreso.ultimo = { tipo: 'error', titulo: 'Entrada cancelada', texto: 'La compra fue cancelada. No habilita el ingreso.' };
  else if (e.estado === 'reservada') ingreso.ultimo = { tipo: 'error', titulo: 'Pago no confirmado', texto: 'La entrada está reservada pero el pago no se confirmó.' };
  else if (e.funcionId !== f.id) {
    const otra = idx.funciones.get(e.funcionId);
    ingreso.ultimo = { tipo: 'error', titulo: 'Es para otra función', texto: `${idx.obras.get(otra.obraId).nombre} · ${fechaMedia(otra.fecha)} ${otra.hora} h.` };
  } else if (e.estado === 'usada') ingreso.ultimo = { tipo: 'alerta', titulo: 'Ya ingresó', texto: `Registrado a las ${e.fechaIngreso.slice(11)}. ${describirUbicacion(e.ubicacion)}.` };
  else {
    await registrarIngreso(e);
    ingreso.ultimo = { tipo: 'ok', titulo: 'Ingreso registrado', texto: `${describirUbicacion(e.ubicacion)} · ${idx.ventas.get(e.ventaId).clienteNombre}` };
  }
  pintarIngreso(c);
  c.querySelector('#codigo')?.focus();
}

// ===========================================================================
// SOCIOS
// ===========================================================================

function pintarSocios(c) {
  const t = socios.texto.toLowerCase();
  const lista = db.socios
    .map((s) => ({ s, est: estadoSocio(s) }))
    .filter(({ s, est }) => (!socios.estado || est.estado === socios.estado) && (!t || `${s.nombre} ${s.apellido} ${s.nroDoc} ${s.nroSocio}`.toLowerCase().includes(t)))
    .sort((a, b) => b.s.nroSocio - a.s.nroSocio);
  const cuenta = (e) => db.socios.filter((s) => estadoSocio(s).estado === e).length;
  c.innerHTML = `
    <div class="pila">
      <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:0">
        <div class="kpi"><small>Al día</small><b>${cuenta('aldia')}</b><span>con descuento habilitado</span></div>
        <div class="kpi"><small>Con deuda</small><b>${cuenta('deuda')}</b><span>cuotas vencidas impagas</span></div>
        <div class="kpi"><small>Bajas</small><b>${cuenta('baja')}</b><span>dejaron de ser socios</span></div>
      </div>
      <div class="fila fila--entre">
        <div class="fila" style="flex:1">
          <input class="entrada" id="b-socio" type="search" placeholder="Buscar por nombre, DNI o N° de socio" value="${esc(socios.texto)}" style="max-width:320px" aria-label="Buscar socio">
          <select class="entrada" id="e-socio" style="max-width:180px" aria-label="Filtrar por estado"><option value="">Todos</option><option value="aldia" ${socios.estado === 'aldia' ? 'selected' : ''}>Al día</option><option value="deuda" ${socios.estado === 'deuda' ? 'selected' : ''}>Con deuda</option><option value="baja" ${socios.estado === 'baja' ? 'selected' : ''}>Bajas</option></select>
        </div>
        <button class="boton boton--oro" type="button" id="nuevo">${icono('user-plus')} Nuevo socio</button>
      </div>
      <div class="tabla-envoltorio"><table class="tabla">
        <thead><tr><th>N°</th><th>Socio</th><th>Documento</th><th>Alta</th><th>Estado</th><th class="der">Deuda</th><th></th></tr></thead>
        <tbody>${lista
          .map(({ s, est }) => `<tr><td class="num">${s.nroSocio}</td><td>${esc(s.nombre)} ${esc(s.apellido)}</td><td>${esc(s.nroDoc)}</td><td>${fechaCorta(s.fechaAlta)}</td>
            <td>${etiqueta(ESTADO_SOCIO[est.estado])}</td><td class="der">${est.deuda ? pesos(est.deuda) : '—'}</td>
            <td><button class="boton boton--fantasma boton--chico" data-socio="${s.id}">${icono('eye')} Ver</button></td></tr>`)
          .join('') || `<tr><td colspan="7" class="texto-3">No hay socios que coincidan.</td></tr>`}</tbody></table></div>
    </div>`;
  c.querySelector('#b-socio').addEventListener('input', (e) => {
    socios.texto = e.target.value;
    pintarSocios(c);
    const n = c.querySelector('#b-socio');
    n.focus();
    n.setSelectionRange(n.value.length, n.value.length);
  });
  c.querySelector('#e-socio').addEventListener('change', (e) => {
    socios.estado = e.target.value;
    pintarSocios(c);
  });
  c.querySelector('#nuevo').addEventListener('click', () => dialogoAlta(c));
  c.querySelectorAll('[data-socio]').forEach((b) => b.addEventListener('click', () => dialogoSocio(c, idx.socios.get(b.dataset.socio))));
}

function dialogoSocio(c, socio) {
  const est = estadoSocio(socio);
  const recibos = new Map();
  for (const q of est.cuotas) (recibos.get(q.reciboNro) || recibos.set(q.reciboNro, []).get(q.reciboNro)).push(q);
  let consulta = '';
  if (est.vencidas.length > 1)
    consulta = `${nota(`Adeuda ${est.vencidas.length} períodos (${pesos(est.deuda)}). Consultá si va a seguir asociado.`, 'alerta', 'Deuda de más de un período')}
      <div class="fila"><button class="boton boton--oro" id="sigue" type="button">${icono('check')} Sigue: cobrar ${pesos(est.deuda)}</button>
      <button class="boton boton--peligro" id="no-sigue" type="button">${icono('user-x')} No sigue: registrar baja</button></div>`;
  else if (est.vencidas.length === 1)
    consulta = `${nota(`Cuota vencida: ${periodoTexto(est.vencidas[0].periodo)}.`, 'alerta')}<div class="fila"><button class="boton boton--oro" id="sigue" type="button">${icono('banknote')} Cobrar ${pesos(est.deuda)}</button></div>`;
  else if (socio.estado !== 'baja' && est.proxima)
    consulta = `${nota('Cuotas al día.', 'exito')}<div class="fila"><button class="boton boton--contorno" id="adelantar" type="button">${icono('calendar')} Cobrar ${periodoTexto(est.proxima.periodo)} por adelantado</button></div>`;

  abrirModal({
    titulo: `Socio N° ${socio.nroSocio}`,
    ancho: true,
    cuerpo: `
      <div class="dos-columnas" style="grid-template-columns:1fr 1fr">
        <form class="form" id="f-socio" novalidate>
          <div class="fila-campos">
            <div class="campo"><label for="s-nombre">Nombre</label><input class="entrada" id="s-nombre" value="${esc(socio.nombre)}"></div>
            <div class="campo"><label for="s-apellido">Apellido</label><input class="entrada" id="s-apellido" value="${esc(socio.apellido)}"></div></div>
          <div class="fila-campos">
            <div class="campo"><label for="s-tel">Teléfono</label><input class="entrada" id="s-tel" value="${esc(socio.telefono)}"></div>
            <div class="campo"><label for="s-email">Correo</label><input class="entrada" id="s-email" value="${esc(socio.email)}"></div></div>
          <p class="pequeno texto-3">${esc(socio.tipoDoc)} ${esc(socio.nroDoc)} · Nacimiento ${fechaCorta(socio.fechaNac)} · Alta ${fechaCorta(socio.fechaAlta)}${socio.fechaBaja ? ` · Baja ${fechaCorta(socio.fechaBaja)}` : ''}</p>
          <div><button class="boton boton--contorno boton--chico" type="submit">${icono('check')} Guardar datos</button></div>
        </form>
        <div class="pila-chica">
          <div class="fila">${etiqueta(ESTADO_SOCIO[est.estado])}<span class="texto-2 pequeno">Última cuota: ${est.ultimaPagada ? periodoTexto(est.ultimaPagada.periodo) : '—'}</span></div>
          ${consulta}
        </div>
      </div>
      <div class="tabla-envoltorio" style="max-height:260px"><table class="tabla"><thead><tr><th>Período</th><th>Pagado</th><th>Canal</th><th class="der">Importe</th><th>Recibo</th></tr></thead>
        <tbody>${est.cuotas.slice().reverse().map((q) => `<tr><td>${periodoTexto(q.periodo)}</td><td>${fechaCorta(q.fechaPago)} ${q.horaPago}</td><td>${q.canal === 'online' ? 'Online' : 'Boletería'}</td><td class="der">${pesos(q.importe)}</td><td><button class="boton boton--fantasma boton--chico" type="button" data-recibo="${q.reciboNro}">N° ${q.reciboNro}</button></td></tr>`).join('') || '<tr><td colspan="5">Sin pagos</td></tr>'}</tbody></table></div>`,
    alAbrir(modal, cerrar) {
      const refrescar = () => {
        cerrar();
        pintarSocios(c);
        dialogoSocio(c, socio);
      };
      modal.querySelector('#f-socio').addEventListener('submit', async (e) => {
        e.preventDefault();
        await modificarSocio(socio, {
          nombre: modal.querySelector('#s-nombre').value.trim(), apellido: modal.querySelector('#s-apellido').value.trim(),
          telefono: modal.querySelector('#s-tel').value.trim(), email: modal.querySelector('#s-email').value.trim(),
        });
        aviso('Datos del socio actualizados', '', 'exito');
      });
      modal.querySelector('#sigue')?.addEventListener('click', () => {
        cerrar();
        dialogoCobroCuotas(socio, est.vencidas.map((x) => x.periodo), () => {
          pintarSocios(c);
          dialogoSocio(c, socio);
        });
      });
      modal.querySelector('#adelantar')?.addEventListener('click', () => {
        cerrar();
        dialogoCobroCuotas(socio, [est.proxima.periodo], () => pintarSocios(c));
      });
      modal.querySelector('#no-sigue')?.addEventListener('click', async () => {
        await bajaSocio(socio);
        aviso('Baja registrada', `${socio.nombre} ${socio.apellido} dejó de ser socio el ${fechaCorta(socio.fechaBaja)}.`, 'info');
        refrescar();
      });
      modal.querySelectorAll('[data-recibo]').forEach((b) =>
        b.addEventListener('click', async () => {
          const doc = await pdfRecibo(socio, recibos.get(Number(b.dataset.recibo)), est.alDia ? 'Al día' : 'Con cuotas pendientes');
          descargar(doc, `recibo-capaz-${b.dataset.recibo}.pdf`);
        })
      );
    },
  });
}

function dialogoAlta(c) {
  abrirModal({
    titulo: 'Alta de socio',
    ancho: true,
    cuerpo: `
      <p class="texto-2 pequeno">Se registran los datos personales, se indica la cuota mensual y se cobra la primera cuota.</p>
      <form class="form" id="f-alta" novalidate>
        <div class="fila-campos">
          <div class="campo"><label for="a-tipo">Tipo de documento</label><select class="entrada" id="a-tipo"><option>DNI</option><option>Pasaporte</option><option>LE</option><option>LC</option></select></div>
          <div class="campo"><label for="a-doc">Número</label><input class="entrada" id="a-doc" inputmode="numeric"></div>
          <div class="campo"><label for="a-nac">Fecha de nacimiento</label><input class="entrada" id="a-nac" type="date" max="${hoyIso()}"></div></div>
        <div class="fila-campos">
          <div class="campo"><label for="a-nombre">Nombre</label><input class="entrada" id="a-nombre"></div>
          <div class="campo"><label for="a-apellido">Apellido</label><input class="entrada" id="a-apellido"></div></div>
        <div class="fila-campos">
          <div class="campo"><label for="a-tel">Teléfono</label><input class="entrada" id="a-tel" type="tel"></div>
          <div class="campo"><label for="a-email">Correo</label><input class="entrada" id="a-email" type="email"></div>
          <div class="campo"><label for="a-medio">Medio de pago</label><select class="entrada" id="a-medio"><option>Efectivo</option><option>Tarjeta de débito</option><option>Tarjeta de crédito</option></select></div></div>
        <div class="linea-total linea-total--grande"><span>Cuota mensual (${periodoTexto(hoyIso().slice(0, 7))})</span><span>${pesos(config('cuotaMensual', 12000))}</span></div>
      </form>`,
    pie: `<button class="boton boton--fantasma" data-cerrar type="button">Cancelar</button>
          <button class="boton boton--oro" id="alta" type="button">${icono('receipt')} Cobrar y registrar socio</button>`,
    alAbrir(modal, cerrar) {
      const $ = (id) => modal.querySelector('#' + id);
      const docInp = $('a-doc');
      docInp.addEventListener('change', () => {
        // Si ya es cliente registrado, se completan sus datos
        const u = db.usuarios.find((x) => x.nroDoc === docInp.value.replace(/\D/g, ''));
        if (!u) return;
        $('a-nombre').value ||= u.nombre;
        $('a-apellido').value ||= u.apellido;
        $('a-tel').value ||= u.telefono;
        $('a-email').value ||= u.email;
        $('a-nac').value ||= u.fechaNac;
        aviso('Cliente registrado encontrado', 'Completamos los datos de su cuenta.', 'info', 3000);
      });
      $('alta').addEventListener('click', async (e) => {
        const req = ['a-doc', 'a-nac', 'a-nombre', 'a-apellido', 'a-tel', 'a-email'];
        let primero = null;
        for (const id of req) {
          errorCampo($(id), $(id).value.trim() ? '' : 'Dato obligatorio.');
          if (!$(id).value.trim()) primero ||= $(id);
        }
        const doc = docInp.value.replace(/\D/g, '');
        const activo = socioPorDocumento(doc);
        if (doc && activo) {
          errorCampo(docInp, `Ya es socio activo (N° ${activo.nroSocio}).`);
          primero ||= docInp;
        }
        if ($('a-nac').value && edad($('a-nac').value) < 0) primero ||= $('a-nac');
        if (primero) return primero.focus();
        setCargando(e.currentTarget, true, 'Registrando…');
        const { socio, cuotas } = await altaSocio(
          { tipoDoc: $('a-tipo').value, nroDoc: doc, nombre: $('a-nombre').value.trim(), apellido: $('a-apellido').value.trim(), telefono: $('a-tel').value.trim(), email: $('a-email').value.trim(), fechaNac: $('a-nac').value },
          { canal: 'presencial', registradoPor: usuarioActual().id, medio: $('a-medio').value }
        );
        const pdf = await pdfRecibo(socio, cuotas, 'Al día');
        descargar(pdf, `recibo-capaz-${cuotas[0].reciboNro}.pdf`);
        cerrar();
        aviso(`Socio N° ${socio.nroSocio} registrado`, 'Se emitió el recibo de la primera cuota.', 'exito', 6000);
        pintarSocios(c);
      });
    },
  });
}
