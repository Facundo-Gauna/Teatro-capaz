// Comprobantes en PDF: tickets de entrada, recibos de cuota e informes.
// Se generan en el navegador con jsPDF y se descargan o se envían por correo.

import { idx } from './estado.js';
import { describirUbicacion, horaActual, hoyIso } from './reglas.js';
import { pesos, fechaLarga, fechaCorta, periodoTexto } from './ui.js';

const VIOLETA = [58, 22, 80];
const VIOLETA_MEDIO = [122, 61, 158];
const ORO = [196, 146, 58];
const TINTA = [34, 19, 43];
const GRIS = [106, 87, 117];

let logos = null;
async function cargarLogos() {
  if (logos) return logos;
  const leer = async (url) => {
    const b = await (await fetch(url)).blob();
    return new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(b);
    });
  };
  logos = { teatro: await leer('img/teatro_capaz_logo.png'), grupo: await leer('img/logo_grupo.png') };
  return logos;
}

const limpio = (s) => String(s ?? '').replace(/ /g, ' ').replace(/[—–]/g, '-').replace(/[“”]/g, '"');

function nuevoDoc(opciones) {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: 'mm', ...opciones });
}

function qr(doc, texto, x, y, tam) {
  const q = window.qrcode(0, 'M');
  q.addData(texto);
  q.make();
  const n = q.getModuleCount();
  const c = tam / n;
  doc.setFillColor(255, 255, 255);
  doc.rect(x - 2, y - 2, tam + 4, tam + 4, 'F');
  doc.setFillColor(20, 10, 26);
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) doc.rect(x + k * c, y + r * c, c + 0.02, c + 0.02, 'F');
}

function rotulo(doc, etiqueta, valor, x, y, tamValor = 11) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS);
  doc.text(limpio(etiqueta).toUpperCase(), x, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(tamValor);
  doc.setTextColor(...TINTA);
  doc.text(limpio(valor), x, y + 5);
}

// ---------------------------------------------------------------------------
// Tickets de entrada (una página por entrada)
// ---------------------------------------------------------------------------

export async function pdfTickets(venta, entradas) {
  const { teatro } = await cargarLogos();
  const doc = nuevoDoc({ orientation: 'landscape', format: [80, 200] });
  entradas.forEach((e, i) => {
    if (i > 0) doc.addPage([80, 200], 'landscape');
    const f = idx.funciones.get(e.funcionId);
    const o = idx.obras.get(f.obraId);
    const s = idx.salas.get(f.salaId);

    doc.setFillColor(255, 251, 244);
    doc.rect(0, 0, 200, 80, 'F');
    doc.setFillColor(...ORO);
    doc.rect(0, 0, 148, 1.6, 'F');

    doc.addImage(teatro, 'PNG', 8, 6, 17, 15.6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...VIOLETA_MEDIO);
    doc.text('TEATRO CAPAZ S.A.  ·  VILLA CARLOS PAZ', 29, 11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(limpio(`Entrada ${i + 1} de ${entradas.length}  ·  Venta N° ${venta.nro}  ·  Canal ${venta.canal}`), 29, 15.5);

    doc.setFont('times', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(...TINTA);
    doc.text(limpio(o.nombre), 8, 32);

    rotulo(doc, 'Fecha', fechaLarga(f.fecha), 8, 41, 10.5);
    rotulo(doc, 'Hora', `${f.hora} h`, 92, 41, 10.5);
    rotulo(doc, 'Sala', s.nombre, 116, 41, 10.5);
    rotulo(doc, 'Ubicación', describirUbicacion(e.ubicacion), 8, 54, 10.5);
    rotulo(doc, 'Titular', venta.clienteNombre, 8, 67, 9.5);
    rotulo(doc, 'Precio', pesos(e.precio), 92, 67, 9.5);
    if (e.reprogramada) {
      doc.setFontSize(7);
      doc.setTextColor(...ORO);
      doc.text('REPROGRAMADA', 116, 67);
    }

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text('Presentá el código en el ingreso. Válida para una persona. Sujeta a las condiciones de cancelación.', 8, 76.5);

    // Talón
    doc.setFillColor(...VIOLETA);
    doc.rect(148, 0, 52, 80, 'F');
    doc.setDrawColor(...ORO);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(148, 3, 148, 77);
    doc.setLineDashPattern([], 0);
    qr(doc, e.codigo, 157, 10, 34);
    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(e.codigo, 174, 54, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(239, 205, 131);
    doc.text(limpio(`${f.fecha.split('-').reverse().join('/')}  ${f.hora} h`), 174, 61, { align: 'center' });
    doc.text(limpio(describirUbicacion(e.ubicacion).split(' · ').slice(1).join(' · ')), 174, 66, { align: 'center' });
  });
  return doc;
}

// ---------------------------------------------------------------------------
// Recibo de pago de cuota
// ---------------------------------------------------------------------------

export async function pdfRecibo(socio, cuotas, estadoTexto) {
  const { teatro } = await cargarLogos();
  const doc = nuevoDoc({ format: 'a5' });
  const W = 148;
  doc.setFillColor(...VIOLETA);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(10, 7, 21, 20, 2, 2, 'F');
  doc.addImage(teatro, 'PNG', 11.5, 8.2, 18, 16.5);
  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('Recibo de pago de cuota', 37, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(239, 205, 131);
  doc.text('Teatro CaPaz S.A.  ·  Departamento de Socios', 37, 23.5);

  const c0 = cuotas[0];
  rotulo(doc, 'Recibo N°', String(c0.reciboNro).padStart(6, '0'), 12, 46, 11);
  rotulo(doc, 'Fecha y hora', `${fechaCorta(c0.fechaPago)} ${c0.horaPago}`, 58, 46, 11);
  rotulo(doc, 'Canal', c0.canal === 'online' ? 'Online' : 'Presencial', 108, 46, 11);
  rotulo(doc, 'Socio', `${socio.nombre} ${socio.apellido}`, 12, 61, 11);
  rotulo(doc, 'Documento', `${socio.tipoDoc} ${socio.nroDoc}`, 78, 61, 11);
  rotulo(doc, 'N° de socio', String(socio.nroSocio), 116, 61, 11);

  let y = 76;
  doc.setFillColor(243, 234, 220);
  doc.rect(12, y, W - 24, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text('PERÍODO ABONADO', 15, y + 5.3);
  doc.text('VENCIMIENTO', 80, y + 5.3);
  doc.text('IMPORTE', W - 15, y + 5.3, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TINTA);
  let total = 0;
  for (const c of cuotas) {
    y += 7;
    doc.text(periodoTexto(c.periodo), 15, y);
    doc.text(fechaCorta(c.vencimiento), 80, y);
    doc.text(limpio(pesos(c.importe)), W - 15, y, { align: 'right' });
    total += c.importe;
    doc.setDrawColor(230, 220, 205);
    doc.line(12, y + 3, W - 12, y + 3);
  }
  y += 13;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total abonado', 15, y);
  doc.text(limpio(pesos(total)), W - 15, y, { align: 'right' });

  y += 14;
  doc.setFillColor(232, 245, 238);
  doc.roundedRect(12, y - 6, W - 24, 13, 2, 2, 'F');
  doc.setFontSize(9.5);
  doc.setTextColor(31, 122, 85);
  doc.text(limpio(`Estado de cuenta actualizado: ${estadoTexto}`), 16, y + 1.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text('Con las cuotas al día, el socio accede al 30 % de descuento en entradas.', 12, 196);
  doc.text(limpio(`Emitido por el Sistema de Información del Teatro CaPaz · ${fechaCorta(hoyIso())} ${horaActual()}`), 12, 201);
  return doc;
}

// ---------------------------------------------------------------------------
// Informe para la Gerencia
// ---------------------------------------------------------------------------

export async function pdfInforme({ titulo, finalidad, destinatario, filtros, kpis, imagen, columnas, filas, conclusion }) {
  const { teatro, grupo } = await cargarLogos();
  const doc = nuevoDoc({ format: 'a4' });
  const W = 210;
  const M = 16;
  doc.setFillColor(...VIOLETA);
  doc.rect(0, 0, W, 30, 'F');
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, 6, 19, 18, 2, 2, 'F');
  doc.addImage(teatro, 'PNG', M + 1.3, 7, 16.4, 15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(239, 205, 131);
  doc.text('TEATRO CAPAZ S.A.  ·  INFORME DE GESTIÓN', M + 25, 13);
  doc.setFont('times', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(limpio(titulo), M + 25, 21);

  let y = 40;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(limpio(`Destinatario: ${destinatario}`), M, y);
  doc.text(limpio(`Generado: ${fechaCorta(hoyIso())} ${horaActual()} h`), W - M, y, { align: 'right' });
  y += 5;
  doc.text(limpio(`Filtros: ${filtros}`), M, y);
  y += 5;
  const fin = doc.splitTextToSize(limpio(`Finalidad: ${finalidad}`), W - 2 * M);
  doc.text(fin, M, y);
  y += fin.length * 4.2 + 4;

  // Indicadores
  const anchoK = (W - 2 * M - (kpis.length - 1) * 4) / kpis.length;
  kpis.forEach((k, i) => {
    const x = M + i * (anchoK + 4);
    doc.setFillColor(246, 239, 227);
    doc.roundedRect(x, y, anchoK, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(doc.splitTextToSize(limpio(k.etiqueta), anchoK - 6), x + 3, y + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...TINTA);
    doc.text(limpio(k.valor), x + 3, y + 16);
  });
  y += 28;

  if (conclusion) {
    doc.setFont('times', 'italic');
    doc.setFontSize(12);
    doc.setTextColor(...VIOLETA);
    const lc = doc.splitTextToSize(limpio(conclusion), W - 2 * M);
    doc.text(lc, M, y);
    y += lc.length * 5.2 + 4;
  }

  if (imagen) {
    const tam = 82;
    doc.addImage(imagen, 'PNG', (W - tam * 1.5) / 2, y, tam * 1.5, tam);
    y += tam + 6;
  }

  // Tabla
  const anchos = columnas.map((c) => c.ancho || 1);
  const totalAncho = anchos.reduce((a, b) => a + b, 0);
  const xs = [];
  let acc = M;
  for (const a of anchos) {
    xs.push(acc);
    acc += ((W - 2 * M) * a) / totalAncho;
  }
  const encabezado = () => {
    doc.setFillColor(243, 234, 220);
    doc.rect(M, y, W - 2 * M, 7.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    columnas.forEach((c, i) => {
      const der = c.der;
      const x = der ? (xs[i + 1] ?? W - M) - 2 : xs[i] + 2;
      doc.text(limpio(c.titulo).toUpperCase(), x, y + 5, { align: der ? 'right' : 'left' });
    });
    y += 7.5;
  };
  encabezado();
  doc.setFontSize(8.5);
  for (const fila of filas) {
    if (y > 278) {
      doc.addPage();
      y = 18;
      encabezado();
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TINTA);
    columnas.forEach((c, i) => {
      const der = c.der;
      const x = der ? (xs[i + 1] ?? W - M) - 2 : xs[i] + 2;
      const ancho = ((W - 2 * M) * anchos[i]) / totalAncho - 4;
      let t = limpio(fila[i]);
      while (doc.getTextWidth(t) > ancho && t.length > 3) t = t.slice(0, -2);
      if (t !== limpio(fila[i])) t = t.slice(0, -1) + '…';
      doc.text(t, x, y + 5, { align: der ? 'right' : 'left' });
    });
    doc.setDrawColor(232, 222, 206);
    doc.line(M, y + 7, W - M, y + 7);
    y += 7;
  }

  // Pie en todas las páginas
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.addImage(grupo, 'PNG', M, 284, 8, 7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRIS);
    doc.text('Sistema de Información Teatro CaPaz S.A.  ·  Desarrollado por Punto y Hacha', M + 10, 288.5);
    doc.text(`Página ${p} de ${paginas}`, W - M, 288.5, { align: 'right' });
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Envío por correo (real si el servidor tiene Gmail configurado; si no, simulado)
// ---------------------------------------------------------------------------

export async function enviarPorCorreo({ para, asunto, html, doc, nombreArchivo }) {
  const base64 = doc.output('datauristring').split(',')[1];
  try {
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ para, asunto, html, adjuntos: [{ nombre: nombreArchivo, base64 }] }),
    });
    return await res.json();
  } catch (e) {
    return { enviado: false, error: e.message };
  }
}

export function descargar(doc, nombre) {
  doc.save(nombre);
}
