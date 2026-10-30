// Teatro CaPaz S.A. — aplicación principal (enrutador, cabecera, pie y tema)
import { cargar, escucharServidor, alCambiar, usuarioActual, cerrarSesion, puede, ROLES, db, guardar, idx } from './estado.js';
import { icono, esc, iniciales, aviso, confirmar } from './ui.js';
import { reservaVencida } from './reglas.js';

import * as inicio from './vistas/inicio.js';
import * as cartelera from './vistas/cartelera.js';
import * as funcion from './vistas/funcion.js';
import * as acceso from './vistas/acceso.js';
import * as compra from './vistas/compra.js';
import * as cuenta from './vistas/cuenta.js';
import * as boleteria from './vistas/boleteria.js';
import * as informes from './vistas/informes.js';

const vista = document.getElementById('vista');

// Rutas: patrón -> { módulo, permiso requerido }
const RUTAS = [
  { patron: /^\/?$/, modulo: inicio, nav: 'inicio' },
  { patron: /^\/cartelera$/, modulo: cartelera, nav: 'cartelera' },
  { patron: /^\/funcion\/(\w+)$/, modulo: funcion, nav: 'cartelera' },
  { patron: /^\/ingresar$/, modulo: acceso, args: ['ingresar'] },
  { patron: /^\/registro$/, modulo: acceso, args: ['registro'] },
  { patron: /^\/compra$/, modulo: compra, args: ['resumen'], permiso: 'cuenta' },
  { patron: /^\/pago\/(venta|cuota)\/(\w+)$/, modulo: compra, args: ['pago'], permiso: 'cuenta' },
  { patron: /^\/compra-ok\/(\w+)$/, modulo: compra, args: ['ok'], permiso: 'cuenta' },
  { patron: /^\/mi-cuenta(?:\/(\w+))?$/, modulo: cuenta, nav: 'cuenta', permiso: 'cuenta' },
  { patron: /^\/boleteria(?:\/(\w+))?$/, modulo: boleteria, nav: 'boleteria', permiso: 'boleteria' },
  { patron: /^\/informes(?:\/(\w+))?$/, modulo: informes, nav: 'informes', permiso: 'informes' },
];

let actual = null;

export function ir(ruta) {
  if (location.hash === '#' + ruta) enrutar();
  else location.hash = ruta;
}

function parsear() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [ruta, qs] = h.split('?');
  return { ruta, query: new URLSearchParams(qs || '') };
}

async function enrutar() {
  const { ruta, query } = parsear();
  const def = RUTAS.find((r) => r.patron.test(ruta)) || RUTAS[0];
  const params = (ruta.match(def.patron) || []).slice(1);
  const usuario = usuarioActual();

  if (def.permiso) {
    if (!usuario) {
      sessionStorage.setItem('capaz-volver', ruta + (query.toString() ? '?' + query : ''));
      aviso('Ingresá para continuar', 'Esta sección requiere iniciar sesión.', 'info');
      return ir('/ingresar');
    }
    const permitido = def.permiso === 'cuenta' ? usuario.rol === 'cliente' || usuario.rol === 'admin' : puede(usuario, def.permiso);
    if (!permitido) {
      aviso('Sin permiso para esa sección', `Tu rol es ${ROLES[usuario.rol].nombre}.`, 'alerta');
      return ir(destinoPorRol(usuario));
    }
  }

  actual?.modulo.salir?.();
  actual = { ...def, params, query };
  pintarCabecera(def.nav);
  document.getElementById('nav').classList.remove('abierta');
  document.getElementById('btn-menu').setAttribute('aria-expanded', 'false');
  vista.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'instant' });
  await def.modulo.render(vista, { params, query, args: def.args || [], usuario });
  vista.focus({ preventScroll: true });
}

export function destinoPorRol(u) {
  if (!u) return '/';
  if (u.rol === 'boletero' || u.rol === 'admin') return '/boleteria';
  if (u.rol === 'encargado') return '/informes';
  return '/mi-cuenta';
}

// ---------------------------------------------------------------------------
// Cabecera
// ---------------------------------------------------------------------------

function pintarCabecera(activo) {
  const u = usuarioActual();
  const enlaces = [
    { id: 'inicio', href: '#/', texto: 'Inicio' },
    { id: 'cartelera', href: '#/cartelera', texto: 'Cartelera' },
  ];
  if (u && (u.rol === 'cliente' || u.rol === 'admin')) enlaces.push({ id: 'cuenta', href: '#/mi-cuenta', texto: 'Mi cuenta' });
  if (puede(u, 'boleteria')) enlaces.push({ id: 'boleteria', href: '#/boleteria', texto: 'Boletería' });
  if (puede(u, 'informes')) enlaces.push({ id: 'informes', href: '#/informes', texto: 'Informes' });
  document.getElementById('nav').innerHTML = enlaces
    .map((e) => `<a href="${e.href}" ${e.id === activo ? 'aria-current="page"' : ''}>${e.texto}</a>`)
    .join('');

  const zona = document.getElementById('zona-usuario');
  if (!u) {
    zona.innerHTML = `<a class="boton boton--oro boton--chico" href="#/ingresar">${icono('log-in')} Ingresar</a>`;
    return;
  }
  zona.innerHTML = `<div class="menu-usuario">
    <button class="chip-usuario" type="button" aria-haspopup="true" aria-expanded="false" id="btn-usuario">
      <span class="avatar">${esc(iniciales(u.nombre, u.apellido))}</span>
      <span class="chip-usuario__nombre">${esc(u.nombre)}</span>
    </button>
    <div class="menu-desplegable" id="menu-usuario" hidden>
      <div class="menu-desplegable__cab"><strong>${esc(u.nombre)} ${esc(u.apellido)}</strong><br><span class="texto-3 pequeno">${esc(u.email)} · ${ROLES[u.rol].nombre}</span></div>
      ${u.rol === 'cliente' || u.rol === 'admin' ? `<a href="#/mi-cuenta">${icono('ticket')} Mis entradas</a><a href="#/mi-cuenta/socio">${icono('id-card')} Socio y cuotas</a>` : ''}
      ${puede(u, 'boleteria') ? `<a href="#/boleteria">${icono('store')} Boletería</a>` : ''}
      ${puede(u, 'informes') ? `<a href="#/informes">${icono('chart-pie')} Informes</a>` : ''}
      ${puede(u, 'admin') ? `<button type="button" data-accion="restablecer">${icono('database')} Restablecer datos de ejemplo</button>` : ''}
      <button type="button" data-accion="salir">${icono('log-out')} Cerrar sesión</button>
    </div></div>`;
  const btn = zona.querySelector('#btn-usuario');
  const menu = zona.querySelector('#menu-usuario');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.querySelector('[data-accion="salir"]').addEventListener('click', () => {
    cerrarSesion();
    aviso('Sesión cerrada', 'Hasta la próxima función.', 'exito');
    ir('/');
  });
  menu.querySelector('[data-accion="restablecer"]')?.addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Restablecer datos de ejemplo',
      texto: '<p>Se vuelven a generar todos los archivos de datos (ventas, socios, cuotas, usuarios). Los cambios hechos durante la prueba se pierden.</p>',
      aceptar: 'Restablecer',
      peligro: true,
    });
    if (!ok) return;
    await fetch('/api/restablecer', { method: 'POST' });
    await cargar();
    aviso('Datos restablecidos', 'Se regeneraron los archivos de la carpeta datos.', 'exito');
    enrutar();
  });
}

document.addEventListener('click', () => {
  const menu = document.getElementById('menu-usuario');
  if (menu && !menu.hidden) {
    menu.hidden = true;
    document.getElementById('btn-usuario')?.setAttribute('aria-expanded', 'false');
  }
});

function pintarPie() {
  document.getElementById('pie').innerHTML = `
    <div class="pie__in">
      <div class="pie__teatro">
        <a class="marca" href="#/"><span class="marca__placa"><img src="img/teatro_capaz_logo.png" alt="" width="217" height="199"></span>
        <span class="marca__texto">Teatro <b>CaPaz</b><small>S.A. · Villa Carlos Paz</small></span></a>
        <p>Cinco salas, platea y palcos. Teatro, música y producciones internacionales en el corazón de las sierras.</p>
      </div>
      <div>
        <h3>Cartelera</h3>
        <ul><li><a href="#/cartelera">Todas las funciones</a></li><li><a href="#/cartelera?genero=G7">Revista de temporada</a></li><li><a href="#/cartelera?genero=G4">Para chicos</a></li><li><a href="#/?ir=socios">Beneficios de socios</a></li></ul>
      </div>
      <div>
        <h3>Tu cuenta</h3>
        <ul><li><a href="#/ingresar">Ingresar</a></li><li><a href="#/registro">Crear cuenta</a></li><li><a href="#/mi-cuenta">Mis entradas</a></li><li><a href="#/mi-cuenta/socio">Cuotas de socio</a></li></ul>
      </div>
      <div class="pie__firma-col">
        <div class="firma">
          <img class="firma__logo" src="img/logo_grupo.png" alt="Logo de Punto y Hacha: un basto y una espada cruzados">
          <div class="firma__texto"><small>Desarrollado por</small><strong>Punto y Hacha</strong><em>“Tenemos el truco para elevar tu empresa”</em></div>
        </div>
      </div>
    </div>
    <div class="pie__base">
      <span>© ${new Date().getFullYear()} Teatro CaPaz S.A. — Prototipo del Sistema de Información</span>
      <span>TPI Sistemas y Procesos de Negocio · Ingeniería en Sistemas de Información · UTN FRVM</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// Tema claro / oscuro
// ---------------------------------------------------------------------------

function temaActual() {
  const t = document.documentElement.dataset.tema;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
}
function pintarBotonTema() {
  const b = document.getElementById('btn-tema');
  const t = temaActual();
  b.innerHTML = icono(t === 'oscuro' ? 'sun' : 'moon');
  b.setAttribute('aria-label', t === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}
document.getElementById('btn-tema').addEventListener('click', () => {
  const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
  document.documentElement.dataset.tema = nuevo;
  try {
    localStorage.setItem('capaz-tema', nuevo);
  } catch {}
  pintarBotonTema();
  actual?.modulo.alCambiarTema?.();
});

document.getElementById('btn-menu').innerHTML = icono('menu');
document.getElementById('btn-menu').addEventListener('click', (e) => {
  const nav = document.getElementById('nav');
  const abierta = nav.classList.toggle('abierta');
  e.currentTarget.setAttribute('aria-expanded', String(abierta));
  e.currentTarget.innerHTML = icono(abierta ? 'x' : 'menu');
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

async function vencerReservas() {
  const vencidas = (db.ventas || []).filter(reservaVencida);
  if (!vencidas.length) return;
  for (const v of vencidas) {
    v.estado = 'vencida';
    for (const e of idx.entradasPorVenta.get(v.id) || []) e.estado = 'anulada';
  }
  await guardar(['ventas', 'entradas'], 'reservas vencidas');
}

async function iniciar() {
  pintarBotonTema();
  pintarPie();
  try {
    await cargar();
  } catch (e) {
    vista.innerHTML = `<div class="contenedor" style="padding:80px 0"><div class="vacio">${icono('circle-alert')}<h3>No se pudo conectar con el servidor</h3><p>Iniciá el sistema con <code>node server.js</code> y abrí <b>http://localhost:3000</b>.</p></div></div>`;
    return;
  }
  await vencerReservas();
  escucharServidor();
  // Cuando cambian los archivos (por esta u otra pestaña) se refresca la vista actual
  alCambiar((ev) => {
    if (ev.propio) return;
    pintarCabecera(actual?.nav);
    if (actual?.modulo.alActualizar) actual.modulo.alActualizar(ev);
    else enrutar();
  });
  setInterval(vencerReservas, 60000);
  window.addEventListener('hashchange', enrutar);
  enrutar();
}

iniciar();
