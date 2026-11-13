/* Perchero interactivo · Agustín diseños personalizados
   Los diseños se cargan desde catalogo.json: cada diseño es un PNG/WebP sin fondo en /disenos
   y se estampa en vivo sobre la foto de la remera del color elegido. */
(() => {
  const $ = (s) => document.querySelector(s);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ASPECTO = { oversize: 1050 / 1064, basica: 665 / 638 };
  const ESCALA_CORTE = { oversize: 1, basica: 0.84 }; // la básica se ve más angosta, como en la realidad
  const SOMBRA_PAD = { oversize: 60 / 720, basica: 60 / 638 };

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

  /* ---------- percha (gancho) ---------- */
  function gancho(h) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 40 60'); s.setAttribute('class', 'hook');
    s.style.height = h + 'px'; s.style.width = (h * 40 / 60) + 'px';
    s.innerHTML = `<defs><linearGradient id="gm" x1="0" x2="1"><stop offset="0" stop-color="#5E5C59"/><stop offset=".45" stop-color="#E9E8E5"/><stop offset="1" stop-color="#8F8D89"/></linearGradient></defs>
      <path d="M20 60 V40 C20 33 27.5 31 27.5 20 C27.5 10 20.5 4.6 15.5 6.6 C12 8 11.6 12.6 13.8 14.6" fill="none" stroke="url(#gm)" stroke-width="3.2" stroke-linecap="round"/>
      <rect x="13" y="52" width="14" height="8" rx="2" fill="#2A2724"/>`;
    return s;
  }
  // Arma la percha + remera. Devuelve el nodo .swing y el canvas.
  function prenda(w, corte) {
    const hookH = w * 0.2;
    const sw = w * ESCALA_CORTE[corte];
    const sh = sw * ASPECTO[corte];
    const swing = document.createElement('div'); swing.className = 'swing';
    swing.style.width = w + 'px'; swing.style.height = (hookH + sh) + 'px';
    swing.style.setProperty('--pivot', (hookH * 0.12) + 'px');
    swing.appendChild(gancho(hookH));
    const shirt = document.createElement('div'); shirt.className = 'shirt';
    shirt.style.width = sw + 'px'; shirt.style.top = (hookH * 0.9) + 'px';
    const pad = SOMBRA_PAD[corte];
    const sombra = new Image(); sombra.className = 'sombra'; sombra.alt = ''; sombra.src = `img/${corte}/sombra.webp`;
    sombra.style.width = sw * (1 + 2 * pad) + 'px';
    sombra.style.left = (-pad * sw + sw * 0.06) + 'px'; sombra.style.top = (-pad * sw + sw * 0.07) + 'px';
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw); canvas.height = Math.round(sh);
    shirt.append(sombra, canvas); swing.appendChild(shirt);
    return { swing, canvas, hookH, sw };
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
  const rack = $('#rack'), track = $('#track');
  let topOff = 0, items = [], W = 0, paso = 0, x = 0, v = 0, vPrev = 0, minX = 0, maxX = 0, viewW = 0;
  let drag = null, movido = false, rafOn = false, last = 0, hoverIdx = -1;

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
    W = Math.max(110, Math.min(330, h * 0.66, viewW * (viewW < 600 ? 0.5 : 0.22)));
    paso = W * 0.8;
    track.innerHTML = ''; items = [];
    lista.forEach((d, i) => {
      const corte = corteDe(d), color = colorDe(d, corte);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'item';
      b.setAttribute('aria-label', `${d.nombre}, corte ${CFG.cortes[corte].nombre}. Ver detalle`);
      const { swing, canvas, hookH } = prenda(W, corte);
      b.style.width = W + 'px'; b.appendChild(swing); track.appendChild(b);
      const alto = hookH + W * ASPECTO.oversize;
      topOff = Math.max(8, (h - alto) * 0.38);
      rack.style.setProperty('--rod-y', (topOff + hookH * 0.12 - 3) + 'px');
      componer(canvas, d, corte, color, 'frente', Math.min(560, W * 2)).catch(console.warn);
      const it = { el: b, swing, d, corte, color, i, p: pend() };
      b.addEventListener('click', (e) => { if (movido) { e.preventDefault(); return; } abrir(i); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !drag) { it.p.w += (e.movementX || 1) > 0 ? 40 : -40; hoverIdx = i; kick(); } });
      b.addEventListener('pointerleave', () => { if (hoverIdx === i) hoverIdx = -1; });
      b.addEventListener('focus', () => { centrar(i); });
      items.push(it);
    });
    const total = (lista.length - 1) * paso + W;
    const margen = Math.max(16, viewW * 0.06);
    if (total + 2 * margen <= viewW) { minX = maxX = (viewW - total) / 2; }
    else { maxX = margen; minX = viewW - total - margen; }
    x = minX === maxX ? minX : Math.min(maxX, Math.max(minX, x));
    if (minX !== maxX && !armado) { x = maxX; v = -500; } // pequeña entrada animada
    armado = true;
    // las remeras entran balanceándose
    items.forEach((it, k) => { it.p.a = reduce ? 0 : (k % 2 ? 6 : -6); });
    kick();
  }
  let armado = false;

  function centrar(i) {
    if (minX === maxX) return;
    const objetivo = viewW / 2 - (i * paso + W / 2);
    v = (objetivo - x) * 6; kick();
  }

  function kick() { if (!rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000); last = t;
    let vivo = false;
    if (!drag) {
      x += v * dt;
      const fr = Math.pow(0.04, dt); v *= fr;                 // inercia
      if (x > maxX) { v += (maxX - x) * 120 * dt; v *= 0.85; }  // rebote suave en los bordes
      if (x < minX) { v += (minX - x) * 120 * dt; v *= 0.85; }
      if (Math.abs(v) > 2 || x > maxX + 0.5 || x < minX - 0.5) vivo = true;
      else { v = 0; x = Math.min(maxX, Math.max(minX, x)); }
    } else vivo = true;
    const acc = (v - vPrev) / Math.max(dt, 0.001); vPrev = v;
    let centro = -1, mejor = 1e9;
    for (const it of items) {
      const px = x + it.i * paso;
      const cx = px + W / 2 - viewW / 2;
      if (Math.abs(cx) < mejor) { mejor = Math.abs(cx); centro = it.i; }
      const ry = reduce ? 0 : Math.max(-28, Math.min(28, -cx / viewW * 34));   // curvatura 3D del perchero
      const empuje = reduce ? 0 : Math.max(-900, Math.min(900, -acc * 0.05 - v * 0.02));
      if (pasoPendulo(it.p, dt, empuje)) vivo = true;
      it.el.style.transform = `translate3d(${px}px,${topOff}px,0) perspective(900px) rotateY(${ry}deg)`;
      it.el.style.zIndex = 1000 - Math.round(Math.abs(cx));
      it.swing.style.transform = `rotate(${it.p.a}deg)`;
    }
    const idx = hoverIdx >= 0 ? hoverIdx : centro;
    if (items[idx]) $('#capName').textContent = items[idx].d.nombre;
    if (vivo) requestAnimationFrame(loop); else rafOn = false;
  }

  // arrastre con mouse o dedo
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
    let w = Math.min(520, (vh * 0.98) / (0.2 + ESCALA_CORTE[corte] * ASPECTO[corte]), vw - flechas);
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
