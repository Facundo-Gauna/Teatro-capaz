// Utilidades de interfaz: formato, avisos, diálogos e imágenes
import { icono } from './iconos.js';
import { aFecha } from './reglas.js';

export { icono };

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const fmtNum = new Intl.NumberFormat('es-AR');
export const pesos = (n) => fmtPesos.format(Math.round(Number(n) || 0)).replace(/\s/g, ' ');
export const numero = (n) => fmtNum.format(n);
export const porcentaje = (p, dec = 0) => `${(p * 100).toFixed(dec).replace('.', ',')} %`;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaLarga(iso) {
  const d = aFecha(iso);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export function fechaMedia(iso) {
  const d = aFecha(iso);
  return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES_C[d.getMonth()]} ${d.getFullYear()}`;
}
export function fechaCorta(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
export function fechaPartes(iso) {
  const d = aFecha(iso);
  return { dia: d.getDate(), mes: MESES_C[d.getMonth()], semana: DIAS[d.getDay()].slice(0, 3), anio: d.getFullYear() };
}
export function periodoTexto(p) {
  const [a, m] = p.split('-').map(Number);
  return `${MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} ${a}`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function etiqueta([texto, tono]) {
  return `<span class="etiqueta etiqueta--${tono}">${esc(texto)}</span>`;
}

export function iniciales(nombre = '', apellido = '') {
  return ((nombre[0] || '') + (apellido[0] || '')).toUpperCase();
}

// ---------------------------------------------------------------------------
// Imagen de función con marco "no encontrada"
// ---------------------------------------------------------------------------

export function marcoImagen(src, titulo, clase = '', extra = '') {
  const id = 'img' + Math.random().toString(36).slice(2, 8);
  return `<div class="marco ${clase}" id="${id}">
    <img src="${esc(src)}" alt="${esc(titulo)}" loading="lazy" onerror="this.replaceWith(window.__marcoVacio(${esc(JSON.stringify(titulo))}))">${extra}
  </div>`;
}
window.__marcoVacio = (titulo) => {
  const d = document.createElement('div');
  d.className = 'marco-vacio';
  d.innerHTML = `${icono('image-off')}<strong>${esc(titulo)}</strong><small>Imagen no encontrada</small>`;
  return d;
};

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

const ICONO_AVISO = { exito: 'circle-check', error: 'circle-x', alerta: 'triangle-alert', info: 'info' };
export function aviso(titulo, texto = '', tipo = 'info', ms = 4500) {
  const zona = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = `aviso aviso--${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icono(ICONO_AVISO[tipo])}<div><strong>${esc(titulo)}</strong>${texto ? `<span>${esc(texto)}</span>` : ''}</div>`;
  zona.appendChild(el);
  setTimeout(() => {
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

export function nota(texto, tipo = 'info', titulo = '') {
  const ico = { info: 'info', exito: 'circle-check', alerta: 'triangle-alert', error: 'circle-alert' }[tipo];
  return `<div class="nota nota--${tipo}" role="${tipo === 'error' ? 'alert' : 'note'}">${icono(ico)}<div>${titulo ? `<strong>${esc(titulo)}</strong>` : ''}${texto}</div></div>`;
}

// ---------------------------------------------------------------------------
// Diálogos
// ---------------------------------------------------------------------------

export function abrirModal({ titulo, cuerpo, pie = '', ancho = false, alAbrir, alCerrar }) {
  const capa = document.getElementById('capa-modal');
  const anterior = document.activeElement;
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal ${ancho ? 'modal--ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
    <div class="modal__cab"><h2 id="modal-titulo">${titulo}</h2>
      <button class="boton-icono" type="button" data-cerrar aria-label="Cerrar">${icono('x')}</button></div>
    <div class="modal__cuerpo">${cuerpo}</div>
    ${pie ? `<div class="modal__pie">${pie}</div>` : ''}
  </div>`;
  capa.appendChild(fondo);
  document.body.style.overflow = 'hidden';
  const modal = fondo.querySelector('.modal');
  const cerrar = () => {
    fondo.remove();
    if (!capa.children.length) document.body.style.overflow = '';
    document.removeEventListener('keydown', teclas);
    anterior?.focus?.();
    alCerrar?.();
  };
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
    if (e.key === 'Tab') {
      const f = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  document.addEventListener('keydown', teclas);
  fondo.addEventListener('mousedown', (e) => {
    if (e.target === fondo) cerrar();
  });
  fondo.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
  alAbrir?.(modal, cerrar);
  const primero = modal.querySelector('[autofocus], input, select, .boton--oro, .boton');
  (primero || modal.querySelector('[data-cerrar]')).focus();
  return { modal, cerrar };
}

export function confirmar({ titulo, texto, aceptar = 'Confirmar', cancelar = 'Volver', peligro = false }) {
  return new Promise((resolver) => {
    let decidido = false;
    abrirModal({
      titulo,
      cuerpo: `<div>${texto}</div>`,
      pie: `<button class="boton boton--fantasma" data-cerrar type="button">${cancelar}</button>
            <button class="boton ${peligro ? 'boton--peligro' : 'boton--oro'}" data-ok type="button">${aceptar}</button>`,
      alAbrir(modal, cerrar) {
        modal.querySelector('[data-ok]').addEventListener('click', () => {
          decidido = true;
          cerrar();
          resolver(true);
        });
      },
      alCerrar() {
        if (!decidido) resolver(false);
      },
    });
  });
}

export function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function setCargando(boton, cargando, texto) {
  if (!boton) return;
  if (cargando) {
    boton.dataset.texto = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = `<span class="spinner"></span> ${texto || 'Procesando…'}`;
  } else {
    boton.disabled = false;
    if (boton.dataset.texto) boton.innerHTML = boton.dataset.texto;
  }
}

export function errorCampo(input, mensaje) {
  const campo = input.closest('.campo');
  campo?.querySelector('.error-campo')?.remove();
  input.removeAttribute('aria-invalid');
  if (!mensaje) return;
  input.setAttribute('aria-invalid', 'true');
  const id = input.id + '-error';
  input.setAttribute('aria-describedby', id);
  campo?.insertAdjacentHTML('beforeend', `<span class="error-campo" id="${id}">${icono('circle-alert')}${esc(mensaje)}</span>`);
}

export const ICONO_GENERO = { G1: 'laugh', G2: 'drama', G3: 'music', G4: 'baby', G5: 'mic', G6: 'music', G7: 'sparkles' };
export const COLOR_GENERO = { G1: '#c8962e', G2: '#7a3d9e', G3: '#b0476e', G4: '#3f9a83', G5: '#c46a4a', G6: '#5f7fbf', G7: '#d9ad55' };
