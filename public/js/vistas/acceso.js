// Acceso único (correo y contraseña) para clientes y personal, y registro de clientes.
// El rol del usuario define a qué paneles entra. El registro valida la mayoría de edad.
import { db, iniciarSesion, guardar, nuevoId, usuarioActual } from '../estado.js';
import { edad, hoyIso } from '../reglas.js';
import { icono, esc, aviso, errorCampo, setCargando, esperar, nota } from '../ui.js';
import { ir, destinoPorRol } from '../app.js';

function arte(titulo, texto) {
  return `<div class="acceso__arte">
    <div class="escenario__placa"><img src="img/teatro_capaz_logo.png" alt="Teatro CaPaz S.A."></div>
    <div class="pila"><blockquote>${titulo}</blockquote><p>${texto}</p></div>
  </div>`;
}

function campoClave(id, etiqueta, auto) {
  return `<div class="campo"><label for="${id}">${etiqueta}</label>
    <div class="campo-clave"><input class="entrada" id="${id}" type="password" autocomplete="${auto}" required>
    <button class="boton-icono" type="button" data-ver="${id}" aria-label="Mostrar contraseña">${icono('eye')}</button></div></div>`;
}

function activarVerClave(raiz) {
  raiz.querySelectorAll('[data-ver]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = raiz.querySelector('#' + b.dataset.ver);
      const ver = i.type === 'password';
      i.type = ver ? 'text' : 'password';
      b.innerHTML = icono(ver ? 'eye-off' : 'eye');
      b.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    })
  );
}

function despuesDeIngresar(u) {
  const volver = sessionStorage.getItem('capaz-volver');
  sessionStorage.removeItem('capaz-volver');
  if (volver && (u.rol === 'cliente' || u.rol === 'admin')) return ir(volver);
  ir(destinoPorRol(u));
}

export function render(raiz, { args }) {
  if (args[0] === 'registro') return registro(raiz);
  const u = usuarioActual();
  const carrito = sessionStorage.getItem('capaz-carrito');
  raiz.innerHTML = `
  <section class="acceso">
    ${arte('Que se abra el <em>telón</em>.', 'Una sola cuenta para comprar entradas, seguir tus cuotas de socio y, si sos parte del equipo del teatro, entrar a boletería o a los informes.')}
    <form class="acceso__form" id="form" novalidate>
      <div class="pila-chica"><h1>Ingresar</h1>
      <p class="texto-2">Con el correo y la contraseña de tu cuenta.</p></div>
      ${u ? nota(`Ya iniciaste sesión como <b>${esc(u.email)}</b>. Si ingresás con otra cuenta, se reemplaza la sesión.`, 'info') : ''}
      ${carrito && !u ? nota('Tus ubicaciones quedaron reservadas en esta pantalla. Al ingresar seguís con la compra.', 'exito') : ''}
      <div class="campo"><label for="email">Correo electrónico</label>
        <input class="entrada" id="email" type="email" autocomplete="email" required placeholder="nombre@gmail.com"></div>
      ${campoClave('password', 'Contraseña', 'current-password')}
      <button class="boton boton--oro boton--grande boton--bloque" type="submit" id="entrar">${icono('log-in')} Ingresar</button>
      <p class="texto-2 pequeno" style="text-align:center">¿No tenés cuenta? <a href="#/registro">Registrate</a> para comprar online.</p>
    </form>
  </section>`;
  activarVerClave(raiz);
  const form = raiz.querySelector('#form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('#email');
    const pass = form.querySelector('#password');
    errorCampo(email, '');
    errorCampo(pass, '');
    if (!email.value.trim()) return errorCampo(email, 'Ingresá tu correo.'), email.focus();
    if (!pass.value) return errorCampo(pass, 'Ingresá tu contraseña.'), pass.focus();
    const btn = form.querySelector('#entrar');
    setCargando(btn, true, 'Validando…');
    await esperar(450);
    const r = iniciarSesion(email.value, pass.value);
    setCargando(btn, false);
    if (!r.ok) {
      const campo = r.campo === 'email' ? email : pass;
      errorCampo(campo, r.mensaje);
      return campo.focus();
    }
    aviso(`Hola, ${r.usuario.nombre}`, 'Sesión iniciada.', 'exito');
    despuesDeIngresar(r.usuario);
  });
}

function registro(raiz) {
  const maxNac = hoyIso();
  raiz.innerHTML = `
  <section class="acceso acceso--registro">
    ${arte('Tu butaca, <em>a un clic</em>.', 'Para comprar online pedimos tus datos personales y validamos que seas mayor de edad, como establece el teatro.')}
    <form class="acceso__form" id="form" novalidate>
      <div class="pila-chica"><h1>Crear cuenta</h1>
      <p class="texto-2">Todos los campos son obligatorios.</p></div>
      <div class="fila-campos">
        <div class="campo"><label for="tipoDoc">Tipo de documento</label>
          <select class="entrada" id="tipoDoc"><option>DNI</option><option>Pasaporte</option><option>LE</option><option>LC</option></select></div>
        <div class="campo"><label for="nroDoc">Número de documento</label><input class="entrada" id="nroDoc" inputmode="numeric" autocomplete="off" placeholder="30111222"></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="nombre">Nombre</label><input class="entrada" id="nombre" autocomplete="given-name"></div>
        <div class="campo"><label for="apellido">Apellido</label><input class="entrada" id="apellido" autocomplete="family-name"></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="fechaNac">Fecha de nacimiento</label><input class="entrada" id="fechaNac" type="date" max="${maxNac}">
          <span class="ayuda">Tenés que ser mayor de 18 años.</span></div>
        <div class="campo"><label for="telefono">Teléfono</label><input class="entrada" id="telefono" type="tel" autocomplete="tel" placeholder="3541 555010"></div>
      </div>
      <div class="campo"><label for="email">Correo electrónico</label><input class="entrada" id="email" type="email" autocomplete="email" placeholder="nombre@gmail.com">
        <span class="ayuda">Ahí te enviamos las entradas en PDF.</span></div>
      <div class="fila-campos">
        ${campoClave('password', 'Contraseña', 'new-password')}
        ${campoClave('password2', 'Repetir contraseña', 'new-password')}
      </div>
      <button class="boton boton--oro boton--grande boton--bloque" type="submit" id="crear">${icono('user-plus')} Crear cuenta</button>
      <p class="texto-2 pequeno" style="text-align:center">¿Ya tenés cuenta? <a href="#/ingresar">Ingresá</a></p>
    </form>
  </section>`;
  activarVerClave(raiz);
  const form = raiz.querySelector('#form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const $ = (id) => form.querySelector('#' + id);
    const campos = ['nroDoc', 'nombre', 'apellido', 'fechaNac', 'telefono', 'email', 'password', 'password2'];
    campos.forEach((c) => errorCampo($(c), ''));
    let primero = null;
    const marcar = (c, m) => {
      errorCampo($(c), m);
      primero = primero || $(c);
    };
    for (const c of campos) if (!$(c).value.trim()) marcar(c, 'Completá este dato.');
    const doc = $('nroDoc').value.replace(/\D/g, '');
    if ($('nroDoc').value && (doc.length < 7 || doc.length > 9)) marcar('nroDoc', 'El documento debe tener entre 7 y 9 dígitos.');
    if (db.usuarios.some((u) => u.nroDoc === doc && doc)) marcar('nroDoc', 'Ya existe una cuenta con ese documento.');
    const email = $('email').value.trim().toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) marcar('email', 'Revisá el formato del correo.');
    if (db.usuarios.some((u) => u.email.toLowerCase() === email)) marcar('email', 'Ese correo ya está registrado. Podés ingresar.');
    if ($('password').value && $('password').value.length < 4) marcar('password', 'Usá al menos 4 caracteres.');
    if ($('password2').value && $('password').value !== $('password2').value) marcar('password2', 'Las contraseñas no coinciden.');
    if ($('fechaNac').value && edad($('fechaNac').value) < 18)
      marcar('fechaNac', `Tenés ${edad($('fechaNac').value)} años. La compra online es solo para mayores de edad.`);
    if (primero) return primero.focus();

    const btn = $('crear');
    setCargando(btn, true, 'Registrando…');
    const nuevo = {
      id: nuevoId('usuarios', 'U', 3), email, password: $('password').value, rol: 'cliente', tipoDoc: $('tipoDoc').value, nroDoc: doc,
      nombre: $('nombre').value.trim(), apellido: $('apellido').value.trim(), telefono: $('telefono').value.trim(),
      fechaNac: $('fechaNac').value, fechaAlta: hoyIso(),
    };
    db.usuarios.push(nuevo);
    try {
      await guardar(['usuarios'], 'registro de usuario');
    } catch {
      db.usuarios.pop();
      setCargando(btn, false);
      return aviso('No se pudo registrar', 'El servidor no respondió. Probá de nuevo.', 'error');
    }
    iniciarSesion(email, nuevo.password);
    aviso('Cuenta creada', `Bienvenido/a, ${nuevo.nombre}. Ya podés comprar entradas.`, 'exito');
    despuesDeIngresar(nuevo);
  });
}
