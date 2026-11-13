import { useEffect, useRef, useState } from "react";
import type { Lang, Localized } from "./types";
import { siteAsset, siteBaseUrl } from "./siteAssets";
import "./styles/buildKit.css";
import "./styles/makerProjects.css";

export type MakerProjectId = "open-duck-mini" | "openbot-diy";
type Part = {
  name: string;
  quantity: number | null;
  unit: string;
  note: Localized;
  source: string;
  downloads: { format: string; url: string }[];
};
type MakerProject = {
  id: MakerProjectId;
  title: Localized;
  source: string;
  commit: string;
  limitations: Localized[];
  parts: Part[];
  hardware: Part[];
  settings: Localized[];
  steps: { title: string; text: Localized; source: string }[];
  links: { label: string; url: string }[];
  files: {
    file: string;
    sha256: string;
    bytes: number;
    sourceUrl: string;
    license: string;
    licenseEvidence: string;
  }[];
};
const textHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const plain = (s: string) =>
  s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*|`/g, "");
export function makerCsv(data: MakerProject): string {
  const q = (s: unknown) => `"${String(s ?? "UNKNOWN").replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      [
        "category",
        "name",
        "quantity",
        "unit",
        "note",
        "source",
        "downloads",
      ].join(","),
      ...(["parts", "hardware"] as const).flatMap((key) =>
        data[key].map((r) =>
          [
            key,
            r.name,
            r.quantity,
            r.unit,
            r.note.en,
            r.source,
            r.downloads.map((d) => d.url).join("; "),
          ]
            .map(q)
            .join(","),
        ),
      ),
    ].join("\r\n")
  );
}
/** Does not infer a robot URDF for OpenBot; all project actions are local document operations. */
export default function MakerProjects({
  lang,
  projectId,
}: {
  lang: Lang;
  projectId?: MakerProjectId;
}) {
  const [selected, setSelected] = useState<MakerProjectId>("openbot-diy");
  const id = projectId ?? selected;
  const [data, setData] = useState<MakerProject | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"parts" | "hardware" | "steps">("parts");
  const [message, setMessage] = useState("");
  const workspace = useRef<HTMLDivElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showAssemblyAnimation, setShowAssemblyAnimation] = useState(false);
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    setTab("parts");
    setMessage("");
    setPreviewFailed(false);
    setShowAssemblyAnimation(false);
    fetch(siteAsset(`/robots/maker-projects/${id}/project.json`), {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = (await response.json()) as MakerProject;
        if (
          result.id !== id ||
          !Array.isArray(result.parts) ||
          !Array.isArray(result.files)
        )
          throw new Error("Invalid project manifest");
        if (!controller.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [id, attempt]);
  function download(kind: "csv" | "json") {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob(
        [kind === "csv" ? makerCsv(data) : JSON.stringify(data, null, 2)],
        {
          type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
        },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}-materials.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage(t("已生成下载文件。", "Download generated."));
  }
  function print() {
    if (!data) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setMessage(
        t(
          "打印窗口被拦截，请允许此页打开打印窗口。",
          "Print window blocked. Allow a print window for this page.",
        ),
      );
      return;
    }
    const e = textHtml;
    popup.opener = null;
    popup.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${e(data.title[lang])}</title><style>body{font:12px system-ui;padding:20px;color:#111}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:6px;text-align:left;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}p{overflow-wrap:anywhere}</style></head><body><h1>${e(data.title[lang])}</h1><p>${e(data.commit)}<br>${e(data.source)}</p>${data.limitations.map((s) => `<p>${e(s[lang])}</p>`).join("")}<table><thead><tr><th>Part / 零件</th><th>Quantity / 数量</th><th>Note / 说明</th><th>Source</th></tr></thead><tbody>${[...data.parts, ...data.hardware].map((r) => `<tr><td>${e(r.name)}</td><td>${r.quantity ?? "UNKNOWN / 未知"} ${e(r.unit)}</td><td>${e(r.note[lang])}</td><td>${e(r.source)}</td></tr>`).join("")}</tbody></table><h2>Print settings / 打印参数</h2>${data.settings.map((s) => `<p>${e(s[lang])}</p>`).join("")}<h2>Reading summaries / 步骤阅读摘要</h2>${data.steps.map((s) => `<p><b>${e(s.title)}</b> ${e(plain(s.text[lang]))}<br>${e(s.source)}</p>`).join("")}</body></html>`,
    );
    popup.document.close();
    popup.focus();
    popup.print();
  }
  return (
    <section
      className="build-kit maker-projects"
      aria-label={t("开放制作项目", "Open maker projects")}
    >
      <h2>{t("开放制作项目", "Open maker projects")}</h2>
      {!projectId && (
        <div
          className="build-kit-actions"
          role="group"
          aria-label={t("制作项目选择", "Maker project selection")}
        >
          <button
            aria-pressed={id === "openbot-diy"}
            onClick={() => setSelected("openbot-diy")}
          >
            OpenBot DIY
          </button>
          <button
            aria-pressed={id === "open-duck-mini"}
            onClick={() => setSelected("open-duck-mini")}
          >
            Open Duck Mini v2
          </button>
        </div>
      )}
      {error ? (
        <div role="alert">
          <p>
            {t(
              "制作资料未加载，可能尚未发布或资源缺失。",
              "Materials could not load; they may not yet be published or may be missing.",
            )}
          </p>
          <code>{error}</code>
          <button onClick={() => setAttempt((n) => n + 1)}>
            {t("重试", "Retry")}
          </button>
        </div>
      ) : !data ? (
        <p role="status">
          {t("正在加载有来源的制作资料…", "Loading sourced making materials…")}
        </p>
      ) : (
        <>
          <div className="maker-finished-hero">
            <figure
              className={`maker-finished-visual ${id === "openbot-diy" ? "maker-official-photo" : ""}`}
            >
              {!previewFailed ? (
                <img
                  src={siteAsset(
                    id === "open-duck-mini"
                      ? "/previews/open-duck-mini.png"
                      : showAssemblyAnimation
                        ? "/previews/openbot-diy-assembly.gif"
                        : "/previews/openbot-diy-assembly.png",
                  )}
                  alt={t(
                    id === "open-duck-mini"
                      ? "Open Duck Mini v2 官方源模型的本地3D渲染，白色双足机身与黄色脚部"
                      : "OpenBot官方Regular四轮车体与手机支架的CAD装配示意，非实物照片",
                    id === "open-duck-mini"
                      ? "Local 3D rendering of the official Open Duck Mini v2 source model, with a white biped body and yellow feet"
                      : "Official OpenBot Regular four-wheel body and phone-mount CAD assembly illustration, not a physical photograph",
                  )}
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <div className="maker-preview-unavailable">
                  <span>
                    {id === "openbot-diy"
                      ? "OPENBOT / DIY"
                      : "OPEN DUCK MINI / V2"}
                  </span>
                  <strong>
                    {t(
                      "先看官方成品，再决定如何制作",
                      "See the official finished build before you make it",
                    )}
                  </strong>
                  <p>
                    {t(
                      id === "open-duck-mini"
                        ? "模型预览暂时无法加载，可打开来源页查看。"
                        : "尚未附上已核实许可、与本次DIY配置一致的实物成品照片。不借用其他版本或AI图片冒充。",
                      id === "open-duck-mini"
                        ? "The model preview could not load; open its source page to inspect the project."
                        : "No rights-verified finished-build photograph matching this DIY configuration is included yet. Other variants and AI images are not substituted.",
                    )}
                  </p>
                  <a href={data.source} target="_blank" rel="noreferrer">
                    {t(
                      "查看官方成品与制作页",
                      "View the official robot and build guide",
                    )}{" "}
                    ↗
                  </a>
                </div>
              )}
              <figcaption>
                {id === "open-duck-mini"
                  ? t(
                      "外形预览 · 真实源模型渲染，不是实物照片",
                      "Appearance preview · real source-model rendering, not a physical photograph",
                    )
                  : t(
                      "官方 Regular 车体装配示意 · 非实物照片；不认证内部接线版本",
                      "Official Regular body assembly illustration · not a photo or wiring-variant validation",
                    )}
              </figcaption>
              {id === "openbot-diy" && (
                <div className="maker-preview-controls">
                  <button
                    aria-pressed={showAssemblyAnimation}
                    onClick={() => {
                      setPreviewFailed(false);
                      setShowAssemblyAnimation((value) => !value);
                    }}
                  >
                    {showAssemblyAnimation
                      ? t(
                          "停止动画，查看静态外形",
                          "Stop animation, show static form",
                        )
                      : t(
                          "播放官方装配示意",
                          "Play official assembly illustration",
                        )}
                  </button>
                  <a
                    href="https://github.com/ob-f/OpenBot/blob/db044a7d2e50d204cf6e6f9dc80492a484ad5441/body/diy/cad/regular_body/README.md"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("官方图源", "Official image source")} ↗
                  </a>
                  <a
                    href={siteAsset(
                      "/previews/openbot-diy-assembly.provenance.json",
                    )}
                  >
                    {t("MIT许可与出处", "MIT license & provenance")}
                  </a>
                </div>
              )}
            </figure>
            <div className="maker-finished-copy">
              <span className="maker-eyebrow">
                {t(
                  "从成品看起 · 自己动手制作",
                  "START WITH THE RESULT · MAKE IT YOURSELF",
                )}
              </span>
              <h3>{data.title[lang]}</h3>
              <p className="maker-project-intro">
                {id === "open-duck-mini"
                  ? t(
                      "一台带头部与双腿机构的小机器人。先转动查看它的外形与关节，再按有来源的清单准备打印件。",
                      "A compact robot with articulated head and legs. Explore its shape and joints first, then prepare the sourced print files.",
                    )
                  : t(
                      "把手机装上四轮底盘：上下车壳、手机支架、四个轮电机，以及 Arduino Nano 与 L298N。先认识整车，再逐项准备材料。",
                      "A smartphone on a four-wheel chassis: body halves, a phone mount, four wheel motors, Arduino Nano and L298N. Understand the complete build before gathering its parts.",
                    )}
              </p>
              <dl className="maker-project-facts">
                <div>
                  <dt>{t("打印件类型", "Printable part types")}</dt>
                  <dd>{data.parts.length}</dd>
                </div>
                <div>
                  <dt>{t("可下载文件", "Downloadable files")}</dt>
                  <dd>
                    {data.parts.reduce(
                      (n, part) => n + part.downloads.length,
                      0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t("步骤阅读", "Reading modules")}</dt>
                  <dd>
                    {data.steps.length}
                    <small>
                      {id === "open-duck-mini"
                        ? t("局部", "partial")
                        : t("原文摘要", "summaries")}
                    </small>
                  </dd>
                </div>
              </dl>
              <div className="build-kit-actions maker-hero-actions">
                {id === "open-duck-mini" ? (
                  <a
                    className="maker-primary"
                    href={
                      new URL(
                        `?robot=open-duck-mini&page=lab&lang=${lang}`,
                        siteBaseUrl(),
                      ).href
                    }
                  >
                    {t("打开可转动的 3D 模型", "Open the interactive 3D model")}{" "}
                    ↗
                  </a>
                ) : (
                  <a
                    className="maker-primary"
                    href={data.source}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("查看官方制作示例", "See the official build example")} ↗
                  </a>
                )}
                <button
                  onClick={() => {
                    setTab("parts");
                    workspace.current?.scrollIntoView({ block: "start" });
                  }}
                >
                  {t("开始准备材料", "Start gathering parts")} ↓
                </button>
              </div>
              <p className="maker-scope-line">{data.limitations[0]?.[lang]}</p>
              {id === "open-duck-mini" && (
                <p className="maker-scope-line">
                  {data.limitations[1]?.[lang]}
                </p>
              )}
            </div>
          </div>
          <nav
            className="maker-build-path"
            aria-label={t(
              "从成品到制作的路径",
              "From finished robot to making",
            )}
          >
            <a
              href={
                id === "open-duck-mini"
                  ? new URL(
                      `?robot=open-duck-mini&page=lab&lang=${lang}`,
                      siteBaseUrl(),
                    ).href
                  : data.source
              }
              {...(id === "openbot-diy"
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              <span>01</span>
              <div>
                <strong>{t("认识成品", "Meet the robot")}</strong>
                <small>
                  {t(
                    "外形、组成与真实来源",
                    "Appearance, components and sources",
                  )}
                </small>
              </div>
              ↗
            </a>
            <button
              onClick={() => {
                setTab("parts");
                workspace.current?.scrollIntoView({ block: "start" });
              }}
            >
              <span>02</span>
              <div>
                <strong>{t("准备材料与打印", "Parts and printing")}</strong>
                <small>
                  {t("文件、数量与采购清单", "Files, quantities and hardware")}
                </small>
              </div>
              ↓
            </button>
            <button
              onClick={() => {
                setTab("steps");
                workspace.current?.scrollIntoView({ block: "start" });
              }}
            >
              <span>03</span>
              <div>
                <strong>
                  {t("按来源阅读装配", "Follow the documented build")}
                </strong>
                <small>
                  {t(
                    "逐步摘要，缺失处明确标注",
                    "Step summaries with explicit gaps",
                  )}
                </small>
              </div>
              ↓
            </button>
          </nav>
          <details className="maker-scope-details">
            <summary>
              {t(
                "制作前必读：许可、安全与尚未核实的范围",
                "Before making: licenses, safety and unverified scope",
              )}
            </summary>
            <div className="notice">
              {data.limitations
                .slice(id === "open-duck-mini" ? 2 : 1)
                .map((s) => (
                  <p key={s.en}>{s[lang]}</p>
                ))}
            </div>
          </details>
          <div className="maker-workbench-heading" ref={workspace}>
            <span className="maker-eyebrow">
              {t("你的制作资料台", "YOUR MAKING WORKBENCH")}
            </span>
            <h3>
              {t(
                "把成品拆成可执行的准备步骤",
                "Turn the finished build into a preparation plan",
              )}
            </h3>
            <p>
              {t(
                "下载清单、核对零件，再阅读对应装配步骤。这里不连接或操作实体硬件。",
                "Export the list, check each part, then read its assembly steps. No physical hardware is connected or operated here.",
              )}
            </p>
          </div>
          <div className="build-kit-actions">
            <button onClick={() => download("csv")}>BOM CSV ↓</button>
            <button onClick={() => download("json")}>BOM JSON ↓</button>
            <button onClick={print}>
              {t("打印制作资料", "Print materials")}
            </button>
            <a
              href={siteAsset(`/robots/maker-projects/${id}/project.json`)}
              download
            >
              {t("来源与校验和", "Sources & checksums")} ↓
            </a>
          </div>
          <p role="status">{message}</p>
          <div
            className="build-kit-actions"
            role="group"
            aria-label={t("资料分类", "Material sections")}
          >
            {(["parts", "hardware", "steps"] as const).map((key, i) => (
              <button
                key={key}
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                {
                  [
                    t("打印文件", "Print files"),
                    t("采购资料", "Hardware"),
                    t("装配阅读", "Assembly reading"),
                  ][i]
                }
              </button>
            ))}
          </div>
          {tab === "steps" ? (
            <>
              <p className="notice">
                {t(
                  "以下是原文步骤阅读摘要，不是完整现场作业指导。图片、嵌套细节和缺失说明请打开每条官方来源核对；不会连接或控制硬件。",
                  "These are reading summaries, not complete shop-floor instructions. Check each official source for images, nested details and gaps. No hardware is connected or controlled.",
                )}
              </p>
              <ol className="build-kit-steps">
                {data.steps.map((s, i) => (
                  <li key={i}>
                    <h3>{s.title}</h3>
                    <p>{plain(s.text[lang])}</p>
                    <a href={s.source} target="_blank" rel="noreferrer">
                      {t("官方完整步骤", "Full official procedure")} ↗
                    </a>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="build-kit-rows">
              {data[tab].map((r) => (
                <article key={r.name}>
                  <div>
                    <h3>{r.name}</h3>
                    <span>
                      {r.quantity === null
                        ? t("数量：未知", "Quantity: unknown")
                        : `${r.quantity} × ${r.unit}`}
                    </span>
                  </div>
                  <p>{r.note[lang]}</p>
                  <div className="build-kit-actions">
                    <a href={r.source} target="_blank" rel="noreferrer">
                      {t("来源", "Source")} ↗
                    </a>
                    {r.downloads.map((d) => (
                      <a key={d.format} href={siteAsset(d.url)} download>
                        {d.format} ↓
                      </a>
                    ))}
                  </div>
                  {r.downloads.length > 0 && (
                    <details>
                      <summary>
                        {t(
                          "逐文件许可 / SHA-256",
                          "Per-file license / SHA-256",
                        )}
                      </summary>
                      {r.downloads.map((d) => {
                        const f = data.files.find((f) =>
                          d.url.endsWith("/" + f.file),
                        );
                        return (
                          <p key={d.format}>
                            {d.format} · {f?.license ?? t("未知", "Unknown")}
                            <br />
                            <code>{f?.sha256}</code>
                          </p>
                        );
                      })}
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
          <h3>{t("有来源的打印参数", "Sourced print settings")}</h3>
          {data.settings.map((s) => (
            <p key={s.en}>{s[lang]}</p>
          ))}
          <details className="maker-source-details">
            <summary>{t("来源与许可", "Sources & licenses")}</summary>
            <footer>
              <code>{data.commit}</code>
              <div className="build-kit-actions">
                <a
                  href={siteAsset(
                    `/robots/maker-projects/${id}/SOURCE-LICENSE`,
                  )}
                  download
                >
                  {t("许可原文", "Original license")} ↓
                </a>
                <a
                  href={siteAsset(
                    `/robots/maker-projects/${id}/ATTRIBUTION.txt`,
                  )}
                  download
                >
                  {t("归属与修改说明", "Attribution & changes")} ↓
                </a>
              </div>
              {data.links.map((link) => (
                <p key={link.url}>
                  <a href={link.url} target="_blank" rel="noreferrer">
                    {link.label} ↗
                  </a>
                </p>
              ))}
            </footer>
          </details>
        </>
      )}
    </section>
  );
}
