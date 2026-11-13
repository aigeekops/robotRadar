# Robot Radar · 具身智能与可拆解机器人学习站

浏览器中的机器人结构探索、关节实验、装配教学与分机型交互工作台。使用 React、TypeScript、Three.js、URDF 和浏览器 WebAssembly MuJoCo，可部署为静态网站，无需后台服务。

## 本地运行

要求 Node.js 22+。在包含 package.json 的项目目录运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。生产构建与预览：

```sh
npm run build
npm run preview
```

构建输出为 `dist/`，须通过 HTTP 服务访问，不使用 `file://`。
GitHub Pages 自动构建部署见下文。

## 功能

- 14 套固定来源的机器人模型及关节层级、部件选择、显隐和多视角观察。
- 拆解观察、运动链重建与装配教学；结构分离不代表厂商认证维修流程。
- 49 个运动学动作预设；实验包模板、导入检查、关键帧执行与导出。
- LEAP Hand 教学球接触抓取、抬起、稳持和放回；使用物理接触而非物体绑定。
- Panda、FR3、UR5e、SO-101 的正运动学末端定位挑战。
- 腿式路线及轮式精确停靠；这些移动关卡是运动学交互，不求解真实平衡或轮地接触。
- 中英文界面、学习内容、制作资料、BOM 查看与打印。
- 原创程序生成背景音乐；受浏览器自动播放策略限制，需要用户手势激活。

实验包使用方法见下文。学习平台：https://aigeekops.github.io/learn-by-building/

## 能力边界

Pollen Microduck、Tesla Optimus、当前电动 Atlas 尚无可分发的真实本地模型。Open Duck Mini 不替代 Microduck，历史液压 Atlas 不替代现款电动版本。

仿真是教学工具，不是经过真机标定的控制方案；不连接真实硬件，不承诺维修、制造或机器人操作安全。LEAP 抓取只覆盖当前教学实验，机械臂定位不是接触抓取。商业机器人内部电路、线束和维修工艺不在已验证范围内。

## 开发与验证

```sh
npm run typecheck
npm run validate:assets
node scripts/test-portable-core.mjs
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` 包含部分对照上游原始资产的测试，需额外准备 `assets-source/` 中的固定来源快照；这些本地快照不包含在公开源码包中。普通静态构建与运行使用 `public/` 内的分发资产，不需要这些快照。

- `src/`：界面、渲染、运动学、动力学和教学逻辑。
- `public/`：运行资源、模型、制造资料、来源及第三方许可。
- `tests/`：可维护测试源码，不含历史运行报告。
- `scripts/`：资源导入、校验与发布辅助工具。
- `services/mujoco/`：可选 Python 对照服务，静态站点不依赖它。

## 来源与许可证

第三方模型、WASM、文档和制造资料分别遵守其原始许可证。必须保留 `public/THIRD_PARTY_NOTICES.txt`、各资产的 LICENSE、NOTICE、provenance、修改说明及对应源码。SCHUNK SVH 资产适用 GPL-3.0-or-later；不能用站点代码的许可覆盖第三方资产。

自有代码的许可证应由项目维护者选择并在正式发布前补充；在没有明确许可证前，不应默认这些代码已获得 MIT 或其他开源许可。

## GitHub Pages 自动部署

以 `v2` 的内容作为仓库根目录，保留 `.github/workflows/deploy-pages.yml`、`public/` 和 `package-lock.json`。

1. 仓库默认分支使用 `main`。
2. 在 GitHub 仓库 Settings → Pages → Build and deployment → Source 中选择 **GitHub Actions**，并确保仓库或组织未禁用 Actions。
3. 推送到 `main` 后自动执行核心测试、资源检查、类型检查、静态构建和部署；也可在 Actions 页面手动运行工作流。
4. 等待 build 与 deploy 成功后，从 Pages 或部署记录打开网站。构建失败不会发布新版本。

工作流自动适配项目站点的 `/仓库名/` 基路径，不必改源码，也不需要提交 `dist/` 或 `node_modules/`。自定义域名需先在 Pages 设置。代码配置不代表已经成功部署，最终以远端工作流结果为准。

本地可验证子路径构建：

```sh
VITE_BASE_PATH=/robot-radar/ npm run build
python3 scripts/check-pages-build.py /robot-radar/
```

## 实验包导入与模板

在关节实验中下载当前机型模板，修改关键帧，再导入检查并手动运行。导入不会自动执行。

实验包是 UTF-8 JSON，包含 `schemaVersion: 1`、`robotId`、`sourceCommit` 和 `program`。其中 `program` 是 JSON 字符串，内部 `frames` 数组包含 `time` 和 `joints`。2–100 帧、从 0 秒严格递增、最长 60 秒；旋转单位为弧度，移动单位为米。仅接受当前固定版本机型的已知独立关节及有效限位，不能直接替换机型名称复用模板。

页面内也提供格式说明。模板和导入属于教学运动学实验，不保证真实机器人可执行性；不要将其直接用于实机。
