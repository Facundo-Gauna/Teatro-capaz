# Teatro CaPaz S.A. — Prototipo del Sistema de Información

TPI de **Sistemas y Procesos de Negocio** · Ingeniería en Sistemas de Información · UTN FRVM
Desarrollado por **Punto y Hacha** — *“Tenemos el truco para elevar tu empresa”*

Prototipo funcional que muestra cómo el Sistema de Información da soporte a los procesos del teatro: la venta de entradas (online y en boletería), la gestión de socios y cuotas, y los informes para la Gerencia. Los datos se guardan en **archivos de texto** (sin base de datos).

---

## Cómo ejecutarlo

Requisito: **Node.js 18 o superior**. No hace falta instalar nada más.

```bash
node server.js
```

Abrí **http://localhost:3000** en el navegador. Para detenerlo: `Ctrl + C`.

Si los archivos de datos no existen, se generan solos al iniciar. Para volver a los datos de ejemplo: menú del usuario administrador → **Restablecer datos de ejemplo**, o `node scripts/generar-datos.js`.

### Usuarios de prueba

| Rol | Correo | Contraseña | Entra a |
|---|---|---|---|
| Administrador | admin@gmail.com | admin | Boletería, Informes y su cuenta |
| Boletero | boletero@gmail.com | boletero | Boletería |
| Encargado | encargado@gmail.com | encargado | Informes |
| Cliente socio al día | socio@gmail.com | 1234 | Compra online con 30 % |
| Cliente socio con deuda | deudor@gmail.com | 1234 | Ve su deuda, puede pagar o darse de baja |
| Cliente no socio | cliente@gmail.com | 1234 | Compra online, puede asociarse |

Los clientes generados tienen contraseña `1234`. También podés crear una cuenta nueva desde **Registrarse**.

### Envío real de correos (opcional)

Sin configurar nada, el PDF se descarga y el envío figura como **simulado**. Para que llegue de verdad:

1. Copiá `.env.example` como `.env` y completá tu Gmail y una *contraseña de aplicación* de Google.
2. Ejecutá `npm install` (instala `nodemailer`).
3. Reiniciá con `node server.js`. La consola indica “Email: envío real con Gmail”.

---

## Recorrido sugerido para la presentación

1. **Inicio**: el telón se abre; próximas funciones y beneficio de socios.
2. **Cartelera**: destacadas, buscador, filtros (género, fechas, sala, precio, con lugares) y géneros.
3. **Función**: mapa de la sala (350 plateas + 250 palcos), sectores con precio, “Elegir las mejores”.
4. **Compra online** con `socio@gmail.com`: el 30 % se aplica solo → resumen → plataforma de pagos externa (tarjeta, QR o transferencia) → tickets PDF con QR y envío por correo.
5. **Mi cuenta**: descargar, reprogramar (misma obra, mismo precio, hasta 48 h antes) o cancelar con reintegro según la anticipación.
6. **Boletería** con `admin@gmail.com`: venta presencial en el orden del BPMN. Probá con el DNI **28444555** (socio con deuda): el sistema muestra la deuda y permite cobrarla para aplicar el descuento en la misma compra.
7. **Control de ingreso**: validar el código de una entrada.
8. **Socios**: alta, cobro de cuotas, consulta de continuidad y baja.
9. **Informes**: abrí los informes en otra pestaña y hacé una venta: se recalculan en vivo. Exportá a PDF.

> Tip: con dos pestañas abiertas (una en Boletería, otra en la función online) se ve cómo las ubicaciones vendidas en un canal se ocupan al instante en el otro.

---

## Reglas de negocio implementadas

- **Descuento de socio**: 30 % si las cuotas están al día. Lo decide el sistema, no el boletero.
- **Promociones** (“Martes de Teatro” 20 %, “Preventa de Verano” 15 %): no se combinan con el descuento de socio; se aplica el beneficio mayor.
- **Cuota**: vence el día 10 de cada mes. Si cae sábado, domingo o feriado (`datos/feriados.txt`), se corre al primer día hábil. Sin días de gracia.
- **Socio con más de un período adeudado**: se le consulta si sigue. Si sigue, se calcula y cobra el total; si no, se registra la **baja con fecha**.
- **Compra online**: requiere usuario registrado y mayor de edad; cargo por servicio del 10 %; las ubicaciones se reservan 10 minutos mientras se espera el pago.
- **Reprogramación**: una vez, a otra función de la misma obra, mismo sector y mismo precio, hasta 48 h antes.
- **Cancelación**: 15 días o más → 100 %; 7 a 14 días → 50 %; menos de 7 → sin reintegro. El cargo por servicio no se reintegra.
- **Capacidad**: 5 salas de 600 ubicaciones (platea baja 1–350 y palcos en planta alta 1–250). La Sala 5 figura inhabilitada por mantenimiento.

Los parámetros se pueden cambiar en `datos/configuracion.txt`.

## Informes

| Informe | Destinatario | Nivel | Filtro |
|---|---|---|---|
| Permanencia de socios hasta que dejan de pagar | Gerencia General | Estratégico | Fecha de alta |
| Funciones más demandadas | Gerencia General | Estratégico | Fecha de venta |
| Demanda y ocupación por función | Gerencia General | Estratégico | Fecha y función |
| Recaudación por canal de venta | Gerencia Administrativa | Táctico | Fecha de venta |
| Compras de socios y no socios | Gerencia General y Socios | Táctico | Fecha de venta |

Para agregar un informe, sumá un objeto a la lista `INFORMES` en `public/js/vistas/informes.js` con su función `calcular()`.

---

## Estructura

```
server.js                 Servidor mínimo (Node nativo): sitio, archivos de datos, tiempo real y email
esquemas.js               Campos de cada archivo de datos
scripts/generar-datos.js  Datos de ejemplo (ficticios)
datos/*.txt               Un archivo por entidad, un registro por línea, campos separados por |
public/
  index.html, css/estilos.css
  js/estado.js            Carga, guardado en archivos, sesión y roles
  js/reglas.js            Reglas de negocio
  js/operaciones.js       Actividades que registran datos (ventas, pagos, cuotas, bajas…)
  js/mapa.js              Mapa de ubicaciones de la sala
  js/pdf.js               Tickets, recibos e informes en PDF
  js/vistas/              Inicio, cartelera, función, acceso, compra, cuenta, boletería, informes
  imagenes/funciones/     Imágenes de las obras (ver abajo)
  vendor/                 Chart.js, jsPDF y qrcode-generator (incluidas, funciona sin internet)
PRODUCT.md, DESIGN.md     Producto y sistema visual
```

### Formato de los archivos de datos

```
# Teatro CaPaz S.A. — archivo de socios
# Campos: id | nroSocio | tipoDoc | nroDoc | nombre | apellido | ...
S001|1001|DNI|30111222|Lucía|Fernández|3541 555010|socio@gmail.com|1984-06-15|2025-02-03|activo||
```

Al iniciar, el servidor lee todos los archivos a memoria. Cada cambio se guarda en el momento en su archivo y se avisa a todas las pestañas abiertas, que se actualizan solas.

### Imágenes de las funciones

Guardá las imágenes en `public/imagenes/funciones/` con el código de la obra: `O1.jpg` … `O8.jpg` (ver `datos/obras.txt`). Si una imagen no existe, se muestra el marco con la leyenda “Imagen no encontrada”. Para una imagen distinta en una función puntual, completá el campo `imagen` de esa función en `datos/funciones.txt`.

---

Prototipo académico: los pagos son simulados y no hay medidas de seguridad reales (las contraseñas se guardan en texto plano a propósito).
