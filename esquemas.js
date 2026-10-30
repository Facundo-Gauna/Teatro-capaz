// Esquemas de los archivos de datos (un archivo .txt por entidad).
// Cada registro es una línea con los campos separados por "|".
// Sufijos de tipo: ":n" número, ":b" booleano (1/0). Sin sufijo: texto.
// El orden de los campos es el orden en que se escriben en el archivo.

module.exports = {
  configuracion: ['clave', 'valor', 'descripcion'],
  feriados: ['fecha', 'descripcion'],

  // Alcances de soporte
  generos: ['id', 'nombre', 'descripcion'],
  obras: ['id', 'nombre', 'generoId', 'director', 'actores', 'pais', 'anio:n', 'duracion:n', 'clasificacion', 'sinopsis', 'imagen'],
  salas: ['id', 'nombre', 'capacidad:n', 'caracteristicas', 'estado', 'motivo'],
  tiposUbicacion: ['id', 'denominacion', 'planta', 'descripcion', 'desde:n', 'hasta:n'],
  sectores: ['id', 'tipoUbicacionId', 'nombre', 'filaDesde:n', 'filaHasta:n', 'colDesde:n', 'colHasta:n', 'color'],
  promociones: ['id', 'nombre', 'tipo', 'valor:n', 'vigenciaDesde', 'vigenciaHasta', 'condicion', 'estado', 'descripcion'],

  // Programación (funciones fijas en este prototipo)
  funciones: ['id', 'obraId', 'salaId', 'fecha', 'hora', 'estado', 'imagen'],
  preciosFuncion: ['funcionId', 'sectorId', 'precio:n'],

  // Personas
  usuarios: ['id', 'email', 'password', 'rol', 'tipoDoc', 'nroDoc', 'nombre', 'apellido', 'telefono', 'fechaNac', 'fechaAlta'],
  socios: ['id', 'nroSocio:n', 'tipoDoc', 'nroDoc', 'nombre', 'apellido', 'telefono', 'email', 'fechaNac', 'fechaAlta', 'estado', 'fechaBaja', 'motivoBaja'],
  cuotas: ['id', 'socioId', 'periodo', 'vencimiento', 'importe:n', 'fechaPago', 'horaPago', 'canal', 'reciboNro:n', 'registradoPor'],

  // Ventas
  ventas: ['id', 'nro:n', 'fecha', 'hora', 'canal', 'funcionId', 'usuarioId', 'clienteTipoDoc', 'clienteDoc', 'clienteNombre', 'clienteEmail', 'esSocio:b', 'socioId', 'cantidad:n', 'subtotal:n', 'descuento:n', 'detalleDescuento', 'cargoServicio:n', 'total:n', 'estado', 'reintegro:n', 'vendedorId', 'emailEnviado:b'],
  entradas: ['id', 'ventaId', 'funcionId', 'ubicacion', 'sectorId', 'precio:n', 'codigo', 'estado', 'reprogramada:b', 'funcionOriginalId', 'fechaIngreso'],
  // tipo: "venta" (origenId = id de venta) o "cuota" (origenId = ids de cuotas separados por coma)
  pagos: ['id', 'tipo', 'origenId','plataforma', 'medio', 'importe:n', 'estado', 'fecha', 'hora', 'referencia'],
};
