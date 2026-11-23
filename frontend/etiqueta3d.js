// ============ ETIQUETA 3D (para impresión 3D) ============
// Genera en el navegador la etiqueta física del artículo, con el mismo diseño que la
// plantilla "Ejemplo de posible etiqueta": placa base + relieve (texto, líneas, casillas
// y código QR). El QR lleva solo el ID, igual que el QR normal del sistema.
//
// Salida:
//   .3mf -> una pieza con dos partes ("Base" y "Relieve") para asignar un color a cada una.
//   .stl -> una sola malla; en impresoras de un color se pone una pausa a 2.0 mm.
//
// Las librerías (opentype.js, earcut, fflate) se cargan solo la primera vez que se usa.
(function () {
  'use strict';

  // ---------------- Parámetros (mm) ----------------
  const ANCHO = 130, ALTO = 108, RADIO = 6;
  const BASE = 2.0;          // espesor de la placa (color claro)
  const RELIEVE = 0.6;       // altura del relieve sobre la placa (color oscuro)
  const QR_LADO = 32;
  const CONDENSADO = 0.86;   // estrecha el texto horizontalmente
  const MX = 9, X_DER = ANCHO - 9;

  const ZONAS = {
    GR: 'GR · Recepción', VE: 'VE · Reúso', AZ: 'AZ · Reciclaje',
    AM: 'AM · Donación', RO: 'RO · Disposición final', BL: 'BL · Área cerrada',
  };

  const LIBS = [
    'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js',
    'https://cdn.jsdelivr.net/npm/earcut@2.2.4/dist/earcut.min.js',
    'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js',
  ];
  const URL_FUENTE = 'fonts/DejaVuSans-Bold-latin.ttf';

  let fuente = null;
  let cargando = null;

  function cargarScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + url));
      document.head.appendChild(s);
    });
  }

  function prepararLibrerias() {
    if (!cargando) {
      cargando = (async () => {
        for (const url of LIBS) await cargarScript(url);
        fuente = await opentype.load(URL_FUENTE);
      })().catch((e) => { cargando = null; throw e; });
    }
    return cargando;
  }

  // ---------------- Geometría 2D ----------------
  const Y = (d) => ALTO - d; // distancia desde el borde superior -> coordenada Y (hacia arriba)

  function areaFirmada(anillo) {
    let a = 0;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      a += (anillo[j][0] * anillo[i][1]) - (anillo[i][0] * anillo[j][1]);
    }
    return a / 2;
  }

  function orientar(anillo, ccw) {
    return (areaFirmada(anillo) > 0) === ccw ? anillo : anillo.slice().reverse();
  }

  function puntoDentro(p, anillo) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) dentro = !dentro;
    }
    return dentro;
  }

  // Convierte una lista de anillos (contornos de un glifo) en polígonos {exterior, huecos}
  // usando la regla par-impar, que es como se rellenan las letras.
  function anillosAPoligonos(anillos) {
    const info = anillos.map((a) => ({ a, area: Math.abs(areaFirmada(a)) }));
    info.forEach((r, i) => {
      r.prof = 0;
      info.forEach((o, j) => { if (i !== j && o.area > r.area && puntoDentro(r.a[0], o.a)) r.prof++; });
    });
    const exteriores = info.filter((r) => r.prof % 2 === 0)
      .map((r) => ({ r, exterior: orientar(r.a, true), huecos: [] }));
    info.filter((r) => r.prof % 2 === 1).forEach((h) => {
      let mejor = null;
      exteriores.forEach((e) => {
        if (e.r.prof === h.prof - 1 && e.r.area > h.area && puntoDentro(h.a[0], e.r.a)
            && (!mejor || e.r.area < mejor.r.area)) mejor = e;
      });
      if (mejor) mejor.huecos.push(orientar(h.a, false));
    });
    return exteriores.map(({ exterior, huecos }) => ({ exterior, huecos }));
  }

  function limpiarAnillo(pts) {
    const out = [];
    for (const p of pts) {
      const u = out[out.length - 1];
      if (!u || Math.abs(u[0] - p[0]) > 1e-6 || Math.abs(u[1] - p[1]) > 1e-6) out.push(p);
    }
    if (out.length > 1) {
      const a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) out.pop();
    }
    return out.length >= 3 && Math.abs(areaFirmada(out)) > 1e-6 ? out : null;
  }

  function anchoTexto(s, em) {
    return fuente.getAdvanceWidth(s, em) * CONDENSADO;
  }

  function emParaAncho(s, anchoMax, emMax) {
    return Math.min(emMax, 10 * anchoMax / anchoTexto(s, 10));
  }

  // Texto -> polígonos, con la línea base en yBase.
  function texto(s, em, x0, yBase) {
    const polys = [];
    const tx = (x) => x0 + x * CONDENSADO;
    const ty = (y) => yBase - y; // opentype usa Y hacia abajo
    for (const glifo of fuente.getPaths(s, 0, 0, em)) {
      const anillos = [];
      let actual = [], px = 0, py = 0;
      const cerrar = () => { const l = limpiarAnillo(actual); if (l) anillos.push(l); actual = []; };
      for (const c of glifo.commands) {
        if (c.type === 'M') { cerrar(); actual.push([tx(c.x), ty(c.y)]); px = c.x; py = c.y; }
        else if (c.type === 'L') { actual.push([tx(c.x), ty(c.y)]); px = c.x; py = c.y; }
        else if (c.type === 'Q') {
          for (let k = 1; k <= 5; k++) {
            const t = k / 5, u = 1 - t;
            actual.push([tx(u * u * px + 2 * u * t * c.x1 + t * t * c.x), ty(u * u * py + 2 * u * t * c.y1 + t * t * c.y)]);
          }
          px = c.x; py = c.y;
        } else if (c.type === 'C') {
          for (let k = 1; k <= 7; k++) {
            const t = k / 7, u = 1 - t;
            actual.push([
              tx(u * u * u * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x),
              ty(u * u * u * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y),
            ]);
          }
          px = c.x; py = c.y;
        } else if (c.type === 'Z') { cerrar(); }
      }
      cerrar();
      polys.push(...anillosAPoligonos(anillos));
    }
    return polys;
  }

  function rect(x0, y0, x1, y1) {
    return { exterior: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], huecos: [] };
  }

  function anilloRedondeado(x0, y0, x1, y1, r, seg = 16) {
    const pts = [];
    const esquinas = [[x1 - r, y0 + r, -90], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, 90], [x0 + r, y0 + r, 180]];
    for (const [cx, cy, a0] of esquinas) {
      for (let k = 0; k <= seg; k++) {
        const a = (a0 + 90 * k / seg) * Math.PI / 180;
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    return pts;
  }

  function linea(x0, x1, y, grosor = 0.5) {
    return rect(x0, y - grosor / 2, x1, y + grosor / 2);
  }

  function qrPoligonos(id, x, yArriba, lado) {
    const div = document.createElement('div');
    const q = new QRCode(div, { text: id, width: 64, height: 64, correctLevel: QRCode.CorrectLevel.Q });
    const m = q._oQRCode;
    const n = m.getModuleCount();
    const mod = lado / n;
    const e = 0.005; // pequeño traslape para que los módulos vecinos queden unidos
    const polys = [];
    for (let f = 0; f < n; f++) {
      let c = 0;
      while (c < n) {
        if (!m.isDark(f, c)) { c++; continue; }
        const ini = c;
        while (c < n && m.isDark(f, c)) c++;
        polys.push(rect(x + ini * mod - e, yArriba - (f + 1) * mod - e, x + c * mod + e, yArriba - f * mod + e));
      }
    }
    return polys;
  }

  function recortarParaAncho(valor, anchoMax, emMax, emMin) {
    let v = valor;
    while (v.length > 1 && emParaAncho(v, anchoMax, emMax) < emMin) v = v.slice(0, -2) + '…';
    return { v, em: emParaAncho(v, anchoMax, emMax) };
  }

  function disenar({ id, residuo = '', zona = '', fecha = '' }) {
    const p = [];

    // Marco interior
    p.push({
      exterior: anilloRedondeado(3.2, 3.2, ANCHO - 3.2, ALTO - 3.2, RADIO - 1.5),
      huecos: [anilloRedondeado(4.2, 4.2, ANCHO - 4.2, ALTO - 4.2, RADIO - 2.5).reverse()],
    });

    const enc = 'INSTITUTO TECNOLÓGICO DE PACHUCA';
    p.push(...texto(enc, emParaAncho(enc, X_DER - MX, 7), MX, Y(14)));

    const emC = 4.6;
    const campos = [
      ['Residuo:', residuo, X_DER, 22.5],
      ['ID:', id, MX + 58, 30],
      ['Zona:', zona, MX + 58, 37.5],
      ['Fecha de ingreso:', fecha, MX + 88, 45],
    ];
    for (const [etq, valor, xFin, d] of campos) {
      p.push(...texto(etq, emC, MX, Y(d)));
      const xIni = MX + anchoTexto(etq, emC) + 1.5;
      p.push(linea(xIni, xFin, Y(d) - 0.9));
      if (valor) {
        const { v, em } = recortarParaAncho(String(valor), xFin - xIni - 1, emC, 2.8);
        p.push(...texto(v, em, xIni + 0.8, Y(d) + 0.4));
      }
    }

    p.push(...texto('Código QR:', emC, MX, Y(52.5)));
    p.push(...qrPoligonos(id, MX + 44, Y(48.5), QR_LADO));

    const chk = [
      'Verificación de colocación: contenedor correcto [   ];',
      'etiqueta visible [   ]; lectura QR satisfactoria [   ];',
      'identificación de peligrosidad visible, cuando aplique [   ];',
    ];
    const emK = Math.min(...chk.map((s) => emParaAncho(s, X_DER - MX, 4)));
    chk.forEach((s, i) => p.push(...texto(s, emK, MX, Y(87 + i * 5))));
    const d = 87 + 15;
    p.push(...texto('responsable', emK, MX, Y(d)));
    const x1 = MX + anchoTexto('responsable', emK) + 1.2, x2 = MX + 62;
    p.push(linea(x1, x2, Y(d) - 0.7, 0.45));
    p.push(...texto('; fecha', emK, x2 + 0.4, Y(d)));
    const x3 = x2 + 0.4 + anchoTexto('; fecha', emK) + 1.2;
    p.push(linea(x3, X_DER - 2, Y(d) - 0.7, 0.45));
    p.push(...texto('.', emK, X_DER - 1.6, Y(d)));

    const base = [{ exterior: anilloRedondeado(0, 0, ANCHO, ALTO, RADIO), huecos: [] }];
    return { base, relieve: p };
  }

  // ---------------- 3D ----------------
  function nuevaMalla() { return { v: [], t: [] }; }

  function extruir(malla, poly, z0, z1) {
    const anillos = [poly.exterior, ...poly.huecos];
    const plano = [], huecosIdx = [];
    let n = 0;
    anillos.forEach((a, i) => {
      if (i > 0) huecosIdx.push(n);
      a.forEach((pt) => { plano.push(pt[0], pt[1]); n++; });
    });
    const b = malla.v.length / 3;
    for (let k = 0; k < n; k++) malla.v.push(plano[2 * k], plano[2 * k + 1], z0);
    for (let k = 0; k < n; k++) malla.v.push(plano[2 * k], plano[2 * k + 1], z1);

    const tris = earcut(plano, huecosIdx.length ? huecosIdx : null);
    for (let k = 0; k < tris.length; k += 3) {
      let [i, j, l] = [tris[k], tris[k + 1], tris[k + 2]];
      const area = (plano[2 * j] - plano[2 * i]) * (plano[2 * l + 1] - plano[2 * i + 1])
        - (plano[2 * l] - plano[2 * i]) * (plano[2 * j + 1] - plano[2 * i + 1]);
      if (area < 0) [j, l] = [l, j];
      malla.t.push(b + n + i, b + n + j, b + n + l); // cara superior
      malla.t.push(b + i, b + l, b + j);             // cara inferior
    }
    let ini = 0;
    anillos.forEach((a) => {
      for (let k = 0; k < a.length; k++) {
        const p = b + ini + k, q = b + ini + (k + 1) % a.length;
        malla.t.push(p, q, q + n, p, q + n, p + n);
      }
      ini += a.length;
    });
  }

  function construir(datos) {
    const { base, relieve } = disenar(datos);
    const mBase = nuevaMalla(), mRel = nuevaMalla();
    base.forEach((p) => extruir(mBase, p, 0, BASE));
    relieve.forEach((p) => extruir(mRel, p, BASE, BASE + RELIEVE));
    return { mBase, mRel };
  }

  function mallaXML(m) {
    const partes = ['<mesh><vertices>'];
    for (let i = 0; i < m.v.length; i += 3) {
      partes.push(`<vertex x="${m.v[i].toFixed(4)}" y="${m.v[i + 1].toFixed(4)}" z="${m.v[i + 2].toFixed(4)}"/>`);
    }
    partes.push('</vertices><triangles>');
    for (let i = 0; i < m.t.length; i += 3) {
      partes.push(`<triangle v1="${m.t[i]}" v2="${m.t[i + 1]}" v3="${m.t[i + 2]}"/>`);
    }
    partes.push('</triangles></mesh>');
    return partes.join('');
  }

  function escXML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  }

  function a3MF({ mBase, mRel }, id) {
    const modelo = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<model unit="millimeter" xml:lang="es-MX" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
      + `<metadata name="Title">Etiqueta ${escXML(id)}</metadata>`
      + '<metadata name="Application">Sistema de Gestión de Residuos - ITP</metadata>'
      + '<resources>'
      + `<object id="1" name="Base" type="model">${mallaXML(mBase)}</object>`
      + `<object id="2" name="Relieve" type="model">${mallaXML(mRel)}</object>`
      + `<object id="3" name="Etiqueta ${escXML(id)}" type="model"><components>`
      + '<component objectid="1"/><component objectid="2"/></components></object>'
      + '</resources><build><item objectid="3"/></build></model>';
    const tipos = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
      + '</Types>';
    const rels = '<?xml version="1.0" encoding="UTF-8"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>'
      + '</Relationships>';
    const enc = (s) => fflate.strToU8(s);
    const zip = fflate.zipSync({
      '[Content_Types].xml': enc(tipos),
      '_rels/.rels': enc(rels),
      '3D/3dmodel.model': enc(modelo),
    }, { level: 6 });
    return new Blob([zip], { type: 'model/3mf' });
  }

  function aSTL({ mBase, mRel }) {
    const mallas = [mBase, mRel];
    const total = mallas.reduce((s, m) => s + m.t.length / 3, 0);
    const buf = new ArrayBuffer(84 + total * 50);
    const dv = new DataView(buf);
    dv.setUint32(80, total, true);
    let o = 84;
    for (const m of mallas) {
      for (let i = 0; i < m.t.length; i += 3) {
        const P = [m.t[i], m.t[i + 1], m.t[i + 2]].map((k) => [m.v[3 * k], m.v[3 * k + 1], m.v[3 * k + 2]]);
        const u = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
        const w = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
        const L = Math.hypot(nx, ny, nz) || 1;
        [nx / L, ny / L, nz / L, ...P[0], ...P[1], ...P[2]].forEach((val) => { dv.setFloat32(o, val, true); o += 4; });
        dv.setUint16(o, 0, true); o += 2;
      }
    }
    return new Blob([buf], { type: 'model/stl' });
  }

  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // datos: { id, residuo, zona (código o texto), fecha }   formato: '3mf' | 'stl'
  async function descargarEtiqueta3D(datos, formato = '3mf') {
    if (!datos || !datos.id) throw new Error('Falta el ID');
    await prepararLibrerias();
    const zona = ZONAS[datos.zona] || datos.zona || '';
    const mallas = construir({ ...datos, zona });
    const seguro = String(datos.id).replace(/[^\w-]/g, '_');
    if (formato === 'stl') descargarBlob(aSTL(mallas), `Etiqueta-${seguro}.stl`);
    else descargarBlob(a3MF(mallas, datos.id), `Etiqueta-${seguro}.3mf`);
  }

  window.Etiqueta3D = { descargar: descargarEtiqueta3D, construir, prepararLibrerias };
})();
