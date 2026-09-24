/* Picksin 2026 — pinta la portada y la pagina de cada liga a partir de data/*.json.
   Todo el contenido sale de los datos que genera publicar_sitio.py: aqui no se calcula
   ninguna probabilidad, solo se muestra. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var pct = function (p) { return p == null ? '—' : (p * 100).toFixed(1) + '%'; };
  var num = function (x, d) { return x == null ? '—' : Number(x).toFixed(d == null ? 1 : d); };

  function cargar(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) { throw new Error('No se pudo cargar ' + url + ' (' + r.status + ')'); }
      return r.json();
    });
  }

  function fallo(e) {
    $('#app').innerHTML = '<p class="vacio error">' + esc(e.message) + '</p>';
  }

  function chipConfianza(c) {
    if (!c) { return ''; }
    var k = String(c).toLowerCase();
    var cls = k.indexOf('alta') === 0 ? 'alta' : (k.indexOf('media') === 0 ? 'media' : 'baja');
    return '<span class="chip ' + cls + '">Confianza ' + esc(c) + '</span>';
  }

  function tarjeta(p, cabecera) {
    if (!p) { return ''; }
    var chips = [chipConfianza(p.confianza)];
    if (p.cuota) { chips.push('<span class="chip neutro">Cuota implícita ' + esc(num(p.cuota, 2)) + '</span>'); }
    if (p.respaldo) { chips.push('<span class="chip neutro" title="Lo que hace cada equipo y lo que permite el rival">Respaldo ' + esc(p.respaldo) + '</span>'); }
    if (p.liga_joven) { chips.push('<span class="chip">Liga joven</span>'); }
    return '<article class="pick">' + (cabecera || '') +
      '<div class="pick-cab"><span class="mercado">' + esc(p.mercado) + '</span>' +
      '<span class="prob">' + pct(p.p) + '</span></div>' +
      '<div class="pick-partido">' + esc(p.partido) + (p.dia ? ' · ' + esc(p.dia) : '') + '</div>' +
      (p.aviso ? '<p class="nota">' + esc(p.aviso) + '</p>' : '') +
      '<div class="pick-pie">' + chips.join('') + '</div></article>';
  }

  /* ------------------------------------------------------------------ portada */
  function portada() {
    cargar('data/index.json').then(function (d) {
      $('#actualizado').textContent = 'Actualizado el ' + d.generado;
      var porPais = [], idx = {};
      d.ligas.forEach(function (L) {
        if (!(L.pais in idx)) { idx[L.pais] = porPais.length; porPais.push({ pais: L.pais, bandera: L.bandera, ligas: [] }); }
        porPais[idx[L.pais]].ligas.push(L);
      });
      var html = porPais.map(function (g) {
        return '<section><h2>' + esc(g.pais) + '</h2><div class="rejilla">' +
          g.ligas.map(function (L) {
            var estado = L.analisis
              ? 'Jornada <b>' + esc(L.jornada) + '</b> · ' + esc(L.n_top5) + ' en el TOP 5'
              : 'Sin análisis de la próxima jornada';
            var a = L.acierto || {};
            var aud = a.picks
              ? '<div class="liga-linea">Auditado: <b>' + pct(a.acierto) + '</b> en ' + esc(a.picks) + ' picks (prometido ' + pct(a.prometido) + ')</div>'
              : '';
            return '<a class="liga" href="liga.html?l=' + encodeURIComponent(L.id) + '">' +
              '<div class="liga-nombre">' + esc(L.nombre) +
              (L.narrativa ? ' <span class="chip">Con narrativa</span>' : '') +
              (L.liga_joven ? ' <span class="chip neutro">Liga joven</span>' : '') + '</div>' +
              '<div class="liga-linea">' + estado + '</div>' + aud + '</a>';
          }).join('') + '</div></section>';
      }).join('');
      if (d.copas && d.copas.length) {
        html += '<section><h2>Competiciones europeas</h2><p class="vacio">Próximamente: ' +
          d.copas.map(function (c) { return esc(c.nombre); }).join(', ') +
          '. Necesitan un modo propio del motor: cada equipo juega pocos partidos y viene de una liga distinta.</p></section>';
      }
      $('#app').innerHTML = html;
    }).catch(fallo);
  }

  /* ------------------------------------------------------------------ liga */
  function ficha(f) {
    var g = f.goles || {};
    var marc = (g.marcadores || []).map(function (m) { return esc(m[0]) + ' (' + pct(m[1]) + ')'; }).join(' · ');
    var filas = (f.metricas || []).map(function (m) {
      return '<tr><td>' + esc(m.nombre) + '</td><td class="num">' + num(m.total) + '</td>' +
        '<td class="num">' + (m.rango ? esc(m.rango[0]) + '–' + esc(m.rango[1]) : '—') + '</td>' +
        '<td class="num">' + esc(m.linea || '—') + '</td><td class="num">' + pct(m.over) + '</td>' +
        '<td class="num">' + pct(m.local_mas) + '</td></tr>';
    }).join('');
    return '<details><summary>' + esc(f.local) + ' vs ' + esc(f.visitante) +
      (f.dia ? '<span class="cuenta">' + esc(f.dia) + '</span>' : '') + '</summary><div class="cuerpo">' +
      '<div class="x12"><div>Local<b>' + pct(g.p_local) + '</b></div><div>Empate<b>' + pct(g.p_empate) + '</b></div>' +
      '<div>Visitante<b>' + pct(g.p_visitante) + '</b></div></div>' +
      '<div class="datos"><div><span>Goles esperados</span> <b>' + num(g.total, 2) + '</b></div>' +
      '<div><span>Más de 2.5</span> <b>' + pct(g.over25) + '</b></div>' +
      '<div><span>Ambos marcan</span> <b>' + pct(g.btts) + '</b></div>' +
      '<div><span>Gol en el 1T</span> <b>' + pct(g.over05_1t) + '</b></div></div>' +
      (marc ? '<p class="criterio">Marcadores más probables: ' + marc + '</p>' : '') +
      (filas ? '<div class="tabla-scroll"><table><thead><tr><th>Partido completo</th><th class="num">Proyección</th>' +
        '<th class="num">Rango 80%</th><th class="num">Línea</th><th class="num">Más de la línea</th>' +
        '<th class="num">Local hace más</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : '') +
      '</div></details>';
  }

  function auditoria(a) {
    if (!a || !a.jornadas || !a.jornadas.length) {
      return '<p class="vacio">Todavía no hay jornadas auditadas del motor 2.0 en esta liga. ' +
        'Cada jornada jugada se contrasta con el resultado real y aparece aquí.</p>';
    }
    var filas = a.jornadas.map(function (j) {
      return '<tr><td>Jornada ' + esc(j.jornada) + '</td><td class="num">' + esc(j.picks) + '</td>' +
        '<td class="num">' + pct(j.prometido) + '</td><td class="num">' + pct(j.acierto) + '</td></tr>';
    }).join('');
    var t = a.acumulado || {};
    return '<div class="tabla-scroll"><table><thead><tr><th></th><th class="num">Picks</th>' +
      '<th class="num">Prometido</th><th class="num">Acertado</th></tr></thead><tbody>' + filas +
      '<tr><th>Acumulado</th><th class="num">' + esc(t.picks) + '</th><th class="num">' + pct(t.prometido) +
      '</th><th class="num">' + pct(t.acierto) + '</th></tr></tbody></table></div>';
  }

  function liga() {
    var id = new URLSearchParams(location.search).get('l');
    if (!id) { location.replace('./'); return; }
    cargar('data/ligas/' + encodeURIComponent(id) + '.json').then(function (d) {
      document.title = d.nombre + ' · Picksin 2026';
      $('#titulo').textContent = d.nombre;
      $('#actualizado').textContent = d.analisis
        ? 'Jornada ' + d.jornada + ' · generado el ' + d.generado
        : 'Sin análisis de la próxima jornada todavía';
      var h = '';
      if (d.reporte) {
        h += '<a class="boton" href="' + esc(d.reporte) + '">Leer el reporte completo con narrativa</a>';
      }
      if (d.liga_joven) {
        h += '<p class="nota">Liga joven: mientras acumula jornadas, algunas familias de mercados se publican con el ' +
          'comportamiento medido en las otras ligas. Van marcadas con «Liga joven».</p>';
      }
      if (!d.analisis) {
        h += '<p class="vacio">Esta liga aún no tiene análisis de su próxima jornada. Aparecerá aquí en cuanto se genere.</p>';
      } else {
        h += '<h2>TOP 5 de la jornada</h2>' + (d.top5.length
          ? '<div class="grid-picks">' + d.top5.map(function (p) { return tarjeta(p); }).join('') + '</div>'
          : '<p class="vacio">Ningún pick de esta jornada alcanzó el nivel del TOP 5.</p>');
        h += '<h2>Picks sugeridos</h2><div class="grid-picks">' + d.sugeridos.map(function (s) {
          var cab = '<div class="persona">' + esc(s.nombre) + '</div>' +
            (s.criterio ? '<p class="criterio">' + esc(s.criterio) + '</p>' : '');
          return s.pick ? tarjeta(s.pick, cab)
            : '<article class="pick">' + cab + '<p class="criterio">Desierto esta jornada' +
              (s.motivo ? ': ' + esc(s.motivo) : '') + '</p></article>';
        }).join('') + '</div>';
        h += '<h2>Rankings por mercado</h2>' + d.rankings.map(function (r) {
          return '<details><summary>' + esc(r.titulo) + '<span class="cuenta">' + esc(r.total) + '</span></summary>' +
            '<div class="cuerpo">' + (r.no_validable ? '<p class="nota">No validable con la tabla: el orden en que ' +
            'caen los córners no se puede reconstruir, así que estas probabilidades no están auditadas.</p>' : '') +
            '<ul class="lista">' + r.picks.map(function (p) {
              return '<li><span class="m">' + esc(p.mercado) + '</span><span class="pp">' + pct(p.p) + '</span>' +
                '<span class="pt">' + esc(p.partido) + (p.respaldo ? ' · respaldo ' + esc(p.respaldo) : '') + '</span></li>';
            }).join('') + '</ul>' + (r.total > r.picks.length ? '<p class="criterio">Se muestran los ' +
            r.picks.length + ' de mayor respaldo de ' + r.total + '.</p>' : '') + '</div></details>';
        }).join('');
        h += '<h2>Fichas de los partidos</h2>' + d.partidos.map(ficha).join('');
      }
      h += '<h2>Aciertos auditados</h2>' + auditoria(d.auditoria);
      $('#app').innerHTML = h;
    }).catch(fallo);
  }

  window.Picksin = { portada: portada, liga: liga };
})();
