import type { Localized } from "./types";

/** Research cards are deliberately separate from RobotEntry and the 3D manifest.
 * A card is not a downloadable engineering model or a hardware integration.
 */
export type IndustrySource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  checkedAt: string;
  publishedAt: string | null;
  locator: string;
};
export type IndustryFact = {
  id: string;
  text: Localized;
  evidence: "manufacturer-statement" | "review-boundary";
  sourceIds: string[];
};
export type IndustryResearchCard = {
  id: string;
  name: Localized;
  manufacturer: string;
  kind: "research-only";
  checkedAt: string;
  status: Localized;
  facts: IndustryFact[];
  unknowns: Localized[];
  assetPolicy: Localized;
  capabilities: {
    inspect3d: false;
    assembly: false;
    physics: false;
    hardwareSdk: false;
  };
  sources: IndustrySource[];
};
const l = (zh: string, en: string): Localized => ({ zh, en });
export const industryResearch: IndustryResearchCard[] = [
  {
    id: "atlas-electric-2026",
    name: l(
      "Atlas · 电动产品版 · 行业研究",
      "Atlas · Electric product · Industry research",
    ),
    manufacturer: "Boston Dynamics",
    kind: "research-only",
    checkedAt: "2026-11-13",
    status: l(
      "当前电动版官方资料；未提供本地3D或硬件SDK。",
      "Official sources for the current electric version; no local 3D model or hardware SDK.",
    ),
    facts: [
      {
        id: "version",
        text: l(
          "官方于2026年1月5日发布电动Atlas产品版；历史液压Atlas与此版本不同，不能替代其模型。",
          "The manufacturer announced the electric Atlas product on January 5, 2026. Historical hydraulic Atlas models are different and cannot stand in for this version.",
        ),
        evidence: "manufacturer-statement",
        sourceIds: ["atlas-launch"],
      },
      {
        id: "tasks",
        text: l(
          "官方将其定位于工业任务，列举零件排序、机器上下料与订单组装。这里引用厂商资料，不表示本站已验证实机表现。",
          "Official materials describe industrial tasks including part sequencing, machine tending and order assembly. These are manufacturer statements, not local hardware validation.",
        ),
        evidence: "manufacturer-statement",
        sourceIds: ["atlas-product"],
      },
    ],
    unknowns: [
      l(
        "未核实当前电动版可再分发的工程模型或Atlas硬件SDK。",
        "No redistributable engineering model or Atlas hardware SDK for this electric version has been verified.",
      ),
      l(
        "不将客户安排或部署计划当作已交付数量。",
        "Customer arrangements and deployment plans are not delivered-unit counts.",
      ),
    ],
    assetPolicy: l(
      "仅自写摘要与官方链接；无许可不明图片或替代3D。",
      "Original summaries and official links only; no unlicensed media or substitute 3D.",
    ),
    capabilities: {
      inspect3d: false,
      assembly: false,
      physics: false,
      hardwareSdk: false,
    },
    sources: [
      {
        id: "atlas-launch",
        title: "Boston Dynamics announces electric Atlas product",
        url: "https://bostondynamics.com/blog/boston-dynamics-unveils-new-atlas-robot-to-revolutionize-industry/",
        publisher: "Boston Dynamics",
        checkedAt: "2026-11-13",
        publishedAt: "2026-01-05",
        locator: "Electric product announcement",
      },
      {
        id: "atlas-product",
        title: "Atlas official product and industrial tasks",
        url: "https://bostondynamics.com/products/atlas/",
        publisher: "Boston Dynamics",
        checkedAt: "2026-11-13",
        publishedAt: null,
        locator: "Product and applications",
      },
    ],
  },

  {
    id: "tesla-optimus",
    name: l("Tesla Optimus · 行业研究", "Tesla Optimus · Industry research"),
    manufacturer: "Tesla",
    kind: "research-only",
    checkedAt: "2026-11-13",
    status: l(
      "官方资料研究；不提供虚构的3D或SDK",
      "Official-source research; no invented 3D model or SDK",
    ),
    facts: [
      {
        id: "purpose",
        text: l(
          "Tesla将Optimus定位为通用双足人形机器人，目标是承担危险、重复或枯燥任务。目标描述不是所有任务已验证。",
          "Tesla describes Optimus as a general-purpose bipedal humanoid intended for unsafe, repetitive or tedious tasks. This goal is not proof that all such tasks are validated.",
        ),
        evidence: "manufacturer-statement",
        sourceIds: ["tesla-robotics"],
      },
      {
        id: "engineering-scope",
        text: l(
          "官方机器人页面列出感知、规划、控制、机械和软件工程方向；可用来组织岗位学习地图，不表示本站获得其技术栈或代码。",
          "The official robotics page names perception, planning, controls, mechanical and software engineering. These inform a role-learning map, not access to Tesla's stack or code.",
        ),
        evidence: "manufacturer-statement",
        sourceIds: ["tesla-robotics"],
      },
      {
        id: "production-state",
        text: l(
          "Tesla 2026年Q3更新称Fremont的Optimus生产已启动，California列为Early Ramp，Texas列为Construction。这是公司陈述，不是本站独立工厂验证。",
          "Tesla's Q3 2026 update reports Optimus production started in Fremont, with California at Early Ramp and Texas at Construction. This is a company statement, not our independent factory verification.",
        ),
        evidence: "manufacturer-statement",
        sourceIds: ["tesla-q3-2026"],
      },
      {
        id: "no-volume-inference",
        text: l(
          "该更新未给出Optimus产能数值、销量或交付量；不能据此排销量第一，也不能把生产启动、计划产能与交付混为一谈。",
          "That update does not quantify Optimus capacity, sales or deliveries. It cannot establish a sales ranking; production start, planned capacity and deliveries are distinct.",
        ),
        evidence: "review-boundary",
        sourceIds: ["tesla-q3-2026"],
      },
    ],
    unknowns: [
      l(
        "未核实可再分发的官方Optimus URDF、MJCF、CAD、网格或完整BOM。",
        "No redistributable official Optimus URDF, MJCF, CAD, meshes or full BOM verified.",
      ),
      l(
        "未核实公开可用的Optimus硬件SDK、控制协议、校准程序或本站连接能力。",
        "No publicly usable Optimus hardware SDK, control protocol, calibration procedure or site connection verified.",
      ),
      l(
        "不填未经版本对应核验的自由度、载荷、速度、续航、售价或可购买日期。",
        "DOF, payload, speed, runtime, price and availability are not populated without version-matched evidence.",
      ),
      l(
        "公开演示不自动等于自主运行、安全认证、可制造或可维护。",
        "A public demonstration does not by itself establish autonomy, safety certification, manufacturability or serviceability.",
      ),
    ],
    assetPolicy: l(
      "只保留自写事实摘要和官方链接。Tesla法律页保留网站媒体权利且不授予知识产权许可；本卡不复制图片/视频/标识，不下载不明许可3D，不把其他机型改名为Optimus。",
      "Use original factual summaries and official links only. Tesla reserves website-media rights and grants no implied IP licence. This card copies no images/videos/logos, downloads no unclear-licence 3D and never renames another robot Optimus.",
    ),
    capabilities: {
      inspect3d: false,
      assembly: false,
      physics: false,
      hardwareSdk: false,
    },
    sources: [
      {
        id: "tesla-robotics",
        title: "Tesla SI & Robotics · Tesla Optimus",
        url: "https://www.tesla.com/SI",
        publisher: "Tesla",
        checkedAt: "2026-11-13",
        publishedAt: null,
        locator: "Tesla Optimus section; publication date not shown",
      },
      {
        id: "tesla-q3-2026",
        title: "Tesla Q3 2026 Update",
        url: "https://assets-ir.tesla.com/tesla-contents/IR/TSLA-Q3-2026-Update.pdf",
        publisher: "Tesla Investor Relations",
        checkedAt: "2026-11-13",
        publishedAt: "2026-10-21",
        locator:
          "PDF page 6, Manufacturing & Hardware / Robotics; page 9, Outlook",
      },
      {
        id: "tesla-ip",
        title: "Tesla Additional Resources · Intellectual Property",
        url: "https://www.tesla.com/legal/additional-resources",
        publisher: "Tesla",
        checkedAt: "2026-11-13",
        publishedAt: null,
        locator:
          "Intellectual Property: Copyrights, No Licenses; no page update date shown",
      },
    ],
  },
];
