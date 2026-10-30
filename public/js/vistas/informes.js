// Informes para la Gerencia (rol encargado o administrador).
// Cada informe se recalcula al instante cuando cambian los datos (ventas, cuotas, socios).
// Para agregar un informe nuevo, sumar un objeto a la lista INFORMES con su función calcular().
import { db, idx, alCambiar } from '../estado.js';
import { estadoSocio, periodos, hoyIso, sumarDias, isoFecha, ubicaciones, ocupadas } from '../reglas.js';
import { icono, esc, pesos, numero, porcentaje, fechaCorta, fechaMedia, periodoTexto, aviso, setCargando } from '../ui.js';
import { pdfInforme, descargar } from '../pdf.js';

const PALETA = ['#7a3d9e', '#d9ad55', '#3f9a83', '#c46a4a', '#5f7fbf', '#b0476e', '#8a8f9c'];

const ventasConfirmadas = (f) => db.ventas.filter((v) => v.estado === 'confirmada' && (!f.desde || v.fecha >= f.desde) && (!f.hasta || v.fecha <= f.hasta));
const entradasDe = (venta) => (idx.entradasPorVenta.get(venta.id) || []).filter((e) => e.estado === 'valida' || e.estado === 'usada');

export const INFORMES = [
  {
    id: 'permanencia',
    titulo: 'Permanencia de socios hasta que dejan de pagar',
    corto: 'Permanencia de socios',
    icono: 'hourglass',
    destinatario: 'Gerencia General',
    nivel: 'Estratégico',
    finalidad: 'Conocer cuánto tiempo, en promedio, los socios sostienen el pago de la cuota antes de dejar de pagar, para evaluar acciones de retención.',
    filtro: 'fechas',
    etiquetaFiltro: 'Fecha de alta del socio',
    calcular(f) {
      const lista = db.socios.filter((s) => (!f.desde || s.fechaAlta >= f.desde) && (!f.hasta || s.fechaAlta <= f.hasta));
      const filas = [];
      const dejaron = [];
      const activos = [];
      for (const s of lista) {
        const est = estadoSocio(s);
        const ultimo = est.ultimaPagada?.periodo;
        const meses = ultimo ? periodos(s.fechaAlta.slice(0, 7), ultimo).length : 0;
        const dejo = s.estado === 'baja' || est.vencidas.length >= 2;
        if (dejo) dejaron.push(meses);
        else activos.push(meses);
        if (dejo)
          filas.push({ s, meses, ultimo, situacion: s.estado === 'baja' ? `Baja ${fechaCorta(s.fechaBaja)}` : `Deuda de ${est.vencidas.length} períodos` });
      }
      const prom = dejaron.length ? dejaron.reduce((a, b) => a + b, 0) / dejaron.length : 0;
      const promActivos = activos.length ? activos.reduce((a, b) => a + b, 0) / activos.length : 0;
      const rangos = [
        ['1 a 3 meses', (m) => m <= 3],
        ['4 a 6 meses', (m) => m >= 4 && m <= 6],
        ['7 a 12 meses', (m) => m >= 7 && m <= 12],
        ['Más de 12 meses', (m) => m > 12],
      ];
      const valores = rangos.map(([, fn]) => dejaron.filter(fn).length);
      const primerSemestre = dejaron.length ? (valores[0] + valores[1]) / dejaron.length : 0;
      filas.sort((a, b) => a.meses - b.meses);
      return {
        kpis: [
          { etiqueta: 'Permanencia promedio hasta dejar de pagar', valor: `${prom.toFixed(1).replace('.', ',')} meses` },
          { etiqueta: 'Socios que dejaron de pagar', valor: `${dejaron.length} de ${lista.length}` },
          { etiqueta: 'Tasa de abandono', valor: porcentaje(lista.length ? dejaron.length / lista.length : 0, 1) },
          { etiqueta: 'Antigüedad promedio de los que siguen', valor: `${promActivos.toFixed(1).replace('.', ',')} meses` },
        ],
        torta: { titulo: 'Meses pagados antes de dejar de pagar', etiquetas: rangos.map((r) => r[0]), valores },
        conclusion: dejaron.length
          ? `En promedio, los socios dejan de pagar a los <b>${prom.toFixed(1).replace('.', ',')} meses</b> de asociarse. El <b>${porcentaje(primerSemestre)}</b> de los que abandonan lo hace dentro de los primeros seis meses.`
          : 'Ningún socio del período elegido dejó de pagar.',
        columnas: [{ titulo: 'Socio', ancho: 2 }, { titulo: 'Alta' }, { titulo: 'Último período pagado', ancho: 1.4 }, { titulo: 'Meses pagados', der: true }, { titulo: 'Situación', ancho: 1.6 }],
        filas: filas.map((r) => [`${r.s.nombre} ${r.s.apellido} (N° ${r.s.nroSocio})`, fechaCorta(r.s.fechaAlta), r.ultimo ? periodoTexto(r.ultimo) : 'Ninguno', String(r.meses), r.situacion]),
        nota: 'Se considera que un socio dejó de pagar cuando se registró su baja o cuando adeuda dos o más períodos vencidos.',
      };
    },
  },
  {
    id: 'demanda',
    titulo: 'Funciones más demandadas',
    corto: 'Más demandadas',
    icono: 'trophy',
    destinatario: 'Gerencia General',
    nivel: 'Estratégico',
    finalidad: 'Identificar las obras con mayor convocatoria para decidir si conviene agregar, modificar o cancelar funciones.',
    filtro: 'fechas',
    etiquetaFiltro: 'Fecha de la venta',
    calcular(f) {
      const porObra = new Map();
      for (const v of ventasConfirmadas(f)) {
        const ents = entradasDe(v);
        if (!ents.length) continue;
        const fn = idx.funciones.get(ents[0].funcionId);
        const r = porObra.get(fn.obraId) || { entradas: 0, ventas: 0, recaudacion: 0 };
        r.entradas += ents.length;
        r.ventas++;
        r.recaudacion += v.total;
        porObra.set(fn.obraId, r);
      }
      const ranking = [...porObra.entries()].map(([obraId, r]) => ({ obra: idx.obras.get(obraId), ...r, funciones: db.funciones.filter((x) => x.obraId === obraId).length })).sort((a, b) => b.entradas - a.entradas);
      const total = ranking.reduce((s, r) => s + r.entradas, 0);
      const top = ranking.slice(0, 5);
      const otras = ranking.slice(5).reduce((s, r) => s + r.entradas, 0);
      return {
        kpis: [
          { etiqueta: 'Entradas vendidas', valor: numero(total) },
          { etiqueta: 'Obra más pedida', valor: ranking[0]?.obra.nombre || '—' },
          { etiqueta: 'Participación de la primera', valor: ranking[0] ? porcentaje(ranking[0].entradas / total, 1) : '—' },
          { etiqueta: 'Promedio por función', valor: ranking.length ? numero(Math.round(total / ranking.reduce((s, r) => s + r.funciones, 0))) : '—' },
        ],
        torta: { titulo: 'Entradas vendidas por obra', etiquetas: [...top.map((r) => r.obra.nombre), ...(otras ? ['Otras'] : [])], valores: [...top.map((r) => r.entradas), ...(otras ? [otras] : [])] },
        conclusion: ranking[0]
          ? `<b>${esc(ranking[0].obra.nombre)}</b> encabeza la demanda con ${numero(ranking[0].entradas)} entradas (${porcentaje(ranking[0].entradas / total)} del total). ${ranking.length > 1 ? `Le sigue ${esc(ranking[1].obra.nombre)}.` : ''}`
          : 'No hay ventas en el período elegido.',
        columnas: [{ titulo: 'Puesto', ancho: 0.6 }, { titulo: 'Obra', ancho: 2 }, { titulo: 'Género' }, { titulo: 'Funciones', der: true, ancho: 0.8 }, { titulo: 'Entradas', der: true, ancho: 0.8 }, { titulo: 'Recaudación', der: true, ancho: 1.2 }],
        filas: ranking.map((r, i) => [`${i + 1}°`, r.obra.nombre, idx.generos.get(r.obra.generoId).nombre, String(r.funciones), numero(r.entradas), pesos(r.recaudacion)]),
      };
    },
  },
  {
    id: 'ocupacion',
    titulo: 'Demanda y ocupación por función',
    corto: 'Ocupación por función',
    icono: 'armchair',
    destinatario: 'Gerencia General',
    nivel: 'Estratégico',
    finalidad: 'Analizar la convocatoria de cada función sobre las ubicaciones habilitadas (350 plateas y 250 palcos) para evaluar cambios en la programación.',
    filtro: 'funcion',
    etiquetaFiltro: 'Fecha de la función',
    calcular(f) {
      const cap = ubicaciones().length;
      const funcs = db.funciones
        .filter((x) => (!f.desde || x.fecha >= f.desde) && (!f.hasta || x.fecha <= f.hasta))
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
        .map((x) => {
          const vendidas = (idx.entradasPorFuncion.get(x.id) || []).filter((e) => e.estado === 'valida' || e.estado === 'usada').length;
          return { fn: x, vendidas, libres: cap - vendidas, ocup: vendidas / cap };
        });
      const sel = f.funcionId ? funcs.filter((r) => r.fn.id === f.funcionId) : funcs;
      const vend = sel.reduce((s, r) => s + r.vendidas, 0);
      const tot = sel.length * cap;
      const prom = funcs.length ? funcs.reduce((s, r) => s + r.ocup, 0) / funcs.length : 0;
      const orden = funcs.slice().sort((a, b) => b.ocup - a.ocup);
      const nombre = (r) => `${idx.obras.get(r.fn.obraId).nombre} (${fechaCorta(r.fn.fecha)})`;
      return {
        kpis: [
          { etiqueta: f.funcionId ? 'Ocupación de la función' : 'Ocupación del conjunto', valor: porcentaje(tot ? vend / tot : 0, 1) },
          { etiqueta: 'Ubicaciones vendidas', valor: `${numero(vend)} de ${numero(tot)}` },
          { etiqueta: 'Ocupación promedio por función', valor: porcentaje(prom, 1) },
          { etiqueta: 'Funciones analizadas', valor: String(funcs.length) },
        ],
        torta: { titulo: f.funcionId ? 'Ubicaciones de la función' : 'Ubicaciones de las funciones filtradas', etiquetas: ['Vendidas', 'Disponibles'], valores: [vend, tot - vend] },
        conclusion: funcs.length
          ? `La ocupación promedio es <b>${porcentaje(prom, 1)}</b>. La función más llena es <b>${esc(nombre(orden[0]))}</b> con ${porcentaje(orden[0].ocup)}; la de menor convocatoria, ${esc(nombre(orden[orden.length - 1]))} con ${porcentaje(orden[orden.length - 1].ocup)}.`
          : 'No hay funciones en el rango elegido.',
        columnas: [{ titulo: 'Fecha', ancho: 1 }, { titulo: 'Obra', ancho: 2 }, { titulo: 'Sala', ancho: 0.8 }, { titulo: 'Vendidas', der: true, ancho: 0.8 }, { titulo: 'Libres', der: true, ancho: 0.8 }, { titulo: 'Ocupación', der: true, ancho: 1, barra: true }],
        filas: funcs.map((r) => [`${fechaCorta(r.fn.fecha)} ${r.fn.hora}`, idx.obras.get(r.fn.obraId).nombre, idx.salas.get(r.fn.salaId).nombre, numero(r.vendidas), numero(r.libres), porcentaje(r.ocup, 1)]),
        barras: funcs.map((r) => r.ocup),
        resaltar: f.funcionId ? funcs.findIndex((r) => r.fn.id === f.funcionId) : -1,
      };
    },
  },
  {
    id: 'canal',
    titulo: 'Recaudación por canal de venta',
    corto: 'Recaudación por canal',
    icono: 'store',
    destinatario: 'Gerencia Administrativa',
    nivel: 'Táctico',
    finalidad: 'Controlar los ingresos y comparar las ventas presenciales con las online, verificando que cada venta registrada tenga su pago confirmado.',
    filtro: 'fechas',
    etiquetaFiltro: 'Fecha de la venta',
    calcular(f) {
      const ventas = ventasConfirmadas(f);
      const pagosOk = new Set(db.pagos.filter((p) => p.tipo === 'venta' && p.estado === 'aprobado').map((p) => p.origenId));
      const canales = ['presencial', 'online'].map((c) => {
        const vs = ventas.filter((v) => v.canal === c);
        const rec = vs.reduce((s, v) => s + v.total, 0);
        return {
          canal: c, ventas: vs.length, entradas: vs.reduce((s, v) => s + entradasDe(v).length, 0), recaudacion: rec,
          cargo: vs.reduce((s, v) => s + v.cargoServicio, 0), promedio: vs.length ? rec / vs.length : 0, sinPago: vs.filter((v) => !pagosOk.has(v.id)).length,
        };
      });
      const total = canales[0].recaudacion + canales[1].recaudacion;
      const dif = canales[0].sinPago + canales[1].sinPago;
      return {
        kpis: [
          { etiqueta: 'Recaudación total', valor: pesos(total) },
          { etiqueta: 'Participación online', valor: porcentaje(total ? canales[1].recaudacion / total : 0, 1) },
          { etiqueta: 'Cargo por servicio online', valor: pesos(canales[1].cargo) },
          { etiqueta: 'Ventas sin pago confirmado', valor: String(dif) },
        ],
        torta: { titulo: 'Recaudación por canal', etiquetas: ['Boletería (presencial)', 'Online'], valores: canales.map((c) => c.recaudacion) },
        conclusion: total
          ? `El canal online aporta el <b>${porcentaje(canales[1].recaudacion / total)}</b> de la recaudación y la boletería el <b>${porcentaje(canales[0].recaudacion / total)}</b>. ${dif ? `Hay ${dif} ventas sin pago confirmado para revisar.` : 'Todas las ventas registradas tienen su pago confirmado: no hay diferencias entre canales.'}`
          : 'No hay ventas en el período elegido.',
        columnas: [{ titulo: 'Canal', ancho: 1.6 }, { titulo: 'Ventas', der: true }, { titulo: 'Entradas', der: true }, { titulo: 'Ticket promedio', der: true, ancho: 1.2 }, { titulo: 'Recaudación', der: true, ancho: 1.3 }, { titulo: 'Sin pago', der: true, ancho: 0.8 }],
        filas: canales.map((c) => [c.canal === 'online' ? 'Online' : 'Boletería (presencial)', numero(c.ventas), numero(c.entradas), pesos(c.promedio), pesos(c.recaudacion), String(c.sinPago)]),
      };
    },
  },
  {
    id: 'socios',
    titulo: 'Compras de socios y no socios',
    corto: 'Socios vs. no socios',
    icono: 'users',
    destinatario: 'Gerencia General y Departamento de Socios',
    nivel: 'Táctico',
    finalidad: 'Medir cuánto compran los socios frente al resto del público y cuánto representa el descuento del 30 % otorgado.',
    filtro: 'fechas',
    etiquetaFiltro: 'Fecha de la venta',
    calcular(f) {
      const ventas = ventasConfirmadas(f);
      const grupos = [true, false].map((soc) => {
        const vs = ventas.filter((v) => v.esSocio === soc);
        return {
          nombre: soc ? 'Socios' : 'No socios', ventas: vs.length, entradas: vs.reduce((s, v) => s + entradasDe(v).length, 0),
          descuento: vs.reduce((s, v) => s + v.descuento, 0), recaudacion: vs.reduce((s, v) => s + v.total, 0),
        };
      });
      const totE = grupos[0].entradas + grupos[1].entradas;
      const promos = ventas.filter((v) => !v.esSocio && v.descuento > 0);
      return {
        kpis: [
          { etiqueta: 'Entradas compradas por socios', valor: porcentaje(totE ? grupos[0].entradas / totE : 0, 1) },
          { etiqueta: 'Descuento de socios otorgado', valor: pesos(grupos[0].descuento) },
          { etiqueta: 'Descuento por promociones', valor: pesos(promos.reduce((s, v) => s + v.descuento, 0)) },
          { etiqueta: 'Entradas por compra de socios', valor: grupos[0].ventas ? (grupos[0].entradas / grupos[0].ventas).toFixed(1).replace('.', ',') : '—' },
        ],
        torta: { titulo: 'Entradas por tipo de cliente', etiquetas: grupos.map((g) => g.nombre), valores: grupos.map((g) => g.entradas) },
        conclusion: totE
          ? `Los socios compraron el <b>${porcentaje(grupos[0].entradas / totE)}</b> de las entradas y recibieron <b>${pesos(grupos[0].descuento)}</b> en descuentos.`
          : 'No hay ventas en el período elegido.',
        columnas: [{ titulo: 'Tipo de cliente', ancho: 1.5 }, { titulo: 'Ventas', der: true }, { titulo: 'Entradas', der: true }, { titulo: 'Descuentos', der: true, ancho: 1.2 }, { titulo: 'Recaudación', der: true, ancho: 1.3 }],
        filas: grupos.map((g) => [g.nombre, numero(g.ventas), numero(g.entradas), pesos(g.descuento), pesos(g.recaudacion)]),
      };
    },
  },
];

let raizActual = null;
let actualId = 'permanencia';
const filtros = {};
let grafico = null;
let ultimaActualizacion = new Date();
let desuscribir = null;

function presets() {
  const hoy = new Date();
  return [
    ['todo', 'Todo', '', ''],
    ['30', 'Últimos 30 días', isoFecha(sumarDias(hoy, -30)), isoFecha(hoy)],
    ['mes', 'Este mes', isoFecha(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), isoFecha(hoy)],
    ['anio', `Año ${hoy.getFullYear()}`, `${hoy.getFullYear()}-01-01`, `${hoy.getFullYear()}-12-31`],
  ];
}

export function render(raiz, { params }) {
  raizActual = raiz;
  if (params[0] && INFORMES.some((i) => i.id === params[0])) actualId = params[0];
  ultimaActualizacion = new Date();
  pintar();
  desuscribir?.();
  // Las ventas o pagos hechos en esta misma pestaña también refrescan el informe
  desuscribir = alCambiar((ev) => {
    if (ev.propio) alActualizar();
  });
}

export function salir() {
  grafico?.destroy();
  grafico = null;
  desuscribir?.();
}

export function alActualizar() {
  if (!raizActual?.isConnected) return;
  ultimaActualizacion = new Date();
  pintar(true);
}

export function alCambiarTema() {
  pintar();
}

function kpisGenerales() {
  const confirmadas = db.ventas.filter((v) => v.estado === 'confirmada');
  const canceladas = db.ventas.filter((v) => v.estado === 'cancelada');
  const recaudacion = confirmadas.reduce((s, v) => s + v.total, 0) + canceladas.reduce((s, v) => s + v.total - v.reintegro, 0);
  const vendidas = db.entradas.filter((e) => e.estado === 'valida' || e.estado === 'usada').length;
  const cap = ubicaciones().length * db.funciones.length;
  const activos = db.socios.filter((s) => s.estado !== 'baja');
  const alDia = activos.filter((s) => estadoSocio(s).alDia).length;
  return `<div class="kpis">
    <div class="kpi"><small>Recaudación acumulada</small><b>${pesos(recaudacion)}</b><span>${numero(confirmadas.length)} ventas confirmadas</span></div>
    <div class="kpi"><small>Entradas vendidas</small><b>${numero(vendidas)}</b><span>en ${db.funciones.length} funciones</span></div>
    <div class="kpi"><small>Ocupación general</small><b>${porcentaje(vendidas / cap, 1)}</b><span>sobre ${numero(cap)} ubicaciones</span></div>
    <div class="kpi"><small>Socios activos</small><b>${activos.length}</b><span>${alDia} con cuotas al día</span></div>
  </div>`;
}

function pintar(desdeVivo = false) {
  const inf = INFORMES.find((i) => i.id === actualId);
  const f = (filtros[inf.id] ||= { preset: 'todo', desde: '', hasta: '', funcionId: '' });
  const r = inf.calcular(f);
  const hora = ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  raizActual.innerHTML = `
  <div class="panel-app">
    <div class="panel-app__cab"><div><span class="texto-3">Gestionar informes</span><h1 class="titulo-pagina">Informes de gestión</h1></div>
      <span class="en-vivo ${desdeVivo ? 'flash' : ''}" role="status"><i></i> En vivo · actualizado ${hora}</span></div>
    ${kpisGenerales()}
    <div class="layout-lateral">
      <nav class="menu-lateral" role="tablist" aria-label="Informes disponibles">
        ${INFORMES.map((i) => `<button role="tab" type="button" aria-selected="${i.id === inf.id}" data-inf="${i.id}">${icono(i.icono)}<span>${i.corto}<small>${i.nivel} · ${i.destinatario.split(' y ')[0]}</small></span></button>`).join('')}
      </nav>
      <article class="informe panel" aria-labelledby="t-inf">
        <div class="informe__cab">
          <div><h2 id="t-inf">${esc(inf.titulo)}</h2>
            <p class="texto-2" style="max-width:68ch;margin-top:6px">${esc(inf.finalidad)}</p>
            <div class="informe__meta"><span class="etiqueta etiqueta--oro">${inf.nivel}</span><span class="etiqueta">${esc(inf.destinatario)}</span></div></div>
          <button class="boton boton--oro" type="button" id="pdf">${icono('download')} Exportar PDF</button>
        </div>
        ${filtrosHtml(inf, f)}
        <div class="kpis" style="margin:0">${r.kpis.map((k) => `<div class="kpi"><small>${esc(k.etiqueta)}</small><b style="font-size:1.3rem">${esc(k.valor)}</b></div>`).join('')}</div>
        <p class="conclusion">${r.conclusion}</p>
        <div class="informe__cuerpo">
          <figure style="margin:0" class="pila-chica">
            <figcaption class="texto-2 pequeno" style="text-align:center">${esc(r.torta.titulo)}</figcaption>
            <div class="torta"><canvas id="torta" role="img" aria-label="${esc(r.torta.titulo)}: ${r.torta.etiquetas.map((e, i) => `${e} ${r.torta.valores[i]}`).join(', ')}"></canvas></div>
          </figure>
          <div class="tabla-envoltorio" style="max-height:420px">
            <table class="tabla"><thead><tr>${r.columnas.map((c) => `<th class="${c.der ? 'der' : ''}">${esc(c.titulo)}</th>`).join('')}</tr></thead>
            <tbody>${r.filas.length ? r.filas
              .map((fila, i) => `<tr class="${r.resaltar === i ? 'seleccionada' : ''}">${fila
                .map((celda, j) => {
                  const col = r.columnas[j];
                  if (col.barra) return `<td class="der"><div class="fila" style="gap:8px;justify-content:flex-end;flex-wrap:nowrap"><span>${esc(celda)}</span><div class="barra-mini" style="width:70px"><span style="width:${(r.barras[i] * 100).toFixed(1)}%"></span></div></div></td>`;
                  return `<td class="${col.der ? 'der' : ''}">${esc(celda)}</td>`;
                })
                .join('')}</tr>`)
              .join('') : `<tr><td colspan="${r.columnas.length}" class="texto-3">Sin datos para los filtros elegidos.</td></tr>`}</tbody></table>
          </div>
        </div>
        ${r.nota ? `<p class="pequeno texto-3">${esc(r.nota)}</p>` : ''}
      </article>
    </div>
  </div>`;

  raizActual.querySelectorAll('[data-inf]').forEach((b) =>
    b.addEventListener('click', () => {
      actualId = b.dataset.inf;
      history.replaceState(null, '', '#/informes/' + actualId);
      pintar();
    })
  );
  activarFiltros(inf, f);
  dibujarTorta(raizActual.querySelector('#torta'), r.torta, !desdeVivo);
  raizActual.querySelector('#pdf').addEventListener('click', (e) => exportar(e.currentTarget, inf, f, r));
}

function filtrosHtml(inf, f) {
  if (inf.filtro === 'ninguno') return `<p class="pequeno texto-3">Este informe usa todos los datos registrados; no admite filtros.</p>`;
  const funcSel =
    inf.filtro === 'funcion'
      ? `<div class="campo" style="min-width:260px;flex:1"><label for="f-func">Función a graficar</label><select class="entrada" id="f-func"><option value="">Todas las del rango</option>${db.funciones
          .slice()
          .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
          .filter((x) => (!f.desde || x.fecha >= f.desde) && (!f.hasta || x.fecha <= f.hasta))
          .map((x) => `<option value="${x.id}" ${x.id === f.funcionId ? 'selected' : ''}>${fechaCorta(x.fecha)} ${x.hora} · ${esc(idx.obras.get(x.obraId).nombre)}</option>`)
          .join('')}</select></div>`
      : '';
  return `<div class="filtros-informe">
    <div class="campo"><span class="etiqueta-campo pequeno texto-3">${esc(inf.etiquetaFiltro)}</span>
      <div class="segmentado">${presets().map(([id, t]) => `<button type="button" aria-pressed="${f.preset === id}" data-preset="${id}">${t}</button>`).join('')}</div></div>
    <div class="campo"><label for="f-desde">Desde</label><input class="entrada" type="date" id="f-desde" value="${f.desde}"></div>
    <div class="campo"><label for="f-hasta">Hasta</label><input class="entrada" type="date" id="f-hasta" value="${f.hasta}"></div>
    ${funcSel}
  </div>`;
}

function activarFiltros(inf, f) {
  const r = raizActual;
  r.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = presets().find((x) => x[0] === b.dataset.preset);
      Object.assign(f, { preset: p[0], desde: p[2], hasta: p[3], funcionId: '' });
      pintar();
    })
  );
  r.querySelector('#f-desde')?.addEventListener('change', (e) => {
    Object.assign(f, { desde: e.target.value, preset: '' });
    pintar();
  });
  r.querySelector('#f-hasta')?.addEventListener('change', (e) => {
    Object.assign(f, { hasta: e.target.value, preset: '' });
    pintar();
  });
  r.querySelector('#f-func')?.addEventListener('change', (e) => {
    f.funcionId = e.target.value;
    pintar();
  });
}

function colorTexto() {
  return getComputedStyle(document.documentElement).getPropertyValue('--texto').trim() || '#f4ecdd';
}

function configTorta(t, { animar, texto, fondoBorde, fuente = 13 }) {
  return {
    type: 'pie',
    data: {
      labels: t.etiquetas,
      datasets: [{ data: t.valores, backgroundColor: PALETA.slice(0, t.valores.length), borderColor: fondoBorde, borderWidth: 2, hoverOffset: 8 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      animation: animar && !matchMedia('(prefers-reduced-motion: reduce)').matches ? { duration: 700 } : false,
      plugins: {
        legend: { position: 'bottom', labels: { color: texto, font: { family: 'Manrope', size: fuente, weight: '600' }, padding: fuente + 1, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const tot = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const v = ctx.parsed;
              const fmt = v > 5000 ? pesos(v) : numero(v);
              return ` ${ctx.label}: ${fmt} (${porcentaje(tot ? v / tot : 0, 1)})`;
            },
          },
        },
      },
    },
    plugins: [
      {
        id: 'porcentajes',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const ds = chart.data.datasets[0];
          const tot = ds.data.reduce((a, b) => a + b, 0);
          chart.getDatasetMeta(0).data.forEach((arc, i) => {
            const v = ds.data[i];
            if (!tot || v / tot < 0.05) return;
            const p = arc.tooltipPosition();
            ctx.save();
            ctx.fillStyle = i === 1 ? '#1d1124' : '#ffffff';
            ctx.font = `700 ${fuente}px Manrope, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${Math.round((v / tot) * 100)} %`, p.x, p.y);
            ctx.restore();
          });
        },
      },
    ],
  };
}

function dibujarTorta(canvas, t, animar) {
  grafico?.destroy();
  if (!window.Chart) return;
  const fondo = getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim();
  grafico = new window.Chart(canvas, configTorta(t, { animar, texto: colorTexto(), fondoBorde: fondo }));
}

async function exportar(btn, inf, f, r) {
  setCargando(btn, true, 'Generando PDF…');
  // Se dibuja una copia del gráfico con texto oscuro sobre blanco para el papel
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 600;
  c.style.cssText = 'position:fixed;left:-2000px;top:0;width:900px;height:600px';
  document.body.appendChild(c);
  const cfg = configTorta(r.torta, { animar: false, texto: '#22132b', fondoBorde: '#ffffff', fuente: 22 });
  const tmp = new window.Chart(c, { ...cfg, options: { ...cfg.options, responsive: false, devicePixelRatio: 2 } });
  const imagen = tmp.toBase64Image('image/png');
  tmp.destroy();
  c.remove();
  const textoFiltro =
    inf.filtro === 'ninguno'
      ? 'Sin filtros (todos los datos)'
      : `${inf.etiquetaFiltro}: ${f.desde ? fechaCorta(f.desde) : 'inicio'} a ${f.hasta ? fechaCorta(f.hasta) : 'hoy'}${f.funcionId ? ` · Función ${fechaMedia(idx.funciones.get(f.funcionId).fecha)}` : ''}`;
  const doc = await pdfInforme({
    titulo: inf.titulo,
    finalidad: inf.finalidad,
    destinatario: `${inf.destinatario} (nivel ${inf.nivel.toLowerCase()})`,
    filtros: textoFiltro,
    kpis: r.kpis,
    imagen,
    columnas: r.columnas,
    filas: r.filas,
    conclusion: r.conclusion.replace(/<[^>]+>/g, ''),
  });
  descargar(doc, `informe-${inf.id}-${hoyIso()}.pdf`);
  setCargando(btn, false);
  aviso('Informe exportado', `${inf.titulo} (PDF)`, 'exito');
}
