/* Picksin — pagina de una sola pantalla organizada POR DIA (rediseno del 01/10/2026, pedido de
   Javier: "que sea como un sistema de picks, que no se me escape ninguna seleccion"). Hora del
   centro de Mexico.

     #/  (o #/inicio)                           INICIO: la pagina siempre abre aqui (ver abajo)
     #/hoy[?dia=AAAA-MM-DD&f=&orden=]            HOY: pendientes, escogidos y TODOS los picks de hoy,
                                                 manana y pasado manana (todas las ligas y deportes)
     #/analisis[/<jueves>[/<liga>-j<N>]]        analisis de cada liga (semana del CICLO de cada deporte:
     #/auditoria[/<jueves>[/<liga>-j<N>]]       futbol jueves a miercoles); la auditoria va dentro
     #/escogidos[?vista=&liga=&por=]            picks escogidos de HOY EN ADELANTE, por dia o por liga
     #/green[?dia=AAAA-MM-DD]                   seleccion del dia para Green Zone, solo ARMAR (modo editor):
                                                 se guarda antes de compartir
     #/resultados[/<lunes>]                     RESULTADOS, con pestanas: la semana (LUNES A DOMINGO),
     #/ranking                                  el ranking de seleccionadores y, en modo editor, el
     #/historial                                historial de la seleccion del dia (2 anos, avisos de
     #/reporte?desde=&hasta= | ?mes=AAAA-MM      "por marcar") y sus reportes
     #/inicio                                   INICIO (el logo): el lema, el trabajo en numeros, como
                                                 esta ordenada la pagina y como leer un pick
   Cada vez que alguien entra a la pagina o toca el logo se ve la entrada animada (5 s de animacion
   y 5 s quieta para leerla).

   Los ciclos (ingesta, analisis y auditoria) siguen siendo de cada deporte; los reportes van de
   lunes a domingo y todo lo demas por dia, asi que ningun pick depende del ciclo para encontrarse.
   Los escogidos se siguen guardando en data/escogidos/<jueves>.json (el jueves de la semana de su
   partido): la pagina calcula que archivos cubren los dias que muestra.

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
  /* semanas de los reportes: lunes a domingo */
  function lunesDe(s) { return masDias(s, -((fecha(s).getUTCDay() + 6) % 7)); }
  function etiquetaLunes(s) {
    var a = lunesDe(hoy());
    return s === a ? 'esta semana' : s === masDias(a, -7) ? 'pasada' : s === masDias(a, 7) ? 'próxima' : '';
  }
  /* cuando empieza algo con fecha y hora del centro de Mexico (sin hora: al final del dia) */
  function tsDe(f, h) {
    if (!f) { return null; }
    var p = f.split('-'), m = /^(\d{1,2}):(\d{2})/.exec(h || '');
    return Date.UTC(+p[0], +p[1] - 1, +p[2], m ? +m[1] + 6 : 29, m ? +m[2] : 59);
  }
  function etqDia(f) {
    var h0 = hoy();
    return f === h0 ? 'hoy' : f === masDias(h0, 1) ? 'mañana' : f === masDias(h0, -1) ? 'ayer' : '';
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
  /* el top de tops de cada dia: solo QUE picks y en que orden (lo calcula publicar_sitio.py) */
  var topDeTops = function () { return cargar('data/top_de_tops.json', true); };
  /* las listas Seguros y Valor (Javier, 19-20/10/2026, solo modo editor): QUE picks y en que orden, con su
     combinada; las calcula publicar_sitio.py (listas_valor.py) */
  var listasValor = function () { return cargar('data/listas_valor.json', true); };
  var LISTAS = { seguros: { e: '🛡️', t: 'Seguros' }, valor: { e: '💎', t: 'Valor' } };

  function semanaDefecto(idx, tipo) {
    var campo = (tipo === 'auditoria' || tipo === 'resultados') ? 'auditadas' : 'analisis';
    var s = (idx.semanas || []).filter(function (x) { return x[campo] > 0; })[0];
    return s ? s.id : null;
  }

  /* ================================================================== emojis */
  var SECC = {
    analisis: ['📊', 'Análisis por liga', 'La próxima jornada de cada liga: TOP 5, sugeridos, mercados y partidos.'],
    auditoria: ['🔍', 'Auditoría por liga', 'Cada jornada jugada, contrastada pick por pick con el resultado real.'],
    escogidos: ['✅', 'Picks escogidos', 'De hoy en adelante. Los de días pasados están en 🏅 Resultados.'],
    resultados: ['🏅', 'Resultados', 'Cómo le fue a la selección cada semana, de lunes a domingo.'],
    ayuda: ['🧭', 'Cómo leer un pick', 'Qué significa cada dato y cómo está ordenada la página.'],
    seleccionadores: ['👥', 'Seleccionadores', 'Quién escogió cada pick y cuántas buenas y malas lleva cada uno.'],
    green: ['🟢', 'Selección del día', 'Arma la jugada para Green Zone con los picks escogidos: directa o parlay, con su momio, la apuesta y el nivel.']
  };
  var EMOJI_SECCION = {
    top_a_moneyline_btts: '🥅', top_b_ou_goles_remates_sot: '🎯', top_c_ou_tarjetas_corners_faltas: '📏',
    top_d_dominio: '💪', r8a_gol_1h: '⚡', r8b_tarjeta_1h: '🟨', r8c_carrera_3_corners_1h: '🏁',
    r9a_choque_disciplinario: '🟥', r9b_predominio_faltas: '🦵', r9c_supremacia_offsides: '🚩',
    r9d_carrera_5_corners: '🏎️', r9e_intensidad_compartida: '🔥', r9f_consistencia_goleadora: '🔁',
    r9g_mitad_mas_goles: '⏳', r9h_carrera_3_corners: '⛳',
    nhl_total: '🥅', nhl_local: '🏠', nhl_visita: '✈️',
    nfl_total: '🏈', nfl_total_local: '🏠', nfl_total_visita: '✈️', nfl_td_partido: '🙌', nfl_td_local: '🏠', nfl_td_visita: '✈️',
    nfl_td_carrera: '🏃', nfl_yardas_partido: '📏', nfl_yardas_local: '🏠', nfl_yardas_visita: '✈️', nfl_1m_total: '⏱️',
    nfl_1m_local: '🏠', nfl_1m_visita: '✈️', nfl_td_1m: '🙌', nfl_2m_total: '⏱️',
    nba_ganador: '🏆', nba_handicap: '⚖️', nba_total: '🏀', nba_total_local: '🏠', nba_total_visita: '✈️', nba_1m_ganador: '🏆',
    nba_1m_total: '⏱️', nba_1m_local: '🏠', nba_1m_visita: '✈️', nba_q1_total: '⏱️', nba_q1_local: '🏠', nba_q1_visita: '✈️',
    nba_2m_total: '⏱️'
  };
  var EMOJI_PERSONA = { a_el_muro: '🧱', b_la_disparidad: '⚖️', c_la_boveda: '🔐', d_el_espejismo: '🏜️', e_el_radar: '📡' };
  var EMOJI_METRICA = { remates: '🎯', sot: '🥅', corners: '⛳', tarjetas: '🟨', faltas: '🦵', offsides: '🚩' };
  var ESTADO = {
    acierto: { e: '✅', t: 'Acertado' }, fallo: { e: '❌', t: 'Fallado' }, anulado: { e: '➖', t: 'Anulado' },
    no_comprobable: { e: '❓', t: 'No comprobable' }, pendiente: { e: '⏳', t: 'Por jugarse' },
    por_auditar: { e: '🕓', t: 'Ya se jugó: falta la auditoría' }
  };
  function emojiOrigen(o) {
    if (!o) { return '📌'; }
    if (o === 'TOP 5') { return '🏆'; }
    for (var k in EMOJI_PERSONA) { if (k.slice(2).replace(/_/g, ' ') === o.toLowerCase().replace(/ó/g, 'o')) { return EMOJI_PERSONA[k]; } }
    return '📊';
  }
  var bandera = function (b) { return b ? '<span class="bandera" aria-hidden="true">' + esc(b) + '</span>' : ''; };
  /* otros deportes (desde el 01/10/2026, la NHL): cada DIA de partidos se publica como una jornada
     (archivo <liga>-<AAAA-MM-DD>, sin numero de jornada) para que salga en Hoy, Escogidos y
     Resultados igual que el futbol; su pestana los agrupa por el ciclo de su motor (martes a lunes) */
  var DEP_PREFIJO = { nhl: 'hockey', nba: 'basquetbol', nfl: 'americano' };       // escogidos de antes del 02/10 sin deporte
  function depDe(x) {
    if (x && x.deporte) { return x.deporte; }
    var m = /^([a-z0-9_]+)-\d{4}-\d{2}-\d{2}$/.exec((x && x.archivo) || '');
    return m ? (DEP_PREFIJO[m[1]] || 'otro') : 'futbol';
  }
  function esFutbol(x) { return depDe(x) === 'futbol'; }
  function emojiDe(x) { return (x && x.emoji) || ({ hockey: '🏒', basquetbol: '🏀', americano: '🏈' })[depDe(x)] || '⚽'; }
  function etqJornada(x) { return x.jornada != null ? 'J' + x.jornada : (x.fecha ? fCorta(x.fecha) : ''); }

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
  /* las semanas ya cerradas (sus partidos empezaron: nadie puede cambiarlas) se leen del archivo
     publicado; las abiertas, del intermediario, que siempre esta al dia */
  Esc.cargar = function (sem) {
    if (!sem) { return Promise.resolve(normalizar(null, sem)); }
    if (Esc.datos[sem]) { return Promise.resolve(Esc.datos[sem]); }
    if (!Esc.cargas[sem]) {
      var estatico = function () { return cargar('data/escogidos/' + sem + '.json', true); };
      var p = Editor.activo && masDias(sem, 7) >= hoy()
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
  /* los escogidos que se juegan entre dos dias, de los archivos semanales que cubren esos dias; los
     que no tienen fecha salen en los rangos que llegan a hoy, para que no se pierdan */
  /* Javier (10/10/2026): "deja en cero los contadores de resultados, empezaremos de nuevo"; y otra vez el
     29/10/2026 ("vuelve a poner el contador en cero... este fin empezare con los motores"), desde el viernes
     30/10. Resultados, ranking, el Inicio y el historial y los reportes de la Seleccion del dia cuentan desde
     este dia; lo de antes (escogidos desde el 2026-09-24, selecciones del dia) sigue guardado (en su analisis,
     su auditoria y data/green/) y vuelve a contar si se cambia esta fecha. */
  var CUENTAS_DESDE = '2026-10-30';
  /* los picks del top de tops que no estan en los rankings de su jornada se pueden escoger cuando el
     intermediario del editor (Cloudflare) ya los acepta: worker.js del 09/10/2026 */
  var TOP_ESCOGIBLE = true;                       // worker 4c6bfbe8 (09/10/2026) ya los acepta
  /* los picks de las listas Seguros y Valor que no estan en los rankings ni en el top (Javier, 20/10/2026:
     "haz tambien que se pueda escoger"): true cuando el Worker publicado ya acepte data/listas_valor.json */
  var LISTAS_ESCOGIBLE = true;                    // worker b2178e81 (20/10/2026) ya los acepta
  Esc.rango = function (desde, hasta) {
    return Promise.all(semanasEntre(desde, hasta).map(Esc.cargar)).then(function (ws) {
      var vistos = {};
      return [].concat.apply([], ws.map(function (w) { return w.picks; })).filter(function (p) {
        if (vistos[p.id]) { return false; }
        vistos[p.id] = true;
        return p.fecha ? p.fecha >= desde && p.fecha <= hasta : hasta >= hoy();
      }).sort(ordenPicks);
    });
  };
  /* todo lo escogido desde el principio, con el resultado de cada pick */
  function cargarTodo() {
    return Esc.rango(CUENTAS_DESDE, masDias(hoy(), 21)).then(function (picks) {
      picks = picks.filter(function (p) { return !p.fecha || p.fecha >= CUENTAS_DESDE; });
      return cargarResultados(picks).then(function (m) { return { picks: picks, mapas: m }; });
    });
  }
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

  /* el modo editor cabe en un renglon dentro de la barra: quien escoge y si ya se guardo todo
     (salir esta al pie de la pagina) */
  function pintarEditor(estado, mensaje) {
    if (estado) { Editor.estado = estado; Editor.mensaje = mensaje || ''; }
    var b = $('#editor-barra');
    document.body.classList.toggle('con-editor', Editor.activo);
    $('.enlace-editor').textContent = Editor.activo ? '🔓 Salir del modo editor' : '🔑 Modo editor';
    if (!Editor.activo) { b.hidden = true; b.innerHTML = ''; return; }
    var e = Editor.estado === 'guardando' ? '<span class="estado" title="Guardando">⏳</span>'
      : Editor.estado === 'error'
        ? '<button type="button" class="estado-error" data-accion="reintentar" title="' + esc('No se guardó: ' + Editor.mensaje) + '">⚠️ Reintentar</button>'
        : '<span class="estado estado-ok" title="Todo guardado">✓</span>';
    b.innerHTML = '<span class="etiqueta-editor" aria-hidden="true">✏️</span>' + persona(Editor.persona) + e;
    b.title = 'Modo editor: escoges como ' + Editor.persona;
    b.hidden = false;
    if (Editor.estado === 'error') { avisar('⚠️ No se guardó: ' + Editor.mensaje); }
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
    if (!esFutbol(d)) { reg.deporte = depDe(d); reg.emoji = d.emoji; }
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
        '#/escogidos', 'Ver escogidos');
      refrescarSeleccion();
    });
  }
  /* sin repintar la pagina: se marcan las tarjetas y se rehace el bloque de la liga */
  function refrescarSeleccion() {
    var seccion = (location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) || '';
    if (seccion === '' || seccion === 'hoy' || seccion === 'escogidos' || seccion === 'resultados') { router(true); return; }
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
  /* arbitro y avisos del partido (Javier, 12/10/2026): clasico y "algo en juego" en los picks de tarjetas y
     faltas (no cambian la probabilidad: el arbitro ya va dentro del motor) y la linea del partido */
  var RE_AVISO = /tarjeta|falta/i;
  function fichaDe(d, partido) {
    if (!d || !d.partidos) { return null; }
    if (!d._fichas) {
      d._fichas = {};
      d.partidos.forEach(function (f) { d._fichas[f.local + ' vs ' + f.visitante] = f; });
    }
    return d._fichas[partido] || null;
  }
  function chipsAviso(avisos, mercado) {
    if (!avisos || !avisos.length || !RE_AVISO.test(mercado || '')) { return ''; }
    var cl = avisos.filter(function (a) { return a.tipo === 'clasico'; });
    var ej = avisos.filter(function (a) { return a.tipo === 'en_juego'; });
    return (cl.length ? '<span class="chip alerta" title="' + esc(cl[0].texto) + ': en los clásicos suele haber más tarjetas y faltas">⚔️ ' +
      esc(cl[0].texto) + '</span>' : '') +
      (ej.length ? '<span class="chip alerta" title="' + esc(ej.map(function (a) { return a.texto; }).join(' · ')) + '">🔥 Algo en juego</span>' : '');
  }
  function lineaPartido(f) {
    if (!f || (!f.arbitro && !(f.avisos || []).length)) { return ''; }
    var partes = [];
    if (f.arbitro) {
      partes.push('<span>🧑‍⚖️ ' + esc(f.arbitro.nombre) + (f.arbitro.tarjetas != null ? ' · ' + num(f.arbitro.tarjetas, 1) +
        ' tarjetas por partido' : '') + (f.arbitro.perfil ? ' · <b>' + esc(f.arbitro.perfil) + '</b>' : '') + '</span>');
    }
    (f.avisos || []).forEach(function (a) { partes.push('<span>' + (a.tipo === 'clasico' ? '⚔️ ' : '🔥 ') + esc(a.texto) + '</span>'); });
    return '<p class="aviso-partido">' + partes.join('') + '</p>';
  }
  /* el momio de Playdoit de un pick (Javier, 11/10/2026): solo en modo editor, como en el top de tops */
  function chipMomio(p) {
    if (!Editor.activo || !p || !p.americano) { return ''; }
    return '<span class="chip momio" title="Momio de Playdoit">💲 ' + esc(p.americano) + '</span>' + chipComb(p) +
      (p.oportunidad ? '<span class="chip oportunidad" title="Playdoit lo paga como si fuera mucho menos probable de lo que da el motor">🔎 Oportunidad: revisa información</span>' : '');
  }
  /* la probabilidad combinada motor + Playdoit (20/10/2026): solo en modo editor y solo con momio */
  function chipComb(t) {
    return Editor.activo && t && t.pc != null ? '<span class="chip comb" title="Probabilidad combinada: la del motor mezclada con la de Playdoit sin su margen, con el peso que el motor se ha ganado en ese mercado">🤝 ' +
      pct(t.pc) + '</span>' : '';
  }
  function chipValor(t) {
    return Editor.activo && t && t.ve != null ? '<span class="chip valor" title="Lo que deja en promedio a 1 unidad si la combinada está en lo correcto">📈 Valor ' +
      (t.ve > 0 ? '+' : '') + pct(t.ve) + '</span>' : '';
  }
  function chipsPick(p, o) {
    var c = [chipConfianza(p.confianza), chipMomio(p)];
    if (p.cuota) { c.push('<span class="chip neutro">Cuota implícita ' + esc(num(p.cuota, 2)) + '</span>'); }
    if (p.respaldo) { c.push('<span class="chip neutro" title="Lo que hace cada equipo y lo que permite su rival">⚖️ Respaldo ' + esc(p.respaldo) + '</span>'); }
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
      '">' + emojiDe(d) + ' ' + esc(d.nombre) + ' · ' + esc(etqJornada(d)) + '</a></span>';
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
      (p.respaldo ? ' · ⚖️ ' + esc(p.respaldo) : '') + (chipMomio(p) ? ' ' + chipMomio(p) : '') + '</span>' +
      (res ? '<span class="det">' + (ESTADO[res[0]] || ESTADO.no_comprobable).t + (res[1] ? ': ' + esc(res[1]) : '') + '</span>' : '') +
      '</li>';
  }
  /* renglon compacto (Hoy, Escogidos, Resultados): el mercado, la probabilidad y el boton; abajo
     lo que haga falta (hora, liga, partido, de donde sale, quien lo escogio). o como en tarjeta +
     sub (html de abajo) y sinSello (cuando quien lo escogio ya va abajo) */
  function renglon(p, o) {
    var pid = registrar(p, o), sel = Esc.buscar(pid), res = o.resultado;
    return '<li class="fila renglon' + (sel ? ' es-escogido' : '') + (res ? ' r-' + esc(res[0]) : '') + (o.sinSello ? ' sin-sello' : '') +
      '" data-pid="' + esc(pid) + '"><span class="m">' + esc(p.mercado) + '</span>' +
      '<span class="fila-fin"><span class="pp">' + pct(p.p) + '</span>' + botonEscoger(pid, p, o, true) + '</span>' +
      '<span class="pt">' + sello(sel) + (o.sub || '') + '</span>' +
      (res && ESTADO[res[0]] && res[0] !== 'pendiente' && res[0] !== 'por_auditar'
        ? '<span class="det">' + ESTADO[res[0]].t + (res[1] ? ': ' + esc(res[1]) : '') + '</span>' : '') + '</li>';
  }
  /* un pick escogido en renglon; op: {conDia, conEstado (por jugarse / por auditar), escoger} */
  function jugado(p) { return p.ts ? Date.now() > p.ts * 1000 + 2.5 * 3600e3 : !!(p.fecha && p.fecha < hoy()); }
  function renglonEscogido(rec, mapas, op) {
    op = op || {};
    var res = mapas ? resultadoDe(rec, mapas) : null;
    if (!res && op.conEstado) { res = [jugado(rec) ? 'por_auditar' : 'pendiente', '']; }
    var sub = '<span class="cuando">' + (op.conDia ? '📅 ' + esc(cuando(rec)) : '🕐 ' + esc(rec.hora || 'por confirmar')) + '</span> · ' +
      bandera(rec.bandera) + ' <a href="#/analisis/' + esc(rec.sa) + '/' + esc(rec.archivo) + '">' + esc(rec.nombre) + '</a> · ' + esc(rec.partido) +
      (rec.origen ? ' · ' + emojiOrigen(rec.origen) + ' ' + esc(rec.origen) : '') + ' ' + personas(rec.por);
    var cerrada = !!(res && res[0] !== 'pendiente' && res[0] !== 'por_auditar');
    return renglon(rec, { doc: docDe(rec), origen: rec.origen, sub: sub, resultado: res, auditada: cerrada,
      escoger: op.escoger !== false, sinSello: true });
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
      '<label class="semana-caja"><small>Ciclo del fútbol · jue a mié</small><b>' + rangoSemana(sem) +
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
    return '<div class="cab-liga"><span class="bandera-grande">' + bandera(d.bandera) + '</span><div><h1>' + emojiDe(d) + ' ' + esc(d.nombre) +
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

  /* ================================================================== 0. hoy */
  /* La pantalla de todos los dias (pedido de Javier, 01/10): lo pendiente (para los
     seleccionadores), los escogidos del dia y TODOS los picks de hoy, manana y pasado manana, de
     todas las ligas, agrupados por partido. No depende de la semana del ciclo: se buscan las
     jornadas que tienen partidos esos dias, esten archivadas en la semana que esten. */
  function docsDeDias(desde, hasta) {
    return indice().then(function (idx) {
      var sems = (idx.semanas || []).map(function (s) { return s.id; })
        .filter(function (s) { return s <= hasta && s >= masDias(desde, -35); });
      return Promise.all(sems.map(semanaIdx)).then(function (ws) {
        var piden = [];
        ws.forEach(function (w, i) {
          ((w && w.ligas) || []).forEach(function (L) {
            if (!L.desde || (L.desde <= hasta && (L.hasta || L.desde) >= desde)) {
              piden.push(docLiga(sems[i], L.archivo).catch(function () { return null; }));
            }
          });
        });
        return Promise.all(piden).then(function (ds) { return ds.filter(Boolean); });
      });
    });
  }
  /* los picks de un dia sin repetir: un mismo pick sale en el TOP 5, en sugeridos y en su ranking */
  function picksDelDia(docs, dia) {
    var out = [];
    docs.forEach(function (d) {
      var vistos = {};
      var meter = function (p, tipo, nombre) {
        if (!p || p.fecha !== dia) { return; }
        var k = p.partido + '|' + p.mercado, x = vistos[k];
        if (!x) { x = vistos[k] = { p: p, d: d, top5: false, sug: [], rk: [], pid: d.archivo + '|' + k }; out.push(x); }
        if (tipo === 'top5') { x.top5 = true; } else if (tipo === 'sug') { x.sug.push(nombre); } else if (x.rk.indexOf(nombre) < 0) { x.rk.push(nombre); }
      };
      (d.top5 || []).forEach(function (p) { meter(p, 'top5'); });
      (d.sugeridos || []).forEach(function (s) { meter(s.pick, 'sug', s.nombre); });
      (d.rankings || []).forEach(function (r) { (r.picks || []).forEach(function (p) { meter(p, 'rk', r.titulo); }); });
    });
    return out;
  }
  function principal(x) { return x.top5 || x.sug.length > 0; }
  function deDondeSale(x) {
    var t = [];
    if (x.top5) { t.push('<span class="chip">🏆 TOP 5</span>'); }
    x.sug.forEach(function (n) { t.push('<span class="chip">' + emojiOrigen(n) + ' ' + esc(n) + '</span>'); });
    if (!t.length && x.rk.length) { t.push('<span class="chip neutro">📊 ' + esc(x.rk[0]) + '</span>'); }
    return t.join('');
  }
  /* marcas de un pick del top (regla R5, 09/10/2026): el momio de Playdoit y sus avisos solo en modo
     editor (la pagina publica no habla de apuestas); "no comprobable" (carreras) para todos */
  function marcasTop(t, conValor) {
    if (!t) { return ''; }
    return (t.no_comprobable ? '<span class="chip neutro" title="La tabla no trae el minuto de cada corner: el motor no ha podido comprobar que cumple lo que promete">⚠️ No comprobable</span>' : '') +
      (Editor.activo && t.momio ? '<span class="chip momio" title="Momio de Playdoit">💲 ' + esc(t.americano || americano(t.momio)) + '</span>' : '') +
      chipComb(t) + (conValor ? chipValor(t) : '') +
      (Editor.activo && t.sin_momio ? '<span class="chip neutro" title="Playdoit todavía no lo ofrece">⏳ Sin momio</span>' : '') +
      (Editor.activo && t.oportunidad ? '<span class="chip oportunidad" title="Playdoit lo paga como si fuera mucho menos probable de lo que da el motor">🔎 Oportunidad encontrada: revisa información</span>' : '') +
      (Editor.activo && t.diferencia_casa ? '<span class="chip oportunidad" title="' + esc(t.diferencia_casa) + '">🚧 Diferencia motor–casa en esta liga: revisa información</span>' : '') +
      (Editor.activo && t.ganancia != null ? '<span class="chip ' + (t.ganancia > 0 ? 'verde' : t.ganancia < 0 ? 'baja' : 'neutro') + '">' +
        (t.ganancia > 0 ? '+' : '') + num(t.ganancia, 2) + ' u</span>' : '');
  }
  function renglonHoy(x, conPartido, lugar, res) {
    var p = x.p, d = x.d;
    var sub = (lugar ? '<span class="chip top-lugar' + (x.lista ? ' ' + x.lista : '') + '">' + (x.lista ? LISTAS[x.lista].e : '⭐') + ' ' + lugar + '</span> ' : '') +
      (conPartido ? '<span class="cuando">🕐 ' + esc(p.hora || '—') + '</span> · ' + bandera(d.bandera) + ' ' + esc(d.nombre) +
      ' · ' + esc(p.partido) + ' ' : '') + (x.top ? marcasTop(x.top, x.lista === 'valor') : chipMomio(p)) +
      chipsAviso((x.top && x.top.avisos) || (fichaDe(d, p.partido) || {}).avisos, p.mercado) + deDondeSale(x) + chipConfianza(p.confianza) +
      (p.respaldo ? '<span class="chip neutro">⚖️ ' + esc(p.respaldo) + '</span>' : '') +
      (p.aviso ? '<span class="chip neutro" title="' + esc(p.aviso) + '">' + (p.deporte === 'americano' ? '📏 compara su línea' :
        p.deporte === 'basquetbol' ? '🩹 jugador clave' : '⚠️ no validable') +
        '</span>' : '');
    return renglon(p, { doc: d, origen: x.top5 ? 'TOP 5' : x.sug[0] || x.rk[0], sub: sub, auditada: !!d.auditoria || !!res, resultado: res,
      escoger: x.escoger });
  }
  /* un partido con sus picks: a la vista los del TOP 5 y los sugeridos (o el mejor, si no tiene);
     los demas de sus rankings, al tocar "mas picks" */
  function partidosDe(lista, ordenLiga) {
    var g = {}, orden = [];
    lista.forEach(function (x) {
      var k = x.d.archivo + '|' + x.p.partido;
      if (!g[k]) { g[k] = { d: x.d, partido: x.p.partido, hora: x.p.hora || '', ts: x.p.ts || 0, picks: [] }; orden.push(k); }
      g[k].picks.push(x);
    });
    return orden.map(function (k) { return g[k]; }).sort(function (a, b) {
      return (a.hora || '99').localeCompare(b.hora || '99') || ((ordenLiga[a.d.liga] || 0) - (ordenLiga[b.d.liga] || 0)) ||
        a.partido.localeCompare(b.partido);
    });
  }
  function tarjetaPartido(m, todos) {
    var picks = m.picks.slice().sort(function (a, b) { return (principal(b) - principal(a)) || ((b.p.p || 0) - (a.p.p || 0)); });
    var ver = todos ? picks.filter(principal) : picks;
    if (todos && !ver.length) { ver = picks.slice(0, 1); }
    var resto = picks.filter(function (x) { return ver.indexOf(x) < 0; });
    var empezo = m.ts ? Date.now() >= m.ts * 1000 : false;
    var nEsc = m.picks.filter(function (x) { return Esc.buscar(x.pid); }).length;
    return '<article class="partido-hoy' + (empezo ? ' empezado' : '') + '"><div class="ph-cab"><span class="ph-hora">🕐 ' + esc(m.hora || '—') + '</span>' +
      '<a class="ph-liga" href="#/analisis/' + esc(m.d.semana) + '/' + esc(m.d.archivo) + '">' + bandera(m.d.bandera) + ' ' + esc(m.d.nombre) +
      ' · ' + esc(etqJornada(m.d)) + '</a>' + (nEsc ? '<span class="sello">✅ ' + nEsc + '</span>' : '') +
      (empezo ? '<span class="chip neutro">🔒 empezó</span>' : '') + '</div>' +
      '<h3 class="ph-partido">' + (m.d.emoji || '⚽') + ' ' + esc(m.partido) + '</h3>' + lineaPartido(fichaDe(m.d, m.partido)) +
      '<ul class="lista">' + ver.map(function (x) { return renglonHoy(x, false); }).join('') + '</ul>' +
      (resto.length ? '<details class="ph-mas" data-k="ph-' + esc(m.d.archivo + '|' + m.partido) + '"><summary>＋ ' +
        plural(resto.length, 'pick más', 'picks más') + ' de este partido</summary><ul class="lista">' +
        resto.map(function (x) { return renglonHoy(x, false); }).join('') + '</ul></details>' : '') + '</article>';
  }
  function urlHoy(dia, f, orden, cual) {
    var a = [];
    if (dia && dia !== hoy()) { a.push('dia=' + dia); }
    if (f && f !== 'todos') { a.push('f=' + f); }
    if (orden === 'p' || orden === 'top') { a.push('orden=' + orden); }
    if (orden === 'top' && LISTAS[cual]) { a.push('lista=' + cual); }
    return '#/hoy' + (a.length ? '?' + a.join('&') : '');
  }
  /* pedido de Javier (10/10): en las tres vistas de Hoy lo que ya empezo baja al final, plegado;
     arriba solo lo que todavia se puede escoger */
  function empezado(p) { return p.ts ? Date.now() >= p.ts * 1000 : !!(p.fecha && p.fecha < hoy()); }
  function plegadoEmpezados(k, xs, html, partidoDe) {
    if (!xs.length) { return ''; }
    var n = unicos(xs.map(partidoDe || function (x) { return x.d.archivo + '|' + x.p.partido; })).length;
    var ok = xs.filter(function (x) { return x.top && x.top.estado === 'acierto'; }).length;
    var ko = xs.filter(function (x) { return x.top && x.top.estado === 'fallo'; }).length;
    return '<details class="caja ph-mas" data-k="' + k + '"><summary>🔒 Ya empezaron · ' + plural(xs.length, 'pick', 'picks') +
      (n > 1 ? ' de ' + n + ' partidos' : '') + (ok + ko ? ' · ✅ ' + ok + ' · ❌ ' + ko : '') + '</summary><div class="cuerpo">' + html + '</div></details>';
  }
  /* el top de tops del dia: cada pick conserva su lugar (⭐ 1...) aunque se filtre o ya haya empezado */
  function topHoy(tops, ver, cual) {
    if (!tops.length) {
      return cual === 'seguros' ? vacio('🛡️', 'Ningún pick de este día cumple: el motor y la combinada en 80% o más, pagando mejor que −500.')
        : cual === 'valor' ? vacio('💎', 'Ningún pick de este día paga más de lo que vale según la combinada.')
        : vacio('⭐', 'Ningún pick de este día llega a lo que el motor da como prácticamente seguro.');
    }
    if (!ver.length) { return vacio('📭', 'Ningún pick ' + (cual ? 'de la lista ' + LISTAS[cual].t : 'del top de tops') + ' de este día con ese filtro.'); }
    var ren = function (x) { return renglonHoy(x, true, tops.indexOf(x) + 1, x.top && x.top.estado ? [x.top.estado, x.top.detalle || ''] : null); };
    var prox = ver.filter(function (x) { return !empezado(x.p); }), emp = ver.filter(function (x) { return empezado(x.p); });
    return (prox.length ? '<ul class="lista tabla-caja top-tops">' + prox.map(ren).join('') + '</ul>'
      : vacio('🔒', 'Todos los picks ' + (cual ? 'de la lista ' + LISTAS[cual].t : 'del top') + ' de este día ya empezaron.')) +
      plegadoEmpezados('hoy-' + (cual || 'top') + '-empezados', emp, '<ul class="lista top-tops">' + emp.map(ren).join('') + '</ul>');
  }
  /* como se eligen los de cada lista: con las reglas que publica listas_valor.json */
  function explicaLista(listas, k) {
    var R = (listas && listas.reglas) || {}, r = R[k] || {};
    return '<details class="caja ph-mas top-info" data-k="lista-info-' + k + '"><summary>ℹ️ Cómo se eligen</summary><div class="cuerpo">' +
      (k === 'seguros'
        ? '<p class="criterio top-explica">🛡️ <b>Los más seguros con momio.</b> Entran los que el motor da en ' + pct(r.piso) +
          ' o más, con su respaldo como en el top, si la combinada también da ' + pct(r.piso) + ' o más y Playdoit paga mejor que ' +
          esc(americano(r.momio_minimo)) + '. Primero el que más da la combinada.</p>'
        : '<p class="criterio top-explica">💎 <b>Momio positivo que paga más de lo que vale.</b> Entran los que Playdoit paga ' +
          esc(americano(r.momio_minimo)) + ' o mejor, si la combinada da ' + pct(r.piso) + ' o más y con ese momio dejan ' + pct(r.valor_minimo) +
          ' o más de valor (📈), con el respaldo del motor como en el top. Aciertan menos que los seguros, pero cada acierto paga más: ' +
          'esta lista se mide por la ganancia, no por el acierto. Primero el más seguro.</p>') +
      '<p class="criterio top-explica">🤝 <b>Combinada:</b> la probabilidad del motor mezclada con la de Playdoit sin su margen, con el peso que ' +
      'el motor se ha ganado en cada mercado con el archivo de momios (se recalcula cada jueves). Máximo ' + esc(R.maximo) + ' por día, ' +
      esc(R.por_partido) + ' del mismo partido y una sola línea de cada mercado. Cuando empieza su partido, un pick ya no entra ni sale. ' +
      '<b>Solo modo editor:</b> se mide aquí antes de pasar al grupo.' + (listas && listas.momios_de ? ' Momios de Playdoit de las ' +
      esc(horaMx(listas.momios_de)) + '.' : '') + '</p></div></details>';
  }
  /* copia de un pick del dia para una lista (el mismo pick puede estar en el top y en una lista) */
  function copiaPick(x) {
    var y = {};
    for (var k in x) { if (Object.prototype.hasOwnProperty.call(x, k)) { y[k] = x[k]; } }
    return y;
  }
  /* Hoy se reacomoda solo cuando empieza un partido (si la pagina se queda abierta) y al volver a ella */
  var relojHoy = null, corteHoy = 0;
  function vigilarHoy(tss) {
    clearTimeout(relojHoy);
    var ahora = Date.now(), ruta = location.hash;
    corteHoy = tss.filter(function (t) { return t && t * 1000 > ahora; }).sort(function (a, b) { return a - b; })[0] || 0;
    if (!corteHoy) { return; }
    relojHoy = setTimeout(function () {
      if (location.hash === ruta && !document.hidden) { router(true); }
    }, Math.min(corteHoy * 1000 - ahora + 1500, 2147483000));
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && corteHoy && Date.now() >= corteHoy * 1000 && /^#\/hoy/.test(location.hash)) { router(true); }
  });
  function vHoy(partes, q) {
    var h0 = hoy(), dias = [h0, masDias(h0, 1), masDias(h0, 2)];
    var dia = dias.indexOf(q.get('dia')) >= 0 ? q.get('dia') : h0;
    var filtro = ['top5', 'sug', 'esc'].indexOf(q.get('f')) >= 0 ? q.get('f') : 'todos';
    var orden = ['p', 'top'].indexOf(q.get('orden')) >= 0 ? q.get('orden') : 'partido';
    /* las listas Seguros y Valor van dentro del top de tops, solo en modo editor (20/10/2026) */
    var cual = orden === 'top' && Editor.activo && LISTAS[q.get('lista')] ? q.get('lista') : '';
    var sems = ventanaHist();
    return Promise.all([indice(), docsDeDias(dias[0], dias[2]), Esc.rango(dias[0], dias[2]),
      Editor.activo ? Hist.cargar(sems, true).then(function () { return Hist.lista(sems); }, function () { return null; }) : null,
      topDeTops().catch(function () { return null; }),
      Editor.activo ? listasValor().catch(function () { return null; }) : null
    ]).then(function (x) {
      var idx = x[0], docs = x[1], escs = x[2], sels = x[3], top = x[4], listas = x[5];
      return (sels && sels.length ? mapasHist(sels) : Promise.resolve({})).then(function (mapas) {
        var ordenLiga = {};
        idx.ligas.forEach(function (L, i) { ordenLiga[L.id] = i; });
        var porDia = dias.map(function (d) { return picksDelDia(docs, d); });
        var lista = porDia[dias.indexOf(dia)], escDia = escs.filter(function (p) { return p.fecha === dia; });
        var nombre = function (d, i) { return i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : DIAS[fecha(d).getUTCDay()].charAt(0).toUpperCase() + DIAS[fecha(d).getUTCDay()].slice(1); };
        var h = '<div class="hoy-cab"><h1>' + fLarga(dia) + '</h1><p class="sub">' + (dia === h0 ? 'Hoy' : nombre(dia, dias.indexOf(dia))) +
          ' · todas las ligas · hora del centro de México</p></div>';
        h += '<nav class="dias-tabs" aria-label="Día">' + dias.map(function (d, i) {
          var e = escs.filter(function (p) { return p.fecha === d; }).length;
          return '<a href="' + urlHoy(d, filtro, orden, cual) + '" aria-current="' + (d === dia) + '"><b>' + nombre(d, i) + '</b><span>' + fCorta(d) + '</span>' +
            '<small>' + plural(porDia[i].length, 'pick', 'picks') + (e ? ' · ✅ ' + e : '') + '</small></a>';
        }).join('') + '</nav>';
        if (Editor.activo && sels) { h += bloquePendientes(sels, mapas, dia); }

        /* los escogidos que ya empezaron, al final y plegados (sugerencia aprobada por Javier, 10/10) */
        var escProx = escDia.filter(function (p) { return !empezado(p); }), escEmp = escDia.filter(empezado);
        var renE = function (p) { return renglonEscogido(p, null, {}); };
        h += '<h2><span class="emoji">✅</span>Escogidos ' + (dia === h0 ? 'de hoy' : 'del ' + fCorta(dia)) + ' <span class="cuenta">' + escDia.length + '</span></h2>' +
          (escProx.length ? '<ul class="lista tabla-caja">' + escProx.map(renE).join('') + '</ul>'
            : escDia.length ? '<p class="criterio">Los escogidos de este día ya empezaron.</p>'
            : '<p class="criterio">' + (Editor.activo ? 'Todavía no hay picks escogidos para este día: toca <b>＋</b> en los de abajo.' : 'Todavía no hay picks escogidos para este día.') + '</p>') +
          plegadoEmpezados('hoy-esc-empezados', escEmp, '<ul class="lista">' + escEmp.map(renE).join('') + '</ul>', function (p) { return p.archivo + '|' + p.partido; });

        var ligas = unicos(lista.map(function (x) { return x.d.liga; })), partidos = partidosDe(lista, ordenLiga);
        var filtrar = function (L, f) {
          return L.filter(function (x) { return f === 'top5' ? x.top5 : f === 'sug' ? x.sug.length : f === 'esc' ? !!Esc.buscar(x.pid) : true; });
        };
        var ver = filtrar(lista, filtro);
        h += '<h2 id="s-picks"><span class="emoji">📋</span>Todos los picks ' + (dia === h0 ? 'de hoy' : 'del ' + fCorta(dia)) + '</h2>' +
          '<p class="sub">' + plural(lista.length, 'pick', 'picks') + ' · ' + plural(partidos.length, 'partido', 'partidos') + ' · ' +
          plural(ligas.length, 'liga', 'ligas') + '</p>';
        if (!lista.length) {
          h += vacio('📭', 'No hay picks analizados para este día.');
        } else {
          /* el top de tops (pedido de Javier, 07/10): los picks mas seguros del dia de todos los deportes,
             en el orden que publico publicar_sitio.py; aqui solo se buscan y se muestran */
          var refs = ((top && top.dias) || {})[dia] || [], porPid = {}, porArchivo = {};
          lista.forEach(function (x) { porPid[x.pid] = x; });
          docs.forEach(function (d) { porArchivo[d.archivo] = d; });
          var tops = refs.map(function (r) {
            var x = porPid[r.archivo + '|' + r.partido + '|' + r.mercado];
            /* regla R5 (09/10/2026): el top sale de TODAS las lineas del motor; la que no esta en los
               rankings de su jornada se muestra con su ficha del top, igual que las demas. Se puede
               escoger cuando el intermediario del editor ya acepta picks del top (TOP_ESCOGIBLE) */
            if (!x && porArchivo[r.archivo]) {
              x = { p: { partido: r.partido, mercado: r.mercado, p: r.p, fecha: r.fecha, dia: r.dia, hora: r.hora, ts: r.ts,
                sem: r.sem, confianza: r.confianza }, d: porArchivo[r.archivo], top5: false, sug: [], rk: [],
                pid: r.archivo + '|' + r.partido + '|' + r.mercado, escoger: TOP_ESCOGIBLE ? undefined : false };
            }
            if (x) { x.top = r; }
            return x;
          }).filter(Boolean);
          var r5 = !!(top && top.regla === 'R5');
          var rsTop = ((top && top.resumen) || {})[dia];
          /* Seguros y Valor (modo editor, 20/10/2026): como el top, cada pick con su lugar; si no esta en los
             rankings de su jornada sale con su ficha de la lista, y se puede escoger si tambien esta en el top */
          var enTop = {};
          tops.forEach(function (x) { enTop[x.pid] = true; });
          var deLista = function (k) {
            return (((listas && listas[k] && listas[k].dias) || {})[dia] || []).map(function (r) {
              var pid = r.archivo + '|' + r.partido + '|' + r.mercado, x = porPid[pid];
              if (x) {
                x = copiaPick(x);
              } else if (porArchivo[r.archivo]) {
                x = { p: { partido: r.partido, mercado: r.mercado, p: r.p, fecha: r.fecha, dia: r.dia, hora: r.hora, ts: r.ts,
                  sem: r.sem, confianza: r.confianza }, d: porArchivo[r.archivo], top5: false, sug: [], rk: [], pid: pid,
                  escoger: LISTAS_ESCOGIBLE || (TOP_ESCOGIBLE && enTop[pid]) ? undefined : false };
              }
              if (x) { x.top = r; x.lista = k; }
              return x;
            }).filter(Boolean);
          };
          var enLista = cual ? deLista(cual) : [];
          /* los filtros tambien en el top de tops (pedido de Javier, 10/10): cuentan entre sus picks */
          var base = orden === 'top' ? (cual ? enLista : tops) : lista;
          h += '<div class="hoy-filtros"><nav class="filtros" aria-label="Qué picks">' +
            [['todos', '📋 Todos'], ['top5', '🏆 TOP 5'], ['sug', '💡 Sugeridos'], ['esc', '✅ Escogidos']].map(function (f) {
              return '<a href="' + urlHoy(dia, f[0], orden, cual) + '" aria-current="' + (filtro === f[0]) + '">' + f[1] + ' <b>' + filtrar(base, f[0]).length + '</b></a>';
            }).join('') + '</nav><div class="conmutador" role="group" aria-label="Ordenar"><a href="' + urlHoy(dia, filtro, 'partido') +
            '" aria-current="' + (orden === 'partido') + '">🕐 Por partido</a><a href="' + urlHoy(dia, filtro, 'p') + '" aria-current="' + (orden === 'p') +
            '">📈 Probabilidad</a><a href="' + urlHoy(dia, filtro, 'top') + '" aria-current="' + (orden === 'top') +
            '">⭐ Top de tops</a></div></div>';
          if (orden === 'top' && Editor.activo && listas) {
            var nL = { '': tops.length, seguros: cual === 'seguros' ? enLista.length : deLista('seguros').length,
              valor: cual === 'valor' ? enLista.length : deLista('valor').length };
            h += '<div class="conmutador listas-sel" role="group" aria-label="Lista">' + [['', '⭐ Top'], ['seguros', '🛡️ Seguros'], ['valor', '💎 Valor']].map(function (l) {
              return '<a href="' + urlHoy(dia, filtro, 'top', l[0]) + '" aria-current="' + (cual === l[0]) + '">' + l[1] + ' <b>' + nL[l[0]] + '</b></a>';
            }).join('') + '</div>';
          }
          if (orden === 'top' && cual) {
            var rsL = ((listas[cual] || {}).resumen || {})[dia];
            h += explicaLista(listas, cual) + (rsL && rsL.comprobables ? '<p class="leyenda"><span>✅ ' + plural(rsL.aciertos, 'acertado', 'acertados') +
                '</span><span>❌ ' + plural(rsL.fallos, 'fallado', 'fallados') + '</span>' + (rsL.anulados ? '<span>➖ ' + rsL.anulados +
                ' anulados o no comprobables</span>' : '') + (rsL.sin_resultado ? '<span>⏳ ' + rsL.sin_resultado + ' sin resultado</span>' : '') +
                '<span>🎯 ' + pct(rsL.acierto) + ' de acierto</span>' + (rsL.ganancia != null ? '<span>💰 ' + (rsL.ganancia > 0 ? '+' : '') +
                num(rsL.ganancia, 2) + ' u</span>' : '') + '</p>' : '') +
              topHoy(enLista, filtrar(enLista, filtro), cual);
          } else if (orden === 'top') {
            /* la explicacion, plegada (sugerencia aprobada por Javier, 10/10): los picks a la vista */
            h += '<details class="caja ph-mas top-info" data-k="top-info"><summary>ℹ️ Cómo se eligen</summary><div class="cuerpo">' + (r5
              ? '<p class="criterio top-explica">⭐ <b>Los mejores picks del día de todos los deportes.</b> Entran los de ' + pct(top.piso) +
                ' o más que el motor respalda (sin los de confianza baja; en fútbol, desde la jornada 5 también los de equipos que aún no juegan 7 partidos, porque ahí el motor acierta igual), de cualquier liga y mercado; primero el más seguro. Máximo ' +
                esc(top.maximo) + ' por día y ' + esc(top.por_partido || 3) + ' del mismo partido' + (top.por_mercado ? ', con una sola línea de cada ' +
                'mercado (de Under 6.5 y Under 5.5 de tarjetas del mismo partido entra solo una)' : '') + '. Cuando empieza su partido, un pick ya no entra ' +
                'ni sale: así se audita lo que estaba aquí antes de jugarse (<a href="#/resultados/' + lunesDe(dia) + '">🏅 Resultados</a>).</p>' +
                (Editor.activo ? '<p class="criterio top-explica">💲 <b>Momios de Playdoit</b>' + (top.momios_de ? ' de las ' + esc(horaMx(top.momios_de)) : '') +
                  ': entran si pagan ' + esc(americano(top.momio_minimo)) + ' o mejor. ⏳ Sin momio: Playdoit todavía no lo ofrece (actualiza momios). ' +
                  '🔎 Oportunidad encontrada: Playdoit lo paga como si fuera mucho menos probable; revisa información antes de jugarlo. ' +
                  '🚧 Diferencia motor–casa: en esa liga Playdoit pone la línea de ese mercado muy lejos de lo que espera el motor; ' +
                  'manda el motor, pero revisa información.</p>' : '')
              : '<p class="criterio top-explica">⭐ <b>Los picks más seguros del día de todos los deportes.</b> Entran los que el motor da en ' +
              (top ? pct(top.piso) : '—') + ' o más, ordenados por lo que su familia de mercados ha demostrado cumplir; sin los de confianza baja, ' +
              'uno por partido y no más de tres de la misma liga ni del mismo mercado. Máximo ' + (top ? esc(top.maximo) : '—') +
              '. Cuando empieza su partido, un pick ya no entra ni sale: así se audita lo que estaba aquí antes de jugarse ' +
              '(<a href="#/resultados/' + lunesDe(dia) + '">🏅 Resultados</a>).</p>') + '</div></details>' +
              (rsTop && rsTop.comprobables ? '<p class="leyenda"><span>✅ ' + plural(rsTop.aciertos, 'acertado', 'acertados') + '</span><span>❌ ' +
                plural(rsTop.fallos, 'fallado', 'fallados') + '</span>' + (rsTop.anulados ? '<span>➖ ' + rsTop.anulados + ' anulados o no comprobables</span>' : '') +
                (rsTop.sin_resultado ? '<span>⏳ ' + rsTop.sin_resultado + ' sin resultado</span>' : '') + '<span>🎯 ' + pct(rsTop.acierto) + ' de acierto</span></p>' : '') +
              topHoy(tops, filtrar(tops, filtro));
          } else if (!ver.length) {
            h += vacio('📭', 'Ningún pick de este día con ese filtro.');
          } else if (orden === 'p') {
            /* lo que ya empezo, al final y plegado, como en "por partido" (pedido de Javier, 10/10) */
            var todos = ver.slice().sort(function (a, b) { return (b.p.p || 0) - (a.p.p || 0); });
            var proxP = todos.filter(function (x) { return !empezado(x.p); }), empP = todos.filter(function (x) { return empezado(x.p); });
            var renP = function (x) { return renglonHoy(x, true); };
            h += (proxP.length ? '<ul class="lista tabla-caja">' + proxP.slice(0, 60).map(renP).join('') + '</ul>' +
              (proxP.length > 60 ? '<details class="caja ph-mas" data-k="hoy-resto"><summary>Ver los otros ' + (proxP.length - 60) + ' picks</summary>' +
                '<ul class="lista">' + proxP.slice(60).map(renP).join('') + '</ul></details>' : '')
              : vacio('🔒', 'Todos los partidos de este día ya empezaron.')) +
              plegadoEmpezados('hoy-empezados-p', empP, '<ul class="lista">' + empP.map(renP).join('') + '</ul>');
          } else {
            /* los que ya empezaron van al final, plegados: arriba solo lo que todavia se puede escoger */
            var ms = partidosDe(ver, ordenLiga), ya = function (m) { return m.ts ? Date.now() >= m.ts * 1000 : false; };
            var prox = ms.filter(function (m) { return !ya(m); }), emp = ms.filter(ya);
            h += (prox.length ? '<div class="partidos-hoy">' + prox.map(function (m) { return tarjetaPartido(m, filtro === 'todos'); }).join('') + '</div>'
              : vacio('🔒', 'Todos los partidos de este día ya empezaron.')) +
              (emp.length ? '<details class="caja ph-mas" data-k="hoy-empezados"><summary>🔒 Ya empezaron · ' + plural(emp.length, 'partido', 'partidos') +
                '</summary><div class="cuerpo"><div class="partidos-hoy">' + emp.map(function (m) { return tarjetaPartido(m, filtro === 'todos'); }).join('') +
                '</div></div></details>' : '');
          }
        }
        pintar(h, dia === h0 ? 'Hoy' : fLarga(dia));
        vigilarHoy(lista.concat(tops || []).concat(enLista || []).map(function (x) { return x.p.ts; }).concat(escDia.map(function (p) { return p.ts; })));
      });
    });
  }

  /* ================================================================== 1. analisis y auditoria */
  /* arriba: el deporte (cada uno con su ciclo) y si se ve el analisis o la auditoria. Pedido de Javier
     (01/10): las pestanas de todos los deportes en este orden; los que aun no estan listos dicen
     "Proximamente" mientras se preparan sus motores (listo = true cuando se conecte cada uno). */
  var DEPORTES_PAGINA = [{ id: 'futbol', e: '⚽', t: 'Fútbol', listo: true }, { id: 'nba', e: '🏀', t: 'NBA', listo: true },
    { id: 'nfl', e: '🏈', t: 'NFL', listo: true }, { id: 'nhl', e: '🏒', t: 'NHL', listo: true }];
  function cabAnalisis(tipo, sem, dep) {
    dep = dep || 'futbol';
    var s = sem ? '/' + sem : '', qd = dep === 'futbol' ? '' : '?deporte=' + dep;
    return cabecera(tipo) + '<div class="analisis-ctl"><nav class="deportes" aria-label="Deporte">' + DEPORTES_PAGINA.map(function (d) {
      return '<a href="#/' + tipo + (d.id === 'futbol' ? '' : '?deporte=' + d.id) + '" aria-current="' + (dep === d.id) + '"' +
        (d.listo ? '' : ' class="pronto"') + '>' + d.e + ' ' + d.t + '</a>';
    }).join('') + '</nav><div class="conmutador" role="group" aria-label="Ver"><a href="#/analisis' + (qd ? qd : s) + '" aria-current="' +
      (tipo === 'analisis') + '">📊 Análisis</a><a href="#/auditoria' + (qd ? qd : s) + '" aria-current="' + (tipo === 'auditoria') + '">🔍 Auditoría</a></div></div>';
  }
  /* un deporte que todavia no esta listo */
  function proximamente(tipo, q) {
    var d = DEPORTES_PAGINA.filter(function (x) { return x.id === (q && q.get('deporte')); })[0];
    if (!d || d.listo) { return null; }
    pintar(cabAnalisis(tipo, null, d.id) + '<div class="vacio proximamente"><span class="emoji">' + d.e + '</span><b>' + d.t + ' · Próximamente</b>' +
      '<p>Estamos preparando su motor. Aquí aparecerán su análisis, sus picks y su auditoría, y sus picks se sumarán a 🏠 Hoy, ' +
      '✅ Escogidos y 🏅 Resultados como los del fútbol.</p></div>', d.t);
    return Promise.resolve();
  }
  function vAnalisis(partes, q) {
    var pronto = proximamente('analisis', q);
    if (pronto) { return pronto; }
    if (partes[1]) { return vLiga(partes[0], partes[1]); }
    if (q && q.get('deporte') && q.get('deporte') !== 'futbol') { return vDeporteOtro('analisis', q.get('deporte')); }
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'analisis');
      if (!sem) { return pintar(cabAnalisis('analisis') + vacio('📭', 'Todavía no hay análisis publicados.'), 'Análisis'); }
      return Promise.all([semanaIdx(sem), Esc.cargar(sem)]).then(function (x) {
        var w = x[0], ligas = ((w && w.ligas) || []).filter(esFutbol);
        var h = cabAnalisis('analisis', sem) + selectorSemana(idx, sem, 'analisis');
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
                  (L.liga_joven ? ' <span class="chip neutro">🌱 Inicio de temporada</span>' : '') + '</div>' +
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
      return Editor.activo ? '<p class="nota verde">✏️ Toca <b>＋ Escoger</b> en cualquier pick: aparecerá aquí, en ' +
        '<a href="#/hoy">🏠 Hoy</a> y en <a href="#/escogidos">✅ Escogidos</a>, en el día en que se juega.</p>' : '';
    }
    return '<h2><span class="emoji">✅</span>Picks escogidos de esta liga <span class="cuenta">' + lista.length + '</span></h2>' +
      '<div class="grid-picks">' + lista.map(function (p) {
        return tarjeta(p, { doc: d, origen: p.origen, conOrigen: true, auditada: !!d.auditoria });
      }).join('') + '</div>' +
      (lista.some(function (p) { return !p.fecha || p.fecha >= hoy(); })
        ? '<p><a class="boton secundario" href="#/escogidos?liga=' + esc(d.liga) + '">Ver en los escogidos ›</a></p>'
        : '<p><a class="boton secundario" href="#/resultados/' + esc(lunesDe(lista[0].fecha)) + '">Ver sus resultados ›</a></p>');
  }
  function fichasPorDia(d, mapaRes) {
    var grupos = {}, orden = [];
    (d.partidos || []).forEach(function (f) {
      var k = f.fecha || '';
      if (!(k in grupos)) { grupos[k] = []; orden.push(k); }
      grupos[k].push(f);
    });
    /* los partidos van primero: por dia y por hora */
    orden.sort(function (a, b) { return (a || '9').localeCompare(b || '9'); });
    orden.forEach(function (k) { grupos[k].sort(function (a, b) { return (a.hora || '99').localeCompare(b.hora || '99'); }); });
    return orden.map(function (k) {
      return '<div class="dia-cab">🗓️ ' + (k ? fLarga(k) : 'Fecha por confirmar') + '<span class="cuenta">' + grupos[k].length +
        (grupos[k].length === 1 ? ' partido' : ' partidos') + '</span></div>' + grupos[k].map(function (f) { return ficha(f, d); }).join('');
    }).join('');
  }
  /* nombres cortos para que el partido y su tendencia quepan en un renglon (Javier, 11/10/2026): sin
     "Club", "FC", "CD"...; en hockey, americano y basquetbol, el apodo ("Rangers", "Golden Knights", "Trail Blazers") */
  var SIGLAS_FUERA = { club: 1, cf: 1, fc: 1, cd: 1, ca: 1, sc: 1, ac: 1, afc: 1, ud: 1, rcd: 1, sd: 1, cs: 1, fk: 1, sk: 1, kv: 1, nk: 1, 'if': 1, bk: 1 };
  function cortoEq(n, d) {
    var p = String(n || '').split(/\s+/).filter(Boolean);
    var dep = d ? depDe(d) : 'futbol';
    if ((dep === 'hockey' || dep === 'americano' || dep === 'basquetbol') && p.length > 1) {
      var k = /^(Golden|Maple|Blue|Red|Trail)$/.test(p[p.length - 2]) ? 2 : 1;
      return p.slice(-k).join(' ');
    }
    var q = p.filter(function (x) { return !SIGLAS_FUERA[x.toLowerCase().replace(/\./g, '')]; });
    return (q.length ? q : p).join(' ');
  }
  function mercadoCorto(m, f, d) {
    var t = String(m || '').replace(/^Handicap Asiatico /, 'Hándicap ').replace(/ \(si alguien llega\)$/, '');
    [f.local, f.visitante || f.visita].forEach(function (n) { if (n) { t = t.split(n).join(cortoEq(n, d)); } });
    return t;
  }
  function sumPartido(f, d, visita, hora) {
    var tm = f.tendencia;
    return '<span class="sum-txt"><span class="sum-fila"><span class="sum-uno">' + esc(cortoEq(f.local, d)) + ' vs ' + esc(cortoEq(visita, d)) + '</span>' +
      (hora ? '<span class="sum-hora">' + hora + '</span>' : '') + '</span>' +
      (tm ? '<small class="sum-uno">🧭 ' + pct(tm.p) + ' · ' + esc(mercadoCorto(tm.mercado, f, d)) + '</small>' : '') + '</span>';
  }
  /* la explicacion del partido y de cada equipo (Javier, 11/10/2026: "de los 2 involucrados") */
  function explicaHTML(x, f) {
    if (!x) { return ''; }
    if (typeof x === 'string') { return '<p class="explica">📝 ' + esc(x) + '</p>'; }
    return '<div class="explica"><p>📝 ' + esc(x.partido || '') + '</p>' +
      (x.local ? '<p>🏠 <b>' + esc(cortoEq(f.local)) + ':</b> ' + esc(x.local) + '</p>' : '') +
      (x.visitante ? '<p>✈️ <b>' + esc(cortoEq(f.visitante)) + ':</b> ' + esc(x.visitante) + '</p>' : '') + '</div>';
  }
  /* la tendencia maestra del partido (Javier, 11/10/2026): si es uno de los picks publicados se puede
     escoger como cualquier otro; si no, solo se muestra */
  function tendenciaHTML(tm, d) {
    if (!tm) { return ''; }
    var pub = todosLosPicks(d).filter(function (x) { return x && x.partido === tm.partido && x.mercado === tm.mercado; })[0];
    var row = pub ? fila(pub, { doc: d, origen: origenDe(d, pub), auditada: !!d.auditoria })
      : fila(tm, { doc: d, origen: 'Tendencia maestra', escoger: false });
    return '<div class="tendencia"><div class="tendencia-cab">🧭 Tendencia maestra ' + chipConfianza(tm.confianza) + '</div>' +
      '<ul class="lista">' + row + '</ul>' + (tm.just ? '<p class="criterio">' + esc(tm.just) + '</p>' : '') + '</div>';
  }
  /* la tabla de pronosticos consolidada de la jornada (Javier, 11/10/2026): en cada metrica lo esperado
     del local y del visitante y, abajo, su linea principal con la probabilidad de que salga mas */
  var CONSOLIDADA = [['tarjetas', '🟨 Tarjetas'], ['remates', '🎯 Remates'], ['sot', '🥅 Al arco'], ['corners', '⛳ Córners'],
    ['offsides', '🚩 Offsides'], ['faltas', '🦵 Faltas']];
  function tablaConsolidada(d) {
    var ps = (d.partidos || []).filter(function (f) { return f.goles && f.goles.ll != null; }).slice().sort(function (a, b) {
      return ((a.fecha || '9') + (a.hora || '99')).localeCompare((b.fecha || '9') + (b.hora || '99'));
    });
    if (!ps.length) { return ''; }
    var par = function (a, b) { return '<b>' + num(a, 2) + ' – ' + num(b, 2) + '</b>'; };
    var filas = ps.map(function (f) {
      var g = f.goles, met = {};
      (f.metricas || []).forEach(function (m) { met[m.clave] = m; });
      return '<tr><td class="cons-partido"><b>' + esc(f.local) + '</b><b>' + esc(f.visitante) + '</b><small>' + esc(f.fecha ? fCorta(f.fecha) : f.dia || '') +
        (f.hora ? ' · ' + esc(f.hora) : '') + '</small></td>' +
        '<td><small>L ' + pct(g.p_local) + '</small><small>E ' + pct(g.p_empate) + '</small><small>V ' + pct(g.p_visitante) + '</small></td>' +
        '<td>' + par(g.ll, g.lv) + (g.linea ? '<small>' + esc(g.linea) + ': más ' + pct(g.over) + '</small>' : '') +
        '<small>ambos ' + pct(g.btts) + '</small></td>' +
        CONSOLIDADA.map(function (c) {
          var m = met[c[0]];
          return '<td>' + (m && m.ll != null ? par(m.ll, m.lv) + '<small>' + esc(m.linea) + ': más ' + pct(m.over) + '</small>' : '—') + '</td>';
        }).join('') + '</tr>';
    }).join('');
    return resumenCaja('', 'consolidada', '📊', 'Tabla consolidada', 'los pronósticos de todos los partidos', plural(ps.length, 'partido', 'partidos'),
      '<p class="criterio">En cada columna, lo esperado del local – visitante (en tarjetas, las que recibe cada uno); abajo, la línea principal ' +
      'y la probabilidad de que salga más. Desliza a la derecha para ver todo.</p><div class="tabla-scroll consolidada"><table><thead><tr><th>Partido</th>' +
      '<th>1X2</th><th>⚽ Goles</th>' + CONSOLIDADA.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>');
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
    var tm = f.tendencia;
    return '<details class="caja" data-k="f-' + esc(d.archivo + f.local) + '"><summary>⚽ ' +
      sumPartido(f, d, f.visitante, f.hora ? '🕐 ' + esc(f.hora) : esc(f.dia || '')) + '</summary><div class="cuerpo">' +
      lineaPartido(f) + explicaHTML(f.explicacion, f) + tendenciaHTML(tm, d) +
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
  /* los rankings del futbol en 5 desplegables (pedido de Javier, 10/10); adentro, cada ranking del
     motor con su orden. Uno que no este en la lista va al ultimo grupo. */
  var GRUPOS_MERCADO = [
    { id: 'resultado', e: '🥅', t: 'Resultado y hándicap', d: 'quién gana, hándicap y ambos anotan', s: ['top_a_moneyline_btts'] },
    { id: 'masmenos', e: '🎯', t: 'Más/menos', d: 'goles, remates, remates al arco, tarjetas, córners y faltas',
      s: ['top_b_ou_goles_remates_sot', 'top_c_ou_tarjetas_corners_faltas'] },
    { id: 'dominios', e: '💪', t: 'Dominios', d: 'quién hace más y quién recibe más',
      s: ['top_d_dominio', 'r9a_choque_disciplinario', 'r9b_predominio_faltas', 'r9c_supremacia_offsides'] },
    { id: 'pt', e: '⚡', t: 'Primer tiempo', d: 'goles, tarjetas y córners', s: ['r8a_gol_1h', 'r8b_tarjeta_1h', 'r8c_carrera_3_corners_1h'] },
    { id: 'mitades', e: '🧩', t: 'Mitades y carreras', d: 'gol en ambas mitades, mitad con más goles, carreras a 3 y 5 córners, ambos con 2+ tarjetas',
      s: ['r9f_consistencia_goleadora', 'r9g_mitad_mas_goles', 'r9h_carrera_3_corners', 'r9d_carrera_5_corners', 'r9e_intensidad_compartida'] }
  ];
  /* la NFL igual (sugerencia aprobada por Javier, 10/10): sus 15 rankings en 4 desplegables */
  var GRUPOS_NFL = [
    { id: 'puntos', e: '🏈', t: 'Puntos', d: 'del partido, del local y del visitante', s: ['nfl_total', 'nfl_total_local', 'nfl_total_visita'] },
    { id: 'td', e: '🙌', t: 'Touchdowns', d: 'del partido, de cada equipo y de carrera',
      s: ['nfl_td_partido', 'nfl_td_local', 'nfl_td_visita', 'nfl_td_carrera'] },
    { id: 'yardas', e: '🏃', t: 'Yardas por tierra', d: 'del partido y de cada equipo', s: ['nfl_yardas_partido', 'nfl_yardas_local', 'nfl_yardas_visita'] },
    { id: 'mitades', e: '⏱️', t: 'Mitades', d: 'puntos y touchdowns de la 1ª y la 2ª mitad',
      s: ['nfl_1m_total', 'nfl_1m_local', 'nfl_1m_visita', 'nfl_td_1m', 'nfl_2m_total'] }
  ];
  /* la NBA (27/10/2026): sus 13 rankings en 4 desplegables */
  var GRUPOS_NBA = [
    { id: 'lado', e: '🏆', t: 'Ganador y hándicap', d: 'del partido y de la 1ª mitad', s: ['nba_ganador', 'nba_handicap', 'nba_1m_ganador'] },
    { id: 'puntos', e: '🏀', t: 'Puntos', d: 'del partido, del local y del visitante', s: ['nba_total', 'nba_total_local', 'nba_total_visita'] },
    { id: 'mitades', e: '⏱️', t: 'Mitades', d: 'puntos de la 1ª mitad (partido y cada equipo) y de la 2ª mitad',
      s: ['nba_1m_total', 'nba_1m_local', 'nba_1m_visita', 'nba_2m_total'] },
    { id: 'cuarto', e: '⏱️', t: '1er cuarto', d: 'puntos del partido y de cada equipo', s: ['nba_q1_total', 'nba_q1_local', 'nba_q1_visita'] }
  ];
  function gruposMercado(rankings, grupos) {
    var ult = grupos.length - 1;
    return grupos.map(function (g, i) {
      var rs = [];
      g.s.forEach(function (s) { rankings.forEach(function (r) { if (r.seccion === s) { rs.push(r); } }); });
      if (i === ult) {
        rankings.forEach(function (r) { if (!grupos.some(function (x) { return x.s.indexOf(r.seccion) >= 0; })) { rs.push(r); } });
      }
      return { g: g, rs: rs };
    }).filter(function (x) { return x.rs.length; });
  }
  /* los rankings en desplegables por grupo (con grupos) o uno por ranking (NHL) */
  function rankingsHTML(rankings, grupos, aud, res, o) {
    if (!grupos) {
      return rankings.map(function (r) {
        return resumenCaja('', 'r-' + r.seccion, EMOJI_SECCION[r.seccion] || '📊', esc(r.titulo), '', aud ? cuentaAud(r.picks, res) : r.total,
          listaRanking(r, aud, res, o));
      }).join('');
    }
    return gruposMercado(rankings, grupos).map(function (x) {
      var todos = [].concat.apply([], x.rs.map(function (r) { return r.picks; }));
      var cuenta = aud ? cuentaAud(todos, res) : x.rs.reduce(function (s, r) { return s + (r.total || r.picks.length); }, 0);
      var cuerpo = x.rs.length === 1 && !x.g.d ? listaRanking(x.rs[0], aud, res, o) : x.rs.map(function (r) {
        return '<div class="sub-rk"><h3><span class="emoji">' + (EMOJI_SECCION[r.seccion] || '📊') + '</span>' + esc(r.titulo) +
          '<span class="cuenta">' + (aud ? cuentaAud(r.picks, res) : r.total) + '</span></h3>' + listaRanking(r, aud, res, o) + '</div>';
      }).join('');
      return resumenCaja('', 'g-' + x.g.id, x.g.e, esc(x.g.t), x.g.d ? esc(x.g.d) : '', cuenta, cuerpo);
    }).join('');
  }
  /* cuantos acerto (de los comprobables) una lista de picks auditada */
  function cuentaAud(picks, res) {
    return picks.filter(function (p) { return res(p)[0] === 'acierto'; }).length + ' de ' +
      picks.filter(function (p) { var e = res(p)[0]; return e === 'acierto' || e === 'fallo'; }).length + ' ✅';
  }
  function resumenCaja(id, k, emoji, titulo, detalle, cuenta, cuerpo) {
    return '<details class="caja"' + (id ? ' id="' + id + '"' : '') + ' data-k="' + esc(k) + '"><summary><span class="emoji">' + emoji + '</span>' +
      '<span class="sum-txt">' + titulo + (detalle ? '<small>' + detalle + '</small>' : '') + '</span><span class="cuenta">' + cuenta + '</span></summary>' +
      '<div class="cuerpo">' + cuerpo + '</div></details>';
  }
  function listaRanking(r, aud, res, o) {
    return (r.no_validable ? '<p class="nota">⚠️ No validable con la tabla: el orden en que caen los córners no se puede reconstruir, ' +
        'así que estas probabilidades no están auditadas.</p>' : '') +
      '<ul class="lista">' + r.picks.map(function (p) { return fila(p, o({ origen: r.titulo, resultado: res(p) })); }).join('') + '</ul>' +
      (r.total > r.picks.length ? '<p class="criterio">Se muestran los ' + r.picks.length + ' de mayor respaldo de ' + r.total + '.</p>' : '');
  }
  /* analisis (o auditoria, con mapaRes) de una jornada: TOP 5 y sugeridos plegados, y los rankings */
  function cuerpoJornada(d, mapaRes) {
    var aud = !!mapaRes, h = '';
    var res = function (p) { return aud ? (mapaRes[p.partido + '|' + p.mercado] || ['no_comprobable', '']) : null; };
    var base = { doc: d, auditada: !!d.auditoria, escoger: !aud };
    var o = function (extra) { var r = {}; for (var k in base) { r[k] = base[k]; } for (k in extra) { r[k] = extra[k]; } return r; };
    var top5 = d.top5 || [], sugs = d.sugeridos || [], conPick = sugs.filter(function (s) { return s.pick; });
    h += '<h2><span class="emoji">💎</span>Picks de la jornada</h2>';
    h += resumenCaja('s-top5', 'top5', '🏆', 'TOP 5 de la jornada', '', aud && top5.length ? cuentaAud(top5, res) : top5.length, top5.length
      ? '<div class="grid-picks">' + top5.map(function (p) { return tarjeta(p, o({ origen: 'TOP 5', resultado: res(p) })); }).join('') + '</div>'
      : vacio('🏆', 'Ningún pick de esta jornada alcanzó el nivel del TOP 5.'));
    h += resumenCaja('s-sugeridos', 'sugeridos', '💡', 'Picks sugeridos', 'uno por cada criterio',
      aud && conPick.length ? cuentaAud(conPick.map(function (s) { return s.pick; }), res) : conPick.length + (sugs.length > conPick.length ? ' de ' + sugs.length : ''),
      '<div class="grid-picks">' + sugs.map(function (s) {
        var cab = '<div class="persona"><span class="emoji">' + (EMOJI_PERSONA[s.clave] || '💡') + '</span>' + esc(s.nombre) + '</div>' +
          (s.criterio ? '<p class="criterio">' + esc(s.criterio) + '</p>' : '');
        return s.pick ? tarjeta(s.pick, o({ origen: s.nombre, cabecera: cab, resultado: res(s.pick) }))
          : '<article class="pick">' + cab + '<p class="criterio">🚫 Desierto esta jornada' + (s.motivo ? ': ' + esc(s.motivo) : '') + '</p></article>';
      }).join('') + '</div>');
    h += '<section id="s-mercados"><h2><span class="emoji">📊</span>Rankings por mercado</h2>' + ((d.rankings || []).length
      ? rankingsHTML(d.rankings, GRUPOS_MERCADO, aud, res, o) : vacio('📊', 'Esta jornada no tiene rankings publicados.')) + '</section>';
    return h;
  }
  function vLiga(sem, archivo) {
    return docLiga(sem, archivo).then(function (d) {
      if (!esFutbol(d)) { return vDiaOtro(d, false); }
      var sems = unicos([d.semana].concat(todosLosPicks(d).map(function (p) { return p.sem; })));
      return Promise.all(sems.map(Esc.cargar)).then(function () {
        REG.__doc = d;
        var h = '<a class="migas" href="#/analisis/' + esc(d.semana) + '">‹ Análisis · semana del ' + rangoSemana(d.semana) + '</a>';
        h += cabLiga(d, '📅 Jornada ' + esc(d.jornada) + (d.desde ? ' · ' + rango(d.desde, d.hasta) : '') +
          (d.generado ? ' · generado el ' + esc(d.generado) : ''));
        var acc = [];
        if (d.auditoria) { acc.push('<a class="boton secundario" href="#/auditoria/' + esc(d.semana) + '/' + esc(d.archivo) + '">🔍 Ver su auditoría</a>'); }
        if (acc.length) { h += '<div class="acciones">' + acc.join('') + '</div>'; }
        if (d.liga_joven) {
          /* un solo aviso por liga, no en cada pick (pedido de Javier, 10/10) */
          h += '<p class="nota">🌱 Inicio de temporada: mientras la liga acumula jornadas, algunos mercados se calculan con lo ' +
            'que se ha medido en las otras ligas.</p>';
        }
        if (d.fechas_deducidas) { h += '<p class="nota">📅 Algunas fechas se dedujeron del día de la semana: la hora de esos partidos está por confirmar.</p>'; }
        /* primero los partidos y despues los picks (pedido de Javier, 10/10) */
        h += '<nav class="indice" aria-label="En esta jornada">' + [['s-partidos', '📋 Partidos'], ['s-escogidos', '✅ Escogidos'], ['s-top5', '🏆 TOP 5'],
          ['s-sugeridos', '💡 Sugeridos'], ['s-mercados', '📊 Mercados']].map(function (x) {
          return '<a href="#" data-accion="ir" data-id="' + x[0] + '">' + x[1] + '</a>';
        }).join('') + '</nav>';
        h += '<section id="s-partidos"><h2><span class="emoji">📋</span>Partidos <span class="cuenta">' +
          plural((d.partidos || []).length, 'partido', 'partidos') + '</span></h2>' + tablaConsolidada(d) + fichasPorDia(d) + '</section>';
        h += '<section id="s-escogidos" data-archivo="' + esc(d.archivo) + '">' + bloqueEscogidosLiga(d) + '</section>';
        h += cuerpoJornada(d, null);
        pintar(h, d.nombre + ' J' + d.jornada);
      });
    });
  }

  /* ================================================================== 2. auditoria */
  function vAuditoria(partes, q) {
    var pronto = proximamente('auditoria', q);
    if (pronto) { return pronto; }
    if (partes[1]) { return vAuditoriaLiga(partes[0], partes[1]); }
    if (q && q.get('deporte') && q.get('deporte') !== 'futbol') { return vDeporteOtro('auditoria', q.get('deporte')); }
    return indice().then(function (idx) {
      var sem = partes[0] || semanaDefecto(idx, 'auditoria');
      if (!sem) {
        return pintar(cabAnalisis('auditoria') + vacio('🔍', 'Todavía no hay jornadas auditadas. Cada jornada se audita al terminar, ' +
          'con el resultado real de cada partido.'), 'Auditoría');
      }
      return semanaIdx(sem).then(function (w) {
        var ligas = ((w && w.ligas) || []).filter(esFutbol), a = w && w.auditoria;
        var h = cabAnalisis('auditoria', sem) + selectorSemana(idx, sem, 'auditoria');
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
      if (!esFutbol(d)) { return vDiaOtro(d, true); }
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


  /* ================================================================== 2b. otros deportes (NHL) */
  /* Pestana de un deporte con su propio ciclo (NHL: martes a lunes, decision de Javier del 29/09).
     Cada dia de partidos es un analisis; los dias vienen en data/index.json -> deportes.<id>.ciclos */
  function vDeporteOtro(tipo, dep) {
    return indice().then(function (idx) {
      var D = (idx.deportes || {})[dep], meta = DEPORTES_PAGINA.filter(function (x) { return x.id === dep; })[0] || {};
      var h = cabAnalisis(tipo, null, dep), e = (D && D.emoji) || meta.e || '';
      if (!D || !(D.ciclos || []).length) {
        return pintar(h + vacio(e, 'Todavía no hay días analizados.'), meta.t || 'Análisis');
      }
      var h0 = hoy();
      h += '<p class="sub">' + e + ' <b>' + esc(D.nombre) + '</b> · cada día de partidos tiene su análisis · el motor corre ' +
        'una vez por ciclo, de <b>martes a lunes</b> · ' + (dep === 'nfl' ? 'los puntos cuentan con prórroga (el ganador empatado se devuelve)' :
        dep === 'nba' ? 'todo cuenta con prórroga; la 1ª mitad y el 1er cuarto, solo su periodo (su ganador es sin empate)' :
        'los goles cuentan con tiempo extra y penales (+1 gol al ganador de la tanda)') + '</p>';
      if (tipo === 'auditoria' && D.acierto) {
        var a = D.acierto;
        h += marcadorCajas([['🎯 Picks comprobables', a.picks], ['✅ Acierto real', pct(a.acierto), 'verde'],
          ['📈 Prometido por el motor', pct(a.prometido), 'azul'], ['📅 Días auditados', a.jornadas, 'azul']]);
        h += tira({ ok: a.aciertos, ko: a.picks - a.aciertos, nulo: 0 });
      }
      var ciclos = D.ciclos.map(function (c) {
        var dias = tipo === 'auditoria' ? c.dias.filter(function (x) { return x.fecha < h0 || x.auditoria; }) : c.dias;
        return { c: c, dias: dias };
      }).filter(function (x) { return x.dias.length; });
      if (!ciclos.length) {
        h += vacio('🔍', 'Todavía no hay días jugados que auditar. Cada día se audita cuando sus datos quedan firmes.');
      }
      h += ciclos.map(function (x, i) {
        var c = x.c, enCurso = c.desde <= h0 && h0 <= c.hasta;
        var cab = '📅 Ciclo del ' + rango(c.desde, c.hasta) + (enCurso ? ' <span class="chip">en curso</span>' : '');
        var tarjetas = '<div class="rejilla">' + x.dias.map(function (y) { return tarjetaDiaOtro(y, tipo, D); }).join('') + '</div>';
        return i < 2 ? '<h2>' + cab + '</h2>' + tarjetas
          : '<details class="caja" data-k="ciclo-' + esc(c.id) + '"><summary>' + cab + '<span class="cuenta">' + x.dias.length +
            ' días</span></summary><div class="cuerpo">' + tarjetas + '</div></details>';
      }).join('');
      pintar(h, (meta.t || D.nombre) + (tipo === 'auditoria' ? ' · Auditoría' : ' · Análisis'));
    });
  }
  function tarjetaDiaOtro(y, tipo, D) {
    var r = y.auditoria, aAud = tipo === 'auditoria' && r;
    var lineas = '<div class="liga-linea">' + (D.emoji || '') + ' ' + plural(y.n_partidos, 'partido', 'partidos') +
      (y.n_top5 ? ' · 🏆 <b>' + y.n_top5 + '</b> en el TOP 5' : '') + (y.n_picks ? ' · ' + plural(y.n_picks, 'pick', 'picks') : '') + '</div>';
    if (aAud) {
      lineas += '<div class="liga-linea">✅ <b>' + r.aciertos + ' de ' + r.picks + '</b> · acierto <b>' + pct(r.acierto) + '</b> · prometido ' + pct(r.prometido) + '</div>' +
        '<div class="barra-acierto" aria-hidden="true"><i style="width:' + ((r.acierto || 0) * 100).toFixed(1) + '%"></i></div>';
    } else if (tipo === 'auditoria') {
      lineas += '<div class="liga-linea">⏳ Pendiente de auditar: se audita cuando sus datos quedan firmes</div>';
    } else if (y.nota) {
      lineas += '<div class="liga-linea">💤 ' + esc(y.nota) + '</div>';
    }
    return '<a class="liga" href="#/' + (aAud ? 'auditoria' : 'analisis') + '/' + esc(y.semana) + '/' + esc(y.archivo) + '"><div class="liga-txt">' +
      '<div class="liga-nombre">📅 ' + esc(fLarga(y.fecha)) + '</div>' + lineas + '</div><span class="flecha-der" aria-hidden="true">›</span></a>';
  }
  /* un dia de otro deporte: TOP 5, rankings por mercado y fichas; con aud, su auditoria */
  function vDiaOtro(d, aud) {
    var sems = unicos([d.semana].concat(todosLosPicks(d).map(function (p) { return p.sem; })));
    return Promise.all(sems.map(Esc.cargar)).then(function () {
      REG.__doc = d;
      var dep = d.liga, tipo = aud ? 'auditoria' : 'analisis';
      var h = '<a class="migas" href="#/' + tipo + '?deporte=' + esc(dep) + '">‹ ' + (aud ? 'Auditoría' : 'Análisis') + ' · ' + emojiDe(d) + ' ' + esc(d.nombre) + '</a>';
      h += cabLiga(d, '📅 ' + esc(fLarga(d.fecha)) + (d.ciclo ? ' · ciclo del ' + rango(d.ciclo, masDias(d.ciclo, 6)) : '') +
        (!aud && d.generado ? ' · generado el ' + esc(d.generado) : ''));
      var mapa = null;
      if (aud) {
        if (!d.auditoria) {
          return pintar(h + vacio('⏳', 'Este día todavía no se audita: se hace cuando sus datos quedan firmes, con el resultado real de cada partido.') +
            '<p><a class="boton" href="#/analisis/' + esc(d.semana) + '/' + esc(d.archivo) + '">📊 Ver el análisis</a></p>', d.nombre);
        }
        var r = d.auditoria.resumen;
        mapa = {};
        d.auditoria.picks.forEach(function (p) { mapa[p[0] + '|' + p[1]] = [p[3], p[4]]; });
        h += '<div class="acciones"><a class="boton secundario" href="#/analisis/' + esc(d.semana) + '/' + esc(d.archivo) + '">📊 Ver el análisis</a></div>';
        h += '<h2><span class="emoji">🎯</span>Marcador del día</h2>' +
          marcadorCajas([['✅ Acertados', r.aciertos, 'verde'], ['❌ Fallados', r.fallos, 'rojo'], ['🎯 Acierto real', pct(r.acierto), 'verde'],
            ['📈 Prometido por el motor', pct(r.prometido), 'azul']]) +
          tira({ ok: r.aciertos, ko: r.fallos, nulo: r.anulados + r.no_comprobables }) +
          '<p class="leyenda"><span>📣 ' + r.total + ' picks publicados</span><span>➖ ' + r.anulados + ' anulados</span><span>❓ ' +
          r.no_comprobables + ' no comprobables</span></p>';
      } else if (d.auditoria) {
        h += '<div class="acciones"><a class="boton secundario" href="#/auditoria/' + esc(d.semana) + '/' + esc(d.archivo) + '">🔍 Ver su auditoría</a></div>';
      }
      if (d.nota && !(d.top5 || []).length) { h += '<p class="nota">💤 ' + esc(d.nota) + '</p>'; }
      if (d.liquidacion) { h += '<p class="criterio">📏 ' + esc(d.liquidacion) + '.</p>'; }
      /* en el analisis, primero los partidos y despues los picks (pedido de Javier, 10/10); en la
         auditoria, primero lo que acerto */
      var partidos = '<section id="s-partidos"><h2><span class="emoji">📋</span>Partidos <span class="cuenta">' +
        plural((d.partidos || []).length, 'partido', 'partidos') + '</span></h2>' +
        ((d.partidos || []).length ? (d.partidos || []).slice().sort(function (a, b) { return (a.hora || '99').localeCompare(b.hora || '99'); })
          .map(function (f) { return fichaOtro(f, d); }).join('') : vacio('📭', 'Sin partidos este día.')) +
        '</section>';
      h += '<nav class="indice" aria-label="En este día">' + (aud ? [['s-top5', '🏆 TOP 5'], ['s-mercados', '📊 Mercados'], ['s-partidos', '📋 Partidos']]
        : [['s-partidos', '📋 Partidos'], ['s-escogidos', '✅ Escogidos'], ['s-top5', '🏆 TOP 5'], ['s-mercados', '📊 Mercados']]).map(function (x) {
        return '<a href="#" data-accion="ir" data-id="' + x[0] + '">' + x[1] + '</a>';
      }).join('') + '</nav>';
      if (!aud) { h += partidos + '<section id="s-escogidos" data-archivo="' + esc(d.archivo) + '">' + bloqueEscogidosLiga(d) + '</section>'; }
      h += cuerpoDiaOtro(d, mapa);
      if (aud) { h += partidos; }
      pintar(h, d.nombre + ' ' + fCorta(d.fecha));
    });
  }
  function cuerpoDiaOtro(d, mapaRes) {
    var aud = !!mapaRes;
    var res = function (p) { return aud ? (mapaRes[p.partido + '|' + p.mercado] || ['no_comprobable', '']) : null; };
    var o = function (extra) {
      var r = { doc: d, auditada: !!d.auditoria, escoger: !aud };
      for (var k in extra) { r[k] = extra[k]; }
      return r;
    };
    var top5 = d.top5 || [];
    var h = '<h2><span class="emoji">💎</span>Picks del día</h2>' +
      resumenCaja('s-top5', 'top5', '🏆', 'TOP 5 del día', '', aud && top5.length ? cuentaAud(top5, res) : top5.length, top5.length
        ? '<div class="grid-picks">' + top5.map(function (p) { return tarjeta(p, o({ origen: 'TOP 5', resultado: res(p) })); }).join('') + '</div>'
        : vacio('🏆', d.nota ? esc(d.nota) : 'Ningún pick de este día alcanzó el nivel del TOP 5.'));
    h += '<section id="s-mercados"><h2><span class="emoji">📊</span>Rankings por mercado</h2>' + ((d.rankings || []).length
      ? rankingsHTML(d.rankings, depDe(d) === 'americano' ? GRUPOS_NFL : depDe(d) === 'basquetbol' ? GRUPOS_NBA : null, aud, res, o) : vacio('📊', 'Este día no tiene picks publicados.')) + '</section>';
    return h;
  }
  /* ficha de un partido de hockey: goles esperados, lo que hace cada equipo contra lo que permite el
     rival en cada metrica (la maxima del motor) y la porteria y definicion de cada equipo */
  function fichaOtro(f, d) {
    var k = 'f-' + d.archivo + f.local;
    var cab = '<details class="caja" data-k="' + esc(k) + '"><summary>' + emojiDe(d) + ' ' +
      sumPartido(f, d, f.visita, f.hora ? '🕐 ' + esc(f.hora) : '') + '</summary><div class="cuerpo">';
    if (depDe(d) === 'basquetbol') { return cab + fichaBasquetbol(f) + '</div></details>'; }
    if (f.esperado && !f.sin_proyeccion) { return cab + fichaAmericano(f) + '</div></details>'; }
    if (f.sin_proyeccion || !f.goles_esperados) {
      return cab + '<p class="criterio">💤 Sin proyección: ' + esc(f.sin_proyeccion || 'sin datos suficientes') + '.</p></div></details>';
    }
    var g = f.goles_esperados, c = f.conversion || {}, pp = f.partidos_previos || {};
    var x = function (v) { return v == null ? '—' : num(v, 2); };
    var filas = (f.espejo || []).map(function (e) {
      return '<tr><td>' + esc(e.metrica) + '</td><td class="num">' + x(e.hace_local) + '</td><td class="num">' + x(e.permite_visita) +
        '</td><td class="num">' + x(e.hace_visita) + '</td><td class="num">' + x(e.permite_local) + '</td></tr>';
    }).join('');
    return cab + '<div class="datos"><div><span>🏠 Goles esperados de ' + esc(f.local) + '</span> <b>' + num(g.local, 2) + '</b></div>' +
      '<div><span>✈️ Goles esperados de ' + esc(f.visita) + '</span> <b>' + num(g.visita, 2) + '</b></div>' +
      '<div><span>🥅 Goles esperados del partido</span> <b>' + num((g.local || 0) + (g.visita || 0), 2) + '</b></div>' +
      '<div><span>🧤 Portería (1.00 = liga; más alto, más goles permite)</span> <b>' + x(c.porteria_local) + ' · ' + x(c.porteria_visita) + '</b></div>' +
      '<div><span>🎯 Definición (1.00 = liga; más alto, más convierte)</span> <b>' + x(c.definicion_local) + ' · ' + x(c.definicion_visita) + '</b></div></div>' +
      '<p class="criterio">Lo que <b>hace</b> cada equipo contra lo que <b>permite</b> su rival, en cada métrica (1.00 = media de la liga). ' +
      'Los goles de ' + esc(f.local) + ' salen de lo que hace ' + esc(f.local) + ' y lo que permite ' + esc(f.visita) + ', y al revés. ' +
      'Partidos previos: ' + esc(pp.local) + ' y ' + esc(pp.visita) + '.</p>' +
      '<div class="tabla-scroll"><table><thead><tr><th>Métrica</th><th class="num">Hace ' + esc(f.local) + '</th><th class="num">Permite ' +
      esc(f.visita) + '</th><th class="num">Hace ' + esc(f.visita) + '</th><th class="num">Permite ' + esc(f.local) + '</th></tr></thead><tbody>' +
      filas + '</tbody></table></div></div></details>';
  }

  /* ficha de un partido NFL: lo esperado (puntos, touchdowns, yardas por tierra, probabilidad de ganar),
     las lineas limite de las yardas de cada equipo (la casa pone una por partido) y todas las metricas */
  function fichaAmericano(f) {
    var e = f.esperado, pp = f.partidos_previos || {}, L = f.yardas_lineas || {}, S = f.siglas || {};
    var sL = esc(S.local || f.local), sV = esc(S.visita || f.visita);
    var x = function (v) { return v == null ? '—' : num(v, 2); };
    /* "mas de" llega a 60/70% si la linea de la casa es la limite o menos; "menos de", si es la limite o mas */
    var lin = function (eq, o) {
      o = o || {};
      var parte = function (t, a60, a70, cmp) {
        var r = [];
        if (a60 != null) { r.push('a 60% si la casa pone ' + num(a60, 1) + ' o ' + cmp); }
        if (a70 != null) { r.push('a 70% con ' + num(a70, 1) + ' o ' + cmp); }
        return r.length ? '«' + t + '» llega ' + r.join(', y ') : '';
      };
      var p = [parte('más de', o.mas_hasta_60, o.mas_hasta_70, 'menos'), parte('menos de', o.menos_desde_60, o.menos_desde_70, 'más')].filter(Boolean);
      return '<p class="criterio">📏 <b>Yardas por tierra de ' + esc(eq) + '</b> (la casa pone su propia línea): ' +
        (p.length ? p.join('; ') : 'ninguna línea llega a 60%') + '.</p>';
    };
    var filas = (f.espejo || []).map(function (m) {
      return '<tr><td style="white-space:normal">' + esc(m.metrica) + '</td><td class="num">' + x(m.hace_local) + '</td><td class="num">' + x(m.permite_visita) +
        '</td><td class="num">' + x(m.hace_visita) + '</td><td class="num">' + x(m.permite_local) + '</td></tr>';
    }).join('');
    return '<div class="datos"><div><span>🏠 Puntos esperados de ' + esc(f.local) + '</span> <b>' + num(e.puntos_local, 1) + '</b></div>' +
      '<div><span>✈️ Puntos esperados de ' + esc(f.visita) + '</span> <b>' + num(e.puntos_visita, 1) + '</b></div>' +
      '<div><span>🏈 Touchdowns esperados (' + sL + ' · ' + sV + ')</span> <b>' + num(e.td_local, 2) + ' · ' + num(e.td_visita, 2) + '</b></div>' +
      '<div><span>🏃 Yardas por tierra esperadas (' + sL + ' · ' + sV + ')</span> <b>' + num(e.yardas_local, 0) + ' · ' + num(e.yardas_visita, 0) + '</b></div>' +
      '<div><span>📈 Probabilidad de que gane ' + esc(f.local) + '</span> <b>' + pct(e.p_local) + '</b></div></div>' +
      lin(f.local, L.local) + lin(f.visita, L.visita) +
      (f.campo_neutral ? '<p class="criterio">🌍 Campo neutral: sin ventaja de local.</p>' : '') +
      '<p class="criterio">Lo que <b>hace</b> cada equipo contra lo que <b>permite</b> su rival, en cada métrica (1.00 = media de la liga). ' +
      'Lo de ' + esc(f.local) + ' (' + sL + ') sale de lo que hace ' + sL + ' y lo que permite ' + esc(f.visita) + ' (' + sV + '), y al revés. ' +
      'Partidos previos: ' + esc(pp.local) + ' y ' + esc(pp.visita) + '. Los índices de las justificaciones de los picks combinan ' +
      'estas métricas con los pesos del motor.</p>' +
      '<div class="tabla-scroll"><table><thead><tr><th>Métrica</th><th class="num">' + sL + '<br>hace</th><th class="num">' + sV +
      '<br>permite</th><th class="num">' + sV + '<br>hace</th><th class="num">' + sL + '<br>permite</th></tr></thead><tbody>' +
      filas + '</tbody></table></div>';
  }

  /* ficha de un partido NBA (27/10/2026): lo esperado (puntos del partido, de la 1a mitad y del 1er cuarto de cada
     equipo, ritmo, probabilidad de ganar y de prorroga), los 3 jugadores clave de cada equipo con su estado en el
     reporte oficial de lesiones (aviso J de Javier: no cambia la probabilidad) y todas las metricas */
  function fichaBasquetbol(f) {
    var e = f.esperado, pp = f.partidos_previos || {}, S = f.siglas || {}, C = f.claves || {};
    var sL = esc(S.local || f.local), sV = esc(S.visita || f.visita);
    var x = function (v) { return v == null ? '—' : num(v, 2); };
    var jug = function (eq, l) {
      return '<div><span>⭐ Clave de ' + esc(eq) + '</span> <b>' + ((l || []).length ? l.map(function (j) {
        var est = j.estado ? (j.estado === 'disponible' ? ' ✅' : j.estado === 'probable' ? ' 🟢 probable' :
          ' 🩹 ' + esc(j.estado)) : '';
        return esc(j.nombre) + ' (' + num(j.minutos, 1) + ' min)' + est;
      }).join(' · ') : '—') + '</b></div>';
    };
    var claves = '<div class="datos">' + jug(f.local, C.local) + jug(f.visita, C.visita) + '</div>' +
      (f.aviso ? '<p class="nota-pick">⚠️ ' + esc(f.aviso) + '</p>' : '') +
      (C.reporte ? '<p class="criterio">🩺 ' + esc(C.reporte) + ' El motor no ajusta la probabilidad por jugadores: es un aviso.</p>' : '');
    if (!e || f.sin_proyeccion) {
      return '<p class="criterio">💤 Sin proyección: ' + esc(f.sin_proyeccion || 'sin datos suficientes') + '.</p>' + claves;
    }
    var filas = (f.espejo || []).map(function (m) {
      return '<tr><td style="white-space:normal">' + esc(m.metrica) + '</td><td class="num">' + x(m.hace_local) + '</td><td class="num">' + x(m.permite_visita) +
        '</td><td class="num">' + x(m.hace_visita) + '</td><td class="num">' + x(m.permite_local) + '</td></tr>';
    }).join('');
    return '<div class="datos"><div><span>🏠 Puntos esperados de ' + esc(f.local) + '</span> <b>' + num(e.puntos_local, 1) + '</b></div>' +
      '<div><span>✈️ Puntos esperados de ' + esc(f.visita) + '</span> <b>' + num(e.puntos_visita, 1) + '</b></div>' +
      '<div><span>⏱️ 1ª mitad (' + sL + ' · ' + sV + ')</span> <b>' + num(e.puntos_1m_local, 1) + ' · ' + num(e.puntos_1m_visita, 1) + '</b></div>' +
      '<div><span>⏱️ 1er cuarto (' + sL + ' · ' + sV + ')</span> <b>' + num(e.puntos_q1_local, 1) + ' · ' + num(e.puntos_q1_visita, 1) + '</b></div>' +
      '<div><span>🔁 Ritmo (posesiones por equipo)</span> <b>' + num(e.ritmo, 1) + '</b></div>' +
      '<div><span>📈 Probabilidad de que gane ' + esc(f.local) + '</span> <b>' + pct(e.p_local) + '</b></div>' +
      '<div><span>⏳ Probabilidad de prórroga</span> <b>' + pct(e.p_prorroga) + '</b></div></div>' + claves +
      (f.campo_neutral ? '<p class="criterio">🌍 Campo neutral: sin ventaja de local.</p>' : '') +
      '<p class="criterio">Lo que <b>hace</b> cada equipo contra lo que <b>permite</b> su rival, en cada métrica (1.00 = media de la liga; ' +
      'conteos llevados a 48 minutos). Lo de ' + esc(f.local) + ' (' + sL + ') sale de lo que hace ' + sL + ' y lo que permite ' + esc(f.visita) +
      ' (' + sV + '), y al revés; los partidos recientes pesan más. Partidos previos: ' + esc(pp.local) + ' y ' + esc(pp.visita) +
      '. Los índices de las justificaciones de los picks combinan estas métricas con los pesos del motor.</p>' +
      '<div class="tabla-scroll"><table><thead><tr><th>Métrica</th><th class="num">' + sL + '<br>hace</th><th class="num">' + sV +
      '<br>permite</th><th class="num">' + sV + '<br>hace</th><th class="num">' + sL + '<br>permite</th></tr></thead><tbody>' +
      filas + '</tbody></table></div>';
  }

  /* ================================================================== 3. escogidos */
  /* De hoy en adelante (Javier puede escoger picks de dias posteriores), por dia o por liga. Los de
     dias pasados, con su resultado, van en Resultados. */
  function docDe(rec) {
    return { archivo: rec.archivo, liga: rec.liga, nombre: rec.nombre, pais: rec.pais, bandera: rec.bandera,
      jornada: rec.jornada, semana: rec.sa, deporte: rec.deporte || (esFutbol(rec) ? undefined : depDe(rec)), emoji: rec.emoji,
      fecha: rec.jornada == null ? rec.fecha : undefined };
  }
  function resultadoDe(rec, mapas) {
    var r = (mapas[rec.sa] || {})[rec.archivo];
    if (!r) { return null; }
    return r[rec.partido + '|' + rec.mercado] || ['no_comprobable', 'sin resultado en la auditoría'];
  }
  function cargarResultados(picks) {
    var sas = unicos(picks.map(function (p) { return p.sa; }));
    return Promise.all(sas.map(resultados)).then(function (rs) {
      var m = {};
      sas.forEach(function (s, i) { m[s] = rs[i] || {}; });
      return m;
    });
  }
  /* renglones agrupados por el dia en que se juegan */
  function porDiaLista(picks, pintarUno) {
    var grupos = {}, orden = [];
    picks.forEach(function (p) {
      var k = p.fecha || '';
      if (!(k in grupos)) { grupos[k] = []; orden.push(k); }
      grupos[k].push(p);
    });
    orden.sort(function (a, b) { return (a || '9').localeCompare(b || '9'); });
    return orden.map(function (k) {
      var etq = k ? etqDia(k) : '';
      return '<div class="dia-cab">🗓️ ' + (k ? fLarga(k) : 'Fecha por confirmar') + (etq ? ' <span class="etq">' + etq + '</span>' : '') +
        '<span class="cuenta">' + plural(grupos[k].length, 'pick', 'picks') + '</span></div>' +
        '<ul class="lista tabla-caja">' + grupos[k].map(pintarUno).join('') + '</ul>';
    }).join('');
  }
  function vEscogidos(partes, q) {
    var h0 = hoy();
    var vista = q.get('vista') === 'liga' ? 'liga' : 'dia', filtro = q.get('liga') || '', quien = q.get('por') || '';
    return Promise.all([indice(), Esc.rango(h0, masDias(h0, 21))]).then(function (x) {
      var idx = x[0], todos = x[1];
      var picks = todos.filter(function (p) { return (!filtro || p.liga === filtro) && (!quien || p.por.indexOf(quien) >= 0); });
      var qs = function (v, l, s) {
        var a = [];
        if (v === 'liga') { a.push('vista=liga'); }
        if (l) { a.push('liga=' + encodeURIComponent(l)); }
        if (s) { a.push('por=' + encodeURIComponent(s)); }
        return '#/escogidos' + (a.length ? '?' + a.join('&') : '');
      };
      var h = cabecera('escogidos');
      var ligasSem = unicos(todos.map(function (p) { return p.liga; }));
      var gente = unicos(Object.keys(COLORES).concat([].concat.apply([], todos.map(function (p) { return p.por; }))));
      var info = {};
      todos.forEach(function (p) { info[p.liga] = p; });
      h += '<div class="herramientas"><p class="sub">✅ <b>' + picks.length + '</b> ' + (picks.length === 1 ? 'pick escogido' : 'picks escogidos') +
        (filtro && info[filtro] ? ' de ' + bandera(info[filtro].bandera) + ' ' + esc(info[filtro].nombre) : '') + (quien ? ' por ' + persona(quien) : '') +
        ' · ' + plural(unicos(picks.map(function (p) { return p.fecha; })).length, 'día', 'días') + '</p>' +
        '<div class="conmutador" role="group" aria-label="Ordenar">' +
        '<a href="' + qs('dia', filtro, quien) + '" aria-current="' + (vista === 'dia') + '">🗓️ Día</a>' +
        '<a href="' + qs('liga', filtro, quien) + '" aria-current="' + (vista === 'liga') + '">⚽ Liga</a></div></div>';
      if (todos.length) {
        h += '<nav class="filtros" aria-label="Filtrar por seleccionador"><a href="' + qs(vista, filtro, '') + '" aria-current="' + !quien + '">👥 Todos</a>' +
          gente.map(function (n) {
            var k = todos.filter(function (p) { return p.por.indexOf(n) >= 0; }).length;
            return '<a href="' + qs(vista, filtro, n) + '" aria-current="' + (quien === n) + '">' + persona(n) + ' <b>' + k + '</b></a>';
          }).join('') + '</nav>';
      }
      if (ligasSem.length > 1 || filtro) {
        h += '<nav class="filtros" aria-label="Filtrar por liga"><a href="' + qs(vista, '', quien) + '" aria-current="' + !filtro + '">⚽ Todas</a>' +
          ligasSem.map(function (l) {
            var n = todos.filter(function (p) { return p.liga === l; }).length;
            return '<a href="' + qs(vista, l, quien) + '" aria-current="' + (filtro === l) + '">' + bandera(info[l].bandera) + ' ' + esc(info[l].nombre) + ' <b>' + n + '</b></a>';
          }).join('') + '</nav>';
      }
      if (Editor.activo) {
        h += '<p class="criterio linea-editor">✏️ Quita los tuyos tocando ✓ · <a href="#/green"><b>🟢 Armar la selección del día ›</b></a></p>';
      }
      /* los de hoy que ya empezaron, al final y plegados (sugerencia aprobada por Javier, 10/10) */
      var emp = picks.filter(empezado), todosE = picks;
      picks = picks.filter(function (p) { return !empezado(p); });
      if (!todosE.length) {
        h += vacio('📭', filtro || quien ? 'No hay picks escogidos de hoy en adelante con ese filtro.' : 'Todavía no hay picks escogidos de hoy en adelante.');
      } else if (!picks.length) {
        h += '<p class="criterio">Los escogidos de hoy ya empezaron; los de los próximos días saldrán aquí.</p>';
      } else if (vista === 'dia') {
        h += porDiaLista(picks, function (p) { return renglonEscogido(p, null, {}); });
      } else {
        var orden = {};
        idx.ligas.forEach(function (L, i) { orden[L.id] = i; });
        var grupos = unicos(picks.map(function (p) { return p.archivo; }));
        grupos.sort(function (a, b) {
          var pa = picks.filter(function (p) { return p.archivo === a; })[0], pb = picks.filter(function (p) { return p.archivo === b; })[0];
          return ((orden[pa.liga] || 0) - (orden[pb.liga] || 0)) || ((pa.jornada || 0) - (pb.jornada || 0)) ||
            (pa.fecha || '').localeCompare(pb.fecha || '');
        });
        h += grupos.map(function (a) {
          var lista = picks.filter(function (p) { return p.archivo === a; }), r = lista[0];
          return '<h2 class="pais">' + bandera(r.bandera) + emojiDe(docDe(r)) + ' ' + esc(r.nombre) + ' <span class="cuenta">' +
            (r.jornada != null ? 'Jornada ' + esc(r.jornada) : esc(fLarga(r.fecha))) + ' · ' +
            plural(lista.length, 'pick', 'picks') + '</span></h2><ul class="lista tabla-caja">' +
            lista.map(function (p) { return renglonEscogido(p, null, { conDia: true }); }).join('') + '</ul>';
        }).join('');
      }
      h += plegadoEmpezados('esc-empezados', emp, '<ul class="lista">' + emp.map(function (p) { return renglonEscogido(p, null, { conDia: true }); }).join('') +
        '</ul>', function (p) { return p.archivo + '|' + p.partido; });
      h += '<p class="criterio mas-abajo">📜 Los de días pasados, con su resultado, están en <a href="#/resultados">🏅 Resultados</a>.</p>';
      pintar(h, 'Picks escogidos');
    });
  }

  /* ================================================================== 4. resultados (lunes a domingo) */
  function nuevoConteo() { return { ok: 0, ko: 0, nulo: 0, pend: 0, aud: 0, suma: 0, total: 0 }; }
  function sumarPick(n, p, mapas) {
    var r = resultadoDe(p, mapas), e = r ? r[0] : 'pendiente';
    n.total++;
    if (e === 'acierto') { n.ok++; n.suma += p.p || 0; } else if (e === 'fallo') { n.ko++; n.suma += p.p || 0; }
    else if (e === 'pendiente') { n.pend++; if (jugado(p)) { n.aud++; } } else { n.nulo++; }
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
  function porSeleccionador(grupos) {
    var t = {};
    Object.keys(COLORES).forEach(function (n) { t[n] = nuevoConteo(); });
    grupos.forEach(function (w) {
      w.picks.forEach(function (p) { p.por.forEach(function (n) { sumarPick(t[n] = t[n] || nuevoConteo(), p, w.mapas); }); });
    });
    Object.keys(t).forEach(function (n) { cerrarConteo(t[n]); });
    return t;
  }
  /* siempre picksin, maki y diego, en ese orden, vaya como vaya cada uno (pedido de Javier, 10/10);
     alguien nuevo va despues, por nombre */
  var ORDEN_SEL = ['picksin', 'maki', 'diego'];
  function ordenTabla(t) {
    var i = function (n) { var k = ORDEN_SEL.indexOf(n); return k < 0 ? 99 : k; };
    return Object.keys(t).sort(function (a, b) { return (i(a) - i(b)) || a.localeCompare(b); });
  }
  /* lugar por balance (buenas menos malas; empate: mas buenas): 0 = primero; empatados, mismo lugar */
  function lugarSel(t, n) {
    return Object.keys(t).filter(function (m) {
      return t[m].comp && (t[m].balance > t[n].balance || (t[m].balance === t[n].balance && t[m].ok > t[n].ok));
    }).length;
  }
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
  /* los picks por semana de lunes a domingo: [{s: lunes, picks}] de la mas nueva a la mas vieja */
  function porLunes(picks) {
    var g = {};
    picks.forEach(function (p) { if (p.fecha) { (g[lunesDe(p.fecha)] = g[lunesDe(p.fecha)] || []).push(p); } });
    return Object.keys(g).sort().reverse().map(function (s) { return { s: s, picks: g[s] }; });
  }
  function selectorLunes(sem, seccion, min, max) {
    var lista = [];
    for (var s = max; s >= min; s = masDias(s, -7)) { lista.push(s); }
    if (lista.indexOf(sem) < 0) { lista.push(sem); lista.sort().reverse(); }
    var i = lista.indexOf(sem), nueva = lista[i - 1], vieja = lista[i + 1], etq = etiquetaLunes(sem);
    var flecha = function (x, t, l) {
      return '<button type="button" class="flecha" data-accion="semana" data-seccion="' + seccion + '" data-sem="' + (x || '') + '"' +
        (x ? '' : ' disabled') + ' aria-label="' + l + '">' + t + '</button>';
    };
    return '<div class="semana-sel">' + flecha(vieja, '‹', 'Semana anterior') +
      '<label class="semana-caja"><small>Semana · lun a dom</small><b>' + rangoSemana(sem) +
      (etq ? '<span class="etq-semana">' + etq + '</span>' : '') + '</b>' +
      '<select data-accion="semana-lista" data-seccion="' + seccion + '" aria-label="Elegir semana">' +
      lista.map(function (x) {
        var e = etiquetaLunes(x);
        return '<option value="' + x + '"' + (x === sem ? ' selected' : '') + '>' + rangoSemana(x) + (e ? ' · ' + e : '') + '</option>';
      }).join('') + '</select></label>' + flecha(nueva, '›', 'Semana siguiente') + '</div>';
  }
  /* la auditoria del top de tops (pedido de Javier, 07/10): cuentas y resultados salen de
     top_de_tops.json (publicar_sitio.py); aqui solo se muestran */
  function renglonTop(r, lugar, cual) {
    var res = r.estado ? [r.estado, r.detalle || ''] : [jugado(r) ? 'por_auditar' : 'pendiente', ''];
    var sub = '<span class="chip top-lugar' + (cual ? ' ' + cual : '') + '">' + (cual ? LISTAS[cual].e : '⭐') + ' ' + lugar + '</span> <span class="cuando">🕐 ' +
      esc(r.hora || '—') + '</span> · ' + bandera(r.bandera) + ' <a href="#/analisis/' + esc(r.semana) + '/' + esc(r.archivo) + '">' + esc(r.nombre) +
      '</a> · ' + esc(r.partido) + ' ' + marcasTop(r, cual === 'valor');
    return renglon(r, { doc: { archivo: r.archivo }, sub: sub, resultado: res, auditada: !!r.estado, escoger: false, sinSello: true });
  }
  /* las listas Seguros y Valor en Resultados (solo modo editor, 20/10/2026): cuentas de listas_valor.json */
  function bloqueLista(listas, k, sem) {
    var L = listas[k] || {}, c = L.semanas && L.semanas[sem];
    var h = '<h2 id="s-' + k + '"><span class="emoji">' + LISTAS[k].e + '</span>' + LISTAS[k].t + ' <span class="cuenta">solo modo editor · ' +
      (k === 'valor' ? 'se mide por la ganancia' : 'seguros con momio') + '</span></h2>';
    if (!c) {
      return h + '<p class="criterio">' + (listas.desde && masDias(sem, 6) < listas.desde ? 'La lista cuenta desde el ' + fLarga(listas.desde) + '.'
        : 'No hubo picks en esta lista esta semana.') + '</p>';
    }
    h += marcadorCajas([['✅ Acertados', c.aciertos + ' de ' + c.comprobables, 'verde'], ['🎯 Acierto real', pct(c.acierto), 'verde'],
      ['🤝 Prometido (combinada)', pct(c.prometido), 'azul'], ['⏳ Sin resultado', c.sin_resultado, c.sin_resultado ? 'azul' : '']]) +
      (c.con_momio ? marcadorCajas([['💰 Ganancia (a 1 unidad)', (c.ganancia > 0 ? '+' : '') + num(c.ganancia, 2) + ' u', c.ganancia >= 0 ? 'verde' : ''],
        ['📊 Por pick', (c.ganancia_por_pick > 0 ? '+' : '') + num(c.ganancia_por_pick, 3) + ' u', c.ganancia_por_pick >= 0 ? 'verde' : '']]) : '') +
      tira({ ok: c.aciertos, ko: c.fallos, nulo: c.anulados, pend: c.sin_resultado });
    var dias = Object.keys(L.dias || {}).filter(function (f) { return f >= sem && f <= masDias(sem, 6); }).sort();
    h += '<details class="caja" data-k="' + k + '-dias"><summary><span class="emoji">🗓️</span>Por día <span class="cuenta">' +
      plural(c.picks, 'pick', 'picks') + '</span></summary><div class="cuerpo">' + dias.map(function (f) {
        var rs = (L.resumen || {})[f] || {};
        return '<div class="dia-cab">🗓️ ' + fLarga(f) + '<span class="cuenta">' + (rs.comprobables ? '✅ ' + rs.aciertos + ' · ❌ ' + rs.fallos
          : plural(L.dias[f].length, 'pick', 'picks')) + '</span></div><ul class="lista">' +
          L.dias[f].map(function (r, i) { return renglonTop(r, i + 1, k); }).join('') + '</ul>';
      }).join('') + '</div></details>';
    var a = L.acumulado;
    if (a && a.comprobables) {
      h += '<p class="criterio">Desde el ' + fCorta(listas.desde) + ': ' + a.aciertos + ' de ' + a.comprobables + ' (' + pct(a.acierto) +
        '; la combinada prometía ' + pct(a.prometido) + ')' + (a.ganancia != null ? ', ' + (a.ganancia > 0 ? '+' : '') + num(a.ganancia, 2) +
        ' u en ' + plural(a.con_momio, 'pick', 'picks') : '') + '.</p>';
    }
    return h;
  }
  function bloqueTop(top, sem) {
    var h = '<h2 id="s-top"><span class="emoji">⭐</span>Top de tops <span class="cuenta">los más seguros de cada día</span></h2>';
    var c = top && top.semanas && top.semanas[sem];
    if (!c) {
      return h + '<p class="criterio">' + (top && top.desde && masDias(sem, 6) < top.desde
        ? 'Los resultados del top de tops cuentan desde el ' + fLarga(top.desde) + '.' : 'No hubo top de tops esta semana.') + '</p>';
    }
    h += marcadorCajas([['✅ Acertados', c.aciertos + ' de ' + c.comprobables, 'verde'], ['🎯 Acierto real', pct(c.acierto), 'verde'],
      ['📈 Prometido (media)', pct(c.prometido), 'azul'], ['⏳ Sin resultado', c.sin_resultado, c.sin_resultado ? 'azul' : '']]) +
      (Editor.activo && c.con_momio ? marcadorCajas([['💲 Con momio de Playdoit', c.con_momio, 'azul'],
        ['💰 Ganancia (a 1 unidad)', (c.ganancia > 0 ? '+' : '') + num(c.ganancia, 2) + ' u', c.ganancia >= 0 ? 'verde' : ''],
        ['📊 Por pick', (c.ganancia_por_pick > 0 ? '+' : '') + num(c.ganancia_por_pick, 3) + ' u', c.ganancia_por_pick >= 0 ? 'verde' : '']]) : '') +
      tira({ ok: c.aciertos, ko: c.fallos, nulo: c.anulados, pend: c.sin_resultado });
    var dias = Object.keys(top.dias || {}).filter(function (f) { return f >= sem && f <= masDias(sem, 6) && (!top.desde || f >= top.desde); }).sort();
    h += '<details class="caja" data-k="top-dias" open><summary><span class="emoji">🗓️</span>Por día <span class="cuenta">' +
      plural(c.picks, 'pick', 'picks') + '</span></summary><div class="cuerpo">' + dias.map(function (f) {
        var rs = (top.resumen || {})[f] || {};
        return '<div class="dia-cab">🗓️ ' + fLarga(f) + '<span class="cuenta">' + (rs.comprobables ? '✅ ' + rs.aciertos + ' · ❌ ' + rs.fallos
          : plural(top.dias[f].length, 'pick', 'picks')) + '</span></div><ul class="lista">' +
          top.dias[f].map(function (r, i) { return renglonTop(r, i + 1); }).join('') + '</ul>';
      }).join('') + '</div></details>';
    var ls = Object.keys(top.semanas).sort().reverse();
    var fila = function (x) {
      return '<td class="num">' + x.picks + '</td><td class="num">' + x.aciertos + '</td><td class="num">' + x.fallos + '</td><td class="num">' +
        x.anulados + '</td><td class="num">' + x.sin_resultado + '</td><td class="num"><b>' + pct(x.acierto) + '</b></td><td class="num">' + pct(x.prometido) + '</td>';
    };
    h += '<details class="caja" data-k="top-semanas"><summary><span class="emoji">📈</span>Todas las semanas <span class="cuenta">' + ls.length +
      '</span></summary><div class="cuerpo"><div class="tabla-scroll"><table><thead><tr><th>Semana</th><th class="num">Picks</th><th class="num">✅</th>' +
      '<th class="num">❌</th><th class="num">➖</th><th class="num">⏳</th><th class="num">Acierto</th><th class="num">Prometido</th></tr></thead><tbody>' +
      ls.map(function (l) { return '<tr><td><a href="#/resultados/' + l + '">' + rangoSemana(l) + '</a></td>' + fila(top.semanas[l]) + '</tr>'; }).join('') +
      (top.acumulado ? '<tr class="total"><td>Total' + (top.desde ? ' desde el ' + fCorta(top.desde) : '') + '</td>' + fila(top.acumulado) + '</tr>' : '') +
      '</tbody></table></div></div></details>' +
      '<p class="criterio">Se audita lo que estaba en el top antes de cada partido: cuando un partido empieza, su pick ya no entra ni sale. ' +
      'Cada resultado es el de la auditoría de su liga; los anulados y no comprobables no cuentan.</p>';
    return h;
  }
  function vResultados(partes, q) {
    if (q && q.get('ver') === 'ranking') { location.replace('#/ranking'); return Promise.resolve(); }
    var sem = /^\d{4}-\d{2}-\d{2}$/.test(partes[0] || '') ? lunesDe(partes[0]) : lunesDe(hoy());
    return Promise.all([cargarTodo(), topDeTops().catch(function () { return null; }),
      Editor.activo ? listasValor().catch(function () { return null; }) : null]).then(function (x) {
      var T = x[0], top = x[1], listas = x[2];
      var ult = T.picks.map(function (p) { return p.fecha || ''; }).sort().pop() || hoy();
      var min = lunesDe(CUENTAS_DESDE), max = lunesDe(ult > hoy() ? ult : hoy());
      var mapas = T.mapas, picks = T.picks.filter(function (p) { return p.fecha && p.fecha >= sem && p.fecha <= masDias(sem, 6); });
      var n = contar(picks, mapas);
      var h = cabeceraRes('semana') + selectorLunes(sem, 'resultados', min, max);
      if (!picks.length) {
        h += vacio('📭', 'No hubo picks escogidos esta semana.');
      } else {
        h += marcadorCajas([['✅ Acertados', n.ok + ' de ' + n.comp, 'verde'], ['🎯 Acierto real', pct(n.acierto), 'verde'],
          ['📈 Prometido (media)', pct(n.prometido), 'azul'], ['⏳ Sin resultado', n.pend, n.pend ? 'azul' : '']]) +
          tira(n) + '<p class="leyenda"><span>✅ ' + plural(n.ok, 'acertado', 'acertados') + '</span><span>❌ ' +
          plural(n.ko, 'fallado', 'fallados') + '</span><span>➖ ' + plural(n.nulo, 'anulado o no comprobable', 'anulados o no comprobables') +
          '</span><span>⏳ ' + (n.pend - n.aud) + ' por jugarse</span><span>🕓 ' + n.aud + ' ya jugados, por auditar</span></p>';
        h += '<h2><span class="emoji">🗓️</span>Por día</h2>' + porDiaLista(picks.slice().sort(ordenPicks), function (p) {
          return renglonEscogido(p, mapas, { conEstado: true, escoger: false });
        });
        var ligas = unicos(picks.map(function (p) { return p.liga; }));
        h += '<h2><span class="emoji">⚽</span>Por liga</h2><div class="tabla-caja tabla-scroll"><table><thead><tr><th>Liga</th><th class="num">Escogidos</th>' +
          '<th class="num">✅</th><th class="num">❌</th><th class="num">➖</th><th class="num">⏳</th><th class="num">Acierto</th></tr></thead><tbody>' +
          ligas.map(function (l) {
            var sub = picks.filter(function (p) { return p.liga === l; }), c = contar(sub, mapas);
            return '<tr><td>' + bandera(sub[0].bandera) + ' ' + emojiDe(docDe(sub[0])) + ' ' + esc(sub[0].nombre) + '</td><td class="num">' + sub.length + '</td><td class="num">' + c.ok +
              '</td><td class="num">' + c.ko + '</td><td class="num">' + c.nulo + '</td><td class="num">' + c.pend + '</td><td class="num"><b>' + pct(c.acierto) + '</b></td></tr>';
          }).join('') + '</tbody></table></div>';
      }
      h += bloqueTop(top, sem);
      if (Editor.activo && listas) { h += bloqueLista(listas, 'seguros', sem) + bloqueLista(listas, 'valor', sem); }
      h += '<h2><span class="emoji">📈</span>Historial de la selección <span class="cuenta">lunes a domingo</span></h2>' + historialSemanas(T);
      if (picks.length) {                  // la tabla de seleccionadores, hasta el final (pedido de Javier)
        var t = porSeleccionador([{ picks: picks, mapas: mapas }]);
        h += '<h2><span class="emoji">👥</span>Por seleccionador <span class="cuenta">esta semana</span></h2>' + tablaSeleccionadores(t, ordenTabla(t)) +
          '<p class="criterio">Un pick escogido por dos personas cuenta para las dos. <a href="#/ranking">Ver el ranking de todas las semanas ›</a></p>';
      }
      pintar(h, 'Resultados');
    });
  }
  function vRanking() {
    return cargarTodo().then(function (T) { pintar(cabeceraRes('ranking') + rankingHTML(T), 'Ranking'); });
  }
  function historialSemanas(T) {
    var semanas = porLunes(T.picks);
    if (!semanas.length) { return '<p class="criterio">Todavía no hay semanas con picks escogidos.</p>'; }
    var fila = function (c) {
      return '<td class="num">' + c.total + '</td><td class="num">' + c.ok + '</td><td class="num">' + c.ko + '</td><td class="num">' + c.nulo +
        '</td><td class="num">' + c.pend + '</td><td class="num"><b>' + pct(c.acierto) + '</b></td><td class="num">' + pct(c.prometido) + '</td>';
    };
    return '<details class="caja" data-k="historial"><summary>Todas las semanas <span class="cuenta">' + semanas.length + '</span></summary><div class="cuerpo">' +
      '<div class="tabla-scroll"><table><thead><tr><th>Semana</th><th class="num">Escogidos</th><th class="num">✅</th><th class="num">❌</th><th class="num">➖</th>' +
      '<th class="num">⏳</th><th class="num">Acierto</th><th class="num">Prometido</th></tr></thead><tbody>' + semanas.map(function (w) {
        return '<tr><td><a href="#/resultados/' + w.s + '">' + rangoSemana(w.s) + '</a> ' + personas(unicos([].concat.apply([], w.picks.map(function (p) { return p.por; })))) +
          '</td>' + fila(contar(w.picks, T.mapas)) + '</tr>';
      }).join('') + '<tr class="total"><td>Total</td>' + fila(contar(T.picks, T.mapas)) + '</tr></tbody></table></div></div></details>';
  }

  /* ================================================================== 5. ranking de seleccionadores
     (va dentro de Resultados: casi siempre escoge picksin; #/seleccionadores lleva ahi) */
  function vSeleccionadores() { location.replace('#/ranking'); return Promise.resolve(); }
  function rankingHTML(T) {
    var t = porSeleccionador([T]), orden = ordenTabla(t), medallas = ['🥇', '🥈', '🥉'];
    var h = '<div class="podio">' + orden.map(function (n) {
      var c = t[n];
      return '<article class="tarjeta-sel" style="--c:' + colorDe(n) + '">' +
        '<div class="sel-cab"><span class="medalla" aria-hidden="true">' + (c.comp ? (medallas[lugarSel(t, n)] || '🎖️') : '🆕') + '</span>' + persona(n) +
        (n === 'picksin' ? '<span class="chip neutro">principal</span>' : '') + '</div>' +
        '<div class="sel-record"><span class="buenas">✅ ' + c.ok + '<small>buenas</small></span><span class="malas">❌ ' + c.ko + '<small>malas</small></span>' +
        '<span class="balance">' + (c.balance > 0 ? '+' : '') + c.balance + '<small>balance</small></span></div>' +
        tira(c) +
        '<p class="sel-datos">🎯 Acierto <b>' + pct(c.acierto) + '</b> · 📈 prometido ' + pct(c.prometido) + '</p>' +
        '<p class="sel-datos">' + plural(c.total, 'pick escogido', 'picks escogidos') + (c.pend ? ' · ⏳ ' + c.pend + ' sin resultado' : '') +
        (c.nulo ? ' · ➖ ' + c.nulo + ' anulados' : '') + '</p>' +
        '<a class="migas" href="#/escogidos?por=' + encodeURIComponent(n) + '">Ver sus picks de hoy en adelante ›</a></article>';
    }).join('') + '</div>';
    h += '<p class="criterio">Siempre en el mismo orden; la medalla dice quién va arriba por balance (buenas menos malas). ' +
      'Los anulados, los no comprobables y los que no tienen resultado no cuentan; ' +
      'si dos escogen el mismo pick, cuenta para los dos.</p>';
    var semanas = porLunes(T.picks);
    h += '<details class="caja" data-k="rk-semanas"><summary><span class="emoji">📅</span>Semana a semana <span class="cuenta">lunes a domingo</span></summary><div class="cuerpo">' + (semanas.length
      ? '<div class="tabla-scroll"><table><thead><tr><th>Semana</th>' + orden.map(function (n) { return '<th class="num">' + persona(n) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + semanas.map(function (w) {
          var tw = porSeleccionador([{ picks: w.picks, mapas: T.mapas }]);
          return '<tr><td><a href="#/resultados/' + w.s + '">' + rangoSemana(w.s) + '</a></td>' + orden.map(function (n) {
            var c = tw[n];
            return '<td class="num">' + (c && c.total ? '<b>' + c.ok + '</b>–' + c.ko + (c.pend ? ' <small>⏳' + c.pend + '</small>' : '') : '—') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '<tr class="total"><td>Total</td>' + orden.map(function (n) { return '<td class="num">' + t[n].ok + '–' + t[n].ko + '</td>'; }).join('') +
        '</tr></tbody></table></div><p class="criterio">Buenas–malas de cada semana.</p>'
      : '<p class="criterio">Todavía no hay picks escogidos.</p>') + '</div></details>';
    h += '<details class="caja" data-k="rk-detalle"><summary><span class="emoji">📋</span>Detalle de todas las semanas</summary><div class="cuerpo">' +
      tablaSeleccionadores(t, orden) + '</div></details>';
    return h;
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
      nivel: NIVELES[d.nivel] ? d.nivel : 'fuerte', dia: d.dia == null ? null : d.dia, guardado: d.guardado || null, ids: d.ids || null,
      hechos: d.hechos || null };
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
  /* "09/10 18:04" en hora del centro de Mexico (la hora de una lectura de momios) */
  function horaMx(iso) {
    try {
      return new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
    } catch (e) { return String(iso || ''); }
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
  var DIAS_GZ = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
  var NIVELES_GZ = ['fuerte', 'superfuerte', 'ultrafuerte'];
  function recursosGZ() {
    var cargaLetra = function (f, t) { return document.fonts && document.fonts.load ? document.fonts.load(f, t).catch(function () { return null; }) : null; };
    return Promise.all([imagen('assets/logo.webp'), imagen('assets/gz-avatar.webp'), imagen('assets/gz-logo-greenzone.webp'),
      cargaLetra('40px "Banderas Picksin"', '🇲🇽'), cargaLetra('40px "Bebas Picksin"', 'ABC'), cargaLetra('bold 40px "Courier Picksin"', 'NOES')]
      .concat(DIAS_GZ.map(function (x) { return imagen('assets/gz-dia-' + x + '.webp'); }))
      .concat(NIVELES_GZ.map(function (x) { return imagen('assets/gz-nivel-' + x + '.webp'); }))).then(function (r) {
      var A = { logo: r[0], avatar: r[1], greenzone: r[2], dias: {}, niveles: {} };
      DIAS_GZ.forEach(function (x, i) { A.dias[x] = r[6 + i]; });
      NIVELES_GZ.forEach(function (x, i) { A.niveles[x] = r[13 + i]; });
      return A;
    });
  }
  /* la primera bandera (los de la NHL traen dos: Estados Unidos y Canada) */
  function primeraBandera(b) {
    var cp = Array.from(String(b || ''));
    if (!cp.length) { return ''; }
    if (cp[0] === '\u{1F3F4}') { var k = cp.indexOf('\u{E007F}'); return cp.slice(0, k > 0 ? k + 1 : 1).join(''); }
    return /[\u{1F1E6}-\u{1F1FF}]/u.test(cp[0]) ? cp.slice(0, 2).join('') : cp[0];
  }
  /* lo que la imagen necesita, sacado de la jugada que se esta armando */
  function datosGZ() {
    var P = GZ.patas, calc = calcularGZ(), dia = diaGZ(P), niv = NIVELES[GZ.nivel] || NIVELES.fuerte;
    var sinAcento = function (t) { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); };
    var clave = !dia.varios && P.length && P[0].pick.fecha ? sinAcento(DIAS[fecha(P[0].pick.fecha).getUTCDay()]) : null;
    return {
      dia: { clave: clave, titulo: dia.titulo, fecha: dia.sub },
      picks: P.map(function (x, i) {
        var p = x.pick, eq = String(p.partido || '').split(' vs ');
        var hora = dia.varios && p.fecha ? DIAS_C[fecha(p.fecha).getUTCDay()].toUpperCase() + ' ' + (p.hora || '') : (p.hora || '');
        return { bandera: primeraBandera(p.bandera), deporte: deporteDe(p)[0], dep: p.deporte || 'futbol', liga: nombreDe(p), mercado: p.mercado,
          local: p.local || eq[0] || '', visita: p.visitante || eq[1] || '', hora: hora.trim(), momio: calc.decs[i] ? americano(calc.decs[i]) : '' };
      }),
      momio: calc.tipo !== 'directas' && calc.dec ? americano(calc.dec) : null,
      apuesta: calc.apuesta ? dinero(calc.apuesta) : null, total: calc.pago ? dinero(calc.pago) : null,
      nivel: { clave: GZ.nivel, e: niv.e, n: niv.n }
    };
  }
  function letra(c, peso, tam, estilo) {                    // estilo: 'italic' (opcional)
    c.font = (estilo ? estilo + ' ' : '') + peso + ' ' + tam + 'px ' + (document.documentElement.classList.contains('banderas-fuente') ? '"Banderas Picksin", ' : '') + LETRA;
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
  /* La imagen de la Seleccion del dia: copia fiel de la imagen final de Javier (28/10/2026): fondo liso con la
     frase "NO ES SUERTE ES CIENCIA" muy tenue que sigue dentro del dia, el logo, las selecciones en un cuadro blanco
     (raya verde, mercado, momio en su caja azul, equipos con nombre corto, liga, hora, bandera y deporte), la caja
     del momio final, la apuesta y el total, la franja negra del nivel, su avatar y su logo de Green Zone. Letras
     Bebas Neue y Courier Prime Bold (SIL OFL). Va en su propio modulo para no chocar con los nombres de la pagina. */
  var GZ3 = (function () {
  var EMOJIS = '"Banderas Picksin", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, ' +
    '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';
  /* la letra de Javier: Bebas Neue (licencia SIL OFL), servida con la pagina como "Bebas Picksin" */
  var LETRA = '"Bebas Picksin", "Bebas Neue", ' + EMOJIS;
  var W = 1080;
  /* colores medidos en su imagen */
  var C = { fondo: '#efefef', fondoFrase: '#e5e5e5', fondoFraseOscura: '#dfdfdf', dia: '#999999', frase: '#7d7d7d', fraseOscura: '#5e5e5e', encabezado: '#949494', raya: '#898989',
    texto: '#000000', verde: '#11911d', barra: '#0b9b11', azul: ['#0c8ee4', '#006bd6'], separa: '#efefef', equipo: '#828282',
    suave: '#c7c7c7', etiqueta: '#666666', divide: '#a0a0a0', total: '#0e9215', caja: '#efefef' };
  /* las barras del nivel (Javier, 28/10): fuerte naranja, superfuerte rojo, ultrafuerte los dos */
  var NARANJA = '#ff8000', ROJO = '#ff0000', APAGADA = '#333333';

  function fuente(c, tam) { c.font = 'normal ' + tam + 'px ' + LETRA; }          // Bebas solo tiene un grueso
  function ancho(c, t, tam, k) { fuente(c, tam); return c.measureText(t).width * (k || 1); }
  function T(c, t, x, y, tam, color, alin, k) {          // k: estirado a lo ancho
    k = k || 1;
    var w = ancho(c, t, tam, k), x0 = alin === 'center' ? x - w / 2 : alin === 'right' ? x - w : x;
    c.save(); c.translate(x0, y); c.scale(k, 1); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = color; c.fillText(t, 0, 0); c.restore();
    return w;
  }
  function emoji(c, e, x, y, tam) {
    c.font = tam + 'px ' + EMOJIS; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e, x, y); c.textBaseline = 'alphabetic';
  }
  function anchoEmoji(c, e, tam) { c.font = tam + 'px ' + EMOJIS; return c.measureText(e).width; }
  function redondo(c, x, y, w, h, r) {           // r: un numero o [arriba-izq, arriba-der, abajo-der, abajo-izq]
    if (typeof r === 'number') { r = [r, r, r, r]; }
    c.beginPath(); c.moveTo(x + r[0], y); c.lineTo(x + w - r[1], y); c.arcTo(x + w, y, x + w, y + r[1], r[1]);
    c.lineTo(x + w, y + h - r[2]); c.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]); c.lineTo(x + r[3], y + h);
    c.arcTo(x, y + h, x, y + h - r[3], r[3]); c.lineTo(x, y + r[0]); c.arcTo(x, y, x + r[0], y, r[0]); c.closePath();
  }

  /* la frase "NO ES SUERTE ES CIENCIA": en su imagen va en Courier Prime Bold (licencia SIL OFL, servida como
     "Courier Picksin"), angosta y girada, con "ES CIENCIA" mas oscuro. Las filas salen de un mismo punto (cx, cy),
     asi la del fondo y la de adentro del dia caen en las mismas lineas */
  var FRASE = '"Courier Picksin", "Courier Prime", "Courier New", monospace';
  var FR = { tam: 43, kx: 0.72, trazo: 1.8, giro: -0.5, paso: 42.6, corre: 1 / 3 };
  function frase(x, cx, cy, D, colA, colB) {
    var a = 'NO ES SUERTE ', b = 'ES CIENCIA ';
    x.save(); x.translate(cx, cy); x.rotate(FR.giro);
    x.font = 'bold ' + FR.tam + 'px ' + FRASE; x.textBaseline = 'alphabetic'; x.lineJoin = 'round'; x.lineWidth = FR.trazo;
    var wa = x.measureText(a).width * FR.kx, wb = x.measureText(b).width * FR.kx, fw = wa + wb, n = Math.ceil(D / 2 / FR.paso);
    for (var k = -n; k <= n; k++) {
      var o = -(((k * FR.corre) % 1 + 1) % 1) * fw;
      for (var xx = o - Math.ceil((D / 2 + o) / fw) * fw; xx < D / 2; xx += fw) {
        x.save(); x.translate(xx, k * FR.paso); x.scale(FR.kx, 1);
        x.fillStyle = x.strokeStyle = colA; x.fillText(a, 0, 0); x.strokeText(a, 0, 0);       // con trazo: mas gruesa
        x.fillStyle = x.strokeStyle = colB; x.fillText(b, wa / FR.kx, 0); x.strokeText(b, wa / FR.kx, 0); x.restore();
      }
    }
    x.restore();
  }
  /* el dia en gris con la frase por dentro; la imagen de su letra sirve de molde */
  function diaConFrase(img, w, h) {
    var k = document.createElement('canvas'); k.width = Math.ceil(w); k.height = Math.ceil(h);
    var x = k.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = C.dia; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'source-atop';
    frase(x, w / 2, h / 2, Math.sqrt(w * w + h * h) + FR.tam * 2, C.frase, C.fraseOscura);
    return k;
  }
  /* cuando la jugada abarca varios dias ("SABADO Y DOMINGO") no hay letra de Javier: el molde se hace con Bebas */
  function moldeTexto(t) {
    var k = document.createElement('canvas'), x = k.getContext('2d'), tam = 400;
    fuente(x, tam);
    k.width = Math.ceil(x.measureText(t).width) + 4; k.height = Math.round(tam * 0.92);
    x = k.getContext('2d'); fuente(x, tam); x.textBaseline = 'alphabetic'; x.fillStyle = '#000'; x.fillText(t, 2, k.height);
    return { img: k, cuerpo: Math.round(tam * 0.7) };
  }
  /* la palabra de brocha del nivel, en blanco sobre la franja negra */
  function enBlanco(img) {
    var k = document.createElement('canvas'); k.width = img.width; k.height = img.height;
    var x = k.getContext('2d'); x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, k.width, k.height);
    return k;
  }

  /* el mercado: primero lo negro (la linea, el equipo) y despues lo verde (el mercado), con el nombre del
     mercado lo mas corto posible (Javier, 23/10: "goles visita", "puntos partido") */
  function cortaMercado(t) {
    return t.replace(/ DEL VISITANTE/g, ' VISITA').replace(/ DEL LOCAL/g, ' LOCAL').replace(/ DEL PARTIDO/g, ' PARTIDO')
      .replace(/ (EN|DE) LA (\d)ª MITAD/g, ' $2ª MITAD').replace(/ POR TIERRA/g, ' TIERRA').replace(/REMATES AL ARCO/g, 'REMATES ARCO')
      .replace(/ \(SIN EMPATE\)/g, '').replace(/ \(SI ALGUIEN LLEGA\)/g, '').trim();
  }
  function partesMercado(m, local, visita, dep) {
    var t = String(m || '').toUpperCase(), r;
    if ((r = /^(OVER|UNDER) (\d+(?:\.\d+)?) (.+)$/.exec(t))) { return [r[1] + ' ' + r[2], cortaMercado(r[3])]; }
    if ((r = /^(.+?) ((?:MÁS|MENOS) DE \d+(?:\.\d+)?)$/.exec(t))) { return [r[2], cortaMercado(r[1])]; }
    if ((r = /^HANDICAP ASIATICO (.+) ([+-]\d+(?:\.\d+)?)$/.exec(t))) { return [corto(r[1], dep) + ' ' + r[2], 'HÁNDICAP']; }
    if ((r = /^DOBLE (1X|X2|12)$/.exec(t))) { return [r[1], 'DOBLE OPORTUNIDAD']; }
    if ((r = /^CARRERA A (\d+) CORNERS( 1H)?: (.+?)(?: \(SI ALGUIEN LLEGA\))?$/.exec(t))) { return [corto(r[3], dep), 'CARRERA A ' + r[1] + ' CORNERS' + (r[2] || '')]; }
    if ((r = /^(.+?) GANA (.+)$/.exec(t))) { return [corto(r[1], dep) + ' GANA', cortaMercado(r[2])]; }
    if ((r = /^(.+?): MAS (.+)$/.exec(t))) { return [corto(r[1], dep), 'MÁS ' + cortaMercado(r[2])]; }
    if (/^LOCAL \(1\)$/.test(t)) { return [corto(local, dep), 'GANA']; }
    if (/^VISITANTE \(2\)$/.test(t)) { return [corto(visita, dep), 'GANA']; }
    return ['', cortaMercado(t)];
  }
  /* las ligas de nombre largo, para cuando la linea de abajo no cabe */
  var LIGA_CORTA = { 'LIGA PROFESIONAL ARGENTINA': 'LIGA ARGENTINA', 'UEFA CONFERENCE LEAGUE': 'CONFERENCE LEAGUE',
    'UEFA CHAMPIONS LEAGUE': 'CHAMPIONS', 'UEFA EUROPA LEAGUE': 'EUROPA LEAGUE', 'PREMIERSHIP ESCOCESA': 'ESCOCIA',
    'LIGA DE EXPANSION MX': 'EXPANSIÓN MX', 'BRASILEIRAO SERIE A': 'BRASIL', 'PREMIER LIGA RUSA': 'LIGA RUSA',
    'JUPILER PRO LEAGUE': 'BÉLGICA', 'LIGA PORTUGAL 2': 'PORTUGAL 2', 'PREMIER LEAGUE': 'PREMIER' };
  /* nombres cortos de los equipos (Javier, 28/10: "los nombres largos debemos eliminarlos": TOTTENHAM, PATRIOTS,
     BLACKHAWKS, LAKERS). NHL, NFL, NBA y beisbol: el apodo; tenis, box y demas: el apellido; futbol: sin siglas
     (FC, CD, 1., 04...) ni colas (City, United, Rovers...) y, si sigue largo, la primera palabra que diga algo.
     Los que asi saldrian mal o repetidos van a mano. */
  var EQUIPO_CORTO = { 'AC MILAN': 'AC MILAN', 'MANCHESTER CITY': 'MAN CITY', 'MANCHESTER UNITED': 'MAN UNITED',
    'CRYSTAL PALACE': 'PALACE', 'WEST BROMWICH ALBION': 'WEST BROM', 'QUEENS PARK RANGERS': 'QPR', 'HEART OF MIDLOTHIAN': 'HEARTS',
    'WOLVERHAMPTON': 'WOLVES', 'DUNDEE UNITED': 'DUNDEE UTD', 'ST. JOHNSTONE': 'ST. JOHNSTONE', 'PARIS SAINT-GERMAIN': 'PSG',
    'PARIS FC': 'PARIS FC', 'OLYMPIQUE LYONNAIS': 'LYON', 'STADE RENNAIS': 'RENNES', 'STADE BRESTOIS': 'BREST',
    'STADE LAVALLOIS': 'LAVAL', 'BORUSSIA DORTMUND': 'DORTMUND', 'EINTRACHT FRANKFURT': 'FRANKFURT',
    'EINTRACHT BRAUNSCHWEIG': 'BRAUNSCHWEIG', 'BAYER 04 LEVERKUSEN': 'LEVERKUSEN', 'ENERGIE COTTBUS': 'COTTBUS',
    'SPVGG GREUTHER FUERTH': 'FÜRTH', '1. FC NUERNBERG': 'NÜRNBERG', 'VFL OSNABRUECK': 'OSNABRÜCK', '1. FC KOELN': 'COLONIA',
    'HAMBURGER SV': 'HAMBURGO', 'KARLSRUHER SC': 'KARLSRUHE', 'FC BAYERN MUENCHEN': 'BAYERN', 'SG DYNAMO DRESDEN': 'DRESDEN',
    'REAL SOCIEDAD': 'REAL SOCIEDAD', 'REAL SOCIEDAD B': 'R. SOCIEDAD B', 'REAL RACING CLUB': 'RACING',
    'DEPORTIVO DE A CORUNA': 'DEPORTIVO', 'SPORTING GIJON': 'SPORTING GIJÓN', 'BURGOS CLUB DE FUTBOL': 'BURGOS',
    'HELLAS VERONA': 'VERONA', 'VIRTUS ENTELLA': 'ENTELLA', 'GO AHEAD EAGLES': 'GO AHEAD', 'WILLEM II TILBURG': 'WILLEM II',
    'OUD-HEVERLEE LEUVEN': 'OH LEUVEN', 'JONG PSV EINDHOVEN': 'JONG PSV', 'JONG AZ ALKMAAR': 'JONG AZ', 'AZ ALKMAAR': 'AZ',
    'ROYALE UNION SAINT-GILLOISE': 'UNION SG', 'FC LAUSANNE-SPORT': 'LAUSANNE', 'RED BULL BRAGANTINO': 'BRAGANTINO',
    'GIMNASIA Y ESGRIMA MENDOZA': 'GIMNASIA MZA', 'ESTUDIANTES DE RIO CUARTO': 'ESTUDIANTES RC',
    'INDEPENDIENTE RIVADAVIA': 'IND. RIVADAVIA', 'CENTRAL CORDOBA': 'CENTRAL CÓRDOBA', 'ROSARIO CENTRAL': 'ROSARIO CENTRAL',
    'CLUB ATLETICO LA PAZ': 'LA PAZ', 'ATLETICO SAN LUIS': 'SAN LUIS', 'CRUZ AZUL HIDALGO': 'CRUZ AZUL HGO',
    'LEONES NEGROS': 'LEONES NEGROS', 'CAYKUR RIZESPOR': 'RIZESPOR', 'FC SLOVAN LIBEREC': 'LIBEREC',
    'MLADA BOLESLAV': 'BOLESLAV', 'ACADEMICO VISEU FC': 'VISEU', 'SHANGHAI SHENHUA': 'SHENHUA', 'SHANGHAI PORT': 'SHANGHAI PORT',
    'QINGDAO HAINIU': 'HAINIU', 'QINGDAO WEST COAST': 'QINGDAO WC', 'WISA POCK': 'WISLA PLOCK',
    'ATLETICO MADRID': 'ATLÉTICO', 'CLUB ATLETICO UNION DE SANTA FE': 'UNIÓN', 'CELTA VIGO': 'CELTA', 'CELTA FORTUNA': 'CELTA FORTUNA',
    'SLASK WROCAW': 'SLASK', 'WISA KRAKOW': 'WISLA', 'WIDZEW ODZ': 'WIDZEW', 'ZAGEBIE LUBIN': 'ZAGLEBIE', 'YUNNAN YUKUN': 'YUNNAN',
    'NEC NIJMEGEN': 'NEC', 'RKC WAALWIJK': 'RKC', 'AEK ATHENS': 'AEK', 'OFI CRETE': 'OFI' };
  var SIGLA = /^(1|fc|cf|cd|ca|sc|ac|afc|ud|rcd|sd|fk|sk|kv|nk|rc|ss|ssc|us|usl|as|ae|ad|af|apo|aps|gfs|pot|ps|nps|ks|mks|sv|fsv|spvgg|sg|tsg|bsc|rsc|kaa|krc|kvc|raal|vfl|rb|bk|if|il|ik|jk|vv|cp|sad|cs|ce|sl|lr|uanl|unam|uat|club|futbol|futebol|fotball|foot|balompie|-|\d+)$/i;
  var COLA = /^(hotspur|city|town|county|rovers|wanderers|albion|athletic|united|sport|juniors|praha|moscow)$/i;
  var PRIMERA_NO = /^(real|atletico|deportivo|sporting|union|uniao|dinamo|dynamo|olympique|stade|royal|royale|st\.|de|del|la|el|los|las|y|da|do|a|&|of)$/i;
  function sinAcentos(t) { return t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function corto(n, dep) {
    var t = String(n || '').trim(), q = t.split(/\s+/).filter(Boolean), clave = sinAcentos(t).toUpperCase();
    if (!q.length) { return ''; }
    if (EQUIPO_CORTO[clave]) { return EQUIPO_CORTO[clave]; }
    if (/^(hockey|americano|basquetbol|beisbol)$/.test(dep) && q.length > 1) {
      return q.slice(/^(Golden|Maple|Blue|Red|Trail|White)$/.test(q[q.length - 2]) ? -2 : -1).join(' ').toUpperCase();
    }
    if (/^(tenis|box|mma|golf)$/.test(dep) && q.length > 1) { return q[q.length - 1].toUpperCase(); }
    var r = q.filter(function (x) { return !SIGLA.test(x.replace(/\./g, '')); });
    if (!r.length) { r = q; }
    if (r.length > 1 && COLA.test(r[r.length - 1])) { r = r.slice(0, -1); }
    if (r.join(' ').length > 12 && r.length > 1) {
      var k = 0; while (k < r.length - 1 && PRIMERA_NO.test(r[k])) { k++; }
      r = [r[k]];
    }
    return r.join(' ').toUpperCase();
  }

  /* la segunda linea de una seleccion: los equipos (mas oscuros), "vs", la liga y la hora (mas claros),
     separados por rayitas, la bandera y el deporte */
  var T2 = 32.5, E2 = 32, CABE2 = 972 - 131;
  function lineaDos(c, p, liga) {
    var L = corto(p.local, depDe(p)), V = corto(p.visita, depDe(p)), hora = p.hora || '';
    var partes = [{ t: L, c: C.equipo, k: 1 }];
    if (V) { partes.push({ esp: 7 }, { t: 'VS', c: C.suave, k: 0.66 }, { esp: 5 }, { t: V, c: C.equipo, k: 1 }); }
    if (liga || hora) {
      partes.push({ esp: 13 }, { raya: 1 }, { esp: 13 });
      if (liga) { partes.push({ t: liga, c: C.suave, k: 1 }); }
      if (liga && hora) { partes.push({ esp: 13 }); }
      if (hora) { partes.push({ t: hora, c: C.suave, k: 1 }); }
    }
    partes.push({ esp: 12 }, { raya: 1 }, { esp: 16 }, { e: p.bandera || '🏳️' }, { esp: 5 }, { e: p.deporte || '⚽' });
    partes.mide = function (t) {
      return partes.reduce(function (s, q) {
        return s + (q.esp ? q.esp * t / 33 : q.raya ? 3 : q.e ? anchoEmoji(c, q.e, E2 * t / 33) : ancho(c, q.t, t * q.k));
      }, 0);
    };
    return partes;
  }
  function ligaDe(p) { return String(p.liga || '').toUpperCase(); }
  /* el deporte de la seleccion (si no viene, por su emoji) */
  var DEP_EMOJI = { '🏒': 'hockey', '🏈': 'americano', '🏀': 'basquetbol', '⚾': 'beisbol', '🎾': 'tenis', '🥊': 'box', '🥋': 'mma', '⛳': 'golf' };
  function depDe(p) { return p.dep || DEP_EMOJI[p.deporte] || 'futbol'; }

  /* una seleccion (imagen de Javier, 28/10): la raya verde, el mercado, su momio en la caja azul, la linea gris
     y la segunda linea; el alto de una fila: 104 de la raya y 66 de aire. "cortas": las ligas que en esta
     imagen van con su nombre corto */
  function fila(c, p, y, cortas) {
    c.fillStyle = C.barra; redondo(c, 96.5, y, 7, 104, 3.5); c.fill();
    if (p.momio) {
      var g = c.createLinearGradient(0, y - 1, 0, y + 60); g.addColorStop(0, C.azul[0]); g.addColorStop(1, C.azul[1]);
      c.fillStyle = g; redondo(c, 866, y - 1, 107, 61, 14); c.fill();
      var tm = 35; while (tm > 24 && ancho(c, p.momio, tm) > 95) { tm -= 1; }
      T(c, p.momio, 922.5, y + 42, tm, '#ffffff', 'center');
    }
    var pm = partesMercado(p.mercado, p.local, p.visita, depDe(p)), negro = pm[0] ? pm[0] + ' ' : '', verde = pm[1];
    var tam = 77, cabe = (p.momio ? 846 : 972) - 121;
    while (tam > 40 && ancho(c, negro + verde, tam, 1.045) > cabe) { tam -= 1; }
    var xx = 120 + T(c, negro, 120, y + 55, tam, C.texto, 0, 1.045);
    T(c, verde, xx, y + 55, tam, C.verde, 0, 1.045);
    c.fillStyle = C.separa; c.fillRect(118, y + 75, 857, 3);

    var liga = ligaDe(p), partes = lineaDos(c, p, cortas[liga] ? LIGA_CORTA[liga] : liga), t2 = T2;
    while (t2 > 20 && partes.mide(t2) > CABE2) { t2 -= 0.5; }               // si aun asi no cabe, se achica junta
    var e = t2 / 33, base = y + 111;
    xx = 131;
    partes.forEach(function (q) {
      if (q.esp) { xx += q.esp * e; return; }
      if (q.raya) { c.fillStyle = C.suave; c.fillRect(xx, y + 86, 3, 30); xx += 3; return; }
      if (q.e) { var we = anchoEmoji(c, q.e, E2 * e); emoji(c, q.e, xx + we / 2, base - 11 * e, E2 * e); xx += we; return; }
      xx += T(c, q.t, xx, base, t2 * q.k, q.c);
    });
  }

  function dibujar(c, A, D) {
    /* el dia: siempre el mismo ancho, centrado; el logo con su mitad en el borde de arriba de las letras, asi
       que un dia "mas alto" (LUNES) baja todo lo demas */
    var molde = A.dias[D.dia.clave] ? { img: A.dias[D.dia.clave], cuerpo: 186 } : moldeTexto(D.dia.titulo || 'POR CONFIRMAR');
    var img = molde.img, LT = 23.4, LH = 258.2, AN = 833;
    var esc = AN / img.width, cuerpo = molde.cuerpo * esc, acento = (img.height - molde.cuerpo) * esc;
    var arriba = LT + LH / 2 - 4, diaAbajo = arriba + cuerpo;
    /* el cuadro blanco: las selecciones, la caja del momio final y las cantidades y la franja negra del nivel */
    var cols = [['MOMIO', D.momio, C.texto, 211.5], ['APUESTA', D.apuesta, C.texto, 509.5], ['TOTAL', D.total, C.total, 827.5]]
      .filter(function (k) { return k[1]; });
    var n = D.picks.length, PASO = 170;
    var py = diaAbajo + 63, f0 = py + 33, ul = f0 + (n - 1) * PASO;
    var ty = ul + 147, by = cols.length ? ty + 130 : ul + 147, pb = by + 86, H = pb + 266;
    c.canvas.width = W; c.canvas.height = H;
    c.fillStyle = C.fondo; c.fillRect(0, 0, W, H);
    var dy = arriba - acento, dh = img.height * esc;
    /* la frase tambien en todo el fondo, muy tenue, en las mismas lineas que la del dia (Javier, 28/10) */
    frase(c, W / 2, dy + dh / 2, 2 * Math.sqrt(W * W + H * H), C.fondoFrase, C.fondoFraseOscura);
    c.drawImage(diaConFrase(img, AN, dh), (W - AN) / 2, dy, AN, dh);
    if (A.logo) { var lw = LH * A.logo.width / A.logo.height; c.drawImage(A.logo, (W - lw) / 2, LT, lw, LH); }

    /* N SELECCIONES · raya · fecha */
    var fy = diaAbajo + 45;
    var et = n === 1 ? '1 SELECCIÓN' : n + ' SELECCIONES';
    var we = T(c, et, 116, fy, 30, C.encabezado), wf = ancho(c, D.dia.fecha, 30);
    T(c, D.dia.fecha, 941, fy, 30, C.encabezado, 'right');
    c.fillStyle = C.raya; c.fillRect(116 + we + 28, diaAbajo + 33, 941 - wf - 20 - (116 + we + 28), 2);

    c.fillStyle = '#ffffff'; redondo(c, 55, py, 970, pb - py, 60); c.fill();
    /* una liga de nombre largo que no cabe en alguna fila va con su nombre corto en todas */
    var cortas = {};
    D.picks.forEach(function (p) { var l = ligaDe(p); if (LIGA_CORTA[l] && lineaDos(c, p, l).mide(T2) > CABE2) { cortas[l] = true; } });
    D.picks.forEach(function (p, i) { fila(c, p, f0 + i * PASO, cortas); });

    /* el momio final, la apuesta y el total, en su caja gris */
    if (cols.length) {
      c.fillStyle = C.caja; redondo(c, 102, ty, 870, 100, 20); c.fill();
      var tres = cols.length === 3, cw = 870 / cols.length;
      cols.forEach(function (k, j) {
        var cx = tres ? k[3] : 102 + cw * j + cw / 2, cabe = tres ? [220, 310, 280][j] : cw - 40;
        if (j) { c.fillStyle = C.divide; c.fillRect((tres ? [0, 335.5, 670.5][j] : 102 + cw * j - 1), ty + 17, 2, 60); }
        T(c, k[0], cx, ty + 26, 20, C.etiqueta, 'center', 0.93);
        var t = 56; while (t > 30 && ancho(c, k[1], t, 0.97) > cabe) { t -= 1; }
        T(c, k[1], cx, ty + 77, t, k[2], 'center', 0.97);
      });
    }

    /* la franja negra del nivel, al fondo del cuadro: "NIVEL", el emoji y la palabra de brocha centrados y las barras */
    c.fillStyle = '#000000'; redondo(c, 55, by, 970, 86, [0, 0, 60, 60]); c.fill();
    T(c, 'NIVEL', 146, by + 60, 50, '#ffffff');
    var bi = A.niveles[D.nivel.clave], bh = 79.4, bw = 0;
    if (bi) { bw = bi.width * bh / bi.height; if (bw > 375) { bw = 375; bh = bi.height * bw / bi.width; } }   // sin tocar las barras
    var SEP = 88, gx = 527.75 - (SEP + bw) / 2;                    // el emoji mas separado de la palabra (Javier, 28/10)
    emoji(c, D.nivel.e, gx + 38.5, by + 45, 62);
    if (bi) { c.drawImage(enBlanco(bi), gx + SEP, by + 47.8 - bh / 2, bw, bh); }
    var llena = D.nivel.clave === 'superfuerte' ? ROJO : NARANJA;
    if (D.nivel.clave === 'ultrafuerte') { llena = c.createLinearGradient(850, 0, 940, 0); llena.addColorStop(0, NARANJA); llena.addColorStop(1, ROJO); }
    for (var s = 0; s < 3; s++) {
      var x0 = 802 + s * 65.5, arr = by + 29;
      c.beginPath(); c.moveTo(x0, arr); c.lineTo(x0 + 57, arr); c.lineTo(x0 + 39, arr + 29); c.lineTo(x0 - 18, arr + 29); c.closePath();
      c.fillStyle = s < D.nivel.n ? llena : APAGADA; c.fill();
    }

    /* abajo: el avatar (girado, como en su imagen) y el logo de Green Zone */
    if (A.avatar) {
      var aw = A.avatar.width * 0.4028, ah = A.avatar.height * 0.4028;
      c.save(); c.translate(245.6, pb + 137.3); c.rotate(-0.1746); c.drawImage(A.avatar, -aw / 2, -ah / 2, aw, ah); c.restore();
    }
    if (A.greenzone) { c.drawImage(A.greenzone, 462.2, pb + 67.9, 549.9, 549.9 * A.greenzone.height / A.greenzone.width); }
    return H;
  }
    return { dibujar: dibujar };
  })();
  function dibujarGZ() {
    var turno = ++gzTurno;
    return recursosGZ().then(function (A) {
      var l = document.createElement('canvas');
      GZ3.dibujar(l.getContext('2d'), A, datosGZ());
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
      '<div class="gz-vista preparando"><img id="gz-img" alt="Vista previa de la imagen para el grupo"' + (gzUrl ? ' src="' + gzUrl + '"' : '') + '></div>' +
      '<ol class="gz-pasos"><li><button type="button" class="boton gz-guardar" data-accion="gz-guardar">💾 Guardar en el historial</button></li>' +
      '<li><button type="button" class="boton gz-compartir" data-accion="gz-compartir">📤 Compartir en Green Zone</button></li></ol>' +
      '<p class="gz-candado" data-gz-out="candado"></p>' +
      '<div class="gz-mas"><button type="button" class="boton secundario gz-tras" data-accion="gz-descargar">⬇️ Descargar imagen</button>' +
      '<button type="button" class="boton secundario gz-tras" data-accion="gz-copiar">📋 Copiar texto</button>' +
      '<button type="button" class="boton secundario" data-accion="gz-limpiar">🧹 Empezar otra</button></div>';
    return h;
  }
  /* lo que cambia al escribir, sin repintar (para no perder el cursor) */
  function guardadaGZ() { return GZ.patas.length > 0 && GZ.guardado === firmaGZ(); }
  function salidasGZ() {
    var c = calcularGZ(), g = $('.gz-guardar'), hecho = guardadaGZ();
    if (g) {
      g.disabled = hecho;
      g.classList.toggle('hecho', hecho);
      g.textContent = hecho ? '✓ Guardada en el historial' : GZ.hechos ? '💾 Guardar los cambios' : '💾 Guardar en el historial';
    }
    $$('.gz-compartir, .gz-tras').forEach(function (b) { b.disabled = !hecho; });
    var cand = $('[data-gz-out="candado"]');
    if (cand) {
      cand.className = 'gz-candado' + (hecho ? ' listo' : '');
      cand.textContent = hecho ? '✓ Guardada: ya puedes compartirla.'
        : GZ.hechos ? '🔒 Cambiaste la jugada: guarda los cambios para poder compartirla (reemplazan a la que ya guardaste).'
          : '🔒 Primero guárdala: así ninguna jugada se queda fuera del historial ni de los reportes.';
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
  function vGreen(partes, q) {
    var cab = cabeceraGZ();
    if (!Editor.activo) { return pintar(cab + CANDADO, SECC.green[1]); }
    var h0 = hoy(), otro = /^\d{4}-\d{2}-\d{2}$/.test((q && q.get('dia')) || '') && q.get('dia') < h0 ? q.get('dia') : null;
    return Esc.rango(otro || h0, otro || masDias(h0, 21)).then(function (picks) {
      gzPicks = picks;
      if (otro) { GZ.dia = otro; }
      var h = cab;
      h += '<div class="gz"><section class="gz-col"><h2><span class="emoji">1️⃣</span>Escoge tus selecciones</h2>' +
        '<button type="button" class="boton secundario gz-propia-btn" data-accion="gz-propia">✍️ Agregar una selección propia</button>' +
        '<p class="criterio gz-propia-nota">Para lo que no está en el análisis (tenis, box, béisbol…). Se combina con los escogidos en parlay o en directas.</p>' +
        '<h3>✅ De los picks escogidos ' + (otro ? 'del ' + fCorta(otro) : 'de hoy en adelante') + '</h3>' +
        (otro ? '<p class="nota">📅 Estás viendo un día que ya pasó. <a href="#/green">Volver a hoy ›</a></p>' : '') +
        (gzPicks.length ? '<div id="gz-lista">' + listaGZ() + '</div>'
          : vacio('📭', 'No hay picks escogidos ' + (otro ? 'ese día' : 'de hoy en adelante') + '. Escógelos en <a href="#/hoy">🏠 Hoy</a>.')) +
        '<form class="gz-otro" id="gz-otro"><label>📅 Otro día <input type="date" name="dia" max="' + h0 + '" value="' + (otro || '') + '"></label>' +
        '<button type="submit" class="boton secundario">Ver</button></form>' +
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
  }
  function alternarGZ(id) {
    var ya = GZ.patas.filter(function (x) { return x.id === id; })[0];
    if (ya) {
      GZ.patas = GZ.patas.filter(function (x) { return x !== ya; });
      if (!GZ.patas.length) { GZ.hechos = null; GZ.ids = null; GZ.guardado = null; }
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
    if (!guardadaGZ()) { avisar('🔒 Primero guárdala en el historial.'); return; }
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
  var PRIMERA_GREEN = '2026-08-27';                 // el historial se busca desde aqui, hasta 2 anos atras
  var ANOS_HISTORIAL = 2;                            // pedido de Javier: minimo 2 anos antes de dejar de mostrar los viejos
  var RES = { ganada: ['✅', 'Ganada'], perdida: ['❌', 'Perdida'], nula: ['➖', 'Nula'], pendiente: ['⏳', 'Pendiente'],
    jugarse: ['⏳', 'Por jugarse'], auditoria: ['🕓', 'Esperando auditoría'], marcar: ['⚠️', 'Por marcar'] };
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
  /* las semanas (jueves, como se guardan) de los ultimos 2 anos, de la mas nueva a la mas vieja */
  function ventanaHist() {
    var ini = masDias(hoy(), -Math.round(365.25 * ANOS_HISTORIAL)), out = [];
    if (ini < PRIMERA_GREEN) { ini = PRIMERA_GREEN; }
    for (var s = masDias(semanaDe(hoy()), 7); s >= semanaDe(ini); s = masDias(s, -7)) { out.push(s); }
    return out;
  }
  /* Al entrar a una vista se leen de nuevo las semanas recientes (por el intermediario, en grupos de
     20, que es lo que acepta de una vez); las viejas ya no cambian salvo por lo que se marca aqui
     mismo, asi que se leen una vez del archivo publicado. conCache: no releer lo que ya se tiene. */
  Hist.cargar = function (semanas, conCache) {
    var usar = Hist.cache || conCache, corte = semanaDe(masDias(hoy(), -21));
    var faltan = semanas.filter(function (s) { return !usar || !Hist.datos[s]; });
    Hist.cache = false;
    var vivas = Editor.activo ? faltan.filter(function (s) { return s >= corte; }) : [];
    var viejas = faltan.filter(function (s) { return vivas.indexOf(s) < 0 && !Hist.datos[s]; });
    if (!vivas.length && !viejas.length) { return Promise.resolve(); }
    var estatico = function (lista) {
      return Promise.all(lista.map(function (s) { return cargar('data/green/' + s + '.json', true).catch(function () { return null; }); }))
        .then(function (xs) { var o = {}; lista.forEach(function (s, i) { o[s] = xs[i]; }); return o; });
    };
    var lotes = [];
    for (var i = 0; i < vivas.length; i += 20) { lotes.push(vivas.slice(i, i + 20)); }
    return Promise.all(lotes.map(function (l) {
      return llamar('green', { op: 'leer', semanas: l }).then(function (r) { return r.archivos || {}; }, function () { return estatico(l); });
    }).concat([estatico(viejas)])).then(function (xs) {
      xs.forEach(function (a) { Object.keys(a).forEach(function (s) { Hist.datos[s] = normalizarHist(a[s], s); }); });
    });
  };
  Hist.lista = function (semanas) {
    return [].concat.apply([], semanas.map(function (s) { return Hist.datos[s] ? Hist.datos[s].selecciones : []; }))
      .filter(function (s) { return s.fecha >= CUENTAS_DESDE; })              // el contador en cero (29/10/2026)
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
  /* En que va una seleccion: ganada / perdida / nula, o si sigue abierta: por jugarse, esperando la
     auditoria (todas sus selecciones son del analisis) o POR MARCAR: ya se jugo y no se puede
     resolver sola (lleva una seleccion propia, o la auditoria no llego en 8 dias). Pedido de
     Javier: ninguna se queda pendiente sin avisar. */
  var GRACIA = 3 * 3600e3, ESPERA_AUDITORIA = 8 * 864e5;
  function finSel(s) {
    return Math.max.apply(null, s.patas.map(function (p) { return tsDe(p.fecha || s.fecha, p.hora) || 0; }).concat([tsDe(s.fecha, '') - 864e5 + 1]));
  }
  function estadoPend(s, mapas) {
    var st = estadoSel(s, mapas);
    if (st.e !== 'pendiente') { return st.e; }
    var fin = finSel(s);
    if (Date.now() < fin + GRACIA) { return 'jugarse'; }
    var auto = s.patas.every(function (p) { return !p.manual && p.archivo && p.sa; });
    return auto && Date.now() < fin + ESPERA_AUDITORIA ? 'auditoria' : 'marcar';
  }
  function pintarBadge(n) {
    porMarcarN = n;
    $$('.nav-badge').forEach(function (b) { b.textContent = n; b.hidden = !n; });
  }
  /* el numerito rojo en "Del dia": cuantas hay por marcar (se revisa al abrir y tras guardar o marcar) */
  function avisoMarcar() {
    if (!Editor.activo) { pintarBadge(0); return Promise.resolve(); }
    var sems = ventanaHist();
    return Hist.cargar(sems, true).then(function () {
      var sels = Hist.lista(sems);
      return mapasHist(sels).then(function (m) {
        pintarBadge(sels.filter(function (x) { return estadoPend(x, m) === 'marcar'; }).length);
      });
    }).catch(function () { /* sin conexion: se revisa en la siguiente vista */ });
  }
  /* una seleccion por marcar, con sus botones a la mano */
  function tarjetaMarcar(s) {
    var puede = s.por === Editor.persona || Editor.persona === 'picksin', niv = NIVELES[s.nivel] || NIVELES.fuerte;
    var patas = s.patas.map(function (p) { return deporteDe(p)[0] + ' ' + esc(p.mercado); }).join(' + ');
    var info = s.patas.map(function (p) {
      return (p.bandera ? bandera(p.bandera) + ' ' : '') + esc(p.nombre || deporteDe(p)[1]) + (p.partido ? ' · ' + esc(p.partido) : '') +
        (p.hora ? ' · ' + esc(p.hora) : '');
    }).join(' / ');
    return '<article class="hs pm" data-sel="' + esc(s.id) + '" data-sem="' + esc(s._sem) + '"><div class="pm-txt"><b>' + fCorta(s.fecha) + ' · ' +
      (s.tipo === 'parlay' ? '🔗 Parlay de ' + s.patas.length + ': ' : '') + patas + '</b><small>' + info + ' · ' + niv.e + ' ' + niv.t +
      (s.momio ? ' · momio ' + esc(s.momio) : '') + ' ' + persona(s.por) + '</small></div>' +
      (puede ? '<div class="hs-acciones">' + ['ganada', 'perdida', 'nula'].map(function (k) {
        return '<button type="button" class="r-' + k + '" data-accion="gz-hs-resultado" data-res="' + k + '">' + RES[k][0] + ' ' + RES[k][1] + '</button>';
      }).join('') + '</div>' : '<p class="criterio">La marca ' + esc(s.por) + ' o picksin.</p>') + '</article>';
  }
  /* lo pendiente, arriba de Hoy: selecciones por marcar, la jugada armada sin guardar y la seleccion del dia */
  function bloquePendientes(sels, mapas, dia) {
    var marcar = sels.filter(function (x) { return estadoPend(x, mapas) === 'marcar'; });
    var delDia = sels.filter(function (x) { return x.fecha === dia; });
    var borrador = GZ.patas.length > 0 && !guardadaGZ(), it = [], n = marcar.length + (borrador ? 1 : 0);
    var etq = dia === hoy() ? 'de hoy' : 'del ' + fCorta(dia);
    pintarBadge(marcar.length);
    if (marcar.length) {
      it.push('<div class="pend alerta"><p><b>⚠️ ' + (marcar.length === 1 ? 'Una selección del día ya se jugó y no tiene resultado.'
        : marcar.length + ' selecciones del día ya se jugaron y no tienen resultado.') + '</b> Marca cómo quedaron:</p>' +
        marcar.map(tarjetaMarcar).join('') + '</div>');
    }
    if (borrador) {
      it.push('<a class="pend" href="#/green"><span>📝 Tienes una jugada armada <b>sin guardar</b> (' + plural(GZ.patas.length, 'selección', 'selecciones') +
        '): guárdala antes de compartirla.</span><b class="ir">Guardarla ›</b></a>');
    }
    it.push(delDia.length
      ? '<a class="pend ok" href="#/historial"><span>🟢 Selección del día ' + etq + ': <b>' + plural(delDia.length, 'guardada', 'guardadas') + '</b> · ' +
        delDia.map(function (x) { var e = estadoPend(x, mapas); return RES[e][0] + ' ' + RES[e][1]; }).join(' · ') + '</span><b class="ir">Ver ›</b></a>'
      : '<a class="pend" href="#/green"><span>🟢 Todavía no hay selección del día ' + etq + ' guardada.</span><b class="ir">Armarla ›</b></a>');
    return '<section class="pendientes' + (marcar.length ? ' con-alerta' : '') + '"><h2><span class="emoji">📌</span>Pendientes' +
      (n ? ' <span class="badge">' + n + '</span>' : ' <span class="cuenta">✓ nada por marcar</span>') + '</h2>' + it.join('') + '</section>';
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
  function cabeceraGZ() {
    return '<div class="titulo-seccion gz-titulo"><img class="gz-avatar" src="assets/avatar.webp" alt="" width="46" height="68">' +
      '<div><h1>🟢 ' + SECC.green[1] + '</h1><p class="sub">' + SECC.green[2] + '</p></div></div>';
  }
  /* Resultados con pestanas (pedido de Javier, 01/10): la semana de los escogidos, el ranking y, para
     los seleccionadores, el historial y los reportes de la seleccion del dia */
  var porMarcarN = 0;
  function cabeceraRes(activa) {
    var t = { semana: SECC.resultados[2], ranking: 'Buenas y malas de cada seleccionador, de todas las semanas.',
      historial: 'Las selecciones del día guardadas, con su resultado. Se guardan al menos ' + ANOS_HISTORIAL + ' años.',
      reporte: 'Tu control por días (hasta 10) o por mes. La imagen para redes, solo cuando la pidas.' }[activa];
    var tabs = [['semana', '#/resultados', '🏅 Semana']];
    if (Editor.activo) { tabs.push(['historial', '#/historial', '📚 Historial'], ['reporte', '#/reporte', '📊 Reportes']); }
    tabs.push(['ranking', '#/ranking', '👥 Ranking']);
    return '<div class="titulo-seccion"><span class="icono" aria-hidden="true">🏅</span><div><h1>' + SECC.resultados[1] + '</h1>' +
      '<p class="sub">' + t + '</p></div></div><nav class="gz-tabs res-tabs" aria-label="Resultados">' + tabs.map(function (x) {
        return '<a href="' + x[1] + '"' + (x[0] === activa ? ' aria-current="page"' : '') + '>' + x[2] +
          (x[0] === 'historial' ? '<span class="nav-badge tab-badge"' + (porMarcarN ? '' : ' hidden') + '>' + porMarcarN + '</span>' : '') + '</a>';
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
    var firma = firmaGZ(), sels = seleccionesDeGZ(), previas = GZ.hechos;
    if (previas && !confirm('Ya habías guardado esta jugada. ¿Reemplazarla en el historial con estos cambios?')) { return; }
    if (!GZ.ids || GZ.ids.firma !== firma || GZ.ids.lista.length !== sels.length) {   // reintentar no la duplica
      GZ.ids = { firma: firma, lista: sels.map(function () { return nuevoId(); }) };
      guardarGZ();
    }
    sels.forEach(function (s, i) { s.id = GZ.ids.lista[i]; });
    b.disabled = true;
    b.textContent = '⏳ Guardando…';
    llamar('green', { op: 'guardar', sels: sels }).then(function (r) {
      Object.keys(r.archivos || {}).forEach(function (s) { Hist.datos[s] = normalizarHist(r.archivos[s], s); });
      /* la version anterior se borra despues de guardar la nueva: nunca se queda sin ninguna */
      var quitar = previas ? previas.lista.filter(function (id) { return GZ.ids.lista.indexOf(id) < 0; }) : [];
      return quitar.reduce(function (p, id, i) {
        return p.then(function () {
          return llamar('green', { op: 'quitar', semana: previas.sems[i], id: id }).then(function (r2) {
            Object.keys(r2.archivos || {}).forEach(function (s) { Hist.datos[s] = normalizarHist(r2.archivos[s], s); });
          }, function () { /* ya no estaba */ });
        });
      }, Promise.resolve()).then(function () {
        GZ.guardado = firma;
        GZ.hechos = { lista: GZ.ids.lista.slice(), sems: sels.map(function (s) { return semanaDe(s.fecha); }) };
        guardarGZ();
        salidasGZ();
        Hist.cache = true;
        avisoMarcar();
        avisar((previas ? '💾 Cambios guardados' : '💾 Guardada en el historial') + (sels.length > 1 ? ' (' + sels.length + ' directas)' : '') +
          '. Ya puedes compartirla.', '#/historial', 'Ver historial');
      });
    }).catch(function (e) {
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
    if (!Editor.activo) { return pintar(cabeceraRes('historial') + CANDADO, 'Historial'); }
    var semanas = ventanaHist();
    return Hist.cargar(semanas).then(function () {
      var sels = Hist.lista(semanas);
      return mapasHist(sels).then(function (mapas) {
        var h = cabeceraRes('historial');
        if (!sels.length) {
          return pintar(h + vacio('📚', 'Todavía no hay selecciones guardadas. Arma una en <a href="#/green">🟢 Armar</a> y toca ' +
            '<b>💾 Guardar en el historial</b>.'), 'Historial');
        }
        var est = {};
        sels.forEach(function (x) { est[x.id] = estadoPend(x, mapas); });
        var marcar = sels.filter(function (x) { return est[x.id] === 'marcar'; }), audit = sels.filter(function (x) { return est[x.id] === 'auditoria'; });
        pintarBadge(marcar.length);
        if (marcar.length) {
          h += '<section class="pendientes con-alerta"><h2><span class="emoji">⚠️</span>Por marcar <span class="badge">' + marcar.length + '</span></h2>' +
            '<p class="criterio">Ya se jugaron y no se pueden resolver solas (llevan una selección propia, o su auditoría no llegó en 8 días). ' +
            'Marca cómo quedaron:</p>' + marcar.map(tarjetaMarcar).join('') + '</section>';
        }
        h += marcadorHist(contarHist(sels, mapas));
        if (audit.length) {
          h += '<p class="nota">🕓 ' + plural(audit.length, 'selección ya se jugó y se resolverá sola', 'selecciones ya se jugaron y se resolverán solas') +
            ' con la auditoría de su jornada. Si en 8 días no llega, pasa a «Por marcar».</p>';
        }
        h += '<p class="criterio">Toca una selección para ver su detalle. Las que son solo de picks del análisis se resuelven solas con la ' +
          'auditoría; las que llevan una selección propia se marcan a mano. Se guardan al menos ' + ANOS_HISTORIAL + ' años.</p>';
        var meses = unicos(sels.map(function (x) { return x.fecha.slice(0, 7); })).sort().reverse();
        h += meses.map(function (m) {
          var del = sels.filter(function (x) { return x.fecha.slice(0, 7) === m; }).reverse(), c = contarHist(del, mapas);
          var nm = del.filter(function (x) { return est[x.id] === 'marcar'; }).length;
          return '<h2 class="hs-mes"><span class="emoji">🗓️</span>' + nombreMes(m) + ' ' + m.slice(0, 4) + '<span class="cuenta">' + c.ganada + '–' + c.perdida +
            (c.nula ? ' · ' + plural(c.nula, 'nula', 'nulas') : '') + (nm ? ' · ⚠️ ' + nm : '') + '</span></h2>' +
            '<div class="hs-lista">' + del.map(function (x) {
              var delDia = sels.filter(function (y) { return y.fecha === x.fecha; }), k = delDia.indexOf(x) + 1, st = est[x.id];
              var clase = st === 'jugarse' || st === 'auditoria' ? 'pendiente' : st;
              return '<details class="hs-item r-' + clase + '" data-k="hs-' + esc(x.id) + '"><summary><span class="hs-fecha">' + fCorta(x.fecha) +
                (delDia.length > 1 ? ' <small>· ' + k + ' de ' + delDia.length + '</small>' : '') + '</span>' +
                '<span class="hs-chip">' + RES[st][0] + ' ' + RES[st][1] + '</span></summary>' + tarjetaHist(x, mapas, delDia.length, k) + '</details>';
            }).join('') + '</div>';
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
      avisoMarcar();
    }, function (e) {
      avisar('⚠️ No se guardó: ' + e.message);
      $$('button', card).forEach(function (b) { b.disabled = false; });
    });
  }

  /* ---------------------------------------------------------------- reporte para redes */
  function vReporte(partes, q) {
    if (!Editor.activo) { return pintar(cabeceraRes('reporte') + CANDADO, 'Reporte'); }
    if (/^\d{4}-\d{2}$/.test(q.get('mes') || '')) { return vReporteMes(q.get('mes')); }
    var ok = function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null; };
    var hasta = ok(q.get('hasta')) || hoy(), desde = ok(q.get('desde')) || masDias(hasta, -6), nota = '';
    if (desde > hasta) { var t = desde; desde = hasta; hasta = t; }
    if (diasEntre(desde, hasta) > 10) { desde = masDias(hasta, -9); nota = 'El reporte abarca hasta 10 días: se tomaron los 10 que terminan el ' + fCorta(hasta) + '.'; }
    var semanas = semanasEntre(desde, hasta), lun = lunesDe(hoy());
    return Hist.cargar(semanas).then(function () {
      var sels = Hist.lista(semanas).filter(function (s) { return s.fecha >= desde && s.fecha <= hasta; });
      return mapasHist(sels).then(function (mapas) {
        var n = contarHist(sels, mapas), h = cabeceraRes('reporte') + modosRep('dias');
        h += '<form class="rep-form" id="rep-form"><label class="gz-campo"><span>Del</span><input type="date" name="desde" value="' + desde + '"></label>' +
          '<label class="gz-campo"><span>al</span><input type="date" name="hasta" value="' + hasta + '"></label>' +
          '<button type="submit" class="boton">Ver reporte</button></form>' +
          '<nav class="filtros rep-atajos" aria-label="Periodos">' + [['Últimos 7 días', masDias(hoy(), -6), hoy()],
            ['Esta semana (lun–dom)', lun, masDias(lun, 6)], ['Semana pasada', masDias(lun, -7), masDias(lun, -1)],
            ['Últimos 10 días', masDias(hoy(), -9), hoy()]].map(function (x) {
            return '<a href="#/reporte?desde=' + x[1] + '&hasta=' + x[2] + '" aria-current="' + (x[1] === desde && x[2] === hasta) + '">' + x[0] + '</a>';
          }).join('') + '</nav>' + (nota ? '<p class="nota">' + nota + '</p>' : '');
        if (!sels.length) {
          return pintar(h + vacio('📭', 'No hay selecciones guardadas del ' + fCorta(desde) + ' al ' + fCorta(hasta) + '.'), 'Reporte');
        }
        h += marcadorHist(n) +
          (n.pendiente ? '<p class="nota">⏳ ' + plural(n.pendiente, 'selección sigue sin resultado', 'selecciones siguen sin resultado') +
            ' (por jugarse, esperando auditoría o por marcar en <a href="#/historial">📚 Historial</a>): el reporte sale completo cuando todas tengan resultado.</p>' : '') +
          tablasRep(sels, mapas, false) + bloqueImagenRep();
        repActual = { R: { sels: sels, mapas: mapas, desde: desde, hasta: hasta, n: n }, planear: planReporte, pintar: pintarReporte,
          nombre: 'reporte-green-zone-' + desde + '-al-' + hasta + '.png' };
        pintar(h, 'Reporte');
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
  /* ---------------------------------------------------------------- tablas del reporte (control personal) */
  var repActual = null;
  function netoSel(s, e) {
    if (e === 'ganada') { return s.apuesta && s.pago ? s.pago - s.apuesta : null; }
    if (e === 'perdida') { return s.apuesta ? -s.apuesta : null; }
    return e === 'nula' ? 0 : null;
  }
  function netoTxt(x) { return x == null ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + dinero(Math.abs(x)); }
  function filaConteo(etq, sels, mapas) {
    var c = contarHist(sels, mapas);
    return '<tr><td>' + etq + '</td><td class="num">' + c.total + '</td><td class="num">' + c.ganada + '</td><td class="num">' + c.perdida +
      '</td><td class="num">' + c.nula + '</td><td class="num">' + c.pendiente + '</td><td class="num"><b>' + pct(c.efectividad) + '</b></td>' +
      '<td class="num neto ' + (c.balance > 0 ? 'mas' : c.balance < 0 ? 'menos' : '') + '">' + (c.apostado ? netoTxt(c.balance) : '—') + '</td></tr>';
  }
  function tablasRep(sels, mapas, porSemana) {
    var cab = '<thead><tr><th></th><th class="num">Jugadas</th><th class="num">✅</th><th class="num">❌</th><th class="num">➖</th><th class="num">⏳</th>' +
      '<th class="num">Efectividad</th><th class="num">Neto</th></tr></thead>';
    var tot = contarHist(sels, mapas);
    var h = '<h2><span class="emoji">📋</span>Selección por selección</h2><div class="tabla-caja tabla-scroll"><table class="rep-tabla"><thead><tr>' +
      '<th>Día</th><th>Resultado</th><th class="num">Neto</th><th>Jugada</th><th>Nivel</th><th class="num">Momio</th><th class="num">Apuesta</th></tr></thead><tbody>' +
      sels.map(function (s) {
        var e = estadoSel(s, mapas).e, niv = NIVELES[s.nivel] || NIVELES.fuerte, neto = netoSel(s, e);
        return '<tr class="r-' + e + '"><td class="rep-dia">' + fCorta(s.fecha) + '</td><td><span class="rep-res">' + RES[e][0] + ' ' + RES[e][1] + '</span></td>' +
          '<td class="num neto ' + (neto > 0 ? 'mas' : neto < 0 ? 'menos' : '') + '">' + netoTxt(neto) + '</td><td class="rep-jugada">' +
          (s.tipo === 'parlay' ? '<b>🔗 Parlay de ' + s.patas.length + '</b>' : '') +
          s.patas.map(function (p) { return '<span>' + deporteDe(p)[0] + ' ' + esc(p.mercado) + '</span>'; }).join('') + '</td>' +
          '<td>' + niv.e + ' ' + niv.t + '</td><td class="num">' + esc(s.momio || '—') + '</td><td class="num">' + (s.apuesta ? dinero(s.apuesta) : '—') + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>Total</td><td>' + tot.ganada + '–' + tot.perdida + ' · ' + pct(tot.efectividad) + '</td>' +
      '<td class="num neto ' + (tot.balance > 0 ? 'mas' : tot.balance < 0 ? 'menos' : '') + '">' + netoTxt(tot.balance) + '</td><td>' +
      plural(tot.total, 'jugada', 'jugadas') + (tot.nula ? ' · ' + plural(tot.nula, 'nula', 'nulas') : '') + (tot.pendiente ? ' · ' + tot.pendiente + ' ⏳' : '') +
      '</td><td></td><td></td><td class="num">' + dinero(tot.apostado) + '</td></tr></tbody></table></div>' +
      '<p class="criterio">Neto: lo que se ganó encima de la apuesta en las ganadas, menos lo apostado en las perdidas; la apuesta total cuenta solo las ya resueltas.</p>';
    h += '<h2><span class="emoji">🎚️</span>Por nivel</h2><div class="tabla-caja tabla-scroll"><table>' + cab + '<tbody>' +
      Object.keys(NIVELES).map(function (k) {
        var del = sels.filter(function (s) { return (s.nivel || 'fuerte') === k; });
        return del.length ? filaConteo(NIVELES[k].e + ' ' + NIVELES[k].t, del, mapas) : '';
      }).join('') + '</tbody></table></div>';
    if (porSemana) {
      var sems = unicos(sels.map(function (s) { return lunesDe(s.fecha); })).sort();
      h += '<h2><span class="emoji">📅</span>Por semana <span class="cuenta">lunes a domingo</span></h2><div class="tabla-caja tabla-scroll"><table>' + cab + '<tbody>' +
        sems.map(function (w) {
          return filaConteo(rangoSemana(w), sels.filter(function (s) { return lunesDe(s.fecha) === w; }), mapas);
        }).join('') + '</tbody></table></div>';
    }
    return h;
  }
  /* la imagen para redes ya no se hace sola: solo cuando se pide */
  function bloqueImagenRep() {
    repBlob = null;
    return '<h2><span class="emoji">🖼️</span>Imagen para redes</h2><p class="criterio">No se crea sola: tócala cuando quieras publicar.</p>' +
      '<button type="button" class="boton secundario rep-crear" data-accion="gz-rep-imagen">🖼️ Crear imagen para redes</button>' +
      '<div id="rep-salida" hidden><div class="gz-vista rep-vista preparando"><img id="rep-img" alt="Imagen para redes"></div>' +
      '<button type="button" class="boton gz-compartir" data-accion="gz-rep-compartir">📤 Compartir</button>' +
      '<div class="gz-mas"><button type="button" class="boton secundario" data-accion="gz-rep-descargar">⬇️ Descargar imagen</button></div></div>';
  }
  /* ---------------------------------------------------------------- historial mensual (como el calendario
     de temporada que mando Javier): mes en letra manuscrita, "HISTORIAL MENSUAL", una casilla por
     seleccion del dia (verde ganada, negra perdida) y abajo el marco con el record y el avatar */
  function azar(k) { return function () { k = (k * 16807) % 2147483647; return (k - 1) / 2147483646; }; }   // con semilla
  var MANUSCRITA = '"Snell Roundhand", "Segoe Script", "Dancing Script", "Brush Script MT", cursive';
  function finDeMes(m) { var d = fecha(m + '-01'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); }
  function mesMas(m, k) { var d = fecha(m + '-01'); d.setUTCMonth(d.getUTCMonth() + k); return iso(d).slice(0, 7); }
  function nombreMes(m) { var t = MESES[+m.slice(5, 7) - 1]; return t.charAt(0).toUpperCase() + t.slice(1); }
  function modosRep(activo) {
    return '<div class="conmutador rep-modos" role="group" aria-label="Tipo de reporte">' +
      '<a href="#/reporte" aria-current="' + (activo === 'dias') + '">📆 Por días (hasta 10)</a>' +
      '<a href="#/reporte?mes=' + hoy().slice(0, 7) + '" aria-current="' + (activo === 'mes') + '">🗓️ Mensual</a></div>';
  }
  function vReporteMes(mes) {
    var desde = mes + '-01', hasta = finDeMes(mes), semanas = semanasEntre(desde, hasta), m0 = hoy().slice(0, 7);
    return Hist.cargar(semanas).then(function () {
      var sels = Hist.lista(semanas).filter(function (s) { return s.fecha >= desde && s.fecha <= hasta; });
      return mapasHist(sels).then(function (mapas) {
        var n = contarHist(sels, mapas), h = cabeceraRes('reporte') + modosRep('mes');
        h += '<form class="rep-form" id="rep-mes"><label class="gz-campo"><span>Mes</span><input type="month" name="mes" value="' + mes + '"></label>' +
          '<button type="submit" class="boton">Ver mes</button></form>' +
          '<nav class="filtros rep-atajos" aria-label="Meses">' + [['Este mes', m0], ['Mes pasado', mesMas(m0, -1)], ['Hace dos meses', mesMas(m0, -2)]]
            .map(function (x) { return '<a href="#/reporte?mes=' + x[1] + '" aria-current="' + (x[1] === mes) + '">' + x[0] + '</a>'; }).join('') + '</nav>';
        if (!sels.length) {
          return pintar(h + vacio('📭', 'No hay selecciones guardadas en ' + nombreMes(mes).toLowerCase() + ' de ' + mes.slice(0, 4) + '.'), 'Reporte mensual');
        }
        h += marcadorHist(n) +
          (n.pendiente ? '<p class="nota">⏳ ' + plural(n.pendiente, 'selección sigue pendiente', 'selecciones siguen pendientes') +
            ': márcalas en <a href="#/historial">📚 Historial</a> (en la imagen del mes no salen las pendientes).</p>' : '') +
          tablasRep(sels, mapas, true) + bloqueImagenRep();
        repActual = { R: { sels: sels, mapas: mapas, mes: mes, n: n }, planear: planMes, pintar: pintarMes, nombre: 'historial-green-zone-' + mes + '.png' };
        pintar(h, 'Reporte mensual');
      });
    });
  }
  /* casillas del mes (sin las pendientes): verde ganada, negra perdida, gris nula; en cada una solo
     el dia, los deportes que se apostaron y el nivel */
  var COLOR_MES = { ganada: REP.VERDE, perdida: '#16191d', nula: '#8f99a5' };
  function angosto(c, t, x, y, k, alin) {           // letra "condensada": el sistema no la trae, se estrecha
    var w = c.measureText(t).width * k, x0 = alin === 'center' ? x - w / 2 : alin === 'right' ? x - w : x;
    c.save(); c.translate(x0, y); c.scale(k, 1); c.textAlign = 'left'; c.fillText(t, 0, 0); c.restore();
    return w;
  }
  var contornos = {};
  function emojiConContorno(c, e, xDer, yCentro, tam) {       // devuelve el ancho; se alinea a la derecha
    var k = e + '|' + tam;
    if (!contornos[k]) {
      var g = Math.ceil(tam * 1.5), borde = Math.max(2, Math.round(tam / 11));
      var a = document.createElement('canvas'); a.width = a.height = g;
      var x = a.getContext('2d');
      letra(x, 400, tam); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(e, g / 2, g / 2);
      var ancho = Math.min(g, x.measureText(e).width);
      var b = document.createElement('canvas'); b.width = b.height = g + 2 * borde;
      var y = b.getContext('2d');
      for (var ang = 0; ang < 16; ang++) {
        y.drawImage(a, borde + Math.cos(ang * Math.PI / 8) * borde, borde + Math.sin(ang * Math.PI / 8) * borde);
      }
      y.globalCompositeOperation = 'source-in'; y.fillStyle = '#16191d'; y.fillRect(0, 0, b.width, b.height);
      y.globalCompositeOperation = 'source-over'; y.drawImage(a, borde, borde);
      contornos[k] = { lienzo: b, ancho: ancho + 2 * borde };
    }
    var q = contornos[k];
    c.drawImage(q.lienzo, xDer - q.ancho / 2 - q.lienzo.width / 2, yCentro - q.lienzo.height / 2);
    return q.ancho;
  }
  function planMes(c, R) {
    var W = 1080, sels = R.sels.filter(function (s) { return estadoSel(s, R.mapas).e !== 'pendiente'; }), n = sels.length;
    var cols = n <= 32 ? 4 : n <= 50 ? 5 : 6;
    var MX = { 4: 92, 5: 72, 6: 56 }[cols], GX = { 4: 30, 5: 24, 6: 18 }[cols], GY = 24;
    var tw = (W - 2 * MX - (cols - 1) * GX) / cols, th = Math.round(tw * 0.52), filas = Math.max(1, Math.ceil(n / cols));
    var y0 = 350, alto = y0 + filas * (th + GY) - GY + 34 + 88 + 50 + 92 + 60 + 70;
    var extra = Math.max(0, 1200 - alto);                        // un mes corto no queda apretado arriba
    y0 += extra * 0.4;
    var finGrid = y0 + filas * (th + GY) - GY, yLey = finGrid + 34, yRec = yLey + 88 + 50 + extra * 0.3, yFrase = yRec + 92 + 60 + extra * 0.3;
    return { W: W, H: yFrase + 70, sels: sels, cols: cols, MX: MX, GX: GX, GY: GY, tw: tw, th: th, y0: y0,
      yLey: yLey, yRec: yRec, yFrase: yFrase };
  }
  function pintarMes(c, A, R, P) {
    var W = P.W, H = P.H, NEGRO = '#16191d';
    c.fillStyle = '#f4f6f8'; c.fillRect(0, 0, W, H);
    var r = azar(7 + P.sels.length);
    for (var i = 0; i < W * H / 90; i++) {                       // textura suave, como el papel de la referencia
      c.globalAlpha = 0.25 + r() * 0.4; c.fillStyle = r() < 0.5 ? '#ffffff' : '#dfe4ea';
      c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    c.globalAlpha = 1; c.textBaseline = 'alphabetic';
    /* la pestana de arriba, en verde: logo | GREEN ZONE */
    letra(c, 900, 30); espaciado(c, 1);
    var tw0 = c.measureText('GREEN ZONE').width, lh = 58, lw = A.logo ? lh * A.logo.width / A.logo.height : 0, bw = 24 + lw + 36 + tw0 + 30;
    var bx = (W - bw) / 2;
    c.fillStyle = REP.VERDE_OSC; redondo(c, bx, -24, bw, 110, 20); c.fill();
    c.lineWidth = 3; c.strokeStyle = NEGRO; redondo(c, bx, -24, bw, 110, 20); c.stroke();
    if (A.logo) { c.drawImage(A.logo, bx + 24, 12, lw, lh); }
    c.fillStyle = 'rgba(255, 255, 255, .7)'; c.fillRect(bx + 24 + lw + 17, 16, 2, 50);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText('GREEN ZONE', bx + 24 + lw + 36, 52);
    espaciado(c, 0);
    /* el titulo: el mes y el ano, grandes, en cursiva condensada */
    letra(c, 800, 26, 'italic'); espaciado(c, 7); c.fillStyle = REP.VERDE_OSC; c.textAlign = 'center';
    c.fillText('HISTORIAL MENSUAL · BY PICKSIN', W / 2, 160); espaciado(c, 0);
    var titulo = nombreMes(R.mes).toUpperCase() + ' ' + R.mes.slice(0, 4), tt = 170;
    letra(c, 900, tt, 'italic');
    while (tt > 60 && c.measureText(titulo).width * 0.78 > W - 150) { tt -= 4; letra(c, 900, tt, 'italic'); }
    c.fillStyle = REP.AZUL; espaciado(c, -2); angosto(c, titulo, W / 2, 160 + Math.round(tt * 0.84), 0.78, 'center'); espaciado(c, 0);
    /* las casillas: la ultima fila va centrada */
    var n = P.sels.length;
    P.sels.forEach(function (s, k) {
      var fila = Math.floor(k / P.cols), enFila = Math.min(P.cols, n - fila * P.cols), col = k % P.cols;
      var x = P.MX + ((P.cols - enFila) * (P.tw + P.GX)) / 2 + col * (P.tw + P.GX), y = P.y0 + fila * (P.th + P.GY);
      var e = estadoSel(s, R.mapas).e, niv = NIVELES[s.nivel] || NIVELES.fuerte;
      c.fillStyle = COLOR_MES[e]; redondo(c, x, y, P.tw, P.th, 12); c.fill();
      c.lineWidth = 3; c.strokeStyle = NEGRO; redondo(c, x, y, P.tw, P.th, 12); c.stroke();
      var cx = x + P.th * 0.36, cy = y + P.th / 2, rr = P.th * 0.24;
      c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, rr, 0, 2 * Math.PI); c.stroke(); c.restore();
      c.save(); c.translate(cx, cy); c.scale(rr * 0.55 / 11, rr * 0.55 / 11); iconoRes(c, e, 0, 0, '#ffffff'); c.restore();
      letra(c, 900, Math.round(P.th * 0.54)); c.fillStyle = '#ffffff';
      angosto(c, String(fecha(s.fecha).getUTCDate()), x + P.th * 0.7, y + P.th * 0.72, P.cols > 4 ? 0.78 : 0.86, 'left');
      var deportes = unicos(s.patas.map(function (p) { return deporteDe(p)[0]; })).slice(0, P.cols > 4 ? 2 : 3);
      var te = Math.round(P.th * (deportes.length > 1 ? 0.21 : 0.26)), xe = x + P.tw - 10;
      for (var d = deportes.length - 1; d >= 0; d--) { xe -= emojiConContorno(c, deportes[d], xe, y + P.th * 0.3, te) + 2; }
      emojiConContorno(c, niv.e, x + P.tw - 10, y + P.th * 0.72, Math.round(P.th * 0.28));
    });
    /* la explicacion de los colores y de los niveles, en pequeno */
    var ley = [['ganada', 'GANADA'], ['perdida', 'PERDIDA'], ['nula', 'NULA']];
    letra(c, 900, 20);
    var anchos = ley.map(function (l) { return 38 + 10 + c.measureText(l[1]).width; }), total = anchos.reduce(function (a, b) { return a + b; }, 0) + 34 * 2;
    var lx = (W - total) / 2, ly = P.yLey;
    ley.forEach(function (l, i) {
      c.fillStyle = COLOR_MES[l[0]]; redondo(c, lx, ly, 38, 20, 5); c.fill();
      c.lineWidth = 2; c.strokeStyle = NEGRO; redondo(c, lx, ly, 38, 20, 5); c.stroke();
      letra(c, 900, 20); c.fillStyle = NEGRO; c.textAlign = 'left'; c.fillText(l[1], lx + 48, ly + 18);
      lx += anchos[i] + 34;
    });
    letra(c, 800, 19); espaciado(c, 1);
    var nv = Object.keys(NIVELES).map(function (k) { return [NIVELES[k].e, NIVELES[k].t.toUpperCase()]; });
    var an = nv.map(function (v) { return 30 + c.measureText(v[1]).width; }), tot = an.reduce(function (a, b) { return a + b; }, 0) + 40 * (nv.length - 1);
    var nx = (W - tot) / 2;
    nv.forEach(function (v, i) {
      emojiConContorno(c, v[0], nx + 24, ly + 50, 22);
      letra(c, 800, 19); espaciado(c, 1); c.fillStyle = '#56677c'; c.textAlign = 'left'; c.fillText(v[1], nx + 30, ly + 57);
      nx += an[i] + 40;
    });
    espaciado(c, 0);
    /* el record del mes, en la pastilla negra */
    var nn = R.n, ef = nn.efectividad == null ? '—' : Math.round(nn.efectividad * 100) + '%';
    var partes = [['RÉCORD DEL MES', 800, 19, 'rgba(255, 255, 255, .75)', 4], [nn.ganada + '–' + nn.perdida, 900, 54, '#ffffff', 0],
      ['·', 900, 40, 'rgba(255, 255, 255, .5)', 0], [ef, 900, 54, REP.VERDE, 0], ['EFECTIVIDAD', 800, 19, 'rgba(255, 255, 255, .75)', 4]];
    var anchos2 = partes.map(function (p) { letra(c, p[1], p[2]); espaciado(c, p[4]); return c.measureText(p[0]).width; });
    espaciado(c, 0);
    var pw = anchos2.reduce(function (a, b) { return a + b; }, 0) + 22 * (partes.length - 1) + 80, ph = 92;
    var px = (W - pw) / 2, py = P.yRec;
    c.fillStyle = NEGRO; redondo(c, px, py, pw, ph, ph / 2); c.fill();
    var xx = px + 40;
    partes.forEach(function (p, i) {
      letra(c, p[1], p[2]); espaciado(c, p[4]); c.fillStyle = p[3]; c.textAlign = 'left';
      c.fillText(p[0], xx, py + ph / 2 + p[2] * 0.36); xx += anchos2[i] + 22;
    });
    espaciado(c, 0);
    /* abajo, la frase: "ES CIENCIA" mas marcado */
    var f1 = 'NO ES SUERTE,  ', f2 = 'ES CIENCIA';
    letra(c, 700, 34, 'italic'); espaciado(c, 4); var w1 = c.measureText(f1).width;
    letra(c, 900, 46, 'italic'); espaciado(c, 4); var w2 = c.measureText(f2).width;
    var fx2 = (W - w1 - w2) / 2, fy = P.yFrase + 44;
    c.textAlign = 'left';
    letra(c, 700, 34, 'italic'); espaciado(c, 4); c.fillStyle = '#6b7a8c'; c.fillText(f1, fx2, fy);
    letra(c, 900, 46, 'italic'); espaciado(c, 4); c.fillStyle = REP.VERDE_OSC; c.fillText(f2, fx2 + w1, fy);
    espaciado(c, 0);
  }
  function generarRep(R, planear, pintarCon, nombre) {
    var turno = ++repTurno;
    repBlob = null;
    recursosRep().then(function (A) {
      var l = document.createElement('canvas');
      l.width = 1080; l.height = 16;
      var plan = planear(l.getContext('2d'), R);
      l.height = plan.H;
      pintarCon(l.getContext('2d'), A, R, plan);
      return new Promise(function (ok) { l.toBlob(ok, 'image/png'); });
    }).then(function (b) {
      if (turno !== repTurno || !b) { return; }
      repBlob = b;
      if (repUrl) { URL.revokeObjectURL(repUrl); }
      repUrl = URL.createObjectURL(b);
      repNombre = nombre;
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

  /* ================================================================== inicio */
  /* Pedido de Javier (01/10): al inicio, como esta ordenada la pagina y como leer un pick, con su
     logo, su avatar y su lema, "algo que al verlo cada dia me motive y me recuerde todo el trabajo
     que llevo invertido". El lema, una frase del dia que rota, el trabajo en numeros (todo sale de
     los datos publicados) y la entrada animada, que se ve la primera vez de cada dia. */
  var MOTOR_DESDE = '2026-09-21';                    // Motor Picksin 2.0 instalado
  var FRASES = ['Cada pick tiene detrás miles de datos.', 'El método le gana a la corazonada.', 'Disciplina hoy, green mañana.',
    'Los números no se cansan, y yo tampoco.', 'Paciencia, proceso y probabilidad.', 'Lo que se mide, se mejora.',
    'Construido partido a partido.', 'No adivino: calculo.', 'Un mal día no cambia la estadística.', 'Constancia antes que suerte.',
    'Cada auditoría me hace más fuerte.', 'El trabajo de hoy es la ventaja de mañana.'];
  function fraseDelDia() { return FRASES[Math.floor(fecha(hoy()) / 864e5) % FRASES.length]; }
  var MILES = function (x) { return x == null ? '—' : Number(x).toLocaleString('es-MX'); };
  /* rapido (para la entrada): solo el indice; completo (para el Inicio): tambien escogidos y Green Zone */
  function datosTrabajo(completo) {
    return Promise.all([indice(), completo ? cargarTodo().catch(function () { return null; }) : null,
      completo && Editor.activo ? Hist.cargar(ventanaHist(), true).then(function () {
        var sl = Hist.lista(ventanaHist());
        return mapasHist(sl).then(function (m) { return contarHist(sl, m); });
      }, function () { return null; }) : null]).then(function (x) {
      var idx = x[0], tr = idx.trabajo || {}, aud = 0, ok = 0, jornadas = 0;
      idx.ligas.forEach(function (L) { if (L.acierto) { aud += L.acierto.picks; ok += L.acierto.aciertos; } });
      (idx.semanas || []).forEach(function (w) { jornadas += w.analisis || 0; });
      var e = x[1] ? contar(x[1].picks, x[1].mapas) : null;
      return { ligas: idx.ligas.length, partidos: tr.partidos, datos: tr.datos, jornadas: jornadas, auditados: aud,
        acierto: aud ? ok / aud : null, escogidos: e, green: x[2], dias: diasEntre(MOTOR_DESDE, hoy()) };
    });
  }
  /* los numeros suben desde cero (respeta "reducir movimiento") */
  function contarHasta(raiz, ms) {
    var quieto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    $$('[data-n]', raiz).forEach(function (el) {
      var fin = parseFloat(el.getAttribute('data-n')), dec = +(el.getAttribute('data-dec') || 0), suf = el.getAttribute('data-suf') || '', t0 = null;
      var fmt = function (v) { return (dec ? v.toFixed(dec) : MILES(Math.round(v))) + suf; };
      if (quieto || !window.requestAnimationFrame) { el.textContent = fmt(fin); return; }
      var paso = function (t) {
        if (t0 == null) { t0 = t; }
        var k = Math.min(1, (t - t0) / ms), suave = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(fin * suave);
        if (k < 1) { requestAnimationFrame(paso); }
      };
      requestAnimationFrame(paso);
    });
  }
  function numero(v, dec, suf) {
    return v == null ? '—' : '<b data-n="' + v + '"' + (dec ? ' data-dec="' + dec + '"' : '') + (suf ? ' data-suf="' + suf + '"' : '') + '>0</b>';
  }
  function guiaHTML() {
    var fila = function (x) { return '<li class="fila"><span class="m">' + x[0] + ' ' + x[1] + '</span><span></span><span class="pt">' + x[2] + '</span></li>'; };
    return '<h2 id="s-ordenada"><span class="emoji">🗺️</span>Cómo está ordenada la página</h2><div class="tabla-caja"><ul class="lista">' +
      [['🏠', 'Hoy', 'todos los picks de hoy, mañana y pasado mañana de todas las ligas, por partido, por probabilidad o en el ⭐ Top de tops (los más seguros del día); los escogidos del día y lo pendiente.'],
        ['📊', 'Análisis', 'cada liga con su jornada (semana del ciclo de su deporte: fútbol de jueves a miércoles) y su auditoría.'],
        ['✅', 'Escogidos', 'los picks escogidos de hoy en adelante, por día o por liga.'],
        ['🟢', 'Del día', 'arma la selección del día de Green Zone: primero se guarda y luego se comparte.'],
        ['🏅', 'Resultados', 'la semana de lunes a domingo, el ranking de seleccionadores y, para los seleccionadores, el historial y los reportes de la selección del día.']
      ].map(fila).join('') + '</ul></div>' +
      '<h2 id="s-leer"><span class="emoji">🧭</span>Cómo leer un pick</h2><div class="tabla-caja"><ul class="lista">' +
      [['📈', 'Probabilidad', 'lo que el Motor Picksin 2.0 calcula para ese mercado, ya calibrado.'],
        ['🎟️', 'Cuota implícita', 'la cuota que corresponde a esa probabilidad.'],
        ['⚖️', 'Respaldo bilateral', 'cuántos de los cuatro componentes (lo que hace cada equipo y lo que permite su rival) apoyan el pick.'],
        ['🟢', 'Confianza', 'Alta, Media o Baja según la solidez de la muestra y la consistencia del partido.'],
        ['🏆', 'TOP 5 y sugeridos', 'los mejores picks de la jornada y los de cada uno de los cinco criterios; los demás salen en los rankings por mercado.'],
        ['✅', 'Escogido', 'pick seleccionado; su resultado se ve en «Resultados».'],
        ['👤', 'Seleccionador', 'quién lo escogió: ' + Object.keys(COLORES).map(persona).join(' ') + '. Cada quien lleva su cuenta en el ranking.']
      ].map(fila).join('') + '</ul></div>';
  }
  function vInicio() {
    return datosTrabajo(true).then(function (D) {
      var e = D.escogidos, g = D.green;
      var h = '<section class="hero-lema"><div class="lema-agua" aria-hidden="true">' + aguaHTML() + '</div>' +
        '<div class="hero-figuras"><img class="hero-logo" src="assets/logo.webp" alt="Picksin" width="150" height="177">' +
        '<img class="hero-avatar" src="assets/avatar.webp" alt=""></div>' +
        '<p class="hero-lema-txt"><span>NO ES SUERTE,</span> <b>ES CIENCIA</b></p>' +
        '<p class="hero-frase">“' + esc(fraseDelDia()) + '”</p>' +
        '<button type="button" class="boton secundario hero-btn" data-accion="intro">▶ Ver la entrada otra vez</button></section>';
      h += '<h2><span class="emoji">💪</span>Tu trabajo en números</h2><div class="trabajo">' + [
        ['🌎', numero(D.ligas), 'ligas en análisis'],
        ['⚽', numero(D.partidos), 'partidos estudiados esta temporada'],
        ['🔢', numero(D.datos), 'datos procesados por el motor'],
        ['📊', numero(D.jornadas), 'jornadas analizadas y archivadas'],
        ['🔍', numero(D.auditados), 'picks auditados contra el resultado real'],
        ['🎯', D.acierto == null ? '—' : numero(+(D.acierto * 100).toFixed(1), 1, '%'), D.acierto == null ? 'de acierto real: sale con la primera auditoría' : 'de acierto real del motor'],
        ['✅', e ? numero(e.total) : '—', 'picks escogidos' + (e && e.acierto != null ? ' · ' + pct(e.acierto) + ' de acierto' : '')],
        ['🟢', g ? '<b>' + g.ganada + '–' + g.perdida + '</b>' : '—', 'selecciones del día ganadas–perdidas'],
        ['📅', numero(D.dias), 'días con el Motor Picksin 2.0']
      ].filter(function (x) { return !(x[0] === '🟢' && !Editor.activo); }).map(function (x) {
        return '<div class="trabajo-dato"><span class="emoji" aria-hidden="true">' + x[0] + '</span>' + x[1] + '<small>' + x[2] + '</small></div>';
      }).join('') + '</div>';
      h += guiaHTML();
      pintar(h, 'Inicio');
      contarHasta($('#app'), 1400);
    });
  }
  function aguaHTML(n) {
    var renglon = '<span>NO ES SUERTE, <b>ES CIENCIA</b> · NO ES SUERTE, <b>ES CIENCIA</b> · NO ES SUERTE, <b>ES CIENCIA</b> · </span>', h = '';
    for (var i = 0; i < (n || 8); i++) { h += '<div>' + renglon + renglon + '</div>'; }
    return h;
  }
  /* La entrada (pedido de Javier, 01/10): 5 s de animacion (el escudo, el avatar que cambia de pose
     hasta festejar, el lema que se escribe y se estampa, la frase del dia y el trabajo en numeros) y
     5 s quieta para que se pueda leer todo; luego pasa sola al Inicio (o a la seccion del enlace) y no
     se repite. Se ve una vez cada que alguien entra a la pagina, toca el logo o toca "Ver la entrada
     otra vez". "Entrar" (visible desde el principio) la salta; tocar el fondo no la cierra. */
  var DURA_ANIMACION = 5000, DURA_QUIETA = 5000, introReloj = null, introTecla = null;
  function entrada() {
    var previa = $('#intro');
    if (previa) { previa.parentNode.removeChild(previa); }
    clearTimeout(introReloj);
    if (introTecla) { document.removeEventListener('keydown', introTecla); }
    var t0 = Date.now(), v = document.createElement('div');
    v.className = 'intro';
    v.id = 'intro';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-label', 'Picksin: no es suerte, es ciencia');
    v.innerHTML = '<div class="lema-agua intro-agua" aria-hidden="true">' + aguaHTML(30) + '</div><div class="intro-centro">' +
      '<img class="intro-logo" src="assets/logo.webp" alt="Picksin">' +
      '<div class="intro-avatar" aria-hidden="true"><img class="pose p1" src="assets/avatar.webp" alt=""><img class="pose p2" src="assets/avatar-brazos.webp" alt="">' +
      '<img class="pose p3" src="assets/avatar-festejo.webp" alt=""></div>' +
      '<p class="intro-lema"><span class="l1">NO ES SUERTE,</span><b class="l2">ES CIENCIA</b></p>' +
      '<p class="intro-frase">“' + esc(fraseDelDia()) + '”</p><div class="intro-datos"></div><p class="intro-dia"></p></div>' +
      '<button type="button" class="intro-entrar">Entrar ›</button>';
    document.body.appendChild(v);
    document.body.classList.add('con-intro');
    var cerrar = function () {
      if (!v.parentNode || v.classList.contains('saliendo')) { return; }
      clearTimeout(introReloj);
      document.removeEventListener('keydown', introTecla);
      v.classList.add('saliendo');
      setTimeout(function () {
        if (v.parentNode) { v.parentNode.removeChild(v); }
        if (!$('#intro')) { document.body.classList.remove('con-intro'); }
      }, 380);
    };
    $('.intro-entrar', v).addEventListener('click', cerrar);
    introTecla = function (ev) { if (ev.key === 'Escape' || ev.key === 'Enter') { cerrar(); } };
    document.addEventListener('keydown', introTecla);
    introReloj = setTimeout(cerrar, DURA_ANIMACION + DURA_QUIETA);
    datosTrabajo(false).then(function (D) {
      var caja = $('.intro-datos', v);
      if (!caja) { return; }
      caja.innerHTML = [[numero(D.partidos), 'partidos estudiados'], [numero(D.datos), 'datos procesados'],
        D.acierto == null ? [numero(D.jornadas), 'jornadas analizadas'] : [numero(+(D.acierto * 100).toFixed(1), 1, '%'), 'de acierto en ' + MILES(D.auditados) + ' picks']]
        .map(function (x) { return '<div>' + x[0] + '<small>' + x[1] + '</small></div>'; }).join('');
      $('.intro-dia', v).textContent = 'Día ' + D.dias + ' con el Motor Picksin 2.0 · ' + D.ligas + ' ligas';
      setTimeout(function () { contarHasta(caja, 1300); }, Math.max(0, 3500 - (Date.now() - t0)));   // suben de 3.5 a 4.8 s
    }, function () { /* sin datos: la entrada sale sin numeros */ });
  }

  /* ================================================================== navegacion */
  var VISTAS = { '': vInicio, hoy: vHoy, analisis: vAnalisis, auditoria: vAuditoria, escogidos: vEscogidos, resultados: vResultados,
    ranking: vRanking, seleccionadores: vSeleccionadores, green: vGreen, historial: vHistorial, reporte: vReporte, liga: vIrALiga,
    inicio: vInicio, ayuda: vInicio };
  var rutaAnterior = null;
  function router(repintar) {
    var h = location.hash.replace(/^#\/?/, ''), q = '', i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var partes = h.split('/').filter(Boolean).map(decodeURIComponent);
    var seccion = partes.shift() || '';
    var vista = VISTAS[seccion];
    if (!vista) { location.replace('#/'); return Promise.resolve(); }
    var enMenu = { '': 'inicio', historial: 'resultados', reporte: 'resultados', ranking: 'resultados', seleccionadores: 'resultados',
      auditoria: 'analisis' }[seccion] || seccion;
    $$('.nav a').forEach(function (a) {
      if (a.getAttribute('data-nav') === enMenu) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
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
      if (el && el.tagName === 'DETAILS') { el.open = true; }          // TOP 5 y sugeridos van plegados
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }
    else if (a === 'editor') { if (Editor.activo) { salir(); } else { abrirDialogo(); } }
    else if (a === 'intro' || a === 'logo') { entrada(); }
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
    else if (a === 'gz-ir-armar') { location.hash = '#/green'; }
    else if (a === 'gz-hs-borrar') { accionHist(t, 'quitar'); }
    else if (a === 'gz-rep-compartir') { compartirRep(); }
    else if (a === 'gz-rep-imagen') {
      if (repActual && $('#rep-salida')) {
        t.hidden = true;
        $('#rep-salida').hidden = false;
        generarRep(repActual.R, repActual.planear, repActual.pintar, repActual.nombre);
      }
    }
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
    else if ((a === 'gz-descargar' || a === 'gz-copiar') && !guardadaGZ()) { avisar('🔒 Primero guárdala en el historial.'); }
    else if (a === 'gz-descargar') { if (!gzBlob || !descargarGZ()) { avisar('⏳ La imagen se está preparando: vuelve a tocar en un segundo.'); } }
    else if (a === 'gz-copiar') {
      if (!textoGZ()) { avisar('Todavía no hay justificación ni probabilidad que copiar.'); return; }
      copiarTexto(textoGZ()).then(function () { avisar('📋 Texto copiado: pégalo en el grupo.'); },
        function () { avisar('⚠️ No se pudo copiar el texto en este navegador.'); });
    }
    else if (a === 'gz-limpiar') {
      if (GZ.patas.length && !guardadaGZ() && !confirm('Esta jugada no está guardada en el historial. ¿Borrarla de todos modos?')) { return; }
      GZ.patas = []; GZ.total = null; GZ.hechos = null; GZ.ids = null; GZ.guardado = null; guardarGZ();
      $$('.gz-item').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      pintarPanelGZ();
    }
  }
  document.addEventListener('submit', function (e) {
    if (e.target.id === 'gz-otro') {
      e.preventDefault();
      location.hash = /^\d{4}-\d{2}-\d{2}$/.test(e.target.dia.value) ? '#/green?dia=' + e.target.dia.value : '#/green';
      return;
    }
    if (e.target.id === 'rep-mes') {
      e.preventDefault();
      if (/^\d{4}-\d{2}$/.test(e.target.mes.value)) { location.hash = '#/reporte?mes=' + e.target.mes.value; }
      return;
    }
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
      avisoMarcar();
    }).catch(function (x) {
      err.textContent = x.message; err.hidden = false;
    }).then(function () { b.disabled = false; b.textContent = 'Entrar'; });
  });

  window.addEventListener('hashchange', function () { router(); });
  pintarEditor('ok');
  router();
  avisoMarcar();
  entrada();
})();
