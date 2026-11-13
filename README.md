# Perchero · Agustín diseños personalizados

Página para clientes: un perchero animado donde se deslizan las remeras con el mouse o el dedo
(compu, iPhone y Android). Tocás una remera y se abre en grande con corte (oversize / básica),
frente y espalda, colores y botón de consulta.

Se ve en: **https://agustin23-gif.github.io/perchero-agustin/**

## Cómo agregar un diseño nuevo

1. Subí el diseño **sin fondo** (PNG o WebP transparente) a la carpeta `disenos/`.
   Ej.: `disenos/fe_esperanza.png`
2. Abrí `catalogo.json` y agregá un bloque dentro de `"disenos"`:

```json
{
 "id": "fe_esperanza",
 "nombre": "Fe y esperanza",
 "detalle": "Romanos 15:13",
 "frente": "disenos/fe_esperanza.png",
 "espalda": null,
 "cortes": ["oversize", "basica"],
 "color": "negro"
}
```

- `frente` / `espalda`: el archivo que va en cada lado (`null` si ese lado va liso).
- `color`: el color con el que aparece colgado en el perchero.
  Oversize: `negro`, `blanco`, `beige`, `marfil`, `verde_musgo`. Básica: ver la lista en `catalogo.json`.
- `etiqueta` (opcional): un cartelito en la remera del perchero, ej. `"etiqueta": "Nuevo"`.
- El orden de la lista es el orden del perchero.

La página estampa el diseño sobre la foto real de la remera, con los pliegues de la tela.
No hace falta armar mockups a mano.

## Datos de contacto

En `catalogo.json`, `"whatsapp"` lleva el número con código de país y sin `+` ni espacios
(ej. `595981123456`). Si está vacío, el botón manda a Instagram.

## Estructura

- `index.html`, `styles.css`, `app.js`: la página.
- `img/oversize/`, `img/basica/`: fotos de las remeras por color, mapa de luz (`luz_*`) y sombra.
- `disenos/`: los diseños sin fondo.
