/* ============================================================
 * 星轨键盘工作室 · 数据模型
 * 纯数据文件：无 DOM/THREE 依赖，可被浏览器 <script> 与 Node 校验脚本共用。
 * 布局单位 u：1u = 19.05mm。键位使用显式 x/y/w/h，不再逐行累加。
 * ============================================================ */
(function (root) {
"use strict";

var U_MM = 19.05; // 1u 物理换算

/* ---------- 键定义辅助 ----------
 * defs 元素：数字 n 表示向右留出 n u 间隔；
 * [label, w, code] / [label, w, h, code] / [label, w, code, zone] / [label, w, h, code, zone]
 * zone 缺省 'main'。 */
function row(y, zone, defs) {
  var keys = [], x = 0;
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i];
    if (typeof d === "number") { x += d; continue; }
    var label = d[0], w = d[1], h = 1, code = null, zn = zone;
    for (var j = 2; j < d.length; j++) {
      if (typeof d[j] === "number") h = d[j];
      else if (d[j] && d[j].charAt(0) === "z") zn = d[j].slice(1); // 'znav' 形式
      else code = d[j];
    }
    keys.push({ label: label, x: x, y: y, w: w, h: h, code: code || autoCode(label), zone: zn });
    x += w;
  }
  return keys;
}
function autoCode(label) {
  if (/^[A-Z]$/.test(label)) return "Key" + label;
  if (/^[0-9]$/.test(label)) return "Digit" + label;
  return null;
}
/* 合并若干行并分配稳定 id / role */
function buildKeys(idPrefix, rowsArr) {
  var out = [];
  for (var r = 0; r < rowsArr.length; r++) {
    var ks = rowsArr[r];
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      k.id = idPrefix + "-r" + r + "-" + i;
      k.role = roleOf(k);
      out.push(k);
    }
  }
  return out;
}
var ACCENT_LABELS = { "Esc": 1, "⏎": 1, "Enter": 1, "↑": 1, "↓": 1, "←": 1, "→": 1, "⏎N": 1 };
var MOD_LABELS = { "⌫": 1, "⇥": 1, "⇪": 1, "⇧": 1, "Ctrl": 1, "Win": 1, "Alt": 1, "Fn": 1, "Menu": 1,
  "Del": 1, "Ins": 1, "Home": 1, "End": 1, "PgUp": 1, "PgDn": 1, "PrtSc": 1, "ScrLk": 1, "Pause": 1,
  "NumLk": 1, "F1": 1, "F2": 1, "F3": 1, "F4": 1, "F5": 1, "F6": 1, "F7": 1, "F8": 1, "F9": 1,
  "F10": 1, "F11": 1, "F12": 1 };
function roleOf(k) {
  if (ACCENT_LABELS[k.label]) return "accent";
  if (k.zone === "arrow") return "accent";
  if (MOD_LABELS[k.label] || k.zone === "num" || k.zone === "nav" || k.zone === "f") return "mod";
  if (k.label === "") return "mod";
  return "base";
}

/* ---------- 六套 ANSI 配列 ---------- */
/* 每套：id/名称/百分比/板宽板深(u)/键数组/功能区说明/旋钮位(可选) */

function layout60() {
  var rows = [
    row(0, "main", [["Esc", 1], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1, "Minus"], ["=", 1, "Equal"], ["⌫", 2, "Backspace"]]),
    row(1, "main", [["⇥", 1.5, "Tab"], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1, "BracketLeft"], ["]", 1, "BracketRight"], ["\\", 1.5, "Backslash"]]),
    row(2, "main", [["⇪", 1.75, "CapsLock"], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1, "Semicolon"], ["'", 1, "Quote"], ["⏎", 2.25, "Enter"]]),
    row(3, "main", [["⇧", 2.25, "ShiftLeft"], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1, "Comma"], [".", 1, "Period"], ["/", 1, "Slash"], ["⇧", 2.75, "ShiftRight"]]),
    row(4, "main", [["Ctrl", 1.25, "ControlLeft"], ["Win", 1.25, "MetaLeft"], ["Alt", 1.25, "AltLeft"], ["", 6.25, "Space"], ["Alt", 1, "AltRight"], ["Fn", 1], ["Ctrl", 1, "ControlRight"], ["Menu", 1, "ContextMenu"]])
  ];
  return { id: "k60", name: "K60", percent: "60%", widthU: 15, depthU: 5,
    zones: "主键区一体成型，无独立 F 区 / 方向区",
    keys: buildKeys("k60", rows) };
}

function layout65() {
  var rows = [
    row(0, "main", [["Esc", 1], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1, "Minus"], ["=", 1, "Equal"], ["⌫", 2, "Backspace"], ["Del", 1, "Delete", "znav"]]),
    row(1, "main", [["⇥", 1.5, "Tab"], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1, "BracketLeft"], ["]", 1, "BracketRight"], ["\\", 1.5, "Backslash"], ["PgUp", 1, "PageUp", "znav"]]),
    row(2, "main", [["⇪", 1.75, "CapsLock"], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1, "Semicolon"], ["'", 1, "Quote"], ["⏎", 2.25, "Enter"], ["PgDn", 1, "PageDown", "znav"]]),
    row(3, "main", [["⇧", 2.25, "ShiftLeft"], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1, "Comma"], [".", 1, "Period"], ["/", 1, "Slash"], ["⇧", 1.75, "ShiftRight"], ["↑", 1, "ArrowUp", "zarrow"], ["Home", 1, "Home", "znav"]]),
    row(4, "main", [["Ctrl", 1.25, "ControlLeft"], ["Win", 1.25, "MetaLeft"], ["Alt", 1.25, "AltLeft"], ["", 6.25, "Space"], ["Alt", 1, "AltRight"], ["Fn", 1], ["Ctrl", 1, "ControlRight"], ["←", 1, "ArrowLeft", "zarrow"], ["↓", 1, "ArrowDown", "zarrow"], ["→", 1, "ArrowRight", "zarrow"]])
  ];
  return { id: "k65", name: "K65", percent: "65%", widthU: 16, depthU: 5,
    zones: "主键区 + 右侧导航列（Del/PgUp/PgDn/Home）+ 倒 T 方向键",
    keys: buildKeys("k65", rows) };
}

function layout75(knobVariant) {
  var frow = [["Esc", 1, null, "zf"], ["F1", 1, null, "zf"], ["F2", 1, null, "zf"], ["F3", 1, null, "zf"], ["F4", 1, null, "zf"], ["F5", 1, null, "zf"], ["F6", 1, null, "zf"], ["F7", 1, null, "zf"], ["F8", 1, null, "zf"], ["F9", 1, null, "zf"], ["F10", 1, null, "zf"], ["F11", 1, null, "zf"], ["F12", 1, null, "zf"]];
  if (!knobVariant) frow.push(["Del", 1, "Delete", "znav"]);
  var rows = [
    row(0, "f", frow),
    row(1, "main", [["`", 1, "Backquote"], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1, "Minus"], ["=", 1, "Equal"], ["⌫", 2, "Backspace"], ["Home", 1, "Home", "znav"]]),
    row(2, "main", [["⇥", 1.5, "Tab"], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1, "BracketLeft"], ["]", 1, "BracketRight"], ["\\", 1.5, "Backslash"], ["PgUp", 1, "PageUp", "znav"]]),
    row(3, "main", [["⇪", 1.75, "CapsLock"], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1, "Semicolon"], ["'", 1, "Quote"], ["⏎", 2.25, "Enter"], ["PgDn", 1, "PageDown", "znav"]]),
    row(4, "main", [["⇧", 2.25, "ShiftLeft"], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1, "Comma"], [".", 1, "Period"], ["/", 1, "Slash"], ["⇧", 1.75, "ShiftRight"], ["↑", 1, "ArrowUp", "zarrow"], ["End", 1, "End", "znav"]]),
    row(5, "main", [["Ctrl", 1.25, "ControlLeft"], ["Win", 1.25, "MetaLeft"], ["Alt", 1.25, "AltLeft"], ["", 6.25, "Space"], ["Alt", 1, "AltRight"], ["Fn", 1], ["Ctrl", 1, "ControlRight"], ["←", 1, "ArrowLeft", "zarrow"], ["↓", 1, "ArrowDown", "zarrow"], ["→", 1, "ArrowRight", "zarrow"]])
  ];
  var L = { id: knobVariant ? "k75k" : "k75", name: knobVariant ? "K75 Pro" : "K75", percent: "75%", widthU: 16, depthU: 6,
    zones: "F 区 + 主键区 + 右侧导航列 + 倒 T 方向键（紧凑变体）",
    keys: buildKeys(knobVariant ? "k75k" : "k75", rows) };
  if (knobVariant) L.knob = { x: 15, y: 0, r: 0.62 }; // 占用 Del 键位（右上角）
  return L;
}

function layoutTKL() {
  var rows = [
    row(0, "f", [["Esc", 1], 1, ["F1", 1], ["F2", 1], ["F3", 1], ["F4", 1], 0.5, ["F5", 1], ["F6", 1], ["F7", 1], ["F8", 1], 0.5, ["F9", 1], ["F10", 1], ["F11", 1], ["F12", 1], 0.5, ["PrtSc", 1, "PrintScreen"], ["ScrLk", 1, "ScrollLock"], ["Pause", 1, "Pause"]]),
    row(1.5, "main", [["`", 1, "Backquote"], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1, "Minus"], ["=", 1, "Equal"], ["⌫", 2, "Backspace"], 0.5, ["Ins", 1, "Insert", "znav"], ["Home", 1, "Home", "znav"], ["PgUp", 1, "PageUp", "znav"]]),
    row(2.5, "main", [["⇥", 1.5, "Tab"], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1, "BracketLeft"], ["]", 1, "BracketRight"], ["\\", 1.5, "Backslash"], 0.5, ["Del", 1, "Delete", "znav"], ["End", 1, "End", "znav"], ["PgDn", 1, "PageDown", "znav"]]),
    row(3.5, "main", [["⇪", 1.75, "CapsLock"], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1, "Semicolon"], ["'", 1, "Quote"], ["⏎", 2.25, "Enter"]]),
    row(4.5, "main", [["⇧", 2.25, "ShiftLeft"], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1, "Comma"], [".", 1, "Period"], ["/", 1, "Slash"], ["⇧", 2.75, "ShiftRight"], 1.5, ["↑", 1, "ArrowUp", "zarrow"]]),
    row(5.5, "main", [["Ctrl", 1.25, "ControlLeft"], ["Win", 1.25, "MetaLeft"], ["Alt", 1.25, "AltLeft"], ["", 6.25, "Space"], ["Alt", 1.25, "AltRight"], ["Fn", 1.25], ["Menu", 1.25, "ContextMenu"], ["Ctrl", 1.25, "ControlRight"], 0.5, ["←", 1, "ArrowLeft", "zarrow"], ["↓", 1, "ArrowDown", "zarrow"], ["→", 1, "ArrowRight", "zarrow"]])
  ];
  return { id: "k80", name: "K80", percent: "80% TKL", widthU: 18.5, depthU: 6.5,
    zones: "F 区 + 主键区 + 独立导航区 + 独立方向区，无数字小键盘",
    keys: buildKeys("k80", rows) };
}

function layout96() {
  var rows = [
    row(0, "f", [["Esc", 1], ["F1", 1], ["F2", 1], ["F3", 1], ["F4", 1], ["F5", 1], ["F6", 1], ["F7", 1], ["F8", 1], ["F9", 1], ["F10", 1], ["F11", 1], ["F12", 1], ["Del", 1, "Delete", "znav"], ["Home", 1, "Home", "znav"], ["End", 1, "End", "znav"], ["Ins", 1, "Insert", "znav"], ["PrtSc", 1, "PrintScreen", "znav"], ["ScrLk", 1, "ScrollLock", "znav"], ["Pause", 1, "Pause", "znav"]]),
    row(1, "main", [["`", 1, "Backquote"], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1, "Minus"], ["=", 1, "Equal"], ["⌫", 2, "Backspace"], 1, ["NL", 1, "NumLock", "znum"], ["N/", 1, "NumpadDivide", "znum"], ["N*", 1, "NumpadMultiply", "znum"], ["N-", 1, "NumpadSubtract", "znum"]]),
    row(2, "main", [["⇥", 1.5, "Tab"], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1, "BracketLeft"], ["]", 1, "BracketRight"], ["\\", 1.5, "Backslash"], 1, ["7", 1, "Numpad7", "znum"], ["8", 1, "Numpad8", "znum"], ["9", 1, "Numpad9", "znum"], ["N+", 1, 2, "NumpadAdd", "znum"]]),
    row(3, "main", [["⇪", 1.75, "CapsLock"], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1, "Semicolon"], ["'", 1, "Quote"], ["⏎", 2.25, "Enter"], 1, ["4", 1, "Numpad4", "znum"], ["5", 1, "Numpad5", "znum"], ["6", 1, "Numpad6", "znum"]]),
    row(4, "main", [["⇧", 2.25, "ShiftLeft"], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1, "Comma"], [".", 1, "Period"], ["/", 1, "Slash"], ["⇧", 1.75, "ShiftRight"], ["↑", 1, "ArrowUp", "zarrow"], 1, ["1", 1, "Numpad1", "znum"], ["2", 1, "Numpad2", "znum"], ["3", 1, "Numpad3", "znum"], ["⏎N", 1, 2, "NumpadEnter", "znum"]]),
    row(5, "main", [["Ctrl", 1.25, "ControlLeft"], ["Win", 1.25, "MetaLeft"], ["Alt", 1.25, "AltLeft"], ["", 6.25, "Space"], ["Alt", 1, "AltRight"], ["Fn", 1], ["Ctrl", 1, "ControlRight"], ["←", 1, "ArrowLeft", "zarrow"], ["↓", 1, "ArrowDown", "zarrow"], ["→", 1, "ArrowRight", "zarrow"], ["0", 2, "Numpad0", "znum"], [".", 1, "NumpadDecimal", "znum"]])
  ];
  return { id: "k96", name: "K96", percent: "96%", widthU: 20, depthU: 6,
    zones: "紧凑功能区 + 数字小键盘（导航键并入 F 行右侧）",
    keys: buildKeys("k96", rows) };
}

function layout100() {
  var rows = [
    row(0, "f", [["Esc", 1], 1, ["F1", 1], ["F2", 1], ["F3", 1], ["F4", 1], 0.5, ["F5", 1], ["F6", 1], ["F7", 1], ["F8", 1], 0.5, ["F9", 1], ["F10", 1], ["F11", 1], ["F12", 1], 0.5, ["PrtSc", 1, "PrintScreen", "znav"], ["ScrLk", 1, "ScrollLock", "znav"], ["Pause", 1, "Pause", "znav"]]),
    row(1.5, "main", [["`", 1, "Backquote"], ["1", 1], ["2", 1], ["3", 1], ["4", 1], ["5", 1], ["6", 1], ["7", 1], ["8", 1], ["9", 1], ["0", 1], ["-", 1, "Minus"], ["=", 1, "Equal"], ["⌫", 2, "Backspace"], 0.5, ["Ins", 1, "Insert", "znav"], ["Home", 1, "Home", "znav"], ["PgUp", 1, "PageUp", "znav"], 0.5, ["NumLk", 1, "NumLock", "znum"], ["/", 1, "NumpadDivide", "znum"], ["*", 1, "NumpadMultiply", "znum"], ["-", 1, "NumpadSubtract", "znum"]]),
    row(2.5, "main", [["⇥", 1.5, "Tab"], ["Q", 1], ["W", 1], ["E", 1], ["R", 1], ["T", 1], ["Y", 1], ["U", 1], ["I", 1], ["O", 1], ["P", 1], ["[", 1, "BracketLeft"], ["]", 1, "BracketRight"], ["\\", 1.5, "Backslash"], 0.5, ["Del", 1, "Delete", "znav"], ["End", 1, "End", "znav"], ["PgDn", 1, "PageDown", "znav"], 0.5, ["7", 1, "Numpad7", "znum"], ["8", 1, "Numpad8", "znum"], ["9", 1, "Numpad9", "znum"], ["+", 1, 2, "NumpadAdd", "znum"]]),
    row(3.5, "main", [["⇪", 1.75, "CapsLock"], ["A", 1], ["S", 1], ["D", 1], ["F", 1], ["G", 1], ["H", 1], ["J", 1], ["K", 1], ["L", 1], [";", 1, "Semicolon"], ["'", 1, "Quote"], ["⏎", 2.25, "Enter"], 4, ["4", 1, "Numpad4", "znum"], ["5", 1, "Numpad5", "znum"], ["6", 1, "Numpad6", "znum"]]),
    row(4.5, "main", [["⇧", 2.25, "ShiftLeft"], ["Z", 1], ["X", 1], ["C", 1], ["V", 1], ["B", 1], ["N", 1], ["M", 1], [",", 1, "Comma"], [".", 1, "Period"], ["/", 1, "Slash"], ["⇧", 2.75, "ShiftRight"], 1.5, ["↑", 1, "ArrowUp", "zarrow"], 1.5, ["1", 1, "Numpad1", "znum"], ["2", 1, "Numpad2", "znum"], ["3", 1, "Numpad3", "znum"], ["⏎N", 1, 2, "NumpadEnter", "znum"]]),
    row(5.5, "main", [["Ctrl", 1.25, "ControlLeft"], ["Win", 1.25, "MetaLeft"], ["Alt", 1.25, "AltLeft"], ["", 6.25, "Space"], ["Alt", 1.25, "AltRight"], ["Fn", 1.25], ["Menu", 1.25, "ContextMenu"], ["Ctrl", 1.25, "ControlRight"], 0.5, ["←", 1, "ArrowLeft", "zarrow"], ["↓", 1, "ArrowDown", "zarrow"], ["→", 1, "ArrowRight", "zarrow"], 0.5, ["0", 2, "Numpad0", "znum"], [".", 1, "NumpadDecimal", "znum"]])
  ];
  return { id: "k100", name: "K100", percent: "100%", widthU: 23, depthU: 6.5,
    zones: "主键区 + F 区 + 导航区 + 方向区 + 数字小键盘，五区独立",
    keys: buildKeys("k100", rows) };
}

var LAYOUTS = [layout60(), layout65(), layout75(false), layoutTKL(), layout96(), layout100()];
var LAYOUT_75_KNOB = layout75(true); // 旋钮工作站专用 75% 变体

/* ---------- 外壳系列（外观不只是颜色：轮廓/边框/附件不同） ---------- */
var CASE_FAMILIES = {
  minimal: { name: "极简铝合金", desc: "细腻哑光阳极氧化，窄边框，清晰倒角",
    bezel: 0.35, priceAdd: 0, layouts: ["k60", "k65", "k75", "k80", "k96", "k100"] },
  retro: { name: "复古工作站", desc: "暖灰/米白双色，厚边框，指示灯与复古铭牌",
    bezel: 0.6, priceAdd: 80, layouts: ["k60", "k65", "k75", "k80", "k100"] },
  translucent: { name: "半透明外壳", desc: "磨砂半透明壳体，内部 PCB 与定位板层次可见",
    bezel: 0.4, priceAdd: 60, layouts: ["k60", "k65", "k75", "k80", "k96", "k100"] },
  knob: { name: "旋钮工作站", desc: "75% 配列专用，右上角 CNC 金属旋钮，旋转调节试轴音量",
    bezel: 0.4, priceAdd: 120, layouts: ["k75k"] }
};
/* 系列 × 配列 兼容矩阵：knob 系列仅旋钮专用 75% 变体 */
function familyLayouts(fid) { return CASE_FAMILIES[fid].layouts; }
function resolveLayoutId(layoutId, familyId) {
  var list = familyLayouts(familyId);
  if (list.indexOf(layoutId) >= 0) return layoutId;
  if (familyId === "knob") return "k75k";
  if (layoutId === "k75k") return "k75";
  return null; // 不兼容
}

/* ---------- 外壳颜色（材质与颜色分离） ---------- */
var CASE_COLORS = {
  obsidian: { name: "曜石黑", color: "#2e3136" },
  snow:     { name: "雪山白", color: "#e9e6e0" },
  navy:     { name: "深海蓝", color: "#2a4258" },
  graphite: { name: "石墨灰", color: "#5b6068" },
  wine:     { name: "勃艮第红", color: "#5e2f35" }
};

/* ---------- 键帽主题（主键/修饰/强调三层 + 字符色） ---------- */
var CAP_THEMES = {
  cream: { name: "奶霜", base: "#f0ead9", mod: "#cfc7b4", accent: "#e07856",
    legendBase: "#5a5346", legendMod: "#5a5346", legendAccent: "#fdf2ea" },
  night: { name: "暗夜", base: "#3a3d44", mod: "#24262b", accent: "#f0a541",
    legendBase: "#e8e9ec", legendMod: "#c9ccd2", legendAccent: "#241c0d" },
  sea:   { name: "海盐", base: "#f3f5f6", mod: "#a9c6d3", accent: "#2f9e8f",
    legendBase: "#41525c", legendMod: "#27414d", legendAccent: "#eefaf7" },
  retro: { name: "复古灰白", base: "#e5e0d2", mod: "#8d8a80", accent: "#b3543f",
    legendBase: "#4a463c", legendMod: "#f2eee2", legendAccent: "#f7ede2" },
  forest:{ name: "森林", base: "#e8ebe2", mod: "#48604f", accent: "#d9a441",
    legendBase: "#3d4a40", legendMod: "#eef2ea", legendAccent: "#2c2413" },
  sakura:{ name: "樱花", base: "#faf0f2", mod: "#e3b8c4", accent: "#c25e7e",
    legendBase: "#7a5560", legendMod: "#5e3642", legendAccent: "#fdf2f5" }
};

/* ---------- 结构参数（毫米设计值，渲染时换算 u） ---------- */
var MM = 1 / U_MM; // mm → u
var STRUCT = {
  footFront: 1.5 * MM,       // 前脚垫厚
  footBack: 8 * MM,          // 后脚垫厚（与壳深共同形成打字倾角）
  bottomPlate: 2.5 * MM,     // 底板厚
  wallTop: 16.8 * MM,        // 壳体侧壁上沿高度（不含脚垫）
  plateThk: 1.5 * MM,        // 定位板厚（与文案一致）
  plateGap: 3.2 * MM,        // PCB 与定位板间隙
  pcbThk: 1.6 * MM,          // PCB 厚
  stemTravel: 2.0 * MM,      // 视觉按压行程（演示值，保证最低点不穿板）
  bezelMin: 0.35             // 各系列最小边框（u），见 CASE_FAMILIES.bezel
};

/* ---------- 键帽轮廓（原创设计，非特定商品复刻） ----------
 * 每套按行（0=最后排）定义高度/顶面倾角/凹面深度；单位为 u。 */
var KEYCAP_PROFILES = {
  streamline: {
    name: "流线 · 低矮雕刻",
    desc: "原创低矮轮廓，逐行高度差与倾角变化",
    rows: [ // [高度, 顶面倾角rad(正值向后仰), 凹面深]
      [0.50, 0.10, 0.030],
      [0.44, 0.05, 0.034],
      [0.40, 0.00, 0.038],
      [0.41, -0.05, 0.034],
      [0.48, -0.10, 0.026]
    ],
    fnRow: [0.44, 0.05, 0.030],   // F 区行（75% 以上）
    bottomRow: [0.52, -0.12, 0.018], // 底行（空格行）
    homingBump: true
  },
  retrosphere: {
    name: "复古 · 高球面凹顶",
    desc: "原创高轮廓，统一高度、深球面凹顶",
    rows: [
      [0.62, 0.06, 0.060],
      [0.62, 0.03, 0.064],
      [0.60, 0.00, 0.068],
      [0.60, 0.03, 0.064],
      [0.62, 0.06, 0.058]
    ],
    fnRow: [0.62, 0.06, 0.056],
    bottomRow: [0.64, -0.06, 0.040],
    homingBump: false
  }
};

/* ---------- 内部识别标签 → 印刷显示字符 ---------- */
var DISPLAY_LABELS = {
  "NL": "Num", "N/": "/", "N*": "*", "N-": "-", "N+": "+", "⏎N": "⏎"
};

/* ---------- 轴体（概念类别，参数为设计值） ---------- */
var SWITCHES = {
  linear:  { name: "线性 · 红", force: "45gf", travel: "3.6mm", desc: "直上直下，安静顺滑",
    sound: { f0: 300, f1: 110, dur: 0.055, click: false } },
  tactile: { name: "段落 · 茶", force: "55gf", travel: "3.4mm", desc: "中段有确认感，兼顾输入与游戏",
    sound: { f0: 380, f1: 130, dur: 0.06, click: false } },
  clicky:  { name: "点击 · 青", force: "60gf", travel: "3.4mm", desc: "清脆段落声，反馈明确",
    sound: { f0: 460, f1: 150, dur: 0.07, click: true } }
};

/* ---------- 演示估价（一致规则，非真实售价） ---------- */
function estimatePrice(layout, familyId) {
  return 299 + layout.keys.length * 3 + CASE_FAMILIES[familyId].priceAdd;
}

/* ---------- 相机视角预设 ---------- */
var CAMERA_PRESETS = {
  hero:   { name: "默认", yaw: 0.55, pitch: 0.55 },
  top:    { name: "俯视", yaw: 0.0, pitch: 1.32 },
  side:   { name: "侧面", yaw: Math.PI / 2, pitch: 0.18 },
  back:   { name: "背面", yaw: Math.PI, pitch: 0.42 },
  detail: { name: "细节", yaw: 0.9, pitch: 0.38, zoom: 0.55 }
};

var DATA = {
  U_MM: U_MM,
  MM: MM,
  STRUCT: STRUCT,
  KEYCAP_PROFILES: KEYCAP_PROFILES,
  DISPLAY_LABELS: DISPLAY_LABELS,
  LAYOUTS: LAYOUTS,
  LAYOUT_75_KNOB: LAYOUT_75_KNOB,
  CASE_FAMILIES: CASE_FAMILIES,
  CASE_COLORS: CASE_COLORS,
  CAP_THEMES: CAP_THEMES,
  SWITCHES: SWITCHES,
  CAMERA_PRESETS: CAMERA_PRESETS,
  familyLayouts: familyLayouts,
  resolveLayoutId: resolveLayoutId,
  estimatePrice: estimatePrice,
  getLayout: function (id) {
    if (id === "k75k") return LAYOUT_75_KNOB;
    for (var i = 0; i < LAYOUTS.length; i++) if (LAYOUTS[i].id === id) return LAYOUTS[i];
    return null;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = DATA;
root.KBD_DATA = DATA;
})(typeof window !== "undefined" ? window : globalThis);
