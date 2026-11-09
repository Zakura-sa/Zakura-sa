import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(ROOT, "cards");
const CACHE = join(ROOT, ".cache");
mkdirSync(OUT, { recursive: true });
mkdirSync(CACHE, { recursive: true });

// ── 数据与图片资产 ──────────────────────────────────────────────────────

type Day = { date: string; contributionCount: number; contributionLevel: string; weekday: number };
type Repo = {
  name: string;
  isFork: boolean;
  languages: { edges: { size: number; node: { name: string } }[] };
};

const user = JSON.parse(readFileSync(join(ROOT, "data/stats.json"), "utf8")).data.user;
const chekiMain = readFileSync(join(ROOT, "assets/cheki-main.jpg")).toString("base64");
const codingCat = readFileSync(join(ROOT, "assets/coding-cat.jpg")).toString("base64");
const avatarImg = readFileSync(join(ROOT, "assets/avatar.jpg")).toString("base64");
const stickerCat = readFileSync(join(ROOT, "assets/sticker-cat.png")).toString("base64");
const stickerSnake = readFileSync(join(ROOT, "assets/sticker-snake.png")).toString("base64");
const stickerDuo = readFileSync(join(ROOT, "assets/sticker-duo.png")).toString("base64");

const TZ = "Asia/Shanghai";
const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
const dotted = (ymd: string) => ymd.replaceAll("-", ".");

const repos: Repo[] = user.repositories.nodes;
const own = repos.filter((r) => !r.isFork);
const cc = user.contributionsCollection;
const weeks: { contributionDays: Day[] }[] = cc.contributionCalendar.weeks;
const days = weeks.flatMap((w) => w.contributionDays);

let bestStreak = 0;
for (let run = 0, i = 0; i < days.length; i++) {
  run = days[i].contributionCount > 0 ? run + 1 : 0;
  bestStreak = Math.max(bestStreak, run);
}
const hottest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
const contributions: number = cc.contributionCalendar.totalContributions;

const langBytes = new Map<string, number>();
for (const r of own) for (const e of r.languages.edges) langBytes.set(e.node.name, (langBytes.get(e.node.name) ?? 0) + e.size);
const langTotal = [...langBytes.values()].reduce((a, b) => a + b, 0);
const langSorted = [...langBytes].sort((a, b) => b[1] - a[1]);
const langs = langSorted.slice(0, 3).map(([name, size]) => ({ name, pct: (size / langTotal) * 100 }));
const otherPct = 100 - langs.reduce((a, l) => a + l.pct, 0);
if (otherPct > 0.5) langs.push({ name: "其他", pct: otherPct });

// ── 配色：雾津樱草 (Mist-Harbor Primrose Green) 清新自然主题 ────────────

type Theme = {
  name: "dark" | "light";
  card: string;
  surface: string;
  panel: string;
  line: string;
  grid: string;
  strong: string;
  text: string;
  muted: string;
  faint: string;
  primrose: string;
  sprout: string;
  dew: string;
  blossom: string;
  sun: string;
  paper: string;
  ink: string;
  shadow: number;
  levels: [string, string, string, string, string];
};

const LIGHT: Theme = {
  name: "light",
  card: "#f6fbf7",
  surface: "#ebf5ee",
  panel: "#ffffff",
  line: "#cfe4d6",
  grid: "#dfeee4",
  strong: "#8fb89e",
  text: "#1e352a",
  muted: "#496a5a",
  faint: "#749684",
  primrose: "#3d996b",
  sprout: "#82c25b",
  dew: "#489da8",
  blossom: "#d97a96",
  sun: "#d99b38",
  paper: "#ffffff",
  ink: "#1e352a",
  shadow: 0.14,
  levels: ["#cbe0d2", "#a5dbb8", "#6bc492", "#3ea16e", "#e3963e"],
};

const DARK: Theme = {
  name: "dark",
  card: "#141f1b",
  surface: "#1b2a24",
  panel: "#21332c",
  line: "#2d463c",
  grid: "#1d2e27",
  strong: "#597d6d",
  text: "#e9f5ee",
  muted: "#a9c7b6",
  faint: "#739483",
  primrose: "#6dd6a0",
  sprout: "#b0e27d",
  dew: "#6fd0d6",
  blossom: "#f09cb5",
  sun: "#f2c46d",
  paper: "#f4f8f5",
  ink: "#1b2c24",
  shadow: 0.42,
  levels: ["#2b4238", "#3d6b56", "#529e78", "#6dd6a0", "#f2c46d"],
};

// ── 字体：Google Fonts 子集内嵌成 data URI ──────────────────────────────

const STACK = {
  display: ["Fredoka", "ZCOOL KuaiLe", "Noto Sans SC"],
  zh: ["ZCOOL KuaiLe", "Noto Sans SC"],
  body: ["Noto Sans SC"],
  mono: ["JetBrains Mono", "Noto Sans SC"],
  hand: ["Yomogi", "Noto Sans SC"],
} as const;
type Role = keyof typeof STACK;

const SPEC: Record<string, string> = {
  "ZCOOL KuaiLe": "ZCOOL+KuaiLe",
  "Noto Sans SC": "Noto+Sans+SC:wght@400;500;700",
  "JetBrains Mono": "JetBrains+Mono:wght@400;700",
  Yomogi: "Yomogi",
  Fredoka: "Fredoka:wght@600;700",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

async function cached(key: string, url: string): Promise<Buffer> {
  const file = join(CACHE, createHash("sha1").update(key).digest("hex"));
  if (existsSync(file)) return readFileSync(file);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, buf);
  return buf;
}

async function fontFaces(chars: Map<string, Set<string>>): Promise<string> {
  const out: string[] = [];
  for (const [family, set] of chars) {
    const text = [...set].filter((ch) => ch.trim()).sort().join("");
    if (!text) continue;
    const url = `https://fonts.googleapis.com/css2?family=${SPEC[family]}&text=${encodeURIComponent(text)}`;
    const css = (await cached(url, url)).toString("utf8");
    const weightsBySrc = new Map<string, number[]>();
    for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
      const src = /url\(([^)]+)\)/.exec(m[1])?.[1];
      if (!src) continue;
      const weight = Number(/font-weight:\s*(\d+)/.exec(m[1])?.[1] ?? 400);
      weightsBySrc.set(src, [...(weightsBySrc.get(src) ?? []), weight]);
    }
    for (const [src, weights] of weightsBySrc) {
      const data = (await cached(src, src)).toString("base64");
      const lo = Math.min(...weights);
      const hi = Math.max(...weights);
      out.push(`@font-face{font-family:'${family}';font-weight:${lo === hi ? lo : `${lo} ${hi}`};src:url(data:font/woff2;base64,${data}) format('woff2')}`);
    }
  }
  return out.join("");
}

// ── SVG 基础构件与植物图形 ──────────────────────────────────────────────

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Seg = [string, string?, string?];
type TextOpts = {
  role?: Role; size?: number; weight?: number; fill?: string;
  anchor?: "start" | "middle" | "end"; ls?: number; opacity?: number; attrs?: string;
};

class Card {
  chars = new Map<string, Set<string>>();
  css: string[] = [];
  defs: string[] = [];
  body: string[] = [];

  readonly t: Theme;
  readonly w: number;
  readonly h: number;

  constructor(t: Theme, w: number, h: number) {
    this.t = t;
    this.w = w;
    this.h = h;
  }

  add(...parts: string[]) {
    this.body.push(...parts);
  }

  text(x: number, y: number, content: string | Seg[], o: TextOpts = {}): string {
    const role = o.role ?? "body";
    const segs: Seg[] = typeof content === "string" ? [[content]] : content;
    for (const family of STACK[role]) {
      const set = this.chars.get(family) ?? new Set<string>();
      for (const [s] of segs) for (const ch of s) set.add(ch);
      this.chars.set(family, set);
    }
    const family = STACK[role].map((f) => `'${f}'`).join(",") + (role === "mono" ? ",monospace" : ",sans-serif");
    const attrs = [
      `x="${n(x)}"`, `y="${n(y)}"`, `font-family="${family}"`, `font-size="${o.size ?? 14}"`,
      o.weight ? `font-weight="${o.weight}"` : "",
      `fill="${o.fill ?? this.t.text}"`,
      o.anchor && o.anchor !== "start" ? `text-anchor="${o.anchor}"` : "",
      o.ls ? `letter-spacing="${o.ls}"` : "",
      o.opacity !== undefined ? `opacity="${o.opacity}"` : "",
      o.attrs ?? "",
    ].filter(Boolean);
    const inner = segs
      .map(([s, fill, extra]) => (fill || extra ? `<tspan${fill ? ` fill="${fill}"` : ""}${extra ? ` ${extra}` : ""}>${esc(s)}</tspan>` : esc(s)))
      .join("");
    return `<text ${attrs.join(" ")} xml:space="preserve">${inner}</text>`;
  }

  render(fonts: string, label: string): string {
    const motion = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><defs><style>${fonts}${this.css.join("")}${motion}</style>${this.defs.join("")}</defs>${this.body.join("")}</svg>\n`;
  }
}

function clover(s = 1): string {
  const leaf = "M0,0 C-4,-5 -7,-11 0,-13 C7,-11 4,-5 0,0 Z";
  return `<g transform="scale(${n(s)})">${[0, 90, 180, 270].map((a) => `<path d="${leaf}" transform="rotate(${a})"/>`).join("")}</g>`;
}

function primroseFlower(color: string, centerColor: string, s = 1): string {
  const petal = "M0,0 C-3.5,-4 -4.5,-9 0,-10.5 C4.5,-9 3.5,-4 0,0 Z";
  return `<g transform="scale(${n(s)})"><g fill="${color}">${[0, 72, 144, 216, 288].map((a) => `<path d="${petal}" transform="rotate(${a})"/>`).join("")}</g><circle r="2.4" fill="${centerColor}"/></g>`;
}

function stickerWrap(t: Theme, x: number, y: number, rot: number, scale: number, cut: string, body: string, edge = 3.2): string {
  const at = `rotate(${rot}) scale(${scale})`;
  const outline = `stroke-width="${n((edge * 2) / scale)}" stroke-linejoin="round" stroke-linecap="round"`;
  return [
    `<g transform="translate(${x} ${y})">`,
    `<g transform="translate(1.5 2.5)" opacity="${t.shadow}"><g transform="${at}" fill="#000" stroke="#000" ${outline}>${cut}</g></g>`,
    `<g transform="${at}" fill="#fff" stroke="#fff" ${outline}>${cut}</g>`,
    `<g transform="${at}">${body}</g>`,
    `</g>`,
  ].join("");
}

function notebookFrame(c: Card, gridId: string) {
  const t = c.t;
  c.defs.push(
    `<pattern id="${gridId}" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M 22 0 L 0 0 0 22" fill="none" stroke="${t.grid}" stroke-width="1"/></pattern>`,
    `<filter id="softSh" x="-8%" y="-8%" width="116%" height="122%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#0b1f16" flood-opacity="${t.shadow}"/></filter>`,
  );
  c.add(
    `<rect x="0.5" y="0.5" width="${c.w - 1}" height="${c.h - 1}" rx="22" fill="${t.card}" stroke="${t.line}"/>`,
    `<rect x="14" y="14" width="${c.w - 28}" height="${c.h - 28}" rx="16" fill="url(#${gridId})" opacity="0.85"/>`,
  );
}

function sectionHeader(c: Card, tag: string, sub: string, right: Seg[], y = 40) {
  const t = c.t;
  c.add(
    `<g transform="translate(38 ${y - 5}) rotate(-12)" fill="${t.primrose}">${clover(0.82)}</g>`,
    c.text(56, y, tag, { role: "mono", size: 12.5, weight: 700, fill: t.primrose, ls: 1.5 }),
    c.text(56 + tag.length * 8.8 + 14, y, sub, { size: 12, fill: t.muted }),
    c.text(c.w - 36, y, right, { role: "mono", size: 11.5, fill: t.faint, anchor: "end" }),
  );
}

// ── 1 · 雾津樱草 · 温室观测手账横幅 (HEADER) ────────────────────────────
// 严格边界：左区 x=38..462 (最大宽 424px)，右区画框 x=494..854

function header(t: Theme): Card {
  const c = new Card(t, 900, 368);
  notebookFrame(c, "hdrGrid");

  c.defs.push(
    `<radialGradient id="sunGlow" cx="0.22" cy="0.18" r="0.65"><stop offset="0" stop-color="${t.sprout}" stop-opacity="${t.name === "light" ? 0.25 : 0.16}"/><stop offset="1" stop-color="${t.primrose}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="dewGlow" cx="0.82" cy="0.8" r="0.55"><stop offset="0" stop-color="${t.dew}" stop-opacity="${t.name === "light" ? 0.18 : 0.14}"/><stop offset="1" stop-color="${t.dew}" stop-opacity="0"/></radialGradient>`,
    `<clipPath id="hdrPhoto"><rect x="14" y="14" width="332" height="208" rx="8"/></clipPath>`,
  );
  c.css.push(
    ".floatLeaf{transform-box:fill-box;transform-origin:center;animation:fl 5.2s ease-in-out infinite alternate}",
    "@keyframes fl{from{transform:translateY(-4px) rotate(-8deg)}to{transform:translateY(5px) rotate(10deg)}}",
    ".orbitRing{transform-box:fill-box;transform-origin:center;animation:orb 18s linear infinite}",
    "@keyframes orb{to{transform:rotate(360deg)}}",
  );

  c.add(
    `<rect x="1" y="1" width="898" height="366" rx="22" fill="url(#sunGlow)"/>`,
    `<rect x="1" y="1" width="898" height="366" rx="22" fill="url(#dewGlow)"/>`,
  );

  sectionHeader(c, "MIST-HARBOR GREENHOUSE", "雾津樱草 · 视觉与多智能体科研手账", [[`${dotted(today)}`, t.primrose], [" · FIELD LOG", t.faint]], 40);

  // 顶部胶囊签 (宽 276px)
  c.add(
    `<rect x="38" y="64" width="276" height="26" rx="13" fill="${t.surface}" stroke="${t.line}"/>`,
    `<circle cx="54" cy="77" r="4.5" fill="${t.primrose}"/>`,
    c.text(66, 81, "PRIMROSE & ORBITAL STUDIO", { role: "mono", size: 10.5, weight: 700, fill: t.primrose, ls: 0.8 }),
  );

  // 标题旁旋转的星轨四叶草徽章
  c.add(
    `<g transform="translate(358 130)">`,
    `<g class="orbitRing"><ellipse rx="26" ry="10" fill="none" stroke="${t.dew}" stroke-width="1.5" stroke-dasharray="4 3" transform="rotate(-24)"/><circle cx="22" cy="-9" r="3" fill="${t.sun}"/></g>`,
    `<g class="floatLeaf">${primroseFlower(t.primrose, t.sun, 1.3)}</g>`,
    `</g>`,
  );

  // 大标题 Zakura-sa (x=38..310)
  const titleStyle = { role: "display" as const, size: 50 };
  c.add(
    c.text(40, 144, "Zakura-sa", { ...titleStyle, fill: t.paper, attrs: `stroke="${t.paper}" stroke-width="10" stroke-linejoin="round"` }),
    c.text(38, 142, [["Zakura", t.primrose], ["-sa", t.dew]], { ...titleStyle }),
  );

  // 格言（22字 * 15px = 330px，终点 x=368，距右侧画框 x=494 留白 126px！）
  c.add(
    c.text(38, 182, [["「", t.primrose], ["像照料雾津的樱草，在星图里培育不遗忘的模型"], ["」", t.primrose]], {
      role: "zh",
      size: 15.5,
      fill: t.text,
    }),
    c.text(40, 206, "Continual Vision (TerraSAP) · Multi-Agent Research Workshop", {
      role: "mono",
      size: 10.5,
      fill: t.muted,
    }),
  );

  // 三个标本胶囊（每个宽 134px，内部可用文字宽 110px）
  const pills: [string, string, string][] = [
    ["🌱 遥感增量视觉", "TerraSAP · JSTARS", t.primrose],
    ["🛰️ 空间先验提示", "SAPM · Dual EMA", t.dew],
    ["🍀 多智能体工坊", "Agentic Studio", t.sprout],
  ];
  pills.forEach(([title, sub, col], i) => {
    const px = 38 + i * 142;
    const py = 226;
    c.add(
      `<rect x="${px}" y="${py}" width="134" height="46" rx="10" fill="${t.panel}" stroke="${t.line}" filter="url(#softSh)"/>`,
      `<rect x="${px}" y="${py}" width="5" height="46" rx="2.5" fill="${col}"/>`,
      c.text(px + 13, py + 20, title, { size: 12, weight: 700, fill: t.text }),
      c.text(px + 13, py + 36, sub, { role: "mono", size: 9.5, fill: t.faint }),
    );
  });

  // 左下角签名条（宽 418px，右缘 x=456 < 494）
  c.add(
    `<rect x="38" y="292" width="418" height="48" rx="12" fill="${t.surface}" stroke="${t.line}"/>`,
    `<image href="data:image/png;base64,${stickerCat}" x="46" y="274" width="74" height="68" transform="rotate(-8 83 308)"/>`,
    `<image href="data:image/png;base64,${stickerSnake}" x="114" y="274" width="74" height="68" transform="rotate(7 151 308)"/>`,
    c.text(198, 313, [["github.com/", t.faint], ["Zakura-sa", t.primrose]], { role: "mono", size: 12.5, weight: 700 }),
    c.text(198, 330, "Mist-Harbor Primrose · Continual Lab", { role: "mono", size: 9.8, fill: t.muted }),
  );

  // 右侧：宽幅草地手账插画画框 (x=494..854)
  const fx = 494, fy = 66, fw = 360, fh = 274;
  c.add(
    `<g transform="translate(${fx} ${fy}) rotate(1.6 ${fw / 2} ${fh / 2})">`,
    `<rect width="${fw}" height="${fh}" rx="12" fill="${t.paper}" stroke="${t.line}" filter="url(#softSh)"/>`,
    `<image href="data:image/jpeg;base64,${chekiMain}" x="14" y="14" width="332" height="208" preserveAspectRatio="xMidYMid slice" clip-path="url(#hdrPhoto)"/>`,
    `<rect x="14" y="14" width="332" height="208" rx="8" fill="none" stroke="${t.primrose}" stroke-opacity="0.25"/>`,
    `<rect x="${fw / 2 - 56}" y="-10" width="112" height="22" rx="3" fill="${t.primrose}" opacity="0.55" transform="rotate(-3 ${fw / 2} 2)"/>`,
    c.text(20, 250, "Mist-Harbor Note · 01", { role: "hand", size: 17.5, fill: "#2d7a56" }),
    c.text(fw - 18, 250, "Primrose Green", { role: "mono", size: 10.5, fill: "#5f8c75", anchor: "end" }),
    `</g>`,
    stickerWrap(t, 494, 72, -15, 1.0, `<circle r="13"/>`, primroseFlower(t.primrose, t.sun, 1.15)),
    stickerWrap(t, 850, 330, 14, 0.9, `<circle r="12"/>`, `<g fill="${t.sprout}">${clover(0.9)}</g>`),
  );

  return c;
}

// ── 2 · 樱草标本签直达按钮 (LINK-TERRASAP) ──────────────────────────────
// 严格边界：文字起点 x=102，右侧圆钮左缘 x=306，可用宽 194px

function linkTerraSAP(t: Theme): Card {
  const c = new Card(t, 380, 96);
  const ax = 58, cy = 48;
  c.defs.push(`<clipPath id="avClip"><circle cx="${ax}" cy="${cy}" r="30"/></clipPath>`);

  const cut = `<rect x="${ax}" y="20" width="296" height="56" rx="28"/><circle cx="${ax}" cy="${cy}" r="35"/>`;
  const body = [
    `<rect x="${ax}" y="20" width="296" height="56" rx="28" fill="${t.primrose}"/>`,
    `<circle cx="${ax}" cy="${cy}" r="35" fill="${t.primrose}"/>`,
    `<image href="data:image/jpeg;base64,${avatarImg}" x="${ax - 30}" y="${cy - 30}" width="60" height="60" clip-path="url(#avClip)"/>`,
    `<g transform="translate(${ax + 46} ${cy - 11})" fill="#ffffff">${clover(0.5)}</g>`,
    c.text(ax + 57, cy - 7, "IEEE JSTARS · PUBLIC REPO", { role: "mono", size: 9.5, weight: 700, fill: "#ffffff", opacity: 0.92, ls: 0.5 }),
    c.text(ax + 44, cy + 16, "TerraSAP · 遥感增量", { role: "display", size: 16.5, fill: "#ffffff" }),
    `<circle cx="${ax + 266}" cy="${cy}" r="16" fill="#ffffff"/>`,
    `<path d="M${ax + 261},${cy - 6} L${ax + 272},${cy} L${ax + 261},${cy + 6} Z" fill="${t.primrose}" stroke="${t.primrose}" stroke-width="2" stroke-linejoin="round"/>`,
  ].join("");

  c.add(`<g transform="rotate(-1.2 190 48)">${stickerWrap(t, 0, 0, 0, 1, cut, body, 3.8)}</g>`);
  return c;
}

// ── 3 · 双页观测手账：仅放 TerraSAP 与 脱敏后的当前工坊 (WORKS) ─────────

function works(t: Theme): Card {
  const c = new Card(t, 900, 404);
  notebookFrame(c, "wkGrid");
  sectionHeader(
    c,
    "FIELD NOTES // 01 & 02",
    "核心研究与当前智能体工坊（脱敏手账）",
    [["01 ", t.primrose], ["TerraSAP", t.muted], ["  ·  02 ", t.dew], ["AGENT WORKSHOP", t.muted]],
    40,
  );

  c.defs.push(`<clipPath id="catLaptopClip"><rect x="752" y="82" width="92" height="102" rx="7"/></clipPath>`);
  c.css.push(
    ".pulseLeaf{animation:plf 2.6s ease-in-out infinite}",
    "@keyframes plf{0%,100%{opacity:.45}50%{opacity:1}}",
  );

  // ── 左页：01 // TerraSAP（内部条卡可用文字宽 290px，严格控制在 21 字以内）──
  const lx = 32, ly = 66, lw = 410, lh = 310;
  c.add(
    `<path d="M${lx + 18},${ly} L${lx + 26},${ly - 15} H${lx + 210} L${lx + 218},${ly} Z" fill="${t.primrose}" opacity="0.9"/>`,
    c.text(lx + 118, ly - 4, "NOTE 01 · PUBLIC REPO", { role: "mono", size: 9.2, weight: 700, fill: "#ffffff", anchor: "middle", ls: 0.8 }),
    `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="16" fill="${t.panel}" stroke="${t.line}" filter="url(#softSh)"/>`,
    `<rect x="${lx}" y="${ly}" width="${lw}" height="6" rx="3" fill="${t.primrose}"/>`,
  );

  // 右上角遥感空间先验小插图 (x=350..418, y=82..134)
  c.add(
    `<g transform="translate(${lx + lw - 58} ${ly + 44})">`,
    `<rect x="-34" y="-24" width="68" height="48" rx="9" fill="${t.surface}" stroke="${t.line}"/>`,
    `<path d="M-22,-8 L0,-17 L22,-8 L0,1 Z" fill="${t.primrose}" opacity="0.28" stroke="${t.primrose}" stroke-width="1.2"/>`,
    `<path d="M-22,6 L0,-3 L22,6 L0,15 Z" fill="${t.dew}" opacity="0.25" stroke="${t.dew}" stroke-width="1.2"/>`,
    `<circle cx="0" cy="-8" r="2.8" fill="${t.sun}"/>`,
    `</g>`,
  );

  c.add(
    `<circle class="pulseLeaf" cx="${lx + 24}" cy="${ly + 30}" r="4.5" fill="${t.primrose}"/>`,
    c.text(lx + 36, ly + 34, "REMOTE SENSING FSCIL · JSTARS", { role: "mono", size: 10.5, weight: 700, fill: t.primrose, ls: 0.5 }),
    c.text(lx + 22, ly + 68, "TerraSAP", { role: "display", size: 30, fill: t.text }),
    c.text(lx + 22, ly + 92, "Spatial Prior-Aware Prompt Learning Framework", { role: "mono", size: 11, fill: t.dew }),
    c.text(lx + 22, ly + 118, "面向遥感图像少样本类增量学习的轻量空间先验框架：", { size: 12, fill: t.muted }),
  );

  // 3 张模块条卡：条卡宽 370px (x=52..422)，文字从 x=118 开始，最长不超 x=408 (290px)
  const sapItems: [string, string, string, string][] = [
    ["SAPM", "空间先验提示", "编码绝对与相对位置引导冻结 ViT", t.primrose],
    ["DPEMA", "双路动量记忆", "稳定与可塑记忆并行抑制灾难遗忘", t.dew],
    ["NCAC", "新类感知分类", "融合空间上下文动态校准增量边界", t.sprout],
  ];
  sapItems.forEach(([code, title, desc, col], idx) => {
    const my = ly + 134 + idx * 40;
    c.add(
      `<rect x="${lx + 20}" y="${my}" width="${lw - 40}" height="34" rx="8" fill="${t.surface}" stroke="${t.line}"/>`,
      `<rect x="${lx + 26}" y="${my + 6}" width="52" height="22" rx="5" fill="${col}" opacity="0.22" stroke="${col}"/>`,
      c.text(lx + 52, my + 20.5, code, { role: "mono", size: 10.5, weight: 700, fill: t.text, anchor: "middle" }),
      c.text(lx + 86, my + 21, [[`${title} · `, t.text, `font-weight="700"`], [desc, t.muted]], { size: 11.2 }),
    );
  });

  c.add(
    `<rect x="${lx + 20}" y="${ly + 262}" width="${lw - 40}" height="30" rx="8" fill="${t.surface}" stroke="${t.line}"/>`,
    c.text(lx + lw / 2, ly + 281, [
      ["NWPU ", t.faint], ["84.03%", t.primrose],
      [" · UCM ", t.faint], ["84.41%", t.dew],
      [" · MSTAR ", t.faint], ["74.90%", t.sprout],
      [" · Params ", t.faint], ["-93.2%", t.sun],
    ], { role: "mono", size: 10, weight: 700, anchor: "middle" }),
  );

  // ── 右页：02 // 当前多智能体科研工坊（右上角画框 x=746..848, y=76..190）──
  const rx = 458, ry = 66, rw = 410, rh = 310;
  c.add(
    `<path d="M${rx + 18},${ry} L${rx + 26},${ry - 15} H${rx + 236} L${rx + 244},${ry} Z" fill="${t.dew}" opacity="0.9"/>`,
    c.text(rx + 131, ry - 4, "NOTE 02 · SANITIZED WORKSHOP", { role: "mono", size: 9.2, weight: 700, fill: "#ffffff", anchor: "middle", ls: 0.6 }),
    `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" rx="16" fill="${t.panel}" stroke="${t.line}" filter="url(#softSh)"/>`,
    `<rect x="${rx}" y="${ry}" width="${rw}" height="6" rx="3" fill="${t.dew}"/>`,
  );

  // 左上方文字全部严格控制在 x=480..732 (最大宽 252px)，绝不触碰右侧画框 x=746！
  c.add(
    `<circle class="pulseLeaf" cx="${rx + 24}" cy="${ry + 30}" r="4.5" fill="${t.dew}"/>`,
    c.text(rx + 36, ry + 34, "MULTI-AGENT WORKSHOP", { role: "mono", size: 10.5, weight: 700, fill: t.dew, ls: 0.6 }),
    c.text(rx + 22, ry + 68, "Agentic Research", { role: "display", size: 26, fill: t.text }),
    c.text(rx + 22, ry + 92, "Autonomous Scientific Studio", { role: "mono", size: 10.8, fill: t.primrose }),
    c.text(rx + 22, ry + 118, "多角色闭环协同与证据链记忆工坊：", { size: 12, fill: t.muted }),
  );

  // 右上角四叶草薄荷猫敲代码手账画框 (x=746..848, y=76..190)
  c.add(
    `<g transform="rotate(3 798 133)">`,
    `<rect x="746" y="76" width="104" height="114" rx="9" fill="${t.paper}" stroke="${t.line}" filter="url(#softSh)"/>`,
    `<image href="data:image/jpeg;base64,${codingCat}" x="752" y="82" width="92" height="102" preserveAspectRatio="xMidYMid slice" clip-path="url(#catLaptopClip)"/>`,
    `<rect x="776" y="70" width="44" height="11" rx="2" fill="${t.primrose}" opacity="0.58"/>`,
    `</g>`,
  );

  // 4 行角色节点从 y = ry + 138 = 204 开始（完全位于画框底边 y=190 下方，整行 368px 可用！）
  const roles: [string, string, string][] = [
    ["HUB 工坊总管", "全局架构维护、环境权限与人机即时交互", t.primrose],
    ["OWNER 科研中枢", "实验协议设计、评价口径统筹与科学裁决", t.dew],
    ["TRACKS 专项实验", "多线自主假设验证、代码实现与闭环复跑", t.sprout],
    ["EXECUTOR 算力调度", "宿主机 GPU/CPU 窗口分配与证据账本归档", t.sun],
  ];
  roles.forEach(([role, desc, col], idx) => {
    const my = ry + 138 + idx * 29;
    c.add(
      `<g transform="translate(${rx + 28} ${my + 11})" fill="${col}">${clover(0.52)}</g>`,
      c.text(rx + 42, my + 15, role, { role: "mono", size: 11, weight: 700, fill: t.text }),
      c.text(rx + 148, my + 15, desc, { size: 11.2, fill: t.muted }),
    );
  });

  c.add(
    `<rect x="${rx + 20}" y="${ry + 262}" width="${rw - 40}" height="30" rx="8" fill="${t.surface}" stroke="${t.line}"/>`,
    c.text(rx + rw / 2, ry + 281, [
      ["Evidence Memory", t.primrose],
      [" · Silent Relay", t.dew],
      [" · Isolated Worktrees", t.sprout],
    ], { role: "mono", size: 10.2, weight: 700, anchor: "middle" }),
  );

  return c;
}

// ── 4 · 雾津温室工作台：语言生态环与技术标本卡 (TOOLKIT) ────────────────

function toolkit(t: Theme): Card {
  const c = new Card(t, 900, 288);
  notebookFrame(c, "tkGrid");
  sectionHeader(c, "GREENHOUSE BENCH", "温室标本台 · 语言生态与常用工具", [["PYTHON · TYPESCRIPT · PYTORCH", t.primrose]], 40);

  // ── 左侧：语言生态环 (宽 314px, x=32..346) ──
  const lx = 32, ly = 64, lw = 314, lh = 198;
  c.add(
    `<rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="16" fill="${t.panel}" stroke="${t.line}" filter="url(#softSh)"/>`,
    c.text(lx + 18, ly + 28, "LANGUAGE TERRARIUM · 语言生态", { role: "mono", size: 10.8, weight: 700, fill: t.primrose }),
  );

  const cx = lx + 68, cy = ly + 116, r = 40, circ = 2 * Math.PI * r;
  const ringColors = [t.primrose, t.dew, t.sprout, t.sun];
  let offset = 0;
  c.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.surface}" stroke-width="13"/>`);
  langs.forEach((l, i) => {
    const dash = (l.pct / 100) * circ;
    c.add(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ringColors[i]}" stroke-width="13" stroke-dasharray="${n(dash)} ${n(circ)}" stroke-dashoffset="${n(-offset)}" transform="rotate(-90 ${cx} ${cy})"/>`,
    );
    offset += dash;
  });
  c.add(`<g transform="translate(${cx} ${cy})" fill="${t.primrose}">${clover(0.88)}</g>`);

  // 语言图例：名称在 lx+128，百分比在 lx+232 (间距充裕绝不重叠)
  langs.forEach((l, i) => {
    const ry = ly + 74 + i * 25;
    c.add(
      `<circle cx="${lx + 126}" cy="${ry - 4}" r="4" fill="${ringColors[i]}"/>`,
      c.text(lx + 136, ry, l.name, { role: "mono", size: 11, weight: 700, fill: t.text }),
      c.text(lx + 234, ry, `${l.pct.toFixed(0)}%`, { role: "mono", size: 10.8, fill: t.muted, anchor: "end" }),
    );
  });
  c.add(
    `<image href="data:image/png;base64,${stickerDuo}" x="${lx + 234}" y="${ly + 96}" width="76" height="72" transform="rotate(6 ${lx + 272} ${ly + 132})"/>`,
  );

  // ── 右侧：四枚「雾津温室标本签」(每张宽 120px，内部文字严格 <= 96px) ──
  const cards: [string, string, string, string, string][] = [
    ["01", "PyTorch & ViT", "视觉主干与提示", "PEFT · Prompt", t.primrose],
    ["02", "Continual AI", "少样本增量学习", "FSCIL · Dual EMA", t.dew],
    ["03", "Agent System", "多智能体协同", "TS · Subagents", t.sprout],
    ["04", "Memory Audit", "可复现证据账本", "Ledger · Relay", t.sun],
  ];
  cards.forEach(([num, title, zhSub, tech, col], i) => {
    const sx = 362 + i * 130;
    const sy = 64;
    const sw = 120;
    const sh = 198;
    const midX = sx + sw / 2;
    c.add(
      `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="14" fill="${t.panel}" stroke="${t.line}" filter="url(#softSh)"/>`,
      `<rect x="${sx}" y="${sy}" width="${sw}" height="34" rx="14" fill="${col}" opacity="0.22"/>`,
      `<circle cx="${midX}" cy="${sy + 16}" r="5" fill="${t.card}" stroke="${col}" stroke-width="1.5"/>`,
      c.text(midX, sy + 54, `SPECIMEN ${num}`, { role: "mono", size: 9.2, weight: 700, fill: col, anchor: "middle", ls: 0.8 }),
      `<g transform="translate(${midX} ${sy + 86})" fill="${col}">${i % 2 === 0 ? clover(0.95) : primroseFlower(col, t.sun, 1.0)}</g>`,
      c.text(midX, sy + 124, title, { role: "display", size: 13, fill: t.text, anchor: "middle" }),
      c.text(midX, sy + 144, zhSub, { size: 11, fill: t.muted, anchor: "middle" }),
      `<line x1="${sx + 14}" y1="${sy + 160}" x2="${sx + sw - 14}" y2="${sy + 160}" stroke="${t.line}" stroke-dasharray="2 3"/>`,
      c.text(midX, sy + 178, tech, { role: "mono", size: 9, fill: t.faint, anchor: "middle" }),
    );
  });

  return c;
}

// ── 5 · 雾津樱草萌芽日历 + 书签收尾 (GARDEN) ────────────────────────────

const LEVEL: Record<string, number> = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

function garden(t: Theme): Card {
  const c = new Card(t, 900, 308);
  notebookFrame(c, "gdGrid");
  sectionHeader(
    c,
    "PRIMROSE GARDEN",
    "雾津樱草萌芽日历 · 近一年科研与工坊耕耘记录",
    [[`${contributions}`, t.primrose], [" 次耕耘记录", t.faint]],
    40,
  );

  c.css.push(
    ".breeze{transform-box:fill-box;transform-origin:50% 100%;animation:brz 2.4s ease-in-out infinite alternate}",
    "@keyframes brz{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}",
  );

  const x0 = 64;
  const x1 = 858;
  const px = (x1 - x0) / weeks.length;
  const y0 = 88;
  const py = 17;
  const cells: string[] = [];

  let lastMonth = -1;
  let lastLabelWeek = -10;
  weeks.forEach((w, wi) => {
    const first = w.contributionDays[0];
    const month = Number(first.date.slice(5, 7));
    if (month !== lastMonth) {
      if (wi - lastLabelWeek >= 3 && wi > 0) {
        c.add(c.text(x0 + wi * px, 76, `${month}月`, { size: 11, fill: t.faint }));
        lastLabelWeek = wi;
      }
      lastMonth = month;
    }
    for (const d of w.contributionDays) {
      const cx = x0 + wi * px + px / 2;
      const cy = y0 + d.weekday * py + py / 2;
      const lv = LEVEL[d.contributionLevel] ?? 0;
      if (lv === 0) {
        cells.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="1.8" fill="${t.levels[0]}" opacity="0.65"/>`);
      } else if (lv === 1) {
        cells.push(`<rect x="${n(cx - 3.2)}" y="${n(cy - 3.2)}" width="6.4" height="6.4" rx="2.2" fill="${t.levels[1]}"/>`);
      } else if (lv === 2) {
        cells.push(`<g transform="translate(${n(cx)} ${n(cy)})"><rect x="-4" y="-4" width="8" height="8" rx="3" fill="${t.levels[2]}"/><circle r="1.6" fill="#ffffff" opacity="0.55"/></g>`);
      } else if (lv === 3) {
        cells.push(`<g transform="translate(${n(cx)} ${n(cy)})"><g class="breeze" style="animation-delay:${n(-wi * 0.08)}s" fill="${t.levels[3]}">${clover(0.46)}</g></g>`);
      } else {
        cells.push(`<g transform="translate(${n(cx)} ${n(cy)})"><g class="breeze" style="animation-delay:${n(-wi * 0.08)}s">${primroseFlower(t.levels[3], t.levels[4], 0.56)}</g></g>`);
      }
    }
  });

  for (const [r, label] of [[1, "一"], [3, "三"], [5, "五"]] as const) {
    c.add(c.text(44, y0 + r * py + py / 2 + 4, label, { size: 11, fill: t.faint, anchor: "middle" }));
  }
  c.add(...cells);

  const [, hm, hd] = hottest.date.split("-").map(Number);
  c.add(
    c.text(
      x0,
      228,
      [
        ["最长连续耕耘 ", t.faint], [`${bestStreak}`, t.primrose], [" 天", t.muted], ["  ·  ", t.faint],
        ["最繁茂单日 ", t.faint], [`${hm}月${hd}日`, t.dew], [`（${hottest.contributionCount} 次提交）`, t.muted],
      ],
      { role: "mono", size: 11.2 },
    ),
  );

  c.add(
    c.text(596, 228, "种子", { size: 11, fill: t.faint }),
    `<circle cx="630" cy="224" r="2.2" fill="${t.levels[0]}"/>`,
    `<rect x="642" y="220" width="7" height="7" rx="2.2" fill="${t.levels[1]}"/>`,
    `<rect x="656" y="219.5" width="8" height="8" rx="3" fill="${t.levels[2]}"/>`,
    `<g transform="translate(674 224)" fill="${t.levels[3]}">${clover(0.46)}</g>`,
    `<g transform="translate(690 224)">${primroseFlower(t.levels[3], t.levels[4], 0.56)}</g>`,
    c.text(704, 228, "盛放雾津樱草", { size: 11, fill: t.primrose }),
  );

  c.add(
    `<rect x="32" y="246" width="836" height="44" rx="12" fill="${t.surface}" stroke="${t.line}"/>`,
    `<g transform="translate(56 268)" fill="${t.primrose}">${clover(0.78)}</g>`,
    c.text(76, 273, "「春风吹过雾津的草坡，每一行代码与实验都在安静发芽」", { role: "zh", size: 15.5, fill: t.text }),
    c.text(848, 272, `Updated · ${dotted(today)}`, { role: "mono", size: 11, fill: t.faint, anchor: "end" }),
  );

  return c;
}

// ── 输出全部卡片 ────────────────────────────────────────────────────────

const CARDS: [string, (t: Theme) => Card, string][] = [
  ["header", header, "Zakura-sa · 雾津樱草温室手账"],
  ["link-terrasap", linkTerraSAP, "TerraSAP：遥感少样本类增量学习公开仓库"],
  ["works", works, "观测手账：TerraSAP 与当前多智能体科研工坊（脱敏展示）"],
  ["toolkit", toolkit, "温室标本台：语言生态环与四枚核心技术标本签"],
  ["garden", garden, "雾津樱草萌芽日历：近一年的耕耘记录与书签寄语"],
];

for (const t of [LIGHT, DARK]) {
  for (const [name, build, label] of CARDS) {
    const card = build(t);
    const svg = card.render(await fontFaces(card.chars), label);
    writeFileSync(join(OUT, `${name}-${t.name}.svg`), svg);
    console.log(`${name}-${t.name}.svg  ${(svg.length / 1024).toFixed(0)} KB`);
  }
}
