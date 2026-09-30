/* 布局自动验证：键数、id 唯一、code 无意外重复、几何无重叠、支撑边界、倒 T 方向键。
 * 运行：node tools/validate-layouts.mjs   （项目根目录）
 * 退出码非 0 表示验证失败。 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const DATA = require("../src/data.js");

let failures = 0, checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error("  ✗ " + msg); }
}

/* 键帽支撑范围：键（含轴体）必须落在板面内，边距由外壳 bezel 覆盖 */
function checkLayout(L) {
  console.log(`\n[${L.id}] ${L.name} · ${L.percent} · ${L.keys.length} 键 · ${L.widthU}×${L.depthU}u`);
  const ids = new Set(), codes = new Map();
  for (const k of L.keys) {
    ok(!ids.has(k.id), `${L.id} 键 id 重复: ${k.id}`);
    ids.add(k.id);
    ok(k.w > 0 && k.h > 0, `${L.id} ${k.id} 宽高非法 w=${k.w} h=${k.h}`);
    ok(k.x >= 0 && k.y >= 0, `${L.id} ${k.id} 坐标为负 (${k.x},${k.y})`);
    ok(k.x + k.w <= L.widthU + 1e-9, `${L.id} ${k.id}("${k.label}") 右边界 ${k.x + k.w} 超出板宽 ${L.widthU}`);
    ok(k.y + k.h <= L.depthU + 1e-9, `${L.id} ${k.id}("${k.label}") 下边界 ${k.y + k.h} 超出板深 ${L.depthU}`);
    if (k.code) {
      if (codes.has(k.code)) ok(codes.get(k.code) === k.label, `${L.id} code ${k.code} 被 "${codes.get(k.code)}" 与 "${k.label}" 两个不同键占用`);
      codes.set(k.code, k.label);
    }
  }
  // 重叠检测（矩形相交）
  for (let i = 0; i < L.keys.length; i++)
    for (let j = i + 1; j < L.keys.length; j++) {
      const a = L.keys[i], b = L.keys[j];
      const overlap = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 &&
                      a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
      ok(!overlap, `${L.id} 键重叠: "${a.label}"(${a.x},${a.y},${a.w}x${a.h}) × "${b.label}"(${b.x},${b.y},${b.w}x${b.h})`);
    }
  // 倒 T 方向键：上/下同 x，左/下/右同 y
  const arrow = {};
  for (const k of L.keys) {
    if (k.zone !== "arrow") continue;
    arrow[k.code] = k;
  }
  if (arrow.ArrowUp) {
    ok(arrow.ArrowDown && Math.abs(arrow.ArrowUp.x - arrow.ArrowDown.x) < 1e-9, `${L.id} 倒T破坏：↑x=${arrow.ArrowUp.x} ↓x=${arrow.ArrowDown && arrow.ArrowDown.x}`);
    ok(arrow.ArrowLeft && arrow.ArrowRight &&
       Math.abs(arrow.ArrowLeft.y - arrow.ArrowDown.y) < 1e-9 &&
       Math.abs(arrow.ArrowRight.y - arrow.ArrowDown.y) < 1e-9,
       `${L.id} 倒T破坏：←↓→ 不在同一行`);
    ok(Math.abs(arrow.ArrowRight.x - arrow.ArrowDown.x - 1) < 1e-9 &&
       Math.abs(arrow.ArrowDown.x - arrow.ArrowLeft.x - 1) < 1e-9,
       `${L.id} 倒T破坏：←↓→ 间距不是 1u`);
  }
  // 旋钮占位不得压键
  if (L.knob) {
    for (const k of L.keys) {
      const hit = k.x < L.knob.x + 1 && L.knob.x < k.x + k.w && k.y < L.knob.y + 1 && L.knob.y < k.y + k.h;
      ok(!hit, `${L.id} 旋钮与键 "${k.label}" 冲突`);
    }
  }
}

console.log("== 六套配列 + 旋钮专用变体 ==");
for (const L of DATA.LAYOUTS) checkLayout(L);
checkLayout(DATA.LAYOUT_75_KNOB);

/* 独特功能区验证 */
function zonesOf(L) { return new Set(L.keys.map(k => k.zone)); }
const z60 = zonesOf(DATA.getLayout("k60"));
ok(!z60.has("f") && !z60.has("arrow") && !z60.has("num"), "60% 不应含 F 区/方向区/数字区");
ok(zonesOf(DATA.getLayout("k75")).has("f"), "75% 应含 F 区");
ok(zonesOf(DATA.getLayout("k80")).has("nav") && !zonesOf(DATA.getLayout("k80")).has("num"), "TKL 应有导航区且无数字区");
ok(zonesOf(DATA.getLayout("k96")).has("num"), "96% 应含数字区");
ok(zonesOf(DATA.getLayout("k100")).has("nav") && zonesOf(DATA.getLayout("k100")).has("num"), "100% 应同时含导航区与数字区");

/* 兼容矩阵 */
ok(DATA.resolveLayoutId("k65", "knob") === "k75k", "旋钮系列应把 65% 回退到 k75k");
ok(DATA.resolveLayoutId("k75k", "minimal") === "k75", "非旋钮系列应把 k75k 回退到 k75");
ok(DATA.resolveLayoutId("k60", "minimal") === "k60", "兼容组合应原样通过");

/* 回归：复现旧版 16u 底行 × 15u 外壳的越界，探测器必须能捕获 */
console.log("\n== 回归：旧版 64 键 16u/15u 越界必须被检出 ==");
const realFailures = failures;
const legacy = {
  id: "legacy64", name: "旧版64", percent: "65%", widthU: 15, depthU: 5,
  keys: (function () {
    const rows = [
      { y: 4, defs: [["Ctrl", 1.25], ["Win", 1.25], ["Alt", 1.25], ["", 6.25], ["Alt", 1], ["Fn", 1], ["Ctrl", 1], ["←", 1, "ArrowLeft"], ["↓", 1, "ArrowDown"], ["→", 1, "ArrowRight"]] }
    ];
    const ks = [];
    for (const r of rows) {
      let x = 0;
      for (const d of r.defs) { ks.push({ id: "lg" + ks.length, label: d[0], x, y: r.y, w: d[1], h: 1, code: d[2] || null, zone: "main", role: "base" }); x += d[1]; }
    }
    return ks;
  })()
};
const before = failures;
checkLayout(legacy);
const legacyViolations = failures - before;
ok(legacyViolations > 0, "回归失败：旧 16u/15u 越界未被检测到");
const regressionCaught = legacyViolations > 0;
console.log("  （预期捕获 " + legacyViolations + " 处越界，作为回归证据）");

console.log(`\n共 ${checks} 项检查；正式失败 ${realFailures} 项；回归越界检出：${regressionCaught ? "是" : "否"}。`);
process.exit(realFailures === 0 && regressionCaught ? 0 : 1);
