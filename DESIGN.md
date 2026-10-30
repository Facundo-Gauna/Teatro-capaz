---
name: Telón y oro
description: Sistema visual del Teatro CaPaz — violeta ciruela del logo, dorado de las máscaras y crema de programa de mano.
colors:
  plum-night: '#120b17'
  plum-surface: '#1f1428'
  plum-velvet: '#7a3d9e'
  plum-deep: '#3a1650'
  mask-gold: '#d9ad55'
  mask-gold-light: '#efcd83'
  program-cream: '#f4ecdd'
  cream-paper: '#f6efe3'
  ink: '#22132b'
typography:
  display: { fontFamily: 'Bodoni Moda', fontWeight: 600 }
  body: { fontFamily: 'Manrope', fontSize: 16px, lineHeight: 1.55 }
rounded: { sm: 6px, md: 10px, lg: 16px, xl: 24px, pill: 999px }
spacing: { base: 4px, scale: [4, 8, 12, 16, 24, 32, 48, 64, 96] }
---

## Overview
La sala a oscuras con el telón violeta y la luz dorada del escenario. Dos registros:
- **Persuasión** (inicio, cartelera): un único gesto autoral — el telón que se abre una vez por sesión —, tipografía Bodoni grande y el programa de mano como lista de funciones.
- **Trabajo** (compra, boletería, informes): claridad sobre adorno. El dorado queda reservado para la acción principal, la selección y el estado.

## Colors
- Fondo oscuro ciruela (`plum-night`) y superficies apenas más claras; en modo claro, papel crema (`cream-paper`) con tinta violeta (`ink`).
- `mask-gold`: botón principal, ubicación elegida, indicador de foco y pestaña activa. Nunca decorativo.
- Cada sector de la sala tiene su color (definido en `datos/sectores.txt`) y se usa igual en el mapa y en la lista de precios.
- Estados: éxito verde, alerta ámbar, error rojo; siempre acompañados de texto o forma (las ocupadas son más chicas y llevan un punto).
- La plataforma de pagos usa a propósito otra identidad (azul y blanco) porque es externa al sistema.

## Typography
Bodoni Moda para títulos, nombres de obras y cifras destacadas; Manrope para la interfaz. Cifras tabulares en importes y tablas.

## Layout
Contenedor de 1200 px, gutter de 16 px en celular. Paneles operativos con menú lateral que pasa a pestañas horizontales en celular. Mapa de la sala con zoom y resumen de compra fijo a la derecha (barra inferior en celular).

## Elevation & Depth
Sombras suaves con desplazamiento solo para elementos que flotan (menús, diálogos, avisos, tarjetas al pasar el mouse).

## Components
Botón píldora (oro principal, contorno, fantasma, peligro), etiqueta de estado con punto, nota en línea, aviso flotante, diálogo con foco atrapado, marco de imagen con estado “no encontrada”, mapa de ubicaciones, pasos de compra, indicador “En vivo”.

## Do's and Don'ts
- Sí: un solo momento animado por superficie; respetar `prefers-reduced-motion`.
- Sí: informar cada paso (procesando, registrado, enviado).
- No: usar el dorado como adorno, ni el color como única señal.
- No: redibujar los logos.
