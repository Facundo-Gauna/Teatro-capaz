// Genera los archivos de datos de ejemplo del Teatro CaPaz S.A.
// Uso: node scripts/generar-datos.js   (o el botón "Restablecer datos" del panel de administración)
// Los datos son ficticios. El generador es determinístico: siempre produce la misma temporada,
// y calcula las cuotas de los socios hasta el mes actual.

const fs = require('fs');
const path = require('path');
const ESQUEMAS = require('../esquemas');

const DATOS = path.join(__dirname, '..', 'datos');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function rng(semilla) {
  return function () {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let azar = rng(20261103);
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];
const pad = (n, l = 2) => String(n).padStart(l, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fecha = (s) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const sumarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const redondear = (n, paso = 500) => Math.round(n / paso) * paso;
const codigo = (largo = 8) => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < largo; i++) s += c[Math.floor(azar() * c.length)];
  return s;
};

function escribir(tabla, registros) {
  const defs = ESQUEMAS[tabla].map((c) => c.split(':'));
  const enc = `# Teatro CaPaz S.A. — archivo de ${tabla}\n# Campos: ${defs.map((d) => d[0]).join(' | ')}\n`;
  const lineas = registros.map((r) =>
    defs
      .map(([n, t]) => {
        const v = r[n];
        if (t === 'b') return v ? '1' : '0';
        if (t === 'n') return String(Number(v) || 0);
        return String(v ?? '').replace(/[|\r\n]+/g, ' ');
      })
      .join('|')
  );
  fs.writeFileSync(path.join(DATOS, tabla + '.txt'), enc + lineas.join('\n') + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

const feriados = [
  ['2025-01-01', 'Año Nuevo'], ['2025-03-03', 'Carnaval'], ['2025-03-04', 'Carnaval'],
  ['2025-03-24', 'Día de la Memoria'], ['2025-04-02', 'Malvinas'], ['2025-04-18', 'Viernes Santo'],
  ['2025-05-01', 'Día del Trabajador'], ['2025-05-02', 'Puente turístico'], ['2025-05-25', 'Revolución de Mayo'],
  ['2025-06-16', 'Paso a la Inmortalidad de Güemes'], ['2025-06-20', 'Día de la Bandera'], ['2025-07-09', 'Día de la Independencia'],
  ['2025-08-15', 'Puente turístico'], ['2025-08-17', 'Paso a la Inmortalidad de San Martín'], ['2025-10-12', 'Diversidad Cultural'],
  ['2025-11-21', 'Puente turístico'], ['2025-11-24', 'Soberanía Nacional'], ['2025-12-08', 'Inmaculada Concepción'],
  ['2025-12-25', 'Navidad'],
  ['2026-01-01', 'Año Nuevo'], ['2026-02-16', 'Carnaval'], ['2026-02-17', 'Carnaval'],
  ['2026-03-23', 'Puente turístico'], ['2026-03-24', 'Día de la Memoria'], ['2026-04-02', 'Malvinas'],
  ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajador'], ['2026-05-25', 'Revolución de Mayo'],
  ['2026-06-15', 'Paso a la Inmortalidad de Güemes'], ['2026-06-20', 'Día de la Bandera'], ['2026-07-09', 'Día de la Independencia'],
  ['2026-07-10', 'Puente turístico'], ['2026-08-17', 'Paso a la Inmortalidad de San Martín'], ['2026-10-12', 'Diversidad Cultural'],
  ['2026-11-23', 'Soberanía Nacional'], ['2026-12-07', 'Puente turístico'], ['2026-12-08', 'Inmaculada Concepción'],
  ['2026-12-25', 'Navidad'],
  ['2027-01-01', 'Año Nuevo'], ['2027-02-08', 'Carnaval'], ['2027-02-09', 'Carnaval'],
  ['2027-03-24', 'Día de la Memoria'], ['2027-03-26', 'Viernes Santo'], ['2027-04-02', 'Malvinas'],
];
const esFeriado = new Set(feriados.map((f) => f[0]));

function vencimientoDe(periodo, dia = 10) {
  const [a, m] = periodo.split('-').map(Number);
  let d = new Date(a, m - 1, dia);
  while (d.getDay() === 0 || d.getDay() === 6 || esFeriado.has(iso(d))) d = sumarDias(d, 1);
  return iso(d);
}

const configuracion = [
  { clave: 'cuotaMensual', valor: '12000', descripcion: 'Importe de la cuota mensual de socio (ARS)' },
  { clave: 'diaVencimientoCuota', valor: '10', descripcion: 'Día del mes en que vence la cuota (se corre al primer día hábil si es inhábil)' },
  { clave: 'descuentoSocio', valor: '30', descripcion: 'Porcentaje de descuento para socios con las cuotas al día' },
  { clave: 'cargoServicioOnline', valor: '10', descripcion: 'Cargo por servicio de la venta online (% sobre el precio de lista)' },
  { clave: 'maxEntradasPorCompra', valor: '8', descripcion: 'Cantidad máxima de entradas por operación' },
  { clave: 'reprogramarHorasAntes', valor: '48', descripcion: 'Horas mínimas de anticipación para reprogramar una entrada' },
  { clave: 'reintegroTotalDias', valor: '15', descripcion: 'Días de anticipación para reintegro del 100 % al cancelar' },
  { clave: 'reintegroParcialDias', valor: '7', descripcion: 'Días de anticipación para reintegro del 50 % al cancelar' },
  { clave: 'minutosReserva', valor: '10', descripcion: 'Minutos que se reservan las butacas mientras se espera el pago online' },
];

const generos = [
  { id: 'G1', nombre: 'Comedia', descripcion: 'Obras de humor para toda la familia' },
  { id: 'G2', nombre: 'Drama', descripcion: 'Teatro de texto y producciones dramáticas' },
  { id: 'G3', nombre: 'Musical', descripcion: 'Comedias musicales y espectáculos con orquesta' },
  { id: 'G4', nombre: 'Infantil', descripcion: 'Funciones pensadas para chicos y chicas' },
  { id: 'G5', nombre: 'Stand Up', descripcion: 'Humoristas en vivo' },
  { id: 'G6', nombre: 'Concierto', descripcion: 'Música en vivo' },
  { id: 'G7', nombre: 'Revista', descripcion: 'La tradicional revista de temporada de Carlos Paz' },
];

const obras = [
  { id: 'O1', nombre: 'El Último Telón', generoId: 'G2', director: 'Mariela Quiroga', actores: 'Julieta Ferraro, Andrés Lucero, Paula Benítez', pais: 'Argentina', anio: 2025, duracion: 95, clasificacion: 'ATP', sinopsis: 'La noche en que un viejo teatro de pueblo baja el telón por última vez, su elenco decide contar la verdad que calló durante cuarenta temporadas.' },
  { id: 'O2', nombre: 'Risas en la Sierra', generoId: 'G1', director: 'Tomás Ferreyra', actores: 'Gaby Morales, Ricardo Soria, Vero Acuña', pais: 'Argentina', anio: 2026, duracion: 90, clasificacion: 'ATP', sinopsis: 'Dos familias alquilan por error la misma cabaña frente al lago San Roque. Nadie piensa irse.' },
  { id: 'O3', nombre: 'Tango de Medianoche', generoId: 'G3', director: 'Laura Villafañe', actores: 'Compañía Arrabal, Orquesta Típica del Lago', pais: 'Argentina', anio: 2024, duracion: 110, clasificacion: '+13', sinopsis: 'Un musical de tango que recorre una noche porteña de 1945, con orquesta en vivo y doce bailarines.' },
  { id: 'O4', nombre: 'La Isla del Capitán Pimienta', generoId: 'G4', director: 'Federico Arce', actores: 'Elenco de Títeres del Sol', pais: 'Argentina', anio: 2026, duracion: 60, clasificacion: 'ATP', sinopsis: 'Un pirata que le tiene miedo al agua busca el tesoro más raro del mundo: un amigo de verdad.' },
  { id: 'O5', nombre: 'Sin Filtro', generoId: 'G5', director: 'Nico Albarracín', actores: 'Nico Albarracín', pais: 'Argentina', anio: 2026, duracion: 80, clasificacion: '+16', sinopsis: 'Una hora y veinte de stand up sobre la vida en las sierras, los turistas y la familia.' },
  { id: 'O6', nombre: 'Sinfonía de Verano', generoId: 'G6', director: 'Esteban Moyano', actores: 'Orquesta Filarmónica de las Sierras', pais: 'Argentina', anio: 2026, duracion: 100, clasificacion: 'ATP', sinopsis: 'Grandes bandas sonoras del cine interpretadas por sesenta músicos en vivo.' },
  { id: 'O7', nombre: 'Casa de Muñecas Rotas', generoId: 'G2', director: 'Carmen Ibarra', actores: 'Lucía Montes, Diego Arrieta, Nerea Sanz', pais: 'España', anio: 2023, duracion: 105, clasificacion: '+13', sinopsis: 'Producción internacional que relee un clásico del teatro moderno desde la mirada de tres generaciones.' },
  { id: 'O8', nombre: 'Brillantina', generoId: 'G7', director: 'Marcelo Pereyra', actores: 'Vedettes, humoristas y cuerpo de baile CaPaz', pais: 'Argentina', anio: 2026, duracion: 110, clasificacion: '+13', sinopsis: 'La revista de la temporada: plumas, escaleras, humor y el gran final con toda la compañía.' },
].map((o) => ({ ...o, imagen: `imagenes/funciones/${o.id}.jpg` }));

const salas = [
  { id: 'SA1', nombre: 'Sala 1', capacidad: 600, caracteristicas: 'Platea baja y palcos en planta alta. Foso de orquesta.', estado: 'habilitada', motivo: '' },
  { id: 'SA2', nombre: 'Sala 2', capacidad: 600, caracteristicas: 'Platea baja y palcos en planta alta. Escenario giratorio.', estado: 'habilitada', motivo: '' },
  { id: 'SA3', nombre: 'Sala 3', capacidad: 600, caracteristicas: 'Platea baja y palcos en planta alta.', estado: 'habilitada', motivo: '' },
  { id: 'SA4', nombre: 'Sala 4', capacidad: 600, caracteristicas: 'Platea baja y palcos en planta alta. Sonido envolvente.', estado: 'habilitada', motivo: '' },
  { id: 'SA5', nombre: 'Sala 5', capacidad: 600, caracteristicas: 'Platea baja y palcos en planta alta.', estado: 'inhabilitada', motivo: 'Mantenimiento de climatización' },
];

const tiposUbicacion = [
  { id: 'TU1', denominacion: 'Platea baja', planta: 'Planta baja', descripcion: 'Butacas numeradas del 1 al 350, en 14 filas de 25', desde: 1, hasta: 350 },
  { id: 'TU2', denominacion: 'Palco', planta: 'Planta alta', descripcion: 'Ubicaciones numeradas del 1 al 250, en 10 filas de 25', desde: 1, hasta: 250 },
];

const sectores = [
  { id: 'SE1', tipoUbicacionId: 'TU1', nombre: 'Platea Preferencial', filaDesde: 1, filaHasta: 5, colDesde: 1, colHasta: 25, color: '#c8962e' },
  { id: 'SE2', tipoUbicacionId: 'TU1', nombre: 'Platea Central', filaDesde: 6, filaHasta: 10, colDesde: 1, colHasta: 25, color: '#a3568f' },
  { id: 'SE3', tipoUbicacionId: 'TU1', nombre: 'Platea Posterior', filaDesde: 11, filaHasta: 14, colDesde: 1, colHasta: 25, color: '#5f7fbf' },
  { id: 'SE4', tipoUbicacionId: 'TU2', nombre: 'Palco Central', filaDesde: 1, filaHasta: 10, colDesde: 7, colHasta: 19, color: '#3f9a83' },
  { id: 'SE5', tipoUbicacionId: 'TU2', nombre: 'Palco Lateral Izquierdo', filaDesde: 1, filaHasta: 10, colDesde: 1, colHasta: 6, color: '#c46a4a' },
  { id: 'SE6', tipoUbicacionId: 'TU2', nombre: 'Palco Lateral Derecho', filaDesde: 1, filaHasta: 10, colDesde: 20, colHasta: 25, color: '#c46a4a' },
];
const MULT = { SE1: 1, SE2: 0.85, SE3: 0.7, SE4: 0.9, SE5: 0.72, SE6: 0.72 };

function ubicacionesDeSector(s) {
  const pref = s.tipoUbicacionId === 'TU1' ? 'P' : 'K';
  const lista = [];
  for (let f = s.filaDesde; f <= s.filaHasta; f++)
    for (let c = s.colDesde; c <= s.colHasta; c++) lista.push({ codigo: `${pref}-${(f - 1) * 25 + c}`, fila: f, col: c });
  return lista;
}

const promociones = [
  { id: 'PR1', nombre: 'Martes de Teatro', tipo: 'porcentaje', valor: 20, vigenciaDesde: '2026-08-01', vigenciaHasta: '2027-03-31', condicion: 'funcion-martes', estado: 'activa', descripcion: '20 % en funciones de los martes' },
  { id: 'PR2', nombre: 'Preventa de Verano', tipo: 'porcentaje', valor: 15, vigenciaDesde: '2026-08-01', vigenciaHasta: '2026-11-30', condicion: 'funcion-desde:2027-01-01', estado: 'activa', descripcion: '15 % comprando antes del 1/12 para funciones de enero y febrero' },
];

// Base de precio por obra (Platea Preferencial). Algunas fechas de enero tienen precio de temporada alta.
const BASE = { O1: 32000, O2: 28000, O3: 38000, O4: 16000, O5: 24000, O6: 36000, O7: 40000, O8: 42000 };

const funcionesDef = [
  ['O1', 'SA1', '2026-10-09', '21:00'], ['O2', 'SA2', '2026-10-10', '21:30'], ['O3', 'SA3', '2026-10-17', '21:00'],
  ['O5', 'SA4', '2026-10-24', '22:30'], ['O4', 'SA2', '2026-10-25', '17:00'],
  ['O2', 'SA2', '2026-11-07', '21:30'], ['O1', 'SA1', '2026-11-13', '21:00'], ['O5', 'SA4', '2026-11-14', '22:30'],
  ['O4', 'SA3', '2026-11-22', '17:00'], ['O3', 'SA3', '2026-11-28', '21:00'], ['O6', 'SA1', '2026-12-12', '21:00'],
  ['O8', 'SA2', '2026-12-19', '21:30'], ['O7', 'SA4', '2026-12-26', '21:00'], ['O8', 'SA2', '2027-01-08', '21:00'],
  ['O8', 'SA2', '2027-01-08', '23:30'], ['O2', 'SA1', '2027-01-08', '21:00'], ['O4', 'SA3', '2027-01-12', '17:00'],
  ['O5', 'SA4', '2027-01-15', '23:00'], ['O1', 'SA1', '2027-01-16', '21:00'], ['O3', 'SA3', '2027-01-22', '21:30'],
  ['O7', 'SA4', '2027-01-23', '21:00'], ['O6', 'SA1', '2027-01-30', '21:00'], ['O2', 'SA2', '2027-02-05', '21:30'],
  ['O8', 'SA2', '2027-02-06', '21:30'], ['O4', 'SA3', '2027-02-09', '17:00'],
];

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

const NOMBRES = ['Lucía', 'Martín', 'Sofía', 'Juan', 'Valentina', 'Mateo', 'Camila', 'Santiago', 'Martina', 'Benjamín', 'Julieta', 'Tomás', 'Agustina', 'Joaquín', 'Florencia', 'Facundo', 'Micaela', 'Nicolás', 'Carolina', 'Ignacio', 'Rocío', 'Franco', 'Milagros', 'Lautaro', 'Paula', 'Gonzalo', 'Antonella', 'Ezequiel', 'Daniela', 'Marcos', 'Belén', 'Diego', 'Natalia', 'Pablo', 'Romina', 'Hernán', 'Gabriela', 'Leandro', 'Silvina', 'Ramiro'];
const APELLIDOS = ['Fernández', 'Gómez', 'Ramírez', 'López', 'Martínez', 'Pérez', 'Sosa', 'Romero', 'Díaz', 'Torres', 'Álvarez', 'Ruiz', 'Benítez', 'Acosta', 'Medina', 'Herrera', 'Aguirre', 'Molina', 'Castro', 'Ortiz', 'Suárez', 'Luna', 'Ríos', 'Peralta', 'Vega', 'Moreno', 'Ledesma', 'Bustos', 'Quiroga', 'Ponce'];

function sinTildes(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function generar() {
  azar = rng(20261103);
  if (!fs.existsSync(DATOS)) fs.mkdirSync(DATOS, { recursive: true });
  const hoy = new Date();
  const hoyIso = iso(hoy);
  const periodoActual = hoyIso.slice(0, 7);

  // Usuarios de prueba (ver README) + clientes generados
  const usuarios = [
    { id: 'U001', email: 'admin@gmail.com', password: 'admin', rol: 'admin', tipoDoc: 'DNI', nroDoc: '25000001', nombre: 'Alejandra', apellido: 'Villegas', telefono: '3541 400100', fechaNac: '1978-04-12', fechaAlta: '2024-11-01' },
    { id: 'U002', email: 'boletero@gmail.com', password: 'boletero', rol: 'boletero', tipoDoc: 'DNI', nroDoc: '36000002', nombre: 'Rubén', apellido: 'Cabrera', telefono: '3541 400101', fechaNac: '1991-09-03', fechaAlta: '2025-01-10' },
    { id: 'U003', email: 'encargado@gmail.com', password: 'encargado', rol: 'encargado', tipoDoc: 'DNI', nroDoc: '29000003', nombre: 'Verónica', apellido: 'Paz', telefono: '3541 400102', fechaNac: '1983-02-21', fechaAlta: '2024-12-01' },
    { id: 'U004', email: 'socio@gmail.com', password: '1234', rol: 'cliente', tipoDoc: 'DNI', nroDoc: '30111222', nombre: 'Lucía', apellido: 'Fernández', telefono: '3541 555010', fechaNac: '1984-06-15', fechaAlta: '2025-02-03' },
    { id: 'U005', email: 'deudor@gmail.com', password: '1234', rol: 'cliente', tipoDoc: 'DNI', nroDoc: '28444555', nombre: 'Martín', apellido: 'Gómez', telefono: '3541 555011', fechaNac: '1981-11-02', fechaAlta: '2025-03-12' },
    { id: 'U006', email: 'cliente@gmail.com', password: '1234', rol: 'cliente', tipoDoc: 'DNI', nroDoc: '40222333', nombre: 'Sofía', apellido: 'Ramírez', telefono: '3541 555012', fechaNac: '1997-01-28', fechaAlta: '2026-05-20' },
  ];
  const usados = new Set(usuarios.map((u) => u.email));
  for (let i = 0; i < 44; i++) {
    const nombre = elegir(NOMBRES);
    const apellido = elegir(APELLIDOS);
    let email = `${sinTildes(nombre)}.${sinTildes(apellido)}@gmail.com`;
    if (usados.has(email)) email = `${sinTildes(nombre)}.${sinTildes(apellido)}${entre(1, 99)}@gmail.com`;
    if (usados.has(email)) continue;
    usados.add(email);
    usuarios.push({
      id: 'U' + pad(usuarios.length + 1, 3), email, password: '1234', rol: 'cliente', tipoDoc: 'DNI',
      nroDoc: String(entre(20, 45)) + pad(entre(0, 999999), 6), nombre, apellido,
      telefono: `351 ${entre(400, 699)} ${pad(entre(0, 9999), 4)}`,
      fechaNac: `${entre(1960, 2005)}-${pad(entre(1, 12))}-${pad(entre(1, 28))}`,
      fechaAlta: `2026-0${entre(1, 9)}-${pad(entre(1, 28))}`,
    });
  }

  // Socios: al día, con deuda y dados de baja (para el informe de permanencia)
  const socios = [];
  const cuotas = [];
  let reciboNro = 1;
  const cuotaHistorica = (periodo) => (periodo < '2026-01' ? 9500 : 12000);
  const periodosDesde = (desde, hasta) => {
    const lista = [];
    let [a, m] = desde.split('-').map(Number);
    const [ah, mh] = hasta.split('-').map(Number);
    while (a < ah || (a === ah && m <= mh)) {
      lista.push(`${a}-${pad(m)}`);
      m++;
      if (m > 12) { m = 1; a++; }
    }
    return lista;
  };
  const periodoMenos = (p, n) => {
    let [a, m] = p.split('-').map(Number);
    m -= n;
    while (m < 1) { m += 12; a--; }
    return `${a}-${pad(m)}`;
  };
  // Último período que ya venció (si el vencimiento del mes actual no pasó, es el anterior)
  const ultimoVencido = vencimientoDe(periodoActual) < hoyIso ? periodoActual : periodoMenos(periodoActual, 1);

  function agregarSocio(persona, alta, tipo, mesesPagados) {
    const s = {
      id: 'S' + pad(socios.length + 1, 3), nroSocio: 1001 + socios.length, tipoDoc: 'DNI', nroDoc: persona.nroDoc,
      nombre: persona.nombre, apellido: persona.apellido, telefono: persona.telefono, email: persona.email,
      fechaNac: persona.fechaNac, fechaAlta: alta, estado: 'activo', fechaBaja: '', motivoBaja: '',
    };
    const inicio = alta.slice(0, 7);
    let hastaPagado;
    if (tipo === 'aldia') hastaPagado = azar() < 0.35 ? periodoActual : ultimoVencido;
    else if (tipo === 'deuda') hastaPagado = periodoMenos(ultimoVencido, mesesPagados);
    else hastaPagado = periodosDesde(inicio, ultimoVencido)[Math.max(0, mesesPagados - 1)];
    for (const p of periodosDesde(inicio, hastaPagado)) {
      const venc = vencimientoDe(p);
      const pago = p === inicio ? fecha(alta) : sumarDias(fecha(venc), -entre(0, 7));
      cuotas.push({
        id: 'C' + pad(cuotas.length + 1, 4), socioId: s.id, periodo: p, vencimiento: venc, importe: cuotaHistorica(p),
        fechaPago: iso(pago), horaPago: `${pad(entre(10, 19))}:${pad(entre(0, 59))}`, canal: 'presencial',
        reciboNro: reciboNro++, registradoPor: 'U002',
      });
    }
    if (tipo === 'baja') {
      const sig = periodosDesde(hastaPagado, periodoActual)[1] || periodoActual;
      s.estado = 'baja';
      s.fechaBaja = iso(sumarDias(fecha(vencimientoDe(sig)), entre(30, 45)));
      if (s.fechaBaja > hoyIso) s.fechaBaja = hoyIso;
      s.motivoBaja = 'Adeudaba más de un período y no desea continuar asociado';
    }
    socios.push(s);
    return s;
  }

  agregarSocio(usuarios[3], '2025-02-03', 'aldia');
  agregarSocio(usuarios[4], '2025-03-12', 'deuda', 3);
  const clientes = usuarios.slice(6);
  const planes = [
    ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'], ['aldia'],
    ['deuda', 2], ['deuda', 2],
    ['baja', 2], ['baja', 3], ['baja', 4], ['baja', 5], ['baja', 6], ['baja', 8], ['baja', 9], ['baja', 12], ['baja', 3], ['baja', 7],
  ];
  planes.forEach((plan, i) => {
    const persona = clientes[i];
    const alta = plan[0] === 'baja'
      ? `2025-${pad(entre(1, 10))}-${pad(entre(1, 28))}`
      : `${azar() < 0.5 ? 2025 : 2026}-${pad(entre(1, 8))}-${pad(entre(1, 28))}`;
    persona.fechaAlta = alta < persona.fechaAlta ? alta : persona.fechaAlta;
    agregarSocio(persona, alta, plan[0], plan[1]);
  });

  // Funciones y precios
  const funciones = funcionesDef.map(([obraId, salaId, f, hora], i) => ({
    id: 'F' + pad(i + 1), obraId, salaId, fecha: f, hora, estado: f < hoyIso ? 'finalizada' : 'programada', imagen: '',
  }));
  const preciosFuncion = [];
  for (const fn of funciones) {
    const temporadaAlta = fn.fecha >= '2027-01-01' && ['O8', 'O3', 'O7'].includes(fn.obraId);
    const base = BASE[fn.obraId] * (temporadaAlta ? 1.15 : 1);
    for (const s of sectores) preciosFuncion.push({ funcionId: fn.id, sectorId: s.id, precio: redondear(base * MULT[s.id]) });
  }
  const precio = (fnId, seId) => preciosFuncion.find((p) => p.funcionId === fnId && p.sectorId === seId).precio;

  // Ventas, entradas y pagos
  const ventas = [];
  const entradas = [];
  const pagos = [];
  const inicioVentas = fecha('2026-08-01');
  const finVentas = sumarDias(hoy, -1) < fecha('2026-10-30') ? sumarDias(hoy, -1) : fecha('2026-10-30');
  const sociosActivosEnFecha = (doc, f) => {
    const s = socios.find((x) => x.nroDoc === doc);
    if (!s || s.fechaAlta > f || (s.fechaBaja && s.fechaBaja <= f)) return null;
    const pagadas = new Set(cuotas.filter((c) => c.socioId === s.id).map((c) => c.periodo));
    for (const p of periodosDesde(s.fechaAlta.slice(0, 7), f.slice(0, 7))) if (vencimientoDe(p) < f && !pagadas.has(p)) return null;
    return s;
  };
  const promoPara = (fn, fVenta) => {
    let mejor = null;
    for (const p of promociones) {
      if (fVenta < p.vigenciaDesde || fVenta > p.vigenciaHasta) continue;
      let ok = false;
      if (p.condicion === 'funcion-martes') ok = fecha(fn.fecha).getDay() === 2;
      if (p.condicion.startsWith('funcion-desde:')) ok = fn.fecha >= p.condicion.split(':')[1];
      if (ok && (!mejor || p.valor > mejor.valor)) mejor = p;
    }
    return mejor;
  };

  const vendedores = ['U002', 'U001'];
  const nroVenta = { n: 1 };
  for (const fn of funciones) {
    const fFn = fecha(fn.fecha);
    const pasada = fn.fecha < hoyIso;
    let objetivo;
    if (pasada) objetivo = 0.5 + azar() * 0.35;
    else if (fn.fecha < '2026-12-01') objetivo = 0.28 + azar() * 0.3;
    else if (fn.fecha < '2027-01-01') objetivo = 0.15 + azar() * 0.2;
    else objetivo = 0.06 + azar() * 0.16;
    if (fn.obraId === 'O8') objetivo += 0.1; // la revista es la más pedida
    const meta = Math.round(600 * objetivo);
    const ocupadas = new Set();
    const ultimoDia = fFn < finVentas ? sumarDias(fFn, -1) : finVentas;
    const rango = Math.max(1, Math.round((ultimoDia - inicioVentas) / 864e5));
    let vendidas = 0;
    let intentos = 0;
    while (vendidas < meta && intentos++ < 2000) {
      // Las ventas se concentran cerca de la fecha de la función
      const t = Math.pow(azar(), 0.55);
      const fVenta = iso(sumarDias(inicioVentas, Math.round(t * rango)));
      const sector = elegir(azar() < 0.62 ? sectores.slice(0, 3) : sectores.slice(3));
      const cant = Math.min(entre(1, 4) + (azar() < 0.2 ? entre(1, 2) : 0), meta - vendidas);
      const libres = ubicacionesDeSector(sector).filter((u) => !ocupadas.has(u.codigo));
      if (libres.length < cant) continue;
      const ini = entre(0, libres.length - cant);
      const elegidas = libres.slice(ini, ini + cant);
      elegidas.forEach((u) => ocupadas.add(u.codigo));
      vendidas += cant;

      const online = azar() < 0.58;
      let cliente;
      if (online || azar() < 0.5) cliente = elegir(usuarios.slice(3));
      else cliente = { nroDoc: String(entre(20, 45)) + pad(entre(0, 999999), 6), nombre: elegir(NOMBRES), apellido: elegir(APELLIDOS), email: '' };
      const socio = sociosActivosEnFecha(cliente.nroDoc, fVenta);
      const lista = precio(fn.id, sector.id) * cant;
      let descuento = 0;
      let detalle = '';
      if (socio) {
        descuento = Math.round(lista * 0.3);
        detalle = 'Socio al día 30 %';
      } else {
        const promo = promoPara(fn, fVenta);
        if (promo) {
          descuento = Math.round((lista * promo.valor) / 100);
          detalle = `${promo.nombre} ${promo.valor} %`;
        }
      }
      const cargo = online ? Math.round(lista * 0.1) : 0;
      const v = {
        id: 'V' + pad(nroVenta.n, 5), nro: nroVenta.n++, fecha: fVenta, hora: `${pad(entre(online ? 0 : 10, online ? 23 : 21))}:${pad(entre(0, 59))}`,
        canal: online ? 'online' : 'presencial', funcionId: fn.id, usuarioId: online ? cliente.id : '',
        clienteTipoDoc: 'DNI', clienteDoc: cliente.nroDoc, clienteNombre: `${cliente.nombre} ${cliente.apellido}`, clienteEmail: cliente.email || '',
        esSocio: !!socio, socioId: socio ? socio.id : '', cantidad: cant, subtotal: lista, descuento, detalleDescuento: detalle,
        cargoServicio: cargo, total: lista - descuento + cargo, estado: 'confirmada', reintegro: 0,
        vendedorId: online ? '' : elegir(vendedores), emailEnviado: online,
      };
      ventas.push(v);
      for (const u of elegidas) {
        const usada = pasada && azar() < 0.93;
        entradas.push({
          id: 'E' + pad(entradas.length + 1, 5), ventaId: v.id, funcionId: fn.id, ubicacion: u.codigo, sectorId: sector.id,
          precio: precio(fn.id, sector.id), codigo: 'CPZ-' + codigo(), estado: usada ? 'usada' : 'valida', reprogramada: false,
          funcionOriginalId: '', fechaIngreso: usada ? `${fn.fecha} ${fn.hora.slice(0, 2)}:${pad(entre(0, 25))}` : '',
        });
      }
      pagos.push({
        id: 'P' + pad(pagos.length + 1, 5), tipo: 'venta', origenId: v.id, plataforma: online ? 'PagoSeguro (externa)' : 'Boletería',
        medio: online ? elegir(['Tarjeta de crédito', 'Tarjeta de débito', 'QR billetera virtual', 'Transferencia']) : elegir(['Efectivo', 'Tarjeta de débito', 'Tarjeta de crédito']),
        importe: v.total, estado: 'aprobado', fecha: v.fecha, hora: v.hora, referencia: online ? 'PS-' + codigo(10) : '',
      });
    }
  }

  // Algunas cancelaciones con reintegro, para mostrar la regla
  const futuras = ventas.filter((v) => funciones.find((f) => f.id === v.funcionId).fecha >= '2026-12-01');
  for (let i = 0; i < 6 && futuras.length; i++) {
    const v = futuras.splice(entre(0, futuras.length - 1), 1)[0];
    v.estado = 'cancelada';
    v.reintegro = v.subtotal - v.descuento;
    entradas.filter((e) => e.ventaId === v.id).forEach((e) => (e.estado = 'cancelada'));
  }

  // Los socios también figuran como clientes de cuotas pagadas
  for (const c of cuotas) {
    pagos.push({
      id: 'P' + pad(pagos.length + 1, 5), tipo: 'cuota', origenId: c.id, plataforma: 'Boletería', medio: elegir(['Efectivo', 'Tarjeta de débito']),
      importe: c.importe, estado: 'aprobado', fecha: c.fechaPago, hora: c.horaPago, referencia: 'Recibo ' + c.reciboNro,
    });
  }

  const tablas = {
    configuracion, feriados: feriados.map(([f, d]) => ({ fecha: f, descripcion: d })), generos, obras, salas, tiposUbicacion,
    sectores, promociones, funciones, preciosFuncion, usuarios, socios, cuotas, ventas, entradas, pagos,
  };
  for (const [t, regs] of Object.entries(tablas)) escribir(t, regs);
  return Object.fromEntries(Object.entries(tablas).map(([t, r]) => [t, r.length]));
}

module.exports = { generar };

if (require.main === module) {
  const resumen = generar();
  console.log('Datos de ejemplo generados en /datos:');
  for (const [t, n] of Object.entries(resumen)) console.log(`  ${t.padEnd(16)} ${n} registros`);
}
