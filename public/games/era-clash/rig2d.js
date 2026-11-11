/* Era Clash — 2D skinned-painting rig.
 *
 * Each warrior is one painting. At load we split it into body parts (a per-pixel label map built from
 * bone capsules), mesh each part, and skin the meshes to a small skeleton in WebGL. Moves are poses:
 * hand and foot targets solved with two-bone IK, plus hip, torso and head offsets, all in units of the
 * painting's height so one move list fits all six warriors. Adjacent parts blend weights across their
 * joint, so elbows and knees bend without seams; non-adjacent parts (a fist in front of a face) stay cut.
 *
 * Every painting shares one stance (lead fist raised, rear fist guarding the chest, wide legs, armour
 * over the hips); only the joint positions differ, in RIGS below. Coordinates are the painting's own
 * pixels (720 tall), facing right, y down.
 *
 * API: EraRig.draw(ctx, f, img, mv, time, dstW, dstH, opts) draws the posed warrior with its feet at
 * the ctx origin (caller has already translated and flipped) and returns { hand:[x,y] (display units,
 * relative to feet), weaponTurn } or null when the rig can't run (no WebGL, image not ready) so the
 * caller falls back to the flat painting.
 */
(function () {
  'use strict';
  var H = 720;

  /* Joints per painting (native px). sh/el/ha = shoulder/elbow/hand(fist centre),
     hip/kn/an/toe = leg; F = lead (screen-right), R/B = rear. */
  var RIGS = {
    samurai: { top: [212, 6], neck: [226, 138], pelvis: [190, 345],
      shF: [282, 188], elF: [342, 238], haF: [328, 142], shR: [138, 182], elR: [100, 248], haR: [206, 212],
      hipF: [238, 380], knF: [292, 528], anF: [318, 662], toeF: [336, 706], hipB: [148, 380], knB: [96, 526], anB: [48, 650], toeB: [28, 704],
      cut: [[[340, 560], [362, 560], [362, 722], [340, 722]]] },
    viking: { top: [200, 8], neck: [206, 140], pelvis: [170, 332],
      shF: [272, 170], elF: [316, 228], haF: [300, 150], shR: [82, 162], elR: [72, 232], haR: [180, 210],
      hipF: [226, 400], knF: [276, 522], anF: [274, 642], toeF: [300, 692], hipB: [120, 400], knB: [60, 530], anB: [40, 650], toeB: [22, 700],
      rad: { uaF: 0.026 }, /* braids hang over the lead upper arm: keep them on the body */
      cut: [[[298, 575], [340, 575], [340, 722], [298, 722]]] },
    knight: { top: [176, 14], neck: [186, 122], pelvis: [160, 332],
      shF: [258, 160], elF: [298, 240], haF: [282, 150], shR: [70, 152], elR: [70, 240], haR: [166, 190],
      hipF: [222, 402], knF: [282, 502], anF: [280, 642], toeF: [300, 692], hipB: [110, 410], knB: [80, 522], anB: [40, 640], toeB: [20, 700],
      cut: [] },
    jaguar: { top: [190, 78], neck: [200, 216], pelvis: [170, 392],
      shF: [248, 252], elF: [274, 302], haF: [270, 234], shR: [70, 272], elR: [60, 332], haR: [150, 282],
      hipF: [226, 470], knF: [270, 532], anF: [270, 640], toeF: [290, 690], hipB: [112, 470], knB: [118, 548], anB: [60, 650], toeB: [40, 700],
      cut: [] },
    monk: { top: [186, 6], neck: [196, 122], pelvis: [170, 332],
      shF: [256, 186], elF: [300, 252], haF: [306, 164], shR: [100, 172], elR: [180, 216], haR: [230, 182],
      hipF: [216, 422], knF: [250, 522], anF: [250, 612], toeF: [290, 662], hipB: [110, 422], knB: [60, 522], anB: [50, 602], toeB: [30, 690],
      cut: [] },
    gladiator: { top: [150, 12], neck: [170, 176], pelvis: [150, 372],
      shF: [240, 212], elF: [270, 272], haF: [276, 214], shR: [60, 216], elR: [60, 292], haR: [150, 240],
      hipF: [216, 452], knF: [266, 532], anF: [256, 642], toeF: [290, 690], hipB: [100, 452], knB: [60, 542], anB: [30, 642], toeB: [15, 700],
      cut: [] },
    /* Warriors of history (Muse art pack, 352 x 720). Their paintings don't all share the original stance:
       Amanirenas draws a bow, Shaka carries the shield on the lead arm and the iklwa in the rear hand,
       Tecumseh holds the tomahawk overhead in the rear hand. Anything off the limbs rides on the torso. */
    amanirenas: { top: [168, 58], neck: [162, 170], pelvis: [155, 368],
      shF: [215, 200], elF: [270, 196], haF: [336, 188], shR: [112, 206], elR: [72, 186], haR: [140, 180],
      hipF: [190, 412], knF: [226, 522], anF: [274, 650], toeF: [304, 690], hipB: [116, 412], knB: [86, 522], anB: [56, 650], toeB: [30, 690],
      extra: [['faF', [300, 14], [342, 186], 0.03], ['faF', [342, 192], [268, 386], 0.03]], /* the bow travels with the bow hand */
      cut: [] },
    hangtuah: { top: [182, 16], neck: [196, 150], pelvis: [172, 340],
      shF: [246, 190], elF: [312, 226], haF: [322, 162], shR: [98, 184], elR: [108, 242], haR: [188, 226],
      hipF: [190, 420], knF: [250, 522], anF: [300, 652], toeF: [340, 668], hipB: [108, 420], knB: [72, 562], anB: [50, 680], toeB: [22, 704],
      cut: [] },
    lautaro: { top: [214, 30], neck: [214, 142], pelvis: [176, 382],
      shF: [262, 186], elF: [324, 230], haF: [318, 142], shR: [96, 196], elR: [62, 252], haR: [130, 258],
      hipF: [228, 452], knF: [290, 546], anF: [272, 650], toeF: [344, 672], hipB: [120, 452], knB: [80, 542], anB: [42, 670], toeB: [30, 702],
      cut: [] },
    naresuan: { top: [218, 40], neck: [214, 150], pelvis: [186, 390],
      shF: [248, 186], elF: [318, 232], haF: [294, 146], shR: [98, 186], elR: [128, 242], haR: [204, 226],
      hipF: [228, 432], knF: [278, 532], anF: [300, 642], toeF: [340, 660], hipB: [148, 432], knB: [68, 562], anB: [44, 662], toeB: [16, 698],
      cut: [] },
    nzinga: { top: [214, 30], neck: [214, 152], pelvis: [172, 372],
      shF: [256, 214], elF: [318, 242], haF: [310, 172], shR: [110, 216], elR: [76, 280], haR: [140, 320],
      extra: [['faR', [70, 330], [330, 300], 0.04]], /* the war axe */
      hipF: [240, 452], knF: [318, 492], anF: [276, 640], toeF: [344, 662], hipB: [130, 452], knB: [70, 562], anB: [46, 670], toeB: [28, 702],
      cut: [] },
    shaka: { top: [178, 40], neck: [178, 200], pelvis: [170, 382],
      shF: [240, 240], elF: [280, 298], haF: [300, 290], shR: [86, 250], elR: [46, 292], haR: [110, 330],
      hipF: [218, 432], knF: [288, 502], anF: [300, 650], toeF: [338, 668], hipB: [128, 432], knB: [58, 552], anB: [46, 670], toeB: [20, 700],
      extra: [['faF', [300, 200], [300, 440], 0.075], ['faR', [110, 330], [330, 270], 0.022]], /* hide shield on the lead arm, iklwa in the rear hand */
      cut: [] },
    tecumseh: { top: [196, 86], neck: [206, 192], pelvis: [170, 382],
      shF: [264, 222], elF: [296, 290], haF: [300, 336], shR: [120, 192], elR: [36, 170], haR: [66, 100],
      extra: [['faR', [66, 100], [104, 20], 0.04], ['faF', [300, 336], [168, 404], 0.035]], /* tomahawk overhead, war club low */
      hipF: [240, 452], knF: [300, 542], anF: [286, 640], toeF: [340, 664], hipB: [130, 452], knB: [70, 556], anB: [46, 664], toeB: [16, 696],
      cut: [] },
    zumbi: { top: [178, 40], neck: [200, 176], pelvis: [180, 382],
      shF: [248, 200], elF: [318, 284], haF: [318, 240], shR: [82, 200], elR: [40, 250], haR: [140, 262],
      extra: [['faR', [150, 256], [330, 116], 0.026]], /* the facão */
      hipF: [228, 442], knF: [298, 542], anF: [296, 642], toeF: [334, 660], hipB: [128, 442], knB: [58, 562], anB: [50, 666], toeB: [20, 696],
      cut: [] }
  };

  /* Parts. Index = label value in the label map (0 = dropped). Draw order back to front. */
  var P = { torso: 1, head: 2, uaF: 3, faF: 4, uaR: 5, faR: 6, thF: 7, shF: 8, thB: 9, shB: 10 };
  var NB = 11; /* bone slots incl. 0 = root */
  var ADJ = {}; ADJ[P.torso] = [P.head, P.uaF, P.uaR, P.thF, P.thB]; ADJ[P.head] = [P.torso];
  ADJ[P.uaF] = [P.torso, P.faF]; ADJ[P.faF] = [P.uaF]; ADJ[P.uaR] = [P.torso, P.faR]; ADJ[P.faR] = [P.uaR];
  ADJ[P.thF] = [P.torso, P.shF]; ADJ[P.shF] = [P.thF]; ADJ[P.thB] = [P.torso, P.shB]; ADJ[P.shB] = [P.thB];
  function inPoly(p, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  var DRAW_ORDER = [P.thB, P.shB, P.thF, P.shF, P.torso, P.head, P.uaR, P.faR, P.uaF, P.faF];

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function len(v) { return Math.hypot(v[0], v[1]); }
  function ang(a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]); }
  function segDist(p, a, b) {
    var abx = b[0] - a[0], aby = b[1] - a[1], t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t);
  }
  function smooth(e0, e1, x) { var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

  /* Capsules: [part, a, b, radius(fraction of H)] */
  function capsules(r) {
    var o = r.rad || {};
    return [
      [P.torso, r.pelvis, r.neck, 0.105], [P.torso, r.hipB, r.hipF, 0.07],
      [P.head, r.neck, r.top, 0.072],
      [P.uaF, r.shF, r.elF, o.uaF || 0.042], [P.faF, r.elF, r.haF, 0.04], [P.faF, r.haF, r.haF, 0.05],
      [P.uaR, r.shR, r.elR, 0.042], [P.faR, r.elR, r.haR, 0.038], [P.faR, r.haR, r.haR, 0.045],
      [P.thF, r.hipF, r.knF, 0.055], [P.shF, r.knF, r.anF, 0.045], [P.shF, r.anF, r.toeF, 0.04],
      [P.thB, r.hipB, r.knB, 0.055], [P.shB, r.knB, r.anB, 0.045], [P.shB, r.anB, r.toeB, 0.04]
    ].concat((r.extra || []).map(function (e) { return [P[e[0]], e[1], e[2], e[3]]; }));
  }

  /* Joint blends: [parentPart, childPart, joint, towardChild] */
  function joints(r) {
    return [
      [P.torso, P.head, r.neck, r.top],
      [P.torso, P.uaF, r.shF, r.elF], [P.uaF, P.faF, r.elF, r.haF],
      [P.torso, P.uaR, r.shR, r.elR], [P.uaR, P.faR, r.elR, r.haR],
      [P.torso, P.thF, r.hipF, r.knF], [P.thF, P.shF, r.knF, r.anF],
      [P.torso, P.thB, r.hipB, r.knB], [P.thB, P.shB, r.knB, r.anB]
    ];
  }

  /* ---------------------------------------------------------------- WebGL */
  var gl = null, glc = null, prog = null, loc = {}, failed = false;
  var PADX = 0.45 * H, PADT = 0.16 * H, PADB = 0.06 * H, RES = 0.6;

  function initGL() {
    if (gl || failed) return !!gl;
    try {
      glc = document.createElement('canvas');
      gl = glc.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch (e) { gl = null; }
    if (!gl) { failed = true; return false; }
    var vs = 'attribute vec2 p;attribute vec3 bi;attribute vec3 bw;uniform vec4 B[' + (NB * 2) + '];uniform vec4 V;varying vec2 uv;uniform vec2 S;' +
      'vec2 xf(int i,vec2 q){vec4 m=B[i*2];vec4 t=B[i*2+1];return vec2(m.x*q.x+m.z*q.y+t.x,m.y*q.x+m.w*q.y+t.y);}' +
      'vec2 pick(float f,vec2 q){int i=int(f+0.5);' + Array.apply(null, Array(NB)).map(function (_, i) { return 'if(i==' + i + ')return xf(' + i + ',q);'; }).join('') + 'return q;}' +
      'void main(){vec2 q=pick(bi.x,p)*bw.x+pick(bi.y,p)*bw.y+pick(bi.z,p)*bw.z;uv=p/S;vec2 c=(q-V.xy)/V.zw;gl_Position=vec4(c.x*2.0-1.0,1.0-c.y*2.0,0.0,1.0);}';
    var fs = 'precision mediump float;varying vec2 uv;uniform sampler2D T;uniform sampler2D L;uniform float part;uniform float backing;uniform float flash;' +
      'void main(){float l=floor(texture2D(L,uv).r*255.0+0.5);bool ok=abs(l-part)<0.5||(backing>0.5&&(abs(l-5.0)<0.5||abs(l-6.0)<0.5));if(!ok)discard;' +
      'vec4 c=texture2D(T,uv);if(c.a<0.004)discard;c.rgb=mix(c.rgb,vec3(c.a),flash);gl_FragColor=c;}';
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn('[EraRig] shader', e); gl = null; failed = true; return false; }
    ['p', 'bi', 'bw'].forEach(function (n) { loc[n] = gl.getAttribLocation(prog, n); });
    ['B', 'V', 'S', 'T', 'L', 'part', 'backing', 'flash'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    return true;
  }

  /* ---------------------------------------------------------------- build (once per warrior) */
  var built = {};
  function build(id, img) {
    if (built[id] !== undefined) return built[id];
    var r = RIGS[id];
    if (!r || !initGL()) return (built[id] = null);
    var W = img.naturalWidth, Hn = img.naturalHeight, sc = H / Hn;
    /* scale rig if the painting isn't 720 tall */
    var LW = Math.ceil(W / 2), LH = Math.ceil(Hn / 2);
    var cv = document.createElement('canvas'); cv.width = LW; cv.height = LH;
    var c2 = cv.getContext('2d'); c2.drawImage(img, 0, 0, LW, LH);
    var px;
    try { px = c2.getImageData(0, 0, LW, LH).data; } catch (e) { return (built[id] = null); }
    var caps = capsules(r), lab = new Uint8Array(LW * LH);
    for (var y = 0; y < LH; y++) for (var x = 0; x < LW; x++) {
      var i = y * LW + x;
      if (px[i * 4 + 3] < 24) continue;
      var p = [(x + 0.5) * 2 * sc, (y + 0.5) * 2 * sc], best = 0, bq = 1e9;
      for (var k = 0; k < caps.length; k++) {
        var q = segDist(p, caps[k][1], caps[k][2]) / (caps[k][3] * H);
        if (q < bq) { bq = q; best = caps[k][0]; }
      }
      /* beyond every capsule: below the waist it belongs to the nearest leg (sandal straps, hems);
         above it's carried by the body (weapons on the back, cloaks); 255 = resolve after the component pass */
      if (bq >= 1) best = (p[1] > r.pelvis[1] + 0.06 * H && best >= P.thF) ? best : 255;
      lab[i] = best;
    }
    /* connected components: drop fragments that touch the border and aren't the main body */
    var comp = new Int32Array(LW * LH).fill(-1), sizes = [], touches = [], stack = [];
    for (var s0 = 0; s0 < lab.length; s0++) {
      if (!lab[s0] || comp[s0] >= 0) continue;
      var cid = sizes.length, n = 0, edge = false; stack.push(s0); comp[s0] = cid;
      while (stack.length) {
        var j = stack.pop(); n++;
        var jx = j % LW, jy = (j / LW) | 0;
        if (jx === 0 || jy === 0 || jx === LW - 1 || jy === LH - 1) edge = true;
        var nb = [j - 1, j + 1, j - LW, j + LW];
        for (var m = 0; m < 4; m++) {
          var o = nb[m]; if (o < 0 || o >= lab.length) continue;
          if (m < 2 && ((o / LW) | 0) !== jy) continue;
          if (lab[o] && comp[o] < 0) { comp[o] = cid; stack.push(o); }
        }
      }
      sizes.push(n); touches.push(edge);
    }
    var main = 0; for (var z = 1; z < sizes.length; z++) if (sizes[z] > sizes[main]) main = z;
    for (var q2 = 0; q2 < lab.length; q2++) {
      if (!lab[q2]) continue;
      var cc = comp[q2];
      if (cc !== main && (touches[cc] || sizes[cc] < 40)) { lab[q2] = 0; continue; }
      var qx = (q2 % LW + 0.5) * 2 * sc, qy = (((q2 / LW) | 0) + 0.5) * 2 * sc;
      if (qy > r.pelvis[1] + 0.06 * H) {
        /* below the waist, in front of the lead leg: another warrior's boot or blade cropped into the painting */
        if (qx > Math.max(r.toeF[0], r.anF[0]) + 0.03 * H) { lab[q2] = 0; continue; }
        if (lab[q2] === 255 && qx > Math.max(r.knF[0], r.anF[0]) + 0.01 * H) { lab[q2] = 0; continue; }
      }
      for (var cp = 0; cp < r.cut.length; cp++) if (inPoly([qx, qy], r.cut[cp])) { lab[q2] = 0; break; }
      if (lab[q2] === 255) lab[q2] = P.torso;
    }
    /* textures */
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    var ltex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, ltex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, LW, LH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, lab);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    /* summed-area table per part, for skin weights = share of each neighbouring part's paint nearby */
    var SAT = [];
    for (var pl = 1; pl <= 10; pl++) {
      var t = new Int32Array((LW + 1) * (LH + 1));
      for (var yy = 1; yy <= LH; yy++) { var row = 0; for (var xx = 1; xx <= LW; xx++) { row += lab[(yy - 1) * LW + xx - 1] === pl ? 1 : 0; t[yy * (LW + 1) + xx] = t[(yy - 1) * (LW + 1) + xx] + row; } }
      SAT[pl] = t;
    }
    function count(pl, cx, cy, rad) {
      var x0 = Math.max(0, cx - rad), y0 = Math.max(0, cy - rad), x1 = Math.min(LW, cx + rad), y1 = Math.min(LH, cy + rad), t = SAT[pl], S = LW + 1;
      if (x1 <= x0 || y1 <= y0) return 0;
      return t[y1 * S + x1] - t[y0 * S + x1] - t[y1 * S + x0] + t[y0 * S + x0];
    }
    var RAD = Math.round(0.03 * H / 2 / sc);
    function weights(part, p) {
      var cx = Math.round(p[0] / sc / 2), cy = Math.round(p[1] / sc / 2), list = [[part, count(part, cx, cy, RAD)]];
      (ADJ[part] || []).forEach(function (q) { list.push([q, count(q, cx, cy, RAD)]); });
      var tot = list.reduce(function (s, o) { return s + o[1]; }, 0);
      if (!tot) return [part, 0, 0, 1, 0, 0];
      var own = list[0]; list = list.slice(1).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 2);
      tot = own[1] + list.reduce(function (s, o) { return s + o[1]; }, 0);
      var a = list[0] || [0, 0], b = list[1] || [0, 0];
      return [part, a[0], b[0], own[1] / tot, a[1] / tot, b[1] / tot];
    }
    /* meshes */
    var meshes = {}, CELL = 6; /* label px → 12 native px */
    var GX = Math.ceil(LW / CELL), GY = Math.ceil(LH / CELL);
    DRAW_ORDER.forEach(function (part) {
      var on = new Uint8Array(GX * GY);
      for (var y = 0; y < LH; y++) for (var x = 0; x < LW; x++) {
        var l = lab[y * LW + x];
        if (l === part || (part === P.torso && (l === P.uaR || l === P.faR))) {
          var gx = (x / CELL) | 0, gy = (y / CELL) | 0;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
            var ax = gx + dx, ay = gy + dy; if (ax >= 0 && ay >= 0 && ax < GX && ay < GY) on[ay * GX + ax] = 1;
          }
        }
      }
      var verts = [], idx = [], vmap = {};
      function vert(gx, gy) {
        var key = gx + ',' + gy; if (vmap[key] !== undefined) return vmap[key];
        var p = [Math.min(W, gx * CELL * 2) * sc, Math.min(Hn, gy * CELL * 2) * sc];
        var w = weights(part, p);
        verts.push(p[0], p[1], w[0], w[1], w[2], w[3], w[4], w[5]);
        return (vmap[key] = verts.length / 8 - 1);
      }
      for (var gy = 0; gy < GY; gy++) for (var gx = 0; gx < GX; gx++) {
        if (!on[gy * GX + gx]) continue;
        var a = vert(gx, gy), b = vert(gx + 1, gy), c = vert(gx + 1, gy + 1), d = vert(gx, gy + 1);
        idx.push(a, b, c, a, c, d);
      }
      if (!idx.length) return;
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      meshes[part] = { vb: vb, ib: ib, n: idx.length };
    });
    var rig = { id: id, r: r, W: W * sc, Hn: H, tex: tex, ltex: ltex, meshes: meshes, lab: lab, LW: LW, LH: LH,
      L: { uaF: len(sub(r.elF, r.shF)), faF: len(sub(r.haF, r.elF)), uaR: len(sub(r.elR, r.shR)), faR: len(sub(r.haR, r.elR)),
           thF: len(sub(r.knF, r.hipF)), shF: len(sub(r.anF, r.knF)), thB: len(sub(r.knB, r.hipB)), shB: len(sub(r.anB, r.knB)) },
      sign: {
        F: bendSign(r.shF, r.elF, r.haF), R: bendSign(r.shR, r.elR, r.haR),
        LF: bendSign(r.hipF, r.knF, r.anF), LB: bendSign(r.hipB, r.knB, r.anB)
      } };
    return (built[id] = rig);
  }
  function bendSign(a, b, c) { var u = sub(b, a), v = sub(c, b); return (u[0] * v[1] - u[1] * v[0]) >= 0 ? 1 : -1; }

  /* ---------------------------------------------------------------- skeleton solve */
  function mRot(px, py, a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]; }
  function mMul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
  function mApply(M, p) { return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]; }
  function mInvApply(M, p) { var x = p[0] - M[4], y = p[1] - M[5], det = M[0] * M[3] - M[1] * M[2]; return [(M[3] * x - M[2] * y) / det, (-M[1] * x + M[0] * y) / det]; }

  /* Two-bone IK in a parent's REST space: returns [delta upper, delta lower]. */
  function ik2(base, mid, end, target, L1, L2, sign) {
    var d = len(sub(target, base)), dd = Math.max(Math.abs(L1 - L2) + 1, Math.min(L1 + L2 - 0.5, d));
    var a = ang(base, target), cosA = (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd);
    var up = a - sign * Math.acos(Math.max(-1, Math.min(1, cosA)));
    var e = [base[0] + Math.cos(up) * L1, base[1] + Math.sin(up) * L1];
    var lo = ang(e, target);
    var restUp = ang(base, mid), restLo = ang(mid, end);
    var du = wrap(up - restUp);
    return [du, wrap(lo - restLo - du)];
  }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  /* pose: { hip:[dx,dy] (×H), body: rot about pelvis, torso, head,
             hF/hR: hand target in torso rest space (absolute px) or null, fF/fB: ankle target in root space or null } */
  function solve(rig, pose) {
    var r = rig.r, M = [];
    var root = mMul([1, 0, 0, 1, pose.hip[0] * H, pose.hip[1] * H], mRot(r.pelvis[0], r.pelvis[1], pose.body || 0));
    M[0] = root;
    M[P.torso] = mMul(root, mRot(r.pelvis[0], r.pelvis[1], pose.torso || 0));
    M[P.head] = mMul(M[P.torso], mRot(r.neck[0], r.neck[1], pose.head || 0));
    function arm(ua, fa, sh, el, ha, tgt, L1, L2, sign) {
      var d = tgt ? ik2(sh, el, ha, tgt, L1, L2, sign) : [0, 0];
      M[ua] = mMul(M[P.torso], mRot(sh[0], sh[1], d[0]));
      M[fa] = mMul(M[ua], mRot(el[0], el[1], d[1]));
    }
    arm(P.uaF, P.faF, r.shF, r.elF, r.haF, pose.hF, rig.L.uaF, rig.L.faF, rig.sign.F);
    arm(P.uaR, P.faR, r.shR, r.elR, r.haR, pose.hR, rig.L.uaR, rig.L.faR, rig.sign.R);
    function leg(th, sh, hip, kn, an, tgtWorld, L1, L2, sign) {
      /* targets are world (planted feet); solve in root's rest frame */
      var d = [0, 0];
      if (tgtWorld) d = ik2(hip, kn, an, mInvApply(root, tgtWorld), L1, L2, sign);
      M[th] = mMul(root, mRot(hip[0], hip[1], d[0]));
      M[sh] = mMul(M[th], mRot(kn[0], kn[1], d[1]));
    }
    leg(P.thF, P.shF, r.hipF, r.knF, r.anF, pose.fF, rig.L.thF, rig.L.shF, rig.sign.LF);
    leg(P.thB, P.shB, r.hipB, r.knB, r.anB, pose.fB, rig.L.thB, rig.L.shB, rig.sign.LB);
    return M;
  }

  /* ---------------------------------------------------------------- moves → poses */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lp(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeIn(t) { return t * t; }
  /* snaps past the target and settles: strikes land with a little overshoot */
  function easeOutBack(t) { var c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  /* reach point from a joint: dir angle (0 = forward, -π/2 = up) and distance in chain lengths */
  function reach(from, a, k, L) { return [from[0] + Math.cos(a) * k * L, from[1] + Math.sin(a) * k * L]; }

  /* Fill unset limbs with their rest targets so two poses can be blended. */
  function full(rig, p) {
    var r = rig.r;
    return { hip: p.hip.slice(), body: p.body || 0, torso: p.torso || 0, head: p.head || 0,
      hF: p.hF || r.haF, hR: p.hR || r.haR, fF: p.fF || r.anF, fB: p.fB || r.anB };
  }
  function blend(rig, a, b, t) {
    a = full(rig, a); b = full(rig, b);
    return { hip: lp(a.hip, b.hip, t), body: lerp(a.body, b.body, t), torso: lerp(a.torso, b.torso, t), head: lerp(a.head, b.head, t),
      hF: lp(a.hF, b.hF, t), hR: lp(a.hR, b.hR, t), fF: lp(a.fF, b.fF, t), fB: lp(a.fB, b.fB, t) };
  }
  function base() { return { hip: [0, 0], body: 0, torso: 0, head: 0, hF: null, hR: null, fF: null, fB: null }; }

  /* On the back, head away from the attacker, legs toward them. Feet targets are on the floor (y = H). */
  function lyingPose(rig) {
    var r = rig.r, L = rig.L, p = base(), legF = L.thF + L.shF, legB = L.thB + L.shB;
    p.body = -Math.PI / 2; p.hip = [-0.02, (0.925 * H - r.pelvis[1]) / H]; p.torso = -0.04; p.head = 0.18;
    var pw = [r.pelvis[0] + p.hip[0] * H, r.pelvis[1] + p.hip[1] * H];
    p.fF = [pw[0] + 0.8 * legF, H * 0.975]; p.fB = [pw[0] + 0.97 * legB, H * 0.99];
    p.hF = reach(r.shF, -1.95, 0.9, L.uaF + L.faF); p.hR = reach(r.shR, -1.25, 0.9, L.uaR + L.faR);
    return p;
  }
  /* One knee down, pushing up: the middle of a get-up. */
  function kneelPose(rig) {
    var r = rig.r, p = base();
    p.body = -0.22; p.hip = [-0.01, 0.2]; p.torso = 0.3; p.head = -0.15;
    p.fF = [r.anF[0] - 0.05 * H, r.anF[1]]; p.fB = [r.anB[0] + 0.06 * H, r.anB[1]];
    p.hF = [r.haF[0] + 0.02 * H, r.haF[1] + 0.12 * H]; p.hR = [r.haR[0], r.haR[1] + 0.1 * H];
    return p;
  }
  /* Tumbling through the air after a launch, knockdown or KO. */
  function airFall(rig, f, t) {
    var r = rig.r, L = rig.L, p = base(), armF = L.uaF + L.faF, armR = L.uaR + L.faR;
    var vy = f.vy || 0;
    if (f.react === 'thrown') p.body = -2.5 * Math.PI * clamp01(t / 0.72);           /* full flip, lands on the back */
    else p.body = -0.3 - 1.15 * clamp01((vy + 300) / 1000);                           /* tips back as it falls */
    p.torso = -0.2; p.head = -0.35;
    p.hF = reach(r.shF, -2.3 + 0.35 * Math.sin(t * 15), 0.85, armF); p.hR = reach(r.shR, -1.0 + 0.3 * Math.sin(t * 13 + 1), 0.85, armR);
    return p;
  }

  function poseFor(rig, f, mv, time) {
    var r = rig.r, L = rig.L, armF = L.uaF + L.faF, armR = L.uaR + L.faR, legF = L.thF + L.shF;
    var pose = base();
    var restF = r.haF, restR = r.haR;
    var ph = (f.x || 0) * 0.05;
    var st = f.state, t = f.stateT || 0;
    var breathe = Math.sin(time * 2.6 + ph);
    var plantF = r.anF.slice(), plantB = r.anB.slice();

    /* falls first: any knockdown, launch or KO while airborne */
    if (!f.onGround && (st === 'ko' || (st === 'hit' && f.knock))) return airFall(rig, f, t);

    if (st === 'idle' || st === 'intro' || !st) {
      pose.hip[1] = 0.004 * breathe; pose.torso = 0.012 * breathe;
      pose.hF = [restF[0], restF[1] + 6 * breathe]; pose.hR = [restR[0], restR[1] + 4 * breathe];
      pose.fF = plantF; pose.fB = plantB;
    } else if (st === 'walk') {
      var w = f.walkPh || 0, s = Math.sin(w), c = Math.cos(w);
      pose.hip = [0.004 * s, -0.008 * Math.abs(c)]; pose.torso = 0.04;
      pose.fF = [plantF[0] + s * 0.045 * H, plantF[1] - Math.max(0, c) * 0.035 * H];
      pose.fB = [plantB[0] - s * 0.045 * H, plantB[1] - Math.max(0, -c) * 0.035 * H];
      pose.hF = [restF[0] + s * 6, restF[1]]; pose.hR = [restR[0] - s * 5, restR[1]];
    } else if (st === 'dash') {
      pose.hip = [0.02, 0.025]; pose.torso = 0.22; pose.head = -0.12;
      pose.fF = [plantF[0] + 0.06 * H, plantF[1]]; pose.fB = [plantB[0] - 0.04 * H, plantB[1] - 0.04 * H];
      pose.hF = reach(r.shF, -0.15, 0.75, armF); pose.hR = [restR[0] + 10, restR[1]];
    } else if (st === 'block') {
      var jolt = Math.max(0, 1 - t / 0.12) * 0.012; /* guard rocks back when struck */
      pose.hip = [-0.01 - jolt, 0.025]; pose.torso = -0.06 - jolt * 4; pose.head = 0.06;
      pose.hF = reach(r.shF, -1.15, 0.62, armF); pose.hR = [restR[0] + 0.05 * H, restR[1] - 0.06 * H];
      pose.fF = plantF; pose.fB = plantB;
    } else if (st === 'hit') {
      hitPose(rig, f, t, pose, plantF, plantB, armF, armR);
    } else if (st === 'down' || st === 'ko') {
      pose = lyingPose(rig);
      pose.torso += 0.02 * Math.sin(time * 3);
    } else if (st === 'getup') {
      var u = clamp01(t / 0.38);
      pose = u < 0.5 ? blend(rig, lyingPose(rig), kneelPose(rig), easeOut(u / 0.5))
                     : blend(rig, kneelPose(rig), { hip: [0, 0], body: 0, torso: 0, head: 0, hF: null, hR: null, fF: plantF, fB: plantB }, easeOut((u - 0.5) / 0.5));
      return pose;
    } else if (st === 'win') {
      var b = Math.sin(time * 3.4);
      pose.hip[1] = -0.006 * b; pose.torso = -0.04; pose.head = -0.1;
      pose.hF = reach(r.shF, -1.45 + 0.05 * b, 0.97, armF); pose.hR = [restR[0], restR[1] + 0.04 * H];
      pose.fF = plantF; pose.fB = plantB;
    } else if (st === 'attack' && mv) {
      attackPose(rig, f, (mv && mv.pose) || f.move, mv, t, pose, plantF, plantB, armF, armR, legF);
    } else {
      pose.fF = plantF; pose.fB = plantB;
    }

    if (!f.onGround && st !== 'attack') {
      /* jumping: tuck legs relative to the body instead of planting */
      pose.fF = [r.anF[0] + 0.03 * H + pose.hip[0] * H, r.anF[1] - 0.13 * H + pose.hip[1] * H];
      pose.fB = [r.anB[0] + 0.05 * H + pose.hip[0] * H, r.anB[1] - 0.09 * H + pose.hip[1] * H];
      pose.torso += 0.05; if (!pose.hF) pose.hF = restF;
    }
    return pose;
  }

  /* Where the blow landed decides how the body takes it. */
  function hitPose(rig, f, t, pose, plantF, plantB, armF, armR) {
    var r = rig.r, restF = r.haF, restR = r.haR;
    var k = easeOut(Math.max(0, 1 - t / Math.max(0.14, (f.stunDur || 0.25) * 1.1)));
    var shake = Math.sin(t * 60) * 0.02 * k; /* the first frames tremble */
    pose.fF = plantF; pose.fB = plantB;
    switch (f.react) {
      case 'body': /* doubled over */
        pose.hip = [-0.02 * k, 0.035 * k]; pose.torso = 0.38 * k + shake; pose.head = 0.25 * k;
        pose.hF = lp(restF, [restF[0] - 0.08 * H, restF[1] + 0.15 * H], k); pose.hR = lp(restR, [restR[0] + 0.04 * H, restR[1] + 0.1 * H], k);
        pose.fB = [plantB[0] - 0.02 * H * k, plantB[1]];
        break;
      case 'low': /* lead leg buckles */
        pose.hip = [-0.01 * k, 0.06 * k]; pose.torso = 0.16 * k + shake; pose.head = 0.1 * k;
        pose.fF = [plantF[0] - 0.07 * H * k, plantF[1] - 0.02 * H * k];
        pose.hF = lp(restF, [restF[0] - 0.03 * H, restF[1] + 0.1 * H], k);
        break;
      case 'spin': /* twisted round by a hook or haymaker */
        pose.hip = [-0.03 * k, 0.02 * k]; pose.torso = -0.28 * k + shake; pose.head = -0.6 * k;
        pose.hF = lp(restF, reach(r.shF, 2.3, 0.85, armF), k); pose.hR = lp(restR, reach(r.shR, -2.4, 0.8, armR), k);
        pose.fF = [plantF[0] + 0.03 * H * k, plantF[1]];
        break;
      default: /* 'high': head snapped back */
        pose.hip = [-0.025 * k, 0.01 * k]; pose.torso = -0.22 * k + shake; pose.head = -0.4 * k;
        pose.hF = lp(restF, reach(r.shF, -0.9, 0.7, armF), k); pose.hR = [restR[0] - 14 * k, restR[1] - 10 * k];
    }
    if (!f.onGround) { pose.fF = null; pose.fB = null; }
  }

  /* Phase helper: 0→1 over startup (windup), 0→1(+overshoot) during active (strike), 0→1 over recovery. */
  function phases(mv, t) {
    var su = mv.startup, ac = mv.active, re = mv.recovery;
    if (t < su) return { wind: easeIn(t / su), strike: 0, rec: 0 };
    if (t < su + ac) return { wind: 1, strike: easeOutBack(Math.min(1, (t - su) / Math.max(0.03, ac * 0.45))), rec: 0 };
    return { wind: 1, strike: 1, rec: easeOut(Math.min(1, (t - su - ac) / re)) };
  }

  function attackPose(rig, f, move, mv, t, pose, plantF, plantB, armF, armR, legF) {
    var r = rig.r, restF = r.haF, restR = r.haR, ph = phases(mv, t);
    var out = 1 - ph.rec; /* how far into the move we still are */
    pose.fF = plantF; pose.fB = plantB;
    pose.hR = restR;
    function seq(rest, wind, hit) { /* rest → wind (startup) → hit (active) → rest (recovery), straight lines */
      var a = ph.strike > 0 ? lp(wind, hit, ph.strike) : lp(rest, wind, ph.wind);
      return ph.rec > 0 ? lp(hit, rest, ph.rec) : a;
    }
    function arc(from, L, rest, wA, wK, hA, hK) { /* windup in a line, then the strike sweeps an arc about `from` */
      if (ph.rec > 0) return lp(reach(from, hA, hK, L), rest, ph.rec);
      if (ph.strike > 0) { var s = ph.strike; return reach(from, wA + (hA - wA) * s, wK + (hK - wK) * s, L); }
      return lp(rest, reach(from, wA, wK, L), ph.wind);
    }
    function sv(rest, wind, hit) { var a = ph.strike > 0 ? lerp(wind, hit, ph.strike) : lerp(rest, wind, ph.wind); return ph.rec > 0 ? lerp(hit, rest, ph.rec) : a; }
    var hipF = r.hipF;

    switch (move) {
      case 'punch': /* jab: straight and quick */
        pose.hF = seq(restF, reach(r.shF, -0.35, 0.55, armF), reach(r.shF, -0.08, 0.99, armF));
        pose.torso = sv(0, -0.02, 0.09); pose.hip[0] = sv(0, 0, 0.02);
        pose.hR = [restR[0] - 6 * ph.strike * out, restR[1]];
        break;
      case 'hook': /* roundhouse punch: fist swings round in front of the chest, body turns into it */
        pose.hF = seq(restF, reach(r.shF, 2.75, 0.55, armF), reach(r.shF, -0.22, 0.86, armF));
        pose.torso = sv(0, -0.2, 0.3); pose.head = sv(0, -0.05, 0.1); pose.hip[0] = sv(0, -0.01, 0.025);
        pose.fB = [plantB[0] + 0.02 * H * ph.strike * out, plantB[1] - 0.012 * H * ph.strike * out];
        break;
      case 'spPunch1': { /* flurry: rapid jabs */
        var j = Math.abs(Math.sin(t * 38));
        var on = ph.strike > 0 && ph.rec < 1 ? 1 - ph.rec : ph.wind * 0.5;
        pose.hF = lp(restF, reach(r.shF, -0.1 + 0.15 * Math.sin(t * 19), 0.6 + 0.39 * j, armF), on);
        pose.hR = lp(restR, [restR[0] + 0.05 * H * (1 - j), restR[1] - 0.02 * H], on);
        pose.torso = 0.07 * on; pose.hip[0] = 0.012 * on;
        break;
      }
      case 'spPunch2': /* haymaker: loops back over the top and crashes down through the target */
        pose.hF = arc(r.shF, armF, restF, -2.55, 0.8, 0.2, 0.99);
        pose.torso = sv(0, -0.18, 0.28); pose.hip[0] = sv(0, -0.015, 0.05); pose.head = sv(0, -0.08, 0.12);
        pose.fB = [plantB[0] + 0.025 * H * ph.strike * out, plantB[1]];
        break;
      case 'uppercut': /* scoops from the hip up past the chin */
        pose.hF = arc(r.shF, armF, restF, 1.15, 0.62, -1.42, 0.98);
        pose.hip[1] = sv(0, 0.06, -0.03); pose.torso = sv(0, 0.18, -0.08); pose.head = sv(0, 0.08, -0.15);
        break;
      case 'throw': /* grab, then heave them up and over */
        pose.hF = ph.strike > 0 || ph.rec > 0 ? arc(r.shF, armF, restF, 0.15, 0.92, -2.3, 0.8) : lp(restF, reach(r.shF, 0.15, 0.92, armF), ph.wind);
        pose.hR = seq(restR, [restR[0] + 0.12 * H, restR[1] + 0.02 * H], [restR[0], restR[1] - 0.08 * H]);
        pose.torso = sv(0, 0.18, -0.35); pose.hip = [sv(0, 0.03, -0.02), sv(0, 0.04, 0.0)];
        break;
      case 'kick': /* front kick, chest height */
        pose.fF = seq(plantF, [hipF[0] + 0.35 * legF, hipF[1] + 0.25 * legF], [hipF[0] + 0.98 * legF, hipF[1] - 0.05 * legF]);
        pose.torso = sv(0, -0.1, -0.2); pose.hip[0] = sv(0, -0.01, -0.02);
        pose.hF = seq(restF, [restF[0] - 10, restF[1] + 10], [restF[0] - 22, restF[1] + 26]);
        break;
      case 'highKick': /* chamber high, snap to head height */
        pose.fF = seq(plantF, [hipF[0] + 0.3 * legF, hipF[1] - 0.15 * legF], [hipF[0] + 0.78 * legF, hipF[1] - 0.6 * legF]);
        pose.torso = sv(0, -0.25, -0.42); pose.head = sv(0, 0.12, 0.22); pose.hip = [sv(0, -0.01, -0.03), sv(0, 0, 0.015)];
        pose.hF = seq(restF, [restF[0] - 16, restF[1] + 24], [restF[0] - 30, restF[1] + 44]);
        break;
      case 'lowKick': /* shin-high, from a crouch */
        pose.fF = seq(plantF, [hipF[0] + 0.25 * legF, hipF[1] + 0.6 * legF], [hipF[0] + 0.92 * legF, hipF[1] + 0.5 * legF]);
        pose.hip = [sv(0, 0, 0.01), sv(0, 0.04, 0.06)]; pose.torso = sv(0, 0.05, -0.08); pose.head = sv(0, 0, 0.1);
        pose.hF = seq(restF, [restF[0] + 6, restF[1] + 12], [restF[0], restF[1] + 20]);
        break;
      case 'flyKick': /* in the air: lead leg spears down-forward, rear leg tucked */
        pose.fF = seq([r.anF[0], r.anF[1] - 0.1 * H], [hipF[0] + 0.3 * legF, hipF[1] + 0.3 * legF], [hipF[0] + 0.92 * legF, hipF[1] + 0.38 * legF]);
        pose.fB = [r.anB[0] + 0.06 * H, r.anB[1] - 0.14 * H];
        pose.torso = sv(0, -0.15, -0.3); pose.head = sv(0, 0.08, 0.15);
        pose.hF = [restF[0] - 20, restF[1] + 20];
        return;
      case 'spKick1': /* roundhouse kick: the foot sweeps up in an arc to head height */
        pose.fF = arc(hipF, legF, plantF, 1.3, 0.7, -0.6, 0.98);
        pose.torso = sv(0, -0.24, -0.45); pose.head = sv(0, 0.1, 0.26); pose.hip = [sv(0, -0.01, -0.03), sv(0, 0, 0.02)];
        pose.hF = seq(restF, [restF[0] - 20, restF[1] + 30], [restF[0] - 40, restF[1] + 60]);
        pose.fB = [plantB[0] + 0.03 * H * ph.wind * out, plantB[1]];
        break;
      case 'spKick2': /* axe kick: up high, chop down */
        pose.fF = ph.strike > 0 || ph.rec > 0 ? arc(hipF, legF, plantF, -1.25, 0.98, 0.35, 0.95)
                                              : lp(plantF, reach(hipF, -1.25, 0.98, legF), ph.wind);
        pose.torso = sv(0, -0.34, -0.06); pose.head = sv(0, 0.16, 0.04);
        pose.hF = seq(restF, [restF[0] - 30, restF[1] + 50], [restF[0] - 10, restF[1] + 20]);
        break;
      case 'sweep': {
        var drop = sv(0, 0.17, 0.19);
        pose.hip = [sv(0, -0.01, 0.01), drop]; pose.torso = sv(0, 0.28, 0.34); pose.head = sv(0, -0.2, -0.25);
        var groundY = r.anF[1];
        pose.fF = seq(plantF, [plantF[0] - 0.04 * H, groundY], [hipF[0] + 1.05 * legF, groundY]);
        pose.fB = [plantB[0] + 0.05 * H * ph.wind * out, plantB[1]];
        pose.hF = seq(restF, reach(r.shF, 1.2, 0.8, armF), reach(r.shF, 1.4, 0.95, armF));
        pose.hR = [restR[0] - 0.02 * H, restR[1] + 0.06 * H * out];
        break;
      }
      case 'bodyBlow': /* dips and drives a short punch into the gut */
        pose.hF = seq(restF, reach(r.shF, 0.55, 0.45, armF), reach(r.shF, 0.38, 0.99, armF));
        pose.hip = [sv(0, -0.005, 0.02), sv(0, 0.05, 0.06)]; pose.torso = sv(0, 0.12, 0.22); pose.head = sv(0, 0.05, 0.08);
        pose.hR = [restR[0] - 0.02 * H * ph.strike * out, restR[1] + 0.02 * H];
        pose.fB = [plantB[0] - 0.02 * H * ph.wind * out, plantB[1]];
        break;
      case 'risingKick': /* knee drives up and the foot snaps straight up past the chin */
        pose.fF = seq([r.anF[0], r.anF[1] - 0.08 * H], [hipF[0] + 0.3 * legF, hipF[1] - 0.05 * legF], [hipF[0] + 0.42 * legF, hipF[1] - 0.92 * legF]);
        pose.fB = [r.anB[0] + 0.04 * H, r.anB[1] - 0.1 * H];
        pose.torso = sv(0, -0.2, -0.55); pose.head = sv(0, 0.1, 0.3);
        pose.hF = seq(restF, [restF[0] - 20, restF[1] + 30], [restF[0] - 34, restF[1] + 60]);
        return;
      case 'airPunch': /* diving punch: winds up high, then spears down and forward */
        pose.hF = arc(r.shF, armF, restF, -1.7, 0.6, 0.55, 0.99);
        pose.hR = [restR[0] - 0.03 * H, restR[1] - 0.04 * H];
        pose.torso = sv(0, -0.15, 0.32); pose.head = sv(0, -0.05, 0.12);
        pose.fF = [r.anF[0] + 0.02 * H, r.anF[1] - 0.12 * H]; pose.fB = [r.anB[0] + 0.06 * H, r.anB[1] - 0.08 * H];
        return;
      case 'fury': { /* both fists hammering in turn, the body rocking into every one */
        var on2 = ph.strike > 0 && ph.rec < 1 ? 1 - ph.rec : ph.wind * 0.5;
        var cyc = Math.max(0, t - mv.startup) / (mv.active / mv.hits), side = Math.floor(cyc) % 2, u = cyc - Math.floor(cyc);
        var pk = Math.sin(Math.min(1, u * 1.6) * Math.PI);
        var lead = reach(r.shF, -0.15 + 0.3 * (Math.floor(cyc) % 3 === 2 ? 1 : 0), 0.5 + 0.49 * pk, armF);
        pose.hF = lp(restF, side ? reach(r.shF, 0.4, 0.5, armF) : lead, on2);
        pose.hR = lp(restR, side ? [restR[0] + 0.14 * H * pk, restR[1] - 0.04 * H] : [restR[0] - 0.02 * H, restR[1]], on2);
        pose.torso = (0.1 + (side ? -0.12 : 0.14) * pk) * on2; pose.hip[0] = 0.015 * on2; pose.head = 0.05 * on2;
        break;
      }
      case 'cyclone': { /* spinning kick: the leg stays out at full reach as the body turns */
        var on3 = ph.strike > 0 && ph.rec < 1 ? 1 - ph.rec : ph.wind;
        pose.fF = lp(plantF, reach(hipF, -0.35 + 0.15 * Math.sin(t * 40), 0.97, legF), on3);
        pose.torso = -0.38 * on3; pose.head = 0.2 * on3; pose.hip = [-0.01 * on3, -0.01 * on3];
        pose.hF = lp(restF, reach(r.shF, 2.6, 0.8, armF), on3); pose.hR = lp(restR, reach(r.shR, -2.6, 0.8, armR), on3);
        break;
      }
      case 'weapon':
      case 'super': /* overhead swing through */
        pose.hF = arc(r.shF, armF, restF, -2.1, 0.92, 0.5, 0.98);
        pose.torso = sv(0, -0.18, move === 'super' ? 0.28 : 0.2); pose.hip[0] = sv(0, -0.01, move === 'super' ? 0.05 : 0.03);
        pose.head = sv(0, -0.06, 0.06);
        if (move === 'super') pose.hR = seq(restR, [restR[0] - 0.05 * H, restR[1] - 0.08 * H], [restR[0] + 0.06 * H, restR[1] + 0.02 * H]);
        break;
      default:
        pose.hF = restF;
    }
  }

  /* ---------------------------------------------------------------- draw */
  /* Renders into the bottom-left vw×vh of the shared canvas at `res` (device px per painting px), so a
     warrior far from the camera costs what it shows; the canvas only ever grows. Returns [vw, vh]. */
  function render(rig, M, flash, res) {
    var W = rig.W, vw = Math.ceil((W + 2 * PADX) * res), vh = Math.ceil((H + PADT + PADB) * res);
    if (glc.width < vw || glc.height < vh) { glc.width = Math.max(glc.width, vw); glc.height = Math.max(glc.height, vh); }
    gl.viewport(0, 0, vw, vh);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, vw, vh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    var B = new Float32Array(NB * 8);
    for (var i = 0; i < NB; i++) { var m = M[i] || M[0]; B.set([m[0], m[1], m[2], m[3], m[4], m[5], 0, 0], i * 8); }
    gl.uniform4fv(loc.B, B);
    gl.uniform4f(loc.V, -PADX, -PADT, W + 2 * PADX, H + PADT + PADB);
    gl.uniform2f(loc.S, W, H);
    gl.uniform1f(loc.flash, flash || 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rig.tex); gl.uniform1i(loc.T, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rig.ltex); gl.uniform1i(loc.L, 1);
    DRAW_ORDER.forEach(function (part) {
      var me = rig.meshes[part]; if (!me) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, me.vb);
      gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(loc.bi); gl.vertexAttribPointer(loc.bi, 3, gl.FLOAT, false, 32, 8);
      gl.enableVertexAttribArray(loc.bw); gl.vertexAttribPointer(loc.bw, 3, gl.FLOAT, false, 32, 20);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, me.ib);
      gl.uniform1f(loc.part, part);
      gl.uniform1f(loc.backing, part === P.torso ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, me.n, gl.UNSIGNED_SHORT, 0);
    });
    return [vw, vh];
  }

  function draw(ctx, f, img, mv, time, dstW, dstH, opts) {
    if (!img || !img.complete || !img.naturalWidth || !f || !f.char) return null;
    var rig = build(f.char.id, img);
    if (!rig) return null;
    var pose = (opts && opts.pose) || poseFor(rig, f, mv, time);
    var M = solve(rig, pose);
    var tf = ctx.getTransform ? ctx.getTransform() : null, devScale = tf ? Math.hypot(tf.a, tf.b) : 1;
    var res = Math.max(0.12, Math.min(RES, dstH * devScale / H * 1.25));
    var v = render(rig, M, opts && opts.flash, res);
    var k = dstH / H, W = rig.W, sy = glc.height - v[1];
    var dx = -dstW * 0.5 - PADX * k, dy = -dstH - PADT * k, dw = (W + 2 * PADX) * k, dh = (H + PADT + PADB) * k;
    if (opts && opts.ghost) { ctx.globalAlpha = opts.ghost; ctx.drawImage(glc, 0, sy, v[0], v[1], dx - (opts.ghostDx || 18), dy, dw, dh); ctx.globalAlpha = 1; }
    var a0 = ctx.globalAlpha; if (opts && opts.alpha != null) ctx.globalAlpha = a0 * opts.alpha;
    ctx.drawImage(glc, 0, sy, v[0], v[1], dx, dy, dw, dh);
    ctx.globalAlpha = a0;
    /* lead hand (display units, feet-relative) and forearm turn for weapons */
    var hand = mApply(M[P.faF], rig.r.haF);
    var e0 = mApply(M[P.faF], rig.r.elF);
    var turn = wrap(ang(e0, hand) - ang(rig.r.elF, rig.r.haF));
    var foot = mApply(M[P.shF], rig.r.toeF || rig.r.anF);
    return { hand: [-dstW * 0.5 + hand[0] * k, -dstH + hand[1] * k], foot: [-dstW * 0.5 + foot[0] * k, -dstH + foot[1] * k],
      weaponTurn: turn, pose: pose, M: M, rig: rig };
  }

  window.EraRig = { draw: draw, RIGS: RIGS, P: P, build: build, poseFor: poseFor, solve: solve, H: H,
    capsules: capsules, joints: joints, get canvas() { return glc; }, get ok() { return initGL(); } };
})();
