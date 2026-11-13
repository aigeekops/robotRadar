import { useState } from "react";
import type { Lang } from "./types";
import { siteAsset } from "./siteAssets";
import {
  buildKitCsv,
  buildKitJson,
  printableBuildKit,
  so101BuildKit,
} from "./core/buildKit";
import { physicalReadingModules } from "./physicalAssembly";
import "./styles/buildKit.css";
export default function BuildKitPanel({
  lang,
  robotId,
}: {
  lang: Lang;
  robotId: string;
}) {
  const [tab, setTab] = useState<"printed" | "hardware" | "steps">("printed");
  const [status, setStatus] = useState("");
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  if (robotId !== "so101")
    return (
      <section className="build-kit">
        <h2>{t("制造资料", "Build kit")}</h2>
        <p>
          {t(
            "当前仅核实 SO-101 follower 样板；此机型暂不提供制造文件。",
            "Only the SO-101 follower kit is audited. No manufacturing files are available for this model.",
          )}
        </p>
      </section>
    );
  function save(kind: "csv" | "json") {
    const url = URL.createObjectURL(
      new Blob([kind === "csv" ? buildKitCsv() : buildKitJson()], {
        type: kind === "csv" ? "text/csv;charset=utf-8" : "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `so101-follower-bom.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(t("已生成下载文件。", "Download file generated."));
  }
  function print() {
    const win = window.open("", "_blank");
    if (!win) {
      setStatus(
        t(
          "打印窗口被拦截，请允许此页面打开打印窗口。",
          "Print window blocked. Allow a print window for this page.",
        ),
      );
      return;
    }
    win.opener = null;
    win.document.write(printableBuildKit());
    win.document.close();
    win.focus();
    win.print();
  }
  return (
    <section
      className="build-kit"
      aria-label={t("SO-101 制造资料", "SO-101 build kit")}
    >
      <div className="panel-title">
        <h2>{t("从模型到工作台", "From model to workbench")}</h2>
        <span>SO-101 FOLLOWER</span>
      </div>
      <p>
        {t(
          "单 follower · Waveshare 板 · 7.4V STS3215 C001。不是 leader，也不是 SO-100。",
          "One follower · Waveshare board · 7.4V STS3215 C001. Not a leader or SO-100.",
        )}
      </p>
      <div className="notice">
        {t(
          "资料样板，非完整可制造认证：尚未实物打印、装配或验收。紧固件总数与部分 M2/M3 文字有歧义；温度、扭矩和公差未核实。供电前必须核对手中电机及官方说明。",
          "Documentation kit, not a certified manufacturing package: no physical print, assembly or acceptance test. Fastener totals and some M2/M3 wording remain unresolved; temperature, torque and tolerances unverified. Verify actual motors and official instructions before powering.",
        )}
      </div>
      <div className="build-kit-actions">
        <button onClick={() => save("csv")}>BOM CSV ↓</button>
        <button onClick={() => save("json")}>BOM JSON ↓</button>
        <button onClick={print}>{t("打印物料清单", "Print BOM")}</button>
        <a href={siteAsset("/robots/so101/build-kit/manifest.json")} download>
          {t("来源与 SHA-256", "Sources & SHA-256")} ↓
        </a>
      </div>
      <p role="status">{status}</p>
      <div
        className="build-kit-actions"
        role="group"
        aria-label={t("资料分类", "Kit sections")}
      >
        {(["printed", "hardware", "steps"] as const).map((key, i) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {
              [
                t("11 件打印件", "11 printed parts"),
                t("非打印件采购单", "Hardware checklist"),
                t("装配步骤", "Assembly steps"),
              ][i]
            }
          </button>
        ))}
      </div>
      {tab === "steps" ? (
        <ol className="build-kit-steps">
          {physicalReadingModules.map((step) => (
            <li key={step.id}>
              <h3>{step.title[lang]}</h3>
              <p>{step.body[lang]}</p>
              {step.ambiguity && (
                <p className="notice">{step.ambiguity[lang]}</p>
              )}
              <a href={step.sourceUrl} target="_blank" rel="noreferrer">
                {t("官方步骤原文", "Official procedure")} ↗
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <div className="build-kit-rows">
          {so101BuildKit.rows
            .filter((row) => row.category === tab)
            .map((row) => (
              <article key={row.id}>
                <div>
                  <h3>{row.name}</h3>
                  <span>
                    {row.quantity === null
                      ? t("数量：未知", "Quantity: unknown")
                      : `${row.quantity} × ${row.unit}`}
                  </span>
                </div>
                <p>{row.note}</p>
                <div className="build-kit-actions">
                  <a href={row.source} target="_blank" rel="noreferrer">
                    {t("数量及规格来源", "Quantity & specification source")} ↗
                  </a>
                  {row.download && (
                    <a href={siteAsset(row.download)} download>
                      {t("原始 STL", "Original STL")} ↓
                    </a>
                  )}
                </div>
                {row.download && (
                  <details>
                    <summary>Apache-2.0 · SHA-256</summary>
                    <code>
                      {
                        so101BuildKit.files.find((file) =>
                          row.download?.endsWith("/" + file.file),
                        )?.sha256
                      }
                    </code>
                  </details>
                )}
              </article>
            ))}
        </div>
      )}
      {tab === "printed" && (
        <>
          <h3>
            {t("打印前先校准与试配", "Calibrate and fit-test before printing")}
          </h3>
          <p>
            {t(
              "11 个单件各 1 份。不是渲染用电机网格，也不含整机参考 STL。未核实 3MF，因此不提供。",
              "One of each of 11 parts. No render-only servo meshes or whole-arm reference STL. No verified 3MF is offered.",
            )}
          </p>
          <dl>
            {so101BuildKit.printSettings.map((s) => (
              <div key={s.parameter}>
                <dt>{s.parameter}</dt>
                <dd>
                  {s.value}{" "}
                  <a href={s.source} target="_blank" rel="noreferrer">
                    ↗ {t("来源", "Source")}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <footer>
        <p>
          Source: TheRobotStudio/SO-ARM100 ·{" "}
          <code>{so101BuildKit.commit.slice(0, 12)}</code>
        </p>
        <a href={siteAsset("/robots/so101/build-kit/SOURCE-LICENSE")} download>
          Apache-2.0 ↓
        </a>
        {" · "}
        <a
          href={siteAsset("/robots/so101/build-kit/SOURCE-README.md")}
          download
        >
          README ↓
        </a>
        {" · "}
        <a
          href={siteAsset("/robots/so101/build-kit/SOURCE-3DPRINT.md")}
          download
        >
          3DPRINT ↓
        </a>
      </footer>
    </section>
  );
}
