// Teatro CaPaz S.A. — servidor mínimo del prototipo
// Sirve el sitio y guarda los datos en archivos de texto (sin base de datos).
// Solo usa módulos nativos de Node. El envío real de email es opcional (nodemailer + .env).

const http = require('http');
const fs = require('fs');
const path = require('path');
const ESQUEMAS = require('./esquemas');

const RAIZ = __dirname;
const PUBLICO = path.join(RAIZ, 'public');
const DATOS = path.join(RAIZ, 'datos');
cargarEnv();
const PUERTO = Number(process.env.PORT) || 3000;

// ---------------------------------------------------------------------------
// Archivos de datos: un registro por línea, campos separados por "|"
// ---------------------------------------------------------------------------

function campos(tabla) {
  return ESQUEMAS[tabla].map((c) => {
    const [nombre, tipo] = c.split(':');
    return { nombre, tipo: tipo || 's' };
  });
}

function leerTabla(tabla) {
  const archivo = path.join(DATOS, tabla + '.txt');
  if (!fs.existsSync(archivo)) return [];
  const defs = campos(tabla);
  return fs
    .readFileSync(archivo, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((linea) => {
      const valores = linea.split('|');
      const reg = {};
      defs.forEach((d, i) => {
        const v = (valores[i] ?? '').trim();
        if (d.tipo === 'n') reg[d.nombre] = v === '' ? 0 : Number(v);
        else if (d.tipo === 'b') reg[d.nombre] = v === '1';
        else reg[d.nombre] = v;
      });
      return reg;
    });
}

function limpiar(v) {
  return String(v ?? '').replace(/[|\r\n]+/g, ' ').trim();
}

function escribirTabla(tabla, registros) {
  const defs = campos(tabla);
  const encabezado =
    `# Teatro CaPaz S.A. — archivo de ${tabla}\n` +
    `# Campos: ${defs.map((d) => d.nombre).join(' | ')}\n`;
  const lineas = registros.map((r) =>
    defs
      .map((d) => {
        const v = r[d.nombre];
        if (d.tipo === 'b') return v ? '1' : '0';
        if (d.tipo === 'n') return Number.isFinite(Number(v)) ? String(Number(v)) : '0';
        return limpiar(v);
      })
      .join('|')
  );
  const archivo = path.join(DATOS, tabla + '.txt');
  const temporal = archivo + '.tmp';
  fs.writeFileSync(temporal, encabezado + lineas.join('\n') + '\n', 'utf8');
  fs.renameSync(temporal, archivo);
}

function leerTodo() {
  const salida = {};
  for (const tabla of Object.keys(ESQUEMAS)) salida[tabla] = leerTabla(tabla);
  return salida;
}

// ---------------------------------------------------------------------------
// Avisos en tiempo real (Server-Sent Events) para que todas las pestañas
// se actualicen cuando cambia un archivo
// ---------------------------------------------------------------------------

const clientes = new Set();
function avisar(evento) {
  const msg = `data: ${JSON.stringify(evento)}\n\n`;
  for (const res of clientes) res.write(msg);
}

// ---------------------------------------------------------------------------
// Email (opcional)
// ---------------------------------------------------------------------------

let transporte = null;
function emailReal() {
  if (transporte !== null) return transporte;
  transporte = false;
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return transporte;
  try {
    const nodemailer = require('nodemailer');
    transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  } catch {
    console.log('  (nodemailer no está instalado: el envío de email queda simulado)');
  }
  return transporte;
}

async function enviarEmail({ para, asunto, html, adjuntos = [] }) {
  const t = emailReal();
  if (!t) return { enviado: true, simulado: true };
  await t.sendMail({
    from: `"Teatro CaPaz" <${process.env.GMAIL_USER}>`,
    to: para,
    subject: asunto,
    html,
    attachments: adjuntos.map((a) => ({
      filename: a.nombre,
      content: Buffer.from(a.base64, 'base64'),
      contentType: 'application/pdf',
    })),
  });
  return { enviado: true, simulado: false };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function json(res, codigo, datos) {
  res.writeHead(codigo, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    let cuerpo = '';
    req.on('data', (c) => {
      cuerpo += c;
      if (cuerpo.length > 25e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolver(cuerpo ? JSON.parse(cuerpo) : {});
      } catch (e) {
        rechazar(e);
      }
    });
  });
}

function servirArchivo(req, res) {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.normalize(path.join(PUBLICO, ruta));
  if (!archivo.startsWith(PUBLICO)) return json(res, 403, { error: 'Acceso denegado' });
  fs.stat(archivo, (err, st) => {
    if (err || !st.isFile()) {
      // Las imágenes que no existen devuelven 404 (el sitio muestra "imagen no encontrada")
      if (path.extname(ruta)) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
      return fs.createReadStream(path.join(PUBLICO, 'index.html')).pipe(res);
    }
    const ext = path.extname(archivo).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TIPOS[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.woff2' || archivo.includes('vendor') ? 'max-age=86400' : 'no-cache',
    });
    fs.createReadStream(archivo).pipe(res);
  });
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/datos' && req.method === 'GET') {
      return json(res, 200, { datos: leerTodo(), email: emailReal() ? 'real' : 'simulado' });
    }

    if (url.pathname === '/api/guardar' && req.method === 'POST') {
      const { tablas = {}, origen = '', motivo = '' } = await leerCuerpo(req);
      const nombres = Object.keys(tablas).filter((t) => ESQUEMAS[t]);
      for (const t of nombres) escribirTabla(t, tablas[t]);
      avisar({ tipo: 'cambio', tablas: nombres, origen, motivo, momento: Date.now() });
      return json(res, 200, { ok: true, tablas: nombres });
    }

    if (url.pathname === '/api/eventos') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      clientes.add(res);
      const latido = setInterval(() => res.write(': latido\n\n'), 25000);
      req.on('close', () => {
        clearInterval(latido);
        clientes.delete(res);
      });
      return;
    }

    if (url.pathname === '/api/email' && req.method === 'POST') {
      const datos = await leerCuerpo(req);
      try {
        return json(res, 200, await enviarEmail(datos));
      } catch (e) {
        console.error('  Error al enviar email:', e.message);
        return json(res, 200, { enviado: false, error: e.message });
      }
    }

    if (url.pathname === '/api/restablecer' && req.method === 'POST') {
      delete require.cache[require.resolve('./scripts/generar-datos')];
      require('./scripts/generar-datos').generar();
      avisar({ tipo: 'cambio', tablas: Object.keys(ESQUEMAS), origen: 'servidor', motivo: 'restablecer', momento: Date.now() });
      return json(res, 200, { ok: true });
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Ruta inexistente' });
    servirArchivo(req, res);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Error interno', detalle: e.message });
  }
});

function cargarEnv() {
  const archivo = path.join(RAIZ, '.env');
  if (!fs.existsSync(archivo)) return;
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Si no existen los archivos de datos, se generan los datos de ejemplo
if (!fs.existsSync(path.join(DATOS, 'funciones.txt'))) {
  console.log('  Generando datos de ejemplo…');
  require('./scripts/generar-datos').generar();
}

servidor.listen(PUERTO, () => {
  console.log('');
  console.log('  Teatro CaPaz S.A. — prototipo del Sistema de Información');
  console.log(`  Abrí el navegador en  http://localhost:${PUERTO}`);
  console.log(`  Email: ${emailReal() ? 'envío real con Gmail' : 'simulado (ver README para activarlo)'}`);
  console.log('  Desarrollado por Punto y Hacha — Ctrl+C para detener');
  console.log('');
});
