import ChallengeLoading from "./ChallengeLoading";
import { robotMeshCache } from "./viewer/meshCache";
import {
  withObjMeshSupport,
  withCompressedMeshSupport,
} from "./viewer/urdfMeshLoader";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader, { type URDFRobot } from "urdf-loader";
import type { RobotEntry, Lang, JointInfo } from "./types";
import { siteAsset } from "./siteAssets";
import { armEndpoints, reachPose, dwellProgress } from "./core/armReach";
import "./styles/armReach.css";
export default function ArmReachExperience({
  robot,
  lang,
  onExit,
}: {
  robot: RobotEntry;
  lang: Lang;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    model = useRef<URDFRobot | null>(null),
    targets = useRef<THREE.Vector3[]>([]),
    stageRef = useRef(0),
    dwell = useRef(0);
  const [joints, setJoints] = useState<JointInfo[]>([]),
    [values, setValues] = useState<Record<string, number>>({}),
    [stage, setStage] = useState(0),
    [progress, setProgress] = useState(0),
    [error, setError] = useState<number | null>(null),
    [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [loadProgress, setLoadProgress] = useState({ completed: 0, total: 0 });
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const operated = useRef(false);
  const zh = lang === "zh";
  useEffect(() => {
    const element = host.current!;
    let disposed = false,
      frame = 0,
      last = performance.now(),
      lastUi = 0;
    operated.current = false;
    pausedRef.current = false;
    setPaused(false);
    const suspend = () => {
      pausedRef.current = true;
      setPaused(true);
      dwell.current = 0;
      setProgress(0);
    };
    window.addEventListener("blur", suspend);
    document.addEventListener("visibilitychange", suspend);
    stageRef.current = 0;
    dwell.current = 0;
    setStage(0);
    setProgress(0);
    setError(null);
    setStatus("loading");
    setLoadProgress({ completed: 0, total: 0 });
    setJoints([]);
    setValues({});
    targets.current = [];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111d24);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    camera.up.set(0, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x566778, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(2, -3, 4);
    scene.add(light);
    const target = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffa044, wireframe: true }),
    );
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0x53f2d0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    tip.renderOrder = 10;
    scene.add(target, tip);
    target.visible = tip.visible = false;
    const disposeObject = (root: THREE.Object3D) =>
      root.traverse((n) => {
        const m = n as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach(
            (mat) => {
              Object.values(mat).forEach((v) => {
                if (v instanceof THREE.Texture) v.dispose();
              });
              mat.dispose();
            },
          );
        }
      });
    let meshTotal = 0,
      meshCompleted = 0;
    let pending = 0,
      failed = false,
      ready = false,
      managerFinished = false;
    delete element.dataset.meshCount;
    const fit = () => {
      if (!model.current) return;
      const box = new THREE.Box3().setFromObject(model.current);
      targets.current.forEach((point) => box.expandByPoint(point));
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const halfFov = Math.min(
        THREE.MathUtils.degToRad(camera.fov / 2),
        Math.atan(
          Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect,
        ),
      );
      controls.target.copy(sphere.center);
      camera.position
        .copy(sphere.center)
        .addScaledVector(
          new THREE.Vector3(1.4, -1.8, 1.2).normalize(),
          ((sphere.radius + 0.025) / Math.sin(halfFov)) * 1.15,
        );
      controls.update();
    };
    const finish = () => {
      if (
        disposed ||
        pending ||
        !managerFinished ||
        !model.current ||
        !targets.current.length
      )
        return;
      let meshes = 0;
      model.current.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) meshes++;
      });
      element.dataset.meshCount = String(meshes);
      if (failed || !meshes) {
        setStatus("error");
        return;
      }
      ready = true;
      fit();
      target.visible = tip.visible = true;
      setStatus("ready");
    };
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(siteAsset);
    manager.onLoad = () => {
      managerFinished = true;
      queueMicrotask(finish);
    };
    manager.onError = () => {
      failed = true;
      if (!disposed) setStatus("error");
    };
    const loader = new URDFLoader(manager);
    // Source mesh URLs are root-relative, not relative to the URDF folder.
    loader.workingPath = window.location.origin;
    loader.parseCollision = false;
    const loadMesh = robotMeshCache.wrap(
      withCompressedMeshSupport(
        withObjMeshSupport(loader.loadMeshCb.bind(loader)),
      ),
    );
    loader.loadMeshCb = (path, loadingManager, done) => {
      pending++;
      meshTotal++;
      setLoadProgress({ completed: meshCompleted, total: meshTotal });
      loadMesh(path, loadingManager, (object, error) => {
        done(object, error);
        pending--;
        if (disposed) {
          if (object) disposeObject(object);
          return;
        }
        if (error) failed = true;
        meshCompleted++;
        setLoadProgress({ completed: meshCompleted, total: meshTotal });
        queueMicrotask(finish);
      });
    };
    loader.load(
      siteAsset(robot.urdfUrl),
      (loaded) => {
        if (disposed) {
          disposeObject(loaded);
          return;
        }
        model.current = loaded;
        scene.add(loaded);
        const endpoint = loaded.links[armEndpoints[robot.id]];
        if (!endpoint) {
          setStatus("unsupported");
          return;
        }
        const chain = new Set<string>();
        let node: THREE.Object3D | null = endpoint;
        while (node) {
          chain.add(node.name);
          node = node.parent;
        }
        const entries = Object.entries(loaded.joints)
          .filter(
            ([name, j]) =>
              chain.has(name) &&
              j.jointType !== "fixed" &&
              Number.isFinite(j.limit.lower) &&
              Number.isFinite(j.limit.upper) &&
              j.limit.upper > j.limit.lower,
          )
          .sort(
            ([a], [b]) =>
              [...chain].reverse().indexOf(a) - [...chain].reverse().indexOf(b),
          )
          .map(([name, j]) => ({
            name,
            type: j.jointType,
            lower: j.limit.lower,
            upper: j.limit.upper,
            value: 0,
          }));
        if (!entries.length) {
          setStatus("unsupported");
          return;
        }
        targets.current = [0, 1, 2].map((i) => {
          loaded.setJointValues(reachPose(entries, i));
          loaded.updateMatrixWorld(true);
          return endpoint.getWorldPosition(new THREE.Vector3());
        });
        const initial = Object.fromEntries(
          entries.map((j) => [j.name, Math.max(j.lower, Math.min(j.upper, 0))]),
        );
        loaded.setJointValues(initial);
        loaded.updateMatrixWorld(true);
        setValues(initial);
        setJoints(entries);
        target.position.copy(targets.current[0]);
        queueMicrotask(finish);
      },
      undefined,
      () => {
        if (!disposed) setStatus("error");
      },
    );
    const resize = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (ready) fit();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    const animate = (now: number) => {
      if (disposed) return;
      const dt = (now - last) / 1000;
      last = now;
      const loaded = model.current,
        endpoint = loaded?.links[armEndpoints[robot.id]];
      if (ready && endpoint && targets.current.length) {
        loaded!.updateMatrixWorld(true);
        endpoint.getWorldPosition(tip.position);
        target.position.copy(targets.current[stageRef.current]);
        const distance = tip.position.distanceTo(target.position);
        dwell.current =
          pausedRef.current ||
          !operated.current ||
          document.hidden ||
          !document.hasFocus()
            ? 0
            : dwellProgress(distance, dwell.current, dt);
        if (now - lastUi > 80) {
          setError(distance);
          setProgress(dwell.current);
          lastUi = now;
        }
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      window.removeEventListener("blur", suspend);
      document.removeEventListener("visibilitychange", suspend);
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      model.current = null;
    };
  }, [robot.id, robot.urdfUrl, retry]);
  return (
    <section
      className="arm-reach"
      data-robot-id={robot.id}
      data-load-state={status}
    >
      <header>
        <button onClick={onExit}>{zh ? "返回" : "Back"}</button>
        <h2>{zh ? "机械臂 · 末端定位" : "Arm · endpoint positioning"}</h2>
      </header>
      <div className="arm-reach-layout">
        <div className="challenge-model-shell" aria-busy={status === "loading"}>
          <div className="arm-reach-canvas" ref={host} />
          {(status === "loading" || status === "error") && (
            <ChallengeLoading
              robot={robot}
              lang={lang}
              failed={status === "error"}
              completed={loadProgress.completed}
              total={loadProgress.total}
              retryLabel={zh ? "重新加载模型" : "Retry model loading"}
              onRetry={() => setRetry((n) => n + 1)}
              onBack={onExit}
            />
          )}
        </div>
        <aside>
          <h3>
            {zh ? "定位挑战" : "Position challenge"} {stage + 1}/3
          </h3>
          <p>
            {zh
              ? "橙色球是目标容差，青色点是源末端坐标。调节关节，保持在 2 cm 内 1 秒。"
              : "Orange sphere: target tolerance. Cyan point: source endpoint. Stay within 2 cm for 1 second."}
          </p>
          <code>{armEndpoints[robot.id] || "unsupported"}</code>
          <p role="status">
            {status !== "ready"
              ? status
              : error === null
                ? "…"
                : `${(error * 100).toFixed(1)} cm · ${Math.round(progress * 100)}%`}
          </p>
          <progress
            aria-label={zh ? "连续保持1秒" : "Hold for 1 second"}
            max={1}
            value={progress}
          />
          <small>
            {zh
              ? "需先手动调整关节；失焦暂停，返回后点击恢复计分。"
              : "Move a joint first. Focus loss pauses scoring; resume explicitly."}
          </small>
          {joints.map((j) => (
            <label key={j.name}>
              {j.name} <output>{(values[j.name] || 0).toFixed(2)} rad</output>
              <input
                aria-label={j.name}
                disabled={status !== "ready"}
                type="range"
                min={j.lower}
                max={j.upper}
                step="0.005"
                value={values[j.name] ?? 0}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (e.nativeEvent.isTrusted && value !== values[j.name])
                    operated.current = true;
                  model.current?.setJointValue(j.name, value);
                  setValues((old) => ({ ...old, [j.name]: value }));
                }}
              />
            </label>
          ))}
          <button
            disabled={status !== "ready"}
            onClick={() => {
              pausedRef.current = !pausedRef.current;
              setPaused(pausedRef.current);
              dwell.current = 0;
              setProgress(0);
            }}
          >
            {zh
              ? paused
                ? "恢复计分"
                : "暂停计分"
              : paused
                ? "Resume scoring"
                : "Pause scoring"}
          </button>
          <button
            disabled={status !== "ready"}
            onClick={() => {
              const initial = Object.fromEntries(
                joints.map((j) => [
                  j.name,
                  Math.max(j.lower, Math.min(j.upper, 0)),
                ]),
              );
              operated.current = false;
              model.current?.setJointValues(initial);
              setValues(initial);
              dwell.current = 0;
              setProgress(0);
            }}
          >
            {zh ? "复位关节" : "Reset joints"}
          </button>
          <button
            disabled={progress < 1}
            onClick={() => {
              const next = (stage + 1) % 3;
              operated.current = false;
              stageRef.current = next;
              setStage(next);
              dwell.current = 0;
              setProgress(0);
            }}
          >
            {zh
              ? stage === 2
                ? "重新挑战"
                : "下一目标"
              : stage === 2
                ? "Restart"
                : "Next target"}
          </button>
          <p className="arm-reach-note">
            {zh
              ? "仅源 URDF 正运动学定位。目标由限位内姿态生成，不检查碰撞、平衡或末端方向；不是抓取、接触或硬件控制。"
              : "Source URDF forward kinematics only. Targets use in-limit poses; no collision, balance or orientation validation. Not grasping, contact or hardware control."}
          </p>
        </aside>
      </div>
    </section>
  );
}
