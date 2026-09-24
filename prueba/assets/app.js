/* Picksin — pagina de una sola pantalla con cuatro secciones, todas archivadas por semana
   (jueves a miercoles, hora del centro de Mexico):

     #/analisis[/<jueves>[/<liga>-j<N>]]     analisis de cada liga para su jornada
     #/auditoria[/<jueves>[/<liga>-j<N>]]    auditoria de cada liga, pick por pick
     #/escogidos[/<jueves>][?vista=&liga=]   picks escogidos de la semana, por dia o por liga
     #/resultados[/<jueves>]                 auditoria de los picks escogidos

   Todo sale de data/*.json, que genera publicar_sitio.py: aqui no se calcula ninguna
   probabilidad. Lo unico que se cuenta en la pagina es el marcador de los picks escogidos,
   porque la seleccion se hace aqui mismo: en modo editor, cada pick escogido se guarda en
   data/escogidos/<jueves>.json por la API de GitHub, con un token que vive solo en el
   navegador del editor. */
(function () {
  'use strict';

  var CONFIG = {
    dueno: 'javiermirelesreyna', repo: 'picksin2026', rama: 'main',
    correo: '308507395+javiermirelesreyna@users.noreply.github.com',
    local: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  };
  CONFIG.api = CONFIG.local ? location.origin + '/api' : 'https://api.github.com';
  /* carpeta de esta copia dentro del repositorio ('' la pagina real, 'prueba/' la de prueba) */
  CONFIG.carpeta = document.documentElement.getAttribute('data-carpeta') || '';

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
    resultados: ['🏅', 'Auditoría de picks escogidos', 'Cómo le fue a la selección de cada semana.']
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

  /* ================================================================== picks escogidos */
  var Esc = { datos: {}, cargas: {} };
  function normalizar(d, sem) {
    d = d || {};
    return { semana: sem, actualizado: d.actualizado || null, picks: (d.picks || []).slice() };
  }
  Esc.cargar = function (sem) {
    if (!sem) { return Promise.resolve(normalizar(null, sem)); }
    if (Esc.datos[sem]) { return Promise.resolve(Esc.datos[sem]); }
    if (!Esc.cargas[sem]) {
      var estatico = function () { return cargar('data/escogidos/' + sem + '.json', true); };
      var p = Editor.activo
        ? leerRemoto(sem).then(function (r) { return r.datos; }, estatico)
        : estatico();
      Esc.cargas[sem] = p.then(function (d) {
        if (!Esc.datos[sem]) {
          Esc.datos[sem] = normalizar(d, sem);
          (cola[sem] || []).forEach(function (op) { aplicarOp(Esc.datos[sem], op); });
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
  function aplicarOp(datos, op) {
    datos.picks = datos.picks.filter(function (p) { return p.id !== op.pick.id; });
    if (op.tipo === 'agregar') { datos.picks.push(op.pick); }
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
  var Editor = { token: ls('picksin.token') || '', estado: 'ok', mensaje: '' };
  Editor.activo = !!Editor.token;
  var cola = {}, reloj = {}, enCurso = {}, ultimo = {};

  function api(metodo, ruta, cuerpo) {
    var h = { 'Authorization': 'Bearer ' + Editor.token, 'Accept': 'application/vnd.github+json' };
    if (cuerpo) { h['Content-Type'] = 'application/json'; }
    return fetch(CONFIG.api + '/repos/' + CONFIG.dueno + '/' + CONFIG.repo + ruta,
      { method: metodo, headers: h, cache: 'no-store', body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  }
  function aB64(texto) {
    var b = new TextEncoder().encode(texto), s = '';
    for (var i = 0; i < b.length; i++) { s += String.fromCharCode(b[i]); }
    return btoa(s);
  }
  function deB64(b64) {
    var s = atob(String(b64).replace(/\s/g, '')), b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) { b[i] = s.charCodeAt(i); }
    return new TextDecoder().decode(b);
  }
  var rutaEsc = function (sem) { return CONFIG.carpeta + 'data/escogidos/' + sem + '.json'; };
  function errorToken() {
    return new Error('el token no puede escribir en ' + CONFIG.repo + ' (¿caducó o le falta «Contents: Read and write»?)');
  }
  function leerRemoto(sem) {
    /* `t` evita que GitHub devuelva la version en cache de hace unos segundos */
    return api('GET', '/contents/' + rutaEsc(sem) + '?ref=' + CONFIG.rama + '&t=' + Date.now()).then(function (r) {
      if (r.status === 404) { return { sha: null, datos: normalizar(null, sem) }; }
      if (r.status === 401 || r.status === 403) { throw errorToken(); }
      if (!r.ok) { throw new Error('GitHub respondió ' + r.status); }
      return r.json().then(function (j) { return { sha: j.sha, datos: normalizar(JSON.parse(deB64(j.content)), sem) }; });
    });
  }
  function mensajeCommit(ops, sem) {
    if (ops.length === 1) {
      var p = ops[0].pick;
      return (ops[0].tipo === 'agregar' ? 'Escoge: ' : 'Quita: ') + p.mercado + ' (' + p.partido + ', ' +
        p.nombre + ' J' + p.jornada + ')';
    }
    return 'Picks escogidos de la semana ' + sem + ': ' + ops.length + ' cambios';
  }
  function encolar(sem, op) {
    (cola[sem] = cola[sem] || []).push(op);
    clearTimeout(reloj[sem]);
    reloj[sem] = setTimeout(function () { guardar(sem); }, 900);
    pintarEditor('guardando');
  }
  function guardar(sem, intento) {
    if (enCurso[sem]) { clearTimeout(reloj[sem]); reloj[sem] = setTimeout(function () { guardar(sem); }, 600); return; }
    var ops = cola[sem] || [];
    if (!ops.length) { return; }
    cola[sem] = [];
    enCurso[sem] = true;
    intento = intento || 1;
    /* lo ultimo que este navegador guardo evita releer; si otro dispositivo guardo despues, GitHub responde 409 */
    (ultimo[sem] ? Promise.resolve(JSON.parse(JSON.stringify(ultimo[sem]))) : leerRemoto(sem)).then(function (rem) {
      var datos = rem.datos;
      ops.forEach(function (op) { aplicarOp(datos, op); });
      datos.actualizado = new Date().toISOString();
      return api('PUT', '/contents/' + rutaEsc(sem), {
        message: mensajeCommit(ops, sem), content: aB64(JSON.stringify(datos, null, 1) + '\n'),
        sha: rem.sha || undefined, branch: CONFIG.rama,
        committer: { name: CONFIG.dueno, email: CONFIG.correo }, author: { name: CONFIG.dueno, email: CONFIG.correo }
      }).then(function (r) {
        enCurso[sem] = false;
        if ((r.status === 409 || r.status === 422) && intento < 4) {       // otro dispositivo guardo antes
          delete ultimo[sem];
          cola[sem] = ops.concat(cola[sem] || []);
          reloj[sem] = setTimeout(function () { guardar(sem, intento + 1); }, 800 * intento);
          return;
        }
        if (r.status === 401 || r.status === 403) { throw errorToken(); }
        if (!r.ok) { throw new Error('GitHub respondió ' + r.status); }
        return r.json().then(function (j) {
          ultimo[sem] = { sha: j.content && j.content.sha, datos: JSON.parse(JSON.stringify(datos)) };
          if (!ultimo[sem].sha) { delete ultimo[sem]; }
        }, function () { delete ultimo[sem]; }).then(function () {
          (cola[sem] || []).forEach(function (op) { aplicarOp(datos, op); });
          Esc.datos[sem] = datos;
          delete memo['data/escogidos/' + sem + '.json'];
          if ((cola[sem] || []).length) { guardar(sem); } else if (!pendiente()) { pintarEditor('ok'); }
        });
      });
    }).catch(function (e) {
      enCurso[sem] = false;
      delete ultimo[sem];
      cola[sem] = ops.concat(cola[sem] || []);
      pintarEditor('error', e.message);
    });
  }
  function pendiente() {
    for (var s in cola) { if ((cola[s] || []).length || enCurso[s]) { return true; } }
    return false;
  }
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
    b.innerHTML = '<span class="etiqueta-editor">✏️ Modo editor</span>' + e +
      '<button type="button" data-accion="editor-salir">Salir</button>';
    b.hidden = false;
  }
  function abrirDialogo() {
    var d = $('#dlg-editor');
    $('#dlg-error').hidden = true;
    $('#token').value = '';
    $('#token').placeholder = CONFIG.local ? 'vista previa: prueba' : 'github_pat_…';
    if (d.showModal) { d.showModal(); } else { d.setAttribute('open', ''); }
    setTimeout(function () { $('#token').focus(); }, 30);
  }
  function cerrarDialogo() { var d = $('#dlg-editor'); if (d.close) { d.close(); } else { d.removeAttribute('open'); } }
  function entrar(token) {
    Editor.token = token;
    return api('GET', '').then(function (r) {
      if (r.status === 401) { throw new Error('GitHub no reconoce ese token.'); }
      if (r.status === 403 || r.status === 404) { throw new Error('Ese token no tiene acceso al repositorio ' + CONFIG.repo + '.'); }
      if (!r.ok) { throw new Error('GitHub respondió ' + r.status + '.'); }
      return r.json();
    }).then(function (j) {
      if (j.permissions && j.permissions.push === false) { throw new Error('Ese token solo puede leer: necesita «Contents: Read and write».'); }
      ls('picksin.token', token);
      Editor.activo = true;
      Esc.reiniciar();
    }, function (e) {
      Editor.token = '';
      throw e.message ? e : new Error('No se pudo conectar con GitHub.');
    });
  }
  function salir() {
    if (pendiente() && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) { return; }
    ls('picksin.token', null);
    Editor.token = ''; Editor.activo = false; cola = {}; enCurso = {}; ultimo = {};
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
    ['partido', 'mercado', 'fecha', 'dia', 'hora', 'ts', 'p', 'cuota', 'confianza', 'respaldo', 'familia', 'aviso',
      'liga_joven'].forEach(function (k) { if (p[k] != null && p[k] !== '') { reg[k] = p[k]; } });
    reg.escogido = new Date().toISOString();
    return reg;
  }
  function alternar(pid) {
    var r = REG[pid];
    if (!r || !Editor.activo) { return; }
    if (cerrado(r.pick, r.o.auditada)) { avisar('🔒 Ese partido ya empezó: el pick ya no se puede cambiar.'); return; }
    var ya = Esc.buscar(pid);
    if (ya) {
      aplicarOp(Esc.datos[ya.sem], { tipo: 'quitar', pick: ya.pick });
      encolar(ya.sem, { tipo: 'quitar', pick: ya.pick });
      avisar('Quitado de los picks escogidos.');
      refrescarSeleccion();
      return;
    }
    var reg = registro(pid, r), sem = r.pick.sem || (reg.fecha ? semanaDe(reg.fecha) : r.o.doc.semana);
    Esc.cargar(sem).then(function (datos) {
      aplicarOp(datos, { tipo: 'agregar', pick: reg });
      encolar(sem, { tipo: 'agregar', pick: reg });
      avisar('✅ Escogido para el ' + (reg.fecha ? fLarga(reg.fecha).toLowerCase() : 'día por confirmar'),
        '#/escogidos/' + sem + '?liga=' + encodeURIComponent(reg.liga), 'Ver escogidos');
      refrescarSeleccion();
    });
  }
  /* sin repintar la pagina: se marcan las tarjetas y se rehace el bloque de la liga */
  function refrescarSeleccion() {
    var seccion = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || '';
    if (seccion === 'escogidos' || seccion === 'resultados') { router(true); return; }
    $$('[data-pid]').forEach(function (el) {
      if (el.tagName === 'BUTTON') { return; }
      var pid = el.getAttribute('data-pid'), r = REG[pid];
      el.classList.toggle('es-escogido', !!Esc.buscar(pid));
      var b = el.querySelector('button[data-pid], .btn-escoger, .btn-mini');
      if (b && r) { b.outerHTML = botonEscoger(pid, r.pick, r.o, el.tagName === 'LI'); }
    });
    var bloque = $('#s-escogidos');
    if (bloque && bloque.getAttribute('data-archivo')) {
      var d = REG.__doc;
      if (d) { bloque.innerHTML = bloqueEscogidosLiga(d); }
    }
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
    var sel = !!Esc.buscar(pid), bloq = cerrado(p, o.auditada);
    if (bloq) {
      var t = bloq === 'auditada' ? 'Jornada ya auditada' : 'El partido ya empezó';
      return compacto ? '<button type="button" class="btn-mini" disabled title="' + t + '">🔒</button>'
        : '<button type="button" class="btn-escoger" disabled>🔒 ' + t + '</button>';
    }
    var a = ' data-accion="escoger" data-pid="' + esc(pid) + '" aria-pressed="' + sel + '"';
    return compacto
      ? '<button type="button" class="btn-mini"' + a + ' aria-label="' + (sel ? 'Quitar de' : 'Añadir a') + ' picks escogidos">' + (sel ? '✓' : '＋') + '</button>'
      : '<button type="button" class="btn-escoger"' + a + '>' + (sel ? '✓ Escogido · tocar para quitar' : '＋ Escoger este pick') + '</button>';
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
      '<span class="sello">✅ Escogido</span></div>';
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
      '<span class="fila-fin"><span class="sello">✅</span><span class="pp">' + pct(p.p) + '</span>' + botonEscoger(pid, p, o, true) + '</span>' +
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
        semR ? marcadorEscogidos(semR) : null]).then(function (x) {
        var wA = x[0], wR = x[1], E = x[2], mR = x[3];
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
            mR && (mR.ok + mR.ko) ? mR.ok + ' de ' + (mR.ok + mR.ko) + ' acertados' : 'Sin resultados todavía', 'verde']
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
            ['✅', 'Escogido', 'pick seleccionado para la semana; su resultado se audita en «Auditoría de picks escogidos».']
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
            return '<li class="fila r-' + esc(p[3]) + '"><span class="m">' + esc(p[1]) + '</span><span class="pp">' + pct(p[2]) + '</span>' +
              '<span class="pt">' + esc(p[0]) + '</span><span class="det">' + (ESTADO[p[3]] || ESTADO.no_comprobable).t +
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
      var vista = q.get('vista') === 'liga' ? 'liga' : 'dia', filtro = q.get('liga') || '';
      return Esc.cargar(sem).then(function (E) {
        return cargarResultados(E.picks).then(function (mapas) {
          var todos = E.picks.slice().sort(ordenPicks);
          var picks = filtro ? todos.filter(function (p) { return p.liga === filtro; }) : todos;
          var qs = function (v, l) { var a = []; if (v === 'liga') { a.push('vista=liga'); } if (l) { a.push('liga=' + encodeURIComponent(l)); } return a.length ? '?' + a.join('&') : ''; };
          var h = cabecera('escogidos') + selectorSemana(idx, sem, 'escogidos', vista === 'liga' ? '?vista=liga' : '');
          var ligasSem = unicos(todos.map(function (p) { return p.liga; }));
          var info = {};
          todos.forEach(function (p) { info[p.liga] = p; });
          if (todos.length) {
            h += '<div class="herramientas"><p class="sub">✅ <b>' + picks.length + '</b> ' + (picks.length === 1 ? 'pick escogido' : 'picks escogidos') +
              (filtro && info[filtro] ? ' de ' + bandera(info[filtro].bandera) + ' ' + esc(info[filtro].nombre) : '') +
              ' · ' + plural(unicos(picks.map(function (p) { return p.liga; })).length, 'liga', 'ligas') + ' · ' +
              plural(unicos(picks.map(function (p) { return p.fecha; })).length, 'día', 'días') + '</p>' +
              '<div class="conmutador" role="group" aria-label="Ordenar">' +
              '<a href="#/escogidos/' + sem + qs('dia', filtro) + '" aria-current="' + (vista === 'dia') + '">🗓️ Por día</a>' +
              '<a href="#/escogidos/' + sem + qs('liga', filtro) + '" aria-current="' + (vista === 'liga') + '">⚽ Por liga</a></div></div>';
          }
          if (ligasSem.length > 1 || filtro) {
            h += '<nav class="filtros" aria-label="Filtrar por liga"><a href="#/escogidos/' + sem + qs(vista, '') + '" aria-current="' + !filtro + '">Todas</a>' +
              ligasSem.map(function (l) {
                var n = todos.filter(function (p) { return p.liga === l; }).length;
                return '<a href="#/escogidos/' + sem + qs(vista, l) + '" aria-current="' + (filtro === l) + '">' + bandera(info[l].bandera) + ' ' +
                  esc(info[l].nombre) + ' <b>' + n + '</b></a>';
              }).join('') + '</nav>';
          }
          if (Editor.activo) {
            h += '<p class="nota verde">✏️ Para añadir picks entra a <a href="#/analisis/' + sem + '">📊 Análisis</a> y toca <b>＋ Escoger</b>. ' +
              'Aquí puedes quitarlos mientras su partido no haya empezado.</p>';
          }
          if (!picks.length) {
            h += vacio('📭', filtro ? 'No hay picks escogidos de esta liga en la semana.' : 'Todavía no hay picks escogidos en esta semana.');
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
  function contar(picks, mapas) {
    var n = { ok: 0, ko: 0, nulo: 0, pend: 0, suma: 0 };
    picks.forEach(function (p) {
      var r = resultadoDe(p, mapas), e = r ? r[0] : 'pendiente';
      if (e === 'acierto') { n.ok++; n.suma += p.p || 0; } else if (e === 'fallo') { n.ko++; n.suma += p.p || 0; } else if (e === 'pendiente') { n.pend++; } else { n.nulo++; }
    });
    n.comp = n.ok + n.ko;
    n.acierto = n.comp ? n.ok / n.comp : null;
    n.prometido = n.comp ? n.suma / n.comp : null;
    return n;
  }
  function marcadorEscogidos(sem) {
    return Esc.cargar(sem).then(function (E) { return cargarResultados(E.picks).then(function (m) { return contar(E.picks, m); }); });
  }
  function vResultados(partes) {
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'resultados') || semanaDefecto(idx, 'analisis');
      if (!sem) { return pintar(cabecera('resultados') + vacio('🏅', 'Todavía no hay semanas publicadas.'), 'Resultados'); }
      return Esc.cargar(sem).then(function (E) {
        return cargarResultados(E.picks).then(function (mapas) {
          var picks = E.picks.slice().sort(ordenPicks), n = contar(picks, mapas);
          var h = cabecera('resultados') + selectorSemana(idx, sem, 'resultados');
          if (!picks.length) {
            h += vacio('📭', 'No hubo picks escogidos en esta semana.');
          } else {
            h += marcadorCajas([['✅ Acertados', n.ok + ' de ' + n.comp, 'verde'], ['🎯 Acierto real', pct(n.acierto), 'verde'],
              ['📈 Prometido (media)', pct(n.prometido), 'azul'], ['⏳ Por jugarse', n.pend, n.pend ? 'azul' : '']]) +
              tira(n) + '<p class="leyenda"><span>✅ ' + plural(n.ok, 'acertado', 'acertados') + '</span><span>❌ ' +
              plural(n.ko, 'fallado', 'fallados') + '</span><span>➖ ' + plural(n.nulo, 'anulado o no comprobable', 'anulados o no comprobables') +
              '</span><span>⏳ ' + n.pend + ' por jugarse</span></p>';
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
    });
  }
  function pintarHistorial(caja) {
    return indice().then(function (idx) {
      var sems = (idx.semanas || []).map(function (s) { return s.id; });
      return Promise.all(sems.map(function (s) {
        return Esc.cargar(s).then(function (E) { return cargarResultados(E.picks).then(function (m) { return { s: s, n: contar(E.picks, m), total: E.picks.length }; }); });
      })).then(function (filas) {
        filas = filas.filter(function (f) { return f.total; });
        if (!filas.length) { caja.innerHTML = '<p class="criterio">Todavía no hay semanas con picks escogidos.</p>'; return; }
        var t = { ok: 0, ko: 0, nulo: 0, pend: 0, total: 0, suma: 0 };
        filas.forEach(function (f) { t.ok += f.n.ok; t.ko += f.n.ko; t.nulo += f.n.nulo; t.pend += f.n.pend; t.total += f.total; t.suma += f.n.suma; });
        var comp = t.ok + t.ko;
        caja.innerHTML = '<div class="tabla-scroll"><table><thead><tr><th>Semana</th><th class="num">Escogidos</th><th class="num">✅</th><th class="num">❌</th><th class="num">➖</th>' +
          '<th class="num">⏳</th><th class="num">Acierto</th><th class="num">Prometido</th></tr></thead><tbody>' +
          filas.map(function (f) {
            return '<tr><td><a href="#/resultados/' + f.s + '">' + rangoSemana(f.s) + '</a></td><td class="num">' + f.total + '</td><td class="num">' + f.n.ok +
              '</td><td class="num">' + f.n.ko + '</td><td class="num">' + f.n.nulo + '</td><td class="num">' + f.n.pend + '</td><td class="num"><b>' + pct(f.n.acierto) + '</b></td><td class="num">' +
              pct(f.n.prometido) + '</td></tr>';
          }).join('') + '<tr class="total"><td>Total</td><td class="num">' + t.total + '</td><td class="num">' + t.ok + '</td><td class="num">' + t.ko +
          '</td><td class="num">' + t.nulo + '</td><td class="num">' + t.pend + '</td><td class="num">' + pct(comp ? t.ok / comp : null) + '</td><td class="num">' +
          pct(comp ? t.suma / comp : null) + '</td></tr></tbody></table></div>';
      });
    }).catch(function (e) { caja.innerHTML = '<p class="error">' + esc(e.message) + '</p>'; });
  }

  /* enlaces viejos liga.html?l=<id> -> ultimo analisis de esa liga */
  function vIrALiga(partes) {
    return indice().then(function (idx) {
      var L = idx.ligas.filter(function (x) { return x.id === partes[0]; })[0];
      location.replace(L && L.ultima ? '#/analisis/' + L.ultima.semana + '/' + L.ultima.archivo : '#/analisis');
    });
  }

  /* ================================================================== navegacion */
  var VISTAS = { '': vInicio, analisis: vAnalisis, auditoria: vAuditoria, escogidos: vEscogidos, resultados: vResultados, liga: vIrALiga };
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
    else if (a === 'reintentar') { Object.keys(cola).forEach(function (s) { guardar(s); }); pintarEditor('guardando'); }
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
    var t = $('#token').value.trim(), b = $('#dlg-entrar'), err = $('#dlg-error');
    if (!t) { return; }
    b.disabled = true; b.textContent = 'Comprobando…'; err.hidden = true;
    entrar(t).then(function () {
      cerrarDialogo();
      pintarEditor('ok');
      avisar('✏️ Modo editor activo: toca ＋ Escoger en cualquier pick.');
      router(true);
    }).catch(function (x) {
      err.textContent = x.message; err.hidden = false;
    }).then(function () { b.disabled = false; b.textContent = 'Entrar'; });
  });

  window.addEventListener('hashchange', function () { router(); });
  pintarEditor('ok');
  router();
})();
