// Buscador de funciones: destacadas, búsqueda, filtros, géneros y grilla de funciones.
import { db, idx } from '../estado.js';
import { precioDesde, disponibilidad, hoyIso } from '../reglas.js';
import { icono, esc, pesos, marcoImagen, fechaMedia, numero, ICONO_GENERO, COLOR_GENERO } from '../ui.js';
import { proximasFunciones } from './inicio.js';

let filtros = null;
let raizActual = null;
let temporizador = null;

function filtrosIniciales(query) {
  return {
    texto: query.get('q') || '',
    genero: query.get('genero') || '',
    desde: '',
    hasta: '',
    sala: '',
    precioMax: 0,
    conLugares: false,
  };
}

export function render(raiz, { query }) {
  raizActual = raiz;
  filtros = filtrosIniciales(query);
  const prox = proximasFunciones();
  const destacadas = [];
  const vistas = new Set();
  for (const f of prox) if (!vistas.has(f.obraId) && destacadas.length < 6) (vistas.add(f.obraId), destacadas.push(f));
  const maxPrecio = Math.max(...prox.map((f) => precioDesde(f.id)), 10000);
  filtros.precioMax = Math.ceil(maxPrecio / 5000) * 5000;
  const salas = (db.salas || []).filter((s) => s.estado === 'habilitada');

  raiz.innerHTML = `
  <div class="contenedor">
    <section class="carrusel" aria-roledescription="carrusel" aria-label="Funciones destacadas">
      <button class="boton-icono carrusel__flecha carrusel__flecha--izq" type="button" aria-label="Anterior">${icono('chevron-left')}</button>
      <div class="carrusel__pista" id="pista">
        ${destacadas
          .map((f) => {
            const o = idx.obras.get(f.obraId);
            return `<a class="diapo" href="#/funcion/${f.id}" aria-label="${esc(o.nombre)}, ${esc(fechaMedia(f.fecha))}">
              ${marcoImagen(f.imagen || o.imagen, o.nombre)}
              <div class="diapo__info"><div><h3>${esc(o.nombre)}</h3><p>${esc(fechaMedia(f.fecha))} · ${f.hora} h · ${esc(idx.salas.get(f.salaId).nombre)}</p></div>
              <span class="boton boton--oro boton--chico">Entradas</span></div></a>`;
          })
          .join('')}
      </div>
      <button class="boton-icono carrusel__flecha carrusel__flecha--der" type="button" aria-label="Siguiente">${icono('chevron-right')}</button>
      <button class="boton carrusel__pausa" type="button" id="pausa" aria-pressed="false">Pausar</button>
    </section>

    <section class="buscador" aria-labelledby="t-buscar">
      <h1 id="t-buscar">Buscar funciones</h1>
      <form class="buscador__barra" id="form-buscar" role="search">
        ${icono('search')}
        <label class="oculto-visual" for="q">Buscar por obra, director o elenco</label>
        <input id="q" type="search" placeholder="Obra, director, elenco…" value="${esc(filtros.texto)}" autocomplete="off">
        <button class="boton boton--oro" type="submit">Buscar</button>
      </form>
      <div class="filtros">
        <div class="campo"><label for="f-genero">Género</label>
          <select class="entrada" id="f-genero"><option value="">Todos</option>${(db.generos || []).map((g) => `<option value="${g.id}" ${g.id === filtros.genero ? 'selected' : ''}>${esc(g.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label for="f-desde">Desde</label><input class="entrada" type="date" id="f-desde" min="${hoyIso()}"></div>
        <div class="campo"><label for="f-hasta">Hasta</label><input class="entrada" type="date" id="f-hasta" min="${hoyIso()}"></div>
        <div class="campo"><label for="f-sala">Sala</label>
          <select class="entrada" id="f-sala"><option value="">Todas</option>${salas.map((s) => `<option value="${s.id}">${esc(s.nombre)}</option>`).join('')}</select></div>
        <div class="campo rango"><label for="f-precio">Precio hasta: <b id="precio-txt" class="num">${pesos(filtros.precioMax)}</b></label>
          <input type="range" id="f-precio" min="10000" max="${filtros.precioMax}" step="1000" value="${filtros.precioMax}"></div>
      </div>
      <div class="filtros__pie">
        <label class="check"><input type="checkbox" id="f-lugares"> Solo funciones con lugares disponibles</label>
        <button class="boton boton--fantasma boton--chico" type="button" id="limpiar">${icono('rotate-ccw')} Limpiar filtros</button>
      </div>
    </section>

    <section aria-label="Géneros">
      <div class="generos" id="generos">
        ${(db.generos || [])
          .map((g) => {
            const n = prox.filter((f) => idx.obras.get(f.obraId).generoId === g.id).length;
            return `<button class="genero" type="button" data-genero="${g.id}" aria-pressed="${g.id === filtros.genero}" style="--g-color:${COLOR_GENERO[g.id] || '#7a3d9e'}">
              ${icono(ICONO_GENERO[g.id] || 'theater')}<span><strong>${esc(g.nombre)}</strong><small>${n} ${n === 1 ? 'función' : 'funciones'}</small></span></button>`;
          })
          .join('')}
      </div>
    </section>

    <section class="seccion" aria-labelledby="t-todas" style="padding-top:var(--e-7)">
      <div class="seccion__cab" style="margin-bottom:var(--e-5)">
        <h2 class="titulo-seccion" id="t-todas">Todas las funciones</h2>
        <p class="texto-2" id="contador" role="status"></p>
      </div>
      <div id="resultados"></div>
    </section>
  </div>`;

  // Carrusel
  const pista = raiz.querySelector('#pista');
  const mover = (dir) => pista.scrollBy({ left: dir * pista.clientWidth * 0.5, behavior: 'smooth' });
  raiz.querySelector('.carrusel__flecha--izq').addEventListener('click', () => mover(-1));
  raiz.querySelector('.carrusel__flecha--der').addEventListener('click', () => mover(1));
  let pausado = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const btnPausa = raiz.querySelector('#pausa');
  const pintarPausa = () => {
    btnPausa.textContent = pausado ? 'Reproducir' : 'Pausar';
    btnPausa.setAttribute('aria-pressed', String(pausado));
  };
  pintarPausa();
  btnPausa.addEventListener('click', () => {
    pausado = !pausado;
    pintarPausa();
  });
  clearInterval(temporizador);
  temporizador = setInterval(() => {
    if (pausado || document.hidden || !pista.isConnected) return;
    const fin = pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 8;
    if (fin) pista.scrollTo({ left: 0, behavior: 'smooth' });
    else mover(1);
  }, 5500);
  pista.addEventListener('pointerenter', () => (pausado = true));
  pista.addEventListener('pointerleave', () => {
    pausado = btnPausa.getAttribute('aria-pressed') === 'true';
  });

  // Filtros
  const $ = (s) => raiz.querySelector(s);
  $('#form-buscar').addEventListener('submit', (e) => {
    e.preventDefault();
    filtros.texto = $('#q').value;
    pintarResultados();
    $('#t-todas').scrollIntoView({ behavior: 'smooth' });
  });
  $('#q').addEventListener('input', () => {
    filtros.texto = $('#q').value;
    pintarResultados();
  });
  $('#f-genero').addEventListener('change', (e) => {
    filtros.genero = e.target.value;
    pintarResultados();
  });
  $('#f-desde').addEventListener('change', (e) => {
    filtros.desde = e.target.value;
    pintarResultados();
  });
  $('#f-hasta').addEventListener('change', (e) => {
    filtros.hasta = e.target.value;
    pintarResultados();
  });
  $('#f-sala').addEventListener('change', (e) => {
    filtros.sala = e.target.value;
    pintarResultados();
  });
  $('#f-precio').addEventListener('input', (e) => {
    filtros.precioMax = Number(e.target.value);
    $('#precio-txt').textContent = pesos(filtros.precioMax);
    pintarResultados();
  });
  $('#f-lugares').addEventListener('change', (e) => {
    filtros.conLugares = e.target.checked;
    pintarResultados();
  });
  $('#generos').addEventListener('click', (e) => {
    const b = e.target.closest('[data-genero]');
    if (!b) return;
    filtros.genero = filtros.genero === b.dataset.genero ? '' : b.dataset.genero;
    $('#f-genero').value = filtros.genero;
    pintarResultados();
  });
  $('#limpiar').addEventListener('click', () => render(raiz, { query: new URLSearchParams() }));

  pintarResultados();
}

function pintarResultados() {
  const raiz = raizActual;
  const t = filtros.texto.trim().toLowerCase();
  const lista = proximasFunciones().filter((f) => {
    const o = idx.obras.get(f.obraId);
    if (t && !`${o.nombre} ${o.director} ${o.actores} ${idx.generos.get(o.generoId).nombre}`.toLowerCase().includes(t)) return false;
    if (filtros.genero && o.generoId !== filtros.genero) return false;
    if (filtros.desde && f.fecha < filtros.desde) return false;
    if (filtros.hasta && f.fecha > filtros.hasta) return false;
    if (filtros.sala && f.salaId !== filtros.sala) return false;
    if (precioDesde(f.id) > filtros.precioMax) return false;
    if (filtros.conLugares && disponibilidad(f.id).libres === 0) return false;
    return true;
  });
  raiz.querySelectorAll('[data-genero]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.genero === filtros.genero)));
  raiz.querySelector('#contador').textContent = `${lista.length} ${lista.length === 1 ? 'función encontrada' : 'funciones encontradas'}`;
  const cont = raiz.querySelector('#resultados');
  if (!lista.length) {
    cont.innerHTML = `<div class="vacio">${icono('search')}<h3>No hay funciones con esos filtros</h3>
      <p>Probá con otra fecha, otro género o un precio mayor.</p>
      <button class="boton boton--contorno" type="button" id="limpiar2">Ver todas las funciones</button></div>`;
    cont.querySelector('#limpiar2').addEventListener('click', () => render(raiz, { query: new URLSearchParams() }));
    return;
  }
  cont.innerHTML = `<div class="grilla-funciones">${lista
    .map((f) => {
      const o = idx.obras.get(f.obraId);
      const d = disponibilidad(f.id);
      const pocas = d.libres < 120;
      return `<a class="funcion-tarjeta" href="#/funcion/${f.id}">
        ${marcoImagen(f.imagen || o.imagen, o.nombre, '', `<span class="etiqueta etiqueta--oro sello">${esc(idx.generos.get(o.generoId).nombre)}</span>`)}
        <div class="funcion-tarjeta__cuerpo">
          <h3>${esc(o.nombre)}</h3>
          <div class="funcion-tarjeta__meta">
            <span>${icono('calendar')} ${esc(fechaMedia(f.fecha))}</span>
            <span>${icono('clock')} ${f.hora} h</span>
            <span>${icono('map-pin')} ${esc(idx.salas.get(f.salaId).nombre)}</span>
          </div>
          <div class="funcion-tarjeta__pie">
            <span>Desde <b class="num">${pesos(precioDesde(f.id))}</b></span>
            <span class="etiqueta etiqueta--${pocas ? 'alerta' : 'exito'}">${pocas ? `Quedan ${numero(d.libres)}` : `${numero(d.libres)} libres`}</span>
          </div>
        </div></a>`;
    })
    .join('')}</div>`;
}

export function alActualizar() {
  if (raizActual?.isConnected) pintarResultados();
}

export function salir() {
  clearInterval(temporizador);
}
