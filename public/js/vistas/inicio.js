// Entrada principal del sitio (pantalla de persuasión): telón que se abre,
// próximas funciones y beneficio de socios.
import { db, idx, config } from '../estado.js';
import { hoyIso, precioDesde, disponibilidad } from '../reglas.js';
import { icono, esc, pesos, marcoImagen, fechaPartes, fechaMedia } from '../ui.js';

export function proximasFunciones() {
  const hoy = hoyIso();
  return (db.funciones || [])
    .filter((f) => f.estado === 'programada' && f.fecha >= hoy)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

export function render(raiz, { query }) {
  const prox = proximasFunciones();
  const destacadas = prox.slice(0, 3);
  const genero = (o) => idx.generos.get(o.generoId)?.nombre || '';
  const yaVisto = sessionStorage.getItem('capaz-telon') === '1';

  // Una obra por tarjeta, con su próxima función
  const obrasEnCartel = [];
  const vistas = new Set();
  for (const f of prox) {
    if (vistas.has(f.obraId)) continue;
    vistas.add(f.obraId);
    obrasEnCartel.push({ obra: idx.obras.get(f.obraId), funcion: f, fechas: prox.filter((x) => x.obraId === f.obraId).length });
  }

  raiz.innerHTML = `
  <section class="escenario ${yaVisto ? 'abierto sin-transicion' : ''}" id="escenario" aria-labelledby="titulo-escenario">
    <div class="escenario__haz"></div>
    <div class="cenefa" aria-hidden="true"></div>
    <div class="telon telon--izq" aria-hidden="true"></div>
    <div class="telon telon--der" aria-hidden="true"></div>
    <div class="escenario__contenido">
      <div class="escenario__placa entra"><img src="img/teatro_capaz_logo.png" alt="Teatro CaPaz S.A., Villa Carlos Paz"></div>
      <h1 class="entra" id="titulo-escenario">Esta temporada,<br>la sierra tiene <em>telón</em>.</h1>
      <p class="escenario__bajada entra">Revista, comedia, musicales y producciones internacionales en cinco salas a pasos del lago. Elegí tu butaca en el mapa de la sala y recibí tus entradas al instante.</p>
      <div class="escenario__acciones entra">
        <a class="boton boton--oro boton--grande" href="#/cartelera">${icono('ticket')} Ver cartelera y comprar</a>
        <a class="boton boton--contorno boton--grande" href="#/?ir=socios">${icono('badge-percent')} Socios: ${config('descuentoSocio', 30)} % menos</a>
      </div>
      <nav class="marquesina entra" aria-label="Próximas funciones">
        ${destacadas
          .map((f) => {
            const o = idx.obras.get(f.obraId);
            return `<a href="#/funcion/${f.id}"><small>${esc(fechaMedia(f.fecha))} · ${f.hora} h</small><strong>${esc(o.nombre)}</strong><span>${esc(idx.salas.get(f.salaId).nombre)} · desde ${pesos(precioDesde(f.id))}</span></a>`;
          })
          .join('')}
      </nav>
    </div>
    <div class="escenario__piso"></div>
  </section>

  <section class="seccion contenedor" aria-labelledby="t-cartel">
    <div class="seccion__cab">
      <div><h2 class="titulo-seccion" id="t-cartel">En cartel esta temporada</h2>
      <p class="bajada">${obrasEnCartel.length} espectáculos con funciones hasta febrero. Cada obra puede tener varias fechas y salas.</p></div>
      <a class="boton boton--contorno" href="#/cartelera">Buscar funciones ${icono('arrow-right')}</a>
    </div>
    <div class="cartel">
      ${obrasEnCartel
        .map(
          ({ obra, funcion, fechas }) => `<a class="obra-tarjeta" href="#/funcion/${funcion.id}">
            ${marcoImagen(funcion.imagen || obra.imagen, obra.nombre, 'marco--poster')}
            <div><h3>${esc(obra.nombre)}</h3><p>${esc(genero(obra))} · ${fechas} ${fechas === 1 ? 'función' : 'funciones'}</p></div></a>`
        )
        .join('')}
    </div>
  </section>

  <section class="seccion contenedor" aria-labelledby="t-programa">
    <div class="seccion__cab">
      <div><h2 class="titulo-seccion" id="t-programa">Próximas funciones</h2>
      <p class="bajada">Precios por ubicación: platea baja y palcos en planta alta.</p></div>
    </div>
    <div class="programa">
      ${prox
        .slice(0, 6)
        .map((f) => {
          const o = idx.obras.get(f.obraId);
          const p = fechaPartes(f.fecha);
          const d = disponibilidad(f.id);
          return `<a class="programa__fila" href="#/funcion/${f.id}">
            <div class="programa__fecha"><b>${p.dia}</b><span>${p.semana} · ${p.mes}</span></div>
            <div class="programa__obra"><h3>${esc(o.nombre)}</h3>
              <p>${esc(genero(o))} · ${esc(idx.salas.get(f.salaId).nombre)} · ${f.hora} h · ${esc(o.director)}</p></div>
            <div class="programa__precio"><small>desde</small><strong class="num">${pesos(precioDesde(f.id))}</strong>
              ${d.libres < 120 ? `<span class="etiqueta etiqueta--alerta">Últimos ${d.libres} lugares</span>` : `<span class="etiqueta etiqueta--exito">Disponible</span>`}</div>
          </a>`;
        })
        .join('')}
    </div>
    <div class="fila mt-5"><a class="boton boton--oro" href="#/cartelera">Ver las ${prox.length} funciones</a></div>
  </section>

  <section class="seccion contenedor" id="socios" aria-labelledby="t-socios">
    <div class="banda-socios">
      <div>
        <h2 id="t-socios">Hacete socio del Teatro CaPaz</h2>
        <p>Con una cuota mensual de ${pesos(config('cuotaMensual', 12000))} y tus cuotas al día, el descuento se aplica solo en cada compra, online o en boletería.</p>
        <ul>
          <li>${icono('check')} ${config('descuentoSocio', 30)} % de descuento en todas tus entradas</li>
          <li>${icono('check')} Estado de cuenta actualizado al instante</li>
          <li>${icono('check')} Pagás tus cuotas en el teatro o desde tu cuenta</li>
        </ul>
        <div class="fila mt-5">
          <a class="boton boton--oro" href="#/mi-cuenta/socio">${icono('user-plus')} Asociarme</a>
          <a class="boton boton--contorno" href="#/registro">Crear cuenta</a>
        </div>
      </div>
      <div class="banda-socios__cifra" aria-hidden="true">${config('descuentoSocio', 30)}<span style="font-size:.4em">%</span></div>
    </div>
  </section>

  <section class="seccion contenedor" aria-label="El teatro en números">
    <div class="datos-teatro">
      <div><b>5</b><span>salas de igual capacidad</span></div>
      <div><b>600</b><span>ubicaciones por sala</span></div>
      <div><b>350</b><span>butacas de platea baja</span></div>
      <div><b>250</b><span>palcos en planta alta</span></div>
    </div>
  </section>`;

  const escenario = raiz.querySelector('#escenario');
  if (!yaVisto) {
    setTimeout(() => {
      escenario.classList.add('abierto');
      sessionStorage.setItem('capaz-telon', '1');
    }, 350);
  }
  if (query.get('ir') === 'socios') setTimeout(() => document.getElementById('socios')?.scrollIntoView(), 50);
}
