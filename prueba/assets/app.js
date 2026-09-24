/* Picksin — pagina de una sola pantalla con cinco secciones, todas archivadas por semana
   (jueves a miercoles, hora del centro de Mexico):

     #/analisis[/<jueves>[/<liga>-j<N>]]        analisis de cada liga para su jornada
     #/auditoria[/<jueves>[/<liga>-j<N>]]       auditoria de cada liga, pick por pick
     #/escogidos[/<jueves>][?vista=&liga=&por=]  picks escogidos de la semana, por dia o por liga
     #/resultados[/<jueves>]                    auditoria de los picks escogidos
     #/seleccionadores[/<jueves>]               buenas y malas de cada seleccionador

   Todo sale de data/*.json, que genera publicar_sitio.py: aqui no se calcula ninguna
   probabilidad. Lo unico que se cuenta en la pagina es el marcador de los picks escogidos,
   porque la seleccion se hace aqui mismo: cada seleccionador (picksin, maki, diego...) entra
   con su clave y el intermediario (automatizacion/editor/worker.js, en Cloudflare) guarda sus
   picks en data/escogidos/<jueves>.json con el nombre de quien escogio cada uno. */
(function () {
  'use strict';

  /* direccion del intermediario del modo editor (Cloudflare Worker); vacia = aun sin conectar */
  var EDITOR = '';

  var CONFIG = { local: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) };
  CONFIG.editor = CONFIG.local ? location.origin + '/editor' : EDITOR.replace(/\/+$/, '');
  /* carpeta de esta copia dentro del repositorio ('' la pagina real, 'prueba/' la de prueba) */
  CONFIG.carpeta = document.documentElement.getAttribute('data-carpeta') || '';
  /* color de cada seleccionador; quien no este aqui toma uno de reserva */
  var COLORES = { picksin: '#1279bb', maki: '#2e8f35', diego: '#b45309' };
  var RESERVA = ['#7c3aed', '#0e7490', '#be185d', '#4d7c0f'];

  /* ================================================================== utilidades */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pct = function (p) { return p == null ? '—' : (p * 100).toFixed(1) + '%'; };
  var num = function (x, d) { return x == null ? '—' : Number(x).toFixed(d == null ? 1 : d); };
  var unicos = function (a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); };
  var plural = function (n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); };
  var copia = function (x) { return JSON.parse(JSON.stringify(x)); };

  function ls(k, v) {
    try {
      if (v === undefined) { return localStorage.getItem(k); }
      if (v === null) { localStorage.removeItem(k); } else { localStorage.setItem(k, v); }
    } catch (e) { /* navegador sin almacenamiento: el modo editor no se recuerda */ }
    return null;
  }

  /* ---------------------------------------------------------------- fechas */
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
    'octubre', 'noviembre', 'diciembre'];
  var MESES_C = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function fecha(s) { var p = String(s).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function masDias(s, n) { var d = fecha(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function hoy() { return iso(new Date(Date.now() - 6 * 3600 * 1000)); }     // centro de Mexico (UTC-6)
  function semanaDe(s) { var d = fecha(s); return masDias(s, -((d.getUTCDay() + 3) % 7)); }   // jueves
  function fCorta(s) {
    if (!s) { return ''; }
    var d = fecha(s);
    return DIAS_C[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MESES_C[d.getUTCMonth()];
  }
  function fLarga(s) {
    var d = fecha(s), t = DIAS[d.getUTCDay()];
    return t.charAt(0).toUpperCase() + t.slice(1) + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()];
  }
  function rango(a, b) {
    if (!a) { return ''; }
    if (!b || a === b) { return fCorta(a); }
    var da = fecha(a), db = fecha(b);
    return da.getUTCMonth() === db.getUTCMonth()
      ? DIAS_C[da.getUTCDay()] + ' ' + da.getUTCDate() + ' – ' + fCorta(b)
      : fCorta(a) + ' – ' + fCorta(b);
  }
  function rangoSemana(s) {
    var a = fecha(s), b = fecha(masDias(s, 6));
    return a.getUTCDate() + (a.getUTCMonth() !== b.getUTCMonth() ? ' ' + MESES_C[a.getUTCMonth()] : '') +
      ' – ' + b.getUTCDate() + ' ' + MESES_C[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  }
  function etiquetaSemana(s) {
    var a = semanaDe(hoy());
    if (s === a) { return 'esta semana'; }
    if (s === masDias(a, 7)) { return 'próxima'; }
    if (s === masDias(a, -7)) { return 'pasada'; }
    return '';
  }
  function cuando(p) {
    if (!p.fecha) { return p.dia || 'fecha por confirmar'; }
    return fCorta(p.fecha) + (p.hora ? ' · ' + p.hora : '');
  }

  /* ---------------------------------------------------------------- datos */
  var memo = {};
  function cargar(url, opcional) {
    if (!memo[url]) {
      memo[url] = fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (r.status === 404 && opcional) { return null; }
        if (!r.ok) { throw new Error('No se pudo cargar ' + url + ' (' + r.status + ')'); }
        return r.json();
      });
      memo[url].catch(function () { delete memo[url]; });
    }
    return memo[url];
  }
  var indice = function () { return cargar('data/index.json'); };
  var semanaIdx = function (s) { return cargar('data/semanas/' + s + '/index.json', true); };
  var docLiga = function (s, a) { return cargar('data/semanas/' + s + '/' + a + '.json'); };
  var resultados = function (s) { return cargar('data/semanas/' + s + '/resultados.json', true); };

  function semanaDefecto(idx, tipo) {
    var campo = (tipo === 'auditoria' || tipo === 'resultados') ? 'auditadas' : 'analisis';
    var s = (idx.semanas || []).filter(function (x) { return x[campo] > 0; })[0];
    return s ? s.id : null;
  }

  /* ================================================================== emojis */
  var SECC = {
    analisis: ['📊', 'Análisis por liga', 'La próxima jornada de cada liga: TOP 5, sugeridos, mercados y partidos.'],
    auditoria: ['🔍', 'Auditoría por liga', 'Cada jornada jugada, contrastada pick por pick con el resultado real.'],
    escogidos: ['✅', 'Picks escogidos', 'La selección de la semana, ordenada por el día en que se juega.'],
    resultados: ['🏅', 'Auditoría de picks escogidos', 'Cómo le fue a la selección de cada semana.'],
    seleccionadores: ['👥', 'Seleccionadores', 'Quién escogió cada pick y cuántas buenas y malas lleva cada uno.']
  };
  var EMOJI_SECCION = {
    top_a_moneyline_btts: '🥅', top_b_ou_goles_remates_sot: '🎯', top_c_ou_tarjetas_corners_faltas: '📏',
    top_d_dominio: '💪', r8a_gol_1h: '⚡', r8b_tarjeta_1h: '🟨', r8c_carrera_3_corners_1h: '🏁',
    r9a_choque_disciplinario: '🟥', r9b_predominio_faltas: '🦵', r9c_supremacia_offsides: '🚩',
    r9d_carrera_5_corners: '🏎️', r9e_intensidad_compartida: '🔥', r9f_consistencia_goleadora: '🔁',
    r9g_mitad_mas_goles: '⏳', r9h_carrera_3_corners: '⛳'
  };
  var EMOJI_PERSONA = { a_el_muro: '🧱', b_la_disparidad: '⚖️', c_la_boveda: '🔐', d_el_espejismo: '🏜️', e_el_radar: '📡' };
  var EMOJI_METRICA = { remates: '🎯', sot: '🥅', corners: '⛳', tarjetas: '🟨', faltas: '🦵', offsides: '🚩' };
  var ESTADO = {
    acierto: { e: '✅', t: 'Acertado' }, fallo: { e: '❌', t: 'Fallado' }, anulado: { e: '➖', t: 'Anulado' },
    no_comprobable: { e: '❓', t: 'No comprobable' }, pendiente: { e: '⏳', t: 'Por jugarse' }
  };
  function emojiOrigen(o) {
    if (!o) { return '📌'; }
    if (o === 'TOP 5') { return '🏆'; }
    for (var k in EMOJI_PERSONA) { if (k.slice(2).replace(/_/g, ' ') === o.toLowerCase().replace(/ó/g, 'o')) { return EMOJI_PERSONA[k]; } }
    return '📊';
  }
  var bandera = function (b) { return b ? '<span class="bandera" aria-hidden="true">' + esc(b) + '</span>' : ''; };

  /* ---------------------------------------------------------------- seleccionadores */
  function colorDe(n) {
    if (COLORES[n]) { return COLORES[n]; }
    var h = 0;
    for (var i = 0; i < n.length; i++) { h = (h * 31 + n.charCodeAt(i)) % 997; }
    return RESERVA[h % RESERVA.length];
  }
  function persona(n) { return '<span class="por" style="--c:' + colorDe(n) + '">' + esc(n) + '</span>'; }
  function personas(lista) { return (lista || []).map(persona).join(''); }
  /* el sello de un pick escogido: ✅ y quien lo escogio (se ve siempre, tambien en auditorias) */
  function sello(e) { return '<span class="sello">' + (e ? '✅ ' + personas(e.pick.por) : '') + '</span>'; }

  /* ================================================================== picks escogidos */
  /* un escogido: copia del pick + `por` (quienes lo escogieron) + `escogido` {persona: cuando} */
  function normalizarPick(e) {
    if (!Array.isArray(e.por)) { e.por = [e.por || 'picksin']; }        // escogidos de antes de los seleccionadores
    if (!e.escogido || typeof e.escogido !== 'object') {
      var t = e.escogido;
      e.escogido = {};
      if (t) { e.escogido[e.por[0]] = t; }
    }
    return e;
  }
  function normalizar(d, sem) {
    d = d || {};
    return { semana: sem, actualizado: d.actualizado || null, picks: (d.picks || []).map(function (e) { return normalizarPick(copia(e)); }) };
  }
  var Esc = { datos: {}, cargas: {} };
  Esc.cargar = function (sem) {
    if (!sem) { return Promise.resolve(normalizar(null, sem)); }
    if (Esc.datos[sem]) { return Promise.resolve(Esc.datos[sem]); }
    if (!Esc.cargas[sem]) {
      var estatico = function () { return cargar('data/escogidos/' + sem + '.json', true); };
      var p = Editor.activo
        ? llamar('leer', { semana: sem }).then(function (r) { return r.datos; }, estatico)
        : estatico();
      Esc.cargas[sem] = p.then(function (d) {
        if (!Esc.datos[sem]) {
          Esc.datos[sem] = normalizar(d, sem);
          cola.forEach(function (x) { if (x.sem === sem) { aplicarOp(Esc.datos[sem], x.op); } });
        }
        return Esc.datos[sem];
      }, function () { delete Esc.cargas[sem]; return normalizar(null, sem); });
    }
    return Esc.cargas[sem];
  };
  Esc.buscar = function (pid) {
    for (var s in Esc.datos) {
      var lista = Esc.datos[s].picks;
      for (var i = 0; i < lista.length; i++) { if (lista[i].id === pid) { return { sem: s, pick: lista[i] }; } }
    }
    return null;
  };
  Esc.deArchivo = function (archivo) {
    var out = [];
    for (var s in Esc.datos) { Esc.datos[s].picks.forEach(function (p) { if (p.archivo === archivo) { out.push(p); } }); }
    return out.sort(ordenPicks);
  };
  Esc.reiniciar = function () { Esc.datos = {}; Esc.cargas = {}; };
  function ordenPicks(a, b) {
    return (a.fecha || '9').localeCompare(b.fecha || '9') || (a.hora || '').localeCompare(b.hora || '') ||
      (a.nombre || '').localeCompare(b.nombre || '') || (a.partido || '').localeCompare(b.partido || '');
  }
  /* misma regla que el intermediario: cada quien anade o quita solo su nombre */
  function aplicarOp(datos, op) {
    var e = datos.picks.filter(function (x) { return x.id === op.pid; })[0];
    if (op.tipo === 'agregar') {
      if (!e) { e = normalizarPick(copia(op.pick)); e.por = []; e.escogido = {}; datos.picks.push(e); }
      if (e.por.indexOf(op.quien) < 0) { e.por.push(op.quien); e.escogido[op.quien] = new Date().toISOString(); }
    } else if (e) {
      e.por = e.por.filter(function (x) { return x !== op.quien; });
      delete e.escogido[op.quien];
      if (!e.por.length) { datos.picks = datos.picks.filter(function (x) { return x !== e; }); }
    }
    datos.picks.sort(ordenPicks);
  }

  /* un pick ya empezado (o de una jornada auditada) no se puede escoger ni quitar */
  function cerrado(p, auditada) {
    if (auditada) { return 'auditada'; }
    if (p.ts) { return Date.now() >= p.ts * 1000 ? 'empezado' : ''; }
    if (p.fecha && p.fecha < hoy()) { return 'empezado'; }
    return '';
  }

  /* ================================================================== modo editor */
  var Editor = { clave: ls('picksin.clave') || '', persona: ls('picksin.persona') || '', estado: 'ok', mensaje: '' };
  Editor.activo = !!(Editor.clave && Editor.persona && CONFIG.editor);
  ls('picksin.token', null);                   // la version anterior guardaba un token de GitHub: ya no se usa
  var cola = [], reloj = null, enCurso = false;

  function llamar(accion, cuerpo) {
    var datos = { clave: Editor.clave, carpeta: CONFIG.carpeta };
    for (var k in cuerpo) { datos[k] = cuerpo[k]; }
    return fetch(CONFIG.editor + '/' + accion, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('el editor respondió ' + r.status)); e.estado = r.status; throw e; }
        return j;
      });
    }, function () { throw new Error('no hay conexión con el editor'); });
  }
  function encolar(sem, op, envio) {
    cola.push({ sem: sem, op: op, envio: envio });
    clearTimeout(reloj);
    reloj = setTimeout(guardar, 900);
    pintarEditor('guardando');
  }
  function guardar() {
    if (enCurso) { clearTimeout(reloj); reloj = setTimeout(guardar, 600); return; }
    var lote = cola;
    cola = [];
    if (!lote.length) { return; }
    enCurso = true;
    llamar('cambiar', { ops: lote.map(function (x) { return x.envio; }) }).then(function (r) {
      enCurso = false;
      var archivos = r.archivos || {};
      Object.keys(archivos).forEach(function (sem) {           // la verdad es lo que guardo el intermediario
        Esc.datos[sem] = normalizar(archivos[sem], sem);
        cola.forEach(function (x) { if (x.sem === sem) { aplicarOp(Esc.datos[sem], x.op); } });
        delete memo['data/escogidos/' + sem + '.json'];
      });
      var recargas = unicos(lote.map(function (x) { return x.sem; })).filter(function (s) { return !(s in archivos); });
      recargas.forEach(function (s) { delete Esc.datos[s]; delete Esc.cargas[s]; });
      if ((r.rechazados || []).length) { avisar('🔒 No se guardó: ' + r.rechazados[0].motivo + '.'); }
      Promise.all(recargas.map(Esc.cargar)).then(function () {
        if (cola.length) { guardar(); } else { pintarEditor('ok'); }
        refrescarSeleccion();
      });
    }).catch(function (e) {
      enCurso = false;
      cola = lote.concat(cola);
      pintarEditor('error', e.estado === 401 ? 'tu clave ya no es válida; sal y vuelve a entrar' : e.message);
    });
  }
  function pendiente() { return cola.length > 0 || enCurso; }
  window.addEventListener('beforeunload', function (e) {
    if (pendiente()) { e.preventDefault(); e.returnValue = ''; }
  });

  function pintarEditor(estado, mensaje) {
    if (estado) { Editor.estado = estado; Editor.mensaje = mensaje || ''; }
    var b = $('#editor-barra');
    document.body.classList.toggle('con-editor', Editor.activo);
    $('.enlace-editor').textContent = Editor.activo ? '🔓 Salir del modo editor' : '🔑 Modo editor';
    if (!Editor.activo) { b.hidden = true; b.innerHTML = ''; return; }
    var e = Editor.estado === 'guardando' ? '<span>⏳ Guardando…</span>'
      : Editor.estado === 'error'
        ? '<span class="estado-error">⚠️ No se guardó: ' + esc(Editor.mensaje) + '</span><button type="button" data-accion="reintentar">Reintentar</button>'
        : '<span class="estado-ok">✓ Todo guardado</span>';
    b.innerHTML = '<span class="etiqueta-editor">✏️ Escoges como</span>' + persona(Editor.persona) + e +
      '<button type="button" data-accion="editor-salir">Salir</button>';
    b.hidden = false;
  }
  function abrirDialogo() {
    var d = $('#dlg-editor'), listo = !!CONFIG.editor;
    $('#dlg-error').hidden = listo;
    $('#dlg-error').textContent = listo ? '' : 'El modo editor todavía no está conectado: falta configurar el intermediario.';
    $('#clave').value = '';
    $('#clave').disabled = !listo;
    $('#dlg-entrar').disabled = !listo;
    $('#clave').placeholder = CONFIG.local ? 'vista previa: prueba, prueba-maki o prueba-diego' : 'tu clave';
    if (d.showModal) { d.showModal(); } else { d.setAttribute('open', ''); }
    setTimeout(function () { $('#clave').focus(); }, 30);
  }
  function cerrarDialogo() { var d = $('#dlg-editor'); if (d.close) { d.close(); } else { d.removeAttribute('open'); } }
  function entrar(clave) {
    Editor.clave = clave;
    return llamar('entrar', {}).then(function (j) {
      ls('picksin.clave', clave);
      ls('picksin.persona', j.persona);
      Editor.persona = j.persona;
      Editor.activo = true;
      Esc.reiniciar();
      return j.persona;
    }, function (e) {
      Editor.clave = '';
      throw e.estado === 401 ? new Error('Esa clave no es válida.') : e;
    });
  }
  function salir() {
    if (pendiente() && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) { return; }
    ls('picksin.clave', null);
    ls('picksin.persona', null);
    Editor.clave = ''; Editor.persona = ''; Editor.activo = false; cola = []; enCurso = false;
    Esc.reiniciar();
    pintarEditor('ok');
    avisar('Saliste del modo editor.');
    router(true);
  }

  /* ---------------------------------------------------------------- escoger / quitar */
  var REG = {};
  /* un mismo pick sale en el TOP 5, en sugeridos y en su ranking: manda el primero que se pinta */
  function registrar(p, o) {
    var pid = o.doc.archivo + '|' + p.partido + '|' + p.mercado;
    if (!REG[pid]) { REG[pid] = { pick: p, o: o }; }
    return pid;
  }
  /* de donde sale un pick dentro de su jornada: TOP 5, uno de los sugeridos o su ranking */
  function origenDe(d, p, porDefecto) {
    var igual = function (x) { return x && x.partido === p.partido && x.mercado === p.mercado; };
    if ((d.top5 || []).some(igual)) { return 'TOP 5'; }
    var s = (d.sugeridos || []).filter(function (x) { return igual(x.pick); })[0];
    if (s) { return s.nombre; }
    var r = (d.rankings || []).filter(function (x) { return (x.picks || []).some(igual); })[0];
    return r ? r.titulo : (porDefecto || '');
  }
  function registro(pid, r) {
    var p = r.pick, d = r.o.doc;
    var reg = { id: pid, archivo: d.archivo, liga: d.liga, nombre: d.nombre, pais: d.pais, bandera: d.bandera,
      jornada: d.jornada, sa: d.semana, origen: origenDe(d, p, r.o.origen) };
    ['partido', 'mercado', 'fecha', 'dia', 'hora', 'ts', 'sem', 'p', 'cuota', 'confianza', 'respaldo', 'familia', 'aviso',
      'liga_joven'].forEach(function (k) { if (p[k] != null && p[k] !== '') { reg[k] = p[k]; } });
    return reg;
  }
  function esMio(e) { return !!(e && Editor.activo && e.pick.por.indexOf(Editor.persona) >= 0); }
  function alternar(pid) {
    var r = REG[pid];
    if (!r || !Editor.activo) { return; }
    if (cerrado(r.pick, r.o.auditada)) { avisar('🔒 Ese partido ya empezó: el pick ya no se puede cambiar.'); return; }
    var ya = Esc.buscar(pid), yo = Editor.persona;
    if (esMio(ya)) {
      var q = { tipo: 'quitar', pid: pid, quien: yo };
      aplicarOp(Esc.datos[ya.sem], q);
      encolar(ya.sem, q, { tipo: 'quitar', semana: ya.sem, id: pid });
      avisar('Quitaste este pick de tus escogidos.');
      refrescarSeleccion();
      return;
    }
    var reg = registro(pid, r), sem = ya ? ya.sem : (reg.sem || (reg.fecha ? semanaDe(reg.fecha) : r.o.doc.semana));
    Esc.cargar(sem).then(function (datos) {
      var a = { tipo: 'agregar', pid: pid, quien: yo, pick: reg };
      aplicarOp(datos, a);
      encolar(sem, a, { tipo: 'agregar', sa: reg.sa, archivo: reg.archivo, partido: reg.partido, mercado: reg.mercado });
      avisar('✅ Escogido para el ' + (reg.fecha ? fLarga(reg.fecha).toLowerCase() : 'día por confirmar'),
        '#/escogidos/' + sem + '?liga=' + encodeURIComponent(reg.liga), 'Ver escogidos');
      refrescarSeleccion();
    });
  }
  /* sin repintar la pagina: se marcan las tarjetas y se rehace el bloque de la liga */
  function refrescarSeleccion() {
    var seccion = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || '';
    if (seccion === 'escogidos' || seccion === 'resultados' || seccion === 'seleccionadores') { router(true); return; }
    $$('[data-pid]').forEach(function (el) {
      if (el.tagName === 'BUTTON') { return; }
      var pid = el.getAttribute('data-pid'), r = REG[pid], e = Esc.buscar(pid);
      el.classList.toggle('es-escogido', !!e);
      var s = el.querySelector('.sello');
      if (s) { s.outerHTML = sello(e); }
      var b = el.querySelector('button[data-pid], .btn-escoger, .btn-mini');
      if (b && r) { b.outerHTML = botonEscoger(pid, r.pick, r.o, el.tagName === 'LI'); }
    });
    var bloque = $('#s-escogidos');
    if (bloque && bloque.getAttribute('data-archivo') && REG.__doc) { bloque.innerHTML = bloqueEscogidosLiga(REG.__doc); }
  }

  /* ================================================================== piezas */
  function chipConfianza(c) {
    if (!c) { return ''; }
    var k = String(c).toLowerCase();
    var cls = k.indexOf('alta') === 0 ? 'alta' : (k.indexOf('media') === 0 ? 'media' : 'baja');
    return '<span class="chip ' + cls + '">Confianza ' + esc(c) + '</span>';
  }
  function chipsPick(p, o) {
    var c = [chipConfianza(p.confianza)];
    if (p.cuota) { c.push('<span class="chip neutro">Cuota implícita ' + esc(num(p.cuota, 2)) + '</span>'); }
    if (p.respaldo) { c.push('<span class="chip neutro" title="Lo que hace cada equipo y lo que permite su rival">⚖️ Respaldo ' + esc(p.respaldo) + '</span>'); }
    if (p.liga_joven) { c.push('<span class="chip">🌱 Liga joven</span>'); }
    if (o.conOrigen && o.origen) { c.push('<span class="chip">' + emojiOrigen(o.origen) + ' ' + esc(o.origen) + '</span>'); }
    return '<div class="chips">' + c.join('') + '</div>';
  }
  function botonEscoger(pid, p, o, compacto) {
    if (!Editor.activo || o.escoger === false) { return ''; }
    var e = Esc.buscar(pid), mio = esMio(e), bloq = cerrado(p, o.auditada);
    if (bloq) {
      var t = bloq === 'auditada' ? 'Jornada ya auditada' : 'El partido ya empezó';
      return compacto ? '<button type="button" class="btn-mini" disabled title="' + t + '">🔒</button>'
        : '<button type="button" class="btn-escoger" disabled>🔒 ' + t + '</button>';
    }
    var a = ' data-accion="escoger" data-pid="' + esc(pid) + '" aria-pressed="' + mio + '"';
    return compacto
      ? '<button type="button" class="btn-mini' + (mio ? ' mio' : '') + '"' + a + ' aria-label="' + (mio ? 'Quitar de' : 'Añadir a') +
        ' mis picks escogidos">' + (mio ? '✓' : '＋') + '</button>'
      : '<button type="button" class="btn-escoger' + (mio ? ' mio' : '') + '"' + a + '>' +
        (mio ? '✓ Lo escogiste · tocar para quitar' : (e ? '＋ Escogerlo también' : '＋ Escoger este pick')) + '</button>';
  }
  function bloqueResultado(res) {
    if (!res) { return ''; }
    var e = ESTADO[res[0]] || ESTADO.no_comprobable;
    return '<div class="resultado ' + esc(res[0]) + '"><b>' + e.e + ' ' + e.t + '</b>' +
      (res[1] ? '<span>' + esc(res[1]) + '</span>' : '') + '</div>';
  }
  function ligaMini(d) {
    return '<span class="pick-liga">' + bandera(d.bandera) + '<a href="#/analisis/' + esc(d.semana) + '/' + esc(d.archivo) +
      '">⚽ ' + esc(d.nombre) + ' · J' + esc(d.jornada) + '</a></span>';
  }
  /* o: {doc, origen, cabecera, conLiga, conOrigen, resultado, auditada, escoger} */
  function tarjeta(p, o) {
    if (!p) { return ''; }
    var pid = registrar(p, o), sel = Esc.buscar(pid), res = o.resultado;
    var cab = '<div class="pick-cab">' +
      (o.conLiga ? ligaMini(o.doc) : '<span class="pick-dia">📅 ' + esc(cuando(p)) + '</span>') +
      sello(sel) + '</div>';
    var cuerpo = '<div class="pick-cuerpo"><div><h4 class="mercado">' + esc(p.mercado) + '</h4>' +
      '<p class="partido">' + esc(p.partido) +
      (o.conLiga ? (o.conDia ? ' · 📅 ' + esc(cuando(p)) : ' · 🕐 ' + esc(p.hora || cuando(p))) : '') + '</p></div>' +
      '<div class="precio"><b>' + pct(p.p) + '</b><small>probabilidad</small></div></div>';
    return '<article class="pick' + (sel ? ' es-escogido' : '') + (res ? ' r-' + esc(res[0]) : '') + '" data-pid="' + esc(pid) + '">' +
      (o.cabecera || '') + cab + cuerpo + chipsPick(p, o) +
      (p.aviso ? '<p class="nota-pick">⚠️ ' + esc(p.aviso) + '</p>' : '') +
      bloqueResultado(res) + botonEscoger(pid, p, o, false) + '</article>';
  }
  function fila(p, o) {
    var pid = registrar(p, o), sel = Esc.buscar(pid), res = o.resultado;
    return '<li class="fila' + (sel ? ' es-escogido' : '') + (res ? ' r-' + esc(res[0]) : '') + '" data-pid="' + esc(pid) + '">' +
      '<span class="m">' + esc(p.mercado) + '</span>' +
      '<span class="fila-fin">' + sello(sel) + '<span class="pp">' + pct(p.p) + '</span>' + botonEscoger(pid, p, o, true) + '</span>' +
      '<span class="pt">' + esc(p.partido) + ' · <span class="dia">📅 ' + esc(cuando(p)) + '</span>' +
      (p.respaldo ? ' · ⚖️ ' + esc(p.respaldo) : '') + '</span>' +
      (res ? '<span class="det">' + (ESTADO[res[0]] || ESTADO.no_comprobable).t + (res[1] ? ': ' + esc(res[1]) : '') + '</span>' : '') +
      '</li>';
  }
  function vacio(emoji, texto) { return '<div class="vacio"><span class="emoji">' + emoji + '</span>' + texto + '</div>'; }
  function cabecera(k) {
    var s = SECC[k];
    return '<div class="titulo-seccion"><span class="icono" aria-hidden="true">' + s[0] + '</span><div><h1>' + s[1] +
      '</h1><p class="sub">' + s[2] + '</p></div></div>';
  }
  function selectorSemana(idx, sem, seccion, q) {
    var lista = (idx.semanas || []).map(function (s) { return s.id; });
    if (lista.indexOf(sem) < 0) { lista.push(sem); lista.sort().reverse(); }
    var i = lista.indexOf(sem), nueva = lista[i - 1], vieja = lista[i + 1], etq = etiquetaSemana(sem);
    var dq = q ? ' data-q="' + esc(q) + '"' : '';
    var flecha = function (s, t, l) {
      return '<button type="button" class="flecha" data-accion="semana" data-seccion="' + seccion + '" data-sem="' + (s || '') + '"' +
        dq + (s ? '' : ' disabled') + ' aria-label="' + l + '">' + t + '</button>';
    };
    return '<div class="semana-sel">' + flecha(vieja, '‹', 'Semana anterior') +
      '<label class="semana-caja"><small>Semana · jue a mié</small><b>' + rangoSemana(sem) +
      (etq ? '<span class="etq-semana">' + etq + '</span>' : '') + '</b>' +
      '<select data-accion="semana-lista" data-seccion="' + seccion + '"' + dq + ' aria-label="Elegir semana">' +
      lista.map(function (s) {
        var e = etiquetaSemana(s);
        return '<option value="' + s + '"' + (s === sem ? ' selected' : '') + '>' + rangoSemana(s) + (e ? ' · ' + e : '') + '</option>';
      }).join('') + '</select></label>' + flecha(nueva, '›', 'Semana siguiente') + '</div>';
  }
  function porPais(ligas) {
    var grupos = [], idx = {};
    ligas.forEach(function (L) {
      if (!(L.pais in idx)) { idx[L.pais] = grupos.length; grupos.push({ pais: L.pais, bandera: L.bandera, ligas: [] }); }
      grupos[idx[L.pais]].ligas.push(L);
    });
    return grupos;
  }
  function cabLiga(d, sub) {
    return '<div class="cab-liga"><span class="bandera-grande">' + bandera(d.bandera) + '</span><div><h1>⚽ ' + esc(d.nombre) +
      '</h1><p class="sub">' + sub + '</p></div></div>';
  }
  function marcadorCajas(cajas) {
    return '<div class="marcador">' + cajas.map(function (c) {
      return '<div class="dato-caja ' + (c[2] || '') + '"><small>' + c[0] + '</small><b>' + c[1] + '</b></div>';
    }).join('') + '</div>';
  }
  function tira(n) {
    var tot = n.ok + n.ko + n.nulo + (n.pend || 0);
    if (!tot) { return ''; }
    var w = function (x) { return (100 * x / tot).toFixed(2) + '%'; };
    return '<div class="tira" aria-hidden="true"><i class="t-ok" style="width:' + w(n.ok) + '"></i><i class="t-ko" style="width:' +
      w(n.ko) + '"></i><i class="t-nulo" style="width:' + w(n.nulo) + '"></i><i class="t-pend" style="width:' + w(n.pend || 0) + '"></i></div>';
  }
  function pintar(html, titulo) {
    $('#app').innerHTML = html;
    document.title = (titulo ? titulo + ' · ' : '') + 'Picksin';
  }

  /* ================================================================== inicio */
  function vInicio() {
    return indice().then(function (idx) {
      var semA = semanaDefecto(idx, 'analisis'), semR = semanaDefecto(idx, 'auditoria');
      return Promise.all([semA ? semanaIdx(semA) : null, semR ? semanaIdx(semR) : null, Esc.cargar(semA),
        semR ? marcadorEscogidos(semR) : null, cargarTodas(idx)]).then(function (x) {
        var wA = x[0], wR = x[1], E = x[2], mR = x[3], tS = porSeleccionador(x[4]), lider = ordenTabla(tS)[0];
        var nA = wA ? wA.ligas.length : 0, aR = wR && wR.auditoria;
        var h = '<section class="portada"><img src="assets/logo.webp" alt="Picksin" width="160" height="189">' +
          '<h1>Picks de fútbol con respaldo estadístico</h1>' +
          '<p>' + idx.ligas.length + ' ligas analizadas por el Motor Picksin 2.0. Cada semana, de jueves a miércoles: análisis, selección y auditoría.</p>' +
          (semA ? '<span class="pastilla">📅 Semana del ' + rangoSemana(semA) + '</span>' : '') + '</section>';
        var baldosas = [
          ['analisis', '📊', 'Análisis por liga', 'La próxima jornada de cada liga.',
            nA ? plural(nA, 'liga analizada', 'ligas analizadas') : 'Sin análisis todavía', ''],
          ['auditoria', '🔍', 'Auditoría por liga', 'Jornadas jugadas contra el resultado real.',
            aR ? pct(aR.acierto) + ' en ' + aR.picks + ' picks' : 'Aún sin auditorías', ''],
          ['escogidos', '✅', 'Picks escogidos', 'La selección de la semana, por día.',
            E.picks.length ? plural(E.picks.length, 'pick escogido', 'picks escogidos') : 'Sin picks escogidos aún', 'verde'],
          ['resultados', '🏅', 'Auditoría de picks escogidos', 'Cómo le fue a cada selección.',
            mR && (mR.ok + mR.ko) ? mR.ok + ' de ' + (mR.ok + mR.ko) + ' acertados' : 'Sin resultados todavía', 'verde'],
          ['seleccionadores', '👥', 'Seleccionadores', 'Buenas y malas de cada quien.',
            lider && tS[lider].comp ? '🥇 ' + esc(lider) + ' · ' + tS[lider].ok + '–' + tS[lider].ko : plural(Object.keys(tS).length, 'seleccionador', 'seleccionadores'), '']
        ];
        h += '<div class="mosaico">' + baldosas.map(function (b) {
          return '<a class="baldosa ' + b[5] + '" href="#/' + b[0] + '"><span class="icono" aria-hidden="true">' + b[1] + '</span><b>' +
            b[2] + '</b><span>' + b[3] + '</span><span class="dato">' + b[4] + '</span></a>';
        }).join('') + '</div>';

        var proximos = E.picks.filter(function (p) { return !p.fecha || p.fecha >= hoy(); }).slice(0, 6);
        if (proximos.length) {
          h += '<h2><span class="emoji">🗓️</span>Próximos picks escogidos</h2><div class="grid-picks">' +
            proximos.map(function (p) { return tarjetaEscogido(p, null, { conDia: true }); }).join('') + '</div>' +
            '<p><a class="boton secundario" href="#/escogidos/' + semA + '">Ver todos los escogidos de la semana ›</a></p>';
        }
        h += '<h2><span class="emoji">🧭</span>Cómo leer un pick</h2><div class="tabla-caja"><ul class="lista">' +
          [['📈', 'Probabilidad', 'lo que el Motor Picksin 2.0 calcula para ese mercado, ya calibrado.'],
            ['🎟️', 'Cuota implícita', 'la cuota que corresponde a esa probabilidad.'],
            ['⚖️', 'Respaldo bilateral', 'cuántos de los cuatro componentes (lo que hace cada equipo y lo que permite su rival) apoyan el pick.'],
            ['🟢', 'Confianza', 'Alta, Media o Baja según la solidez de la muestra y la consistencia del partido.'],
            ['✅', 'Escogido', 'pick seleccionado para la semana; su resultado se audita en «Auditoría de picks escogidos».'],
            ['👤', 'Seleccionador', 'quién lo escogió: ' + Object.keys(COLORES).map(persona).join(' ') + '. Cada quien lleva su cuenta en «Seleccionadores».']
          ].map(function (x) {
            return '<li class="fila"><span class="m">' + x[0] + ' ' + x[1] + '</span><span></span><span class="pt">' + x[2] + '</span></li>';
          }).join('') + '</ul></div>';
        pintar(h);
      });
    });
  }

  /* ================================================================== 1. analisis */
  function vAnalisis(partes) {
    if (partes[1]) { return vLiga(partes[0], partes[1]); }
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'analisis');
      if (!sem) { return pintar(cabecera('analisis') + vacio('📭', 'Todavía no hay análisis publicados.'), 'Análisis'); }
      return Promise.all([semanaIdx(sem), Esc.cargar(sem)]).then(function (x) {
        var w = x[0], ligas = (w && w.ligas) || [];
        var h = cabecera('analisis') + selectorSemana(idx, sem, 'analisis');
        if (!ligas.length) {
          h += vacio('📭', 'No hay análisis archivados en esta semana.');
        } else {
          var desde = ligas.map(function (L) { return L.desde; }).filter(Boolean).sort()[0];
          var hasta = ligas.map(function (L) { return L.hasta; }).filter(Boolean).sort().pop();
          h += '<p class="sub">⚽ <b>' + ligas.length + '</b> ' + (ligas.length === 1 ? 'liga analizada' : 'ligas analizadas') +
            (desde ? ' · partidos del ' + rango(desde, hasta) : '') + '</p>';
          h += porPais(ligas).map(function (g) {
            return '<h2 class="pais">' + bandera(g.bandera) + esc(g.pais) + '</h2><div class="rejilla">' +
              g.ligas.map(function (L) {
                var n = Esc.deArchivo(L.archivo).length;
                return '<a class="liga" href="#/analisis/' + sem + '/' + esc(L.archivo) + '"><div class="liga-txt">' +
                  '<div class="liga-nombre">⚽ ' + esc(L.nombre) +
                  (L.narrativa ? ' <span class="chip">📖 Con narrativa</span>' : '') +
                  (L.liga_joven ? ' <span class="chip neutro">🌱 Liga joven</span>' : '') + '</div>' +
                  '<div class="liga-linea">📅 Jornada <b>' + esc(L.jornada) + '</b>' + (L.desde ? ' · ' + rango(L.desde, L.hasta) : '') + '</div>' +
                  '<div class="liga-linea">🏆 <b>' + esc(L.n_top5) + '</b> en el TOP 5 · ' + esc(L.n_partidos) + ' partidos' +
                  (n ? ' · <span class="sello">✅ ' + n + ' escogido' + (n === 1 ? '' : 's') + '</span>' : '') + '</div>' +
                  '</div><span class="flecha-der" aria-hidden="true">›</span></a>';
              }).join('') + '</div>';
          }).join('');
        }
        var con = {};
        ligas.forEach(function (L) { con[L.liga] = true; });
        var faltan = idx.ligas.filter(function (L) { return !con[L.id]; });
        if (faltan.length) {
          h += '<details class="caja" data-k="sin-analisis" style="margin-top:26px"><summary><span class="emoji">💤</span>Sin análisis esta semana' +
            '<span class="cuenta">' + faltan.length + '</span></summary><div class="cuerpo"><div class="liga-apagada">' +
            faltan.map(function (L) { return '<span>' + bandera(L.bandera) + ' ⚽ ' + esc(L.nombre) + '</span>'; }).join('') +
            '</div></div></details>';
        }
        if (idx.copas && idx.copas.length) {
          h += '<h2><span class="bandera">🇪🇺</span>Competiciones europeas</h2>' + vacio('🏆', 'Próximamente: ' +
            idx.copas.map(function (c) { return '⚽ ' + esc(c.nombre); }).join(', ') +
            '. Necesitan un modo propio del motor: cada equipo juega pocos partidos y viene de una liga distinta.');
        }
        pintar(h, 'Análisis');
      });
    });
  }

  function todosLosPicks(d) {
    var out = (d.top5 || []).slice();
    (d.sugeridos || []).forEach(function (s) { if (s.pick) { out.push(s.pick); } });
    (d.rankings || []).forEach(function (r) { out = out.concat(r.picks || []); });
    return out;
  }
  function bloqueEscogidosLiga(d) {
    var lista = Esc.deArchivo(d.archivo);
    if (!lista.length) {
      return Editor.activo ? '<p class="nota verde">✏️ Toca <b>＋ Escoger</b> en cualquier pick: aparecerá aquí y en los ' +
        '<a href="#/escogidos/' + esc(d.semana) + '">picks escogidos de la semana</a>, en el día en que se juega.</p>' : '';
    }
    return '<h2><span class="emoji">✅</span>Picks escogidos de esta liga <span class="cuenta">' + lista.length + '</span></h2>' +
      '<div class="grid-picks">' + lista.map(function (p) {
        return tarjeta(p, { doc: d, origen: p.origen, conOrigen: true, auditada: !!d.auditoria });
      }).join('') + '</div>' +
      '<p><a class="boton secundario" href="#/escogidos/' + esc(semanaDe(lista[0].fecha || d.semana)) + '?liga=' + esc(d.liga) +
      '">Ver en los escogidos de la semana ›</a></p>';
  }
  function fichasPorDia(d, mapaRes) {
    var grupos = {}, orden = [];
    (d.partidos || []).forEach(function (f) {
      var k = f.fecha || '';
      if (!(k in grupos)) { grupos[k] = []; orden.push(k); }
      grupos[k].push(f);
    });
    return orden.map(function (k) {
      return '<div class="dia-cab">🗓️ ' + (k ? fLarga(k) : 'Fecha por confirmar') + '<span class="cuenta">' + grupos[k].length +
        (grupos[k].length === 1 ? ' partido' : ' partidos') + '</span></div>' + grupos[k].map(function (f) { return ficha(f, d); }).join('');
    }).join('');
  }
  function ficha(f, d) {
    var g = f.goles || {};
    var marc = (g.marcadores || []).map(function (m) { return esc(m[0]) + ' (' + pct(m[1]) + ')'; }).join(' · ');
    var filas = (f.metricas || []).map(function (m) {
      return '<tr><td>' + (EMOJI_METRICA[m.clave] || '') + ' ' + esc(m.nombre) + '</td><td class="num">' + num(m.total) + '</td>' +
        '<td class="num">' + (m.rango ? esc(m.rango[0]) + '–' + esc(m.rango[1]) : '—') + '</td>' +
        '<td class="num">' + esc(m.linea || '—') + '</td><td class="num">' + pct(m.over) + '</td>' +
        '<td class="num">' + pct(m.local_mas) + '</td></tr>';
    }).join('');
    return '<details class="caja" data-k="f-' + esc(d.archivo + f.local) + '"><summary>⚽ ' + esc(f.local) + ' vs ' + esc(f.visitante) +
      '<span class="cuenta">' + (f.hora ? '🕐 ' + esc(f.hora) : esc(f.dia || '')) + '</span></summary><div class="cuerpo">' +
      '<div class="x12"><div>🏠 Local<b>' + pct(g.p_local) + '</b></div><div>🤝 Empate<b>' + pct(g.p_empate) + '</b></div>' +
      '<div>✈️ Visitante<b>' + pct(g.p_visitante) + '</b></div></div>' +
      '<div class="datos"><div><span>⚽ Goles esperados</span> <b>' + num(g.total, 2) + '</b></div>' +
      '<div><span>📈 Más de 2.5</span> <b>' + pct(g.over25) + '</b></div>' +
      '<div><span>🔁 Ambos marcan</span> <b>' + pct(g.btts) + '</b></div>' +
      '<div><span>⚡ Gol en el 1T</span> <b>' + pct(g.over05_1t) + '</b></div></div>' +
      (marc ? '<p class="criterio">🎯 Marcadores más probables: ' + marc + '</p>' : '') +
      (filas ? '<div class="tabla-scroll"><table><thead><tr><th>Partido completo</th><th class="num">Proyección</th>' +
        '<th class="num">Rango 80%</th><th class="num">Línea</th><th class="num">Más de la línea</th>' +
        '<th class="num">Local hace más</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '') +
      '</div></details>';
  }
  /* analisis (o auditoria, con mapaRes) de una jornada: TOP 5, sugeridos y rankings */
  function cuerpoJornada(d, mapaRes) {
    var aud = !!mapaRes, h = '';
    var res = function (p) { return aud ? (mapaRes[p.partido + '|' + p.mercado] || ['no_comprobable', '']) : null; };
    var base = { doc: d, auditada: !!d.auditoria, escoger: !aud };
    var o = function (extra) { var r = {}; for (var k in base) { r[k] = base[k]; } for (k in extra) { r[k] = extra[k]; } return r; };
    h += '<section id="s-top5"><h2><span class="emoji">🏆</span>TOP 5 de la jornada</h2>' + ((d.top5 || []).length
      ? '<div class="grid-picks">' + d.top5.map(function (p) { return tarjeta(p, o({ origen: 'TOP 5', resultado: res(p) })); }).join('') + '</div>'
      : vacio('🏆', 'Ningún pick de esta jornada alcanzó el nivel del TOP 5.')) + '</section>';
    h += '<section id="s-sugeridos"><h2><span class="emoji">💡</span>Picks sugeridos</h2><div class="grid-picks">' +
      (d.sugeridos || []).map(function (s) {
        var cab = '<div class="persona"><span class="emoji">' + (EMOJI_PERSONA[s.clave] || '💡') + '</span>' + esc(s.nombre) + '</div>' +
          (s.criterio ? '<p class="criterio">' + esc(s.criterio) + '</p>' : '');
        return s.pick ? tarjeta(s.pick, o({ origen: s.nombre, cabecera: cab, resultado: res(s.pick) }))
          : '<article class="pick">' + cab + '<p class="criterio">🚫 Desierto esta jornada' + (s.motivo ? ': ' + esc(s.motivo) : '') + '</p></article>';
      }).join('') + '</div></section>';
    h += '<section id="s-mercados"><h2><span class="emoji">📊</span>Rankings por mercado</h2>' + ((d.rankings || []).length
      ? d.rankings.map(function (r) {
        var cuenta = aud ? r.picks.filter(function (p) { return res(p)[0] === 'acierto'; }).length + ' de ' +
          r.picks.filter(function (p) { var e = res(p)[0]; return e === 'acierto' || e === 'fallo'; }).length + ' ✅' : r.total;
        return '<details class="caja" data-k="r-' + esc(r.seccion) + '"><summary><span class="emoji">' + (EMOJI_SECCION[r.seccion] || '📊') +
          '</span>' + esc(r.titulo) + '<span class="cuenta">' + cuenta + '</span></summary><div class="cuerpo">' +
          (r.no_validable ? '<p class="nota">⚠️ No validable con la tabla: el orden en que caen los córners no se puede reconstruir, ' +
            'así que estas probabilidades no están auditadas.</p>' : '') +
          '<ul class="lista">' + r.picks.map(function (p) { return fila(p, o({ origen: r.titulo, resultado: res(p) })); }).join('') + '</ul>' +
          (r.total > r.picks.length ? '<p class="criterio">Se muestran los ' + r.picks.length + ' de mayor respaldo de ' + r.total + '.</p>' : '') +
          '</div></details>';
      }).join('') : vacio('📊', 'Esta jornada no tiene rankings publicados.')) + '</section>';
    return h;
  }
  function vLiga(sem, archivo) {
    return docLiga(sem, archivo).then(function (d) {
      var sems = unicos([d.semana].concat(todosLosPicks(d).map(function (p) { return p.sem; })));
      return Promise.all(sems.map(Esc.cargar)).then(function () {
        REG.__doc = d;
        var h = '<a class="migas" href="#/analisis/' + esc(d.semana) + '">‹ Análisis · semana del ' + rangoSemana(d.semana) + '</a>';
        h += cabLiga(d, '📅 Jornada ' + esc(d.jornada) + (d.desde ? ' · ' + rango(d.desde, d.hasta) : '') +
          (d.generado ? ' · generado el ' + esc(d.generado) : ''));
        var acc = [];
        if (d.reporte) { acc.push('<a class="boton" href="' + esc(d.reporte) + '">📖 Reporte completo con narrativa</a>'); }
        if (d.auditoria) { acc.push('<a class="boton secundario" href="#/auditoria/' + esc(d.semana) + '/' + esc(d.archivo) + '">🔍 Ver su auditoría</a>'); }
        if (acc.length) { h += '<div class="acciones">' + acc.join('') + '</div>'; }
        if (d.liga_joven) {
          h += '<p class="nota">🌱 Liga joven: mientras acumula jornadas, algunas familias de mercados se publican con el ' +
            'comportamiento medido en las otras ligas. Van marcadas con «Liga joven».</p>';
        }
        if (d.fechas_deducidas) { h += '<p class="nota">📅 Algunas fechas se dedujeron del día de la semana: la hora de esos partidos está por confirmar.</p>'; }
        h += '<nav class="indice" aria-label="En esta jornada">' + [['s-escogidos', '✅ Escogidos'], ['s-top5', '🏆 TOP 5'],
          ['s-sugeridos', '💡 Sugeridos'], ['s-mercados', '📊 Mercados'], ['s-partidos', '📋 Partidos']].map(function (x) {
          return '<a href="#" data-accion="ir" data-id="' + x[0] + '">' + x[1] + '</a>';
        }).join('') + '</nav>';
        h += '<section id="s-escogidos" data-archivo="' + esc(d.archivo) + '">' + bloqueEscogidosLiga(d) + '</section>';
        h += cuerpoJornada(d, null);
        h += '<section id="s-partidos"><h2><span class="emoji">📋</span>Fichas de los partidos</h2>' + fichasPorDia(d) + '</section>';
        pintar(h, d.nombre + ' J' + d.jornada);
      });
    });
  }

  /* ================================================================== 2. auditoria */
  function vAuditoria(partes) {
    if (partes[1]) { return vAuditoriaLiga(partes[0], partes[1]); }
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'auditoria');
      if (!sem) {
        return pintar(cabecera('auditoria') + vacio('🔍', 'Todavía no hay jornadas auditadas. Cada jornada se audita al terminar, ' +
          'con el resultado real de cada partido.'), 'Auditoría');
      }
      return semanaIdx(sem).then(function (w) {
        var ligas = (w && w.ligas) || [], a = w && w.auditoria;
        var h = cabecera('auditoria') + selectorSemana(idx, sem, 'auditoria');
        if (a) {
          h += marcadorCajas([['⚽ Ligas auditadas', w.auditadas + ' de ' + ligas.length, 'azul'], ['🎯 Picks comprobables', a.picks],
            ['✅ Acierto real', pct(a.acierto), 'verde'], ['📈 Prometido por el motor', pct(a.prometido), 'azul']]);
          h += tira({ ok: a.aciertos, ko: a.picks - a.aciertos, nulo: 0 });
        }
        if (!ligas.length) {
          h += vacio('📭', 'No hay jornadas archivadas en esta semana.');
        } else {
          h += porPais(ligas).map(function (g) {
            return '<h2 class="pais">' + bandera(g.bandera) + esc(g.pais) + '</h2><div class="rejilla">' + g.ligas.map(function (L) {
              var r = L.auditoria;
              return '<a class="liga" href="#/' + (r ? 'auditoria' : 'analisis') + '/' + sem + '/' + esc(L.archivo) + '"><div class="liga-txt">' +
                '<div class="liga-nombre">⚽ ' + esc(L.nombre) + '</div>' +
                '<div class="liga-linea">📅 Jornada <b>' + esc(L.jornada) + '</b>' + (L.desde ? ' · ' + rango(L.desde, L.hasta) : '') + '</div>' +
                (r ? '<div class="liga-linea">✅ <b>' + r.aciertos + ' de ' + r.picks + '</b> · acierto <b>' + pct(r.acierto) + '</b> · prometido ' + pct(r.prometido) + '</div>' +
                  '<div class="barra-acierto" aria-hidden="true"><i style="width:' + (r.acierto * 100).toFixed(1) + '%"></i></div>'
                  : '<div class="liga-linea">⏳ Pendiente de auditar: se audita al terminar la jornada</div>') +
                '</div><span class="flecha-der" aria-hidden="true">›</span></a>';
            }).join('') + '</div>';
          }).join('');
        }
        var acum = idx.ligas.filter(function (L) { return L.acierto; });
        if (acum.length) {
          h += '<h2><span class="emoji">📈</span>Acumulado por liga</h2><div class="tabla-caja tabla-scroll"><table><thead><tr><th>Liga</th>' +
            '<th class="num">Jornadas</th><th class="num">Picks</th><th class="num">Acierto</th><th class="num">Prometido</th></tr></thead><tbody>' +
            acum.map(function (L) {
              var t = L.acierto;
              return '<tr><td>' + bandera(L.bandera) + ' ⚽ ' + esc(L.nombre) + '</td><td class="num">' + t.jornadas + '</td><td class="num">' + t.picks +
                '</td><td class="num"><b>' + pct(t.acierto) + '</b></td><td class="num">' + pct(t.prometido) + '</td></tr>';
            }).join('') + '</tbody></table></div>';
        }
        pintar(h, 'Auditoría');
      });
    });
  }
  function vAuditoriaLiga(sem, archivo) {
    return docLiga(sem, archivo).then(function (d) {
      var sems = unicos([d.semana].concat(todosLosPicks(d).map(function (p) { return p.sem; })));
      return Promise.all(sems.map(Esc.cargar)).then(function () {
        var h = '<a class="migas" href="#/auditoria/' + esc(d.semana) + '">‹ Auditoría · semana del ' + rangoSemana(d.semana) + '</a>';
        h += cabLiga(d, '🔍 Auditoría de la jornada ' + esc(d.jornada) + (d.desde ? ' · ' + rango(d.desde, d.hasta) : ''));
        if (!d.auditoria) {
          return pintar(h + vacio('⏳', 'Esta jornada todavía no se audita: se hace al terminar, con el resultado real de cada partido.') +
            '<p><a class="boton" href="#/analisis/' + esc(d.semana) + '/' + esc(d.archivo) + '">📊 Ver el análisis</a></p>', d.nombre);
        }
        var r = d.auditoria.resumen, mapa = {};
        d.auditoria.picks.forEach(function (p) { mapa[p[0] + '|' + p[1]] = [p[3], p[4]]; });
        h += '<div class="acciones"><a class="boton secundario" href="#/analisis/' + esc(d.semana) + '/' + esc(d.archivo) + '">📊 Ver el análisis</a></div>';
        h += '<h2><span class="emoji">🎯</span>Marcador de la jornada</h2>' +
          marcadorCajas([['✅ Acertados', r.aciertos, 'verde'], ['❌ Fallados', r.fallos, 'rojo'], ['🎯 Acierto real', pct(r.acierto), 'verde'],
            ['📈 Prometido por el motor', pct(r.prometido), 'azul']]) +
          tira({ ok: r.aciertos, ko: r.fallos, nulo: r.anulados + r.no_comprobables }) +
          '<p class="leyenda"><span>📣 ' + r.total + ' picks publicados</span><span>➖ ' + r.anulados + ' anulados</span><span>❓ ' +
          r.no_comprobables + ' no comprobables</span></p>';
        h += cuerpoJornada(d, mapa);
        h += '<h2><span class="emoji">📜</span>Todos los picks resueltos <span class="cuenta">' + d.auditoria.picks.length + '</span></h2>' +
          '<details class="caja" data-k="todos"><summary>Ver la lista completa, en el orden en que se publicó</summary><div class="cuerpo">' +
          '<ul class="lista">' + d.auditoria.picks.map(function (p) {
            var e = Esc.buscar(d.archivo + '|' + p[0] + '|' + p[1]);
            return '<li class="fila r-' + esc(p[3]) + '"><span class="m">' + esc(p[1]) + '</span><span class="pp">' + pct(p[2]) + '</span>' +
              '<span class="pt">' + esc(p[0]) + (e ? ' · ✅ ' + personas(e.pick.por) : '') + '</span><span class="det">' + (ESTADO[p[3]] || ESTADO.no_comprobable).t +
              (p[4] ? ': ' + esc(p[4]) : '') + '</span></li>';
          }).join('') + '</ul></div></details>';
        pintar(h, 'Auditoría ' + d.nombre + ' J' + d.jornada);
      });
    });
  }

  /* ================================================================== 3. escogidos */
  function docDe(rec) {
    return { archivo: rec.archivo, liga: rec.liga, nombre: rec.nombre, pais: rec.pais, bandera: rec.bandera,
      jornada: rec.jornada, semana: rec.sa };
  }
  function resultadoDe(rec, mapas) {
    var r = (mapas[rec.sa] || {})[rec.archivo];
    if (!r) { return null; }
    return r[rec.partido + '|' + rec.mercado] || ['no_comprobable', 'sin resultado en la auditoría'];
  }
  function tarjetaEscogido(rec, mapas, op) {
    var res = mapas ? resultadoDe(rec, mapas) : null;
    return tarjeta(rec, { doc: docDe(rec), origen: rec.origen, conOrigen: true, conLiga: true, conDia: !!(op && op.conDia),
      resultado: op && op.pendiente && !res ? ['pendiente', ''] : res, auditada: !!res, escoger: !(op && op.pendiente) });
  }
  function cargarResultados(picks) {
    var sas = unicos(picks.map(function (p) { return p.sa; }));
    return Promise.all(sas.map(resultados)).then(function (rs) {
      var m = {};
      sas.forEach(function (s, i) { m[s] = rs[i] || {}; });
      return m;
    });
  }
  function porDia(picks, pintarUno) {
    var grupos = {}, orden = [], h0 = hoy();
    picks.forEach(function (p) {
      var k = p.fecha || '';
      if (!(k in grupos)) { grupos[k] = []; orden.push(k); }
      grupos[k].push(p);
    });
    orden.sort(function (a, b) { return (a || '9').localeCompare(b || '9'); });
    return orden.map(function (k) {
      var etq = k === h0 ? 'hoy' : (k === masDias(h0, 1) ? 'mañana' : '');
      return '<div class="dia-cab">🗓️ ' + (k ? fLarga(k) : 'Fecha por confirmar') + (etq ? ' <span class="etq">' + etq + '</span>' : '') +
        '<span class="cuenta">' + grupos[k].length + (grupos[k].length === 1 ? ' pick' : ' picks') + '</span></div>' +
        '<div class="grid-picks">' + grupos[k].map(pintarUno).join('') + '</div>';
    }).join('');
  }
  function vEscogidos(partes, q) {
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'analisis') || semanaDe(hoy());
      var vista = q.get('vista') === 'liga' ? 'liga' : 'dia', filtro = q.get('liga') || '', quien = q.get('por') || '';
      return Esc.cargar(sem).then(function (E) {
        return cargarResultados(E.picks).then(function (mapas) {
          var todos = E.picks.slice().sort(ordenPicks);
          var picks = todos.filter(function (p) {
            return (!filtro || p.liga === filtro) && (!quien || p.por.indexOf(quien) >= 0);
          });
          var qs = function (v, l, s) {
            var a = [];
            if (v === 'liga') { a.push('vista=liga'); }
            if (l) { a.push('liga=' + encodeURIComponent(l)); }
            if (s) { a.push('por=' + encodeURIComponent(s)); }
            return a.length ? '?' + a.join('&') : '';
          };
          var h = cabecera('escogidos') + selectorSemana(idx, sem, 'escogidos', qs(vista, '', quien));
          var ligasSem = unicos(todos.map(function (p) { return p.liga; }));
          var gente = unicos(Object.keys(COLORES).concat([].concat.apply([], todos.map(function (p) { return p.por; }))));
          var info = {};
          todos.forEach(function (p) { info[p.liga] = p; });
          if (todos.length) {
            h += '<div class="herramientas"><p class="sub">✅ <b>' + picks.length + '</b> ' + (picks.length === 1 ? 'pick escogido' : 'picks escogidos') +
              (filtro && info[filtro] ? ' de ' + bandera(info[filtro].bandera) + ' ' + esc(info[filtro].nombre) : '') +
              (quien ? ' por ' + persona(quien) : '') +
              ' · ' + plural(unicos(picks.map(function (p) { return p.liga; })).length, 'liga', 'ligas') + ' · ' +
              plural(unicos(picks.map(function (p) { return p.fecha; })).length, 'día', 'días') + '</p>' +
              '<div class="conmutador" role="group" aria-label="Ordenar">' +
              '<a href="#/escogidos/' + sem + qs('dia', filtro, quien) + '" aria-current="' + (vista === 'dia') + '">🗓️ Por día</a>' +
              '<a href="#/escogidos/' + sem + qs('liga', filtro, quien) + '" aria-current="' + (vista === 'liga') + '">⚽ Por liga</a></div></div>';
            h += '<nav class="filtros" aria-label="Filtrar por seleccionador"><a href="#/escogidos/' + sem + qs(vista, filtro, '') +
              '" aria-current="' + !quien + '">👥 Todos</a>' + gente.map(function (n) {
                var k = todos.filter(function (p) { return p.por.indexOf(n) >= 0; }).length;
                return '<a href="#/escogidos/' + sem + qs(vista, filtro, n) + '" aria-current="' + (quien === n) + '">' + persona(n) + ' <b>' + k + '</b></a>';
              }).join('') + '</nav>';
          }
          if (ligasSem.length > 1 || filtro) {
            h += '<nav class="filtros" aria-label="Filtrar por liga"><a href="#/escogidos/' + sem + qs(vista, '', quien) + '" aria-current="' + !filtro + '">⚽ Todas</a>' +
              ligasSem.map(function (l) {
                var n = todos.filter(function (p) { return p.liga === l; }).length;
                return '<a href="#/escogidos/' + sem + qs(vista, l, quien) + '" aria-current="' + (filtro === l) + '">' + bandera(info[l].bandera) + ' ' +
                  esc(info[l].nombre) + ' <b>' + n + '</b></a>';
              }).join('') + '</nav>';
          }
          if (Editor.activo) {
            h += '<p class="nota verde">✏️ Para añadir picks entra a <a href="#/analisis/' + sem + '">📊 Análisis</a> y toca <b>＋ Escoger</b>. ' +
              'Aquí puedes quitar los tuyos o escoger también los de los demás mientras su partido no haya empezado.</p>';
          }
          if (!picks.length) {
            h += vacio('📭', filtro || quien ? 'No hay picks escogidos con ese filtro en la semana.' : 'Todavía no hay picks escogidos en esta semana.');
          } else if (vista === 'dia') {
            h += porDia(picks, function (p) { return tarjetaEscogido(p, mapas); });
          } else {
            var orden = {};
            idx.ligas.forEach(function (L, i) { orden[L.id] = i; });
            var grupos = unicos(picks.map(function (p) { return p.archivo; }));
            grupos.sort(function (a, b) {
              var pa = picks.filter(function (p) { return p.archivo === a; })[0], pb = picks.filter(function (p) { return p.archivo === b; })[0];
              return ((orden[pa.liga] || 0) - (orden[pb.liga] || 0)) || pa.jornada - pb.jornada;
            });
            h += grupos.map(function (a) {
              var lista = picks.filter(function (p) { return p.archivo === a; }), r = lista[0];
              return '<h2 class="pais">' + bandera(r.bandera) + '⚽ ' + esc(r.nombre) + ' <span class="cuenta">Jornada ' + esc(r.jornada) + ' · ' +
                lista.length + (lista.length === 1 ? ' pick' : ' picks') + '</span></h2>' +
                '<div class="grid-picks">' + lista.map(function (p) {
                  var res = resultadoDe(p, mapas);
                  return tarjeta(p, { doc: docDe(p), origen: p.origen, conOrigen: true, resultado: res, auditada: !!res });
                }).join('') + '</div>' +
                '<p><a class="migas" href="#/analisis/' + esc(r.sa) + '/' + esc(a) + '">Ver el análisis de la jornada ›</a></p>';
            }).join('');
          }
          pintar(h, 'Picks escogidos');
        });
      });
    });
  }

  /* ================================================================== 4. resultados de los escogidos */
  function nuevoConteo() { return { ok: 0, ko: 0, nulo: 0, pend: 0, suma: 0, total: 0 }; }
  function sumarPick(n, p, mapas) {
    var r = resultadoDe(p, mapas), e = r ? r[0] : 'pendiente';
    n.total++;
    if (e === 'acierto') { n.ok++; n.suma += p.p || 0; } else if (e === 'fallo') { n.ko++; n.suma += p.p || 0; } else if (e === 'pendiente') { n.pend++; } else { n.nulo++; }
  }
  function cerrarConteo(n) {
    n.comp = n.ok + n.ko;
    n.acierto = n.comp ? n.ok / n.comp : null;
    n.prometido = n.comp ? n.suma / n.comp : null;
    n.balance = n.ok - n.ko;
    return n;
  }
  function contar(picks, mapas) {
    var n = nuevoConteo();
    picks.forEach(function (p) { sumarPick(n, p, mapas); });
    return cerrarConteo(n);
  }
  /* buenas y malas de cada seleccionador: un pick escogido por dos cuenta para los dos */
  function porSeleccionador(semanas) {
    var t = {};
    Object.keys(COLORES).forEach(function (n) { t[n] = nuevoConteo(); });
    semanas.forEach(function (w) {
      w.picks.forEach(function (p) { p.por.forEach(function (n) { sumarPick(t[n] = t[n] || nuevoConteo(), p, w.mapas); }); });
    });
    Object.keys(t).forEach(function (n) { cerrarConteo(t[n]); });
    return t;
  }
  function ordenTabla(t) {
    return Object.keys(t).sort(function (a, b) { return (t[b].balance - t[a].balance) || (t[b].ok - t[a].ok) || a.localeCompare(b); });
  }
  function cargarSemana(s) {
    return Esc.cargar(s).then(function (E) { return cargarResultados(E.picks).then(function (m) { return { s: s, picks: E.picks, mapas: m }; }); });
  }
  function cargarTodas(idx) { return Promise.all((idx.semanas || []).map(function (s) { return cargarSemana(s.id); })); }
  function marcadorEscogidos(sem) { return cargarSemana(sem).then(function (w) { return contar(w.picks, w.mapas); }); }
  function tablaSeleccionadores(t, orden) {
    return '<div class="tabla-caja tabla-scroll"><table><thead><tr><th>Seleccionador</th><th class="num">Escogidos</th>' +
      '<th class="num">✅</th><th class="num">❌</th><th class="num">➖</th><th class="num">⏳</th><th class="num">Acierto</th>' +
      '<th class="num">Prometido</th></tr></thead><tbody>' + orden.map(function (n) {
        var c = t[n];
        return '<tr><td>' + persona(n) + '</td><td class="num">' + c.total + '</td><td class="num">' + c.ok + '</td><td class="num">' + c.ko +
          '</td><td class="num">' + c.nulo + '</td><td class="num">' + c.pend + '</td><td class="num"><b>' + pct(c.acierto) + '</b></td><td class="num">' +
          pct(c.prometido) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function vResultados(partes) {
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'resultados') || semanaDefecto(idx, 'analisis');
      if (!sem) { return pintar(cabecera('resultados') + vacio('🏅', 'Todavía no hay semanas publicadas.'), 'Resultados'); }
      return cargarSemana(sem).then(function (w) {
        var mapas = w.mapas, picks = w.picks.slice().sort(ordenPicks), n = contar(picks, mapas);
        var h = cabecera('resultados') + selectorSemana(idx, sem, 'resultados');
        if (!picks.length) {
          h += vacio('📭', 'No hubo picks escogidos en esta semana.');
        } else {
          h += marcadorCajas([['✅ Acertados', n.ok + ' de ' + n.comp, 'verde'], ['🎯 Acierto real', pct(n.acierto), 'verde'],
            ['📈 Prometido (media)', pct(n.prometido), 'azul'], ['⏳ Por jugarse', n.pend, n.pend ? 'azul' : '']]) +
            tira(n) + '<p class="leyenda"><span>✅ ' + plural(n.ok, 'acertado', 'acertados') + '</span><span>❌ ' +
            plural(n.ko, 'fallado', 'fallados') + '</span><span>➖ ' + plural(n.nulo, 'anulado o no comprobable', 'anulados o no comprobables') +
            '</span><span>⏳ ' + n.pend + ' por jugarse</span></p>';
          var t = porSeleccionador([w]);
          h += '<h2><span class="emoji">👥</span>Por seleccionador</h2>' + tablaSeleccionadores(t, ordenTabla(t)) +
            '<p class="criterio">Un pick escogido por dos personas cuenta para las dos. <a href="#/seleccionadores">Ver la tabla de todas las semanas ›</a></p>';
          h += '<h2><span class="emoji">🗓️</span>Por día</h2>' + porDia(picks, function (p) { return tarjetaEscogido(p, mapas, { pendiente: true }); });
          var ligas = unicos(picks.map(function (p) { return p.liga; }));
          h += '<h2><span class="emoji">⚽</span>Por liga</h2><div class="tabla-caja tabla-scroll"><table><thead><tr><th>Liga</th><th class="num">Escogidos</th>' +
            '<th class="num">✅</th><th class="num">❌</th><th class="num">➖</th><th class="num">⏳</th><th class="num">Acierto</th></tr></thead><tbody>' +
            ligas.map(function (l) {
              var sub = picks.filter(function (p) { return p.liga === l; }), c = contar(sub, mapas);
              return '<tr><td>' + bandera(sub[0].bandera) + ' ⚽ ' + esc(sub[0].nombre) + '</td><td class="num">' + sub.length + '</td><td class="num">' + c.ok +
                '</td><td class="num">' + c.ko + '</td><td class="num">' + c.nulo + '</td><td class="num">' + c.pend + '</td><td class="num"><b>' + pct(c.acierto) + '</b></td></tr>';
            }).join('') + '</tbody></table></div>';
        }
        h += '<h2><span class="emoji">📈</span>Historial de la selección</h2><details class="caja" data-k="historial" data-accion-toggle="historial">' +
          '<summary>Todas las semanas</summary><div class="cuerpo" id="historial"><p class="criterio">Cargando…</p></div></details>';
        pintar(h, 'Auditoría de picks escogidos');
      });
    });
  }
  function pintarHistorial(caja) {
    return indice().then(function (idx) {
      return cargarTodas(idx).then(function (semanas) {
        var filas = semanas.filter(function (w) { return w.picks.length; });
        if (!filas.length) { caja.innerHTML = '<p class="criterio">Todavía no hay semanas con picks escogidos.</p>'; return; }
        var t = contar([], {}), fila = function (c) {
          return '<td class="num">' + c.total + '</td><td class="num">' + c.ok + '</td><td class="num">' + c.ko + '</td><td class="num">' + c.nulo +
            '</td><td class="num">' + c.pend + '</td><td class="num"><b>' + pct(c.acierto) + '</b></td><td class="num">' + pct(c.prometido) + '</td>';
        };
        var cuerpo = filas.map(function (w) {
          w.picks.forEach(function (p) { sumarPick(t, p, w.mapas); });
          var c = contar(w.picks, w.mapas);
          return '<tr><td><a href="#/resultados/' + w.s + '">' + rangoSemana(w.s) + '</a> ' + personas(unicos([].concat.apply([], w.picks.map(function (p) { return p.por; })))) +
            '</td>' + fila(c) + '</tr>';
        }).join('');
        cerrarConteo(t);
        caja.innerHTML = '<div class="tabla-scroll"><table><thead><tr><th>Semana</th><th class="num">Escogidos</th><th class="num">✅</th><th class="num">❌</th><th class="num">➖</th>' +
          '<th class="num">⏳</th><th class="num">Acierto</th><th class="num">Prometido</th></tr></thead><tbody>' + cuerpo +
          '<tr class="total"><td>Total</td>' + fila(t) + '</tr></tbody></table></div>';
      });
    }).catch(function (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });
  }

  /* ================================================================== 5. seleccionadores */
  function vSeleccionadores() {
    return indice().then(function (idx) {
      return cargarTodas(idx).then(function (semanas) {
        var t = porSeleccionador(semanas), orden = ordenTabla(t), medallas = ['🥇', '🥈', '🥉'];
        var semA = semanaDefecto(idx, 'analisis') || semanaDe(hoy());
        var h = cabecera('seleccionadores');
        h += '<div class="podio">' + orden.map(function (n, i) {
          var c = t[n];
          return '<article class="tarjeta-sel" style="--c:' + colorDe(n) + '">' +
            '<div class="sel-cab"><span class="medalla" aria-hidden="true">' + (c.comp ? (medallas[i] || '🎖️') : '🆕') + '</span>' + persona(n) +
            (n === 'picksin' ? '<span class="chip neutro">principal</span>' : '') + '</div>' +
            '<div class="sel-record"><span class="buenas">✅ ' + c.ok + '<small>buenas</small></span><span class="malas">❌ ' + c.ko + '<small>malas</small></span>' +
            '<span class="balance">' + (c.balance > 0 ? '+' : '') + c.balance + '<small>balance</small></span></div>' +
            tira(c) +
            '<p class="sel-datos">🎯 Acierto <b>' + pct(c.acierto) + '</b> · 📈 prometido ' + pct(c.prometido) + '</p>' +
            '<p class="sel-datos">' + plural(c.total, 'pick escogido', 'picks escogidos') + (c.pend ? ' · ⏳ ' + c.pend + ' por jugarse' : '') +
            (c.nulo ? ' · ➖ ' + c.nulo + ' anulados' : '') + '</p>' +
            '<a class="migas" href="#/escogidos/' + semA + '?por=' + encodeURIComponent(n) + '">Ver sus picks de la semana ›</a></article>';
        }).join('') + '</div>';
        h += '<p class="criterio">Ordenados por balance (buenas menos malas). Los anulados, los no comprobables y los que están por jugarse no cuentan; ' +
          'si dos escogen el mismo pick, cuenta para los dos.</p>';
        var conPicks = semanas.filter(function (w) { return w.picks.length; });
        h += '<h2><span class="emoji">📅</span>Semana a semana</h2>' + (conPicks.length
          ? '<div class="tabla-caja tabla-scroll"><table><thead><tr><th>Semana</th>' + orden.map(function (n) { return '<th class="num">' + persona(n) + '</th>'; }).join('') +
            '</tr></thead><tbody>' + conPicks.map(function (w) {
              var tw = porSeleccionador([w]);
              return '<tr><td><a href="#/resultados/' + w.s + '">' + rangoSemana(w.s) + '</a></td>' + orden.map(function (n) {
                var c = tw[n];
                return '<td class="num">' + (c && c.total ? '<b>' + c.ok + '</b>–' + c.ko + (c.pend ? ' <small>⏳' + c.pend + '</small>' : '') : '—') + '</td>';
              }).join('') + '</tr>';
            }).join('') + '<tr class="total"><td>Total</td>' + orden.map(function (n) { return '<td class="num">' + t[n].ok + '–' + t[n].ko + '</td>'; }).join('') +
            '</tr></tbody></table></div><p class="criterio">Buenas–malas de cada semana.</p>'
          : vacio('📭', 'Todavía no hay picks escogidos.'));
        h += '<h2><span class="emoji">📋</span>Detalle de todas las semanas</h2>' + tablaSeleccionadores(t, orden);
        pintar(h, 'Seleccionadores');
      });
    });
  }

  /* enlaces viejos liga.html?l=<id> -> ultimo analisis de esa liga */
  function vIrALiga(partes) {
    return indice().then(function (idx) {
      var L = idx.ligas.filter(function (x) { return x.id === partes[0]; })[0];
      location.replace(L && L.ultima ? '#/analisis/' + L.ultima.semana + '/' + L.ultima.archivo : '#/analisis');
    });
  }

  /* ================================================================== navegacion */
  var VISTAS = { '': vInicio, analisis: vAnalisis, auditoria: vAuditoria, escogidos: vEscogidos, resultados: vResultados,
    seleccionadores: vSeleccionadores, liga: vIrALiga };
  var rutaAnterior = null;
  function router(repintar) {
    var h = location.hash.replace(/^#\/?/, ''), q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var partes = h.split('/').filter(Boolean).map(decodeURIComponent);
    var seccion = partes.shift() || '';
    var vista = VISTAS[seccion];
    if (!vista) { location.replace('#/'); return Promise.resolve(); }
    $$('.nav a').forEach(function (a) {
      if (a.getAttribute('data-nav') === seccion) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
    });
    var y = window.scrollY, abiertos = $$('details[data-k][open]').map(function (d) { return d.getAttribute('data-k'); });
    REG = {};
    return Promise.resolve(vista(partes, new URLSearchParams(q))).then(function () {
      if (repintar === true) {
        abiertos.forEach(function (k) { $$('details[data-k]').forEach(function (d) { if (d.getAttribute('data-k') === k) { d.open = true; } }); });
        window.scrollTo(0, y);
      } else if (location.hash !== rutaAnterior) {
        window.scrollTo(0, 0);
      }
      rutaAnterior = location.hash;
    }).catch(function (e) {
      $('#app').innerHTML = '<div class="vacio error"><span class="emoji">⚠️</span>' + esc(e.message) + '</div>';
    });
  }

  var relojAviso;
  function avisar(texto, enlace, etiqueta) {
    var a = $('#aviso');
    a.innerHTML = '<span>' + esc(texto) + '</span>' + (enlace ? '<a href="' + esc(enlace) + '">' + esc(etiqueta || 'Ver') + ' ›</a>' : '');
    a.hidden = false;
    clearTimeout(relojAviso);
    relojAviso = setTimeout(function () { a.hidden = true; }, 4500);
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-accion]');
    if (!t) { return; }
    var a = t.getAttribute('data-accion');
    if (a === 'escoger') { e.preventDefault(); alternar(t.getAttribute('data-pid')); }
    else if (a === 'semana') { if (t.getAttribute('data-sem')) { location.hash = '#/' + t.getAttribute('data-seccion') + '/' + t.getAttribute('data-sem') + (t.getAttribute('data-q') || ''); } }
    else if (a === 'ir') {
      e.preventDefault();
      var el = document.getElementById(t.getAttribute('data-id'));
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    else if (a === 'editor') { if (Editor.activo) { salir(); } else { abrirDialogo(); } }
    else if (a === 'editor-salir') { salir(); }
    else if (a === 'editor-cancelar') { cerrarDialogo(); }
    else if (a === 'reintentar') { pintarEditor('guardando'); guardar(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.getAttribute('data-accion') === 'semana-lista') {
      location.hash = '#/' + t.getAttribute('data-seccion') + '/' + t.value + (t.getAttribute('data-q') || '');
    }
  });
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d.open && d.getAttribute && d.getAttribute('data-accion-toggle') === 'historial' && !d.getAttribute('data-listo')) {
      d.setAttribute('data-listo', '1');
      pintarHistorial($('#historial', d));
    }
  }, true);
  $('#form-editor').addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('#clave').value.trim(), b = $('#dlg-entrar'), err = $('#dlg-error');
    if (!t) { return; }
    b.disabled = true; b.textContent = 'Comprobando…'; err.hidden = true;
    entrar(t).then(function (quien) {
      cerrarDialogo();
      pintarEditor('ok');
      avisar('✏️ Hola, ' + quien + ': toca ＋ Escoger en cualquier pick.');
      router(true);
    }).catch(function (x) {
      err.textContent = x.message; err.hidden = false;
    }).then(function () { b.disabled = false; b.textContent = 'Entrar'; });
  });

  window.addEventListener('hashchange', function () { router(); });
  pintarEditor('ok');
  router();
})();
