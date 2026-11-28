/* Perchero interactivo · Agustín diseños personalizados
   Los diseños se cargan desde catalogo.json: cada diseño es un PNG/WebP sin fondo en /disenos
   y se estampa en vivo sobre la foto de la remera del color elegido. */
(() => {
  const $ = (s) => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MODALES = ['#pedido', '#carro', '#crea', '#zoom'];
  const modalAbierto = () => MODALES.some(m => { const el = document.querySelector(m); return el && !el.hidden; });
  // se vuelve a poder bajar la página cuando no queda ninguna ventana ni detalle abierto
  function libre() { if (document.querySelector('#detail').hidden && !modalAbierto()) document.body.classList.remove('quieto'); }
  let toastT = 0;
  function avisar(txt, accion) {
    const t = document.querySelector('#toast'); t.innerHTML = ''; const s = document.createElement('span'); s.textContent = txt; t.append(s);
    if (accion) { const b = document.createElement('button'); b.type = 'button'; b.textContent = accion.txt; b.onclick = () => { t.hidden = true; accion.fn(); }; t.append(b); }
    t.hidden = false; t.classList.remove('sale'); clearTimeout(toastT);
    toastT = setTimeout(() => { t.classList.add('sale'); setTimeout(() => { t.hidden = true; t.classList.remove('sale'); }, 300); }, 3200);
  }
  const ASPECTO = { oversize: 1050 / 1064, basica: 733 / 720 };
  const ESCALA_CORTE = { oversize: 1, basica: 0.84 }; // la básica se ve más angosta, como en la realidad
  const SOMBRA_PAD = { oversize: 60 / 720, basica: 60 / 720 };

  let CFG, DIS = [], lista = [], filtro = 'todo';
  const TU_DISENO = { id: 'tu_diseno', pedido: true, nombre: '¿Tenés tu propio diseño?', cortes: ['oversize', 'basica'], color: 'blanco', etiqueta: 'Tu idea' };

  // remera lisa con un recuadro punteado "tu diseño acá"
  function marcarHueco(canvas, corte) {
    const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
    const e = CFG.cortes[corte].estampa.frente;
    const w = W * e.ancho, h = Math.min(H * e.alto * 0.62, w * 1.05), x = W * e.cx - w / 2, y = H * (e.top + 0.03);
    c.save();
    c.strokeStyle = '#FF7A00'; c.lineWidth = Math.max(2, W * 0.006); c.setLineDash([W * 0.018, W * 0.012]);
    c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, W * 0.02) : c.rect(x, y, w, h); c.stroke();
    c.setLineDash([]); c.fillStyle = '#FF7A00'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const f = w * 0.15;
    c.font = `800 ${f}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    c.fillText('TU', W * e.cx, y + h * 0.3); c.fillText('DISEÑO', W * e.cx, y + h * 0.5); c.fillText('ACÁ', W * e.cx, y + h * 0.7);
    c.lineWidth = Math.max(1.5, W * 0.004); const s = f * 0.32, sx = x + w - s * 1.2, sy = y + s * 1.2;   // destello
    c.beginPath(); c.moveTo(sx - s, sy); c.lineTo(sx + s, sy); c.moveTo(sx, sy - s); c.lineTo(sx, sy + s); c.stroke();
    c.restore();
  }

  /* ---------- imágenes y composición ---------- */
  const imgs = new Map();
  function img(src) {
    if (!imgs.has(src)) imgs.set(src, new Promise((ok, ko) => {
      const i = new Image(); i.decoding = 'async';
      i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo cargar ' + src)); i.src = src;
    }));
    return imgs.get(src);
  }
  async function componer(canvas, d, corte, color, lado, maxW, agrandar) {
    const base = await img(`img/${corte}/${lado}_${color}.webp`);
    const W = Math.round(agrandar ? maxW : Math.min(maxW, base.naturalWidth));   // agrandar: para el zoom (el diseño queda nítido)
    const H = Math.round(W * base.naturalHeight / base.naturalWidth);
    const src = lado === 'frente' ? d.frente : d.espalda;
    let est = null;
    if (src) {
      const [dis, luz] = await Promise.all([img(src), img(`img/${corte}/luz_${lado}.webp`)]);
      // medidas de estampa del corte, con ajuste propio del diseño si lo tiene (ej. un logo chico en el pecho)
      const e = Object.assign({}, CFG.cortes[corte].estampa[lado] || CFG.cortes[corte].estampa.frente, ((d.estampa || {})[corte] || {})[lado]);
      const ancho = dis.naturalWidth / dis.naturalHeight > 2.2;
      const r = Math.min(W * (ancho ? e.anchoAncho : e.ancho) / dis.naturalWidth, H * e.alto / dis.naturalHeight);
      const dw = dis.naturalWidth * r, dh = dis.naturalHeight * r;
      const x = W * e.cx - dw / 2, y = H * (ancho ? e.topAncho : e.top);
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d'); o.imageSmoothingQuality = 'high';
      o.drawImage(dis, x, y, dw, dh);
      o.globalCompositeOperation = 'multiply'; o.drawImage(luz, 0, 0, W, H);   // pliegues y luz de la tela
      o.globalCompositeOperation = 'destination-in'; o.drawImage(dis, x, y, dw, dh);
      est = off; canvas.caja = { x, y, w: dw, h: dh };
    }
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d'); c.imageSmoothingQuality = 'high';
    c.clearRect(0, 0, W, H);
    c.drawImage(base, 0, 0, W, H);
    if (est) { c.globalAlpha = 0.97; c.drawImage(est, 0, 0); c.globalAlpha = 1; }
  }

  /* ---------- percha de madera + gancho ---------- */
  // Medidas de la percha tomadas de la foto de la remera básica (relativas al ancho de la básica).
  const PERCHA = { ancho: 0.2598, izq: -0.1371, arriba: -0.096, prop: 186 / 379 };
  // Gancho visto de frente, como en un perchero real: un alambre recto que sube desde la percha
  // y se curva por encima de la barra.
  function gancho(alto, rc, rodH) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    const ancho = rodH * 2.6;
    s.setAttribute('viewBox', `0 0 ${ancho} ${alto}`); s.setAttribute('class', 'hook');
    s.style.height = alto + 'px'; s.style.width = ancho + 'px';
    const cx = ancho / 2 - rodH * 0.35, r = rodH * 0.62, top = rc - r, grosor = Math.max(2, rodH * 0.26);
    s.innerHTML = `<defs><linearGradient id="gm" x1="0" x2="1"><stop offset="0" stop-color="#55534F"/><stop offset=".5" stop-color="#C9C7C2"/><stop offset="1" stop-color="#6E6C68"/></linearGradient></defs>
      <path d="M${cx} ${alto} V${rc + r * 0.2} C${cx} ${top - r * 0.9} ${cx + r * 1.7} ${top - r * 0.9} ${cx + r * 1.55} ${rc + r * 0.35}" fill="none" stroke="url(#gm)" stroke-width="${grosor}" stroke-linecap="round"/>`;
    return s;
  }
  function geometria(w, corte) {
    const swB = w * ESCALA_CORTE.basica;
    const rodH = Math.max(8, Math.min(14, w * 0.036));
    const rc = rodH * 1.1;                            // centro de la barra, desde arriba de la prenda
    const hookH = rc + rodH * 1.7;                    // gancho corto: la percha queda justo debajo de la barra
    const sw = w * ESCALA_CORTE[corte];
    const sh = sw * ASPECTO[corte];
    const shirtTop = hookH - PERCHA.arriba * swB;
    return { swB, hookH, rodH, rc, sw, sh, shirtTop, alto: shirtTop + sh };
  }
  // Arma la percha + remera. Devuelve el nodo .swing y el canvas.
  // Oscurece un color hex (k entre 0 y 1).
  function oscurecer(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(v * (1 - k));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  // grosor: { capas, hex, color } → capas de tela detrás del frente, para que de costado tenga volumen.
  function prenda(w, corte, grosor) {
    const g = geometria(w, corte);
    const swing = document.createElement('div'); swing.className = 'swing';
    swing.style.width = w + 'px'; swing.style.height = g.alto + 'px';
    swing.style.setProperty('--pivot', g.rc + 'px');
    swing.appendChild(gancho(g.hookH + 2, g.rc, g.rodH));
    const madera = new Image(); madera.className = 'madera'; madera.alt = ''; madera.src = 'img/percha.webp';
    const mw = PERCHA.ancho * g.swB;
    madera.style.width = mw + 'px'; madera.style.left = (w / 2 + PERCHA.izq * g.swB) + 'px'; madera.style.top = g.hookH + 'px';
    swing.appendChild(madera);
    const shirt = document.createElement('div'); shirt.className = 'shirt';
    shirt.style.width = g.sw + 'px'; shirt.style.top = g.shirtTop + 'px';
    const pad = SOMBRA_PAD[corte];
    const sombra = new Image(); sombra.className = 'sombra'; sombra.alt = ''; sombra.src = `img/${corte}/sombra.webp`;
    sombra.style.width = g.sw * (1 + 2 * pad) + 'px';
    sombra.style.left = (-pad * g.sw + g.sw * 0.06) + 'px'; sombra.style.top = (-pad * g.sw + g.sw * 0.07) + 'px';
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(g.sw); canvas.height = Math.round(g.sh);
    shirt.append(sombra);
    if (grosor && grosor.capas) {
      const prof = g.sw * 0.075;                       // profundidad de la remera colgada (pecho + espalda + percha)
      const url = `url(img/${corte}/frente_${grosor.color}.webp)`;
      for (let k = grosor.capas; k >= 1; k--) {
        const c = document.createElement('div'); c.className = 'capa';
        c.style.width = g.sw + 'px'; c.style.height = g.sh + 'px';
        c.style.background = oscurecer(grosor.hex, 0.1 + 0.22 * (k / grosor.capas));
        c.style.webkitMaskImage = c.style.maskImage = url;
        // las capas del fondo se encogen un poco: la tela se cierra hacia la espalda
        const esc = 1 - 0.012 * (k / grosor.capas);
        c.style.transform = `translateZ(${-prof * k / grosor.capas}px) scale(${esc}, ${1 - 0.01 * k / grosor.capas})`;
        shirt.appendChild(c);
      }
    }
    shirt.append(canvas); swing.appendChild(shirt);
    return { swing, canvas, hookH: g.hookH, sw: g.sw, shirt, g };
  }
  /* ---------- péndulo ---------- */
  const pend = () => ({ a: 0, w: 0 });
  function pasoPendulo(p, dt, empuje) {
    p.w += (-55 * p.a - 4.2 * p.w + empuje) * dt;
    p.a += p.w * dt;
    if (p.a > 16) { p.a = 16; p.w *= -0.3; } if (p.a < -16) { p.a = -16; p.w *= -0.3; }
    return Math.abs(p.a) > 0.02 || Math.abs(p.w) > 0.05;
  }

  /* ---------- perchero ---------- */
  // Como en una tienda: las remeras cuelgan de costado y la que señalás (o la del centro, en el celu)
  // gira y se pone de frente, abriéndose lugar entre las demás.
  const rack = $('#rack'), track = $('#track');
  let topOff = 0, items = [], W = 0, S = 0, E = 0, x = 0, v = 0, vPrev = 0, minX = 0, maxX = 0, viewW = 0;
  let drag = null, movido = false, rafOn = false, last = 0, hoverIdx = -1, activo = 0;
  const GIRO = 66; // grados de las remeras que están de costado

  function corteDe(d) { return CFG.cortes[filtro] && d.cortes.includes(filtro) ? filtro : d.cortes[0]; }
  // lado que se muestra primero: el que tiene el diseño (la colección Salmos y Romanos va en la espalda)
  function ladoDe(d) { return d.lado || (!d.frente && d.espalda ? 'espalda' : 'frente'); }
  // colores permitidos de un diseño en un corte (algunas colecciones van solo en negro)
  function coloresDe(d, corte) { const cs = CFG.cortes[corte].colores; return d.colores ? cs.filter(c => d.colores.includes(c.id)) : cs; }
  function colorDe(d, corte) {
    const ids = coloresDe(d, corte).map(c => c.id);
    const propio = (d.colorPor || {})[corte];   // color inicial distinto según el corte
    if (ids.includes(propio)) return propio;
    if (ids.includes(d.color)) return d.color;
    const parecido = (CFG.parecidos || {})[d.color];   // ej.: verde musgo (oversize) → verde botella (básica)
    return ids.includes(parecido) ? parecido : (ids.includes('blanco') ? 'blanco' : ids[0]);
  }

  // Mientras se ve la portada, las remeras del perchero se preparan de a una y sin apuro,
  // para que el celular dedique la fuerza a la animación de la portada.
  let pendientes = [], goteando = false;
  function luego(fn) { if (document.body.classList.contains('con-portada')) pendientes.push(fn); else fn(); }
  function soltarPendientes() { const p = pendientes; pendientes = []; p.forEach(fn => fn()); }
  async function goteo() {
    if (goteando) return; goteando = true;
    while (pendientes.length && document.body.classList.contains('con-portada')) {
      await pendientes.shift()();
      await new Promise(ok => (window.requestIdleCallback ? requestIdleCallback(ok, { timeout: 900 }) : setTimeout(ok, 250)));
    }
    goteando = false;
  }
  function armarPerchero() {
    // las colecciones (ej. Salmos y Romanos) van aparte: solo aparecen con su propio botón
    const esColeccion = DIS.some(d => d.coleccion === filtro);
    lista = DIS.filter(d => esColeccion ? d.coleccion === filtro : !d.coleccion && (filtro === 'todo' || d.cortes.includes(filtro)));
    if (!esColeccion) lista.push(TU_DISENO);   // al final: remera lisa para pedir un diseño propio
    const h = rack.clientHeight; viewW = rack.clientWidth;
    const g1 = { alto: geometria(300, 'oversize').alto / 300 }; // proporción alto/ancho
    W = Math.max(130, Math.min(360, (h - 16) / g1.alto, viewW * (viewW < 600 ? 0.62 : 0.26)));
    S = W * 0.3; E = W * 0.86;
    const g = geometria(W, 'oversize');
    topOff = Math.max(6, (h - g.alto) * 0.4);
    rack.style.setProperty('--rod-y', (topOff + g.rc - g.rodH / 2) + 'px');
    rack.style.setProperty('--rod-h', g.rodH + 'px');
    track.innerHTML = ''; items = [];
    lista.forEach((d, i) => {
      const corte = corteDe(d), color = colorDe(d, corte);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item';
      b.setAttribute('aria-label', `${d.nombre}, corte ${CFG.cortes[corte].nombre}. Ver detalle`);
      const hex = (CFG.cortes[corte].colores.find(c => c.id === color) || {}).hex || '#cccccc';
      const { swing, canvas, shirt } = prenda(W, corte, { capas: 0, hex, color }); // sin capas de grosor (Agustín prefirió sin volumen)
      b.style.width = W + 'px'; b.appendChild(swing); track.appendChild(b);
      if (d.etiqueta) { const t = document.createElement('span'); t.className = 'etiqueta'; t.textContent = d.etiqueta; shirt.appendChild(t); }
      luego(() => componer(canvas, d, corte, color, ladoDe(d), Math.min(1100, Math.ceil(W * ESCALA_CORTE[corte] * Math.max(2, devicePixelRatio || 1)))).then(() => { if (d.pedido) marcarHueco(canvas, corte); }).catch(console.warn));
      const it = { el: b, swing, d, corte, color, i, p: pend(), o: 0, cx: 0 };
      if (d.pedido) { b.classList.add('item-pedido'); b.setAttribute('aria-label', 'Pedí una remera con tu propio diseño. Ver cómo pedir'); }
      b.addEventListener('click', (e) => { if (movido) { e.preventDefault(); return; } abrir(i); });
      canvas.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !drag && hoverIdx !== i) { hoverIdx = i; it.p.w += 30; kick(); } });
      b.addEventListener('focus', () => { centrar(i); });
      items.push(it);
    });
    const n = lista.length;
    maxX = viewW / 2 - (S + E) / 2;
    minX = viewW / 2 - ((n - 1) * S + (S + E) / 2);
    if (!armado) { activo = Math.min(n - 1, viewW < 600 ? 1 : Math.floor(n / 2) > 3 ? 3 : 0); x = viewW / 2 - (activo * S + (S + E) / 2) + 260; v = 0; }
    x = Math.min(maxX + 300, Math.max(minX - 300, x));
    items.forEach((it, k) => { it.o = k === activo ? 1 : 0; it.p.a = reduce ? 0 : (k % 2 ? 5 : -5); });
    armado = true;
    kick();
  }
  let armado = false;
  rack.addEventListener('pointerleave', () => { hoverIdx = -1; kick(); });

  // posición del centro de cada remera según cuánto está abierta cada una
  function layout() {
    let acc = x;
    for (const it of items) { const ancho = S + E * it.o; it.cx = acc + ancho / 2; acc += ancho; }
  }
  function centrar(i) {
    hoverIdx = -1; activo = i;
    const objetivo = viewW / 2 - (i * S + (S + E) / 2);
    v = (objetivo - x) * 5; kick();
  }

  function kick() { if (!rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000); last = t;
    let vivo = false;
    layout();
    // cuál remera está de frente: la señalada con el mouse o la más cercana al centro
    if (hoverIdx >= 0) activo = hoverIdx;
    else if (!drag || drag.h) {
      let mejor = 1e9;
      for (const it of items) { const dd = Math.abs(it.cx - viewW / 2); if (dd < mejor) { mejor = dd; activo = it.i; } }
    }
    if (!drag) {
      x += v * dt;
      v *= Math.pow(0.05, dt);                                 // inercia
      if (x > maxX) { v += (maxX - x) * 110 * dt; v *= 0.86; } // rebote suave en los bordes
      if (x < minX) { v += (minX - x) * 110 * dt; v *= 0.86; }
      // al soltar, la remera del centro se acomoda (no cuando el mouse está señalando una)
      if (hoverIdx < 0 && Math.abs(v) < 220 && items[activo]) {
        const diff = viewW / 2 - items[activo].cx;
        x += diff * Math.min(1, dt * 7);
        if (Math.abs(diff) > 0.6) vivo = true;
      }
      if (Math.abs(v) > 3) vivo = true; else v = 0;
    } else vivo = true;
    const acc = (v - vPrev) / Math.max(dt, 0.001); vPrev = v;
    layout();
    for (const it of items) {
      const meta = it.i === activo ? 1 : 0;
      it.o += (meta - it.o) * Math.min(1, dt * (reduce ? 30 : 8));
      if (Math.abs(meta - it.o) > 0.002) vivo = true; else it.o = meta;
      const lado = it.i < activo ? 1 : -1;
      const ry = (1 - it.o) * GIRO * lado;
      const empuje = reduce ? 0 : Math.max(-700, Math.min(700, -acc * 0.04 - v * 0.015));
      if (pasoPendulo(it.p, dt, empuje)) vivo = true;
      // Sin 3D real: Safari en iPhone dibuja borrosas las capas 3D. El giro de costado se simula
      // en 2D (se angosta y se inclina un poco), y la remera de frente queda sin ninguna escala.
      const x = (it.cx - W / 2).toFixed(1);
      if (Math.abs(ry) < 0.4) it.el.style.transform = `translate(${x}px,${topOff}px)`;
      else {
        const sx = Math.max(0.12, Math.cos(ry * Math.PI / 180));
        it.el.style.transform = `translate(${x}px,${topOff}px) skewY(${(-lado * (1 - it.o) * 6).toFixed(2)}deg) scaleX(${sx.toFixed(3)})`;
      }
      it.el.style.zIndex = 500 - Math.abs(it.i - activo) * 2 + Math.round(it.o);
      it.swing.style.transform = `rotate(${it.p.a}deg)`;
      it.el.classList.toggle('frente', it.o > 0.5);
    }
    if (items[activo]) $('#capName').textContent = items[activo].d.nombre;
    if (items[activo] && detail.hidden) Cielo.tono(hexDe(items[activo].corte, items[activo].color));
    if (vivo) requestAnimationFrame(loop); else rafOn = false;
  }
  rack.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x0: e.clientX, y0: e.clientY, xs: x, t: performance.now(), lx: e.clientX, lt: performance.now(), id: e.pointerId, h: null };
    movido = false; kick();
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.h === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) drag.h = Math.abs(dx) > Math.abs(dy);
    if (!drag.h) return;
    movido = true; rack.classList.add('drag');
    let nx = drag.xs + dx;
    if (nx > maxX) nx = maxX + (nx - maxX) * 0.35;
    if (nx < minX) nx = minX + (nx - minX) * 0.35;
    const now = performance.now(), dtm = Math.max(1, now - drag.lt);
    v = v * 0.4 + ((e.clientX - drag.lx) / dtm * 1000) * 0.6;
    drag.lx = e.clientX; drag.lt = now; x = nx;
  });
  const soltar = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    if (performance.now() - drag.lt > 90) v = 0;
    drag = null; rack.classList.remove('drag'); kick();
    setTimeout(() => { movido = false; }, 0);
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
  rack.addEventListener('wheel', (e) => {
    const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    const d = vertical ? e.deltaY : e.deltaX;
    if (minX === maxX) return;
    // con la rueda vertical: si el perchero ya llegó al final (o la página está bajada), se deja bajar la página
    if (vertical && (window.scrollY > 2 || (d > 0 && x <= minX + 1) || (d < 0 && x >= maxX - 1))) return;
    e.preventDefault(); x -= d; x = Math.min(maxX + 40, Math.max(minX - 40, x)); v = -d * 18; kick();
  }, { passive: false });
  rack.addEventListener('keydown', (e) => {
    const i = items.findIndex(it => it.el === document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowRight' && items[i + 1]) { items[i + 1].el.focus(); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && items[i - 1]) { items[i - 1].el.focus(); e.preventDefault(); }
  });

  document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    filtro = b.dataset.f;
    Cielo.tema(filtro === 'doomsday' ? 'doom' : null);
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b ? 'true' : 'false'));
    armado = false; armarPerchero();
  }));

  /* ---------- detalle ---------- */
  const stage = $('#stage'), detail = $('#detail'), detFig = $('#detFig'), detView = $('#detView');
  let sel = null, fig = null, figP = pend(), figRaf = false;

  function animFig(t0) {
    let lt = t0;
    const f = (t) => {
      const dt = Math.min(0.033, (t - lt) / 1000); lt = t;
      const vivo = pasoPendulo(figP, dt, 0);
      if (fig) fig.swing.style.transform = `rotate(${figP.a}deg)`;
      if (vivo && !detail.hidden) requestAnimationFrame(f); else figRaf = false;
    };
    if (!figRaf) { figRaf = true; requestAnimationFrame(f); }
  }
  function empujar(f) { if (reduce) return; figP.w += f; animFig(performance.now()); }

  function medidasFig(corte) {
    const vh = detView.clientHeight, vw = detView.clientWidth;
    const flechas = vw < 600 ? 84 : 140;
    let w = Math.min(520, (vh * 0.98) / (geometria(400, corte).alto / 400), vw - flechas);
    return Math.max(120, w);
  }
  async function pintarFig(dir = 0) {
    const d = lista[sel.i];
    const w = medidasFig(sel.corte);
    const nuevo = prenda(w, sel.corte);
    await componer(nuevo.canvas, d, sel.corte, sel.color, sel.lado, Math.round(w * (devicePixelRatio > 1 ? 2 : 1.4))).catch(console.warn);
    detFig.innerHTML = ''; detFig.appendChild(nuevo.swing);
    detFig.style.width = w + 'px'; detFig.style.marginLeft = (-w / 2) + 'px';
    detView.style.setProperty('--rod-y', (nuevo.g.rc - nuevo.g.rodH / 2) + 'px');
    detView.style.setProperty('--rod-h', nuevo.g.rodH + 'px');
    fig = nuevo;
    if (dir && !reduce) nuevo.swing.animate([{ transform: `translateX(${dir * 60}%) rotate(${dir * -10}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  function textos() {
    const d = lista[sel.i], cfgC = CFG.cortes[sel.corte];
    $('#detName').textContent = d.nombre;
    $('#detSub').textContent = d.detalle || '';
    $('#count').textContent = `${String(sel.i + 1).padStart(2, '0')} / ${String(lista.length).padStart(2, '0')}`;
    // corte
    const sc = $('#segCorte'); sc.innerHTML = '';
    Object.entries(CFG.cortes).forEach(([id, c]) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = c.nombre;
      b.setAttribute('aria-pressed', id === sel.corte ? 'true' : 'false');
      b.disabled = !d.cortes.includes(id);
      b.onclick = () => { if (id === sel.corte) return; sel.corte = id; sel.color = colorDe({ color: sel.color, colores: d.colores }, id); if (!CFG.cortes[id].lados.includes(sel.lado)) sel.lado = 'frente'; textos(); pintarFig().then(() => empujar(60)); };
      sc.appendChild(b);
    });
    // lado
    const sl = $('#segLado'); sl.innerHTML = '';
    ['frente', 'espalda'].forEach(l => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = l === 'frente' ? 'Frente' : 'Espalda';
      b.setAttribute('aria-pressed', l === sel.lado ? 'true' : 'false');
      b.disabled = !cfgC.lados.includes(l);
      if (b.disabled) b.title = 'Foto de espalda próximamente';
      b.onclick = () => girar(l);
      sl.appendChild(b);
    });
    // colores
    const cs = $('#colores'); cs.innerHTML = '';
    coloresDe(d, sel.corte).forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tag';
      b.style.setProperty('--c', c.hex); b.setAttribute('aria-label', c.nombre); b.title = c.nombre;
      b.setAttribute('aria-pressed', c.id === sel.color ? 'true' : 'false');
      b.onclick = () => { sel.color = c.id; textos(); pintarFig().then(() => empujar(45)); };
      cs.appendChild(b);
      if (c.id === sel.color) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'center' }));
    });
    const col = cfgC.colores.find(c => c.id === sel.color);
    if (col) Cielo.tono(col.hex);
    $('#colorName').textContent = `Color: ${col ? col.nombre : ''}`;
    // contacto
    const msg = `Hola Agustín! Me interesa la remera "${d.nombre}" en corte ${cfgC.nombre}, color ${col ? col.nombre : ''}.`;
    $('#cta').href = CFG.whatsapp ? `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}` : `https://ig.me/m/${CFG.instagram}`;
  }
  $('#detAgregar').onclick = () => {
    if (!sel) return;
    const d = lista[sel.i];
    Carro.agregar({ id: d.id, nombre: d.nombre, corte: sel.corte, color: sel.color, lado: sel.lado }, d, $('#detAgregar'));
  };
  $('#detCompartir').onclick = async () => {
    if (!sel) return;
    const d = lista[sel.i], url = location.origin + location.pathname + '#' + d.id.replace(/_/g, '-');
    try {
      if (navigator.share) { await navigator.share({ title: d.nombre, text: `Mirá esta remera: ${d.nombre}`, url }); return; }
      await navigator.clipboard.writeText(url); avisar('Link copiado');
    } catch (e) { if (e && e.name !== 'AbortError') avisar('No se pudo compartir'); }
  };

  async function girar(l) {
    if (l === sel.lado) return;
    sel.lado = l; textos();
    if (reduce || !fig) return pintarFig();
    await fig.swing.animate([{ transform: 'perspective(900px) rotateY(0)' }, { transform: 'perspective(900px) rotateY(90deg)' }], { duration: 220, easing: 'ease-in' }).finished;
    await pintarFig();
    fig.swing.animate([{ transform: 'perspective(900px) rotateY(-90deg)' }, { transform: 'perspective(900px) rotateY(0)' }], { duration: 260, easing: 'ease-out' });
  }

  async function abrir(i) {
    const d = lista[i], it = items[i];
    if (d.pedido) return Crea.abrir();
    if (window.scrollY > 0) window.scrollTo(0, 0);
    document.body.classList.add('quieto');
    sel = { i, corte: it ? it.corte : d.cortes[0], color: it ? it.color : d.color, lado: ladoDe(d) };
    const desde = it ? it.el.querySelector('canvas').getBoundingClientRect() : null;
    detail.hidden = false; stage.classList.add('open');
    textos(); await pintarFig();
    figP = pend(); figP.a = reduce ? 0 : -7; animFig(performance.now());
    if (desde && !reduce) {
      const hasta = fig.canvas.getBoundingClientRect();
      const s = desde.width / hasta.width;
      fig.swing.animate([
        { transform: `translate(${desde.left - hasta.left}px, ${desde.top - hasta.top}px) scale(${s})`, transformOrigin: '0 0' },
        { transform: 'none', transformOrigin: '0 0' }], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
      detail.querySelector('.det-info').animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120, fill: 'backwards' });
    }
    try { history.replaceState(null, '', location.pathname + location.search + '#' + d.id.replace(/_/g, '-')); } catch (e) {}
    $('#detClose').focus({ preventScroll: true });
  }
  function cerrar() {
    if (detail.hidden) return;
    const i = sel ? sel.i : -1;
    detail.hidden = true; stage.classList.remove('open'); fig = null;
    libre();
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (items[i]) { centrar(i); items[i].p.w += 70; kick(); items[i].el.focus({ preventScroll: true }); }
  }
  function mover(dir) {
    if (!sel) return;
    let n = (sel.i + dir + lista.length) % lista.length;
    if (lista[n].pedido) n = (n + dir + lista.length) % lista.length;   // las flechas saltean la tarjeta "tu diseño"
    const d = lista[n];
    const corte = d.cortes.includes(sel.corte) ? sel.corte : d.cortes[0];
    sel = { i: n, corte, color: colorDe(d, corte), lado: ladoDe(d) };
    textos(); pintarFig(dir).then(() => empujar(dir * -90));
  }
  $('#prev').onclick = () => mover(-1);
  $('#next').onclick = () => mover(1);
  $('#detClose').onclick = cerrar;
  document.addEventListener('keydown', (e) => {
    if (detail.hidden || modalAbierto()) return;
    if (e.key === 'Escape') cerrar();
    if (e.key === 'ArrowRight' && !e.target.closest('.colores')) mover(1);
    if (e.key === 'ArrowLeft' && !e.target.closest('.colores')) mover(-1);
  });
  // deslizar con el dedo en el detalle
  let sw = null, movSwipe = 0;
  detView.addEventListener('pointerdown', (e) => { if (!e.target.closest('.arrow')) sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  detView.addEventListener('pointermove', (e) => { if (sw && fig && !reduce) { const dx = e.clientX - sw.x; figP.a = Math.max(-12, Math.min(12, dx / 14)); fig.swing.style.transform = `translateX(${dx * 0.25}px) rotate(${figP.a}deg)`; } });
  const finSwipe = (e) => {
    if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null; movSwipe = Math.hypot(dx, dy);
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) mover(dx < 0 ? 1 : -1);
    else { if (fig) fig.swing.style.transform = ''; animFig(performance.now()); }
  };
  detView.addEventListener('pointerup', finSwipe);
  detView.addEventListener('pointercancel', finSwipe);

  /* ---------- zoom: ver el diseño de cerca ----------
     Se dibuja en un canvas del tamaño de la pantalla (sin escalar capas con CSS, que en iPhone pixela).
     Pellizcar o rueda = acercar · arrastrar = mover · doble toque = acercar/alejar. */
  const Zoom = (() => {
    const el = $('#zoom'), cv = $('#zoomCanvas'), ctx = cv.getContext('2d');
    let src = null, W = 0, H = 0, vw = 0, vh = 0, dpr = 1, s = 1, tx = 0, ty = 0, fit = 1, maxS = 4, raf = 0, anim = null, z = null;
    const pts = new Map(); let pinch = null, tap = null, ultimoTap = 0;
    function medir() {
      vw = el.clientWidth; vh = el.clientHeight; dpr = Math.min(3, devicePixelRatio || 1);
      cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
      if (src) { fit = Math.min(vw / W, vh / H) * 0.94; maxS = Math.max(fit * 5, (src.caja ? vw * 0.98 / src.caja.w : fit * 3)); }
    }
    function limitar() {
      s = Math.max(fit, Math.min(maxS, s));
      const iw = W * s, ih = H * s;
      tx = iw <= vw ? (vw - iw) / 2 : Math.min(0, Math.max(vw - iw, tx));
      ty = ih <= vh ? (vh - ih) / 2 : Math.min(0, Math.max(vh - ih, ty));
    }
    function pintar() {
      raf = 0; if (!src) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vw, vh);
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(src, tx, ty, W * s, H * s);
      el.classList.toggle('cerca', s > fit * 1.05);
    }
    const pedir = () => { if (!raf) raf = requestAnimationFrame(pintar); };
    function zoomEn(ns, px, py) { const k = Math.max(fit, Math.min(maxS, ns)) / s; tx = px - (px - tx) * k; ty = py - (py - ty) * k; s *= k; limitar(); pedir(); }
    function irA(ns, ntx, nty, ms = 380) {
      const a = { s, tx, ty }, t0 = performance.now();
      if (reduce) ms = 0;
      anim = (t) => {
        const u = ms ? Math.min(1, (t - t0) / ms) : 1, e = 1 - Math.pow(1 - u, 3);
        s = a.s + (ns - a.s) * e; tx = a.tx + (ntx - a.tx) * e; ty = a.ty + (nty - a.ty) * e;
        if (u >= 1) { anim = null; limitar(); } pintar(); if (anim) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }
    function alDiseno(ms) {   // encuadra el diseño estampado
      const c = src.caja;
      if (!c) return irA(fit, (vw - W * fit) / 2, (vh - H * fit) / 2, ms);
      const ns = Math.max(fit, Math.min(maxS, vw * 0.9 / c.w, vh * 0.82 / c.h));
      const nx = vw / 2 - (c.x + c.w / 2) * ns, ny = vh / 2 - (c.y + c.h / 2) * ns;
      const g = { s, tx, ty }; s = ns; tx = nx; ty = ny; limitar(); const fin = { s, tx, ty }; s = g.s; tx = g.tx; ty = g.ty;
      irA(fin.s, fin.tx, fin.ty, ms);
    }
    async function cargar(lado) {
      el.classList.add('cargando');
      const c = document.createElement('canvas');
      await componer(c, z.d, z.corte, z.color, lado, 1800, true).catch(console.warn);
      if (el.hidden) return;
      z.lado = lado; src = c; W = c.width; H = c.height; medir();
      s = fit; tx = (vw - W * s) / 2; ty = (vh - H * s) / 2; pintar();
      el.classList.remove('cargando');
      setTimeout(() => alDiseno(650), 250);
      el.querySelectorAll('.zoom-lados button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lado === lado ? 'true' : 'false'));
    }
    let antes = null;
    function abrir() {
      if (!sel || !el.hidden) return;
      const d = lista[sel.i]; if (d.pedido) return;
      z = { d, corte: sel.corte, color: sel.color, lado: sel.lado };
      antes = document.activeElement; el.hidden = false; document.body.classList.add('con-modal');
      $('#zoomNombre').textContent = d.nombre;
      const lados = el.querySelector('.zoom-lados'); lados.hidden = !(d.frente && d.espalda);
      el.classList.remove('visto'); setTimeout(() => el.classList.add('visto'), 3200);
      src = null; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      cargar(sel.lado);
      $('#zoomCerrar').focus({ preventScroll: true });
    }
    function cerrar() {
      if (el.hidden) return;
      el.hidden = true; src = null; anim = null; pts.clear(); pinch = null;
      cv.width = cv.height = 1;   // libera la memoria del canvas grande
      if (!modalAbierto()) document.body.classList.remove('con-modal');
      if (antes && antes.focus) antes.focus({ preventScroll: true });
    }
    $('#zoomCerrar').onclick = cerrar;
    $('#zoomMas').onclick = () => { anim = null; const ns = Math.min(maxS, s * 1.6); const g = { s, tx, ty }; zoomEn(ns, vw / 2, vh / 2); const f = { s, tx, ty }; s = g.s; tx = g.tx; ty = g.ty; irA(f.s, f.tx, f.ty, 260); };
    $('#zoomMenos').onclick = () => { anim = null; const g = { s, tx, ty }; zoomEn(s / 1.6, vw / 2, vh / 2); const f = { s, tx, ty }; s = g.s; tx = g.tx; ty = g.ty; irA(f.s, f.tx, f.ty, 260); };
    el.querySelectorAll('.zoom-lados button').forEach(b => b.onclick = () => { if (z && b.dataset.lado !== z.lado) cargar(b.dataset.lado); });
    document.addEventListener('keydown', (e) => {
      if (el.hidden) return;
      if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
      else if (e.key === '+' || e.key === '=') $('#zoomMas').click();
      else if (e.key === '-') $('#zoomMenos').click();
    }, true);
    addEventListener('resize', () => { if (!el.hidden && src) { medir(); limitar(); pedir(); } });

    // gestos
    const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      if (!src) return; anim = null;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      pts.set(e.pointerId, pos(e));
      if (pts.size === 1) tap = { ...pos(e), t: performance.now(), x0: tx, y0: ty, movido: false };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s0: s, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, tx0: tx, ty0: ty }; tap = null; }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, pos(e));
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const ns = Math.max(fit * 0.85, Math.min(maxS * 1.15, pinch.s0 * d / pinch.d)), k = ns / pinch.s0;
        s = ns; tx = m.x - (pinch.m.x - pinch.tx0) * k; ty = m.y - (pinch.m.y - pinch.ty0) * k; pedir();
      } else if (tap && pts.size === 1) {
        const p = pos(e), dx = p.x - tap.x, dy = p.y - tap.y;
        if (Math.hypot(dx, dy) > 6) tap.movido = true;
        tx = tap.x0 + dx; ty = tap.y0 + dy; limitar(); pedir();
      }
    });
    const soltar = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pinch && pts.size < 2) {
        pinch = null; const g = { s, tx, ty }; limitar(); const f = { s, tx, ty }; s = g.s; tx = g.tx; ty = g.ty; irA(f.s, f.tx, f.ty, 220);
        if (pts.size === 1) { const p = [...pts.values()][0]; tap = { ...p, t: 0, x0: f.tx, y0: f.ty, movido: true }; }
        return;
      }
      if (tap && !tap.movido && e.type === 'pointerup') {
        const ahora = performance.now();
        if (ahora - ultimoTap < 320) {   // doble toque
          ultimoTap = 0;
          if (s > fit * 1.3) irA(fit, (vw - W * fit) / 2, (vh - H * fit) / 2);
          else { const ns = Math.min(maxS, fit * 3), k = ns / s; const g = { s, tx, ty }; s = ns; tx = tap.x - (tap.x - g.tx) * k; ty = tap.y - (tap.y - g.ty) * k; limitar(); const f = { s, tx, ty }; s = g.s; tx = g.tx; ty = g.ty; irA(f.s, f.tx, f.ty); }
        } else ultimoTap = ahora;
      }
      tap = null;
    };
    cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
    cv.addEventListener('wheel', (e) => { if (!src) return; e.preventDefault(); anim = null; const p = pos(e); zoomEn(s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y); }, { passive: false });
    return { abrir, cerrar };
  })();
  $('#detLupa').onclick = () => Zoom.abrir();
  // tocar la remera (sin deslizar) también abre el zoom
  detView.addEventListener('click', (e) => { if (movSwipe < 8 && e.target.closest('.det-fig') && !e.target.closest('button')) Zoom.abrir(); });

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { armado = true; armarPerchero(); if (!detail.hidden) pintarFig(); }, 150); });

  /* ---------- cielo de atardecer que toma el tono de la remera ---------- */
  const Cielo = (() => {
    const cv = document.getElementById('cielo');
    if (!cv || !cv.getContext) return { tono() {}, tema() {} };
    const ctx = cv.getContext('2d');
    const NW = 1200, NH = 640;
    const mk = () => { const c = document.createElement('canvas'); c.width = NW; c.height = NH; return c; };
    const mLuz = mk(), mSom = mk();
    const cl = mLuz.getContext('2d'), cs = mSom.getContext('2d');
    let semilla = 7; const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
    // nubes hechas de "copos" redondos agrupados, con la base más plana; se repiten en X sin corte
    function copo(c, x, y, rx, ry, a) {
      for (const dx of [-NW, 0, NW]) {
        c.save(); c.translate(x + dx, y); c.scale(1, ry / rx);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.75})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    function nube(cx, cy, ancho, alto, n) {
      for (let k = 0; k < n; k++) {
        const t = rnd(), x = cx + (t - 0.5) * ancho, hump = Math.sin(t * Math.PI);
        const r = (0.35 + rnd() * 0.65) * alto * (0.5 + hump * 0.8);
        const y = cy - hump * alto * 0.45 * rnd();
        copo(cs, x, y - r * 0.28, r, r * 0.8, 0.55);     // sombra: arriba del copo
        copo(cl, x, y + r * 0.12, r * 0.92, r * 0.62, 0.8); // luz: abajo, donde pega el sol
      }
    }
    // banco de nubes bajas (cerca del horizonte) y algunas más chicas arriba
    for (let k = 0; k < 9; k++) nube(rnd() * NW, NH * (0.78 + rnd() * 0.16), 220 + rnd() * 260, 70 + rnd() * 60, 26);
    for (let k = 0; k < 7; k++) nube(rnd() * NW, NH * (0.42 + rnd() * 0.22), 160 + rnd() * 200, 40 + rnd() * 34, 16);
    for (let k = 0; k < 6; k++) { // jirones altos, alargados
      const x = rnd() * NW, y = NH * (0.08 + rnd() * 0.2);
      for (let q = 0; q < 10; q++) copo(cl, x + (rnd() - 0.5) * 260, y + (rnd() - 0.5) * 14, 40 + rnd() * 50, 7 + rnd() * 6, 0.35);
    }
    // nubes teñidas: una por máscara, y solo se vuelven a teñir si cambió el color (ahorra mucho en celulares)
    const teñidas = new Map();
    function teñir(m, col) {
      let t = teñidas.get(m);
      if (!t) { const cv2 = mk(); t = { cv: cv2, c: cv2.getContext('2d'), col: null }; teñidas.set(m, t); }
      if (t.col === col) return t.cv;
      t.col = col; const tc = t.c;
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, NW, NH);
      tc.fillStyle = col; tc.fillRect(0, 0, NW, NH);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(m, 0, 0);
      return t.cv;
    }
    // paleta a partir del color de la remera (siempre clara, para que el texto negro se lea)
    function hsl(hex) {
      const n = parseInt(hex.slice(1), 16); let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
      if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
      return [h, s, l];
    }
    // colección Doomsday: cielo verde como los rayos de los diseños, sin importar el color de la remera
    const TEMAS = { doom: [[138, 34, 46], [130, 36, 58], [108, 40, 72], [96, 50, 86], [152, 34, 30]] };
    let tema = null;
    function paleta(hex) {
      if (tema && TEMAS[tema]) return TEMAS[tema];
      const [h, s, l] = hsl(hex || '#DAC7AB');
      if (s < 0.14 || (l < 0.16 && s < 0.4) || (l > 0.78 && s < 0.6)) {
        // neutros (negro, blanco, gris, marfil, beige): atardecer naranja de la marca
        const oscuro = l < 0.3 ? 1 : 0;
        return [[20 - oscuro * 8, 72, 72 - oscuro * 6], [28, 86, 79], [38, 92, 88], [32, 100, 96], [345 + oscuro * 10, 34, 74 - oscuro * 8]];
      }
      const mez = (a, b, t) => a + (((b - a + 540) % 360) - 180) * t;
      return [[h, 50, 66], [h, 60, 77], [h, 58, 88], [h, 70, 96], [mez(h, h + 25, 1), 26, 72]];
    }
    let actual = paleta(), destino = actual, desde = actual, t0 = 0, dur = 1;
    const lerpH = (a, b, t) => a + (((b - a + 540) % 360) - 180) * t;
    function mezcla(p, q, t) { return p.map((c, i) => [lerpH(c[0], q[i][0], t), c[1] + (q[i][1] - c[1]) * t, c[2] + (q[i][2] - c[2]) * t]); }
    const css = (c) => `hsl(${c[0].toFixed(1)} ${c[1].toFixed(1)}% ${c[2].toFixed(1)}%)`;
    let offset = 0, last = 0, ultimoHex = null;
    function tamaño() {
      const r = Math.min(1, 640 / Math.max(innerWidth, 1));
      cv.width = Math.round(innerWidth * r); cv.height = Math.round(innerHeight * r);
    }
    function dibujar() {
      const W = cv.width, H = cv.height;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, css(actual[0])); g.addColorStop(0.55, css(actual[1])); g.addColorStop(1, css(actual[2]));
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // resplandor del sol detrás del horizonte
      const sol = ctx.createRadialGradient(W * 0.5, H * 0.95, 0, W * 0.5, H * 0.95, H * 0.7);
      sol.addColorStop(0, css([actual[3][0], 100, 97]).replace(')', ' / .75)')); sol.addColorStop(1, css(actual[2]).replace(')', ' / 0)'));
      ctx.fillStyle = sol; ctx.fillRect(0, 0, W, H);
      const ch = H * 1.0, cw = ch * NW / NH, ox = -((offset % 1) * cw);
      for (const [m, col, a] of [[mSom, actual[4], 0.75], [mLuz, actual[3], 0.92]]) {
        const tt = teñir(m, css(col)); ctx.globalAlpha = a;
        for (let x = ox; x < W; x += cw) ctx.drawImage(tt, x, H - ch, cw, ch);
      }
      ctx.globalAlpha = 1;
    }
    function frame(t) {
      const dt = Math.min(0.1, (t - (last || t)) / 1000); last = t;
      if (t0) { const k = Math.min(1, (t - t0) / (dur * 1000)); const e = k * k * (3 - 2 * k); actual = mezcla(desde, destino, e); if (k >= 1) t0 = 0; }
      if (!reduce) offset += dt * 0.004;
      // se redibuja seguido solo mientras cambia de tono; si no, unas 8 veces por segundo (ahorra batería y memoria)
      const tapado = document.hidden || document.body.classList.contains('con-portada');
      if (!tapado && (t0 || t - (frame.ult || 0) > 120)) { frame.ult = t; dibujar(); }
      requestAnimationFrame(frame);
    }
    tamaño(); addEventListener('resize', tamaño);
    requestAnimationFrame(frame);
    return {
      tema(t) {
        if (t === tema) return; tema = t; document.body.classList.toggle('tema-doom', t === 'doom');
        desde = actual; destino = paleta(ultimoHex); t0 = performance.now(); dur = reduce ? 0.01 : 1.1;
      },
      tono(hex) {
        if (!hex || hex === ultimoHex) return; ultimoHex = hex;
        desde = actual; destino = paleta(hex); t0 = performance.now(); dur = reduce ? 0.01 : 1.1;
      }
    };
  })();
  function hexDe(corte, color) { return ((CFG.cortes[corte].colores.find(c => c.id === color)) || {}).hex; }

  /* ---------- portada: las remeras destacadas en abanico (catalogo.json → "portada") ---------- */
  // Al entrar, 5 remeras apoyadas y encimadas en abanico. Se deslizan con el scroll, el dedo o las flechas,
  // y solas cada pocos segundos. Al tocar la del frente se agranda y aparece su ficha con colores y WhatsApp.
  const Portada = (() => {
    const el = $('#portada'), esc = $('#pEscena'), info = $('#pInfo');
    let P = [], N = 0, c = 0, ct = 0, zoomK = -1, raf = 0, last = 0, toque = 0, auto = 0, foco = -1, medida = null, drag = null, ruedaT = 0;
    const VELOCIDAD = 0.42;   // remeras por segundo que pasan solas
    const visible = () => !el.hidden && !el.classList.contains('salir');
    const envolver = (r) => ((r % N) + N + N / 2) % N - N / 2;      // distancia más corta en el abanico circular

    function medir() {
      const vw = innerWidth, eh = esc.clientHeight, movil = vw < 760;
      const Wc = movil ? Math.min(vw * 0.74, eh * 0.62) : Math.min(eh * 0.8, vw * 0.34);
      const ZW = movil ? Math.min(vw * 0.86, 520) : Math.min(innerHeight * 0.76, vw * 0.44, 980);
      // en compu, remera y ficha forman un bloque centrado (antes la ficha quedaba muy a la derecha)
      const infoW = Math.min(560, Math.max(340, vw * 0.3)), gap = Math.max(24, vw * 0.035);
      // en compu, si está el cartel de la colección nueva a la izquierda, el abanico y su texto se corren un poco a la derecha
      const pd = $('#pDoom'), off = !movil && pd && !pd.hidden ? (pd.offsetLeft + pd.offsetWidth) * 0.5 : 0;
      $('#pPie').style.paddingLeft = off ? (off * 2) + 'px' : '';
      return { vw, eh, movil, Wc, ZW, infoW, gap, off, EW: Math.max(Wc, ZW), sp: Wc * (movil ? 0.42 : 0.5) };
    }
    function armar() {
      medida = medir(); esc.innerHTML = '';
      const { EW } = medida, pad = SOMBRA_PAD.oversize;
      P.forEach((p, k) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'p-item';
        b.style.width = EW + 'px'; b.setAttribute('aria-label', `${p.d.nombre}. Ver detalle`);
        const shirt = document.createElement('div'); shirt.className = 'shirt'; shirt.style.width = EW * ESCALA_CORTE[p.corte] + 'px'; shirt.style.margin = '0 auto';
        const sw = EW * ESCALA_CORTE[p.corte];
        const sombra = new Image(); sombra.className = 'sombra'; sombra.alt = ''; sombra.src = `img/${p.corte}/sombra.webp`;
        sombra.style.width = sw * (1 + 2 * pad) + 'px'; sombra.style.left = (-pad * sw + sw * 0.05) + 'px'; sombra.style.top = (-pad * sw + sw * 0.06) + 'px';
        const canvas = document.createElement('canvas'); canvas.width = Math.round(sw); canvas.height = Math.round(sw * ASPECTO[p.corte]);
        shirt.append(sombra, canvas); b.appendChild(shirt);
        if (p.nueva) { const t = document.createElement('span'); t.className = 'p-nueva'; t.textContent = 'Nueva colección'; shirt.appendChild(t); p.tag = t; }
        p.el = b; p.canvas = canvas; p.cur = p.cur || null;
        pintar(p);
        b.addEventListener('click', (e) => {
          if (drag && drag.movido) return;
          if (zoomK >= 0) return;
          const r = envolver(k - c);
          if (Math.abs(r) < 0.35) abrirZoom(k); else { ct = c + r; tocar(); }
        });
        esc.appendChild(b);
      });
      const pts = $('#pPuntos'); pts.innerHTML = '';
      P.forEach((p, k) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', p.d.nombre); b.onclick = () => { if (zoomK < 0) { ct = c + envolver(k - c); tocar(); } }; pts.appendChild(b); });
      foco = -1;
    }
    function pintar(p) {
      return componer(p.canvas, p.d, p.corte, p.color, ladoDe(p.d), Math.min(1100, Math.ceil(medida.EW * ESCALA_CORTE[p.corte] * Math.max(1.5, devicePixelRatio || 1)))).catch(console.warn);
    }
    function tocar() { toque = performance.now(); arrancar(); }
    function arrancar() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    function destino(k) {
      const { Wc, EW, sp, movil, vw, eh } = medida;
      if (zoomK >= 0) {
        if (k === zoomK) {
          let x = movil ? 0 : -(medida.gap + medida.infoW) / 2, y = 0;
          let s = medida.ZW / EW;
          if (movil) {   // arriba, dejando lugar a la ficha de abajo
            const er = esc.getBoundingClientRect(), libre = info.getBoundingClientRect().top - 12;
            const top = Math.max(56, er.top - 40), alto = Math.max(120, libre - top);
            s = Math.min(s, alto / (EW * ASPECTO.oversize)); y = top + alto / 2 - (er.top + er.height / 2);
          }
          return { x, y, s, rot: 0, o: 1, z: 30 };
        }
        const r = envolver(k - c); return { x: Math.sign(r || 1) * vw * 0.75, y: 0, s: Wc / EW * 0.8, rot: r * 6, o: 0, z: 1 };
      }
      const r = envolver(k - c), a = Math.abs(r);
      return {
        x: medida.off + r * sp * (1 + 0.12 * a), y: a * a * Wc * 0.025 + (movil ? eh * 0.1 : eh * 0.07), s: (Wc / EW) * (1 - 0.11 * a),
        rot: r * 5.5, o: Math.max(0, Math.min(1, (2.5 - a) / 0.45)), z: 20 - Math.round(a * 4)
      };
    }
    function frame(t) {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      // movimiento lento y constante, como una vidriera que gira; se pausa un momento si la persona las mueve
      if (!el.hidden && zoomK < 0 && !drag && !reduce && t - toque > 1600) ct += dt * VELOCIDAD;
      if (!drag) c += (ct - c) * (1 - Math.exp(-dt * (reduce ? 60 : 6.5)));
      let quieto = Math.abs(ct - c) < 0.0005;
      const f = 1 - Math.exp(-dt * (reduce ? 60 : 8));
      P.forEach((p, k) => {
        const d = destino(k);
        if (!p.cur) p.cur = { ...d };
        for (const key of ['x', 'y', 's', 'rot', 'o']) { p.cur[key] += (d[key] - p.cur[key]) * f; if (Math.abs(d[key] - p.cur[key]) > 0.001) quieto = false; }
        const q = p.cur;
        p.el.style.transform = `translate(-50%,-50%) translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) rotate(${q.rot.toFixed(2)}deg) scale(${q.s.toFixed(4)})`;
        p.el.style.opacity = q.o.toFixed(3); p.el.style.zIndex = d.z;
        p.el.style.visibility = q.o < 0.01 ? 'hidden' : 'visible';
        p.el.tabIndex = zoomK < 0 && Math.abs(envolver(k - c)) < 0.5 ? 0 : -1;
        if (p.tag) p.tag.style.opacity = zoomK >= 0 ? 0 : 1;
      });
      const fi = ((Math.round(c) % N) + N) % N;
      if (fi !== foco) {
        foco = fi; const p = P[fi];
        $('#pNombre').textContent = p.d.nombre;
        $('#pSub').textContent = p.nueva ? 'Nueva colección · Salmos y Romanos' : (p.d.detalle || '');
        $('#pPuntos').querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', k === fi ? 'true' : 'false'));
      }
      // sigue animando mientras hay movimiento o falta poco para el próximo paso automático
      if (visible() && (!quieto || drag || zoomK < 0)) raf = requestAnimationFrame(frame); else raf = 0;
    }

    /* ficha (zoom) */
    function abrirZoom(k) {
      zoomK = k; ct = c = Math.round(c) + envolver(k - Math.round(c)); el.classList.add('zoom');
      info.hidden = false; ubicarFicha(); fichar(); arrancar();
      setTimeout(() => $('#pCerrar').focus({ preventScroll: true }), 50);
    }
    function ubicarFicha() {
      const m = medida;
      if (m.movil) { info.style.left = info.style.width = ''; return; }
      info.style.width = m.infoW + 'px';
      info.style.left = (m.vw / 2 - (m.gap + m.infoW) / 2 + m.ZW / 2 + m.gap) + 'px';
    }
    function cerrarZoom() {
      if (zoomK < 0) return; const k = zoomK; zoomK = -1; el.classList.remove('zoom'); info.hidden = true; tocar();
      P[k].el.focus({ preventScroll: true });
    }
    function fichar() {
      const p = P[zoomK], d = p.d, cfgC = CFG.cortes[p.corte];
      $('#pEtq').textContent = p.nueva ? 'Nueva colección · Salmos y Romanos' : '';
      $('#pTitulo').textContent = d.nombre;
      $('#pDet').textContent = d.detalle || '';
      const sc = $('#pCorte'); sc.innerHTML = '';
      Object.entries(CFG.cortes).forEach(([id, cc]) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = cc.nombre;
        b.setAttribute('aria-pressed', id === p.corte ? 'true' : 'false'); b.disabled = !d.cortes.includes(id);
        b.onclick = () => { if (id === p.corte) return; p.corte = id; p.color = colorDe({ color: p.color, colores: d.colores }, id); armarUna(p); fichar(); };
        sc.appendChild(b);
      });
      const cs = $('#pColores'); cs.innerHTML = '';
      coloresDe(d, p.corte).forEach(col => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tag';
        b.style.setProperty('--c', col.hex); b.title = col.nombre; b.setAttribute('aria-label', col.nombre);
        b.setAttribute('aria-pressed', col.id === p.color ? 'true' : 'false');
        b.onclick = () => { p.color = col.id; pintar(p); fichar(); };
        cs.appendChild(b);
      });
      const col = cfgC.colores.find(x => x.id === p.color);
      $('#pColorName').textContent = d.colores && d.colores.length === 1 ? `Color: ${col ? col.nombre : ''} · única opción` : `Color: ${col ? col.nombre : ''}`;
      const msg = `Hola Agustín! Me interesa la remera "${d.nombre}" en corte ${cfgC.nombre}, color ${col ? col.nombre : ''}.`;
      $('#pCta').href = CFG.whatsapp ? `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}` : `https://ig.me/m/${CFG.instagram}`;
    }
    function armarUna(p) {   // al cambiar de corte cambia el tamaño de la remera
      const sw = medida.EW * ESCALA_CORTE[p.corte], pad = SOMBRA_PAD[p.corte];
      const shirt = p.el.querySelector('.shirt'), sombra = shirt.querySelector('.sombra');
      shirt.style.width = sw + 'px'; sombra.src = `img/${p.corte}/sombra.webp`;
      sombra.style.width = sw * (1 + 2 * pad) + 'px'; sombra.style.left = (-pad * sw + sw * 0.05) + 'px'; sombra.style.top = (-pad * sw + sw * 0.06) + 'px';
      p.canvas.width = Math.round(sw); p.canvas.height = Math.round(sw * ASPECTO[p.corte]);
      pintar(p);
    }

    /* salir hacia el perchero */
    function salir(despues) {
      if (!visible()) return;
      zoomK = -1; el.classList.remove('zoom'); info.hidden = true;
      el.classList.add('salir');
      document.body.classList.remove('con-portada'); soltarPendientes();
      setTimeout(() => { el.hidden = true; if (despues) despues(); Aviso.mostrar(900); }, reduce ? 0 : 750);
    }
    function mostrar() {
      el.hidden = false; el.classList.add('salir');
      requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.remove('salir'); tocar(); Nov.arrancar(); }));
      setTimeout(() => { if (visible()) document.body.classList.add('con-portada'); }, reduce ? 0 : 800);
    }
    $('#pEntrar').onclick = () => salir();

    /* colección nueva: una remera que gira sola (frente ↔ espalda) en un cartel de la portada.
       El giro es solo un achique horizontal (sin 3D ni agrandar), que en iPhone se ve nítido. */
    const Nov = (() => {
      const btn = $('#pDoom'), cv = $('#pdCanvas');
      let cfg = null, raf = 0, t0 = 0, w = 0;
      const FIJA = 1.6, GIRO = 1.0;
      // En cada media vuelta la remera muestra otro diseño de la colección (empieza por el de "novedad").
      // Solo se guardan la cara actual y la siguiente, para no llenar la memoria del celular.
      let lista = [], k = 0, actual = null, sig = null, cargando = false;
      function caraDe(d) { const corte = d.cortes.includes('oversize') ? 'oversize' : d.cortes[0]; return { d, corte, color: colorDe(d, corte), lado: ladoDe(d) }; }
      async function pintarCara(x) { const c = document.createElement('canvas'); await componer(c, x.d, x.corte, x.color, x.lado, w); return c; }
      function pedirSiguiente() {
        if (sig || cargando || lista.length < 2) return;
        cargando = true; const n = (k + 1) % lista.length;
        pintarCara(lista[n]).then(c => { sig = c; }).catch(console.warn).finally(() => { cargando = false; });
      }
      async function preparar(n) {
        const d = DIS.find(x => x.id === n.id); if (!d) return;
        cfg = { n, d }; btn.hidden = false;
        $('#pdTit').textContent = n.titulo || d.nombre; $('#pdSub').textContent = n.sub || '';
        w = Math.min(700, Math.ceil(btn.clientWidth * Math.max(1.5, devicePixelRatio || 1)));
        lista = [caraDe(d)].concat(DIS.filter(x => x.coleccion === n.coleccion && x.id !== d.id).map(caraDe));
        actual = await pintarCara(lista[0]);
        cv.width = actual.width; cv.height = actual.height;
        cv.getContext('2d').drawImage(actual, 0, 0);
        pedirSiguiente(); arrancar();
      }
      function mostrarCara(c) {
        const x = cv.getContext('2d'); x.clearRect(0, 0, cv.width, cv.height); x.drawImage(c, 0, 0, cv.width, cv.height);
      }
      function avanzar() { k = (k + 1) % lista.length; actual = sig; sig = null; mostrarCara(actual); pedirSiguiente(); }
      let cambiada = false;
      function frame(t) {
        raf = 0;
        if (!actual || !visible()) return;
        if (!t0) t0 = t;
        let s = (t - t0) / 1000;
        if (s > FIJA && !cambiada && !sig) { t0 = t - FIJA * 1000; s = FIJA; pedirSiguiente(); }   // espera a que esté lista la próxima
        let th = 0;
        if (s > FIJA) { const u = Math.min(1, (s - FIJA) / GIRO); th = Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * u)); }
        if (th >= Math.PI / 2 && !cambiada) { cambiada = true; avanzar(); }
        if (s >= FIJA + GIRO) { t0 = t; cambiada = false; th = 0; }
        const sx = Math.max(0.03, Math.abs(Math.cos(th)));
        cv.style.transform = `scale(${sx.toFixed(3)},1)`;
        cv.style.filter = sx < 0.98 ? `brightness(${(0.55 + 0.45 * sx).toFixed(2)})` : '';
        raf = requestAnimationFrame(frame);
      }
      function arrancar() { if (reduce) return alternar(); if (!raf && actual) { t0 = 0; cambiada = false; raf = requestAnimationFrame(frame); } }
      let altT = 0;
      function alternar() {   // sin animaciones: cambia de diseño cada pocos segundos
        clearInterval(altT); if (lista.length < 2) return;
        altT = setInterval(() => { if (visible() && sig) avanzar(); else pedirSiguiente(); }, 3500);
      }
      btn.addEventListener('click', () => {
        if (!cfg) return;
        salir(() => { const chip = document.querySelector(`.chip[data-f="${cfg.n.coleccion}"]`); if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click(); });
      });
      return { preparar, arrancar };
    })();
    $('#pCerrar').onclick = cerrarZoom;
    $('#pVer').onclick = () => {
      const d = P[zoomK].d, corte = P[zoomK].corte, color = P[zoomK].color;
      salir(() => {
        const f = d.coleccion || (DIS.some(x => x.coleccion === filtro) ? 'todo' : filtro);
        if (f !== filtro) { const chip = document.querySelector(`.chip[data-f="${f}"]`); if (chip) chip.click(); }
        let i = lista.findIndex(x => x.id === d.id);
        if (i < 0) { document.querySelector('.chip[data-f="todo"]').click(); i = lista.findIndex(x => x.id === d.id); }
        if (i >= 0) { centrar(i); setTimeout(() => { abrir(i); if (sel) { sel.corte = d.cortes.includes(corte) ? corte : sel.corte; sel.color = colorDe({ color, colores: d.colores }, sel.corte); textos(); pintarFig(); } }, 450); }
      });
    };
    document.querySelector('.top img').style.cursor = 'pointer';
    document.querySelector('.top img').addEventListener('click', () => { if (detail.hidden) mostrar(); });
    const vm = $('#volverMenu'); vm.hidden = false;
    vm.onclick = () => { if (!detail.hidden) return; window.scrollTo({ top: 0 }); mostrar(); };

    /* gestos */
    esc.addEventListener('pointerdown', (e) => {
      if (zoomK >= 0 || e.button) return;
      drag = { x: e.clientX, y: e.clientY, c0: c, movido: false, id: e.pointerId }; tocar();
    });
    addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.movido && Math.hypot(dx, dy) > 7) { drag.movido = true; esc.classList.add('drag'); try { esc.setPointerCapture(e.pointerId); } catch (_) {} }
      if (drag.movido && Math.abs(dx) >= Math.abs(dy) * 0.6) { c = drag.c0 - dx / medida.sp; ct = c; }
      drag.dx = dx; drag.dy = dy;
    });
    const soltar = (e) => {
      if (!drag || (e.pointerId !== undefined && e.pointerId !== drag.id)) return;
      const dx = drag.dx || 0, dy = drag.dy || 0, d0 = drag;
      esc.classList.remove('drag');
      if (d0.movido && medida.movil && dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.3) salir();       // deslizar hacia arriba: al perchero
      else if (d0.movido) ct = Math.abs(dx) > medida.sp * 0.12 ? (dx < 0 ? Math.ceil(c - 0.02) : Math.floor(c + 0.02)) : Math.round(c);
      tocar();
      setTimeout(() => { if (drag === d0) drag = null; }, 0);
    };
    addEventListener('pointerup', soltar); addEventListener('pointercancel', soltar);
    el.addEventListener('wheel', (e) => {
      if (!visible()) return; e.preventDefault();
      if (zoomK >= 0) return;
      ct += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / 380; tocar();
      clearTimeout(ruedaT); ruedaT = setTimeout(() => { ct = Math.round(ct); arrancar(); }, 140);
    }, { passive: false });
    addEventListener('keydown', (e) => {
      if (!visible() || !$('#pedido').hidden) return;
      if (zoomK >= 0) { if (e.key === 'Escape') cerrarZoom(); return; }
      if (e.key === 'ArrowRight') { ct = Math.round(ct) + 1; tocar(); }
      if (e.key === 'ArrowLeft') { ct = Math.round(ct) - 1; tocar(); }
      if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); salir(); }
    });
    let rT = 0;
    addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (!el.hidden) { const z = zoomK; armar(); zoomK = z; if (z >= 0) ubicarFicha(); tocar(); } }, 200); });

    return {
      iniciar(lista, novedad) {
        if (novedad) requestAnimationFrame(() => Nov.preparar(novedad).catch(console.warn));
        P = (lista || []).map(x => {
          const d = DIS.find(y => y.id === x.id); if (!d) return null;
          const corte = x.corte || d.cortes[0];
          return { d, corte, color: colorDe({ color: x.color || d.color, colores: d.colores }, corte), nueva: !!x.nueva };
        }).filter(Boolean);
        N = P.length; if (N < 2) return;
        el.hidden = false; document.body.classList.add('con-portada'); c = ct = Math.floor(N / 2); toque = -1e9;
        setTimeout(goteo, 2500);   // el perchero se va armando de fondo   // arranca moviéndose apenas se entra
        requestAnimationFrame(() => { armar(); arrancar(); });
      }
    };
  })();

  /* ---------- aviso: invita a ver la colección nueva ---------- */
  // Aparece al llegar al perchero (en "Todo"). Se cierra solo, con la ×, o al entrar a la colección.
  const Aviso = (() => {
    const el = $('#aviso'); let timer = 0, visto = false;
    try { visto = sessionStorage.getItem('aviso-doom') === '1'; } catch (e) {}
    function ocultar() {
      if (el.hidden) return; clearTimeout(timer); el.classList.add('fuera');
      setTimeout(() => { el.hidden = true; el.classList.remove('fuera'); }, 380);
      visto = true; try { sessionStorage.setItem('aviso-doom', '1'); } catch (e) {}
    }
    function mostrar(espera = 1200) {
      if (visto || !DIS.some(d => d.coleccion === 'doomsday')) return;
      setTimeout(() => {
        if (visto || filtro !== 'todo' || !detail.hidden || document.body.classList.contains('con-portada')) return;
        el.hidden = false; clearTimeout(timer); timer = setTimeout(ocultar, 12000);
      }, espera);
    }
    $('#avisoX').onclick = ocultar;
    $('#avisoVer').onclick = () => { ocultar(); const chip = document.querySelector('.chip[data-f="doomsday"]'); if (chip) chip.click(); };
    document.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { if (b.dataset.f === 'doomsday') ocultar(); }));
    return { mostrar, ocultar };
  })();

  /* ---------- cómo pedir (diseño propio) ---------- */
  const Pedido = (() => {
    const el = $('#pedido'); let antes = null;
    function abrir() {
      if (!el.hidden) return;
      antes = document.activeElement;
      const nb = CFG.cortes.basica ? CFG.cortes.basica.colores.length : 0, no = CFG.cortes.oversize ? CFG.cortes.oversize.colores.length : 0;
      $('#pedColores').textContent = `${nb} colores en remera básica y ${no} en oversize.`;
      const msg = 'Hola Agustín! Quiero una remera con mi propio diseño. Te cuento mi idea:';
      $('#pedCta').href = CFG.whatsapp ? `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}` : `https://ig.me/m/${CFG.instagram}`;
      $('#pedCta').textContent = CFG.whatsapp ? 'O contanos tu idea por WhatsApp' : 'O contanos tu idea por Instagram';
      $('#pedVer').textContent = document.body.classList.contains('con-portada') ? 'Ver el catálogo' : 'Seguir viendo el perchero';
      el.hidden = false; Aviso.ocultar(); document.body.classList.add('quieto');
      el.querySelector('.ped-caja').focus({ preventScroll: true });
    }
    function cerrar() {
      if (el.hidden) return;
      el.hidden = true;
      libre();
      if (antes && antes.focus) antes.focus({ preventScroll: true });
    }
    $('#pedX').onclick = cerrar; $('#pedFondo').onclick = cerrar;
    $('#pedProbar').onclick = () => { cerrar(); Crea.abrir(); };
    $('#pedVer').onclick = () => { cerrar(); const e = $('#pEntrar'); if (document.body.classList.contains('con-portada') && e) e.click(); };
    $('#navPedir').onclick = () => abrir();
    $('#pPedir').onclick = (e) => { e.stopPropagation(); abrir(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); cerrar(); } }, true);
    return { abrir, cerrar };
  })();

  /* ---------- ventanas: abrir / cerrar con foco, Escape y fondo ---------- */
  function ventana(sel, alCerrar) {
    const el = $(sel); let antes = null;
    const abrir = () => {
      if (!el.hidden) return;
      antes = document.activeElement; el.hidden = false; Aviso.ocultar();
      document.body.classList.add('quieto', 'con-modal');
      el.querySelector('.ped-caja').focus({ preventScroll: true });
    };
    const cerrar = () => {
      if (el.hidden) return;
      el.hidden = true; libre(); if (!modalAbierto()) document.body.classList.remove('con-modal'); if (alCerrar) alCerrar();
      if (antes && antes.focus) antes.focus({ preventScroll: true });
    };
    el.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrar));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.stopPropagation(); cerrar(); } }, true);
    return { el, abrir, cerrar };
  }
  function nombreColor(corte, color) { const c = (CFG.cortes[corte].colores.find(x => x.id === color)) || {}; return c.nombre || color; }
  function waLink(msg) { return CFG.whatsapp ? `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}` : `https://ig.me/m/${CFG.instagram}`; }
  // foto chiquita de la remera para la lista del pedido
  async function miniatura(d, corte, color, lado) {
    const c = document.createElement('canvas');
    await componer(c, d, corte, color, lado, 220);
    if (d.pedido) marcarHueco(c, corte);
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const x = o.getContext('2d'); x.fillStyle = '#EDE9E2'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0);
    return o.toDataURL('image/jpeg', 0.8);
  }

  /* ---------- mi pedido: varias remeras en un solo WhatsApp ---------- */
  const Carro = (() => {
    const CLAVE = 'mi-pedido-v1';
    let items = [], nota = '';
    const v = ventana('#carro');
    const btn = $('#carroBtn');
    function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify({ items, nota })); } catch (e) {} }
    function total() { return items.reduce((n, it) => n + it.cant, 0); }
    function mensaje() {
      const l = items.map((it, k) => {
        const ladoTxt = it.propio ? `diseño propio en ${it.lado === 'espalda' ? 'la espalda' : 'el frente'} (te mando la imagen)` : (it.lado === 'espalda' ? 'diseño en la espalda' : 'diseño en el frente');
        return `${k + 1}) ${it.nombre} · ${CFG.cortes[it.corte].nombre}, ${nombreColor(it.corte, it.color)} · ${ladoTxt} · x${it.cant}`;
      });
      let m = `Hola Agustín! Quiero hacer este pedido:\n${l.join('\n')}`;
      if (nota.trim()) m += `\n\nTalles y aclaraciones: ${nota.trim()}`;
      return m;
    }
    function pintarBoton(golpe) {
      const n = total();
      btn.hidden = n === 0; $('#carroN').textContent = n;
      if (golpe && !reduce) btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    function pintar() {
      const ul = $('#carroLista'); ul.innerHTML = '';
      items.forEach((it, k) => {
        const li = document.createElement('li');
        li.innerHTML = `<img alt="" width="64" height="64"><div class="cl-txt"><b></b><span></span></div>
          <div class="cl-cant" role="group"><button type="button" data-d="-1" aria-label="Una menos">−</button><output></output><button type="button" data-d="1" aria-label="Una más">+</button></div>
          <button type="button" class="cl-x" aria-label="Quitar">×</button>`;
        if (it.foto) li.querySelector('img').src = it.foto; else li.querySelector('img').remove();
        li.querySelector('b').textContent = it.nombre;
        li.querySelector('span').textContent = `${CFG.cortes[it.corte].nombre} · ${nombreColor(it.corte, it.color)} · ${it.lado === 'espalda' ? 'Espalda' : 'Frente'}`;
        li.querySelector('output').textContent = it.cant;
        li.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { it.cant = Math.max(1, Math.min(50, it.cant + +b.dataset.d)); guardar(); pintar(); });
        li.querySelector('.cl-x').onclick = () => { items.splice(k, 1); guardar(); pintar(); };
        ul.appendChild(li);
      });
      const vacio = items.length === 0;
      $('#carroVacio').hidden = !vacio; $('#carroNotaWrap').hidden = vacio;
      $('#carroEnviar').hidden = vacio; $('#carroVaciar').hidden = vacio;
      $('#carroEnviar').href = waLink(mensaje());
      pintarBoton();
    }
    async function agregar(it, d, origen) {
      const key = it.propio ? 'propio-' + Date.now() : `${it.id}|${it.corte}|${it.color}|${it.lado}`;
      const ya = items.find(x => x.key === key);
      if (ya) ya.cant++;
      else {
        const nuevo = Object.assign({ key, cant: 1 }, it);
        items.push(nuevo);
        if (!nuevo.foto) miniatura(d, it.corte, it.color, it.lado).then(f => { nuevo.foto = f; guardar(); if (!v.el.hidden) pintar(); }).catch(() => {});
      }
      guardar(); pintar(); pintarBoton(true);
      if (origen && !reduce) origen.animate([{ transform: 'scale(.94)' }, { transform: 'none' }], { duration: 260 });
      avisar(`Agregada a tu pedido (${total()})`, { txt: 'Ver pedido', fn: abrir });
    }
    function abrir() { pintar(); v.abrir(); }
    function iniciar() {
      try {
        const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
        if (g && Array.isArray(g.items)) {
          items = g.items.filter(it => it && CFG.cortes[it.corte] && (it.propio || DIS.some(d => d.id === it.id)));
          nota = g.nota || '';
        }
      } catch (e) {}
      $('#carroNota').value = nota;
      pintar();
    }
    $('#carroNota').addEventListener('input', (e) => { nota = e.target.value; guardar(); $('#carroEnviar').href = waLink(mensaje()); });
    $('#carroVaciar').onclick = () => { items = []; guardar(); pintar(); };
    $('#carroSeguir').onclick = () => v.cerrar();
    btn.onclick = abrir;
    return { agregar, abrir, iniciar };
  })();

  /* ---------- diseñá la tuya: subís una imagen o escribís un texto y lo ves en la remera ---------- */
  const Crea = (() => {
    const v = ventana('#crea');
    const LETRAS = [
      { id: 'bold', nombre: 'Bold', font: (px) => `900 ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`, mayus: true },
      { id: 'cursiva', nombre: 'Cursiva', font: (px) => `italic 600 ${px}px "Playfair Display", Georgia, serif` },
      { id: 'clasica', nombre: 'Clásica', font: (px) => `700 ${px}px Georgia, "Times New Roman", serif` }];
    const TINTAS = [{ id: 'negro', nombre: 'Negro', hex: '#141414' }, { id: 'blanco', nombre: 'Blanco', hex: '#FBFAF7' }, { id: 'naranja', nombre: 'Naranja', hex: '#FF7A00' }, { id: 'dorado', nombre: 'Dorado', hex: '#C9A227' }];
    const TAM = [{ id: 'chico', nombre: 'Chico', k: 0.5 }, { id: 'mediano', nombre: 'Mediano', k: 0.75 }, { id: 'grande', nombre: 'Grande', k: 1 }];
    const st = { modo: 'imagen', img: null, imgNombre: '', frase: '', letra: 'bold', tinta: null, corte: 'oversize', color: 'blanco', lado: 'frente', tam: 'grande' };
    let fuente = null, turno = 0, abierto = false;
    const canvas = $('#creaCanvas');

    function seg(el, opciones, actual, fn) {
      el.innerHTML = '';
      opciones.forEach(o => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = o.nombre;
        b.setAttribute('aria-pressed', o.id === actual ? 'true' : 'false'); b.disabled = !!o.off;
        b.onclick = () => { fn(o.id); controles(); pintar(); };
        el.appendChild(b);
      });
    }
    // tinta por defecto: la que más contrasta con la remera
    function tintaAuto() { return ['negro', 'azul_marino', 'verde_musgo', 'verde_botella', 'bordo', 'marron', 'gris_plomo', 'violeta', 'azul_francia', 'rojo'].includes(st.color) ? 'blanco' : 'negro'; }
    function controles() {
      const cortes = Object.entries(CFG.cortes).map(([id, c]) => ({ id, nombre: c.nombre }));
      seg($('#creaCorte'), cortes, st.corte, (id) => { st.corte = id; if (!CFG.cortes[id].colores.some(c => c.id === st.color)) st.color = 'blanco'; if (!CFG.cortes[id].lados.includes(st.lado)) st.lado = 'frente'; });
      seg($('#creaLado'), ['frente', 'espalda'].map(l => ({ id: l, nombre: l === 'frente' ? 'Frente' : 'Espalda', off: !CFG.cortes[st.corte].lados.includes(l) })), st.lado, (l) => { st.lado = l; });
      seg($('#creaTam'), TAM, st.tam, (t) => { st.tam = t; });
      seg($('#creaLetra'), LETRAS, st.letra, (l) => { st.letra = l; fuente = null; });
      document.querySelectorAll('.crea-modo button').forEach(b => b.setAttribute('aria-pressed', b.dataset.modo === st.modo ? 'true' : 'false'));
      $('#creaImagen').hidden = st.modo !== 'imagen'; $('#creaTexto').hidden = st.modo !== 'texto';
      const ti = $('#creaTinta'); ti.innerHTML = '';
      const tinta = st.tinta || tintaAuto();
      TINTAS.forEach(t => {
        const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', t.hex);
        b.setAttribute('aria-label', 'Letra ' + t.nombre); b.title = t.nombre; b.setAttribute('aria-pressed', t.id === tinta ? 'true' : 'false');
        b.onclick = () => { st.tinta = t.id; fuente = null; controles(); pintar(); };
        ti.appendChild(b);
      });
      const cs = $('#creaColores'); cs.innerHTML = '';
      CFG.cortes[st.corte].colores.forEach(c => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'tag';
        b.style.setProperty('--c', c.hex); b.setAttribute('aria-label', c.nombre); b.title = c.nombre;
        b.setAttribute('aria-pressed', c.id === st.color ? 'true' : 'false');
        b.onclick = () => { st.color = c.id; if (st.modo === 'texto' && !st.tinta) fuente = null; controles(); pintar(); };
        cs.appendChild(b);
      });
      $('#creaColorNom').textContent = 'Color: ' + nombreColor(st.corte, st.color);
    }
    // el texto se dibuja en una imagen transparente recortada justo al borde de las letras
    async function imagenTexto() {
      const L = LETRAS.find(l => l.id === st.letra);
      let txt = st.frase.trim(); if (!txt) return null;
      if (L.mayus) txt = txt.toUpperCase();
      try { await document.fonts.load(L.font(80)); } catch (e) {}
      const lineas = txt.split(/\n+/).map(s => s.trim()).filter(Boolean).slice(0, 4);
      const W = 1400, px = 200, alto = px * 1.12;
      const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(alto * lineas.length + px * 0.6);
      const x = c.getContext('2d'); x.font = L.font(px);
      const anchoMax = Math.max(...lineas.map(l => x.measureText(l).width));
      const k = Math.min(1, (W - 40) / anchoMax);
      x.font = L.font(px * k); x.textAlign = 'center'; x.textBaseline = 'alphabetic';
      x.fillStyle = (TINTAS.find(t => t.id === (st.tinta || tintaAuto()))).hex;
      lineas.forEach((l, i) => x.fillText(l, W / 2, px * k * 0.95 + i * alto * k + px * 0.1));
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let yy = 0; yy < c.height; yy += 2) for (let xx = 0; xx < c.width; xx += 2) if (d[(yy * c.width + xx) * 4 + 3] > 10) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 <= x0) return null;
      const o = document.createElement('canvas'); o.width = x1 - x0 + 12; o.height = y1 - y0 + 12;
      o.getContext('2d').drawImage(c, x0 - 6, y0 - 6, o.width, o.height, 0, 0, o.width, o.height);
      return o.toDataURL('image/png');
    }
    async function diseno() {
      if (st.modo === 'imagen') return st.img;
      if (fuente === null) fuente = (await imagenTexto()) || '';
      return fuente || null;
    }
    function pseudo(src) {
      const k = TAM.find(t => t.id === st.tam).k, base = CFG.cortes[st.corte].estampa[st.lado] || CFG.cortes[st.corte].estampa.frente;
      const e = { ancho: base.ancho * k, alto: base.alto * k, anchoAncho: base.anchoAncho * k };
      const d = { id: 'propio', nombre: 'Mi diseño propio', estampa: { [st.corte]: { [st.lado]: e } } };
      d[st.lado] = src;
      return d;
    }
    async function pintar() {
      if (!abierto) return;
      const t = ++turno;
      const src = await diseno();
      const off = document.createElement('canvas');
      const caja = canvas.parentElement.getBoundingClientRect();
      const maxW = Math.round(Math.min(900, Math.max(300, caja.width * (devicePixelRatio > 1 ? 2 : 1.3))));
      await componer(off, src ? pseudo(src) : { id: 'vacio' }, st.corte, st.color, st.lado, maxW).catch(console.warn);
      if (!src) marcarHueco(off, st.corte);
      if (t !== turno) return;
      canvas.width = off.width; canvas.height = off.height; canvas.getContext('2d').drawImage(off, 0, 0);
      const listo = !!src;
      $('#creaAgregar').disabled = !listo; $('#creaEnviar').disabled = !listo;
    }
    function leerArchivo(f) {
      if (!f || !f.type.startsWith('image/')) return;
      const r = new FileReader();
      r.onload = () => {
        // se achica para que el celular no se trabe con fotos enormes
        const i = new Image();
        i.onload = () => {
          const k = Math.min(1, 1600 / Math.max(i.naturalWidth, i.naturalHeight));
          const c = document.createElement('canvas'); c.width = Math.round(i.naturalWidth * k); c.height = Math.round(i.naturalHeight * k);
          c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
          st.img = c.toDataURL(f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9); st.imgNombre = f.name;
          $('#creaArchivoTxt').textContent = 'Cambiar imagen';
          pintar();
        };
        i.src = r.result;
      };
      r.readAsDataURL(f);
    }
    $('#creaArchivo').addEventListener('change', (e) => leerArchivo(e.target.files[0]));
    let ft = 0;
    $('#creaFrase').addEventListener('input', (e) => { st.frase = e.target.value; fuente = null; clearTimeout(ft); ft = setTimeout(pintar, 180); });
    document.querySelectorAll('.crea-modo button').forEach(b => b.onclick = () => { st.modo = b.dataset.modo; controles(); pintar(); if (st.modo === 'texto') $('#creaFrase').focus({ preventScroll: true }); });
    async function fotoFinal() {
      return new Promise((ok) => {
        const o = document.createElement('canvas'); o.width = canvas.width; o.height = canvas.height;
        const x = o.getContext('2d'); x.fillStyle = '#EDE9E2'; x.fillRect(0, 0, o.width, o.height); x.drawImage(canvas, 0, 0);
        o.toBlob(ok, 'image/jpeg', 0.9);
      });
    }
    function resumen() { return `${CFG.cortes[st.corte].nombre}, ${nombreColor(st.corte, st.color)}, diseño ${st.tam} en ${st.lado === 'espalda' ? 'la espalda' : 'el frente'}`; }
    $('#creaAgregar').onclick = async () => {
      const src = await diseno(); if (!src) return;
      const c = document.createElement('canvas'); c.width = 220; c.height = Math.round(220 * canvas.height / canvas.width);
      const x = c.getContext('2d'); x.fillStyle = '#EDE9E2'; x.fillRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0, c.width, c.height);
      const nombre = st.modo === 'texto' ? `Mi frase: "${st.frase.trim().replace(/\s+/g, ' ').slice(0, 40)}"` : 'Mi diseño propio';
      Carro.agregar({ propio: true, id: 'propio', nombre, corte: st.corte, color: st.color, lado: st.lado, foto: c.toDataURL('image/jpeg', 0.8) }, null, $('#creaAgregar'));
    };
    $('#creaEnviar').onclick = async () => {
      const src = await diseno(); if (!src) return;
      const frase = st.modo === 'texto' ? ` con la frase "${st.frase.trim().replace(/\s+/g, ' ')}"` : '';
      const msg = `Hola Agustín! Quiero una remera con mi propio diseño${frase}: ${resumen()}. Te mando la vista previa.`;
      const blob = await fotoFinal();
      const file = blob && new File([blob], 'mi-remera.jpg', { type: 'image/jpeg' });
      // en el celular se comparte la foto directo (WhatsApp aparece entre las opciones)
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: msg }); return; } catch (e) { if (e.name === 'AbortError') return; }
      }
      // en la compu: se descarga la foto y se abre WhatsApp con el mensaje, para adjuntarla
      if (blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mi-remera.jpg'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
      window.open(waLink(msg + ' (la imagen se descargó en tu compu, adjuntala acá)'), '_blank', 'noopener');
    };
    function abrir() {
      if (detail && !detail.hidden) cerrar();
      abierto = true; v.abrir(); controles();
      requestAnimationFrame(pintar);
    }
    return { abrir };
  })();

  /* ---------- secciones de información (debajo del perchero) ---------- */
  const Info = (() => {
    const DESTACADAS = { god_is_bigger: 'negro', jesus_loves_you: 'marfil', on_fire: 'blanco', victory: 'beige', jesus_corriendo: 'verde_musgo', jesus_always_wins: 'negro', dont_be_afraid: 'marfil', church_kids: 'blanco' };
    function subir(fn) {
      const listo = () => setTimeout(fn, 60);
      if (window.scrollY < 4) return listo();
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      let t = 0; const espera = () => (window.scrollY < 4 || ++t > 90) ? listo() : requestAnimationFrame(espera); espera();
    }
    function filtrar(f) { const chip = document.querySelector(`.chip[data-f="${f}"]`); if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click(); }
    function armar() {
      const g = $('#iGrilla');
      Object.entries(DESTACADAS).forEach(([id, color], k) => {
        const d = DIS.find(x => x.id === id); if (!d) return;
        const a = document.createElement('a'); a.className = 'i-rem i-rev ' + (['negro', 'verde_musgo', 'azul_marino'].includes(color) ? 'i-oscura' : 'i-clara'); a.style.setProperty('--d', (k % 4) * .07 + 's');
        a.href = '#' + id.replace(/_/g, '-');
        a.innerHTML = `<figure><img src="img/inicio/${id}_${color}.webp" alt="" loading="lazy" width="900" height="887"></figure><div><b></b><span></span></div>`;
        a.querySelector('b').textContent = d.nombre; a.querySelector('span').textContent = d.detalle || '';
        a.querySelector('img').alt = 'Remera ' + d.nombre;
        a.addEventListener('click', (e) => { e.preventDefault(); subir(() => { filtrar('todo'); const i = lista.findIndex(x => x.id === id); if (i >= 0) { centrar(i); setTimeout(() => abrir(i), 250); } }); });
        g.appendChild(a);
      });
      const pint = (el, corte) => (CFG.cortes[corte] ? CFG.cortes[corte].colores : []).forEach(c => { const i = document.createElement('i'); i.style.background = c.hex; i.title = c.nombre; el.appendChild(i); });
      pint($('#iOver'), 'oversize'); pint($('#iBas'), 'basica');
      $('#iColTu').addEventListener('click', (e) => { e.preventDefault(); Crea.abrir(); });
      document.querySelectorAll('.info [data-ir]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); subir(() => filtrar(a.dataset.ir)); }));
      document.querySelectorAll('.info a[href^="#i-"], .mas-abajo').forEach(a => a.addEventListener('click', (e) => {
        const t = document.querySelector(a.getAttribute('href')); if (!t) return;
        e.preventDefault(); t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }));
      const io = new IntersectionObserver((es) => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('i-in'); io.unobserve(x.target); } }), { rootMargin: '0px 0px -8% 0px' });
      document.querySelectorAll('.i-rev').forEach(el => io.observe(el));
      const col = $('#iCollage'), pars = [...col.querySelectorAll('[data-par]')]; let pend = false;
      addEventListener('scroll', () => {
        if (pend) return; pend = true;
        requestAnimationFrame(() => {
          pend = false;
          const c = col.getBoundingClientRect(), q = (c.top + c.height / 2 - innerHeight / 2) / innerHeight;
          if (Math.abs(q) < 1.5) pars.forEach(f => f.style.setProperty('--y', (q * f.dataset.par).toFixed(1) + 'px'));
        });
      }, { passive: true });
    }
    return { armar };
  })();

  /* ---------- inicio ---------- */
  fetch('catalogo.json').then(r => r.json()).then(cfg => {
    CFG = cfg; DIS = cfg.disenos;
    const ig = `https://instagram.com/${cfg.instagram}`;
    $('#navContacto').href = cfg.whatsapp ? `https://wa.me/${cfg.whatsapp}` : ig;
    const frase = ['Remeras personalizadas en DTF', 'Oversize y básicas', 'Creatividad & calidad', 'Nuevos diseños', 'Hacemos tu diseño'];
    const t = $('#ticker'); const linea = frase.map(f => `<span>${f} ✦</span>`).join('');
    t.innerHTML = linea + linea + linea + linea;
    const h = location.hash.slice(1).replace(/-/g, '_');
    const dh = DIS.find(d => d.id === h);
    if (dh && dh.coleccion) {   // link directo a una remera de una colección: abrir con ese filtro
      filtro = dh.coleccion;
      document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.f === filtro ? 'true' : 'false'));
    }
    Cielo.tema(filtro === 'doomsday' ? 'doom' : null);
    if (!dh && cfg.portada) document.body.classList.add('con-portada');   // hay portada: el perchero se arma de fondo
    armarPerchero();
    Info.armar();
    Carro.iniciar();
    const i = lista.findIndex(d => d.id === h);
    if (i >= 0) setTimeout(() => abrir(i), 300);
    else if (cfg.portada) Portada.iniciar(cfg.portada, cfg.novedad);
    else Aviso.mostrar();   // con un link directo a una remera no se muestra la portada
  }).catch(err => { $('#capName').textContent = 'No se pudo cargar el catálogo'; console.error(err); });
})();
