import { robotMeshCache } from "./viewer/meshCache";
import {
  withObjMeshSupport,
  withCompressedMeshSupport,
} from "./viewer/urdfMeshLoader";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader, { type URDFRobot } from "urdf-loader";
import { ArrowLeft, RotateCcw, Pause, Play, Download } from "lucide-react";
import type { Lang } from "./types";
import type { GraspSnapshot } from "./core/contactGrasp";
import { createContactGraspClient } from "./contactGraspClient";
import { siteAsset } from "./siteAssets";
import "./styles/contactGrasp.css";

export default function ContactGraspExperience({
  lang,
  onExit,
}: {
  lang: Lang;
  onExit: () => void;
}) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const host = useRef<HTMLDivElement>(null),
    client = useRef<ReturnType<typeof createContactGraspClient> | null>(null);
  const latest = useRef<GraspSnapshot | null>(null),
    history = useRef<GraspSnapshot[]>([]),
    visible = useRef(true);
  const [snapshot, setSnapshot] = useState<GraspSnapshot | null>(null),
    [error, setError] = useState("");
  const [ready, setReady] = useState(false),
    [visualReady, setVisualReady] = useState(false),
    [paused, setPaused] = useState(true),
    [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const accept = (s: GraspSnapshot) => {
    latest.current = s;
    setSnapshot(s);
    history.current.push(s);
    if (history.current.length > 6000) history.current.shift();
  };
  useEffect(() => {
    let alive = true;
    setReady(false);
    setError("");
    setSnapshot(null);
    latest.current = null;
    history.current = [];
    const c = createContactGraspClient(
      (s) => {
        if (alive && visible.current) accept(s);
      },
      (message) => {
        if (alive) {
          setError(message);
          setPaused(true);
          setReady(false);
        }
      },
    );
    client.current = c;
    c.command("init")
      .then((s) => {
        if (!alive) return;
        accept(s);
        setReady(true);
        if (visible.current && !document.hidden) {
          setPaused(false);
          return c.command("resume");
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e.message || e));
          setReady(false);
        }
      });
    const pause = () => {
      visible.current = false;
      setPaused(true);
      void c.command("pause").catch(() => {});
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    window.addEventListener("blur", pause);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      alive = false;
      window.removeEventListener("blur", pause);
      window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", hidden);
      c.dispose();
      if (client.current === c) client.current = null;
    };
  }, [revision]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false,
      robot: URDFRobot | null = null;
    setVisualReady(false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0c171d");
    const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 10);
    camera.up.set(0, 0, 1);
    camera.position.set(0.32, -0.42, 0.28);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(-0.03, -0.025, 0.11);
    controls.minDistance = 0.16;
    controls.maxDistance = 1;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x263943, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(0.4, -0.3, 0.8);
    sun.castShadow = true;
    sun.shadow.camera.left = -0.3;
    sun.shadow.camera.right = 0.3;
    sun.shadow.camera.top = 0.3;
    sun.shadow.camera.bottom = -0.3;
    sun.shadow.camera.near = 0.01;
    sun.shadow.camera.far = 2;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    const add = (
      geometry: THREE.BufferGeometry,
      color: string,
      position: number[],
    ) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
      mesh.position.fromArray(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    add(
      new THREE.BoxGeometry(0.4, 0.35, 0.012),
      "#1c3039",
      [-0.04, -0.03, -0.012],
    );
    add(
      new THREE.BoxGeometry(0.024, 0.024, 0.03),
      "#7a8f9a",
      [-0.045, -0.035, 0.015],
    );
    for (const [a, b] of [
      [
        [-0.057, -0.047, 0.027],
        [-0.033, -0.047, 0.027],
      ],
      [
        [-0.057, -0.023, 0.027],
        [-0.033, -0.023, 0.027],
      ],
      [
        [-0.057, -0.047, 0.027],
        [-0.057, -0.023, 0.027],
      ],
      [
        [-0.033, -0.047, 0.027],
        [-0.033, -0.023, 0.027],
      ],
    ]) {
      const start = new THREE.Vector3(...a),
        end = new THREE.Vector3(...b),
        direction = end.clone().sub(start);
      const rail = add(
        new THREE.CapsuleGeometry(0.004, direction.length(), 4, 8),
        "#a5b5b9",
        start.clone().add(end).multiplyScalar(0.5).toArray(),
      );
      rail.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
    }
    // Visible carriage guide is a non-colliding fixture, not a fabricated robot arm.
    add(
      new THREE.BoxGeometry(0.012, 0.012, 0.3),
      "#46636e",
      [-0.12, 0.045, 0.14],
    );
    const carriage = add(
      new THREE.BoxGeometry(0.07, 0.012, 0.008),
      "#7f9da8",
      [-0.09, 0.045, 0.145],
    );
    const sphere = add(
      new THREE.SphereGeometry(0.04, 40, 24),
      "#e5a958",
      [-0.045, -0.035, 0.0701],
    );
    const markers = Array.from({ length: 12 }, () => {
      const m = add(
        new THREE.SphereGeometry(0.002, 8, 6),
        "#5fffc4",
        [0, 0, 0],
      );
      m.visible = false;
      return m;
    });
    let visualFailed = false;
    const failVisual = () => {
      visualFailed = true;
      if (disposed) return;
      setVisualReady(false);
      setError(
        t(
          "手部模型加载失败，请重置重试",
          "Hand assets failed to load. Reset to retry.",
        ),
      );
    };
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((raw) => {
      const url = new URL(raw, location.href);
      return url.origin === location.origin &&
        url.pathname.startsWith("/robots/")
        ? siteAsset(url.pathname)
        : raw;
    });
    manager.onError = failVisual;
    manager.onLoad = () => {
      if (disposed || visualFailed) return;
      let meshCount = 0;
      robot?.traverse((node) => {
        if (
          node instanceof THREE.Mesh &&
          node.geometry.getAttribute("position")?.count > 0
        )
          meshCount++;
      });
      if (robot && meshCount > 0) setVisualReady(true);
      else failVisual();
    };
    const loader = new URDFLoader(manager);
    loader.workingPath = window.location.origin;
    loader.parseCollision = false;
    loader.loadMeshCb = robotMeshCache.wrap(
      withCompressedMeshSupport(
        withObjMeshSupport(loader.loadMeshCb.bind(loader)),
      ),
    );
    const disposeObject = (object: THREE.Object3D) =>
      object.traverse((n) => {
        if (n instanceof THREE.Mesh) {
          n.geometry.dispose();
          for (const m of Array.isArray(n.material) ? n.material : [n.material])
            m.dispose();
        }
      });
    loader.load(
      siteAsset("/robots/leap_hand/robot.urdf"),
      (loaded) => {
        if (disposed) {
          disposeObject(loaded);
          return;
        }
        robot = loaded;
        Object.values(robot.joints).forEach((joint) => {
          joint.ignoreLimits = true;
        });
        robot.position.z = 0.145;
        robot.traverse((n) => {
          if (n instanceof THREE.Mesh) {
            n.castShadow = true;
            n.receiveShadow = true;
          }
        });
        scene.add(robot);
      },
      undefined,
      failVisual,
    );
    const resize = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    renderer.setAnimationLoop(() => {
      const s = latest.current;
      if (s) {
        carriage.position.z = 0.145 + s.lift;
        if (robot) {
          robot.position.z = 0.145 + s.lift;
          for (const [name, value] of Object.entries(s.joints))
            robot.setJointValue(name, value);
        }
        sphere.position.fromArray(s.position);
        sphere.quaternion.set(
          s.quaternion[1],
          s.quaternion[2],
          s.quaternion[3],
          s.quaternion[0],
        );
        markers.forEach((m, i) => {
          const c = s.contacts[i];
          m.visible = Boolean(c && c.normal > 0.001);
          if (c) m.position.fromArray(c.position);
        });
      }
      scene.updateMatrixWorld(true);
      if (s && robot) {
        element.dataset.physicsPose = JSON.stringify({
          time: s.time,
          ball: s.position,
          quaternion: s.quaternion,
          links: s.linkPositions,
        });
        element.dataset.renderedPose = JSON.stringify({
          time: s.time,
          ball: sphere.getWorldPosition(new THREE.Vector3()).toArray(),
          quaternion: sphere
            .getWorldQuaternion(new THREE.Quaternion())
            .toArray(),
          links: Object.fromEntries(
            Object.keys(s.linkPositions)
              .filter((name) => robot!.links[name])
              .map((name) => [
                name,
                robot!.links[name]
                  .getWorldPosition(new THREE.Vector3())
                  .toArray(),
              ]),
          ),
        });
      }
      renderer.render(scene, camera);
    });
    return () => {
      disposed = true;
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [revision]);
  const act = async (
    action: "grasp" | "lift" | "place" | "pause" | "resume",
  ) => {
    const c = client.current;
    if (!c) return;
    setPending(true);
    setError("");
    try {
      // Only explicit playback controls may change pause intent. An action
      // acknowledgement can arrive after blur and must never undo that pause.
      if (action === "pause" || action === "resume") {
        visible.current = action === "resume";
        setPaused(action === "pause");
      }
      const s = await c.command(action);
      if (client.current !== c) return;
      // A queued action/state may arrive after blur. Keep the paused visual
      // frozen until the user explicitly resumes.
      if (visible.current) accept(s);
    } catch (e) {
      if (client.current !== c) return;
      if (action === "resume") {
        visible.current = false;
        setPaused(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (client.current === c) setPending(false);
    }
  };
  const reset = () => {
    client.current?.dispose();
    client.current = null;
    visible.current = true;
    setPaused(true);
    setPending(false);
    setRevision((n) => n + 1);
  };
  const phase = snapshot?.phase;
  const phaseText = phase
    ? {
        ready: t("等待包络抓握", "Ready to grasp"),
        grasping: t("正在闭合 · 检测实际接触", "Closing · measuring contact"),
        grasped: t("已闭合，准备抬升", "Closed, ready to lift"),
        lifting: t("物理抬升中", "Physical lift"),
        holding: snapshot?.earnedHold
          ? t("稳持已验证，可以放回", "Stable hold verified. Replace the ball.")
          : t("检测离台与连续稳持", "Verifying unsupported stable hold"),
        placing: t("降低、开手、退离", "Lowering, releasing and retracting"),
        complete: t("拿起与放回完成", "Pick and replace complete"),
        failed: t("本次失败，请重置", "Trial failed. Reset to retry."),
      }[phase]
    : t("加载真实接触引擎…", "Loading contact physics…");
  const available = ready && visualReady && !pending;
  return (
    <section
      className="contact-grasp"
      data-testid="contact-grasp"
      data-phase={phase || "loading"}
      data-paused={paused}
    >
      <header>
        <button onClick={onExit}>
          <ArrowLeft size={16} />
          {t("返回", "Back")}
        </button>
        <div>
          <small>LEAP · MUJOCO CONTACT LAB</small>
          <h2>{t("拿起来，再稳稳放回", "Pick it up. Put it back.")}</h2>
        </div>
        <button
          onClick={reset}
          aria-label={t("重置抓取实验", "Reset grasp experiment")}
        >
          <RotateCcw size={18} />
        </button>
      </header>
      <div className="cg-scene" ref={host} data-testid="contact-grasp-scene" />
      <aside className="cg-panel">
        <span className="cg-status" role="status">
          {phaseText}
        </span>
        <p>
          {t(
            "四指包络教学球。绿点是引擎算出的接触，不是吸附。",
            "A four-digit envelope grasp. Green dots are computed contacts, not attachment.",
          )}
        </p>
        <div className="cg-steps">
          <button
            disabled={
              !available || phase !== "ready" || (snapshot?.time || 0) < 0.4
            }
            onClick={() => void act("grasp")}
          >
            {t("1 · 抓握", "1 · Grasp")}
          </button>
          <button
            disabled={!available || phase !== "grasped" || !snapshot?.hasGrasp}
            onClick={() => void act("lift")}
          >
            {t("2 · 抬起并稳持", "2 · Lift and hold")}
          </button>
          <button
            disabled={
              !available || phase !== "holding" || !snapshot?.earnedHold
            }
            onClick={() => void act("place")}
          >
            {t("3 · 放回原台", "3 · Replace")}
          </button>
        </div>
        <div className="cg-metrics">
          <div>
            <b>
              {((snapshot?.position[2] || 0.07) - 0.07 > 0
                ? ((snapshot?.position[2] || 0.07) - 0.07) * 1000
                : 0
              ).toFixed(1)}{" "}
              mm
            </b>
            <span>{t("离初始高度", "Above initial height")}</span>
          </div>
          <div>
            <b>{(snapshot?.holdSeconds || 0).toFixed(2)} s</b>
            <span>{t("连续停稳持物", "Consecutive stable hold")}</span>
          </div>
          <div>
            <b>{(snapshot?.placeSeconds || 0).toFixed(2)} s</b>
            <span>{t("松手后静置", "Settled after release")}</span>
          </div>
        </div>
        <button
          className="cg-pause"
          disabled={
            !ready ||
            !visualReady ||
            pending ||
            phase === "complete" ||
            phase === "failed"
          }
          onClick={() => void act(paused ? "resume" : "pause")}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
          {paused
            ? t("继续物理实验", "Resume physics")
            : t("暂停物理实验", "Pause physics")}
        </button>
        {error && <p role="alert">{error}</p>}
        {paused && ready && (
          <p>
            {t(
              "已暂停，不会自动恢复。",
              "Paused. It will not resume automatically.",
            )}
          </p>
        )}
        <details>
          <summary>
            {t("参数、证据与边界", "Parameters, evidence and limits")}
          </summary>
          <p>
            {t(
              "LEAP 官方四指源模型；80 mm / 25 g 教学球、模拟垂直滑台、浅托座。摩擦、阻尼和控制增益是实验参数，未校准真机。使用原网格凸包碰撞；相邻掌部碰撞排除有记录。",
              "Official four-digit LEAP source model; an 80 mm / 25 g teaching sphere, simulated vertical carriage and passive cradle. Friction, damping and controller gains are experimental, not hardware-calibrated. Source mesh convex collision with documented adjacent-palm exclusions.",
            )}
          </p>
          <p>
            {t(
              "成功需要实际接触离台，停稳持物至少 1 秒，再放回、完全无手接触静置。物体从未绑定到手部。",
              "Success requires contact-supported lift and at least one second of stationary holding, then supported settling with no hand contact. The object is never attached to the hand.",
            )}
          </p>
          <a
            href={siteAsset("/vendor/mujoco/leap-grasp/profile.json")}
            target="_blank"
            rel="noreferrer"
          >
            {t("模型来源与参数", "Source and parameters")} ↗
          </a>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        schemaVersion: 1,
                        task: "LEAP contact grasp",
                        samples: history.current,
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "leap-contact-grasp.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={14} />
            {t("导出本次物理采样", "Export this physical trial")}
          </button>
        </details>
      </aside>
    </section>
  );
}
