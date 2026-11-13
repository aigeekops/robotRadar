import ChallengeLoading from "./ChallengeLoading";
import { robotMeshCache } from "./viewer/meshCache";
import { fitAssemblyOverview } from "./core/assemblyOverviewFit";
import { assemblyTrayLayout } from "./core/assemblyTrayLayout";
import {
  withObjMeshSupport,
  withCompressedMeshSupport,
} from "./viewer/urdfMeshLoader";
import {
  installPhotographicLighting,
  photographicMaterial,
  collectMaterialTextures,
} from "./viewer/realism";
import { siteAsset } from "./siteAssets";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader, { URDFRobot } from "urdf-loader";
import {
  ArrowLeft,
  Check,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { Lang, RobotEntry } from "./types";
import {
  chooseBuildPart,
  holdBuildMarker,
  initialBuild,
  tickBuild,
  topologicalVisualLinks,
  undoBuild,
  type BuildSession,
} from "./core/buildExperience";
import "./styles/assemblyExperience.css";

type Props = {
  robot: RobotEntry;
  lang: Lang;
  onExit: () => void;
  contextPart?: string;
  exitLabel?: string;
};
type VisualStep = { id: string; meshes: number };
type SceneStep = VisualStep & {
  group: THREE.Group;
  bounds: THREE.Box3;
  center: THREE.Vector3;
  meshesList: THREE.Mesh[];
};
const linkLabel = (id: string, lang: Lang) => {
  if (lang === "en") return id.replace(/_link$/, "").replaceAll("_", " ");
  return id
    .replace("left_", "左侧 · ")
    .replace("right_", "右侧 · ")
    .replace("pelvis", "骨盆")
    .replace("torso", "躯干")
    .replace("head", "头部")
    .replace("logo", "标识面板")
    .replace("hip_pitch", "髋俯仰")
    .replace("hip_roll", "髋侧摆")
    .replace("hip_yaw", "髋偏航")
    .replace("ankle_pitch", "踝俯仰")
    .replace("ankle_roll", "踝侧摆")
    .replace("knee", "膝部")
    .replace("shoulder_pitch", "肩俯仰")
    .replace("shoulder_roll", "肩侧摆")
    .replace("shoulder_yaw", "肩偏航")
    .replace("elbow", "肘部")
    .replace("wrist_roll_rubber_hand", "腕部与手形外观")
    .replace(/_link$/, "连杆")
    .replaceAll("_", " ");
};
export default function AssemblyExperience({
  robot,
  lang,
  onExit,
  contextPart,
  exitLabel,
}: Props) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const host = useRef<HTMLDivElement>(null);
  const markerButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const [steps, setSteps] = useState<VisualStep[]>([]);
  const [session, setSession] = useState<BuildSession>(initialBuild);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [loadProgress, setLoadProgress] = useState({ completed: 0, total: 0 });
  const [reload, setReload] = useState(0);
  const [hint, setHint] = useState(false);
  const [feedback, setFeedback] = useState("");
  const current = steps[session.step];
  const [trayPage, setTrayPage] = useState(0);
  const [trayOverview, setTrayOverview] = useState(true);
  const overviewRef = useRef(trayOverview);
  overviewRef.current = trayOverview;
  const trayPageRef = useRef(trayPage);
  trayPageRef.current = trayPage;
  const remaining = Math.max(0, steps.length - session.step);
  const trayPages = Math.max(1, Math.ceil(remaining / 4));
  useEffect(() => {
    setTrayPage(0);
  }, [session.step, robot.id, reload]);
  useEffect(() => {
    setTrayOverview(true);
  }, [robot.id, reload]);
  const selectRef = useRef<(index: number) => void>(() => {});
  const select = (index: number) => {
    if (status !== "ready") return;
    setSession((previous) => chooseBuildPart(previous, index, steps.length));
    setFeedback(
      index === sessionRef.current.step
        ? ""
        : t(
            "这不是当前步骤的零件。请找青色高亮件。",
            "That is not the current part. Find the cyan highlighted piece.",
          ),
    );
  };
  selectRef.current = select;
  useEffect(() => {
    if (status !== "ready") return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - previous) / 1000;
      previous = now;
      setSession((s) => tickBuild(s, dt, steps.length));
    }, 40);
    return () => clearInterval(timer);
  }, [status, steps.length]);
  useEffect(() => {
    const release = () =>
      setSession((s) => ({ ...s, held: false, confirmation: 0 }));
    window.addEventListener("pointerup", release);
    window.addEventListener("blur", release);
    const visibility = () => {
      if (document.hidden)
        setSession((s) => ({
          ...s,
          paused: true,
          held: false,
          confirmation: 0,
        }));
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false,
      frame = 0,
      pending = 0,
      parsed = false,
      finalized = false,
      failed = false;
    let meshTotal = 0,
      meshCompleted = 0;
    let source: URDFRobot | null = null;
    let ghostModel: THREE.Group | null = null;
    const materialOriginals = new Map<
      THREE.Material,
      { color: THREE.Color; intensity: number }
    >();
    let radius = 1,
      sceneSteps: SceneStep[] = [];
    const sourceMatrices = new Map<THREE.Mesh, THREE.Matrix4>();
    setStatus("loading");
    setLoadProgress({ completed: 0, total: 0 });
    setError("");
    setSteps([]);
    setSession(initialBuild());
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b131b");
    const roomFog = new THREE.Fog("#0b131b", 12, 30);
    scene.fog = roomFog;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
    camera.position.set(3, 2.5, 5);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    let reducedMotion =
      document.documentElement.dataset.reducedMotion === "true";
    const preferenceChanged = () => {
      reducedMotion = document.documentElement.dataset.reducedMotion === "true";
      controls.enableDamping = !reducedMotion;
      element.dataset.reducedMotion = String(reducedMotion);
    };
    preferenceChanged();
    window.addEventListener("robot-radar-motion-preference", preferenceChanged);
    controls.minDistance = 0.5;
    controls.maxDistance = 15;
    const photography = installPhotographicLighting(scene, renderer);
    photography.fit(2);
    const overviewRoom = new THREE.Group();
    const overviewOffsets: THREE.Vector3[] = [];
    let lastLayout = "";
    scene.add(overviewRoom);
    const room = new THREE.Group();
    scene.add(room);
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: number,
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.68,
          metalness: 0.25,
        }),
      );
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      room.add(mesh);
      return mesh;
    };
    box(0, -0.06, 0, 8, 0.1, 7, 0x25313b);
    const grid = new THREE.GridHelper(8, 32, 0x6b858d, 0x35444c);
    grid.position.y = 0.001;
    room.add(grid);
    box(0, 0.01, 0, 1.1, 0.035, 1.1, 0x3b4a53);
    for (const x of [-1.35, 1.35]) {
      box(x, 0.28, 0, 0.9, 0.06, 2.5, 0x2c4858);
      for (const z of [-0.95, 0.95])
        box(x, 0.13, z, 0.065, 0.3, 0.07, 0x485b68);
      box(x, 0.32, 0, 0.94, 0.012, 2.54, 0x263f4c);
      box(x - 0.46, 0.331, 0, 0.012, 0.012, 2.5, 0x32a8c2);
      box(x + 0.46, 0.331, 0, 0.012, 0.012, 2.5, 0x32a8c2);
    }
    box(0, 1.55, -2.5, 7, 3.2, 0.08, 0x182630);
    for (let x = -3; x <= 3; x += 0.3)
      box(x, 1.55, -2.44, 0.025, 3.1, 0.04, 0x334450);
    const targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.47, 0.49, 80),
      new THREE.MeshBasicMaterial({ color: 0x51d7ec, side: THREE.DoubleSide }),
    );
    targetRing.rotation.x = -Math.PI / 2;
    targetRing.position.y = 0.035;
    room.add(targetRing);
    const observer = new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observer.observe(element);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(siteAsset);
    const fail = (reason: unknown) => {
      failed = true;
      if (!disposed) {
        setStatus("error");
        setError(String(reason));
      }
    };
    manager.onError = fail;
    const finalize = () => {
      if (
        disposed ||
        failed ||
        finalized ||
        !parsed ||
        pending !== 0 ||
        !source
      )
        return;
      finalized = true;
      try {
        source.rotation.x = -Math.PI / 2;
        source.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(source);
        if (bounds.isEmpty()) throw Error("No visual geometry in source model");
        source.position.y -= bounds.min.y;
        source.updateMatrixWorld(true);
        const size = bounds.getSize(new THREE.Vector3());
        radius = Math.max(size.x, size.y, size.z, 0.3);
        room.scale.setScalar(radius);
        const linkObjects = new Map<THREE.Object3D, string>(
          Object.entries(source.links).map(([name, obj]) => [obj, name]),
        );
        const groups = new Map<string, THREE.Group>();
        source.traverse((node) => {
          if (!(node as THREE.Mesh).isMesh) return;
          let ancestor: THREE.Object3D | null = node;
          while (ancestor && !linkObjects.has(ancestor))
            ancestor = ancestor.parent;
          const id = ancestor ? linkObjects.get(ancestor) : undefined;
          if (!id) throw Error("Visual without a source link identity");
          const mesh = node as THREE.Mesh;
          const copy = new THREE.Mesh(
            mesh.geometry,
            Array.isArray(mesh.material)
              ? mesh.material.map(photographicMaterial)
              : photographicMaterial(mesh.material),
          );
          mesh.matrixWorld.decompose(
            copy.position,
            copy.quaternion,
            copy.scale,
          );
          copy.castShadow = true;
          copy.receiveShadow = true;
          (Array.isArray(copy.material)
            ? copy.material
            : [copy.material]
          ).forEach((material) => {
            const m = material as THREE.MeshStandardMaterial;
            if (m.emissive)
              materialOriginals.set(material, {
                color: m.emissive.clone(),
                intensity: m.emissiveIntensity,
              });
          });
          sourceMatrices.set(copy, mesh.matrixWorld.clone());
          const group = groups.get(id) || new THREE.Group();
          group.name = id;
          group.add(copy);
          groups.set(id, group);
        });
        const joints = Object.values(source.joints).map((j) => ({
          parent: j.parent?.name || "",
          child:
            j.children.find(
              (c) =>
                (c as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink,
            )?.name || "",
        }));
        const order = topologicalVisualLinks(
          Object.keys(source.links),
          joints,
          new Set(groups.keys()),
        );
        sceneSteps = order.map((id, index) => {
          const group = groups.get(id)!;
          scene.add(group);
          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group),
            center = box.getCenter(new THREE.Vector3());
          const meshesList = group.children as THREE.Mesh[];
          meshesList.forEach((m) => {
            m.userData.step = index;
          });
          return {
            id,
            group,
            bounds: box,
            center,
            meshes: meshesList.length,
            meshesList,
          };
        });
        // Every source step gets its own non-overlapping overview tray, not four hidden slots.
        const { cellX, cellZ, rows, cells } = assemblyTrayLayout(
          sceneSteps.map((s) => {
            const size = s.bounds.getSize(new THREE.Vector3());
            return { width: size.x, depth: size.z };
          }),
          radius,
        );
        sceneSteps.forEach((step, index) => {
          const { x, z } = cells[index];
          overviewOffsets.push(
            new THREE.Vector3(
              x - step.center.x,
              radius * 0.35 - step.bounds.min.y,
              z - step.center.z,
            ),
          );
          const tray = new THREE.Mesh(
            new THREE.BoxGeometry(cellX * 0.94, radius * 0.025, cellZ * 0.94),
            new THREE.MeshStandardMaterial({
              color: index % 2 ? 0x203b49 : 0x294655,
              roughness: 0.8,
            }),
          );
          tray.position.set(x, radius * 0.325, z);
          tray.receiveShadow = true;
          overviewRoom.add(tray);
        });
        const floor = new THREE.Mesh(
          new THREE.BoxGeometry(
            radius * 2 + cellX * 4.5,
            radius * 0.025,
            rows * cellZ + radius,
          ),
          new THREE.MeshStandardMaterial({ color: 0x1a2934, roughness: 0.9 }),
        );
        floor.position.y = -radius * 0.025;
        floor.receiveShadow = true;
        overviewRoom.add(floor);
        // Ghosted targets use the exact source surface, never invented internals.
        const ghost = new THREE.Group();
        for (const step of sceneSteps)
          for (const mesh of step.meshesList) {
            const copy = new THREE.Mesh(
              mesh.geometry,
              new THREE.MeshBasicMaterial({
                color: 0x65d8ed,
                transparent: true,
                opacity: 0.045,
                depthWrite: false,
              }),
            );
            copy.position.copy(mesh.position);
            copy.quaternion.copy(mesh.quaternion);
            copy.scale.copy(mesh.scale);
            ghost.add(copy);
          }
        scene.add(ghost);
        ghostModel = ghost;
        camera.position.set(radius * 2.0, radius * 1.3, radius * 2.7);
        controls.target.set(0, radius * 0.55, 0);
        controls.update();
        element.dataset.sourceMeshCount = String(sourceMatrices.size);
        element.dataset.sourceStepIds = JSON.stringify(order);
        setSteps(sceneSteps.map(({ id, meshes }) => ({ id, meshes })));
        setStatus("ready");
      } catch (e) {
        fail(e);
      }
    };
    const loader = new URDFLoader(manager);
    loader.workingPath = window.location.origin;
    loader.parseCollision = false;
    const original = robotMeshCache.wrap(
      withCompressedMeshSupport(
        withObjMeshSupport(loader.loadMeshCb.bind(loader)),
      ),
    );
    loader.loadMeshCb = (path, mgr, done) => {
      pending++;
      meshTotal++;
      setLoadProgress({ completed: meshCompleted, total: meshTotal });
      original(path, mgr, (object, error) => {
        if (disposed) {
          robotMeshCache.disposeInstance(object);
          return;
        }
        done(object, error);
        pending--;
        meshCompleted++;
        setLoadProgress({ completed: meshCompleted, total: meshTotal });
        if (error) fail(error);
        queueMicrotask(finalize);
      });
    };
    loader.load(
      robot.urdfUrl,
      (loaded) => {
        if (disposed) {
          robotMeshCache.disposeInstance(loaded);
          return;
        }
        source = loaded;
        parsed = true;
        queueMicrotask(finalize);
      },
      undefined,
      fail,
    );
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const candidates = sceneSteps
        .filter(
          (s, i) =>
            i >= sessionRef.current.step &&
            (overviewRef.current ||
              (i >= sessionRef.current.step + trayPageRef.current * 4 &&
                i < sessionRef.current.step + trayPageRef.current * 4 + 4)) &&
            s.group.visible,
        )
        .flatMap((s) => s.meshesList);
      const hit = raycaster.intersectObjects(candidates, false)[0];
      if (hit) selectRef.current(hit.object.userData.step);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    const project = (point: THREE.Vector3) => {
      const p = point.clone().project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * element.clientWidth,
        y: (-0.5 * p.y + 0.5) * element.clientHeight,
        visible: p.z < 1 && p.z > -1,
      };
    };
    const animate = () => {
      if (disposed) return;
      const state = sessionRef.current;
      const trayStart = state.step + trayPageRef.current * 4;
      sceneSteps.forEach((step, index) => {
        const slot = Math.max(0, index - trayStart),
          side = slot % 2 === 0 ? -1 : 1,
          row = Math.floor(slot / 2);
        const offset = overviewRef.current
          ? overviewOffsets[index]
          : new THREE.Vector3(
              side * radius * 1.35 - step.center.x,
              radius * 0.35 - step.bounds.min.y,
              (row === 0 ? 0.6 : -0.6) * radius - step.center.z,
            );
        const built = index < state.step || state.phase === "complete";
        const current = index === state.step;
        step.group.visible =
          built ||
          (current && state.phase !== "pick") ||
          (index >= state.step &&
            (overviewRef.current ||
              (index >= trayStart && index < trayStart + 4)));
        if (built || (current && state.phase === "confirm"))
          step.group.position.set(0, 0, 0);
        else if (current && state.phase === "flying") {
          const p = reducedMotion
            ? 1
            : state.fly * state.fly * (3 - 2 * state.fly);
          step.group.position.copy(offset).multiplyScalar(1 - p);
          step.group.position.y += Math.sin(Math.PI * p) * radius * 0.4;
        } else step.group.position.copy(offset);
        for (const mesh of step.meshesList) {
          const materials = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          for (const material of materials) {
            const m = material as THREE.MeshStandardMaterial;
            if (m.emissive) {
              const original = materialOriginals.get(material);
              if (current && !built) {
                m.emissive.set(0x167b91);
                m.emissiveIntensity = reducedMotion
                  ? 0.7
                  : 0.7 + 0.25 * Math.sin(performance.now() / 240);
              } else if (original) {
                m.emissive.copy(original.color);
                m.emissiveIntensity = original.intensity;
              }
            }
          }
        }
      });
      room.visible = !overviewRef.current;
      overviewRoom.visible = overviewRef.current;
      scene.fog = overviewRef.current ? null : roomFog;
      const layoutKey = `${overviewRef.current}:${element.clientWidth}:${element.clientHeight}`;
      if (sceneSteps.length && lastLayout !== layoutKey) {
        lastLayout = layoutKey;
        if (overviewRef.current) {
          const all = new THREE.Box3();
          overviewRoom.children
            .slice(0, -1)
            .forEach((tray) => all.union(new THREE.Box3().setFromObject(tray)));
          sceneSteps.forEach((s) =>
            all.union(
              s.bounds
                .clone()
                .translate(overviewOffsets[sceneSteps.indexOf(s)]),
            ),
          );
          const fit = fitAssemblyOverview(
            all,
            new THREE.Vector3(0.55, 1.65, 1.2),
            camera.fov,
            camera.aspect,
          );
          const distance = fit.distance;
          camera.position.copy(fit.position);
          controls.target.copy(fit.center);
          controls.maxDistance = Math.max(15, distance * 3);
          camera.far = Math.max(100, distance * 5);
          camera.updateProjectionMatrix();
        } else {
          camera.position.set(radius * 2, radius * 1.3, radius * 2.7);
          controls.target.set(0, radius * 0.55, 0);
        }
        controls.update();
      }
      if (ghostModel) ghostModel.visible = state.phase !== "complete";
      if (sceneSteps.length) {
        element.dataset.placedMeshes = String(
          sceneSteps
            .filter(
              (step) =>
                step.group.visible && step.group.position.length() < 1e-10,
            )
            .reduce((sum, step) => sum + step.meshes, 0),
        );
        element.dataset.trayProjections = JSON.stringify(
          sceneSteps
            .slice(
              overviewRef.current ? state.step : trayStart,
              overviewRef.current ? sceneSteps.length : trayStart + 4,
            )
            .map((step, slot) => {
              const point = step.center.clone().add(step.group.position);
              return {
                step: (overviewRef.current ? state.step : trayStart) + slot,
                ...project(point),
              };
            }),
        );
        element.dataset.trayOverview = String(overviewRef.current);
        element.dataset.visiblePendingParts = String(
          sceneSteps.filter(
            (step, index) => index >= state.step && step.group.visible,
          ).length,
        );
        element.dataset.trayPage = String(trayPageRef.current);
        element.dataset.trayTotal = String(
          Math.max(0, sceneSteps.length - state.step),
        );
        element.dataset.phase = state.phase;
        element.dataset.step = String(state.step);
        element.dataset.fly = state.fly.toFixed(4);
        if (state.phase === "complete") {
          let max = 0;
          scene.updateMatrixWorld(true);
          sourceMatrices.forEach((target, mesh) => {
            mesh.matrixWorld.elements.forEach((n, i) => {
              max = Math.max(max, Math.abs(n - target.elements[i]));
            });
          });
          element.dataset.maxAssemblyError = String(max);
        } else delete element.dataset.maxAssemblyError;
      }
      const target = sceneSteps[state.step];
      markerButtons.current.forEach((button, i) => {
        if (!button) return;
        const visible = state.phase === "confirm" && target;
        button.style.display = visible ? "flex" : "none";
        if (visible) {
          const size = target.bounds.getSize(new THREE.Vector3());
          const point = target.center
            .clone()
            .add(
              new THREE.Vector3(
                (i === 0 ? -1 : 1) * Math.max(size.x * 0.5, radius * 0.07),
                (i === 0 ? 1 : -1) * Math.max(size.y * 0.2, radius * 0.035),
                Math.max(size.z * 0.5, radius * 0.03),
              ),
            );
          const screen = project(point);
          button.style.left = `${screen.x}px`;
          button.style.top = `${screen.y}px`;
          button.style.visibility = screen.visible ? "visible" : "hidden";
        }
      });
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(
        "robot-radar-motion-preference",
        preferenceChanged,
      );
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>();
      const collect = (node: THREE.Object3D) => {
        if ((node as THREE.Mesh).isMesh) {
          const m = node as THREE.Mesh;
          geometries.add(m.geometry);
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((v) =>
            materials.add(v),
          );
        }
      };
      scene.traverse(collect);
      source?.traverse(collect);
      geometries.forEach((g) => g.dispose());
      const textures = new Set<THREE.Texture>();
      materials.forEach((m) => {
        collectMaterialTextures(m, textures);
        m.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      photography.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [robot.urdfUrl, reload]);
  const hold = (index: number, pressed: boolean) =>
    setSession((s) => holdBuildMarker(s, index, pressed));
  const reset = () => {
    setSession(initialBuild());
    setFeedback("");
    setHint(false);
    setTrayPage(0);
    setTrayOverview(true);
  };
  const minutes = Math.floor(session.elapsed / 60),
    seconds = Math.floor(session.elapsed % 60);
  return (
    <section
      className="assembly-experience"
      data-testid="assembly-experience"
      data-robot-id={robot.id}
      data-load-state={status}
    >
      <header className="ae-top">
        <button onClick={onExit}>
          <ArrowLeft size={16} />
          {exitLabel || t("退出装配", "Exit assembly")}
        </button>
        <div>
          <strong>{robot.name[lang]}</strong>
          <span>{t("模型装配工作台", "MODEL ASSEMBLY WORKBENCH")}</span>
        </div>
        <time>
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </time>
      </header>
      <div className="ae-canvas" ref={host} data-testid="assembly-canvas">
        {status === "ready" && remaining > 0 && (
          <nav
            className="ae-tray-pagination"
            aria-label={t("场景托盘分页", "Scene tray pages")}
          >
            <strong data-testid="assembly-tray-page">
              {trayOverview ? (
                t("全部待装件 · 总览", "All pending parts · overview")
              ) : (
                <>
                  {t(
                    `场景托盘 ${trayPage + 1} / ${trayPages}`,
                    `Scene tray ${trayPage + 1} / ${trayPages}`,
                  )}
                </>
              )}
            </strong>
            <span>
              {t(
                `待装 ${remaining} 件，${trayOverview ? "场景全部展示" : "近景分页展示"}`,
                `${remaining} pending parts; ${trayOverview ? "all shown in scene" : "close-up tray pages"}`,
              )}
            </span>
            <div>
              <button
                onClick={() => setTrayOverview(true)}
                disabled={session.phase !== "pick"}
              >
                {t("全部配件总览", "All parts overview")}
              </button>
              <button
                onClick={() => {
                  setTrayOverview(false);
                  setTrayPage((p) => Math.max(0, p - 1));
                }}
                disabled={
                  trayPage === 0 || session.phase !== "pick" || session.auto
                }
              >
                {t("上一托盘", "Previous tray")}
              </button>
              <button
                onClick={() => {
                  setTrayOverview(false);
                  setTrayPage((p) => Math.min(trayPages - 1, p + 1));
                }}
                disabled={
                  trayPage >= trayPages - 1 ||
                  session.phase !== "pick" ||
                  session.auto
                }
              >
                {t("下一托盘", "Next tray")}
              </button>
              <button
                disabled={session.phase !== "pick"}
                onClick={() => {
                  setTrayOverview(false);
                  setTrayPage(0);
                  document
                    .querySelector(
                      `[data-testid="assembly-part-${session.step}"]`,
                    )
                    ?.scrollIntoView({ block: "nearest" });
                }}
              >
                {t("回到当前目标", "Current target")}
              </button>
            </div>
          </nav>
        )}
        {[0, 1].map((index) => (
          <button
            key={index}
            ref={(el) => {
              markerButtons.current[index] = el;
            }}
            className={`ae-marker ${session.marker > index ? "done" : ""} ${session.marker === index ? "active" : ""}`}
            style={
              {
                "--hold": `${session.marker > index ? 100 : session.marker === index ? session.confirmation * 100 : 0}%`,
              } as React.CSSProperties
            }
            aria-label={t(
              `按住虚拟定位确认点 ${index + 1}`,
              `Hold virtual alignment point ${index + 1}`,
            )}
            disabled={session.marker !== index || session.paused}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              hold(index, true);
            }}
            onPointerUp={() => hold(index, false)}
            onPointerCancel={() => hold(index, false)}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                hold(index, true);
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                hold(index, false);
              }
            }}
          >
            {session.marker > index ? <Check size={19} /> : index + 1}
          </button>
        ))}
      </div>
      {status !== "ready" && (
        <div className="ae-loading-shell">
          <ChallengeLoading
            robot={robot}
            lang={lang}
            failed={status === "error"}
            completed={loadProgress.completed}
            total={loadProgress.total}
            retryLabel={t("重试加载", "Retry loading")}
            onRetry={() => setReload((n) => n + 1)}
            onBack={onExit}
          />
          {error && <span className="sr-only">{error}</span>}
        </div>
      )}
      <aside className="ae-panel">
        <div className="ae-kicker">
          {t("源模型 · 拓扑教学", "SOURCE MODEL · TOPOLOGY LESSON")}
        </div>
        <h1>
          {session.phase === "complete"
            ? t("模型装配完成", "Model assembled")
            : t("把每一块，放回原位。", "Every part. Back in place.")}
        </h1>
        <p className="ae-boundary">
          {t(
            "按官方 URDF 外观连杆学习组装。不是实机维修工序；定位圈是虚拟确认点，不是真实螺栓或扭矩要求。",
            "Assemble the official URDF visual links. Not a physical service procedure: circles are virtual alignment confirmations, not real bolts or torque requirements.",
          )}
        </p>
        {contextPart && (
          <p
            className="ae-learning-context"
            data-testid="assembly-learning-context"
          >
            {t("来自探索的学习目标：", "Learning focus from exploration: ")}
            {contextPart}
            <br />
            {t(
              "仍从完整源模型流程开始；退出后保留你的探索状态。",
              "The full source-model sequence starts at its beginning. Your exploration state is kept on return.",
            )}
          </p>
        )}
        <div className="ae-progress">
          <span>
            STEP{" "}
            {String(Math.min(session.step + 1, steps.length)).padStart(2, "0")}{" "}
            / {String(steps.length).padStart(2, "0")}
          </span>
          <b>
            {session.step} / {steps.length}
          </b>
          <i
            style={{
              width: `${steps.length ? (session.step / steps.length) * 100 : 0}%`,
            }}
          />
        </div>
        {current && (
          <>
            <h2>{linkLabel(current.id, lang)}</h2>
            <code>{current.id}</code>
            <p className="ae-instruction">
              {session.phase === "pick"
                ? t(
                    "点击托盘中青色高亮部件，将它送到目标位置。",
                    "Click the cyan-highlighted tray part to place it at its target.",
                  )
                : session.phase === "flying"
                  ? t(
                      "部件正在移动到源模型的真实坐标…",
                      "Moving to the exact source-model coordinates…",
                    )
                  : t(
                      `按住定位确认点 ${session.marker + 1}，直到圆环变绿。`,
                      `Hold alignment point ${session.marker + 1} until its ring turns green.`,
                    )}
            </p>
          </>
        )}
        {session.phase === "complete" ? (
          <div className="ae-complete" role="status">
            <Check size={26} />
            <strong>
              {t("全部源模型部件已定位", "All source-model parts placed")}
            </strong>
            <p>
              {t(
                "完整外观由原始网格重新组成。学习完成不代表实机装配、紧固或校准完成。",
                "The complete exterior is rebuilt from the original meshes. This does not certify physical assembly, fastening or calibration.",
              )}
            </p>
          </div>
        ) : null}
        <section
          className="ae-inventory"
          aria-label={t("完整源零件清单", "Complete source part inventory")}
        >
          <h3>{t("完整零件清单", "Complete part inventory")}</h3>
          <p data-testid="assembly-inventory-count">
            {t(
              `共 ${steps.length} 件 · 已装 ${session.step} · 待装 ${remaining}`,
              `${steps.length} total · ${session.step} placed · ${remaining} pending`,
            )}
          </p>
          <small>
            {t(
              "每项对应一个真实源模型步骤；滚动查看所有实例。场景默认展示全部配件，可切换近景托盘。",
              "Each entry is a real source-model step. Scroll to inspect every instance. The scene starts with all parts; close-up trays are optional.",
            )}
          </small>
          <div className="ae-tray-list" data-testid="assembly-full-inventory">
            {steps.map((step, index) => (
              <button
                key={step.id}
                className={
                  index < session.step
                    ? "placed"
                    : index === session.step
                      ? "expected"
                      : ""
                }
                onClick={() => {
                  setTrayPage(Math.floor((index - session.step) / 4));
                  select(index);
                }}
                disabled={
                  index < session.step ||
                  session.phase !== "pick" ||
                  session.paused
                }
                data-testid={`assembly-part-${index}`}
                aria-current={index === session.step ? "step" : undefined}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{linkLabel(step.id, lang)}</strong>
                  <small>{step.id}</small>
                </div>
                <b>
                  {index < session.step
                    ? "✓"
                    : index === session.step
                      ? "●"
                      : ""}
                </b>
              </button>
            ))}
          </div>
        </section>
        {feedback && (
          <p className="ae-feedback" role="status">
            {feedback}
          </p>
        )}
        <div className="ae-tools">
          <button onClick={() => setHint(!hint)}>
            <HelpCircle size={15} />
            {t("提示", "Hint")}
          </button>
          <button
            onClick={() => {
              setTrayPage(0);
              setSession((s) => ({
                ...s,
                auto: !s.auto,
                paused: false,
                started: true,
                held: false,
              }));
            }}
            disabled={session.phase === "complete" || status !== "ready"}
          >
            <Play size={15} />
            {session.auto
              ? t("关闭自动", "Auto off")
              : t("自动组装", "Auto-build")}
          </button>
          <button
            onClick={() =>
              setSession((s) => ({
                ...s,
                paused: !s.paused,
                held: false,
                confirmation: 0,
              }))
            }
            disabled={!session.started || session.phase === "complete"}
          >
            {session.paused ? <Play size={15} /> : <Pause size={15} />}{" "}
            {session.paused ? t("继续", "Resume") : t("暂停", "Pause")}
          </button>
        </div>
        {hint && current && (
          <p className="ae-hint">
            {t(
              "目标是青色高亮件。可点击场景中的零件或右侧同名卡片。飞入定位后依次按住两个虚拟圈；提前松开会重置本次确认。",
              "Choose the cyan piece in the scene or its matching card. After it flies into place, hold each virtual circle. Releasing early resets that confirmation.",
            )}
          </p>
        )}
        <div className="ae-bottom-tools">
          <button
            onClick={() => {
              setSession(undoBuild);
              setFeedback("");
            }}
            disabled={session.step === 0}
          >
            <Undo2 size={15} />
            {t("撤回上一步", "Undo step")}
          </button>
          <button onClick={reset}>
            <RotateCcw size={15} />
            {t("重新开始", "Start over")}
          </button>
        </div>
        <a href={siteAsset(robot.urdfUrl)} target="_blank" rel="noreferrer">
          {t(
            "核对原始 URDF 与部件坐标",
            "Inspect source URDF and link coordinates",
          )}{" "}
          ↗
        </a>
      </aside>
      <footer className="ae-footer">
        <span>
          {t(
            "拖动视角 · 滚轮缩放 · 点击高亮零件",
            "ORBIT · ZOOM · PICK THE HIGHLIGHTED PART",
          )}
        </span>
        <span>
          {t(
            "教学模拟 · 无实体硬件连接",
            "TEACHING SIMULATION · NO HARDWARE CONNECTION",
          )}
        </span>
      </footer>
    </section>
  );
}
