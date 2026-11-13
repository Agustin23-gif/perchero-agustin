/* Perchero interactivo · Agustín diseños personalizados
   Los diseños se cargan desde catalogo.json: cada diseño es un PNG/WebP sin fondo en /disenos
   y se estampa en vivo sobre la foto de la remera del color elegido. */
(() => {
  const $ = (s) => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ASPECTO = { oversize: 1050 / 1064, basica: 733 / 720 };
  const ESCALA_CORTE = { oversize: 1, basica: 0.84 }; // la básica se ve más angosta, como en la realidad
  const SOMBRA_PAD = { oversize: 60 / 720, basica: 60 / 720 };

  let CFG, DIS = [], lista = [], filtro = 'todo';

  /* ---------- imágenes y composición ---------- */
  const imgs = new Map();
  function img(src) {
    if (!imgs.has(src)) imgs.set(src, new Promise((ok, ko) => {
      const i = new Image(); i.decoding = 'async';
      i.onload = () => ok(i); i.onerror = () => ko(new Error('No se pudo cargar ' + src)); i.src = src;
    }));
    return imgs.get(src);
  }
  async function componer(canvas, d, corte, color, lado, maxW) {
    const base = await img(`img/${corte}/${lado}_${color}.webp`);
    const W = Math.round(Math.min(maxW, base.naturalWidth));
    const H = Math.round(W * base.naturalHeight / base.naturalWidth);
    const src = lado === 'frente' ? d.frente : d.espalda;
    let est = null;
    if (src) {
      const [dis, luz] = await Promise.all([img(src), img(`img/${corte}/luz_${lado}.webp`)]);
      const e = CFG.cortes[corte].estampa[lado] || CFG.cortes[corte].estampa.frente;
      const ancho = dis.naturalWidth / dis.naturalHeight > 2.2;
      const r = Math.min(W * (ancho ? e.anchoAncho : e.ancho) / dis.naturalWidth, H * e.alto / dis.naturalHeight);
      const dw = dis.naturalWidth * r, dh = dis.naturalHeight * r;
      const x = W * e.cx - dw / 2, y = H * (ancho ? e.topAncho : e.top);
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d'); o.imageSmoothingQuality = 'high';
      o.drawImage(dis, x, y, dw, dh);
      o.globalCompositeOperation = 'multiply'; o.drawImage(luz, 0, 0, W, H);   // pliegues y luz de la tela
      o.globalCompositeOperation = 'destination-in'; o.drawImage(dis, x, y, dw, dh);
      est = off;
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
    if (ids.includes(d.color)) return d.color;
    const parecido = (CFG.parecidos || {})[d.color];   // ej.: verde musgo (oversize) → verde botella (básica)
    return ids.includes(parecido) ? parecido : (ids.includes('blanco') ? 'blanco' : ids[0]);
  }

  function armarPerchero() {
    lista = DIS.filter(d => filtro === 'todo' || d.cortes.includes(filtro) || d.coleccion === filtro);
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
      componer(canvas, d, corte, color, ladoDe(d), Math.min(1100, Math.ceil(W * ESCALA_CORTE[corte] * Math.max(2, devicePixelRatio || 1)))).catch(console.warn);
      const it = { el: b, swing, d, corte, color, i, p: pend(), o: 0, cx: 0 };
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
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (minX === maxX) return;
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
    const cta = $('#cta');
    if (CFG.whatsapp) { cta.href = `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}`; cta.textContent = 'Consultar por WhatsApp'; }
    else { cta.href = `https://ig.me/m/${CFG.instagram}`; cta.textContent = 'Consultar por Instagram'; }
  }

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
    try { history.replaceState(null, '', '#' + d.id.replace(/_/g, '-')); } catch (e) {}
    $('#detClose').focus({ preventScroll: true });
  }
  function cerrar() {
    if (detail.hidden) return;
    const i = sel ? sel.i : -1;
    detail.hidden = true; stage.classList.remove('open'); fig = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (items[i]) { centrar(i); items[i].p.w += 70; kick(); items[i].el.focus({ preventScroll: true }); }
  }
  function mover(dir) {
    if (!sel) return;
    const n = (sel.i + dir + lista.length) % lista.length;
    const d = lista[n];
    const corte = d.cortes.includes(sel.corte) ? sel.corte : d.cortes[0];
    sel = { i: n, corte, color: colorDe(d, corte), lado: ladoDe(d) };
    textos(); pintarFig(dir).then(() => empujar(dir * -90));
  }
  $('#prev').onclick = () => mover(-1);
  $('#next').onclick = () => mover(1);
  $('#detClose').onclick = cerrar;
  $('#navColeccion').onclick = cerrar;
  document.addEventListener('keydown', (e) => {
    if (detail.hidden) return;
    if (e.key === 'Escape') cerrar();
    if (e.key === 'ArrowRight' && !e.target.closest('.colores')) mover(1);
    if (e.key === 'ArrowLeft' && !e.target.closest('.colores')) mover(-1);
  });
  // deslizar con el dedo en el detalle
  let sw = null;
  detView.addEventListener('pointerdown', (e) => { if (!e.target.closest('.arrow')) sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  detView.addEventListener('pointermove', (e) => { if (sw && fig && !reduce) { const dx = e.clientX - sw.x; figP.a = Math.max(-12, Math.min(12, dx / 14)); fig.swing.style.transform = `translateX(${dx * 0.25}px) rotate(${figP.a}deg)`; } });
  const finSwipe = (e) => {
    if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) mover(dx < 0 ? 1 : -1);
    else { if (fig) fig.swing.style.transform = ''; animFig(performance.now()); }
  };
  detView.addEventListener('pointerup', finSwipe);
  detView.addEventListener('pointercancel', finSwipe);

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { armado = true; armarPerchero(); if (!detail.hidden) pintarFig(); }, 150); });

  /* ---------- cielo de atardecer que toma el tono de la remera ---------- */
  const Cielo = (() => {
    const cv = document.getElementById('cielo');
    if (!cv || !cv.getContext) return { tono() {} };
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
    const tinta = mk(), tc = tinta.getContext('2d');
    function teñir(m, col) {
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, NW, NH);
      tc.fillStyle = col; tc.fillRect(0, 0, NW, NH);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(m, 0, 0);
      return tinta;
    }
    // paleta a partir del color de la remera (siempre clara, para que el texto negro se lea)
    function hsl(hex) {
      const n = parseInt(hex.slice(1), 16); let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
      if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
      return [h, s, l];
    }
    function paleta(hex) {
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
      if (t0 || t - (frame.ult || 0) > 120) { frame.ult = t; dibujar(); }
      requestAnimationFrame(frame);
    }
    tamaño(); addEventListener('resize', tamaño);
    requestAnimationFrame(frame);
    return {
      tono(hex) {
        if (!hex || hex === ultimoHex) return; ultimoHex = hex;
        desde = actual; destino = paleta(hex); t0 = performance.now(); dur = reduce ? 0.01 : 1.1;
      }
    };
  })();
  function hexDe(corte, color) { return ((CFG.cortes[corte].colores.find(c => c.id === color)) || {}).hex; }

  /* ---------- inicio ---------- */
  fetch('catalogo.json').then(r => r.json()).then(cfg => {
    CFG = cfg; DIS = cfg.disenos;
    const ig = `https://instagram.com/${cfg.instagram}`;
    $('#navContacto').href = cfg.whatsapp ? `https://wa.me/${cfg.whatsapp}` : ig;
    const frase = ['Remeras personalizadas en DTF', 'Oversize y básicas', 'Creatividad & calidad', 'Nuevos diseños', 'Hacemos tu diseño'];
    const t = $('#ticker'); const linea = frase.map(f => `<span>${f} ✦</span>`).join('');
    t.innerHTML = linea + linea + linea + linea;
    armarPerchero();
    const h = location.hash.slice(1).replace(/-/g, '_');
    const i = lista.findIndex(d => d.id === h);
    if (i >= 0) setTimeout(() => abrir(i), 300);
  }).catch(err => { $('#capName').textContent = 'No se pudo cargar el catálogo'; console.error(err); });
})();
