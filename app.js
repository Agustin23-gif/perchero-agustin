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
      const o = off.getContext('2d');
      o.drawImage(dis, x, y, dw, dh);
      o.globalCompositeOperation = 'multiply'; o.drawImage(luz, 0, 0, W, H);   // pliegues y luz de la tela
      o.globalCompositeOperation = 'destination-in'; o.drawImage(dis, x, y, dw, dh);
      est = off;
    }
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, W, H);
    c.drawImage(base, 0, 0, W, H);
    if (est) { c.globalAlpha = 0.97; c.drawImage(est, 0, 0); c.globalAlpha = 1; }
  }

  /* ---------- percha de madera + gancho ---------- */
  // Medidas de la percha tomadas de la foto de la remera básica (relativas al ancho de la básica).
  const PERCHA = { ancho: 0.2598, izq: -0.1371, arriba: -0.096, prop: 186 / 379 };
  function gancho(h) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 40 60'); s.setAttribute('class', 'hook');
    s.style.height = h + 'px'; s.style.width = (h * 40 / 60) + 'px';
    s.innerHTML = `<defs><linearGradient id="gm" x1="0" x2="1"><stop offset="0" stop-color="#4E4C49"/><stop offset=".45" stop-color="#D9D8D4"/><stop offset="1" stop-color="#7C7A76"/></linearGradient></defs>
      <path d="M20 61 V42 C20 35 27.5 32 27.5 20 C27.5 10 20.5 4.6 15.5 6.6 C12 8 11.6 12.6 13.8 14.6" fill="none" stroke="url(#gm)" stroke-width="2.6" stroke-linecap="round"/>`;
    return s;
  }
  function geometria(w, corte) {
    const swB = w * ESCALA_CORTE.basica;
    const hookH = w * 0.17;
    const sw = w * ESCALA_CORTE[corte];
    const sh = sw * ASPECTO[corte];
    const shirtTop = hookH - PERCHA.arriba * swB;
    return { swB, hookH, sw, sh, shirtTop, alto: shirtTop + sh };
  }
  // Arma la percha + remera. Devuelve el nodo .swing y el canvas.
  function prenda(w, corte) {
    const g = geometria(w, corte);
    const swing = document.createElement('div'); swing.className = 'swing';
    swing.style.width = w + 'px'; swing.style.height = g.alto + 'px';
    swing.style.setProperty('--pivot', (g.hookH * 0.12) + 'px');
    swing.appendChild(gancho(g.hookH + 2));
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
    shirt.append(sombra, canvas); swing.appendChild(shirt);
    return { swing, canvas, hookH: g.hookH, sw: g.sw, shirt };
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

  function corteDe(d) { return filtro === 'todo' ? d.cortes[0] : filtro; }
  function colorDe(d, corte) {
    const ids = CFG.cortes[corte].colores.map(c => c.id);
    if (ids.includes(d.color)) return d.color;
    const parecido = (CFG.parecidos || {})[d.color];   // ej.: verde musgo (oversize) → verde botella (básica)
    return ids.includes(parecido) ? parecido : (ids.includes('blanco') ? 'blanco' : ids[0]);
  }

  function armarPerchero() {
    lista = DIS.filter(d => filtro === 'todo' || d.cortes.includes(filtro));
    const h = rack.clientHeight; viewW = rack.clientWidth;
    const g1 = geometria(1, 'oversize');
    W = Math.max(130, Math.min(360, (h - 16) / g1.alto, viewW * (viewW < 600 ? 0.62 : 0.26)));
    S = W * 0.3; E = W * 0.86;
    const g = geometria(W, 'oversize');
    topOff = Math.max(6, (h - g.alto) * 0.4);
    rack.style.setProperty('--rod-y', (topOff + g.hookH * 0.1 - 3) + 'px');
    track.innerHTML = ''; items = [];
    lista.forEach((d, i) => {
      const corte = corteDe(d), color = colorDe(d, corte);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item';
      b.setAttribute('aria-label', `${d.nombre}, corte ${CFG.cortes[corte].nombre}. Ver detalle`);
      const { swing, canvas, shirt } = prenda(W, corte);
      b.style.width = W + 'px'; b.appendChild(swing); track.appendChild(b);
      if (d.etiqueta) { const t = document.createElement('span'); t.className = 'etiqueta'; t.textContent = d.etiqueta; shirt.appendChild(t); }
      componer(canvas, d, corte, color, 'frente', Math.min(620, W * 1.8)).catch(console.warn);
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
      it.el.style.transform = `translate3d(${it.cx - W / 2}px,${topOff}px,0) perspective(1100px) rotateY(${ry}deg)`;
      it.el.style.zIndex = 500 - Math.abs(it.i - activo) * 2 + Math.round(it.o);
      it.swing.style.transform = `rotate(${it.p.a}deg)`;
      it.el.classList.toggle('frente', it.o > 0.5);
    }
    if (items[activo]) $('#capName').textContent = items[activo].d.nombre;
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
    let w = Math.min(520, (vh * 0.98) / geometria(1, corte).alto, vw - flechas);
    return Math.max(120, w);
  }
  async function pintarFig(dir = 0) {
    const d = lista[sel.i];
    const w = medidasFig(sel.corte);
    const nuevo = prenda(w, sel.corte);
    await componer(nuevo.canvas, d, sel.corte, sel.color, sel.lado, Math.round(w * (devicePixelRatio > 1 ? 2 : 1.4))).catch(console.warn);
    detFig.innerHTML = ''; detFig.appendChild(nuevo.swing);
    detFig.style.width = w + 'px'; detFig.style.marginLeft = (-w / 2) + 'px';
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
      b.onclick = () => { if (id === sel.corte) return; sel.corte = id; sel.color = colorDe({ color: sel.color }, id); if (!CFG.cortes[id].lados.includes(sel.lado)) sel.lado = 'frente'; textos(); pintarFig().then(() => empujar(60)); };
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
    cfgC.colores.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tag';
      b.style.setProperty('--c', c.hex); b.setAttribute('aria-label', c.nombre); b.title = c.nombre;
      b.setAttribute('aria-pressed', c.id === sel.color ? 'true' : 'false');
      b.onclick = () => { sel.color = c.id; textos(); pintarFig().then(() => empujar(45)); };
      cs.appendChild(b);
      if (c.id === sel.color) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'center' }));
    });
    const col = cfgC.colores.find(c => c.id === sel.color);
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
    sel = { i, corte: it ? it.corte : d.cortes[0], color: it ? it.color : d.color, lado: 'frente' };
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
    sel = { i: n, corte, color: colorDe(d, corte), lado: 'frente' };
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
