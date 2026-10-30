// Detalle de una función: datos de la obra, otras fechas, mapa de ubicaciones
// y cálculo dinámico del importe (socio, promociones y cargo por servicio).
import { db, idx, config, usuarioActual } from '../estado.js';
import {
  calcularImporte, estadoSocio, socioDeUsuario, disponibilidad, libresPorSector, precio,
  mejoresUbicaciones, describirUbicacion, ubicacionCorta, hoyIso,
} from '../reglas.js';
import { icono, esc, pesos, marcoImagen, fechaLarga, fechaMedia, nota, aviso, numero } from '../ui.js';
import { crearMapa } from '../mapa.js';
import { ir } from '../app.js';

const selecciones = new Map(); // se conserva la selección si el usuario vuelve a la función
let mapa = null;
let funcionActual = null;
let raizActual = null;

export function render(raiz, { params }) {
  raizActual = raiz;
  mapa = null;
  const f = idx.funciones.get(params[0]);
  if (!f) {
    raiz.innerHTML = `<div class="contenedor" style="padding:80px 0"><div class="vacio">${icono('circle-alert')}<h3>No encontramos esa función</h3><a class="boton boton--oro" href="#/cartelera">Volver a la cartelera</a></div></div>`;
    return;
  }
  funcionActual = f;
  const o = idx.obras.get(f.obraId);
  const g = idx.generos.get(o.generoId);
  const s = idx.salas.get(f.salaId);
  const finalizada = f.estado !== 'programada' || f.fecha < hoyIso();
  const otras = (db.funciones || [])
    .filter((x) => x.obraId === f.obraId && x.estado === 'programada' && x.fecha >= hoyIso())
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (!selecciones.has(f.id)) selecciones.set(f.id, new Set());
  const u = usuarioActual();

  raiz.innerHTML = `
  <div class="contenedor">
    <nav class="fila pequeno texto-3" style="padding-top:var(--e-5)" aria-label="Ruta">
      <a href="#/cartelera">${icono('arrow-left')} Cartelera</a> <span aria-hidden="true">/</span> <span>${esc(g.nombre)}</span>
    </nav>
    <section class="ficha">
      ${marcoImagen(f.imagen || o.imagen, o.nombre)}
      <div class="ficha__datos">
        <span class="etiqueta etiqueta--oro">${esc(g.nombre)} · ${esc(o.clasificacion)}</span>
        <h1>${esc(o.nombre)}</h1>
        <div class="ficha__cuando">
          <span>${icono('calendar')} ${esc(fechaLarga(f.fecha))}</span>
          <span>${icono('clock')} ${f.hora} h · ${o.duracion} min</span>
          <span>${icono('map-pin')} ${esc(s.nombre)}</span>
        </div>
        <p class="ficha__sinopsis">${esc(o.sinopsis)}</p>
        <dl class="lista-def" style="grid-template-columns:auto 1fr">
          <dt>Dirección</dt><dd style="text-align:left">${esc(o.director)}</dd>
          <dt>Elenco</dt><dd style="text-align:left">${esc(o.actores)}</dd>
          <dt>Origen</dt><dd style="text-align:left">${esc(o.pais)}, ${o.anio}</dd>
        </dl>
        ${otras.length > 1 ? `<div class="pila-chica"><strong class="pequeno">Otras fechas de esta obra</strong><div class="otras-fechas">
          ${otras.map((x) => `<a class="chip-fecha" href="#/funcion/${x.id}" ${x.id === f.id ? 'aria-current="page"' : ''}>${esc(fechaMedia(x.fecha))}<small>${x.hora} h · ${esc(idx.salas.get(x.salaId).nombre)}</small></a>`).join('')}
        </div></div>` : ''}
      </div>
    </section>

    <section class="seccion" style="padding-top:var(--e-8)" aria-labelledby="t-ubic">
      <div class="seccion__cab" style="margin-bottom:var(--e-3)">
        <div><h2 class="titulo-seccion" id="t-ubic">${finalizada ? 'Función finalizada' : 'Elegí tus ubicaciones'}</h2>
        <p class="bajada" id="disp-texto"></p></div>
      </div>
      ${finalizada
        ? nota('Esta función ya se realizó. Elegí otra fecha de la cartelera.', 'info')
        : `<div class="sala-compra">
        <div id="mapa"></div>
        <aside class="resumen-compra" aria-label="Resumen de la compra">
          <div class="panel" style="padding:var(--e-4)">
            <h3 class="panel__titulo" style="font-size:1.15rem;margin-bottom:var(--e-3)">Sectores y precios</h3>
            <div class="sectores" id="sectores"></div>
            <div class="fila mt-5" style="gap:8px">
              <label class="oculto-visual" for="cant-auto">Cantidad</label>
              <select class="entrada" id="cant-auto" style="width:84px">${Array.from({ length: config('maxEntradasPorCompra', 8) }, (_, i) => `<option value="${i + 1}" ${i === 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
              <button class="boton boton--contorno" type="button" id="auto" style="flex:1">${icono('sparkles')} Elegir las mejores</button>
            </div>
            <p class="ayuda pequeno texto-3" style="margin-top:6px" id="auto-ayuda">Elegí un sector y el sistema asigna ubicaciones contiguas, lo más cerca posible del escenario.</p>
          </div>
          <div class="panel" style="padding:var(--e-4)" id="resumen"></div>
        </aside>
      </div>
      <div class="barra-movil" id="barra-movil"></div>`}
    </section>
  </div>`;

  pintarDisponibilidad();
  if (finalizada) return;

  let sectorFoco = null;
  mapa = crearMapa(raiz.querySelector('#mapa'), {
    funcionId: f.id,
    seleccion: selecciones.get(f.id),
    max: config('maxEntradasPorCompra', 8),
    alCambiar: () => pintarResumen(),
  });

  const pintarSectores = () => {
    const libres = libresPorSector(f.id);
    const pct = config('cargoServicioOnline', 10);
    raiz.querySelector('#sectores').innerHTML = (db.sectores || [])
      .map((se) => {
        const p = precio(f.id, se.id);
        return `<button class="sector" type="button" data-sector="${se.id}" aria-pressed="${sectorFoco === se.id}" style="--color-sector:${se.color}">
          <span class="sector__color"></span>
          <span><strong>${esc(se.nombre)}</strong><small>${idx.tiposUbicacion.get(se.tipoUbicacionId).planta} · ${numero(libres[se.id])} libres</small></span>
          <span class="sector__precio">${pesos(p)}<small class="texto-3">+ ${pesos((p * pct) / 100)} serv.</small></span>
        </button>`;
      })
      .join('');
  };
  pintarSectores();
  raiz.querySelector('#sectores').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sector]');
    if (!b) return;
    sectorFoco = mapa.enfocar(b.dataset.sector);
    pintarSectores();
    raiz.querySelector('#auto-ayuda').textContent = sectorFoco
      ? `Se asignarán ubicaciones en ${idx.sectores.get(sectorFoco).nombre}.`
      : 'Elegí un sector y el sistema asigna ubicaciones contiguas, lo más cerca posible del escenario.';
  });
  raiz.querySelector('#auto').addEventListener('click', () => {
    if (!sectorFoco) return aviso('Elegí un sector primero', 'Tocá un sector de la lista para asignar ubicaciones en él.', 'info');
    const n = Number(raiz.querySelector('#cant-auto').value);
    const elegidas = mejoresUbicaciones(f.id, sectorFoco, n);
    if (elegidas.length < n) return aviso('No hay lugares suficientes', `En ${idx.sectores.get(sectorFoco).nombre} quedan ${elegidas.length}.`, 'alerta');
    mapa.seleccionar(elegidas);
    aviso('Ubicaciones asignadas', elegidas.map(ubicacionCorta).join(', '), 'exito', 3000);
  });
  pintarResumen();
  render.pintarSectores = pintarSectores;
}

function pintarDisponibilidad() {
  const d = disponibilidad(funcionActual.id);
  const el = raizActual.querySelector('#disp-texto');
  if (el) el.textContent = `${numero(d.libres)} de ${numero(d.total)} ubicaciones libres. Las ocupadas se ven en gris y se actualizan en tiempo real.`;
}

function pintarResumen() {
  const f = funcionActual;
  const sel = [...selecciones.get(f.id)];
  const u = usuarioActual();
  const socio = socioDeUsuario(u);
  const est = socio ? estadoSocio(socio) : null;
  const calc = calcularImporte({ funcion: f, codigos: sel, canal: 'online', socioAlDia: !!est?.alDia });
  const res = raizActual.querySelector('#resumen');

  let avisos = '';
  if (!u) avisos = nota(`¿Sos socio? <a href="#/ingresar">Ingresá</a> y el descuento del ${config('descuentoSocio', 30)} % se aplica solo.`, 'info');
  else if (u.rol === 'boletero' || u.rol === 'encargado') avisos = nota('Estás con una cuenta de personal. Para vender en mostrador usá <a href="#/boleteria">Boletería</a>.', 'alerta');
  else if (est?.alDia) avisos = nota(`Socio N° ${socio.nroSocio} con las cuotas al día: descuento del ${config('descuentoSocio', 30)} % aplicado.`, 'exito');
  else if (est?.estado === 'deuda')
    avisos = nota(`Tenés ${est.vencidas.length} ${est.vencidas.length === 1 ? 'cuota vencida' : 'cuotas vencidas'} (${pesos(est.deuda)}). <a href="#/mi-cuenta/socio">Regularizá tu cuenta</a> para recibir el ${config('descuentoSocio', 30)} %.`, 'alerta');
  if (calc.beneficio?.tipo === 'promo') avisos += nota(`Promoción vigente: ${esc(calc.beneficio.promo.descripcion)}. No se combina con el descuento de socio; se aplica el beneficio mayor.`, 'exito');

  // Agrupado por sector
  const grupos = {};
  for (const l of calc.lineas) {
    grupos[l.sectorId] = grupos[l.sectorId] || { cant: 0, precio: l.precio };
    grupos[l.sectorId].cant++;
  }

  res.innerHTML = `
    <h3 class="panel__titulo" style="font-size:1.15rem;margin-bottom:var(--e-3)">Tu selección</h3>
    ${sel.length
      ? `<div class="elegidas" aria-label="Ubicaciones elegidas">${sel
          .map((c) => `<span class="elegida" title="${esc(describirUbicacion(c))}">${esc(ubicacionCorta(c))}<button type="button" data-quitar="${c}" aria-label="Quitar ${esc(describirUbicacion(c))}">${icono('x')}</button></span>`)
          .join('')}</div>
        <div class="mt-5">
          ${Object.entries(grupos).map(([sid, gr]) => `<div class="linea-total"><span>${esc(idx.sectores.get(sid).nombre)} × ${gr.cant}</span><span>${pesos(gr.precio * gr.cant)}</span></div>`).join('')}
          ${calc.descuento ? `<div class="linea-total linea-total--descuento"><span>${esc(calc.detalle)}</span><span>− ${pesos(calc.descuento)}</span></div>` : ''}
          <div class="linea-total texto-2"><span>Cargo por servicio online (${config('cargoServicioOnline', 10)} %)</span><span>${pesos(calc.cargo)}</span></div>
          <div class="linea-total linea-total--grande"><span>Total</span><span>${pesos(calc.total)}</span></div>
        </div>`
      : `<p class="texto-2 pequeno">Todavía no elegiste ubicaciones. Tocá las butacas libres en el mapa o usá “Elegir las mejores”.</p>`}
    <div class="pila-chica mt-5">${avisos}</div>
    <button class="boton boton--oro boton--grande boton--bloque mt-5" type="button" id="comprar" ${sel.length ? '' : 'disabled'}>
      ${icono('ticket')} ${sel.length ? `Comprar ${sel.length} ${sel.length === 1 ? 'entrada' : 'entradas'}` : 'Elegí ubicaciones'}</button>`;

  res.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => mapa.quitar(b.dataset.quitar)));
  res.querySelector('#comprar').addEventListener('click', comprar);

  const barra = raizActual.querySelector('#barra-movil');
  if (barra)
    barra.innerHTML = `<div><small class="texto-3">${sel.length} ${sel.length === 1 ? 'ubicación' : 'ubicaciones'}</small><br><b class="num">${pesos(calc.total)}</b></div>
      <button class="boton boton--oro" type="button" ${sel.length ? '' : 'disabled'} id="comprar-movil">Continuar ${icono('arrow-right')}</button>`;
  barra?.querySelector('#comprar-movil')?.addEventListener('click', comprar);
}

function comprar() {
  const sel = [...selecciones.get(funcionActual.id)];
  if (!sel.length) return;
  const u = usuarioActual();
  if (u && (u.rol === 'boletero' || u.rol === 'encargado')) return aviso('Cuenta de personal', 'Las compras online se hacen con una cuenta de cliente.', 'alerta');
  sessionStorage.setItem('capaz-carrito', JSON.stringify({ funcionId: funcionActual.id, codigos: sel }));
  if (!u) {
    sessionStorage.setItem('capaz-volver', '/compra');
    aviso('Ingresá o creá tu cuenta', 'Para comprar online tenés que estar registrado y ser mayor de edad. Tus ubicaciones quedan elegidas.', 'info', 6000);
    return ir('/ingresar');
  }
  ir('/compra');
}

export function limpiarSeleccion(funcionId) {
  selecciones.delete(funcionId);
}

export function alActualizar() {
  if (!raizActual?.isConnected || !mapa) return;
  mapa.redibujar();
  render.pintarSectores?.();
  pintarDisponibilidad();
  pintarResumen();
}
