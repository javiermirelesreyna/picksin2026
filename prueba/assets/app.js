/* Picksin — pagina de una sola pantalla con cinco secciones, todas archivadas por semana
   (jueves a miercoles, hora del centro de Mexico):

     #/analisis[/<jueves>[/<liga>-j<N>]]        analisis de cada liga para su jornada
     #/auditoria[/<jueves>[/<liga>-j<N>]]       auditoria de cada liga, pick por pick
     #/escogidos[/<jueves>][?vista=&liga=&por=]  picks escogidos de la semana, por dia o por liga
     #/resultados[/<jueves>]                    auditoria de los picks escogidos
     #/seleccionadores[/<jueves>]               buenas y malas de cada seleccionador
     #/green[/<jueves>]                         seleccion del dia para el grupo Green Zone (solo modo editor)
     #/historial                                selecciones del dia guardadas, con su resultado (solo modo editor)
     #/reporte?desde=&hasta=                    imagen para redes de hasta 10 dias (solo modo editor)

   Todo sale de data/*.json, que genera publicar_sitio.py: aqui no se calcula ninguna
   probabilidad. Lo unico que se cuenta en la pagina es el marcador de los picks escogidos,
   porque la seleccion se hace aqui mismo: cada seleccionador (picksin, maki, diego...) entra
   con su clave y el intermediario (automatizacion/editor/worker.js, en Cloudflare) guarda sus
   picks en data/escogidos/<jueves>.json con el nombre de quien escogio cada uno. */
(function () {
  'use strict';

  /* direccion del intermediario del modo editor (Cloudflare Worker); vacia = aun sin conectar */
  var EDITOR = 'https://picksin-editor.javiermirelesreyna.workers.dev';

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
    seleccionadores: ['👥', 'Seleccionadores', 'Quién escogió cada pick y cuántas buenas y malas lleva cada uno.'],
    green: ['🟢', 'Selección del día', 'Arma la jugada para Green Zone con los picks escogidos: directa o parlay, con su momio, la apuesta y el nivel.']
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
      '<a class="gz-enlace" href="#/green">🟢 Selección del día</a>' +
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
              'Aquí puedes quitar los tuyos o escoger también los de los demás mientras su partido no haya empezado.</p>' +
              '<p><a class="boton verde" href="#/green/' + sem + '">🟢 Armar la selección del día</a></p>';
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

  /* ================================================================== 6. seleccion del dia (Green Zone) */
  /* De los picks escogidos (de cualquier seleccionador) se arma la jugada que se manda al grupo
     Green Zone: una directa, varias directas o un parlay, con el momio de la casa, la apuesta y el
     nivel. Sale una imagen (lienzo 1080 px de ancho) y un texto para copiar. No se guarda en
     GitHub: el borrador vive solo en este navegador (picksin.green). */
  var NIVELES = {
    fuerte: { t: 'Fuerte', e: '💪', n: 1, fondo: '#49ad33' },
    superfuerte: { t: 'Superfuerte', e: '🔥', n: 2, fondo: '#2e8f35' },
    ultrafuerte: { t: 'Ultrafuerte', e: '🚀', n: 3, fondo: null }            // degradado azul -> verde
  };
  /* selecciones propias (fuera del analisis): deporte y pais de cada una */
  var DEPORTES = {
    futbol: ['⚽', 'Fútbol'], beisbol: ['⚾', 'Béisbol'], basquetbol: ['🏀', 'Básquetbol'], americano: ['🏈', 'Fútbol americano'],
    tenis: ['🎾', 'Tenis'], box: ['🥊', 'Box'], mma: ['🥋', 'MMA / UFC'], hockey: ['🏒', 'Hockey'], golf: ['⛳', 'Golf'],
    autos: ['🏎️', 'Automovilismo'], voleibol: ['🏐', 'Voleibol'], otro: ['🏅', 'Otro']
  };
  var PAISES = [['MX', 'México'], ['US', 'Estados Unidos'], ['CA', 'Canadá'], ['ES', 'España'], ['ENG', 'Inglaterra'],
    ['SCO', 'Escocia'], ['GB', 'Reino Unido'], ['IT', 'Italia'], ['DE', 'Alemania'], ['FR', 'Francia'], ['PT', 'Portugal'],
    ['NL', 'Países Bajos'], ['BE', 'Bélgica'], ['CH', 'Suiza'], ['TR', 'Turquía'], ['GR', 'Grecia'], ['PL', 'Polonia'],
    ['CZ', 'República Checa'], ['RS', 'Serbia'], ['HR', 'Croacia'], ['RU', 'Rusia'], ['NO', 'Noruega'], ['BR', 'Brasil'],
    ['AR', 'Argentina'], ['CO', 'Colombia'], ['CL', 'Chile'], ['UY', 'Uruguay'], ['PE', 'Perú'], ['EC', 'Ecuador'],
    ['VE', 'Venezuela'], ['CU', 'Cuba'], ['DO', 'República Dominicana'], ['PR', 'Puerto Rico'], ['JP', 'Japón'],
    ['KR', 'Corea del Sur'], ['CN', 'China'], ['AU', 'Australia'], ['EU', 'Europa'], ['INT', 'Internacional'], ['', 'Sin bandera']];
  function banderaDe(cod) {
    if (!cod) { return ''; }
    if (cod === 'INT') { return '🌍'; }
    if (cod === 'ENG') { return String.fromCodePoint(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F); }
    if (cod === 'SCO') { return String.fromCodePoint(0x1F3F4, 0xE0067, 0xE0062, 0xE0073, 0xE0063, 0xE0074, 0xE007F); }
    return String.fromCodePoint(0x1F1E6 + cod.charCodeAt(0) - 65, 0x1F1E6 + cod.charCodeAt(1) - 65);
  }
  function deporteDe(p) { return DEPORTES[p.deporte] || DEPORTES.futbol; }        // lo del analisis es futbol
  function nombreDe(p) { return p.nombre || (p.manual ? deporteDe(p)[1] : ''); }
  var GZ = leerGZ(), gzPicks = [], gzReloj = null, gzTurno = 0, gzBlob = null, gzUrl = null, gzVigia = null;
  function leerGZ() {
    var d = null;
    try { d = JSON.parse(ls('picksin.green') || 'null'); } catch (e) { d = null; }
    d = d && typeof d === 'object' ? d : {};
    return { patas: Array.isArray(d.patas) ? d.patas.filter(function (x) { return x && x.pick; }) : [],
      tipo: d.tipo === 'directas' ? 'directas' : 'parlay', total: d.total || null, apuesta: d.apuesta || '',
      nivel: NIVELES[d.nivel] ? d.nivel : 'fuerte', dia: d.dia == null ? null : d.dia, guardado: d.guardado || null, ids: d.ids || null };
  }
  function guardarGZ() { ls('picksin.green', JSON.stringify(GZ)); }
  function pataDe(el) {
    var id = el.closest('[data-id]').getAttribute('data-id');
    return GZ.patas.filter(function (x) { return x.id === id; })[0];
  }

  /* ---------------------------------------------------------------- momios y dinero */
  /* momio americano (con el signo aparte) o decimal (1.85) -> momio decimal */
  function decimalDe(signo, valor) {
    var t = String(valor == null ? '' : valor).trim().replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) { return null; }
    var x = parseFloat(t);
    if (x >= 100) { return signo === '+' ? 1 + x / 100 : 1 + 100 / x; }
    return t.indexOf('.') >= 0 && x > 1 ? x : null;
  }
  function americano(dec) {
    if (!dec || dec <= 1) { return '—'; }
    return dec >= 2 ? '+' + Math.round((dec - 1) * 100) : '-' + Math.round(100 / (dec - 1));
  }
  var MXN = (function () {
    try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }); } catch (e) { return null; }
  })();
  function dinero(x) {
    if (x == null || isNaN(x)) { return '—'; }
    return MXN ? MXN.format(x).replace(/^MX/, '') : '$' + x.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function monto(t) {
    var s = String(t == null ? '' : t).replace(/[$\s,]/g, '');
    return /^\d+(\.\d+)?$/.test(s) && parseFloat(s) > 0 ? parseFloat(s) : null;
  }
  function calcularGZ() {
    var P = GZ.patas, r = { tipo: P.length > 1 ? GZ.tipo : 'directa' };
    r.decs = P.map(function (x) { return decimalDe(x.signo, x.momio); });
    r.completos = P.length > 0 && r.decs.every(Boolean);
    if (r.tipo === 'directas') {
      r.patas = P.map(function (x, i) {
        var a = monto(x.apuesta) || monto(GZ.apuesta);
        return { apuesta: a, pago: a && r.decs[i] ? a * r.decs[i] : null };
      });
      var suma = function (k) {
        return r.patas.every(function (x) { return x[k]; }) ? r.patas.reduce(function (s, x) { return s + x[k]; }, 0) : null;
      };
      r.apuesta = suma('apuesta');
      r.pago = suma('pago');
    } else {
      r.calculado = r.completos ? r.decs.reduce(function (a, b) { return a * b; }, 1) : null;
      r.manual = r.tipo === 'parlay' && GZ.total ? decimalDe(GZ.total.signo, GZ.total.valor) : null;
      r.dec = r.manual || r.calculado;
      r.apuesta = monto(GZ.apuesta);
      r.pago = r.dec && r.apuesta ? r.apuesta * r.dec : null;
    }
    r.utilidad = r.pago && r.apuesta ? r.pago - r.apuesta : null;
    return r;
  }
  /* el dia (o los dias) de la jugada, para el titulo de la imagen */
  function diaGZ(P) {
    var f = unicos(P.map(function (x) { return x.pick.fecha; })).sort();
    var sinFecha = P.some(function (x) { return !x.pick.fecha; });
    if (!f.length) { return { titulo: 'POR CONFIRMAR', sub: 'FECHA POR CONFIRMAR', largo: 'Fecha por confirmar', varios: true, fecha: hoy() }; }
    var nom = function (s) { return DIAS[fecha(s).getUTCDay()].toUpperCase(); };
    var a = fecha(f[0]), b = fecha(f[f.length - 1]), n = f.length;
    return {
      titulo: n === 1 ? nom(f[0]) : n === 2 ? nom(f[0]) + ' Y ' + nom(f[1]) : nom(f[0]) + ' A ' + nom(f[n - 1]),
      sub: (n === 1 ? a.getUTCDate() + ' DE ' + MESES[a.getUTCMonth()]
        : a.getUTCMonth() === b.getUTCMonth() ? a.getUTCDate() + (n === 2 ? ' Y ' : ' AL ') + b.getUTCDate() + ' DE ' + MESES[b.getUTCMonth()]
          : a.getUTCDate() + ' DE ' + MESES_C[a.getUTCMonth()] + ' AL ' + b.getUTCDate() + ' DE ' + MESES_C[b.getUTCMonth()]).toUpperCase(),
      largo: n === 1 ? fLarga(f[0]) : a.getUTCMonth() === b.getUTCMonth()
        ? fLarga(f[0]).replace(/ de .*$/, '') + (n === 2 ? ' y ' : ' a ') + fLarga(f[n - 1]).toLowerCase()
        : fLarga(f[0]) + ' a ' + fLarga(f[n - 1]).toLowerCase(),
      varios: n > 1 || sinFecha, fecha: f[0]
    };
  }

  /* el texto que acompana a la imagen: solo la justificacion y la probabilidad de cada seleccion,
     con el mismo numero que lleva en la imagen */
  function textoGZ() {
    var P = GZ.patas, l = [];
    P.forEach(function (x, i) {
      var p = x.pick, just = String(p.just || '').trim(), prob = p.p ? 'Probabilidad: ' + (p.p * 100).toFixed(1) + '%' : '';
      if (!just && !prob) { return; }
      l.push(((P.length > 1 ? (i + 1) + '. ' : '') + (prob ? '📈 ' + prob : '')).trim());
      if (just) { l.push(just); }
      l.push('');
    });
    return l.join('\n').replace(/\n+$/, '');
  }

  /* ---------------------------------------------------------------- la imagen */
  var LETRA = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, ' +
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
  var imagenes = {};
  function imagen(src) {
    if (!imagenes[src]) {
      imagenes[src] = new Promise(function (ok) {
        var i = new Image();
        i.onload = function () { ok(i); };
        i.onerror = function () { ok(null); };
        i.src = src;
      });
    }
    return imagenes[src];
  }
  function recursosGZ() {
    var f = document.fonts && document.fonts.load
      ? document.fonts.load('40px "Banderas Picksin"', '🇲🇽').catch(function () { return null; }) : null;
    return Promise.all([imagen('assets/logo.webp'), imagen('assets/avatar.webp'), f]).then(function (r) { return { logo: r[0], avatar: r[1] }; });
  }
  function letra(c, peso, tam) {
    c.font = peso + ' ' + tam + 'px ' + (document.documentElement.classList.contains('banderas-fuente') ? '"Banderas Picksin", ' : '') + LETRA;
  }
  function espaciado(c, px) { if ('letterSpacing' in c) { c.letterSpacing = px + 'px'; } }
  function redondo(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function partir(c, t, ancho, max) {
    var lineas = [], l = '';
    String(t || '').split(/\s+/).forEach(function (w) {
      var prueba = l ? l + ' ' + w : w;
      if (!l || c.measureText(prueba).width <= ancho) { l = prueba; } else { lineas.push(l); l = w; }
    });
    if (l) { lineas.push(l); }
    lineas = lineas.map(function (x) {                  // una palabra sola mas ancha que la linea
      while (x.length > 1 && c.measureText(x).width > ancho) { x = x.slice(0, -2) + '…'; }
      return x;
    });
    if (max && lineas.length > max) {
      lineas = lineas.slice(0, max);
      var u = lineas[max - 1];
      while (u.length > 1 && c.measureText(u + '…').width > ancho) { u = u.slice(0, -1); }
      lineas[max - 1] = u.replace(/\s+$/, '') + '…';
    }
    return lineas;
  }
  function ajustar(c, peso, max, min, texto, ancho) {
    var t = max;
    letra(c, peso, t);
    while (t > min && c.measureText(texto).width > ancho) { t -= 2; letra(c, peso, t); }
    return t;
  }
  /* "NO ES SUERTE, ES CIENCIA" de fondo, con trazo para engrosar la letra y "ES CIENCIA" mas oscuro.
     Cada parte se dibuja opaca en su propia capa y luego se funde con su transparencia (asi el
     trazo y el relleno no se suman en los bordes). */
  function marcaAgua(c, W, H) {
    var D = Math.sqrt(W * W + H * H), capas = [0, 1].map(function () {
      var k = document.createElement('canvas');
      k.width = W; k.height = H;
      var x = k.getContext('2d');
      x.translate(W / 2, H / 2); x.rotate(-Math.PI / 9);
      letra(x, 900, 62);
      x.textAlign = 'left'; x.lineJoin = 'round'; x.lineWidth = 6; x.fillStyle = x.strokeStyle = '#0f5989';
      return x;
    });
    var t1 = 'NO ES SUERTE, ', t2 = 'ES CIENCIA', w1 = capas[0].measureText(t1).width;
    var fw = w1 + capas[0].measureText(t2 + '   ·   ').width;
    for (var i = 0, y = -D / 2; y < D / 2; y += 104, i++) {
      for (var x = -D / 2 - (i % 2) * fw / 2; x < D / 2; x += fw) {
        capas[0].strokeText(t1, x, y); capas[0].fillText(t1, x, y);
        capas[1].strokeText(t2, x + w1, y); capas[1].fillText(t2, x + w1, y);
      }
    }
    c.save();
    c.globalAlpha = 0.06; c.drawImage(capas[0].canvas, 0, 0);
    c.globalAlpha = 0.13; c.drawImage(capas[1].canvas, 0, 0);
    c.restore();
  }
  /* se llama dos veces: sin `plan` solo mide (para saber el alto) y con `plan` dibuja */
  function componerGZ(c, A, plan) {
    var pintar = !!plan, W = 1080, M = 48, P = GZ.patas, calc = calcularGZ(), niv = NIVELES[GZ.nivel], dia = diaGZ(P);
    var VERDE = '#2e8f35', AZUL = '#1279bb', MARINO = '#0f5989', TEXTO = '#0e1a2b', SUAVE = '#56677c', TENUE = '#8796a8';
    var y = 44, X = M, TW = W - 2 * M, PAD = 44;
    c.textBaseline = 'alphabetic';
    if (pintar) {
      var g = c.createLinearGradient(0, 0, 0, plan.H);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e4eef8');
      c.fillStyle = g; c.fillRect(0, 0, W, plan.H);
      marcaAgua(c, W, plan.H);
    }
    /* logo, el dia en grande y la fecha */
    var lh = 210, lw = A.logo ? lh * A.logo.width / A.logo.height : 0;
    if (pintar && A.logo) {
      c.save(); c.shadowColor = 'rgba(15, 89, 137, .28)'; c.shadowBlur = 36; c.shadowOffsetY = 12;
      c.drawImage(A.logo, (W - lw) / 2, y, lw, lh); c.restore();
    }
    y += lh;
    c.textAlign = 'center';
    var t = ajustar(c, 900, 132, 56, dia.titulo, TW - 40);
    y += 54 + Math.round(t * 0.74);
    if (pintar) { c.fillStyle = VERDE; c.fillText(dia.titulo, W / 2, y); }
    letra(c, 700, 30); espaciado(c, 4);
    y += 52;
    if (pintar) { c.fillStyle = SUAVE; c.fillText(dia.sub, W / 2, y); }
    espaciado(c, 0);
    y += 48;

    /* la tarjeta con las selecciones */
    var arriba = y;
    if (pintar) {
      c.save(); c.shadowColor = 'rgba(14, 40, 72, .14)'; c.shadowBlur = 48; c.shadowOffsetY = 16;
      c.fillStyle = '#ffffff'; redondo(c, X, arriba, TW, plan.tarjeta, 40); c.fill(); c.restore();
      c.strokeStyle = '#e0e8f0'; c.lineWidth = 2; redondo(c, X, arriba, TW, plan.tarjeta, 40); c.stroke();
    }
    y += PAD;
    var etq = P.length === 1 ? '1 SELECCIÓN' : P.length + ' SELECCIONES';
    letra(c, 800, 24); espaciado(c, 3);
    var ew = c.measureText(etq).width + 48;
    if (pintar) {
      c.fillStyle = '#eaf7e6'; redondo(c, X + PAD, y, ew, 52, 26); c.fill();
      c.fillStyle = '#237a29'; c.textAlign = 'left'; c.fillText(etq, X + PAD + 24, y + 35);
    }
    espaciado(c, 0);
    y += 52 + 34;
    P.forEach(function (x, i) {
      var p = x.pick, dec = calc.decs[i], numerada = P.length > 1;
      var x0 = X + PAD + (numerada ? 68 : 0), der = X + TW - PAD, y0 = y;
      var momio = dec ? americano(dec) : '';
      letra(c, 800, 36);
      var mw = momio ? Math.max(146, c.measureText(momio).width + 48) : 0;
      var ancho = der - (mw ? mw + 26 : 0) - x0;
      c.textAlign = 'left';
      letra(c, 700, 25);
      var l1 = partir(c, (p.bandera ? p.bandera + '  ' : '') + nombreDe(p) + '  ·  ' + (dia.varios ? cuando(p) : (p.hora || cuando(p))) +
        '  ' + deporteDe(p)[0], ancho, 1)[0];
      y += 26;
      if (pintar) { c.fillStyle = SUAVE; c.fillText(l1, x0, y); }
      letra(c, 800, 40);
      var lm = partir(c, p.mercado, ancho, 3), ym = y + 10;
      y += 8;
      lm.forEach(function (l) { y += 48; if (pintar) { c.fillStyle = TEXTO; c.fillText(l, x0, y); } });
      letra(c, 500, 29);
      y += 4;
      partir(c, p.partido, ancho, 2).forEach(function (l) { y += 38; if (pintar) { c.fillStyle = SUAVE; c.fillText(l, x0, y); } });
      if (calc.tipo === 'directas' && calc.patas[i].apuesta) {
        y += 44;
        if (pintar) {
          letra(c, 700, 27);
          var a1 = 'Apuesta ' + dinero(calc.patas[i].apuesta);
          c.fillStyle = SUAVE; c.fillText(a1, x0, y);
          if (calc.patas[i].pago) {
            var a2 = '   →   Ganancia ', w1 = c.measureText(a1).width;
            c.fillText(a2, x0 + w1, y);
            letra(c, 800, 27); c.fillStyle = VERDE; c.fillText(dinero(calc.patas[i].pago), x0 + w1 + c.measureText(a2).width, y);
          }
        }
      }
      if (pintar && numerada) {
        c.fillStyle = '#eaf7e6'; c.beginPath(); c.arc(X + PAD + 24, y0 + 17, 24, 0, 2 * Math.PI); c.fill();
        letra(c, 800, 26); c.fillStyle = '#237a29'; c.textAlign = 'center'; c.fillText(String(i + 1), X + PAD + 24, y0 + 26);
      }
      if (pintar && mw) {
        c.fillStyle = MARINO; redondo(c, der - mw, ym, mw, 66, 20); c.fill();
        letra(c, 800, 36); c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.fillText(momio, der - mw / 2, ym + 46);
      }
      if (i < P.length - 1) {
        y += 32;
        if (pintar) {
          c.save(); c.strokeStyle = '#d6e2ee'; c.lineWidth = 2; c.setLineDash([10, 10]);
          c.beginPath(); c.moveTo(X + PAD, y); c.lineTo(der, y); c.stroke(); c.restore();
        }
        y += 30;
      }
    });
    /* momio, apuesta y ganancia */
    var cols = calc.tipo === 'directas'
      ? (calc.apuesta ? [['APUESTA TOTAL', dinero(calc.apuesta)], ['GANANCIA TOTAL', dinero(calc.pago), 1]] : [])
      : (calc.dec || calc.apuesta ? [['MOMIO', calc.dec ? americano(calc.dec) : '—'], ['APUESTA', dinero(calc.apuesta)],
        ['GANANCIA TOTAL', dinero(calc.pago), 1]] : []);
    if (cols.length) {
      y += 40;
      var cw = (TW - 2 * PAD) / cols.length;
      if (pintar) {
        c.fillStyle = '#f3f7fb'; redondo(c, X + PAD, y, TW - 2 * PAD, 164, 28); c.fill();
        cols.forEach(function (k, i) {
          var cx = X + PAD + cw * i + cw / 2;
          if (i) { c.fillStyle = '#dbe6f1'; c.fillRect(X + PAD + cw * i - 1, y + 32, 2, 100); }
          c.textAlign = 'center';
          letra(c, 800, 21); espaciado(c, 2); c.fillStyle = TENUE; c.fillText(k[0], cx, y + 60); espaciado(c, 0);
          ajustar(c, 900, k[2] ? 52 : 46, 26, k[1], cw - 28);
          c.fillStyle = k[2] ? VERDE : TEXTO; c.fillText(k[1], cx, y + 124);
        });
      }
      y += 164;
    }
    y += PAD;
    var tarjeta = y - arriba;

    /* el nivel, el avatar y la firma: la firma se mide primero, porque la franja del nivel empieza
       a la altura de su punto verde, ya a la derecha del avatar */
    y += 44;
    var parte = [['GREEN ZONE', 900, VERDE], [' by Picksin', 800, TEXTO]], ancho = 30 + 16 + 16 + 46;
    parte.forEach(function (k) { letra(c, k[1], 44); ancho += c.measureText(k[0]).width; });
    var fx = (X + 282 + X + TW) / 2 - ancho / 2;
    var bh = 156, bt = y, bx = fx - 8, tx = bx + 40;
    if (pintar) {
      var fb = niv.fondo;
      if (!fb) { fb = c.createLinearGradient(bx, 0, X + TW, 0); fb.addColorStop(0, MARINO); fb.addColorStop(1, '#49ad33'); }
      c.save(); c.shadowColor = 'rgba(14, 40, 72, .18)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
      c.fillStyle = fb; redondo(c, bx, bt, X + TW - bx, bh, 40); c.fill(); c.restore();
      c.textAlign = 'left';
      letra(c, 800, 22); espaciado(c, 5); c.fillStyle = '#ffffff'; c.globalAlpha = 0.8;
      c.fillText('NIVEL', tx, bt + 54);
      var sx = tx + c.measureText('NIVEL').width + 14;
      espaciado(c, 0); c.globalAlpha = 1;
      for (var s = 0; s < 3; s++) {
        c.fillStyle = s < niv.n ? '#ffffff' : 'rgba(255, 255, 255, .3)';
        redondo(c, sx + s * 54, bt + 38, 46, 16, 8); c.fill();
      }
      var rotulo = niv.e + ' ' + niv.t.toUpperCase();
      ajustar(c, 900, 72, 36, rotulo, X + TW - 40 - tx);
      c.fillStyle = '#ffffff'; c.fillText(rotulo, tx, bt + 126);
    }
    y = bt + bh + 82;
    if (pintar) {
      c.fillStyle = VERDE; c.beginPath(); c.arc(fx + 15, y - 15, 15, 0, 2 * Math.PI); c.fill();
      fx += 46;
      c.textAlign = 'left';
      parte.forEach(function (k) { letra(c, k[1], 44); c.fillStyle = k[2]; c.fillText(k[0], fx, y); fx += c.measureText(k[0]).width; });
      fx += 16;
      c.fillStyle = VERDE; redondo(c, fx, y - 40, 46, 46, 10); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(fx + 11, y - 17); c.lineTo(fx + 20, y - 8); c.lineTo(fx + 36, y - 29); c.stroke();
      if (A.avatar) {
        var ah = 292, aw = ah * A.avatar.width / A.avatar.height, ax = X + 22, ab = y + 30;
        c.fillStyle = 'rgba(14, 40, 72, .14)'; c.beginPath(); c.ellipse(ax + aw / 2, ab - 4, aw * 0.42, 11, 0, 0, 2 * Math.PI); c.fill();
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
        c.drawImage(A.avatar, ax, ab - ah, aw, ah);
      }
    }
    return { H: y + 64, tarjeta: tarjeta };
  }
  function dibujarGZ() {
    var turno = ++gzTurno;
    return recursosGZ().then(function (A) {
      var l = document.createElement('canvas');
      l.width = 1080; l.height = 16;
      var plan = componerGZ(l.getContext('2d'), A, null);
      l.height = plan.H;
      componerGZ(l.getContext('2d'), A, plan);
      return new Promise(function (ok) { l.toBlob(ok, 'image/png'); });
    }).then(function (b) {
      if (turno !== gzTurno || !b) { return; }
      gzBlob = b;
      if (gzUrl) { URL.revokeObjectURL(gzUrl); }
      gzUrl = URL.createObjectURL(b);
      var img = $('#gz-img');
      if (img) { img.src = gzUrl; img.closest('.gz-vista').classList.remove('preparando'); }
    });
  }
  function renderGZ() {
    clearTimeout(gzReloj);
    gzBlob = null;
    var v = $('.gz-vista');
    if (v) { v.classList.add('preparando'); }
    if (!GZ.patas.length) { return; }
    gzReloj = setTimeout(dibujarGZ, 220);
  }
  function nombreGZ() { return 'green-zone-' + diaGZ(GZ.patas).fecha + '.png'; }

  /* ---------------------------------------------------------------- la pantalla */
  function itemGZ(p) {
    var dentro = GZ.patas.some(function (x) { return x.id === p.id; }), bloq = cerrado(p, false);
    return '<li><button type="button" class="gz-item" data-accion="gz-alternar" data-id="' + esc(p.id) + '" aria-pressed="' + dentro + '">' +
      '<span class="gz-check" aria-hidden="true">✓</span><span class="gz-item-txt"><b>' + esc(p.mercado) + '</b>' +
      '<small>' + esc(p.partido) + '</small><small>' + bandera(p.bandera) + ' ' + esc(p.nombre) + ' · 📅 ' + esc(cuando(p)) +
      ' · 📈 ' + pct(p.p) + (bloq ? ' · 🔒 ya empezó' : '') + '</small><span class="gz-item-por">' + personas(p.por) + '</span></span></button></li>';
  }
  function listaGZ() {
    var dias = unicos(gzPicks.map(function (p) { return p.fecha || ''; }).concat(gzPicks.some(function (p) { return !p.fecha; }) ? [''] : []));
    var dia = GZ.dia != null && (GZ.dia === '*' || dias.indexOf(GZ.dia) >= 0) ? GZ.dia : null, h0 = hoy();
    if (dia == null) { dia = dias.filter(function (d) { return d && d >= h0; })[0] || '*'; }
    var picks = gzPicks.filter(function (p) { return dia === '*' || (p.fecha || '') === dia; });
    var chip = function (k, t) { return '<button type="button" data-accion="gz-dia" data-dia="' + k + '" aria-current="' + (dia === k) + '">' + t + '</button>'; };
    return '<nav class="filtros gz-dias" aria-label="Filtrar por día">' + chip('*', '🗓️ Todos <b>' + gzPicks.length + '</b>') + dias.map(function (d) {
      var n = gzPicks.filter(function (p) { return (p.fecha || '') === d; }).length;
      var etq = d === h0 ? 'hoy' : d === masDias(h0, 1) ? 'mañana' : '';
      return chip(d, (d ? fCorta(d) : 'Por confirmar') + (etq ? ' · ' + etq : '') + ' <b>' + n + '</b>');
    }).join('') + '</nav>' +
      (picks.length ? '<ul class="gz-lista">' + picks.map(itemGZ).join('') + '</ul>' : vacio('📭', 'No hay picks escogidos ese día.'));
  }
  function cajaMomio(signo, valor, attrs, accion) {
    return '<span class="gz-caja"><button type="button" class="gz-signo" data-accion="' + accion + '" aria-label="Cambiar el signo del momio">' +
      (signo === '+' ? '+' : '−') + '</button><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" ' + attrs +
      ' value="' + esc(valor || '') + '" placeholder="momio" aria-label="Momio"></span>';
  }
  function pataPropiaGZ(x, i, c) {
    var p = x.pick, dep = deporteDe(p);
    var campo = function (t, html, clase) { return '<label' + (clase ? ' class="' + clase + '"' : '') + '><span>' + t + '</span>' + html + '</label>'; };
    var texto = function (k, ph, tipo) {
      return '<input type="' + (tipo || 'text') + '" data-gm="' + k + '" value="' + esc(p[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') +
        ' autocomplete="off">';
    };
    var lista = function (k, opciones) {
      return '<select data-gm="' + k + '">' + opciones.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + ((p[k] || '') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    };
    return '<li class="gz-pata gz-propia" data-id="' + esc(x.id) + '"><div class="gz-pata-cab">' +
      (GZ.patas.length > 1 ? '<span class="gz-num">' + (i + 1) + '</span>' : '') +
      '<div class="gz-pata-txt"><b>✍️ Selección propia</b><small data-gz-out="propia-sub">' + dep[0] + ' ' + esc(dep[1]) + '</small></div>' +
      '<button type="button" class="gz-quitar" data-accion="gz-quitar" aria-label="Quitar de la jugada">✕</button></div>' +
      '<div class="gz-form">' +
      campo('Deporte', lista('deporte', Object.keys(DEPORTES).map(function (k) { return [k, DEPORTES[k][0] + ' ' + DEPORTES[k][1]]; }))) +
      campo('País', lista('pais', PAISES.map(function (o) { return [o[0], (o[0] ? banderaDe(o[0]) + ' ' : '') + o[1]]; }))) +
      campo('Torneo o liga', texto('nombre', 'MLB, ATP, UFC… (opcional)'), 'ancho') +
      campo('Local / jugador 1', texto('local', 'ej. Yankees'), 'ancho') +
      campo('Visitante / jugador 2', texto('visitante', 'ej. Red Sox'), 'ancho') +
      campo('Fecha', texto('fecha', '', 'date')) +
      campo('Hora', texto('hora', '', 'time')) +
      campo('Tu apuesta', texto('mercado', 'ej. Yankees gana, Más de 8.5 carreras'), 'ancho') + '</div>' +
      '<div class="gz-pata-datos"><label class="gz-campo"><span>Momio</span>' + cajaMomio(x.signo, x.momio, 'data-gz="momio"', 'gz-signo') + '</label>' +
      (c.tipo === 'directas' ? '<label class="gz-campo"><span>Apuesta</span><span class="gz-caja"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" ' +
        'data-gz="apuesta-pata" value="' + esc(x.apuesta || '') + '" placeholder="' + esc(GZ.apuesta || '500') + '" aria-label="Apuesta de esta selección"></span></label>' +
        '<span class="gz-pata-gana" data-gz-out="pata-gana"></span>' : '') + '</div>' +
      '<details class="gz-extra"' + (p.just || p.pTxt ? ' open' : '') + '><summary>📝 Justificación y probabilidad (para el texto)</summary>' +
      '<textarea data-gm="just" rows="3" placeholder="Por qué la escogiste, con números si los tienes">' + esc(p.just || '') + '</textarea>' +
      '<label class="gz-campo"><span>Probabilidad</span><span class="gz-caja"><input type="text" inputmode="decimal" autocomplete="off" data-gm="prob" value="' +
      esc(p.pTxt || '') + '" placeholder="ej. 75" aria-label="Probabilidad en porcentaje"><i class="gz-pct">%</i></span></label></details></li>';
  }
  function pataGZ(x, i, c) {
    if (x.manual) { return pataPropiaGZ(x, i, c); }
    var p = x.pick, repetido = GZ.patas.filter(function (y) { return y.pick.partido === p.partido; }).length > 1;
    return '<li class="gz-pata" data-id="' + esc(x.id) + '"><div class="gz-pata-cab">' + (GZ.patas.length > 1 ? '<span class="gz-num">' + (i + 1) + '</span>' : '') +
      '<div class="gz-pata-txt"><b>' + esc(p.mercado) + '</b><small>' + bandera(p.bandera) + ' ' + esc(p.partido) + ' · 📅 ' + esc(cuando(p)) + '</small></div>' +
      '<button type="button" class="gz-quitar" data-accion="gz-quitar" aria-label="Quitar de la jugada">✕</button></div>' +
      '<div class="gz-pata-datos"><label class="gz-campo"><span>Momio</span>' + cajaMomio(x.signo, x.momio, 'data-gz="momio"', 'gz-signo') + '</label>' +
      (c.tipo === 'directas' ? '<label class="gz-campo"><span>Apuesta</span><span class="gz-caja"><i>$</i><input type="text" inputmode="decimal" autocomplete="off" ' +
        'data-gz="apuesta-pata" value="' + esc(x.apuesta || '') + '" placeholder="' + esc(GZ.apuesta || '500') + '" aria-label="Apuesta de esta selección"></span></label>' +
        '<span class="gz-pata-gana" data-gz-out="pata-gana"></span>' : '') +
      (p.cuota ? '<small class="gz-justo" data-gz-out="justo" data-cuota="' + esc(p.cuota) + '"></small>' : '') + '</div>' +
      (repetido ? '<p class="gz-aviso">⚠️ Otra selección es del mismo partido: muchas casas no dejan combinarlas.</p>' : '') + '</li>';
  }
  function panelGZ() {
    var P = GZ.patas, c = calcularGZ();
    var h = '<h2><span class="emoji">2️⃣</span>Tu jugada' + (P.length ? ' <span class="cuenta">' + plural(P.length, 'selección', 'selecciones') + '</span>' : '') + '</h2>';
    if (!P.length) {
      return h + vacio('🎯', 'Toca los picks de la lista o agrega una selección propia: una para una directa, dos o más para un parlay o varias directas.');
    }
    if (P.length > 1) {
      h += '<div class="conmutador gz-tipo" role="group" aria-label="Tipo de jugada">' +
        '<button type="button" data-accion="gz-tipo" data-tipo="parlay" aria-pressed="' + (c.tipo === 'parlay') + '">🔗 Parlay</button>' +
        '<button type="button" data-accion="gz-tipo" data-tipo="directas" aria-pressed="' + (c.tipo === 'directas') + '">🎯 Directas</button></div>';
    }
    h += '<ol class="gz-patas">' + P.map(function (x, i) { return pataGZ(x, i, c); }).join('') + '</ol>';
    h += '<div class="gz-totales">';
    if (c.tipo === 'parlay') {
      h += '<div class="gz-fila"><span>📈 Momio del parlay</span>' + (GZ.total
        ? '<span class="gz-fin">' + cajaMomio(GZ.total.signo, GZ.total.valor, 'data-gz="total"', 'gz-signo-total') +
          '<button type="button" class="enlace-btn" data-accion="gz-total-auto">↺ Calcular</button></span>'
        : '<span class="gz-fin"><b data-gz-out="total"></b><button type="button" class="enlace-btn" data-accion="gz-total-editar">✏️ Ajustar</button></span>') +
        '</div><small class="gz-nota" data-gz-out="total-nota"></small>';
    }
    h += '<label class="gz-fila"><span>💵 ' + (c.tipo === 'directas' ? 'Apuesta de cada una' : 'Apuesta') + '</span><span class="gz-caja"><i>$</i>' +
      '<input type="text" inputmode="decimal" autocomplete="off" data-gz="apuesta" value="' + esc(GZ.apuesta) + '" placeholder="1500" aria-label="Apuesta"></span></label>' +
      '<div class="gz-gana"><span>💰 Ganancia total' + (c.tipo === 'directas' ? ' <small>(si pegan todas)</small>' : '') + '</span><b data-gz-out="pago"></b>' +
      '<small data-gz-out="utilidad"></small></div></div>';
    h += '<h3>Nivel</h3><div class="gz-niveles" role="group" aria-label="Nivel">' + Object.keys(NIVELES).map(function (k) {
      var n = NIVELES[k];
      return '<button type="button" class="n-' + k + '" data-accion="gz-nivel" data-nivel="' + k + '" aria-pressed="' + (GZ.nivel === k) + '">' +
        '<span class="e" aria-hidden="true">' + n.e + '</span>' + n.t + '</button>';
    }).join('') + '</div>';
    h += '<h2><span class="emoji">3️⃣</span>Guarda y comparte en Green Zone</h2>' +
      '<button type="button" class="boton secundario gz-guardar" data-accion="gz-guardar">💾 Guardar en el historial</button>' +
      '<div class="gz-vista preparando"><img id="gz-img" alt="Vista previa de la imagen para el grupo"' + (gzUrl ? ' src="' + gzUrl + '"' : '') + '></div>' +
      '<button type="button" class="boton gz-compartir" data-accion="gz-compartir">📤 Compartir en Green Zone</button>' +
      '<div class="gz-mas"><button type="button" class="boton secundario" data-accion="gz-descargar">⬇️ Descargar imagen</button>' +
      '<button type="button" class="boton secundario" data-accion="gz-copiar">📋 Copiar texto</button>' +
      '<button type="button" class="boton secundario" data-accion="gz-limpiar">🧹 Empezar otra</button></div>';
    return h;
  }
  /* lo que cambia al escribir, sin repintar (para no perder el cursor) */
  function salidasGZ() {
    var c = calcularGZ(), g = $('.gz-guardar');
    if (g) {
      var hecho = GZ.guardado === firmaGZ();
      g.disabled = hecho;
      g.classList.toggle('hecho', hecho);
      g.textContent = hecho ? '✓ Guardada en el historial' : '💾 Guardar en el historial';
    }
    $$('[data-gz-out]').forEach(function (el) {
      var k = el.getAttribute('data-gz-out'), li = el.closest('[data-id]'), i = li ? GZ.patas.indexOf(pataDe(el)) : -1;
      if (k === 'total') { el.textContent = c.calculado ? americano(c.calculado) : '—'; }
      else if (k === 'total-nota') {
        el.textContent = GZ.total ? 'Ajustado a mano' + (c.calculado ? ' · con los momios de cada selección sale ' + americano(c.calculado) : '')
          : c.completos ? 'Calculado con el momio de cada selección.' : 'Escribe el momio de cada selección para calcularlo.';
      } else if (k === 'pago') { el.textContent = dinero(c.pago); }
      else if (k === 'utilidad') { el.textContent = c.utilidad ? 'Utilidad +' + dinero(c.utilidad) + ' sobre ' + dinero(c.apuesta) : ''; }
      else if (k === 'pata-gana' && i >= 0) { el.textContent = c.patas && c.patas[i].pago ? 'gana ' + dinero(c.patas[i].pago) : ''; }
      else if (k === 'justo' && i >= 0) {
        var q = parseFloat(el.getAttribute('data-cuota')), d = c.decs[i];
        el.textContent = 'cuota implícita ' + americano(q) + (d ? (d >= q ? ' · ✓ la casa paga más' : ' · la casa paga menos') : '');
        el.classList.toggle('valor', !!d && d >= q);
      }
    });
  }
  function cargarJustGZ() {
    GZ.patas.forEach(function (x) {
      if (x.manual || !x.pick.sa || !x.pick.archivo) { return; }
      docLiga(x.pick.sa, x.pick.archivo).then(function (d) {
        var p = todosLosPicks(d).filter(function (q) { return q && q.partido === x.pick.partido && q.mercado === x.pick.mercado; })[0];
        if (p && p.just && p.just !== x.pick.just) { x.pick.just = p.just; guardarGZ(); }
      }, function () { /* sin el analisis: el texto sale solo con la probabilidad */ });
    });
  }
  function agregarPropiaGZ() {
    GZ.patas.push({ id: 'propia-' + Date.now().toString(36), manual: true, signo: '-', momio: '', apuesta: '',
      pick: { manual: true, deporte: 'futbol', pais: 'MX', bandera: banderaDe('MX'), nombre: '', local: '', visitante: '',
        partido: '', mercado: '', fecha: GZ.dia && GZ.dia !== '*' ? GZ.dia : hoy(), hora: '', just: '', p: null, pTxt: '' } });
    GZ.total = null;
    guardarGZ();
    pintarPanelGZ();
    var ult = $$('.gz-propia');
    if (ult.length) {
      ult[ult.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
      var i = $('[data-gm="local"]', ult[ult.length - 1]);
      if (i) { i.focus({ preventScroll: true }); }
    }
  }
  function pintarPanelGZ() {
    var p = $('#gz-panel');
    if (!p) { return; }
    cargarJustGZ();
    p.innerHTML = panelGZ();
    salidasGZ();
    renderGZ();
    var f = $('#gz-flotante');
    if (f) {
      f.hidden = !GZ.patas.length;
      f.innerHTML = '🟢 ' + plural(GZ.patas.length, 'selección', 'selecciones') + ' · ver tu jugada ↓';
    }
  }
  function vGreen(partes) {
    var cab = cabeceraGZ('armar');
    if (!Editor.activo) { return pintar(cab + CANDADO, SECC.green[1]); }
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'analisis') || semanaDe(hoy());
      return Esc.cargar(sem).then(function (E) {
        gzPicks = E.picks.slice().sort(ordenPicks);
        var h = cab + selectorSemana(idx, sem, 'green');
        h += '<div class="gz"><section class="gz-col"><h2><span class="emoji">1️⃣</span>Escoge tus selecciones</h2>' +
          '<button type="button" class="boton secundario gz-propia-btn" data-accion="gz-propia">✍️ Agregar una selección propia</button>' +
          '<p class="criterio gz-propia-nota">Para lo que no está en el análisis (tenis, box, béisbol…). Se combina con los escogidos en parlay o en directas.</p>' +
          '<h3>✅ De los picks escogidos</h3>' +
          (gzPicks.length ? '<div id="gz-lista">' + listaGZ() + '</div>'
            : vacio('📭', 'Todavía no hay picks escogidos en esta semana. Escógelos en <a href="#/analisis/' + sem + '">📊 Análisis</a>.')) +
          '</section><section class="gz-col gz-panel" id="gz-panel"></section></div>' +
          '<button type="button" class="gz-flotante" id="gz-flotante" data-accion="ir" data-id="gz-panel" hidden></button>';
        pintar(h, SECC.green[1]);
        pintarPanelGZ();
        if (gzVigia) { gzVigia.disconnect(); gzVigia = null; }
        if (window.IntersectionObserver) {
          gzVigia = new IntersectionObserver(function (e) { var f = $('#gz-flotante'); if (f) { f.classList.toggle('oculto', e[0].isIntersecting); } });
          gzVigia.observe($('#gz-panel'));
        }
      });
    });
  }
  function alternarGZ(id) {
    var ya = GZ.patas.filter(function (x) { return x.id === id; })[0];
    if (ya) {
      GZ.patas = GZ.patas.filter(function (x) { return x !== ya; });
    } else {
      var p = gzPicks.filter(function (x) { return x.id === id; })[0];
      if (!p) { return; }
      GZ.patas.push({ id: id, pick: copia(p), signo: '-', momio: '', apuesta: '' });
      GZ.patas.sort(function (a, b) { return ordenPicks(a.pick, b.pick); });
    }
    GZ.total = null;
    guardarGZ();
    $$('.gz-item').forEach(function (b) {
      var id2 = b.getAttribute('data-id');
      b.setAttribute('aria-pressed', GZ.patas.some(function (x) { return x.id === id2; }));
    });
    pintarPanelGZ();
  }
  function copiarTexto(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) { return navigator.clipboard.writeText(t); }
    return new Promise(function (ok, mal) {
      var a = document.createElement('textarea');
      a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.appendChild(a); a.select();
      try { if (document.execCommand('copy')) { ok(); } else { mal(); } } catch (e) { mal(e); }
      document.body.removeChild(a);
    });
  }
  function descargarGZ() {
    if (!gzUrl) { return false; }
    var a = document.createElement('a');
    a.href = gzUrl; a.download = nombreGZ();
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return true;
  }
  /* un toque: la hoja de compartir del telefono (WhatsApp, Telegram...) con la imagen y el texto */
  function compartirGZ() {
    if (!GZ.patas.length) { return; }
    if (!gzBlob) { avisar('⏳ La imagen se está preparando: vuelve a tocar en un segundo.'); return; }
    var texto = textoGZ(), archivo = null;
    try { archivo = new File([gzBlob], nombreGZ(), { type: 'image/png' }); } catch (e) { archivo = null; }
    var copiado = texto ? copiarTexto(texto).then(function () { return true; }, function () { return false; }) : Promise.resolve(false);
    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      navigator.share(texto ? { files: [archivo], text: texto } : { files: [archivo] }).then(function () {
        copiado.then(function (ok) { if (ok) { avisar('✅ Listo. El texto también quedó copiado por si lo quieres pegar.'); } });
      }, function (e) {
        if (e && e.name !== 'AbortError') { descargarGZ(); avisar('📥 Se descargó la imagen: compártela desde tu galería.'); }
      });
      return;
    }
    descargarGZ();
    copiado.then(function (ok) {
      avisar(ok ? '📥 Imagen descargada y texto copiado: pégalos en el grupo.' : '📥 Imagen descargada: súbela al grupo.');
    });
  }

  /* ================================================================== 7. historial y reporte de Green Zone */
  /* Cada seleccion del dia que se guarda va a data/green/<jueves>.json (la escribe el intermediario,
     como los escogidos). Su resultado lo marca quien la guardo o picksin; las que son solo de picks
     del analisis se resuelven solas con la auditoria de su jornada mientras nadie las marque. */
  var PRIMERA_GREEN = '2026-08-27';                 // el historial se busca desde aqui (a lo mas 14 semanas)
  var RES = { ganada: ['✅', 'Ganada'], perdida: ['❌', 'Perdida'], nula: ['➖', 'Nula'], pendiente: ['⏳', 'Pendiente'] };
  var Hist = { datos: {}, cache: false }, repBlob = null, repUrl = null, repNombre = '', repTurno = 0;
  var CANDADO = '<div class="vacio"><span class="emoji">🔑</span>Esto es de los seleccionadores: entra con tu clave.' +
    '<p><button type="button" class="boton" data-accion="editor">🔑 Entrar al modo editor</button></p></div>';

  function normalizarHist(d, sem) {
    d = d || {};
    return { semana: sem, actualizado: d.actualizado || null,
      selecciones: (d.selecciones || []).map(function (s) { s._sem = sem; return s; }) };
  }
  function semanasEntre(desde, hasta) {
    var out = [];
    for (var s = semanaDe(desde); s <= semanaDe(hasta); s = masDias(s, 7)) { out.push(s); }
    return out;
  }
  function diasEntre(a, b) { return Math.round((fecha(b) - fecha(a)) / 864e5) + 1; }
  /* al entrar a la vista se lee de nuevo; tras marcar o borrar se usa lo que devolvio el intermediario */
  Hist.cargar = function (semanas) {
    var faltan = Hist.cache ? semanas.filter(function (s) { return !Hist.datos[s]; }) : semanas.slice();
    Hist.cache = false;
    if (!faltan.length) { return Promise.resolve(); }
    var p = Editor.activo
      ? llamar('green', { op: 'leer', semanas: faltan }).then(function (r) { return r.archivos || {}; })
      : Promise.all(faltan.map(function (s) { return cargar('data/green/' + s + '.json', true); })).then(function (xs) {
        var o = {};
        faltan.forEach(function (s, i) { o[s] = xs[i]; });
        return o;
      });
    return p.then(function (a) { faltan.forEach(function (s) { Hist.datos[s] = normalizarHist(a[s], s); }); });
  };
  Hist.lista = function (semanas) {
    return [].concat.apply([], semanas.map(function (s) { return Hist.datos[s] ? Hist.datos[s].selecciones : []; }))
      .sort(function (a, b) { return a.fecha.localeCompare(b.fecha) || String(a.creado).localeCompare(String(b.creado)); });
  };
  function mapasHist(sels) {
    var sas = unicos([].concat.apply([], sels.map(function (s) { return s.patas.map(function (p) { return p.sa; }); })));
    return Promise.all(sas.map(function (s) { return resultados(s).catch(function () { return null; }); })).then(function (rs) {
      var m = {};
      sas.forEach(function (s, i) { m[s] = rs[i] || {}; });
      return m;
    });
  }
  /* el resultado: el que se marco o, si todas sus selecciones son del analisis, el de la auditoria */
  function estadoSel(s, mapas) {
    if (s.resultado) { return { e: s.resultado, auto: false }; }
    var est = s.patas.map(function (p) {
      if (p.manual || !p.archivo || !p.sa) { return null; }
      var r = ((mapas[p.sa] || {})[p.archivo] || {})[p.partido + '|' + p.mercado];
      return r ? r[0] : null;
    });
    if (est.some(function (e) { return e === 'fallo'; })) { return { e: 'perdida', auto: true }; }
    if (est.every(function (e) { return e === 'acierto' || e === 'anulado'; })) {
      return { e: est.some(function (e) { return e === 'acierto'; }) ? 'ganada' : 'nula', auto: true };
    }
    return { e: 'pendiente', auto: false };
  }
  function contarHist(sels, mapas) {
    var n = { total: 0, ganada: 0, perdida: 0, nula: 0, pendiente: 0, balance: 0, apostado: 0 };
    sels.forEach(function (s) {
      var e = estadoSel(s, mapas).e;
      n.total++; n[e]++;
      if (e === 'ganada' && s.apuesta && s.pago) { n.balance += s.pago - s.apuesta; n.apostado += s.apuesta; }
      if (e === 'perdida' && s.apuesta) { n.balance -= s.apuesta; n.apostado += s.apuesta; }
    });
    n.efectividad = n.ganada + n.perdida ? n.ganada / (n.ganada + n.perdida) : null;
    return n;
  }
  function marcadorHist(n) {
    return marcadorCajas([['✅ Ganadas', n.ganada, 'verde'], ['❌ Perdidas', n.perdida, 'rojo'], ['🎯 Efectividad', pct(n.efectividad), 'azul'],
      ['💰 Balance', (n.balance > 0 ? '+' : n.balance < 0 ? '−' : '') + dinero(Math.abs(n.balance)), n.balance >= 0 ? 'verde' : 'rojo']]) +
      tira({ ok: n.ganada, ko: n.perdida, nulo: n.nula, pend: n.pendiente }) +
      '<p class="leyenda"><span>📚 ' + plural(n.total, 'selección', 'selecciones') + '</span><span>➖ ' + plural(n.nula, 'nula', 'nulas') +
      '</span><span>⏳ ' + plural(n.pendiente, 'pendiente', 'pendientes') + '</span>' +
      (n.apostado ? '<span>💵 ' + dinero(n.apostado) + ' en juego en las ya resueltas</span>' : '') + '</p>';
  }
  function cabeceraGZ(activa) {
    var t = { armar: ['🟢', SECC.green[1], SECC.green[2]],
      historial: ['📚', 'Historial de selecciones', 'Todas las selecciones del día guardadas, con su resultado.'],
      reporte: ['📊', 'Reporte para redes', 'Tus días ganados y perdidos en una imagen: elige del día al día (hasta 10).'] }[activa];
    return '<div class="titulo-seccion gz-titulo"><img class="gz-avatar" src="assets/avatar.webp" alt="" width="46" height="68">' +
      '<div><h1>' + t[0] + ' ' + t[1] + '</h1><p class="sub">' + t[2] + '</p></div></div>' +
      '<nav class="gz-tabs" aria-label="Green Zone">' + [['armar', '#/green', '🟢 Armar'], ['historial', '#/historial', '📚 Historial'],
        ['reporte', '#/reporte', '📊 Reporte']].map(function (x) {
        return '<a href="' + x[1] + '"' + (x[0] === activa ? ' aria-current="page"' : '') + '>' + x[2] + '</a>';
      }).join('') + '</nav>';
  }

  /* ---------------------------------------------------------------- guardar desde "Armar" */
  function nuevoId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function firmaGZ() {
    return JSON.stringify([GZ.patas.length > 1 ? GZ.tipo : 'directa', GZ.nivel, GZ.apuesta, GZ.total, GZ.patas.map(function (x) {
      var p = x.pick;
      return [x.id, x.signo, x.momio, x.apuesta, x.manual ? [p.deporte, p.bandera, p.nombre, p.partido, p.mercado, p.fecha, p.hora] : 0];
    })]);
  }
  /* una jugada = una seleccion del dia; las directas se guardan cada una por separado */
  function seleccionesDeGZ() {
    var c = calcularGZ(), P = GZ.patas;
    var pata = function (x, i) {
      var p = x.pick;
      return { manual: !!x.manual, deporte: p.deporte || 'futbol', bandera: p.bandera || '', nombre: nombreDe(p),
        partido: p.partido || '', mercado: String(p.mercado || '').trim(), fecha: p.fecha || '', hora: p.hora || '',
        momio: c.decs[i] ? americano(c.decs[i]) : '', dec: c.decs[i] || null, p: p.p || null,
        archivo: x.manual ? undefined : p.archivo, sa: x.manual ? undefined : p.sa };
    };
    if (c.tipo === 'directas') {
      return P.map(function (x, i) {
        return { fecha: x.pick.fecha || hoy(), tipo: 'directa', nivel: GZ.nivel, momio: c.decs[i] ? americano(c.decs[i]) : '',
          dec: c.decs[i] || null, apuesta: c.patas[i].apuesta, pago: c.patas[i].pago, patas: [pata(x, i)] };
      });
    }
    return [{ fecha: diaGZ(P).fecha, tipo: c.tipo === 'parlay' ? 'parlay' : 'directa', nivel: GZ.nivel,
      momio: c.dec ? americano(c.dec) : '', dec: c.dec || null, apuesta: c.apuesta, pago: c.pago, patas: P.map(pata) }];
  }
  function guardarSelGZ(b) {
    if (!GZ.patas.length) { return; }
    if (GZ.patas.some(function (x) { return !String(x.pick.mercado || '').trim(); })) {
      avisar('✍️ A una selección propia le falta «Tu apuesta».');
      return;
    }
    var firma = firmaGZ(), sels = seleccionesDeGZ();
    if (!GZ.ids || GZ.ids.firma !== firma || GZ.ids.lista.length !== sels.length) {   // reintentar no la duplica
      GZ.ids = { firma: firma, lista: sels.map(function () { return nuevoId(); }) };
      guardarGZ();
    }
    sels.forEach(function (s, i) { s.id = GZ.ids.lista[i]; });
    b.disabled = true;
    b.textContent = '⏳ Guardando…';
    llamar('green', { op: 'guardar', sels: sels }).then(function (r) {
      Object.keys(r.archivos || {}).forEach(function (s) { Hist.datos[s] = normalizarHist(r.archivos[s], s); });
      GZ.guardado = firma;
      guardarGZ();
      salidasGZ();
      avisar('💾 Guardada en el historial' + (sels.length > 1 ? ' (' + sels.length + ' directas)' : '') + '.', '#/historial', 'Ver historial');
    }, function (e) {
      salidasGZ();
      avisar('⚠️ No se guardó: ' + (e.estado === 401 ? 'tu clave ya no es válida' : e.message));
    });
  }

  /* ---------------------------------------------------------------- historial */
  function tarjetaHist(s, mapas, nDia, iDia) {
    var st = estadoSel(s, mapas), niv = NIVELES[s.nivel] || NIVELES.fuerte;
    var puede = s.por === Editor.persona || Editor.persona === 'picksin';
    return '<article class="hs r-' + st.e + '" data-sel="' + esc(s.id) + '" data-sem="' + esc(s._sem) + '">' +
      '<div class="hs-cab"><b>' + (s.tipo === 'parlay' ? '🔗 Parlay · ' + s.patas.length : '🎯 Directa') + '</b>' +
      (nDia > 1 ? '<span class="chip neutro">' + iDia + ' de ' + nDia + ' del día</span>' : '') +
      '<span class="chip n-' + esc(s.nivel) + '">' + niv.e + ' ' + niv.t + '</span>' + persona(s.por) + '</div>' +
      '<div class="hs-res">' + RES[st.e][0] + ' ' + RES[st.e][1] + (st.auto ? ' <small>según la auditoría</small>' : '') + '</div>' +
      '<ol class="hs-patas">' + s.patas.map(function (p) {
        return '<li><span class="hs-m">' + deporteDe(p)[0] + ' ' + esc(p.mercado) + '</span>' + (p.momio ? '<span class="hs-momio">' + esc(p.momio) + '</span>' : '') +
          '<small>' + (p.bandera ? bandera(p.bandera) + ' ' : '') + esc(p.nombre || '') + (p.partido ? ' · ' + esc(p.partido) : '') +
          (p.hora ? ' · ' + esc(p.hora) : '') + '</small></li>';
      }).join('') + '</ol>' +
      '<div class="hs-tot">' + [s.momio ? 'Momio <b>' + esc(s.momio) + '</b>' : '', s.apuesta ? 'Apuesta <b>' + dinero(s.apuesta) + '</b>' : '',
        s.pago ? 'Ganancia <b>' + dinero(s.pago) + '</b>' : ''].filter(Boolean).join(' · ') + '</div>' +
      (puede ? '<div class="hs-acciones">' + ['ganada', 'perdida', 'nula'].map(function (k) {
        return '<button type="button" class="r-' + k + '" data-accion="gz-hs-resultado" data-res="' + k + '" aria-pressed="' + (s.resultado === k) + '">' +
          RES[k][0] + ' ' + RES[k][1] + '</button>';
      }).join('') + (s.resultado ? '<button type="button" data-accion="gz-hs-resultado" data-res="" title="Volver a pendiente">↺</button>' : '') +
        '<button type="button" class="hs-borrar" data-accion="gz-hs-borrar" aria-label="Borrar del historial">🗑</button></div>' : '') +
      '</article>';
  }
  function vHistorial() {
    if (!Editor.activo) { return pintar(cabeceraGZ('historial') + CANDADO, 'Historial'); }
    var semanas = [];
    for (var s = masDias(semanaDe(hoy()), 7); s >= PRIMERA_GREEN && semanas.length < 14; s = masDias(s, -7)) { semanas.push(s); }
    return Hist.cargar(semanas).then(function () {
      var sels = Hist.lista(semanas);
      return mapasHist(sels).then(function (mapas) {
        var h = cabeceraGZ('historial');
        if (!sels.length) {
          return pintar(h + vacio('📚', 'Todavía no hay selecciones guardadas. Arma una en <a href="#/green">🟢 Armar</a> y toca ' +
            '<b>💾 Guardar en el historial</b>.'), 'Historial');
        }
        h += marcadorHist(contarHist(sels, mapas)) +
          '<p class="criterio">Márcalas al terminar sus partidos. Las que son solo de picks del análisis se resuelven solas cuando ' +
          'se audita su jornada («según la auditoría»); las que llevan una selección propia se marcan a mano.</p>';
        var dias = unicos(sels.map(function (x) { return x.fecha; })).sort().reverse();
        h += dias.map(function (d) {
          var del = sels.filter(function (x) { return x.fecha === d; });
          return '<div class="dia-cab">🗓️ ' + fLarga(d) + '<span class="cuenta">' + plural(del.length, 'selección', 'selecciones') + '</span></div>' +
            '<div class="hs-grid">' + del.map(function (x, i) { return tarjetaHist(x, mapas, del.length, i + 1); }).join('') + '</div>';
        }).join('');
        pintar(h, 'Historial');
      });
    });
  }
  function accionHist(t, op) {
    var card = t.closest('[data-sel]'), cuerpo = { op: op, semana: card.getAttribute('data-sem'), id: card.getAttribute('data-sel') };
    if (op === 'resultado') { cuerpo.resultado = t.getAttribute('data-res') || null; }
    else if (!confirm('¿Borrar esta selección del historial?')) { return; }
    $$('button', card).forEach(function (b) { b.disabled = true; });
    llamar('green', cuerpo).then(function (r) {
      Object.keys(r.archivos || {}).forEach(function (s) { Hist.datos[s] = normalizarHist(r.archivos[s], s); });
      Hist.cache = true;
      router(true);
    }, function (e) {
      avisar('⚠️ No se guardó: ' + e.message);
      $$('button', card).forEach(function (b) { b.disabled = false; });
    });
  }

  /* ---------------------------------------------------------------- reporte para redes */
  function vReporte(partes, q) {
    if (!Editor.activo) { return pintar(cabeceraGZ('reporte') + CANDADO, 'Reporte'); }
    var ok = function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null; };
    var hasta = ok(q.get('hasta')) || hoy(), desde = ok(q.get('desde')) || masDias(hasta, -6), nota = '';
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    if (diasEntre(desde, hasta) > 10) { desde = masDias(hasta, -9); nota = 'El reporte abarca hasta 10 días: se tomaron los 10 que terminan el ' + fCorta(hasta) + '.'; }
    var semanas = semanasEntre(desde, hasta), jue = semanaDe(hoy());
    return Hist.cargar(semanas).then(function () {
      var sels = Hist.lista(semanas).filter(function (s) { return s.fecha >= desde && s.fecha <= hasta; });
      return mapasHist(sels).then(function (mapas) {
        var n = contarHist(sels, mapas), h = cabeceraGZ('reporte');
        h += '<form class="rep-form" id="rep-form"><label class="gz-campo"><span>Del</span><input type="date" name="desde" value="' + desde + '"></label>' +
          '<label class="gz-campo"><span>al</span><input type="date" name="hasta" value="' + hasta + '"></label>' +
          '<button type="submit" class="boton">Ver reporte</button></form>' +
          '<nav class="filtros rep-atajos" aria-label="Periodos">' + [['Últimos 7 días', masDias(hoy(), -6), hoy()],
            ['Esta semana (jue–mié)', jue, masDias(jue, 6)], ['Semana pasada', masDias(jue, -7), masDias(jue, -1)],
            ['Últimos 10 días', masDias(hoy(), -9), hoy()]].map(function (x) {
            return '<a href="#/reporte?desde=' + x[1] + '&hasta=' + x[2] + '" aria-current="' + (x[1] === desde && x[2] === hasta) + '">' + x[0] + '</a>';
          }).join('') + '</nav>' + (nota ? '<p class="nota">' + nota + '</p>' : '');
        if (!sels.length) {
          return pintar(h + vacio('📭', 'No hay selecciones guardadas del ' + fCorta(desde) + ' al ' + fCorta(hasta) + '.'), 'Reporte');
        }
        h += marcadorHist(n) +
          (n.pendiente ? '<p class="nota">⏳ ' + plural(n.pendiente, 'selección sigue pendiente', 'selecciones siguen pendientes') +
            ': márcalas en <a href="#/historial">📚 Historial</a> para que el reporte salga completo.</p>' : '') +
          '<div class="gz-vista rep-vista preparando"><img id="rep-img" alt="Reporte para redes"></div>' +
          '<button type="button" class="boton gz-compartir" data-accion="gz-rep-compartir">📤 Compartir reporte</button>' +
          '<div class="gz-mas"><button type="button" class="boton secundario" data-accion="gz-rep-descargar">⬇️ Descargar imagen</button></div>';
        pintar(h, 'Reporte');
        dibujarReporte({ sels: sels, mapas: mapas, desde: desde, hasta: hasta, n: n });
      });
    });
  }

  /* la imagen: un mosaico de tarjetas en tres columnas (como la referencia de Javier). Las de las
     selecciones y la del titulo se ven completas; las del logo y el avatar rellenan y se salen
     por arriba o por abajo. */
  var REP = { AZUL: '#1279bb', MARINO: '#0f5989', NOCHE: '#0b3350', VERDE: '#49ad33', VERDE_OSC: '#2e8f35', ROJO: '#e5484d',
    GRIS: '#8796a8', CLARO: '#a9c6e0' };
  var ALTO_DECO = { logo: 300, cabeza: 250, festejo: 440, brazos: 430, parado: 390, lema: 340 };
  function recursosRep() {
    var f = document.fonts && document.fonts.load ? document.fonts.load('40px "Banderas Picksin"', '🇲🇽').catch(function () { return null; }) : null;
    return Promise.all(['assets/logo.webp', 'assets/avatar.webp', 'assets/avatar-cabeza.webp', 'assets/avatar-brazos.webp',
      'assets/avatar-festejo.webp'].map(imagen).concat([f])).then(function (r) {
      return { logo: r[0], parado: r[1], cabeza: r[2], brazos: r[3], festejo: r[4] };
    });
  }
  function imgEn(c, im, x, y, w, h, abajo) {
    if (!im || w <= 0 || h <= 0) { return; }
    var r = Math.min(w / im.width, h / im.height), iw = im.width * r, ih = im.height * r;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(im, x + (w - iw) / 2, abajo ? y + h - ih : y + (h - ih) / 2, iw, ih);
  }
  function rangoRep(a, b) {
    var x = fecha(a), y = fecha(b);
    return (x.getUTCMonth() === y.getUTCMonth() ? x.getUTCDate() : x.getUTCDate() + ' ' + MESES_C[x.getUTCMonth()]) + ' – ' +
      y.getUTCDate() + ' ' + MESES_C[y.getUTCMonth()];
  }
  function iconoRes(c, st, cx, cy, color) {
    c.save();
    c.strokeStyle = color; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    if (st === 'ganada') { c.moveTo(cx - 10, cy); c.lineTo(cx - 3, cy + 8); c.lineTo(cx + 11, cy - 9); }
    else if (st === 'perdida') { c.moveTo(cx - 8, cy - 8); c.lineTo(cx + 8, cy + 8); c.moveTo(cx + 8, cy - 8); c.lineTo(cx - 8, cy + 8); }
    else if (st === 'nula') { c.moveTo(cx - 10, cy); c.lineTo(cx + 10, cy); }
    else { c.lineWidth = 3.5; c.arc(cx, cy, 11, 0, 2 * Math.PI); c.moveTo(cx, cy - 6); c.lineTo(cx, cy); c.lineTo(cx + 5, cy + 3); }
    c.stroke();
    c.restore();
  }
  /* tarjeta de una seleccion del dia; sin pintar solo mide su alto */
  function cartaSel(c, it, x, y, w, pintar) {
    var s = it.s, P = 22, iw = w - 2 * P, yy = y + P, niv = NIVELES[s.nivel] || NIVELES.fuerte, d = fecha(s.fecha);
    var R = { ganada: [REP.VERDE, REP.NOCHE, 'GANADA'], perdida: [REP.ROJO, '#fff', 'PERDIDA'], nula: ['#c3cfdb', REP.NOCHE, 'NULA'],
      pendiente: ['#ffffff', REP.MARINO, 'PENDIENTE'] }[it.st];
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    if (pintar) {
      letra(c, 800, 21); espaciado(c, 3); c.fillStyle = REP.VERDE;
      c.fillText(DIAS[d.getUTCDay()].toUpperCase() + (it.n > 1 ? '  ·  ' + it.k + ' DE ' + it.n : ''), x + P, yy + 20);
      espaciado(c, 0);
      letra(c, 400, 38); c.textAlign = 'right'; c.fillText(niv.e, x + w - P, yy + 60); c.textAlign = 'left';
      letra(c, 900, 46); c.fillStyle = '#fff'; c.fillText(d.getUTCDate() + ' ' + MESES_C[d.getUTCMonth()].toUpperCase(), x + P, yy + 70);
    }
    yy += 90;
    if (pintar) {
      c.fillStyle = R[0]; redondo(c, x + P, yy, iw, 52, 12); c.fill();
      iconoRes(c, it.st, x + P + 30, yy + 26, R[1]);
      letra(c, 900, 26); espaciado(c, 2); c.fillStyle = R[1]; c.fillText(R[2], x + P + 56, yy + 35); espaciado(c, 0);
    }
    yy += 52 + 14;
    s.patas.slice(0, 4).forEach(function (p) {
      letra(c, 800, 22);
      partir(c, deporteDe(p)[0] + ' ' + p.mercado, iw, 2).forEach(function (l) {
        yy += 28;
        if (pintar) { c.fillStyle = '#fff'; c.fillText(l, x + P, yy); }
      });
      letra(c, 500, 18);
      var sub = ((p.bandera ? p.bandera + ' ' : '') + (p.partido || p.nombre || '')).trim();
      if (sub) {
        yy += 24;
        if (pintar) { c.fillStyle = REP.CLARO; c.fillText(partir(c, sub, iw, 1)[0], x + P, yy); }
      }
      yy += 12;
    });
    if (s.patas.length > 4) {
      yy += 20;
      if (pintar) { letra(c, 700, 18); c.fillStyle = REP.CLARO; c.fillText('+' + (s.patas.length - 4) + ' más', x + P, yy); }
      yy += 8;
    }
    yy += 4;
    if (pintar) { c.fillStyle = 'rgba(255, 255, 255, .16)'; c.fillRect(x + P, yy, iw, 2); }
    yy += 16;
    if (pintar) {
      letra(c, 800, 17); espaciado(c, 2); c.fillStyle = REP.VERDE;
      c.fillText(s.tipo === 'parlay' ? 'PARLAY · ' + s.patas.length : 'DIRECTA', x + P, yy + 26);
      espaciado(c, 0);
      if (s.momio) {
        letra(c, 900, 22);
        var mw = c.measureText(s.momio).width + 28;
        c.fillStyle = '#fff'; redondo(c, x + w - P - mw, yy, mw, 38, 12); c.fill();
        c.fillStyle = REP.NOCHE; c.textAlign = 'center'; c.fillText(s.momio, x + w - P - mw / 2, yy + 27); c.textAlign = 'left';
      }
    }
    yy += 38 + P;
    return yy - y;
  }
  function altoRecord(n) { return 24 + 46 + 3 * 116 + (n.nula || n.pendiente ? 34 : 0) + 14; }
  function cartaRecord(c, it, n) {
    var x = it.x, y = it.y, P = 24, filas = [[String(n.ganada), 'GANADAS', REP.VERDE_OSC], [String(n.perdida), 'PERDIDAS', REP.ROJO],
      [n.efectividad == null ? '—' : Math.round(n.efectividad * 100) + '%', 'EFECTIVIDAD', REP.AZUL]];
    c.textAlign = 'left';
    letra(c, 900, 30); espaciado(c, 3); c.fillStyle = REP.NOCHE; c.fillText('RÉCORD', x + P, y + P + 30); espaciado(c, 0);
    filas.forEach(function (f, i) {
      var yy = y + P + 46 + i * 116;
      letra(c, 900, 76); c.fillStyle = f[2]; c.fillText(f[0], x + P, yy + 70);
      letra(c, 800, 16); espaciado(c, 3);
      var lw = c.measureText(f[1]).width + 22;
      c.fillStyle = REP.NOCHE; c.fillRect(x + P, yy + 80, lw, 28);
      c.fillStyle = '#fff'; c.fillText(f[1], x + P + 11, yy + 100); espaciado(c, 0);
    });
    if (n.nula || n.pendiente) {
      letra(c, 700, 18); c.fillStyle = REP.GRIS;
      c.fillText([n.nula ? '➖ ' + plural(n.nula, 'nula', 'nulas') : '', n.pendiente ? '⏳ ' + plural(n.pendiente, 'pendiente', 'pendientes') : '']
        .filter(Boolean).join('  ·  '), x + P, y + P + 46 + 3 * 116 + 16);
    }
  }
  function cartaTitulo(c, it, R) {
    var x = it.x, y = it.y, w = it.w, P = 28, dias = diasEntre(R.desde, R.hasta);
    var l1 = 'REPORTE', l2 = dias === 7 ? 'SEMANAL' : 'DE ' + dias + ' DÍAS';
    c.textAlign = 'left';
    letra(c, 800, 20); espaciado(c, 5); c.fillStyle = 'rgba(255, 255, 255, .85)'; c.fillText('GREEN ZONE', x + P, y + P + 26); espaciado(c, 0);
    var t = Math.min(ajustar(c, 900, 66, 30, l1, w - 2 * P), ajustar(c, 900, 66, 30, l2, w - 2 * P));
    letra(c, 900, t); c.fillStyle = '#fff';
    c.fillText(l1, x + P, y + 130); c.fillText(l2, x + P, y + 130 + t);
    letra(c, 800, 28); c.fillText(rangoRep(R.desde, R.hasta).toUpperCase(), x + P, y + 130 + t + 52);
    var pill = 'RÉCORD ' + R.n.ganada + '–' + R.n.perdida;
    letra(c, 900, 24);
    var pw = c.measureText(pill).width + 48;
    c.fillStyle = '#fff'; redondo(c, x + P, y + it.h - P - 58, pw, 58, 29); c.fill();
    c.fillStyle = REP.NOCHE; c.fillText(pill, x + P + 24, y + it.h - P - 20);
  }
  function cartaDeco(c, A, it, v0, v1) {
    var x = it.x, w = it.w, P = 26, top = v0 + P, bot = v1 - P, yy = top;
    if (bot - top < 70) { return; }
    c.textAlign = 'left';
    if (it.tipo === 'logo') { imgEn(c, A.logo, x + 46, top + 6, w - 92, bot - top - 12); }
    else if (it.tipo === 'cabeza') { imgEn(c, A.cabeza, x + 36, top, w - 72, bot - top); }
    else if (it.tipo === 'parado') { imgEn(c, A.parado, x + 40, top, w - 80, bot - top, true); }
    else if (it.tipo === 'festejo' || it.tipo === 'brazos') {
      var fr = it.tipo === 'festejo' ? [['GREEN', REP.VERDE], ['ZONE', '#fff']] : [['NO ES SUERTE,', '#fff'], ['ES CIENCIA', '#c9f0ba']];
      var t = Math.min.apply(null, fr.map(function (k) { return ajustar(c, 900, it.tipo === 'festejo' ? 70 : 34, 20, k[0], w - 2 * P); }));
      fr.forEach(function (k) { yy += t * 0.9; letra(c, 900, t); c.fillStyle = k[1]; c.fillText(k[0], x + P, yy); yy += t * 0.12; });
      imgEn(c, it.tipo === 'festejo' ? A.festejo : A.brazos, x + 30, yy + 18, w - 60, bot - yy - 18, true);
    } else if (it.tipo === 'lema') {
      var ls = [['NO ES', '#fff'], ['SUERTE,', '#fff'], ['ES', '#c9f0ba'], ['CIENCIA', '#c9f0ba']];
      var t2 = ajustar(c, 900, 70, 24, 'CIENCIA', w - 2 * P);
      ls.forEach(function (k) {
        yy += t2 * 0.92;
        if (yy > bot) { return; }
        letra(c, 900, t2); c.fillStyle = k[1]; c.fillText(k[0], x + P, yy); yy += t2 * 0.1;
      });
    }
  }
  function planReporte(c, R) {
    var W = 1080, M = 30, G = 22, CW = (W - 2 * M - 2 * G) / 3;
    var cols = [0, 1, 2].map(function (i) { return { x: M + i * (CW + G), y: [-80, M, -150][i] }; }), items = [];
    var poner = function (col, it) { it.x = col.x; it.y = col.y; it.w = CW; items.push(it); col.y += it.h + G; };
    poner(cols[0], { tipo: 'cabeza', h: ALTO_DECO.cabeza });
    poner(cols[1], { tipo: 'titulo', h: 440 });
    poner(cols[2], { tipo: 'logo', h: ALTO_DECO.logo + 30 });
    poner(cols[2], { tipo: 'record', h: altoRecord(R.n) });            // asi los dias empiezan por la izquierda
    var cola = [], decos = ['festejo', 'brazos', 'lema', 'parado'], d = 0, porDia = {};
    R.sels.forEach(function (s) { (porDia[s.fecha] = porDia[s.fecha] || []).push(s); });
    R.sels.forEach(function (s, i) {
      var del = porDia[s.fecha];
      cola.push({ tipo: 'sel', s: s, st: estadoSel(s, R.mapas).e, n: del.length, k: del.indexOf(s) + 1 });
      if ((i + 1) % 3 === 0 && d < decos.length) { cola.push({ tipo: decos[d], h: ALTO_DECO[decos[d++]] }); }
    });
    while (d < 2) { cola.push({ tipo: decos[d], h: ALTO_DECO[decos[d++]] }); }       // siempre sale el avatar
    cola.forEach(function (it) {
      if (it.tipo === 'sel') { it.h = cartaSel(c, it, 0, 0, CW, false); }
      poner(cols.slice().sort(function (a, b) { return a.y - b.y; })[0], it);
    });
    var H = Math.max(1350, Math.max.apply(null, cols.map(function (k) { return k.y; })) - G + M);
    var rellenos = ['parado', 'lema', 'cabeza', 'festejo', 'logo', 'brazos'], r = 0;
    cols.forEach(function (col) {
      while (H - col.y > 140) {
        var t = rellenos[r++ % rellenos.length];
        poner(col, { tipo: t, h: Math.max(ALTO_DECO[t], H - col.y + 90) });
      }
    });
    return { W: W, H: H, items: items };
  }
  function pintarReporte(c, A, R, plan) {
    c.fillStyle = '#eef2f7'; c.fillRect(0, 0, plan.W, plan.H);
    plan.items.forEach(function (it) {
      var fondo;
      if (it.tipo === 'sel' || it.tipo === 'festejo') {
        fondo = c.createLinearGradient(0, it.y, 0, it.y + it.h); fondo.addColorStop(0, REP.NOCHE); fondo.addColorStop(1, REP.MARINO);
      } else if (it.tipo === 'titulo') {
        fondo = c.createLinearGradient(it.x, it.y, it.x + it.w, it.y + it.h);
        fondo.addColorStop(0, REP.MARINO); fondo.addColorStop(0.55, REP.VERDE_OSC); fondo.addColorStop(1, REP.VERDE);
      } else if (it.tipo === 'lema') {
        fondo = c.createLinearGradient(it.x, it.y, it.x + it.w, it.y + it.h); fondo.addColorStop(0, REP.VERDE_OSC); fondo.addColorStop(1, REP.MARINO);
      } else {
        fondo = { cabeza: REP.VERDE, brazos: REP.AZUL }[it.tipo] || '#ffffff';
      }
      c.save();
      c.shadowColor = 'rgba(14, 40, 72, .20)'; c.shadowBlur = 26; c.shadowOffsetY = 10;
      c.fillStyle = fondo; redondo(c, it.x, it.y, it.w, it.h, 24); c.fill();
      c.restore();
      c.save();
      redondo(c, it.x, it.y, it.w, it.h, 24); c.clip();
      if (it.tipo === 'sel') { cartaSel(c, it, it.x, it.y, it.w, true); }
      else if (it.tipo === 'titulo') { cartaTitulo(c, it, R); }
      else if (it.tipo === 'record') { cartaRecord(c, it, R.n); }
      else { cartaDeco(c, A, it, Math.max(it.y, 0), Math.min(it.y + it.h, plan.H)); }
      c.restore();
    });
  }
  function dibujarReporte(R) {
    var turno = ++repTurno;
    repBlob = null;
    recursosRep().then(function (A) {
      var l = document.createElement('canvas');
      l.width = 1080; l.height = 16;
      var plan = planReporte(l.getContext('2d'), R);
      l.height = plan.H;
      pintarReporte(l.getContext('2d'), A, R, plan);
      return new Promise(function (ok) { l.toBlob(ok, 'image/png'); });
    }).then(function (b) {
      if (turno !== repTurno || !b) { return; }
      repBlob = b;
      if (repUrl) { URL.revokeObjectURL(repUrl); }
      repUrl = URL.createObjectURL(b);
      repNombre = 'reporte-green-zone-' + R.desde + '-al-' + R.hasta + '.png';
      var img = $('#rep-img');
      if (img) { img.src = repUrl; img.closest('.gz-vista').classList.remove('preparando'); }
    });
  }
  function descargarUrl(url, nombre) {
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function compartirRep() {
    if (!repBlob) { avisar('⏳ El reporte se está preparando: vuelve a tocar en un segundo.'); return; }
    var archivo = null;
    try { archivo = new File([repBlob], repNombre, { type: 'image/png' }); } catch (e) { archivo = null; }
    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      navigator.share({ files: [archivo] }).catch(function (e) {
        if (e && e.name !== 'AbortError') { descargarUrl(repUrl, repNombre); avisar('📥 Se descargó el reporte.'); }
      });
      return;
    }
    descargarUrl(repUrl, repNombre);
    avisar('📥 Reporte descargado: súbelo a tus redes.');
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
    seleccionadores: vSeleccionadores, green: vGreen, historial: vHistorial, reporte: vReporte, liga: vIrALiga };
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
    else if (a.indexOf('gz-') === 0) { accionGZ(a, t); }
  });
  function accionGZ(a, t) {
    var x, c;
    if (a === 'gz-alternar') { alternarGZ(t.getAttribute('data-id')); }
    else if (a === 'gz-propia') { agregarPropiaGZ(); }
    else if (a === 'gz-guardar') { guardarSelGZ(t); }
    else if (a === 'gz-hs-resultado') { accionHist(t, 'resultado'); }
    else if (a === 'gz-hs-borrar') { accionHist(t, 'quitar'); }
    else if (a === 'gz-rep-compartir') { compartirRep(); }
    else if (a === 'gz-rep-descargar') {
      if (repBlob) { descargarUrl(repUrl, repNombre); } else { avisar('⏳ El reporte se está preparando: vuelve a tocar en un segundo.'); }
    }
    else if (a === 'gz-quitar') { x = pataDe(t); if (x) { alternarGZ(x.id); } }
    else if (a === 'gz-dia') {
      GZ.dia = t.getAttribute('data-dia');
      guardarGZ();
      if ($('#gz-lista')) { $('#gz-lista').innerHTML = listaGZ(); }
    }
    else if (a === 'gz-signo' || a === 'gz-signo-total') {
      x = a === 'gz-signo' ? pataDe(t) : GZ.total;
      x.signo = x.signo === '+' ? '-' : '+';
      t.textContent = x.signo === '+' ? '+' : '−';
      guardarGZ(); salidasGZ(); renderGZ();
    }
    else if (a === 'gz-tipo') { GZ.tipo = t.getAttribute('data-tipo'); GZ.total = null; guardarGZ(); pintarPanelGZ(); }
    else if (a === 'gz-total-editar' || a === 'gz-total-auto') {
      c = calcularGZ();
      var m = c.calculado ? americano(c.calculado) : '';
      GZ.total = a === 'gz-total-auto' ? null : { signo: m.charAt(0) === '+' ? '+' : '-', valor: m.replace(/^[+-]/, '') };
      guardarGZ(); pintarPanelGZ();
      if (GZ.total && $('[data-gz="total"]')) { $('[data-gz="total"]').focus(); $('[data-gz="total"]').select(); }
    }
    else if (a === 'gz-nivel') {
      GZ.nivel = t.getAttribute('data-nivel');
      $$('.gz-niveles button').forEach(function (b) { b.setAttribute('aria-pressed', b === t); });
      guardarGZ(); renderGZ();
    }
    else if (a === 'gz-compartir') { compartirGZ(); }
    else if (a === 'gz-descargar') { if (!gzBlob || !descargarGZ()) { avisar('⏳ La imagen se está preparando: vuelve a tocar en un segundo.'); } }
    else if (a === 'gz-copiar') {
      if (!textoGZ()) { avisar('Todavía no hay justificación ni probabilidad que copiar.'); return; }
      copiarTexto(textoGZ()).then(function () { avisar('📋 Texto copiado: pégalo en el grupo.'); },
        function () { avisar('⚠️ No se pudo copiar el texto en este navegador.'); });
    }
    else if (a === 'gz-limpiar') {
      GZ.patas = []; GZ.total = null; guardarGZ();
      $$('.gz-item').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      pintarPanelGZ();
    }
  }
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'rep-form') { return; }
    e.preventDefault();
    location.hash = '#/reporte?desde=' + e.target.desde.value + '&hasta=' + e.target.hasta.value;
  });
  document.addEventListener('input', function (e) {
    var t = e.target, gm = t.getAttribute && t.getAttribute('data-gm');
    if (gm) {
      var x0 = pataDe(t), q = x0.pick;
      if (gm === 'prob') {
        var n = parseFloat(String(t.value).replace(',', '.').replace('%', ''));
        q.pTxt = t.value; q.p = n > 0 && n < 100 ? n / 100 : null;
      } else { q[gm] = t.value; }
      if (gm === 'pais') { q.bandera = banderaDe(t.value); }
      if (gm === 'local' || gm === 'visitante') {
        q.partido = [q.local, q.visitante].map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(' vs ');
      }
      if (gm === 'deporte') {
        var sub = $('[data-gz-out="propia-sub"]', t.closest('.gz-pata'));
        if (sub) { sub.textContent = deporteDe(q)[0] + ' ' + deporteDe(q)[1]; }
      }
      guardarGZ(); salidasGZ(); renderGZ();
      return;
    }
    var k = t.getAttribute && t.getAttribute('data-gz');
    if (!k) { return; }
    var v = t.value, m = /^\s*([+\-−–])/.exec(v), signo = null;
    if ((k === 'momio' || k === 'total') && m) {             // escribieron el signo: pasa al boton
      signo = m[1] === '+' ? '+' : '-';
      v = v.replace(/^\s*[+\-−–]\s*/, '');
      t.value = v;
      var b = t.parentNode.querySelector('.gz-signo');
      if (b) { b.textContent = signo === '+' ? '+' : '−'; }
    }
    if (k === 'momio') { var x = pataDe(t); x.momio = v; if (signo) { x.signo = signo; } }
    else if (k === 'total') { GZ.total = { signo: signo || GZ.total.signo, valor: v }; }
    else if (k === 'apuesta') {
      GZ.apuesta = v;
      $$('[data-gz="apuesta-pata"]').forEach(function (i) { i.placeholder = v || '500'; });
    }
    else if (k === 'apuesta-pata') { pataDe(t).apuesta = v; }
    guardarGZ(); salidasGZ(); renderGZ();
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
