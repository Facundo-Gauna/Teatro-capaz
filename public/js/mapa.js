// Mapa visual de la sala: escenario, platea baja (1–350) y palcos en planta alta (1–250).
// Muestra ubicaciones libres (con el color de su sector), ocupadas y seleccionadas.

import { idx, db } from './estado.js';
import { ubicaciones, ocupadas, precio, describirUbicacion } from './reglas.js';
import { icono, pesos, aviso } from './ui.js';

const SEP = 18;
const R = 6.6;
const PASILLO = 16;
const MX = 44;
const ANCHO = MX * 2 + 24 * SEP + 2 * PASILLO;
const Y_PLATEA = 132;
const Y_PALCOS = Y_PLATEA + 14 * SEP + 96;
const ALTO = Y_PALCOS + 10 * SEP + 40;

const xCol = (c) => MX + (c - 1) * SEP + (c > 6 ? PASILLO : 0) + (c > 19 ? PASILLO : 0);
const curva = (c) => 16 - Math.pow(c - 13, 2) * 0.11;

function posicion(u) {
  if (u.tipo === 'P') return { x: xCol(u.col), y: Y_PLATEA + (u.fila - 1) * SEP + curva(u.col) };
  return { x: xCol(u.col), y: Y_PALCOS + (u.fila - 1) * SEP + curva(u.col) * 0.7 };
}

export function crearMapa(contenedor, opciones) {
  const est = {
    funcionId: opciones.funcionId,
    seleccion: opciones.seleccion || new Set(),
    max: opciones.max || 8,
    sectorPermitido: opciones.sectorPermitido || null,
    foco: null,
    zoom: 1,
    alCambiar: opciones.alCambiar || (() => {}),
  };

  contenedor.innerHTML = `
    <div class="mapa">
      <div class="mapa__controles">
        <button class="boton-icono" type="button" data-z="+" aria-label="Acercar">${icono('plus')}</button>
        <button class="boton-icono" type="button" data-z="-" aria-label="Alejar">${icono('minus')}</button>
        <button class="boton-icono" type="button" data-z="0" aria-label="Ver la sala completa">${icono('rotate-ccw')}</button>
      </div>
      <div class="mapa__vista" tabindex="0" aria-label="Mapa de ubicaciones de la sala. Usá los botones de sector para elegir ubicaciones con el teclado."></div>
      <span class="mapa__ayuda">Tocá una ubicación libre para elegirla</span>
      <div class="mapa__leyenda" aria-hidden="false">
        <span><i class="punto punto--libre"></i> Disponible (color del sector)</span>
        <span><i class="punto punto--ocupado"></i> Ocupada</span>
        <span><i class="punto punto--sel"></i> Tu selección</span>
      </div>
    </div>`;
  const vista = contenedor.querySelector('.mapa__vista');
  const tooltip = document.getElementById('tooltip-butaca');

  function ajustarZoomInicial() {
    const ancho = vista.clientWidth - 8;
    const altoDisponible = window.innerHeight * 0.72 - 8;
    // En pantallas anchas se muestra la sala completa (platea y palcos); en celular manda el ancho
    const porAlto = window.innerWidth > 700 ? altoDisponible / ALTO : 9;
    est.zoom = Math.max(0.6, Math.min(1.7, ancho / ANCHO, porAlto));
    est.zoomBase = est.zoom;
  }

  function dibujar() {
    const occ = ocupadas(est.funcionId);
    const partes = [];
    partes.push(`<defs><linearGradient id="grad-escenario" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#efcd83"/><stop offset="1" stop-color="#c4923a"/></linearGradient></defs>`);
    // Escenario
    const ex1 = xCol(2);
    const ex2 = xCol(24);
    partes.push(`<path class="svg-escenario" d="M${ex1} 22 H${ex2} V58 Q${ANCHO / 2} 96 ${ex1} 58 Z"/>`);
    partes.push(`<text class="svg-texto-escenario" x="${ANCHO / 2}" y="50" text-anchor="middle">ESCENARIO</text>`);
    partes.push(`<text class="svg-titulo-zona" x="${ANCHO / 2}" y="${Y_PLATEA - 18}" text-anchor="middle">PLATEA BAJA · 1 A 350</text>`);
    // Planta alta
    partes.push(`<rect class="svg-zona" x="10" y="${Y_PALCOS - 46}" width="${ANCHO - 20}" height="${10 * SEP + 62}" rx="18"/>`);
    partes.push(`<text class="svg-titulo-zona" x="${ANCHO / 2}" y="${Y_PALCOS - 24}" text-anchor="middle">PLANTA ALTA · PALCOS 1 A 250</text>`);
    // Números de fila
    for (let f = 1; f <= 14; f++) {
      const y = Y_PLATEA + (f - 1) * SEP + curva(1) + 3;
      partes.push(`<text class="svg-etiqueta" x="${MX - 22}" y="${y}" text-anchor="middle">${f}</text><text class="svg-etiqueta" x="${ANCHO - MX + 22}" y="${y}" text-anchor="middle">${f}</text>`);
    }
    for (let f = 1; f <= 10; f++) {
      const y = Y_PALCOS + (f - 1) * SEP + curva(1) * 0.7 + 3;
      partes.push(`<text class="svg-etiqueta" x="${MX - 22}" y="${y}" text-anchor="middle">${f}</text><text class="svg-etiqueta" x="${ANCHO - MX + 22}" y="${y}" text-anchor="middle">${f}</text>`);
    }
    // Ubicaciones
    for (const u of ubicaciones()) {
      const { x, y } = posicion(u);
      const s = idx.sectores.get(u.sectorId);
      let clase = 'libre';
      let r = R;
      if (est.seleccion.has(u.codigo)) {
        clase = 'sel';
        r = R + 1.4;
      } else if (occ.has(u.codigo)) {
        clase = 'ocupada';
        r = R - 1.6;
      } else if (est.sectorPermitido && u.sectorId !== est.sectorPermitido) clase = 'bloqueada';
      if (est.foco === u.sectorId) clase += ' en-foco';
      partes.push(`<circle class="b ${clase}" data-u="${u.codigo}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" style="--color-sector:${s.color}"/>`);
      if (clase.startsWith('ocupada')) partes.push(`<circle class="b-marca" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6"/>`);
    }
    const ancho = Math.round(ANCHO * est.zoom);
    const alto = Math.round(ALTO * est.zoom);
    vista.innerHTML = `<svg class="mapa__lienzo ${est.foco ? 'mapa--atenuar' : ''}" viewBox="0 0 ${ANCHO} ${ALTO}" width="${ancho}" height="${alto}" role="img" aria-label="Sala con ${ubicaciones().length - occ.size} ubicaciones libres">${partes.join('')}</svg>`;
  }

  function alternar(codigo) {
    const occ = ocupadas(est.funcionId);
    const u = ubicaciones().find((x) => x.codigo === codigo);
    if (!u) return;
    if (est.seleccion.has(codigo)) est.seleccion.delete(codigo);
    else {
      if (occ.has(codigo)) return aviso('Ubicación ocupada', 'Elegí una ubicación disponible.', 'alerta', 2500);
      if (est.sectorPermitido && u.sectorId !== est.sectorPermitido)
        return aviso('Sector no disponible', `Solo podés elegir ubicaciones de ${idx.sectores.get(est.sectorPermitido).nombre}.`, 'alerta');
      if (est.seleccion.size >= est.max)
        return aviso('Llegaste al máximo', `Podés elegir hasta ${est.max} ubicaciones en esta operación.`, 'alerta');
      est.seleccion.add(codigo);
    }
    dibujar();
    est.alCambiar(est.seleccion);
  }

  // Clic y arrastre para desplazar
  let arrastre = null;
  vista.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    arrastre = { x: e.clientX, y: e.clientY, sl: vista.scrollLeft, st: vista.scrollTop, movio: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      arrastre.movio = true;
      vista.classList.add('arrastrando');
    }
    vista.scrollLeft = arrastre.sl - dx;
    vista.scrollTop = arrastre.st - dy;
  });
  window.addEventListener('pointerup', () => {
    setTimeout(() => {
      arrastre = null;
      vista.classList.remove('arrastrando');
    }, 0);
  });
  vista.addEventListener('click', (e) => {
    if (arrastre?.movio) return;
    const b = e.target.closest('.b');
    if (b) alternar(b.dataset.u);
  });
  vista.addEventListener('mousemove', (e) => {
    const b = e.target.closest('.b');
    if (!b) return (tooltip.hidden = true);
    const u = b.dataset.u;
    const ub = ubicaciones().find((x) => x.codigo === u);
    const occ = b.classList.contains('ocupada');
    tooltip.textContent = `${describirUbicacion(u)} · ${occ ? 'Ocupada' : pesos(precio(est.funcionId, ub.sectorId))}`;
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = e.clientY + 'px';
    tooltip.hidden = false;
  });
  vista.addEventListener('mouseleave', () => (tooltip.hidden = true));

  contenedor.querySelectorAll('[data-z]').forEach((b) =>
    b.addEventListener('click', () => {
      const z = b.dataset.z;
      const cx = (vista.scrollLeft + vista.clientWidth / 2) / est.zoom;
      const cy = (vista.scrollTop + vista.clientHeight / 2) / est.zoom;
      if (z === '+') est.zoom = Math.min(3.2, est.zoom * 1.35);
      else if (z === '-') est.zoom = Math.max(0.5, est.zoom / 1.35);
      else est.zoom = est.zoomBase;
      dibujar();
      vista.scrollLeft = cx * est.zoom - vista.clientWidth / 2;
      vista.scrollTop = cy * est.zoom - vista.clientHeight / 2;
    })
  );

  ajustarZoomInicial();
  dibujar();

  return {
    estado: est,
    redibujar() {
      // Si otra operación ocupó alguna ubicación elegida, se quita de la selección
      const occ = ocupadas(est.funcionId);
      const perdidas = [...est.seleccion].filter((c) => occ.has(c));
      perdidas.forEach((c) => est.seleccion.delete(c));
      dibujar();
      if (perdidas.length) {
        aviso('Se ocuparon ubicaciones que habías elegido', perdidas.map(describirUbicacion).join(', '), 'alerta', 7000);
        est.alCambiar(est.seleccion);
      }
    },
    enfocar(sectorId) {
      est.foco = est.foco === sectorId ? null : sectorId;
      dibujar();
      if (est.foco) {
        const primera = vista.querySelector(`.b.en-foco`);
        if (primera) {
          const r = primera.getBoundingClientRect();
          const rv = vista.getBoundingClientRect();
          vista.scrollTop += r.top - rv.top - 80;
        }
      }
      return est.foco;
    },
    seleccionar(codigos) {
      est.seleccion.clear();
      codigos.forEach((c) => est.seleccion.add(c));
      dibujar();
      est.alCambiar(est.seleccion);
    },
    quitar(codigo) {
      est.seleccion.delete(codigo);
      dibujar();
      est.alCambiar(est.seleccion);
    },
    setMax(n) {
      est.max = n;
    },
  };
}

export function sectoresConPrecio(funcionId) {
  return (db.sectores || []).map((s) => ({ ...s, precio: precio(funcionId, s.id) }));
}
