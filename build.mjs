/* 构建：把 src/ 下的模板、样式、数据、应用与内联 three.min.js 合并为单文件 index.html。
 * 运行：node build.mjs   （项目根目录；无第三方依赖） */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

let html = read("src/template.html");
const inject = (marker, content, tag) => {
  const placeholder = `/*__${tag}__*/`;
  if (!html.includes(placeholder)) throw new Error(`模板缺少占位符 ${placeholder}`);
  // </script> 序列会破坏内联脚本，防御性检查
  if (content.includes("</script>")) throw new Error(`${tag} 内容包含 </script>，无法安全内联`);
  html = html.replace(placeholder, () => content);
};
inject("STYLE", read("src/style.css"), "STYLE");
inject("THREE", read("src/vendor/three.min.js"), "THREE");
inject("DATA", read("src/data.js"), "DATA");
inject("APP", read("src/app.js"), "APP");

writeFileSync(join(root, "index.html"), html);
console.log(`index.html 已生成（${(html.length / 1024).toFixed(0)} KB）`);
