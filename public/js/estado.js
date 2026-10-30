// Estado del sistema en memoria. Al iniciar se leen todos los archivos de datos
// desde el servidor; cada cambio se guarda de inmediato en los archivos y se avisa
// a las demás pestañas abiertas (tiempo real).

export const db = {};
export const meta = { email: 'simulado', cargado: false };
const ORIGEN = Math.random().toString(36).slice(2);
const oyentes = new Set();

export async function cargar() {
  const res = await fetch('/api/datos', { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudieron leer los archivos de datos');
  const { datos, email } = await res.json();
  for (const k of Object.keys(db)) delete db[k];
  Object.assign(db, datos);
  meta.email = email;
  meta.cargado = true;
  indexar();
}

// Índices por id para búsquedas rápidas
export const idx = {};
function indexar() {
  for (const t of ['obras', 'salas', 'funciones', 'generos', 'sectores', 'usuarios', 'socios', 'ventas', 'tiposUbicacion', 'promociones']) {
    idx[t] = new Map((db[t] || []).map((r) => [r.id, r]));
  }
  idx.precios = new Map((db.preciosFuncion || []).map((p) => [p.funcionId + '|' + p.sectorId, p.precio]));
  idx.config = new Map((db.configuracion || []).map((c) => [c.clave, c.valor]));
  idx.entradasPorFuncion = new Map();
  for (const e of db.entradas || []) {
    if (!idx.entradasPorFuncion.has(e.funcionId)) idx.entradasPorFuncion.set(e.funcionId, []);
    idx.entradasPorFuncion.get(e.funcionId).push(e);
  }
  idx.entradasPorVenta = new Map();
  for (const e of db.entradas || []) {
    if (!idx.entradasPorVenta.has(e.ventaId)) idx.entradasPorVenta.set(e.ventaId, []);
    idx.entradasPorVenta.get(e.ventaId).push(e);
  }
  idx.cuotasPorSocio = new Map();
  for (const c of db.cuotas || []) {
    if (!idx.cuotasPorSocio.has(c.socioId)) idx.cuotasPorSocio.set(c.socioId, []);
    idx.cuotasPorSocio.get(c.socioId).push(c);
  }
}

export function config(clave, porDefecto = 0) {
  const v = idx.config?.get(clave);
  if (v === undefined) return porDefecto;
  return isNaN(Number(v)) ? v : Number(v);
}

// Guarda las tablas indicadas en sus archivos .txt
export async function guardar(tablas, motivo = '') {
  indexar();
  const cuerpo = { origen: ORIGEN, motivo, tablas: {} };
  for (const t of tablas) cuerpo.tablas[t] = db[t];
  const res = await fetch('/api/guardar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error('No se pudo guardar en los archivos');
  notificar({ tablas, motivo, propio: true });
  return true;
}

export function nuevoId(tabla, prefijo, largo = 5) {
  let max = 0;
  for (const r of db[tabla] || []) {
    const n = parseInt(String(r.id).replace(/\D/g, ''), 10);
    if (n > max) max = n;
  }
  return prefijo + String(max + 1).padStart(largo, '0');
}

export function siguienteNumero(tabla, campo) {
  return (db[tabla] || []).reduce((m, r) => Math.max(m, Number(r[campo]) || 0), 0) + 1;
}

// Suscripción a cambios (propios o de otras pestañas)
export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
function notificar(evento) {
  for (const fn of oyentes) {
    try {
      fn(evento);
    } catch (e) {
      console.error(e);
    }
  }
}

export function escucharServidor() {
  if (!('EventSource' in window)) return;
  const es = new EventSource('/api/eventos');
  es.onmessage = async (m) => {
    let ev;
    try {
      ev = JSON.parse(m.data);
    } catch {
      return;
    }
    if (ev.tipo !== 'cambio' || ev.origen === ORIGEN) return;
    await cargar();
    notificar({ ...ev, propio: false });
  };
}

// ---------------------------------------------------------------------------
// Sesión (correo y contraseña validados contra el archivo de usuarios)
// ---------------------------------------------------------------------------

const CLAVE_SESION = 'capaz-sesion';

export function usuarioActual() {
  let id = null;
  try {
    id = localStorage.getItem(CLAVE_SESION);
  } catch {}
  return id ? idx.usuarios?.get(id) || null : null;
}

export function iniciarSesion(email, password) {
  const u = (db.usuarios || []).find((x) => x.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!u) return { ok: false, campo: 'email', mensaje: 'No encontramos una cuenta con ese correo.' };
  if (u.password !== password) return { ok: false, campo: 'password', mensaje: 'La contraseña no coincide con la registrada.' };
  try {
    localStorage.setItem(CLAVE_SESION, u.id);
  } catch {}
  return { ok: true, usuario: u };
}

export function cerrarSesion() {
  try {
    localStorage.removeItem(CLAVE_SESION);
  } catch {}
}

export const ROLES = {
  cliente: { nombre: 'Cliente', puede: ['cuenta'] },
  boletero: { nombre: 'Boletería', puede: ['boleteria'] },
  encargado: { nombre: 'Encargado — Informes', puede: ['informes'] },
  admin: { nombre: 'Administración', puede: ['boleteria', 'informes', 'admin'] },
};

export function puede(usuario, permiso) {
  return !!usuario && (ROLES[usuario.rol]?.puede || []).includes(permiso);
}
