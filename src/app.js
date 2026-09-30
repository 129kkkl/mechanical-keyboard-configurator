/* ============================================================
 * 星轨键盘工作室 v3 · 应用主体（依赖 KBD_DATA 与 THREE，均为内联）
 * v3：参数化键帽曲面 / 真实装配结构 / PMREM 棚拍环境 / 部件聚焦
 * ============================================================ */
(function () {
"use strict";
var D = window.KBD_DATA;
function $(s) { return document.querySelector(s); }
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==================== 配置状态与存储（v2 schema + v3 字段） ==================== */
var STORE_KEY = "stellarail-studio-config-v2";
var LEGACY_KEY = "stellarail-k65-config-v1";

function defaultConfig() {
  return { layout: "k65", family: "minimal", caseColor: "obsidian", capTheme: "cream",
    zoneColors: null, switch: "linear", volume: 0.7, muted: false,
    exploded: false, typing: false,
    profile: "streamline", scene: "studio", quality: "high" };
}
var store = { version: 2, activeId: null, slots: [] };
var saveError = null;

function normalizeConfig(c) {
  var d = defaultConfig(), out = {};
  for (var k in d) out[k] = (c && c[k] !== undefined) ? c[k] : d[k];
  if (!D.getLayout(out.layout)) out.layout = d.layout;
  if (!D.CASE_FAMILIES[out.family]) out.family = d.family;
  if (!D.CASE_COLORS[out.caseColor]) out.caseColor = d.caseColor;
  if (!D.CAP_THEMES[out.capTheme]) out.capTheme = d.capTheme;
  if (!D.SWITCHES[out.switch]) out.switch = d.switch;
  if (!D.KEYCAP_PROFILES[out.profile]) out.profile = d.profile;
  if (!SCENE_PRESETS[out.scene]) out.scene = d.scene;
  if (out.quality !== "high" && out.quality !== "low") out.quality = d.quality;
  out.volume = Math.max(0, Math.min(1, Number(out.volume) || 0));
  out.muted = !!out.muted; out.exploded = !!out.exploded; out.typing = !!out.typing;
  if (out.zoneColors && typeof out.zoneColors !== "object") out.zoneColors = null;
  var resolved = D.resolveLayoutId(out.layout, out.family);
  out.layout = resolved || D.CASE_FAMILIES[out.family].layouts[0];
  return out;
}
function currentConfig() { return activeSlot().config; }
function activeSlot() {
  var s = null;
  for (var i = 0; i < store.slots.length; i++) if (store.slots[i].id === store.activeId) s = store.slots[i];
  if (!s) {
    s = { id: "slot-" + Date.now(), name: "默认方案", config: defaultConfig() };
    store.slots.push(s); store.activeId = s.id;
  }
  return s;
}
function loadStore() {
  var raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) {}
  if (raw) {
    try {
      var s = JSON.parse(raw);
      if (s && s.version === 2 && Array.isArray(s.slots)) {
        store.slots = s.slots.filter(function (x) { return x && x.id && x.name != null; })
          .map(function (x) { return { id: String(x.id), name: String(x.name).slice(0, 20), config: normalizeConfig(x.config) }; });
        store.activeId = typeof s.activeId === "string" ? s.activeId : null;
        if (!store.slots.length) throw new Error("empty");
        return;
      }
      throw new Error("bad version");
    } catch (e) {
      console.warn("存档损坏，已重置为默认：", e);
      saveError = "检测到损坏的存档，已回退到默认配置";
    }
  }
  try {
    var old = localStorage.getItem(LEGACY_KEY);
    if (old) {
      var o = JSON.parse(old), c = defaultConfig();
      if (o && D.CASE_COLORS[o.caseColor]) c.caseColor = o.caseColor;
      if (o && D.CAP_THEMES[o.capTheme]) c.capTheme = o.capTheme;
      store.slots = [{ id: "slot-migrated", name: "迁移的方案", config: c }];
      store.activeId = "slot-migrated";
      return;
    }
  } catch (e) {}
  store.slots = [{ id: "slot-default", name: "默认方案", config: defaultConfig() }];
  store.activeId = "slot-default";
}
function persist(quiet) {
  saveError = null;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    saveError = "保存失败：" + (e && e.name === "QuotaExceededError" ? "本地存储空间不足" : "浏览器拒绝了写入");
    if (!quiet) toast(saveError, true);
  }
  if (!quiet && !saveError) toast("配置已保存到本机");
  renderSummary();
}

/* ==================== 场景 / 灯光 / 环境 ==================== */
var SCENE_PRESETS = {
  studio: { name: "中性棚拍", hemi: 0.55, key: 1.5, rim: 0.5, keyColor: 0xffffff, rimColor: 0x88aaff, bg: "" },
  warm:   { name: "暖色桌面", hemi: 0.45, key: 1.35, rim: 0.4, keyColor: 0xffe3c0, rimColor: 0xffb27a, bg: "warm" },
  dark:   { name: "深色轮廓", hemi: 0.25, key: 0.9, rim: 1.2, keyColor: 0xdfe8ff, rimColor: 0x5b8cff, bg: "dark" }
};

var glOk = true, renderer = null, scene = null, camera = null;
var keyLight = null, rimLight = null, hemiLight = null;
var container = $("#gl");
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
} catch (e) { glOk = false; }

var LAYER_INFO = [
  { key: "caps", name: "键帽", lift: 3.6, desc: "ABS 二色 · 原创轮廓" },
  { key: "switches", name: "轴体 · 稳定器", lift: 2.6, desc: "热插拔 · 十字轴心" },
  { key: "plate", name: "定位板", lift: 1.75, desc: "1.5mm 铝合金" },
  { key: "pcb", name: "PCB", lift: 0.9, desc: "热插拔轴座（结构示意）" },
  { key: "case", name: "底壳", lift: 0, desc: "CNC 壳体" }
];

/* ---------- 资源所有权 ----------
 * sharedGeo/sharedTex：跨型号缓存，键有界，永不 dispose。
 * 每块板私有几何/材质：userData.ownGeo / ownMat，拆板时统一释放。
 * 字符贴图为共享缓存：销毁材质时不得释放其 map。 */
var sharedGeo = {};
var sharedTex = {};
function disposeBoard() {
  if (!board) return;
  scene.remove(board.group);
  board.group.traverse(function (o) {
    if (o.geometry && o.userData.ownGeo) o.geometry.dispose();
    if (o.material && o.userData.ownMat) o.material.dispose(); // 不碰 o.material.map（共享缓存）
  });
  board = null;
}

/* ---------- 共享材质 ---------- */
var capMats = { base: null, mod: null, accent: null };
var plateMat = null, pcbMat = null, caseMat = null, trayMat = null,
    retroTrimMat = null, switchHousingMat = null, stabMat = null,
    feetMat = null, knobMat = null, usbMat = null, socketMat = null;
var switchStemMats = {};

function makeSharedMaterials() {
  capMats.base = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.0, envMapIntensity: 0.55 });
  capMats.mod = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.0, envMapIntensity: 0.55 });
  capMats.accent = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0.0, envMapIntensity: 0.6 });
  plateMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.34, metalness: 0.9, envMapIntensity: 1.0 });
  pcbMat = new THREE.MeshStandardMaterial({ color: 0x14476b, roughness: 0.55, metalness: 0.1, envMapIntensity: 0.4 });
  caseMat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.6, envMapIntensity: 0.9 });
  trayMat = new THREE.MeshStandardMaterial({ color: 0x1a1d21, roughness: 0.7, metalness: 0.1 });
  retroTrimMat = new THREE.MeshStandardMaterial({ color: 0xe5e0d2, roughness: 0.62, metalness: 0.02, envMapIntensity: 0.5 });
  switchHousingMat = new THREE.MeshStandardMaterial({ color: 0x26282d, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.5 });
  switchStemMats.linear = new THREE.MeshStandardMaterial({ color: 0xc44b3f, roughness: 0.5 });
  switchStemMats.tactile = new THREE.MeshStandardMaterial({ color: 0x9a6b4f, roughness: 0.5 });
  switchStemMats.clicky = new THREE.MeshStandardMaterial({ color: 0x4f7ec4, roughness: 0.5 });
  stabMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.0 });
  feetMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, metalness: 0 });
  knobMat = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.1 });
  usbMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 0.85 });
  socketMat = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.6 });
}

/* ---------- 棚拍环境（程序生成，PMREM 预过滤） ---------- */
function buildEnvironment() {
  var envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x14171c);
  function panel(w, h, color, x, y, z, rx, ry) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    envScene.add(m);
  }
  // 大软箱顶光 + 两侧补光板 + 前侧窄条（勾出键帽侧壁高光）
  panel(14, 8, 0xffffff, 0, 10, 0, -Math.PI / 2, 0);
  panel(8, 5, 0xbfc8d4, -10, 4, 2, 0, Math.PI / 2.4);
  panel(6, 4, 0x8a94a2, 10, 3.5, -2, 0, -Math.PI / 2.4);
  panel(12, 1.2, 0xffffff, 0, 2.2, 9, 0, Math.PI);
  var pmrem = new THREE.PMREMGenerator(renderer);
  var envTex = pmrem.fromScene(envScene, 0.05).texture;
  pmrem.dispose();
  return envTex;
}
function applyScenePreset() {
  var p = SCENE_PRESETS[currentConfig().scene] || SCENE_PRESETS.studio;
  if (!glOk) return;
  hemiLight.intensity = p.hemi;
  keyLight.intensity = p.key; keyLight.color.set(p.keyColor);
  rimLight.intensity = p.rim; rimLight.color.set(p.rimColor);
  document.body.dataset.scene = p.bg;
  markDirty();
}

/* ---------- 纹理工厂 ---------- */
function makeCanvas(w, h, draw) {
  var c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; // 颜色贴图声明色彩空间
  t.anisotropy = 8;
  return t;
}
function legendTex(label, color) {
  var k = "lg|" + label + "|" + color;
  if (sharedTex[k]) return sharedTex[k];
  var t = makeCanvas(256, 128, function (ctx) {
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = color;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var size = label.length >= 5 ? 36 : label.length >= 4 ? 42 : label.length >= 2 ? 54 : 66;
    ctx.font = "600 " + size + "px 'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(label, 128, 66);
  });
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  sharedTex[k] = t;
  return t;
}
function knurlTex() {
  if (sharedTex.knurl) return sharedTex.knurl;
  var t = makeCanvas(128, 128, function (ctx) {
    ctx.fillStyle = "#808080"; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "#c8c8c8"; ctx.lineWidth = 2;
    for (var i = -128; i < 256; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 128, 0); ctx.lineTo(i, 128); ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  sharedTex.knurl = t;
  return t;
}
function pcbSilkTex() {
  if (sharedTex.pcbSilk) return sharedTex.pcbSilk;
  var t = makeCanvas(512, 256, function (ctx) {
    ctx.fillStyle = "#14476b"; ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 2;
    for (var i = 0; i < 8; i++) {
      ctx.strokeRect(24 + i * 58, 30, 40, 40);
      ctx.strokeRect(24 + i * 58, 180, 40, 40);
    }
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.font = "700 26px 'Segoe UI',sans-serif";
    ctx.fillText("STELLARAIL · HOT-SWAP PCB", 120, 140);
    ctx.font = "400 16px 'Segoe UI',sans-serif";
    ctx.fillText("结构示意 · 非可制造电路", 170, 168);
  });
  sharedTex.pcbSilk = t;
  return t;
}
function badgeTex(text) {
  var k = "badge|" + text;
  if (sharedTex[k]) return sharedTex[k];
  var t = makeCanvas(320, 80, function (ctx) {
    ctx.fillStyle = "#d9d2c2"; ctx.fillRect(0, 0, 320, 80);
    ctx.strokeStyle = "#4a463c"; ctx.lineWidth = 4; ctx.strokeRect(4, 4, 312, 72);
    ctx.fillStyle = "#4a463c"; ctx.font = "700 28px 'Segoe UI',sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 160, 42);
  });
  sharedTex[k] = t;
  return t;
}

/* ==================== 几何工具 ==================== */
/* 圆角矩形周长采样（XZ 平面，逆时针，角圆弧各 seg 点，共 4*seg 点） */
function roundedRectRing(w, d, r, seg) {
  var pts = [];
  var hw = w / 2 - r, hd = d / 2 - r;
  var corners = [
    [hw, hd, 0], [-hw, hd, Math.PI / 2], [-hw, -hd, Math.PI], [hw, -hd, Math.PI * 1.5]
  ];
  for (var c = 0; c < 4; c++) {
    var cx = corners[c][0], cz = corners[c][1], a0 = corners[c][2];
    for (var i = 0; i < seg; i++) {
      var a = a0 + (i / seg) * Math.PI / 2;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return pts;
}
/* 键帽顶面高度函数：浅凹 + 行倾角（dish 中心最深，边缘回到肩部） */
function dishY(capH, dish, tilt, wTop, dTop, x, z) {
  var nx = Math.max(-1, Math.min(1, x / (wTop / 2)));
  var nz = Math.max(-1, Math.min(1, z / (dTop / 2)));
  var cx = Math.cos(nx * Math.PI) * 0.5 + 0.5;
  var cz = Math.cos(nz * Math.PI) * 0.5 + 0.5;
  return capH - dish * cx * cz - z * Math.tan(tilt);
}

/* ---------- 参数化键帽：分层轮廓 loft + 凹面顶 + 内裙 + 轴心座 ---------- */
var capGeoCache = {};
function capGeometry(w, h, capH, dish, tilt, quality) {
  var key = [w.toFixed(2), h.toFixed(2), capH.toFixed(2), dish.toFixed(3), tilt.toFixed(3), quality].join("|");
  if (capGeoCache[key]) return capGeoCache[key];

  var seg = quality === "high" ? 12 : 6;
  // 分层轮廓：底缘 → 收分 → 肩部
  var rings = [
    { y: 0.02, w: w - 0.06, d: h - 0.06, r: 0.06 },
    { y: capH * 0.5, w: w - 0.14, d: h - 0.14, r: 0.08 },
    { y: capH - 0.045, w: w - 0.23, d: h - 0.23, r: 0.10 },
    { y: capH, w: w - 0.25, d: h - 0.25, r: 0.11 }
  ];
  var P = seg * 4;
  var pos = [];
  var idx = [];
  var ringStart = [];
  rings.forEach(function (rg) {
    ringStart.push(pos.length / 3);
    roundedRectRing(rg.w, rg.d, rg.r, seg).forEach(function (p) {
      pos.push(p[0], rg.y - p[1] * Math.tan(tilt) * (rg.y / capH), p[1]);
    });
  });
  // 侧壁
  for (var r = 0; r < rings.length - 1; r++) {
    var a0 = ringStart[r], b0 = ringStart[r + 1];
    for (var i = 0; i < P; i++) {
      var i2 = (i + 1) % P;
      idx.push(a0 + i, b0 + i, a0 + i2, a0 + i2, b0 + i, b0 + i2);
    }
  }
  // 内裙（底缘内收向上，法线朝内，挡住底口透视）
  var skirtA = pos.length / 3;
  roundedRectRing(w - 0.2, h - 0.2, 0.05, seg).forEach(function (p) { pos.push(p[0], 0.02, p[1]); });
  var skirtB = pos.length / 3;
  roundedRectRing(w - 0.26, h - 0.26, 0.05, seg).forEach(function (p) { pos.push(p[0], 0.12, p[1]); });
  for (var s = 0; s < P; s++) {
    var s2 = (s + 1) % P;
    idx.push(skirtA + s, skirtA + s2, skirtB + s, skirtA + s2, skirtB + s2, skirtB + s);
    // Bottom lip joins outer and inner walls. The cavity remains open below.
    idx.push(s, s2, skirtA + s, s2, skirtA + s2, skirtA + s);
  }
  // Rounded top rings share the actual shoulder boundary: no floating rectangle.
  var wTop = w - 0.25, dTop = h - 0.25;
  var outline = roundedRectRing(wTop, dTop, 0.11, seg);
  var prev = ringStart[ringStart.length - 1];
  // Apply the same surface function at the rounded boundary as in the interior.
  outline.forEach(function (p, i) {
    pos[(prev + i) * 3 + 1] = dishY(capH, dish, tilt, wTop, dTop, p[0], p[1]);
  });
  var radialSteps = quality === "high" ? 16 : 8;
  for (var step = 1; step < radialSteps; step++) {
    var scale = 1 - step / radialSteps, next = pos.length / 3;
    outline.forEach(function (p) {
      var x = p[0] * scale, z = p[1] * scale;
      pos.push(x, dishY(capH, dish, tilt, wTop, dTop, x, z), z);
    });
    for (var t = 0; t < P; t++) {
      var t2 = (t + 1) % P;
      idx.push(prev + t, next + t, prev + t2, prev + t2, next + t, next + t2);
    }
    prev = next;
  }
  var center = pos.length / 3;
  pos.push(0, capH - dish, 0);
  for (var t = 0; t < P; t++) idx.push(prev + t, center, prev + (t + 1) % P);
  // Interior ceiling closes the shell material, without capping the bottom opening.
  var ceiling = pos.length / 3;
  pos.push(0, capH - dish - 0.08, 0);
  for (var t = 0; t < P; t++) idx.push(skirtB + t, skirtB + (t + 1) % P, ceiling);
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  capGeoCache[key] = geo;
  return geo;
}
/* 字符贴合片：跟随凹面与倾角的曲面网格 */
function legendPatchGeometry(w, h, capH, dish, tilt, quality) {
  var lw = Math.min(w - 0.5, 0.92), lh = Math.min(h - 0.5, 0.6);
  var wTop = w - 0.25, dTop = h - 0.25; // 与键帽顶面同参数
  var nx = 6, nz = 5;
  var pos = [], uv = [], idx = [];
  for (var gz = 0; gz <= nz; gz++) {
    for (var gx = 0; gx <= nx; gx++) {
      var x = -lw / 2 + (gx / nx) * lw;
      var z = -lh / 2 + (gz / nz) * lh;
      pos.push(x, dishY(capH - 0.05, dish, tilt, wTop, dTop, x, z) + 0.056, z);
      uv.push(gx / nx, 1 - gz / nz);
    }
  }
  for (var az = 0; az < nz; az++) {
    for (var ax = 0; ax < nx; ax++) {
      var v0 = az * (nx + 1) + ax, v1 = v0 + 1, v2 = v0 + nx + 1, v3 = v2 + 1;
      idx.push(v0, v2, v1, v1, v2, v3);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* 轴心座（键帽内部十字座，取帽时可见） */
function mountSocketGeo() {
  if (sharedGeo.mountSocket) return sharedGeo.mountSocket;
  var g1 = new THREE.BoxGeometry(0.16, 0.22, 0.05);
  var g2 = new THREE.BoxGeometry(0.05, 0.22, 0.16);
  var merged = mergeGeos([g1, g2]);
  sharedGeo.mountSocket = merged;
  return merged;
}
/* 简易几何合并（仅 position/index 的盒体级合并，避免引入 addon） */
function mergeGeos(geos) {
  var pos = [], idx = [], off = 0;
  geos.forEach(function (g) {
    var p = g.getAttribute("position");
    for (var i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    var gi = g.getIndex();
    for (var j = 0; j < gi.count; j++) idx.push(gi.getX(j) + off);
    off += p.count;
  });
  var out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}
/* 钢丝稳定器：弯折路径管 */
function stabWireGeo(len, vertical) {
  var k = (vertical ? "v" : "h") + len.toFixed(2);
  if (sharedGeo["stab" + k]) return sharedGeo["stab" + k];
  var half = len / 2;
  var pts = [
    new THREE.Vector3(-half, 0, 0),
    new THREE.Vector3(-half, -0.1, 0),
    new THREE.Vector3(-half + 0.12, -0.16, 0),
    new THREE.Vector3(half - 0.12, -0.16, 0),
    new THREE.Vector3(half, -0.1, 0),
    new THREE.Vector3(half, 0, 0)
  ];
  var curve = new THREE.CatmullRomCurve3(pts);
  var g = new THREE.TubeGeometry(curve, 24, 0.022, 8, false);
  if (vertical) g.rotateX(Math.PI / 2);
  sharedGeo["stab" + k] = g;
  return g;
}
function stabSeatGeo() {
  if (sharedGeo.stabSeat) return sharedGeo.stabSeat;
  sharedGeo.stabSeat = new THREE.BoxGeometry(0.16, 0.18, 0.14);
  return sharedGeo.stabSeat;
}
/* 轴体：上盖 + 底座 + 十字轴心（共享几何） */
function switchBottomGeo() {
  if (sharedGeo.swBottom) return sharedGeo.swBottom;
  sharedGeo.swBottom = mergeGeos([
    new THREE.BoxGeometry(0.44, 0.16, 0.44),
    new THREE.BoxGeometry(0.3, 0.2, 0.3).translate(0, -0.02, 0)
  ]);
  return sharedGeo.swBottom;
}
function switchTopGeo() {
  if (sharedGeo.swTop) return sharedGeo.swTop;
  sharedGeo.swTop = mergeGeos([
    new THREE.BoxGeometry(0.4, 0.14, 0.4),
    new THREE.BoxGeometry(0.2, 0.18, 0.2)
  ]);
  return sharedGeo.swTop;
}
function crossStemGeo() {
  if (sharedGeo.crossStem) return sharedGeo.crossStem;
  sharedGeo.crossStem = mergeGeos([
    new THREE.BoxGeometry(0.2, 0.16, 0.07),
    new THREE.BoxGeometry(0.07, 0.16, 0.2)
  ]);
  return sharedGeo.crossStem;
}
function footGeo() {
  if (sharedGeo.foot) return sharedGeo.foot;
  sharedGeo.foot = new THREE.CylinderGeometry(0.16, 0.18, 1, 16); // 单位高度，实例按前后脚垫缩放
  return sharedGeo.foot;
}

/* ==================== 键盘工厂 ==================== */
var board = null; // {group, layers, keys, layout, family, knob, bounds}

function profileRowFor(layout, k) {
  var prof = D.KEYCAP_PROFILES[currentConfig().profile];
  if (k.zone === "f") return prof.fnRow;
  // 非 F 区的去重行序
  if (!layout._mainRows) {
    var ys = [];
    layout.keys.forEach(function (x) {
      if (x.zone !== "f" && ys.indexOf(x.y) < 0) ys.push(x.y);
    });
    ys.sort(function (a, b) { return a - b; });
    layout._mainRows = ys;
  }
  var idx = layout._mainRows.indexOf(k.y);
  if (idx === layout._mainRows.length - 1) return prof.bottomRow;
  return prof.rows[Math.min(idx, prof.rows.length - 1)];
}
function displayLabel(label) {
  return D.DISPLAY_LABELS[label] || label;
}

function buildBoard(layoutId, familyId) {
  disposeBoard();
  var cfg = currentConfig();
  var layout = D.getLayout(layoutId);
  var family = D.CASE_FAMILIES[familyId];
  var S = D.STRUCT;
  var W = layout.widthU, H = layout.depthU, bezel = family.bezel;
  var caseW = W + bezel * 2, caseD = H + bezel * 2;
  var quality = cfg.quality;

  var group = new THREE.Group();
  var layers = { case: new THREE.Group(), pcb: new THREE.Group(), plate: new THREE.Group(), switches: new THREE.Group(), caps: new THREE.Group() };
  group.add(layers.case, layers.pcb, layers.plate, layers.switches, layers.caps);
  var keys = [];

  /* 装配高度链（u，全部来自毫米设计参数；定位板下沉，壳沿几乎齐键帽裙底） */
  var plateTop = S.wallTop - 0.12;       // 定位板面下沉隐藏轴体
  var plateBottom = plateTop - S.plateThk;
  var pcbTop = plateBottom - S.plateGap;
  var pcbY = pcbTop - S.pcbThk;          // PCB 底面
  var wallH = S.wallTop - S.bottomPlate; // 侧壁高度
  var capBottom = S.wallTop + 0.02;      // 键帽裙底压住壳沿；按压最低点仍高于板面

  /* ---- 底壳：底板 + 环形侧壁（真内腔） ---- */
  var caseColorHex = caseMat.color.getHex();
  var outerShape = roundedRectShape(caseW, caseD, 0.28);
  var bottomGeo = new THREE.ExtrudeGeometry(outerShape, { depth: S.bottomPlate, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  bottomGeo.rotateX(-Math.PI / 2);
  var bottomShell = new THREE.Mesh(bottomGeo, caseMat);
  bottomShell.userData.ownGeo = true;
  bottomShell.position.y = 0; // 挤出体占据 [-bevel, bottomPlate+bevel]，落地由脚垫接触统一求
  bottomShell.castShadow = bottomShell.receiveShadow = true;
  layers.case.add(bottomShell);

  var wallShape = roundedRectShape(caseW, caseD, 0.28);
  var innerHole = roundedRectPath(W + 0.1, H + 0.1, 0.18);
  wallShape.holes.push(innerHole);
  var wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: wallH, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  wallGeo.rotateX(-Math.PI / 2);
  var wall = new THREE.Mesh(wallGeo, caseMat);
  wall.userData.ownGeo = true;
  wall.position.y = S.bottomPlate; // 挤出体从底板顶面向上延伸
  wall.castShadow = wall.receiveShadow = true;
  layers.case.add(wall);

  /* 承托台：PCB 台阶 + 定位板台阶（内腔环形件） */
  function ledgeFrame(inset, y, h) {
    var s = roundedRectShape(W + 0.1, H + 0.1, 0.16);
    s.holes.push(roundedRectPath(W + 0.1 - inset * 2, H + 0.1 - inset * 2, 0.1));
    var g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    var m = new THREE.Mesh(g, trayMat);
    m.userData.ownGeo = true;
    m.position.y = y;
    m.receiveShadow = true;
    return m;
  }
  layers.case.add(ledgeFrame(0.16, pcbY - 0.06, 0.06));   // PCB 承托
  layers.case.add(ledgeFrame(0.12, plateBottom - 0.06, 0.06)); // 定位板承托

  /* USB-C：后壁开口 + 内腔 + 金属舌片 */
  var usbRecess = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.2, 0.12), trayMat);
  usbRecess.userData.ownGeo = true;
  usbRecess.position.set(0, 0.45, -caseD / 2 - 0.01);
  layers.case.add(usbRecess);
  var usbTongue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.14), usbMat);
  usbTongue.userData.ownGeo = true;
  usbTongue.position.set(0, 0.45, -caseD / 2 + 0.02);
  layers.case.add(usbTongue);

  /* 脚垫：前低后高，打字倾角来自脚垫而非整盘旋转 */
  [[-1, 1, S.footFront], [1, 1, S.footFront], [-1, -1, S.footBack], [1, -1, S.footBack]].forEach(function (p) {
    var f = new THREE.Mesh(footGeo(), feetMat);
    f.scale.y = p[2];
    f.position.set(p[0] * (caseW / 2 - 0.8), -p[2] / 2, p[1] * (caseD / 2 - 0.8));
    f.castShadow = true;
    layers.case.add(f);
  });

  /* ---- PCB：丝印 + 热插拔轴座（实例化） ---- */
  var pcbGeo = new THREE.BoxGeometry(W - 0.05, S.pcbThk, H - 0.05);
  var pcb = new THREE.Mesh(pcbGeo, pcbMat);
  pcb.userData.ownGeo = true;
  pcb.position.y = pcbY + S.pcbThk / 2;
  pcb.receiveShadow = true;
  layers.pcb.add(pcb);
  var silk = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, H - 0.2),
    new THREE.MeshStandardMaterial({ map: pcbSilkTex(), roughness: 0.6, transparent: true, opacity: 0.96 }));
  silk.userData.ownGeo = true; silk.userData.ownMat = true;
  silk.rotation.x = -Math.PI / 2;
  silk.position.y = pcbTop + 0.002;
  layers.pcb.add(silk);
  var n = layout.keys.length;
  var socketGeo = new THREE.BoxGeometry(0.24, 0.05, 0.34);
  sharedGeo.socket = socketGeo;
  var sockets = new THREE.InstancedMesh(socketGeo, socketMat, n);
  var m4 = new THREE.Matrix4();

  /* ---- 定位板：按布局开轴孔与稳定器槽 ---- */
  var plateGeo2 = createPlateGeometry(layout, S.plateThk);
  var plate = new THREE.Mesh(plateGeo2, plateMat);
  plate.name = "定位板";
  plate.userData.ownGeo = true;
  plate.position.y = plateBottom;
  plate.castShadow = plate.receiveShadow = true;
  layers.plate.add(plate);

  /* ---- 轴体：实例化三件（底座/上盖/十字轴心） ---- */
  var swB = new THREE.InstancedMesh(switchBottomGeo(), switchHousingMat, n);
  var swT = new THREE.InstancedMesh(switchTopGeo(), switchHousingMat, n);
  var swS = new THREE.InstancedMesh(crossStemGeo(), switchStemMats[cfg.switch], n);
  var stemBase = [];
  layout.keys.forEach(function (k, i) {
    var cx = k.x + k.w / 2 - W / 2, cz = k.y + k.h / 2 - H / 2;
    m4.makeTranslation(cx, plateBottom - 0.08, cz); swB.setMatrixAt(i, m4);
    m4.makeTranslation(cx, plateTop + 0.10, cz); swT.setMatrixAt(i, m4);
    var sy = plateTop + 0.075; // 轴心顶低于键帽裙底，键隙中不显眼
    m4.makeTranslation(cx, sy, cz); swS.setMatrixAt(i, m4);
    stemBase.push([cx, sy, cz]);
    m4.makeTranslation(cx, pcbTop + 0.03, cz); sockets.setMatrixAt(i, m4);
  });
  swB.castShadow = swT.castShadow = true;
  layers.switches.add(swB, swT, swS);
  layers.pcb.add(sockets);

  /* ---- 稳定器：塑料座 ×2 + 弯折钢丝（横竖长键分别定向） ---- */
  var stabSeatList = [];
  layout.keys.forEach(function (k) {
    if (k.w < 2 && k.h < 2) return;
    var cx = k.x + k.w / 2 - W / 2, cz = k.y + k.h / 2 - H / 2;
    var horiz = k.w >= 2;
    var span = horiz ? k.w : k.h;
    var off = span / 2 - 0.6;
    var wire = new THREE.Mesh(stabWireGeo(span - 0.5, !horiz), stabMat);
    wire.position.set(cx, plateTop + 0.1, cz);
    layers.switches.add(wire);
    [-off, off].forEach(function (o) {
      stabSeatList.push({
        pos: [horiz ? cx + o : cx, plateTop + 0.16, horiz ? cz : cz + o]
      });
    });
  });
  stabSeatBasePos = stabSeatList.map(function (s) { return s.pos; });
  var stabSeats = new THREE.InstancedMesh(stabSeatGeo(), switchHousingMat, Math.max(stabSeatList.length, 1));
  stabSeatList.forEach(function (s, i) {
    m4.makeTranslation(s.pos[0], s.pos[1], s.pos[2]);
    stabSeats.setMatrixAt(i, m4);
  });
  layers.switches.add(stabSeats);

  /* ---- 键帽：参数化轮廓 + 贴面字符 ---- */
  var prof = D.KEYCAP_PROFILES[cfg.profile];
  layout.keys.forEach(function (k, ki) {
    var pr = profileRowFor(layout, k);
    var capH = pr[0], tilt = pr[1], dish = pr[2];
    if (k.w >= 6) dish *= 0.55; // 空格的独立浅凹设计
    var cx = k.x + k.w / 2 - W / 2, cz = k.y + k.h / 2 - H / 2;
    var g = new THREE.Group();
    var cap = new THREE.Mesh(capGeometry(k.w, k.h, capH, dish, tilt, quality), capMats[k.role]);
    cap.position.y = capBottom;
    cap.castShadow = cap.receiveShadow = true;
    g.add(cap);
    // 内轴心座
    var socket = new THREE.Mesh(mountSocketGeo(), switchHousingMat);
    socket.position.y = capBottom + 0.12;
    g.add(socket);
    // 字符
    var label = displayLabel(k.label);
    var legend = null;
    if (label) {
      legend = new THREE.Mesh(legendPatchGeometry(k.w, k.h, capH, dish, tilt, quality),
        new THREE.MeshStandardMaterial({ map: legendTex(label, "#ffffff"), transparent: true, roughness: 0.62, metalness: 0,
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.5 }));
      legend.userData.ownGeo = true; legend.userData.ownMat = true;
      legend.position.y = capBottom;
      g.add(legend);
    }
    // F/J 定位凸点
    if (prof.homingBump && (k.label === "F" || k.label === "J")) {
      var bump = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.05), capMats[k.role]);
      bump.userData.ownGeo = true;
      var bumpZ = (k.h - 0.27) / 2 - 0.18;
      bump.position.set(0, capBottom + dishY(capH, dish, tilt, k.w - 0.25, k.h - 0.25, 0, bumpZ) + 0.008, bumpZ);
      g.add(bump);
    }
    g.position.set(cx, 0, cz);
    layers.caps.add(g);
    keys.push({ def: k, group: g, legend: legend, press: 0, pressed: false, removed: false, stemIdx: ki });
  });
  /* 稳定器座跟随键：记录键 → 座实例下标 */
  var seatCursor = 0;
  keys.forEach(function (kRec, ki) {
    var k = kRec.def;
    if (k.w < 2 && k.h < 2) return;
    kRec.stabSeatIdx = [seatCursor, seatCursor + 1];
    seatCursor += 2;
  });

  /* ---- 外观系列 ---- */
  if (familyId === "retro") {
    // 双色底沿（米白外圈）
    var trimShape = roundedRectShape(caseW + 0.22, caseD + 0.22, 0.34);
    trimShape.holes.push(roundedRectPath(caseW - 0.2, caseD - 0.2, 0.2));
    var trimGeo = new THREE.ExtrudeGeometry(trimShape, { depth: 0.12, bevelEnabled: false });
    trimGeo.rotateX(-Math.PI / 2);
    var trim = new THREE.Mesh(trimGeo, retroTrimMat);
    trim.userData.ownGeo = true;
    trim.position.y = 0.14;
    trim.castShadow = trim.receiveShadow = true;
    layers.case.add(trim);
    // 上框（米白）
    var topFrameShape = roundedRectShape(caseW + 0.04, caseD + 0.04, 0.3);
    topFrameShape.holes.push(roundedRectPath(W - 0.06, H - 0.06, 0.14));
    var topFrameGeo = new THREE.ExtrudeGeometry(topFrameShape, { depth: 0.07, bevelEnabled: false });
    topFrameGeo.rotateX(-Math.PI / 2);
    var topFrame = new THREE.Mesh(topFrameGeo, retroTrimMat);
    topFrame.userData.ownGeo = true;
    topFrame.position.y = S.wallTop + 0.1;
    topFrame.castShadow = topFrame.receiveShadow = true;
    layers.case.add(topFrame);
    // 指示灯 ×3（右上框）
    var ledGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12);
    sharedGeo.led = ledGeo;
    var ledColors = [0x7ee787, 0xffb454, 0x5b8cff];
    for (var li = 0; li < 3; li++) {
      var ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: ledColors[li], emissiveIntensity: 0.9 });
      var led = new THREE.Mesh(ledGeo, ledMat);
      led.userData.ownMat = true;
      led.position.set(W / 2 - 1.5 + li * 0.45, S.wallTop + 0.15, -H / 2 - bezel / 2);
      layers.case.add(led);
    }
    // 铭牌（型号/键数同源生成）
    var L2 = D.getLayout(layoutId);
    var badge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.06),
      new THREE.MeshStandardMaterial({ map: badgeTex("STELLARAIL " + L2.name + " · " + L2.keys.length + " 键"), roughness: 0.5 }));
    badge.userData.ownGeo = true; badge.userData.ownMat = true;
    badge.position.set(-W / 2 + 1.3, 0.4, caseD / 2 + 0.02);
    layers.case.add(badge);
  }
  if (familyId === "translucent") {
    if (quality === "high") {
      caseMat.transmission = 0.72;
      caseMat.thickness = 0.35;
      caseMat.ior = 1.42;
      caseMat.transparent = false;
      caseMat.opacity = 1;
      caseMat.roughness = 0.32;
      caseMat.metalness = 0;
      caseMat.depthWrite = true;
    } else {
      // 低质量档：诚实降级为半透明近似（明确非光学透射）
      caseMat.transmission = 0;
      caseMat.transparent = true;
      caseMat.opacity = 0.42;
      caseMat.roughness = 0.3;
      caseMat.metalness = 0;
      caseMat.depthWrite = false;
    }
  } else {
    caseMat.transmission = 0;
    caseMat.transparent = false;
    caseMat.opacity = 1;
    caseMat.roughness = 0.38;
    caseMat.metalness = 0.6;
    caseMat.depthWrite = true;
  }
  var knobMesh = null;
  if (layout.knob) {
    var kb = layout.knob;
    var kx = kb.x + 0.5 - W / 2, kz = kb.y + 0.5 - H / 2;
    var knobGroup = new THREE.Group();
    var knobBase = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.72, 0.14, 32), switchHousingMat);
    knobBase.userData.ownGeo = true;
    knobBase.position.y = plateTop + 0.07;
    knobGroup.add(knobBase);
    var knobProfile = [];
    [[0.56, 0], [0.6, 0.06], [0.6, 0.3], [0.52, 0.4], [0.46, 0.42]].forEach(function (p) {
      knobProfile.push(new THREE.Vector2(p[0], p[1]));
    });
    knobMesh = new THREE.Mesh(new THREE.LatheGeometry(knobProfile, quality === "high" ? 48 : 24), knobMat);
    knobMesh.userData.ownGeo = true;
    knobMat.bumpMap = knurlTex();
    knobMat.bumpScale = 0.6;
    knobMesh.position.y = plateTop + 0.14;
    knobMesh.castShadow = true;
    var notch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.14),
      new THREE.MeshBasicMaterial({ color: 0xe07856 }));
    notch.userData.ownGeo = true; notch.userData.ownMat = true;
    notch.position.set(0, plateTop + 0.14 + 0.43, 0.32);
    knobGroup.add(notch);
    knobGroup.position.set(kx, 0, kz);
    layers.plate.add(knobGroup);
  }

  /* 落地：按脚垫接触点求支撑高度（不打整盘旋转） */
  group.rotation.x = -Math.atan((S.footBack - S.footFront) / Math.max(caseD - 1.6, 1));
  group.updateMatrixWorld(true);
  var bb = new THREE.Box3().setFromObject(group);
  group.position.y -= bb.min.y; // 脚垫底面贴地

  scene.add(group);
  board = { group: group, layers: layers, keys: keys, layout: layout, family: familyId,
    knob: knobMesh, stems: swS, stemBase: stemBase, stabSeats: stabSeats, capBottom: capBottom };
  applyThemeToBoard();
  applyCaseColorToBoard();
  return board;
}
function roundedRectShape(w, h, r) {
  var s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function roundedRectPath(w, h, r, cx, cz) {
  var p = new THREE.Path();
  // ExtrudeGeometry is built in XY, then rotateX(-PI/2) maps shape Y to -Z.
  // Callers supply keyboard-space X/Z: compensate here exactly once.
  var x = (cx || 0) - w / 2, y = -(cz || 0) - h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

function plateCutouts(layout) {
  var holes = [];
  layout.keys.forEach(function (k) {
    var cx = k.x + k.w / 2 - layout.widthU / 2;
    var cz = k.y + k.h / 2 - layout.depthU / 2;
    holes.push({ keyId: k.id, type: "switch", x: cx, z: cz, w: 0.52, h: 0.52, r: 0.06 });
    if (k.w >= 2 || k.h >= 2) {
      var horizontal = k.w >= 2, off = (horizontal ? k.w : k.h) / 2 - 0.6;
      [-off, off].forEach(function (o) {
        // Rotate the SLOT too, not only its center. Keep a web between independent holes.
        holes.push({ keyId: k.id, type: "stabilizer", x: cx + (horizontal ? o : 0),
          z: cz + (horizontal ? 0 : o), w: horizontal ? 0.20 : 0.24,
          h: horizontal ? 0.24 : 0.20, r: 0.04 });
      });
    }
  });
  return holes;
}

function createPlateGeometry(layout, thickness) {
  var shape = roundedRectShape(layout.widthU + 0.18, layout.depthU + 0.18, 0.2);
  plateCutouts(layout).forEach(function (h) {
    shape.holes.push(roundedRectPath(h.w, h.h, h.r, h.x, h.z));
  });
  var geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function legendColorFor(role, theme, zoneColors) {
  if (zoneColors && zoneColors[role]) {
    var hex = zoneColors[role].replace("#", "");
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    var lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.55 ? "#3a3f45" : "#eceff2";
  }
  return role === "accent" ? theme.legendAccent : role === "mod" ? theme.legendMod : theme.legendBase;
}
function applyThemeToBoard() {
  if (!board) return;
  var cfg = currentConfig();
  var t = D.CAP_THEMES[cfg.capTheme];
  capMats.base.color.set(cfg.zoneColors && cfg.zoneColors.base ? cfg.zoneColors.base : t.base);
  capMats.mod.color.set(cfg.zoneColors && cfg.zoneColors.mod ? cfg.zoneColors.mod : t.mod);
  capMats.accent.color.set(cfg.zoneColors && cfg.zoneColors.accent ? cfg.zoneColors.accent : t.accent);
  board.keys.forEach(function (k) {
    if (!k.legend) return;
    var tex = legendTex(displayLabel(k.def.label), legendColorFor(k.def.role, t, cfg.zoneColors));
    if (k.legend.material.map !== tex) {
      k.legend.material.map = tex; // 共享贴图，仅换引用，不 dispose
      k.legend.material.needsUpdate = true;
    }
  });
  if (switchStemMats[cfg.switch] && board.stems) board.stems.material = switchStemMats[cfg.switch];
}
function applyCaseColorToBoard() {
  if (!board) return;
  var cfg = currentConfig();
  var c = D.CASE_COLORS[cfg.caseColor];
  caseMat.color.set(c.color);
  if (cfg.family === "translucent") {
    var col = new THREE.Color(c.color);
    col.lerp(new THREE.Color(0xffffff), 0.12);
    caseMat.color.copy(col);
  }
  if (cfg.family === "retro") {
    var warm = new THREE.Color(c.color);
    warm.lerp(new THREE.Color(0x8d8a80), 0.35);
    caseMat.color.copy(warm);
  }
  plateMat.color.set(cfg.family === "retro" ? 0x8a8578 : 0x9aa0a6);
}

/* ==================== 相机与视角 ==================== */
var cam = { yaw: 0.55, pitch: 0.55, dist: 20, tx: 0, ty: 0.8, tz: 0 };
var camTarget = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, tx: 0, ty: 0.8, tz: 0 };
var autoSpin = true;
var fitDistCache = 15;
var boardBox = null; // 组装态包围盒

function computeBoardBox() {
  if (!board) return;
  var e = explodeVal;
  explodeVal = 0;
  LAYER_INFO.forEach(function (L) { board.layers[L.key].position.y = 0; });
  board.group.updateMatrixWorld(true);
  boardBox = new THREE.Box3().setFromObject(board.group);
  LAYER_INFO.forEach(function (L) { board.layers[L.key].position.y = e * L.lift; });
  explodeVal = e;
}
function fitCamera(zoomMul) {
  if (!boardBox) return 15;
  var size = new THREE.Vector3();
  boardBox.getSize(size);
  var lift = Math.max(explodeVal, currentConfig().exploded ? 1 : 0) * 3.6;
  var halfW = size.x / 2 + 0.5, halfH = (size.y + lift) / 2 + 0.5, halfD = size.z / 2 + 0.5;
  var aspect = Math.max(container.clientWidth / Math.max(container.clientHeight, 1), 0.3);
  var vFov = camera.fov * Math.PI / 180;
  var hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  var fitR = Math.sqrt(halfW * halfW + halfD * halfD);
  var dv = (halfH + fitR * 0.45) / Math.tan(vFov / 2);
  var dh = fitR / Math.tan(hFov / 2);
  fitDistCache = Math.max(dv, dh) * 1.12 * (zoomMul || 1);
  return fitDistCache;
}
function setView(presetId) {
  var p = D.CAMERA_PRESETS[presetId];
  if (!p) return;
  camTarget.yaw = p.yaw; camTarget.pitch = p.pitch;
  camTarget.tx = 0; camTarget.tz = 0; camTarget.ty = 0.8;
  camTarget.dist = fitCamera(p.zoom || 1);
  clearPartFocus();
  markDirty();
}
function resetView() { setView("hero"); }

/* ---------- 输入 ---------- */
var pointers = new Map();
var dragMoved = 0, pinchDist = 0, knobDrag = null;
var raycaster = null, pointerV = null;
if (glOk) { raycaster = new THREE.Raycaster(); pointerV = new THREE.Vector2(); }
var capPickMode = false;

container.addEventListener("pointerdown", function (e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragMoved = 0;
  container.setPointerCapture(e.pointerId);
  container.classList.add("dragging");
  if (pointers.size === 2) {
    var pts = Array.from(pointers.values());
    pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
  if (pointers.size === 1 && board && board.knob) {
    var hit = pick(e, [board.knob]);
    if (hit) knobDrag = { y: e.clientY, vol: currentConfig().volume };
  }
});
container.addEventListener("pointermove", function (e) {
  if (!pointers.has(e.pointerId)) return;
  var prev = pointers.get(e.pointerId);
  var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragMoved += Math.abs(dx) + Math.abs(dy);
  if (knobDrag) {
    var v = Math.max(0, Math.min(1, knobDrag.vol + (knobDrag.y - e.clientY) * 0.005));
    currentConfig().volume = v;
    if (board.knob) board.knob.rotation.y = v * Math.PI * 1.6;
    syncVolumeUI();
    markDirty();
    return;
  }
  if (pointers.size === 2) {
    var pts = Array.from(pointers.values());
    var nd = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    if (pinchDist > 0 && nd > 0) camTarget.dist = clampDist(camTarget.dist * pinchDist / nd);
    pinchDist = nd;
    markDirty();
    return;
  }
  if (pointers.size === 1) {
    camTarget.yaw -= dx * 0.006;
    camTarget.pitch = clampPitch(camTarget.pitch + dy * 0.005);
    markDirty();
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchDist = 0;
  if (knobDrag) { knobDrag = null; persist(true); renderSummary(); return; }
  if (pointers.size === 0) {
    container.classList.remove("dragging");
    if (dragMoved < 6) handleTap(e);
  }
}
container.addEventListener("pointerup", endPointer);
container.addEventListener("pointercancel", endPointer);
container.addEventListener("lostpointercapture", function (e) { pointers.delete(e.pointerId); });
container.addEventListener("wheel", function (e) {
  e.preventDefault();
  camTarget.dist = clampDist(camTarget.dist * (e.deltaY > 0 ? 1.09 : 0.92));
  markDirty();
}, { passive: false });

function clampPitch(p) { return Math.max(0.1, Math.min(1.4, p)); }
function clampDist(d) { return Math.max(2.5, Math.min(fitDistCache * 2.2, d)); }
function pick(e, objects) {
  if (!raycaster || !board) return null;
  var rect = container.getBoundingClientRect();
  pointerV.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointerV.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerV, camera);
  var hits = raycaster.intersectObjects(objects || board.group.children, true);
  return hits.length ? hits[0] : null;
}
function keyRecFromObject(obj) {
  var o = obj;
  while (o && o.parent !== board.layers.caps) o = o.parent;
  if (!o) return null;
  for (var i = 0; i < board.keys.length; i++) if (board.keys[i].group === o) return board.keys[i];
  return null;
}
function handleTap(e) {
  if (!board) return;
  var hit = pick(e);
  if (!hit) { clearPartFocus(); return; }
  var keyRec = keyRecFromObject(hit.object);
  if (capPickMode && keyRec) { toggleCapRemoved(keyRec); return; }
  if (currentConfig().typing && keyRec) { tapPressKey(keyRec); return; }
  if (!currentConfig().typing) focusPart(hit); // 非体验模式：点按部件聚焦
}

/* ---------- 部件聚焦 ---------- */
var focusedPart = null;
function focusPart(hit) {
  var obj = hit.object;
  var layerName = null, desc = "";
  var o = obj;
  while (o && o.parent && o.parent !== board.group) o = o.parent;
  if (!o) return;
  var L = board.layers;
  var prof = D.KEYCAP_PROFILES[currentConfig().profile];
  if (o === L.caps) { layerName = "键帽"; desc = prof.name + " · ABS（原创轮廓）"; }
  else if (o === L.switches) { layerName = "轴体 · 稳定器"; desc = D.SWITCHES[currentConfig().switch].name + " · 热插拔"; }
  else if (o === L.plate) {
    if (board.knob && (obj === board.knob || obj.parent === board.knob)) { layerName = "音量旋钮"; desc = "CNC 金属 · 滚花 · 拖动调节试轴音量"; }
    else { layerName = "定位板"; desc = "1.5mm 铝合金 · 开孔与轴体同源"; }
  }
  else if (o === L.pcb) { layerName = "PCB"; desc = "热插拔轴座（结构示意）"; }
  else if (o === L.case) { layerName = "底壳"; desc = D.CASE_FAMILIES[currentConfig().family].name; }
  if (!layerName) return;
  focusedPart = { name: layerName, desc: desc };
  var p = hit.point;
  camTarget.tx = p.x; camTarget.ty = p.y; camTarget.tz = p.z;
  camTarget.dist = Math.max(3.2, fitDistCache * 0.22);
  var chip = $("#partChip");
  $("#partChipName").textContent = layerName;
  $("#partChipDesc").textContent = desc;
  chip.hidden = false;
  markDirty();
}
function clearPartFocus() {
  if (!focusedPart) return;
  focusedPart = null;
  $("#partChip").hidden = true;
}
$("#btnOverview").addEventListener("click", function () { resetView(); });

/* ---------- 取帽 ---------- */
function toggleCapRemoved(rec) {
  rec.removed = !rec.removed;
  markDirty();
}

/* ==================== 试键与声音 ==================== */
var audioCtx = null;
function playClick() {
  var cfg = currentConfig();
  if (cfg.muted || cfg.volume <= 0) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    var sp = D.SWITCHES[cfg.switch].sound;
    var t = audioCtx.currentTime;
    var vol = cfg.volume;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(sp.f0, t);
    osc.frequency.exponentialRampToValueAtTime(sp.f1, t + sp.dur);
    gain.gain.setValueAtTime(0.14 * vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + sp.dur + 0.02);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + sp.dur + 0.03);
    if (sp.click) {
      var len = Math.floor(audioCtx.sampleRate * 0.02);
      var buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      var ch = buf.getChannelData(0);
      for (var i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = audioCtx.createBufferSource(); src.buffer = buf;
      var g2 = audioCtx.createGain();
      g2.gain.setValueAtTime(0.25 * vol, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      src.connect(g2); g2.connect(audioCtx.destination);
      src.start(t);
    }
  } catch (e) {}
}
var recentKeys = [], detected = {};
function logKey(label) {
  recentKeys.unshift(label || "␣");
  if (recentKeys.length > 12) recentKeys.pop();
  detected[label || "␣"] = true;
  renderTypeLog();
}
function renderTypeLog() {
  var box = $("#typeRecent");
  box.innerHTML = "";
  if (!recentKeys.length) box.appendChild(el("span", "none", "—"));
  recentKeys.forEach(function (k) { box.appendChild(el("b", null, k)); });
  $("#typeCount").textContent = "本次已检测 " + Object.keys(detected).length + " 个键";
}
function keyDown(rec, silent) {
  if (!rec.pressed && !rec.removed) {
    rec.pressed = true;
    if (!silent) { playClick(); logKey(displayLabel(rec.def.label)); }
    markDirty();
  }
}
function keyUp(rec) {
  if (rec.pressed) { rec.pressed = false; markDirty(); }
}
function tapPressKey(rec) {
  keyDown(rec);
  setTimeout(function () { keyUp(rec); }, 140);
}
function findKeyByCode(code) {
  if (!board) return null;
  for (var i = 0; i < board.keys.length; i++) if (board.keys[i].def.code === code) return board.keys[i];
  return null;
}
function isFormTarget(t) {
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}
window.addEventListener("keydown", function (e) {
  if (!currentConfig().typing) return;
  if (isFormTarget(e.target)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  var rec = findKeyByCode(e.code);
  if (!rec) return;
  if (e.repeat) return;
  if (e.code === "Space" || e.code.indexOf("Arrow") === 0) e.preventDefault();
  keyDown(rec);
});
window.addEventListener("keyup", function (e) {
  var rec = findKeyByCode(e.code);
  if (rec) keyUp(rec);
});
window.addEventListener("blur", releaseAllKeys);
document.addEventListener("visibilitychange", function () { if (document.hidden) releaseAllKeys(); });
function releaseAllKeys() {
  if (!board) return;
  board.keys.forEach(keyUp);
}

/* ==================== 动画主循环（deltaTime） ==================== */
var explodeVal = 0;
var dirty = true, lastT = 0;
function markDirty() { dirty = true; }
var _m4 = new THREE.Matrix4();

function animate(t) {
  requestAnimationFrame(animate);
  var dt = Math.min((t - lastT) / 1000 || 0.016, 0.05);
  lastT = t;
  if (document.hidden) return;

  var moving = false;
  ["yaw", "pitch", "dist", "tx", "ty", "tz"].forEach(function (k) {
    var diff = camTarget[k] - cam[k];
    if (Math.abs(diff) > 1e-4) { cam[k] += diff * (1 - Math.exp(-10 * dt)); moving = true; }
    else cam[k] = camTarget[k];
  });
  if (autoSpin && !REDUCED && pointers.size === 0 && !focusedPart) { camTarget.yaw += dt * 0.12; moving = true; }

  var exDiff = sliderExplode - explodeVal;
  if (Math.abs(exDiff) > 1e-3) {
    explodeVal += exDiff * (1 - Math.exp(-(REDUCED ? 30 : 7) * dt));
    moving = true;
  } else if (explodeVal !== sliderExplode) { explodeVal = sliderExplode; moving = true; }
  if (board) {
    LAYER_INFO.forEach(function (L) {
      board.layers[L.key].position.y = explodeVal * L.lift;
    });
  }

  if (board) {
    var travel = D.STRUCT.stemTravel;
    var stemsDirty = false, seatsDirty = false;
    for (var i = 0; i < board.keys.length; i++) {
      var k = board.keys[i];
      var target = k.removed ? 1.1 + explodeVal * 0 : (k.pressed ? -travel : 0);
      var d = target - k.group.position.y;
      var prevY = k.group.position.y;
      if (Math.abs(d) > 0.001) {
        k.group.position.y += d * (1 - Math.exp(-(k.removed ? 8 : 26) * dt));
        moving = true;
      } else if (k.group.position.y !== target) { k.group.position.y = target; }
      if (k.group.position.y !== prevY) {
        // 轴心与稳定器座跟随键帽，轴壳与定位板不动
        var dy = k.group.position.y;
        var sb = board.stemBase[k.stemIdx];
        _m4.makeTranslation(sb[0], sb[1] + dy, sb[2]);
        board.stems.setMatrixAt(k.stemIdx, _m4);
        stemsDirty = true;
        if (k.stabSeatIdx) {
          for (var sI = 0; sI < k.stabSeatIdx.length; sI++) {
            var sp = stabSeatPos(k.stabSeatIdx[sI]);
            _m4.makeTranslation(sp[0], sp[1] + dy, sp[2]);
            board.stabSeats.setMatrixAt(k.stabSeatIdx[sI], _m4);
          }
          seatsDirty = true;
        }
      }
    }
    if (stemsDirty) board.stems.instanceMatrix.needsUpdate = true;
    if (seatsDirty) board.stabSeats.instanceMatrix.needsUpdate = true;
  }

  if (moving || dirty) {
    dirty = false;
    updateCamera();
    renderer.render(scene, camera);
    perfTick(t);
  }
}
var stabSeatBasePos = [];
function stabSeatPos(i) { return stabSeatBasePos[i]; }
function updateCamera() {
  camera.position.set(
    cam.tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    Math.sin(cam.pitch) * cam.dist + cam.ty,
    cam.tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist
  );
  camera.lookAt(cam.tx, cam.ty, cam.tz);
}

/* 性能 HUD（?perf=1）与压测（?autoswitch=N） */
var perfOn = false, frames = 0, fpsT = 0, fps = 0, soakLeft = 0, soakTimer = null;
function perfTick(t) {
  if (!perfOn) return;
  frames++;
  if (t - fpsT > 500) {
    fps = Math.round(frames * 1000 / (t - fpsT));
    frames = 0; fpsT = t;
    $("#perfHud").textContent =
      "FPS " + fps + "\nDrawCalls " + renderer.info.render.calls +
      "\nGeo " + renderer.info.memory.geometries + "  Tex " + renderer.info.memory.textures +
      (soakLeft > 0 ? "\nSOAK 剩余 " + soakLeft : "");
  }
}

/* ==================== UI：产品选择 ==================== */
function layoutThumb(L) {
  var s = "";
  for (var i = 0; i < L.keys.length; i++) {
    var k = L.keys[i];
    var fill = k.role === "accent" ? "#e07856" : k.role === "mod" ? "#8a8f98" : "#d8d5cc";
    s += '<rect x="' + (k.x * 4) + '" y="' + (k.y * 4) + '" width="' + (k.w * 4 - 0.5) + '" height="' + (k.h * 4 - 0.5) + '" rx="0.6" fill="' + fill + '"/>';
  }
  return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (L.widthU * 4) + " " + (L.depthU * 4) + '">' + s + "</svg>");
}
function renderLayoutCards() {
  var box = $("#layoutCards");
  box.innerHTML = "";
  var cfg = currentConfig();
  D.LAYOUTS.forEach(function (L) {
    var compat = D.resolveLayoutId(L.id, cfg.family) === L.id;
    var b = el("button", "card" + (cfg.layout === L.id || (cfg.layout === "k75k" && L.id === "k75") ? " active" : "") + (compat ? "" : " incompat"));
    b.setAttribute("aria-pressed", cfg.layout === L.id ? "true" : "false");
    var img = new Image(); img.className = "thumb"; img.src = layoutThumb(L); img.alt = "";
    var meta = el("div", "meta");
    meta.appendChild(el("b", null, L.name + " · " + L.percent));
    meta.appendChild(el("span", null, L.keys.length + " 键"));
    b.appendChild(img); b.appendChild(meta);
    if (!compat) b.appendChild(el("span", "lock", "切系列后回退"));
    b.addEventListener("click", function () {
      var c = currentConfig();
      c.layout = L.id;
      applyCompat();
      rebuild();
      persist(true); renderAll();
      closeDrawer();
      toast("已切换到 " + L.name + "（" + L.percent + " · " + L.keys.length + " 键）");
    });
    box.appendChild(b);
  });
}
function renderFamilyCards() {
  var box = $("#familyCards");
  box.innerHTML = "";
  var cfg = currentConfig();
  Object.keys(D.CASE_FAMILIES).forEach(function (fid) {
    var f = D.CASE_FAMILIES[fid];
    var b = el("button", "card" + (cfg.family === fid ? " active" : ""));
    b.setAttribute("aria-pressed", cfg.family === fid ? "true" : "false");
    var meta = el("div", "meta");
    meta.appendChild(el("b", null, f.name));
    meta.appendChild(el("span", null, f.desc));
    b.appendChild(meta);
    b.addEventListener("click", function () {
      var c = currentConfig();
      c.family = fid;
      applyCompat();
      rebuild();
      persist(true); renderAll();
      closeDrawer();
    });
    box.appendChild(b);
  });
}
function applyCompat() {
  var cfg = currentConfig();
  var resolved = D.resolveLayoutId(cfg.layout, cfg.family);
  if (resolved !== cfg.layout) {
    var fallback = resolved || D.CASE_FAMILIES[cfg.family].layouts[0];
    toast("「" + D.CASE_FAMILIES[cfg.family].name + "」暂不支持该配列，已回退到 " + D.getLayout(fallback).name);
    cfg.layout = fallback;
  }
}

/* ==================== UI：外观 ==================== */
function renderCaseSwatches() {
  var box = $("#caseSwatches");
  box.innerHTML = "";
  var cfg = currentConfig();
  Object.keys(D.CASE_COLORS).forEach(function (id) {
    var c = D.CASE_COLORS[id];
    var b = el("button", "swatch" + (cfg.caseColor === id ? " active" : ""));
    b.setAttribute("aria-pressed", cfg.caseColor === id ? "true" : "false");
    var dot = el("div", "dot"); dot.style.background = c.color;
    b.appendChild(dot); b.appendChild(document.createTextNode(c.name));
    b.addEventListener("click", function () {
      currentConfig().caseColor = id; applyCaseColorToBoard();
      persist(true); renderSummary(); renderCaseSwatches();
      markDirty();
    });
    box.appendChild(b);
  });
}
function renderCapSwatches() {
  var box = $("#capSwatches");
  box.innerHTML = "";
  var cfg = currentConfig();
  Object.keys(D.CAP_THEMES).forEach(function (id) {
    var t = D.CAP_THEMES[id];
    var b = el("button", "swatch" + (cfg.capTheme === id && !cfg.zoneColors ? " active" : ""));
    b.setAttribute("aria-pressed", cfg.capTheme === id ? "true" : "false");
    var dot = el("div", "dot split");
    dot.innerHTML = '<i style="background:' + t.base + '"></i><i style="background:' + t.mod + '"></i><i style="background:' + t.accent + '"></i>';
    b.appendChild(dot); b.appendChild(document.createTextNode(t.name));
    b.addEventListener("click", function () {
      var c = currentConfig();
      c.capTheme = id; c.zoneColors = null;
      applyThemeToBoard();
      persist(true); renderSummary(); renderCapSwatches(); renderZoneRows();
      markDirty();
    });
    box.appendChild(b);
  });
}
function renderProfiles() {
  var box = $("#profileSwatches");
  box.innerHTML = "";
  var cfg = currentConfig();
  Object.keys(D.KEYCAP_PROFILES).forEach(function (id) {
    var p = D.KEYCAP_PROFILES[id];
    var b = el("button", "swatch" + (cfg.profile === id ? " active" : ""));
    b.setAttribute("aria-pressed", cfg.profile === id ? "true" : "false");
    b.appendChild(document.createTextNode(p.name));
    b.appendChild(el("small", null, p.desc));
    b.addEventListener("click", function () {
      currentConfig().profile = id;
      rebuild();
      persist(true); renderAll();
      toast("键帽轮廓：" + p.name);
    });
    box.appendChild(b);
  });
}
var ZONE_NAMES = { base: "主键区", mod: "修饰键", accent: "强调键" };
function renderZoneRows() {
  var box = $("#zoneRows");
  box.innerHTML = "";
  var cfg = currentConfig();
  var t = D.CAP_THEMES[cfg.capTheme];
  ["base", "mod", "accent"].forEach(function (role) {
    var rowEl = el("div", "zone-row");
    rowEl.appendChild(el("span", null, ZONE_NAMES[role]));
    var input = document.createElement("input");
    input.type = "color";
    input.value = (cfg.zoneColors && cfg.zoneColors[role]) || t[role];
    input.setAttribute("aria-label", ZONE_NAMES[role] + "颜色");
    input.addEventListener("input", function () {
      var c = currentConfig();
      if (!c.zoneColors) c.zoneColors = {};
      c.zoneColors[role] = input.value;
      applyThemeToBoard(); markDirty();
    });
    input.addEventListener("change", function () { persist(true); renderSummary(); renderCapSwatches(); });
    rowEl.appendChild(input);
    box.appendChild(rowEl);
  });
}
$("#btnZoneReset").addEventListener("click", function () {
  currentConfig().zoneColors = null;
  applyThemeToBoard(); persist(true); renderSummary(); renderZoneRows(); renderCapSwatches(); markDirty();
  toast("已恢复主题默认配色");
});

/* ==================== UI：轴体与音量 ==================== */
function renderSwitches() {
  var box = $("#switchSwatches");
  box.innerHTML = "";
  var cfg = currentConfig();
  Object.keys(D.SWITCHES).forEach(function (id) {
    var s = D.SWITCHES[id];
    var b = el("button", "swatch" + (cfg.switch === id ? " active" : ""));
    b.setAttribute("aria-pressed", cfg.switch === id ? "true" : "false");
    b.appendChild(document.createTextNode(s.name));
    b.appendChild(el("small", null, s.force + " · " + s.travel));
    b.title = s.desc;
    b.addEventListener("click", function () {
      currentConfig().switch = id;
      applyThemeToBoard();
      persist(true); renderSummary(); renderSwitches();
      playClick();
    });
    box.appendChild(b);
  });
}
function syncVolumeUI() {
  var cfg = currentConfig();
  $("#volRange").value = Math.round(cfg.volume * 100);
  $("#btnMute").setAttribute("aria-pressed", cfg.muted ? "true" : "false");
  $("#btnMute").textContent = cfg.muted ? "已静音" : "静音";
}
$("#volRange").addEventListener("input", function (e) {
  var cfg = currentConfig();
  cfg.volume = e.target.value / 100;
  if (board && board.knob) { board.knob.rotation.y = cfg.volume * Math.PI * 1.6; markDirty(); }
});
$("#volRange").addEventListener("change", function () { persist(true); renderSummary(); });
$("#btnMute").addEventListener("click", function () {
  var cfg = currentConfig();
  cfg.muted = !cfg.muted;
  syncVolumeUI(); persist(true); renderSummary();
});

/* ==================== UI：结构拆解 / 取帽 / 层隔离 ==================== */
var sliderExplode = 0;
var soloLayer = null;
function renderLayerLegend() {
  var box = $("#layerLegend");
  box.innerHTML = "";
  LAYER_INFO.forEach(function (L) {
    var b = el("button", "mini-btn", L.name);
    b.setAttribute("aria-pressed", soloLayer === L.key ? "true" : "false");
    b.title = L.desc + "（点击隔离此层，再点恢复）";
    b.addEventListener("click", function () {
      soloLayer = soloLayer === L.key ? null : L.key;
      applySolo();
      renderLayerLegend();
      markDirty();
    });
    box.appendChild(b);
  });
}
function applySolo() {
  if (!board) return;
  LAYER_INFO.forEach(function (L) {
    board.layers[L.key].visible = !soloLayer || soloLayer === L.key;
  });
}
$("#explodeRange").addEventListener("input", function (e) {
  sliderExplode = e.target.value / 100;
  currentConfig().exploded = sliderExplode > 0.5;
  renderExplodeBtn(); markDirty();
});
$("#explodeRange").addEventListener("change", function () { persist(true); renderSummary(); });
function renderExplodeBtn() {
  var on = currentConfig().exploded;
  $("#btnExplode").textContent = on ? "组装键盘 · 复原五层结构" : "拆解键盘 · 查看五层结构";
  $("#btnExplode").setAttribute("aria-pressed", on ? "true" : "false");
  if (sliderExplode !== (on ? 1 : 0)) { sliderExplode = on ? 1 : 0; $("#explodeRange").value = sliderExplode * 100; }
}
$("#btnExplode").addEventListener("click", function () {
  var cfg = currentConfig();
  cfg.exploded = !cfg.exploded;
  renderExplodeBtn();
  persist(true); renderSummary();
});
function renderCapPickBtn() {
  $("#btnCapPick").setAttribute("aria-pressed", capPickMode ? "true" : "false");
  $("#btnCapPick").textContent = capPickMode ? "取帽模式：开（点击键帽放回）" : "取帽模式：点击取下键帽";
}
$("#btnCapPick").addEventListener("click", function () {
  capPickMode = !capPickMode;
  renderCapPickBtn();
  toast(capPickMode ? "取帽模式：点击任意键帽取下，再点放回" : "已退出取帽模式");
});

/* ==================== UI：体验模式 ==================== */
$("#chkType").addEventListener("change", function (e) {
  currentConfig().typing = e.target.checked;
  persist(true); renderSummary();
  toast(e.target.checked ? "体验模式已开启：按下 A–Z 或空格试试（触屏可点按键帽）" : "体验模式已关闭");
});
$("#btnClearKeys").addEventListener("click", function () {
  recentKeys = []; detected = {}; renderTypeLog();
});

/* ==================== 摘要 / 价格 / 英雄区 ==================== */
function renderSummary() {
  var cfg = currentConfig();
  var L = D.getLayout(cfg.layout);
  var fam = D.CASE_FAMILIES[cfg.family];
  var t = D.CAP_THEMES[cfg.capTheme];
  var sw = D.SWITCHES[cfg.switch];
  var prof = D.KEYCAP_PROFILES[cfg.profile];
  var html =
    "型号：<b>" + L.name + "</b> · " + L.percent + " · " + L.keys.length + " 键<br>" +
    "外观：" + fam.name + " · " + D.CASE_COLORS[cfg.caseColor].name + " · " + prof.name + "<br>" +
    "键帽：<b>" + t.name + "</b>" + (cfg.zoneColors ? "（含分区自定义）" : "") + "　轴体：" + sw.name + "<br>" +
    "结构状态：" + (cfg.exploded ? "拆解展示中" : "已组装") + "　体验模式：" + (cfg.typing ? "开" : "关");
  var savedLine = '<span class="saved' + (saveError ? " err" : "") + '">' +
    (saveError ? saveError : "已自动保存 · 刷新页面后自动恢复") + "</span>";
  $("#summary").innerHTML = html + savedLine;
  $("#heroName").textContent = "星轨 " + L.name;
  $("#heroDesc").textContent = L.percent + " 配列 · " + L.keys.length + " 键 · " + fam.name + " · " + L.zones;
  $("#heroPrice").textContent = "¥" + D.estimatePrice(L, cfg.family);
  var bezel = fam.bezel;
  var caseWmm = Math.round((L.widthU + bezel * 2) * D.U_MM);
  var caseDmm = Math.round((L.depthU + bezel * 2) * D.U_MM);
  var chips = $("#heroChips");
  chips.innerHTML = "";
  ["外壳 " + caseWmm + "×" + caseDmm + " mm",
   "键位区 " + Math.round(L.widthU * D.U_MM) + "×" + Math.round(L.depthU * D.U_MM) + " mm",
   L.keys.length + " 键 · " + prof.name,
   sw.name + "（设计值 " + sw.force + "）"].forEach(function (s) {
    chips.appendChild(el("span", null, s));
  });
}

/* ==================== 二维键位图 ==================== */
function renderMap2d() {
  var cfg = currentConfig();
  var L = D.getLayout(cfg.layout);
  var t = D.CAP_THEMES[cfg.capTheme];
  function colorOf(role) {
    return (cfg.zoneColors && cfg.zoneColors[role]) || t[role];
  }
  var s = "";
  L.keys.forEach(function (k) {
    var fill = colorOf(k.role);
    var lg = legendColorFor(k.role, t, cfg.zoneColors);
    var label = displayLabel(k.label);
    s += '<rect x="' + (k.x * 10 + 1) + '" y="' + (k.y * 10 + 1) + '" width="' + (k.w * 10 - 2) + '" height="' + (k.h * 10 - 2) + '" rx="1.5" fill="' + fill + '"/>';
    if (label) {
      s += '<text x="' + ((k.x + k.w / 2) * 10) + '" y="' + ((k.y + k.h / 2) * 10 + 1.8) +
        '" font-size="' + (label.length >= 4 ? 3.4 : 4.5) + '" text-anchor="middle" fill="' + lg + '">' +
        label.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</text>";
    }
  });
  if (L.knob) {
    s += '<circle cx="' + ((L.knob.x + 0.5) * 10) + '" cy="' + ((L.knob.y + 0.5) * 10) + '" r="5" fill="#b9bec6" stroke="#5b6068" stroke-width="1"/>';
  }
  $("#map2d").innerHTML =
    '<svg viewBox="0 0 ' + (L.widthU * 10 + 2) + " " + (L.depthU * 10 + 2) + '" role="img" aria-label="' + L.name + " 键位图\">" + s + "</svg>";
}

/* ==================== 方案管理 ==================== */
function uid() { return "slot-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4); }
function renderSlots() {
  var box = $("#slotList");
  box.innerHTML = "";
  store.slots.forEach(function (s) {
    var rowEl = el("div", "slot" + (s.id === store.activeId ? " active" : ""));
    var name = el("span", "s-name", s.name);
    name.title = s.name;
    rowEl.appendChild(name);
    rowEl.appendChild(el("span", "s-meta", D.getLayout(s.config.layout).name));
    function act(label, fn, title) {
      var b = el("button", "mini-btn", label);
      if (title) b.title = title;
      b.addEventListener("click", fn);
      rowEl.appendChild(b);
    }
    if (s.id !== store.activeId) act("载入", function () {
      store.activeId = s.id;
      rebuild(); persist(true); renderAll();
      toast("已载入方案「" + s.name + "」");
    });
    act("改名", function () {
      var n = window.prompt("方案名称", s.name);
      if (n && n.trim()) { s.name = n.trim().slice(0, 20); persist(true); renderSlots(); renderCompareSelects(); }
    });
    act("复制", function () {
      var copy = { id: uid(), name: (s.name + " 副本").slice(0, 20), config: JSON.parse(JSON.stringify(s.config)) };
      store.slots.push(copy); persist(true); renderSlots(); renderCompareSelects();
    });
    if (store.slots.length > 1) act("删除", function () {
      if (!window.confirm("删除方案「" + s.name + "」？")) return;
      store.slots = store.slots.filter(function (x) { return x.id !== s.id; });
      if (store.activeId === s.id) { store.activeId = store.slots[0].id; rebuild(); renderAll(); }
      persist(true); renderSlots(); renderCompareSelects();
    });
    box.appendChild(rowEl);
  });
}
$("#btnSlotSave").addEventListener("click", function () {
  var name = $("#slotName").value.trim();
  if (!name) { toast("请先输入方案名称", true); return; }
  var cur = activeSlot();
  var s = { id: uid(), name: name, config: JSON.parse(JSON.stringify(cur.config)) };
  store.slots.push(s);
  store.activeId = s.id;
  $("#slotName").value = "";
  persist(true); renderSlots(); renderCompareSelects();
  toast("已保存方案「" + name + "」");
});
$("#btnExportJson").addEventListener("click", function () {
  var data = { app: "stellarail-studio", version: 2, exportedAt: new Date().toISOString(), slots: store.slots, activeId: store.activeId };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "stellarail-configs.json";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
});
$("#btnImportJson").addEventListener("click", function () { $("#fileImport").click(); });
$("#fileImport").addEventListener("change", function (e) {
  var f = e.target.files[0];
  if (!f) return;
  if (f.size > 1024 * 1024) { toast("文件过大（上限 1MB）", true); return; }
  var reader = new FileReader();
  reader.onload = function () {
    try {
      var data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.slots)) throw new Error("缺少 slots 数组");
      var imported = [];
      data.slots.slice(0, 20).forEach(function (s, i) {
        if (!s || typeof s.name !== "string") throw new Error("第 " + (i + 1) + " 个方案缺少名称");
        imported.push({ id: uid() + "-" + i, name: s.name.slice(0, 20), config: normalizeConfig(s.config) });
      });
      if (!imported.length) throw new Error("没有可导入的方案");
      store.slots = store.slots.concat(imported);
      store.activeId = imported[0].id;
      rebuild(); persist(true); renderAll(); renderSlots(); renderCompareSelects();
      toast("已导入 " + imported.length + " 套方案");
    } catch (err) {
      toast("导入失败：" + err.message, true);
    }
    e.target.value = "";
  };
  reader.readAsText(f);
});

/* ==================== 方案对比 ==================== */
function renderCompareSelects() {
  ["#cmpA", "#cmpB"].forEach(function (sel, idx) {
    var box = $(sel);
    box.innerHTML = "";
    store.slots.forEach(function (s) {
      var o = el("option", null, s.name);
      o.value = s.id;
      box.appendChild(o);
    });
    if (store.slots.length) box.value = store.slots[Math.min(idx, store.slots.length - 1)].id;
  });
}
function snapshotOf(cfg, w, h) {
  var bak = JSON.stringify(currentConfig());
  try {
    activeSlot().config = JSON.parse(JSON.stringify(cfg));
    rebuild();
    explodeVal = 0;
    LAYER_INFO.forEach(function (L) { board.layers[L.key].position.y = 0; });
    updateCameraNow();
    renderer.setSize(w, h, false);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    activeSlot().config = JSON.parse(bak);
    rebuild();
    explodeVal = sliderExplode;
    LAYER_INFO.forEach(function (L) { board.layers[L.key].position.y = explodeVal * L.lift; });
    updateCameraNow();
    resize();
    markDirty();
  }
}
function updateCameraNow() {
  computeBoardBox();
  fitCamera();
  cam.yaw = camTarget.yaw = D.CAMERA_PRESETS.hero.yaw;
  cam.pitch = camTarget.pitch = D.CAMERA_PRESETS.hero.pitch;
  cam.dist = camTarget.dist = fitDistCache;
  cam.tx = camTarget.tx = 0; cam.tz = camTarget.tz = 0; cam.ty = camTarget.ty = 0.8;
  updateCamera();
}
$("#btnCompare").addEventListener("click", function () {
  var a = null, b = null;
  store.slots.forEach(function (s) {
    if (s.id === $("#cmpA").value) a = s;
    if (s.id === $("#cmpB").value) b = s;
  });
  var out = $("#cmpResult");
  out.innerHTML = "";
  if (!a || !b) { out.appendChild(el("p", "cmp-empty", "需要至少两套方案。先在「方案管理」中另存。")); return; }
  if (a.id === b.id) { out.appendChild(el("p", "cmp-empty", "选择了同一套方案，请各选一套不同的方案。")); return; }
  if (!glOk) { out.appendChild(el("p", "cmp-empty", "3D 不可用，仅显示参数对比。")); }
  var rows = [
    ["配列", function (c) { var L = D.getLayout(c.layout); return L.name + " · " + L.percent + " · " + L.keys.length + " 键"; }],
    ["外观系列", function (c) { return D.CASE_FAMILIES[c.family].name; }],
    ["外壳颜色", function (c) { return D.CASE_COLORS[c.caseColor].name; }],
    ["键帽主题", function (c) { return D.CAP_THEMES[c.capTheme].name + (c.zoneColors ? "（分区自定义）" : ""); }],
    ["键帽轮廓", function (c) { return D.KEYCAP_PROFILES[c.profile].name; }],
    ["轴体", function (c) { return D.SWITCHES[c.switch].name; }],
    ["演示估价", function (c) { return "¥" + D.estimatePrice(D.getLayout(c.layout), c.family); }]
  ];
  if (glOk) {
    var imgs = el("div", "cmp-imgs");
    [a, b].forEach(function (s) {
      var img = new Image();
      img.alt = s.name;
      img.src = snapshotOf(s.config, 480, 320);
      imgs.appendChild(img);
    });
    out.appendChild(imgs);
  }
  var table = el("table");
  var head = el("tr");
  head.appendChild(el("th", null, "项目"));
  head.appendChild(el("th", null, a.name));
  head.appendChild(el("th", null, b.name));
  table.appendChild(head);
  rows.forEach(function (r) {
    var va = r[1](a.config), vb = r[1](b.config);
    var tr = el("tr");
    tr.appendChild(el("th", null, r[0]));
    tr.appendChild(el("td", va !== vb ? "diff" : null, va));
    tr.appendChild(el("td", va !== vb ? "diff" : null, vb));
    table.appendChild(tr);
  });
  out.appendChild(table);
});

/* ==================== PNG 导出（当前视角） ==================== */
$("#btnExportPng").addEventListener("click", function () {
  if (!glOk) { toast("3D 不可用，无法导出产品图", true); return; }
  var cfg = currentConfig();
  var L = D.getLayout(cfg.layout);
  var W = 1600, H = 1100, imgW = 1600, imgH = 860;
  renderer.setSize(imgW, imgH, false);
  camera.aspect = imgW / imgH;
  camera.updateProjectionMatrix();
  updateCamera();
  renderer.render(scene, camera);
  var shot = renderer.domElement.toDataURL("image/png");
  resize(); markDirty();
  var cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  var ctx = cv.getContext("2d");
  var grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#1d2530"); grad.addColorStop(1, "#0b0d11");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  var img = new Image();
  img.onload = function () {
    ctx.drawImage(img, 0, 0, imgW, imgH);
    ctx.fillStyle = "#e8eaee";
    ctx.font = "800 44px 'Segoe UI','PingFang SC',sans-serif";
    ctx.fillText("STELLARAIL 星轨 " + L.name, 60, imgH + 80);
    ctx.font = "400 26px 'Segoe UI','PingFang SC',sans-serif";
    ctx.fillStyle = "#9aa3af";
    var fam = D.CASE_FAMILIES[cfg.family], t = D.CAP_THEMES[cfg.capTheme], sw = D.SWITCHES[cfg.switch];
    ctx.fillText(L.percent + " · " + L.keys.length + " 键 · " + fam.name + " · " + D.CASE_COLORS[cfg.caseColor].name + " · " + D.KEYCAP_PROFILES[cfg.profile].name, 60, imgH + 130);
    ctx.fillText("键帽 " + t.name + " · 轴体 " + sw.name + " · 演示估价 ¥" + D.estimatePrice(L, cfg.family), 60, imgH + 175);
    cv.toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "stellarail-" + L.id + "-" + cfg.family + ".png";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast("已导出产品配置卡 PNG（当前视角）");
    }, "image/png");
  };
  img.src = shot;
});

/* ==================== 保存 / 恢复默认 ==================== */
$("#btnSave").addEventListener("click", function () { persist(false); });
$("#btnReset").addEventListener("click", function () {
  try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  store = { version: 2, activeId: "slot-default", slots: [{ id: "slot-default", name: "默认方案", config: defaultConfig() }] };
  rebuild(); persist(true); renderAll();
  toast("已恢复默认配置（仅清除本页面的保存项）");
});

/* ==================== 视角 / 场景 / 质量 / 专注模式 / 抽屉 ==================== */
document.querySelectorAll(".view-btn").forEach(function (b) {
  b.addEventListener("click", function () {
    setView(b.dataset.view);
    document.querySelectorAll(".view-btn").forEach(function (x) {
      x.setAttribute("aria-pressed", x === b ? "true" : "false");
    });
  });
});
$("#chkSpin").addEventListener("change", function (e) {
  autoSpin = e.target.checked;
  markDirty();
});
function renderSceneSelect() {
  var sel = $("#sceneSelect");
  sel.innerHTML = "";
  Object.keys(SCENE_PRESETS).forEach(function (id) {
    var o = el("option", null, SCENE_PRESETS[id].name);
    o.value = id;
    sel.appendChild(o);
  });
  sel.value = currentConfig().scene;
}
$("#sceneSelect").addEventListener("change", function (e) {
  currentConfig().scene = e.target.value;
  applyScenePreset(); persist(true); renderSummary();
});
$("#qualitySelect").addEventListener("change", function (e) {
  currentConfig().quality = e.target.value;
  applyQuality();
  rebuild();
  persist(true);
  toast("质量档位：" + (e.target.value === "high" ? "高（完整细分与透射）" : "低（降细分，透射降级为近似）"));
});
function applyQuality() {
  if (!glOk) return;
  var high = currentConfig().quality === "high";
  renderer.setPixelRatio(high ? Math.min(window.devicePixelRatio, 2) : 1);
  renderer.shadowMap.enabled = true;
  keyLight.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
  keyLight.shadow.map && keyLight.shadow.map.dispose();
  keyLight.shadow.map = null;
  $("#qualitySelect").value = currentConfig().quality;
}
var lastFocusToggle = 0;
function toggleFocusMode() {
  var now = Date.now();
  if (now - lastFocusToggle < 300) return;
  lastFocusToggle = now;
  document.body.classList.toggle("focus-mode");
  var on = document.body.classList.contains("focus-mode");
  $("#btnFocusMode").textContent = on ? "退出专注" : "专注展示";
  resize();
}
$("#btnFocusMode").addEventListener("click", toggleFocusMode);
$("#btnFocusMode").addEventListener("touchend", function (e) { e.preventDefault(); toggleFocusMode(); });
var lastDrawerToggle = 0;
function toggleDrawer() {
  var now = Date.now();
  if (now - lastDrawerToggle < 300) return; // 触屏双击/双事件去抖
  lastDrawerToggle = now;
  document.body.classList.toggle("drawer-open");
}
$("#btnDrawer").addEventListener("click", toggleDrawer);
$("#btnDrawer").addEventListener("touchend", function (e) { e.preventDefault(); toggleDrawer(); });
function closeDrawer() { document.body.classList.remove("drawer-open"); }

/* ==================== toast / 重建 / 启动 ==================== */
var toastTimer = null;
function toast(msg, isErr) {
  var t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("err", !!isErr);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function rebuild() {
  var cfg = currentConfig();
  if (!glOk) { renderMap2d(); return; }
  buildBoard(cfg.layout, cfg.family);
  if (board.knob) board.knob.rotation.y = cfg.volume * Math.PI * 1.6;
  applySolo();
  computeBoardBox();
  fitCamera();
  if (Math.abs(camTarget.dist - fitDistCache) > fitDistCache * 0.6 || camTarget.dist > fitDistCache * 2.2) {
    camTarget.dist = fitDistCache;
  }
  explodeVal = cfg.exploded ? 1 : 0;
  sliderExplode = explodeVal;
  LAYER_INFO.forEach(function (L) { board.layers[L.key].position.y = explodeVal * L.lift; });
  markDirty();
}
function renderAll() {
  renderLayoutCards(); renderFamilyCards();
  renderCaseSwatches(); renderCapSwatches(); renderProfiles(); renderZoneRows();
  renderSwitches(); syncVolumeUI();
  renderExplodeBtn(); renderLayerLegend(); renderCapPickBtn(); renderSceneSelect();
  $("#chkType").checked = currentConfig().typing;
  renderSummary(); renderMap2d(); renderSlots(); renderCompareSelects();
  renderTypeLog();
}

function resize() {
  if (!glOk) return;
  var w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fitCamera();
  if (!focusedPart && Math.abs(camTarget.dist - fitDistCache) > fitDistCache * 1.5) camTarget.dist = fitDistCache;
  markDirty();
}
window.addEventListener("resize", resize);

function boot() {
  loadStore();
  if (!glOk) {
    $("#glFallback").hidden = false;
    $("#fallbackMsg").textContent = "当前环境无法创建 WebGL 上下文。你仍可浏览全部配置、二维键位图与方案管理。";
    $("#btnReload").addEventListener("click", function () { location.reload(); });
    renderAll();
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    $("#glFallback").hidden = false;
    $("#fallbackMsg").textContent = "显卡渲染上下文丢失（可能因系统资源压力）。点击重新加载可恢复。";
  });

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  scene.environment = buildEnvironment();
  hemiLight = new THREE.HemisphereLight(0xdfe8ff, 0x1a1c20, 0.55);
  scene.add(hemiLight);
  keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(7, 12, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -14; keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 14; keyLight.shadow.camera.bottom = -14;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);
  rimLight = new THREE.DirectionalLight(0x88aaff, 0.5);
  rimLight.position.set(-8, 6, -7);
  scene.add(rimLight);
  var ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.ShadowMaterial({ opacity: 0.26 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  makeSharedMaterials();
  applyQuality();
  applyScenePreset();
  rebuild();
  renderAll();
  resize();
  setView("hero");
  cam.yaw = camTarget.yaw; cam.pitch = camTarget.pitch; cam.dist = camTarget.dist;
  if (REDUCED) { autoSpin = false; $("#chkSpin").checked = false; }
  if (saveError) toast(saveError, true);

  var qs = new URLSearchParams(location.search);
  if (qs.get("perf") === "1") { perfOn = true; $("#perfHud").hidden = false; }
  var soak = parseInt(qs.get("autoswitch") || "0", 10);
  if (soak > 0) {
    perfOn = true; $("#perfHud").hidden = false;
    var ids = D.LAYOUTS.map(function (L) { return L.id; });
    var fams = Object.keys(D.CASE_FAMILIES);
    var si = 0;
    soakLeft = soak;
    soakTimer = setInterval(function () {
      if (soakLeft <= 0) { clearInterval(soakTimer); return; }
      var c = currentConfig();
      c.layout = ids[si % ids.length];
      c.family = fams[si % fams.length]; // 混合系列切换
      si++; soakLeft--;
      applyCompat(); rebuild(); renderAll();
    }, 250);
  }
  requestAnimationFrame(animate);
}
boot();
})();
