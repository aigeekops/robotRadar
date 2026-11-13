import { driveTaskFor, dockingFeedback, DOCK_TARGET } from "./core/driveTasks";
import {
  stepDriveCamera,
  type DriveCameraMode,
  type CameraTrack,
} from "./core/driveCamera";
import { withObjMeshSupport } from "./viewer/urdfMeshLoader";
import { siteAsset } from "./siteAssets";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import URDFLoader, { URDFRobot } from "urdf-loader";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  RotateCcw,
  Pause,
  Play,
  Flag,
  Check,
} from "lucide-react";
import type { RobotEntry, Lang } from "./types";
import {
  advanceDrive,
  initialDriveState,
  startJump,
  jumpHeight,
  DRIVE_GATES,
  type DriveState,
} from "./core/drive";
import { isMimicJoint } from "./core/urdf";
import { createDriveFootIK } from "./viewer/driveFootIK";
import {
  installPhotographicLighting,
  photographicMaterial,
} from "./viewer/realism";
import "./styles/drive.css";

/** Source mesh, simulated scene displacement. Never imports robot SDKs or sends hardware commands. */
export default function DriveExperience({
  robot,
  lang,
  onExit,
}: {
  robot: RobotEntry;
  lang: Lang;
  onExit: () => void;
}) {
  const t = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const task = driveTaskFor(robot);
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(initialDriveState());
  const keys = useRef(new Set<string>());
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<DriveState>(initialDriveState);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState("");
  const [cameraMode, setCameraMode] = useState<DriveCameraMode>(() =>
    document.documentElement.dataset.reducedMotion === "true"
      ? "fixed"
      : "follow",
  );
  const cameraModeRef = useRef(cameraMode);
  const [cameraReduced, setCameraReduced] = useState(false);
  const toggleCamera = () => {
    if (document.documentElement.dataset.reducedMotion === "true") return;
    cameraModeRef.current =
      cameraModeRef.current === "follow" ? "fixed" : "follow";
    setCameraMode(cameraModeRef.current);
  };
  const reset = () => {
    keys.current.clear();
    state.current = initialDriveState();
    setSnapshot(state.current);
    pauseRef.current = false;
    setPaused(false);
  };
  const togglePause = () => {
    keys.current.clear();
    pauseRef.current = !pauseRef.current;
    setPaused(pauseRef.current);
  };
  const jump = () => {
    if (!pauseRef.current && status === "ready")
      state.current = startJump(state.current, task);
  };
  useEffect(() => {
    if (task === "stationary" || !host.current) return;
    const container = host.current;
    let disposed = false,
      raf = 0,
      parsed = false,
      pending = 0,
      failed = false,
      ready = false;
    let model: URDFRobot | null = null;
    let footIK: ReturnType<typeof createDriveFootIK> = null;
    let gaitTravel = 0,
      gaitBlend = 0,
      previousTravel = 0,
      previousGaitElapsed = 0;
    let gaitEvidence: ReturnType<
      NonNullable<ReturnType<typeof createDriveFootIK>>["update"]
    > | null = null;
    let cameraTrack: CameraTrack | null = null;
    let previousCameraTime = 0;
    let grounded = 0,
      height = 1.3,
      last = performance.now(),
      lastUI = 0;
    state.current = initialDriveState();
    keys.current.clear();
    pauseRef.current = false;
    setPaused(false);
    setStatus("loading");
    setDetail("");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#111c27");
    scene.fog = new THREE.Fog("#111c27", 22, 58);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.02, 100);
    let reducedMotion =
      document.documentElement.dataset.reducedMotion === "true";
    const preferenceChanged = () => {
      reducedMotion = document.documentElement.dataset.reducedMotion === "true";
      container.dataset.reducedMotion = String(reducedMotion);
      cameraModeRef.current = reducedMotion ? "fixed" : "follow";
      setCameraMode(cameraModeRef.current);
      setCameraReduced(reducedMotion);
    };
    preferenceChanged();
    window.addEventListener("robot-radar-motion-preference", preferenceChanged);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    const lighting = installPhotographicLighting(scene, renderer);
    const cameraLook = new THREE.Vector3();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(38, 38),
      new THREE.MeshStandardMaterial({ color: 0x33424b, roughness: 0.86 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const grid = new THREE.GridHelper(38, 38, 0x819098, 0x445661);
    grid.position.y = 0.004;
    scene.add(grid);
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-15, 0.015, -15),
        new THREE.Vector3(15, 0.015, -15),
        new THREE.Vector3(15, 0.015, 15),
        new THREE.Vector3(-15, 0.015, 15),
      ]),
      new THREE.LineBasicMaterial({ color: 0xf9a33b }),
    );
    scene.add(border);
    const routePoints = [
      new THREE.Vector3(0, 0.02, 0),
      ...DRIVE_GATES.map((g) => new THREE.Vector3(g.x, 0.02, g.z)),
    ];
    const route = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(routePoints),
      new THREE.LineDashedMaterial({
        color: 0x7295a6,
        dashSize: 0.22,
        gapSize: 0.18,
      }),
    );
    route.computeLineDistances();
    scene.add(route);
    const gates = DRIVE_GATES.map((g, index) => {
      const group = new THREE.Group();
      group.position.set(g.x, 1.15, g.z);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.05, 0.055, 10, 48),
        new THREE.MeshStandardMaterial({
          transparent: true,
          depthWrite: false,
          color: 0x657482,
          emissive: 0x12202b,
          emissiveIntensity: 0.5,
          metalness: 0.4,
          roughness: 0.35,
        }),
      );
      group.add(ring);
      // Side supports leave the target aperture visually clear; gates are markers, not collision geometry.
      for (const side of [-1, 1]) {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.08, 0.4),
          new THREE.MeshStandardMaterial({
            color: 0x263640,
            transparent: true,
            depthWrite: false,
          }),
        );
        base.position.set(side * 1.05, -1.11, 0);
        group.add(base);
      }
      const prev = index === 0 ? { x: 0, z: 0 } : DRIVE_GATES[index - 1];
      group.rotation.y = Math.atan2(g.x - prev.x, g.z - prev.z);
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#101c26";
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = "#e6f3fc";
      ctx.font = "bold 32px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1).padStart(2, "0"), 64, 43);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const plate = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
      );
      plate.position.y = 1.28;
      plate.scale.set(0.7, 0.35, 1);
      group.add(plate);
      group.userData.texture = texture;
      scene.add(group);
      return { group, ring };
    });
    const dock = new THREE.Group();
    if (task === "wheel-docking") {
      const outline = new THREE.Mesh(
        new THREE.RingGeometry(
          DOCK_TARGET.radius - 0.025,
          DOCK_TARGET.radius,
          48,
        ),
        new THREE.MeshBasicMaterial({
          color: 0x69d5ff,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      outline.rotation.x = -Math.PI / 2;
      outline.position.set(DOCK_TARGET.x, 0.035, DOCK_TARGET.z);
      dock.add(outline);
      const arrow = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.3, 0, 0),
          new THREE.Vector3(0.3, 0, 0),
          new THREE.Vector3(0.15, 0, -0.12),
          new THREE.Vector3(0.3, 0, 0),
          new THREE.Vector3(0.15, 0, 0.12),
        ]),
        new THREE.LineBasicMaterial({
          color: 0x69d5ff,
          transparent: true,
          opacity: 0.8,
        }),
      );
      arrow.position.set(DOCK_TARGET.x, 0.04, DOCK_TARGET.z);
      dock.add(arrow);
      scene.add(dock);
    }
    const carrier = new THREE.Group();
    scene.add(carrier);
    if (["arm", "hand", "gripper"].includes(robot.form)) {
      const platform = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.6, 0.12, 32),
        new THREE.MeshStandardMaterial({
          color: 0x738894,
          metalness: 0.5,
          roughness: 0.5,
        }),
      );
      platform.position.y = 0.06;
      platform.castShadow = true;
      carrier.add(platform);
    }
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(siteAsset);
    const loader = new URDFLoader(manager);
    loader.workingPath = location.origin;
    loader.parseCollision = false;
    const finalize = () => {
      if (disposed || ready || failed || !parsed || pending !== 0 || !model)
        return;
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (
        box.isEmpty() ||
        !Number.isFinite(size.length()) ||
        size.length() === 0
      ) {
        failed = true;
        setStatus("error");
        return;
      }
      height = Math.max(0.6, size.y);
      grounded =
        -box.min.y +
        (["arm", "hand", "gripper"].includes(robot.form) ? 0.12 : 0);
      model.position.y = grounded;
      model.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(photographicMaterial)
            : photographicMaterial(mesh.material);
        }
      });
      if (robot.id === "g1") footIK = createDriveFootIK(model, carrier);
      ready = true;
      setStatus("ready");
      camera.position.set(1.6, height + 0.6, 2.4);
      cameraLook.set(0, height * 0.6, -0.7);
      camera.lookAt(cameraLook);
      lighting.fit(height, new THREE.Vector3(0, height * 0.5, 0));
    };
    const defaultMesh = withObjMeshSupport(loader.loadMeshCb.bind(loader));
    loader.loadMeshCb = (path, m, done) => {
      pending++;
      defaultMesh(path, m, (obj, error) => {
        done(obj, error);
        pending--;
        if (error) {
          failed = true;
          if (!disposed) {
            setStatus("error");
            setDetail(String(error));
          }
        }
        queueMicrotask(finalize);
      });
    };
    manager.onError = () => {
      failed = true;
      if (!disposed) setStatus("error");
    };
    loader.load(
      robot.urdfUrl,
      (loaded) => {
        if (disposed) return;
        model = loaded;
        model.rotation.x = -Math.PI / 2;
        carrier.add(model);
        parsed = true;
        queueMicrotask(finalize);
      },
      undefined,
      (error) => {
        failed = true;
        if (!disposed) {
          setStatus("error");
          setDetail(String(error));
        }
      },
    );
    const resize = new ResizeObserver(() => {
      const w = container.clientWidth,
        h = container.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(container);
    const accepted = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
      "Space",
      "KeyR",
    ]);
    const down = (e: KeyboardEvent) => {
      if (!accepted.has(e.code) || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target?.matches("input,textarea,select,[contenteditable=true]"))
        return;
      e.preventDefault();
      if (e.code === "KeyR") {
        reset();
        return;
      }
      if (e.code === "Space") {
        if (!e.repeat && !pauseRef.current && ready)
          state.current = startJump(state.current);
        return;
      }
      keys.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => {
      keys.current.clear();
      pauseRef.current = true;
      setPaused(true);
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      const dt = (now - last) / 1000;
      last = now;
      if (ready && model) {
        const k = keys.current;
        state.current = advanceDrive(
          state.current,
          {
            forward:
              Number(k.has("KeyW") || k.has("ArrowUp")) -
              Number(k.has("KeyS") || k.has("ArrowDown")),
            turn:
              Number(k.has("KeyD") || k.has("ArrowRight")) -
              Number(k.has("KeyA") || k.has("ArrowLeft")),
            fast: k.has("ShiftLeft") || k.has("ShiftRight"),
            paused: pauseRef.current || document.hidden,
          },
          dt,
          task,
        );
        const s = state.current;
        carrier.position.set(s.x, jumpHeight(s.jump), s.z);
        carrier.rotation.y = Math.PI / 2 - s.heading;
        // Presentation support/swing timing. The IK uses the unmodified source chain, not contact forces.
        const motionDt = Math.min(0.05, Math.max(0, dt));
        if (s.elapsed < previousGaitElapsed) {
          gaitTravel = 0;
          gaitBlend = 0;
          previousTravel = s.travel;
        }
        if (!pauseRef.current && !document.hidden) {
          gaitTravel +=
            s.travel -
            previousTravel +
            Math.abs(s.angularSpeed) * 0.065 * motionDt;
          const blendTarget = Math.min(
            1,
            Math.abs(s.speed) / 0.8 + Math.abs(s.angularSpeed) * 0.25,
          );
          gaitBlend +=
            (blendTarget - gaitBlend) * (1 - Math.exp(-motionDt * 9));
        }
        previousTravel = s.travel;
        previousGaitElapsed = s.elapsed;
        const cycle = (gaitTravel / 0.72) * Math.PI * 2,
          amplitude = gaitBlend * 0.2;
        for (const [name, j] of Object.entries(model.joints)) {
          if (["arm", "hand", "gripper"].includes(robot.form)) continue;
          if (j.jointType === "fixed" || isMimicJoint(j)) continue;
          if (pauseRef.current || document.hidden) continue;
          if (footIK && /_(hip|knee|ankle)_/.test(name)) continue;
          let target = 0;
          if (robot.id === "g1") {
            const side = name.startsWith("left_") ? 1 : -1;
            if (name.endsWith("hip_pitch_joint"))
              target = Math.sin(cycle) * amplitude * side;
            if (name.endsWith("knee_joint"))
              target = Math.max(0, Math.sin(cycle) * side) * amplitude * 1.8;
            if (name.endsWith("shoulder_pitch_joint"))
              target = -0.04 - Math.sin(cycle) * amplitude * side * 0.55;
            if (name.endsWith("elbow_joint")) target = 0.85 + gaitBlend * 0.08;
          } else if (robot.id === "go2") {
            const phase =
              name.startsWith("FL") || name.startsWith("RR") ? 1 : -1;
            if (name.endsWith("thigh_joint"))
              target = 0.65 + Math.sin(cycle) * amplitude * phase;
            if (name.endsWith("calf_joint"))
              target = -1.25 - Math.sin(cycle) * amplitude * phase;
          }
          if (j.jointType !== "continuous")
            target = Math.max(j.limit.lower, Math.min(j.limit.upper, target));
          const current = j.jointValue[0];
          model.setJointValue(
            name,
            current + (target - current) * (1 - Math.exp(-motionDt * 16)),
          );
        }
        if (footIK && !pauseRef.current && !document.hidden) {
          gaitEvidence = footIK.update(gaitTravel, gaitBlend);
        }
        if (task === "wheel-docking") {
          dock.traverse((node) => {
            const material = (node as THREE.Mesh).material as
              THREE.MeshBasicMaterial | undefined;
            if (material?.color)
              material.color.setHex(
                s.complete ? 0x39e7a4 : s.gate === 7 ? 0x69d5ff : 0x657482,
              );
          });
          container.dataset.dockingState = JSON.stringify({
            ...dockingFeedback(s),
            hold: s.dockingHold,
            target: DOCK_TARGET,
          });
        }
        gates.forEach(({ ring }, i) => {
          const material = ring.material as THREE.MeshStandardMaterial;
          material.color.setHex(
            i < s.gate ? 0x39e7a4 : i === s.gate ? 0xffa642 : 0x657482,
          );
          material.emissive.copy(material.color);
          material.emissiveIntensity = i <= s.gate ? 0.35 : 0.05;
        });
        if (s.elapsed < previousCameraTime) cameraTrack = null;
        previousCameraTime = s.elapsed;
        const cameraSample = stepDriveCamera(
          cameraTrack,
          s,
          height,
          cameraModeRef.current,
          dt,
          reducedMotion,
        );
        cameraTrack = cameraSample.state;
        const target = new THREE.Vector3(...cameraSample.target);
        camera.position.fromArray(cameraSample.eye);
        cameraLook.copy(target);
        container.dataset.cameraState = JSON.stringify({
          mode: cameraModeRef.current,
          reducedMotion,
          heading: s.heading,
          robot: [s.x, jumpHeight(s.jump), s.z],
          renderedYaw: carrier.rotation.y,
          eye: camera.position.toArray(),
          target: cameraLook.toArray(),
          orbitAngle: cameraTrack.angle,
          desiredAngle: cameraSample.desiredAngle,
          minimumBodyDistance: cameraSample.minimumBodyDistance,
        });
        camera.lookAt(cameraLook);
        lighting.fit(height, new THREE.Vector3(s.x, height * 0.5, s.z));
        // Presentation-only occlusion handling; gate crossing remains based on the unchanged course plane.
        const sight = target.clone().sub(camera.position);
        const sightLength = Math.max(0.001, sight.lengthSq());
        gates.forEach(({ group }, index) => {
          const gateCenter = group.getWorldPosition(new THREE.Vector3());
          const relative = gateCenter.clone().sub(camera.position);
          const along = relative.dot(sight) / sightLength;
          const perpendicular = relative
            .clone()
            .sub(sight.clone().multiplyScalar(along))
            .length();
          const close = Math.min(
            1,
            Math.max(0.08, (relative.length() - 1.8) / 2),
          );
          const obscures = along > 0 && along < 1.12 && perpendicular < 1.3;
          const opacity = Math.min(
            index < s.gate ? 0.06 : 1,
            close,
            obscures ? 0.12 : 1,
          );
          group.traverse((node) => {
            const drawable = node as THREE.Mesh;
            const materials = drawable.material
              ? Array.isArray(drawable.material)
                ? drawable.material
                : [drawable.material]
              : [];
            materials.forEach((m) => {
              m.transparent = true;
              m.opacity +=
                (opacity - m.opacity) * (1 - Math.exp(-Math.min(dt, 0.1) * 12));
              m.depthWrite = false;
            });
            if ((node as THREE.Sprite).isSprite) {
              const scale = Math.min(1, Math.max(0.2, relative.length() / 4));
              node.scale.set(0.7 * scale, 0.35 * scale, 1);
            }
          });
        });
        if (now - lastUI > 90) {
          lastUI = now;
          setSnapshot({ ...s });
          container.dataset.driveState = JSON.stringify(s);
          container.dataset.gaitEvidence = JSON.stringify({
            travel: gaitTravel,
            blend: gaitBlend,
            ...gaitEvidence,
          });
          container.dataset.renderedPose = JSON.stringify({
            x: carrier.position.x,
            y: carrier.position.y,
            z: carrier.position.z,
            yaw: carrier.rotation.y,
          });
        }
      }
      if (!document.hidden) renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener(
        "robot-radar-motion-preference",
        preferenceChanged,
      );
      keys.current.clear();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (material)
          (Array.isArray(material) ? material : [material]).forEach((m) => {
            const map = (m as THREE.MeshStandardMaterial).map;
            map?.dispose();
            m.dispose();
          });
      });
      gates.forEach((g) =>
        (g.group.userData.texture as THREE.Texture).dispose(),
      );
      lighting.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [robot.id, robot.urdfUrl, retry, task]);
  const press =
    (code: string) => (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      keys.current.add(code);
    };
  const release = (code: string) => () => keys.current.delete(code);
  if (task === "stationary")
    return (
      <section
        className="drive-experience drive-stationary"
        data-testid="drive-unavailable"
      >
        <div>
          <h2>{robot.name[lang]}</h2>
          <p>
            {t(
              "此机型使用操作实验，不参加移动试驾。",
              "This model uses manipulation labs, not mobile driving.",
            )}
          </p>
          <button onClick={onExit}>
            {t("返回实验室", "Return to laboratory")}
          </button>
        </div>
      </section>
    );
  const dockFeedback = dockingFeedback(snapshot);
  return (
    <section
      className="drive-experience"
      data-testid="drive-experience"
      data-task-kind={task}
    >
      <div className="drive-scene" ref={host} data-testid="drive-scene" />
      <header className="drive-top">
        <button onClick={onExit}>
          <ArrowLeft size={16} />
          {t("退出试驾", "Exit course")}
        </button>
        <div>
          <small>KINEMATIC PROVING GROUND</small>
          <h2>{robot.name[lang]}</h2>
        </div>
        <button onClick={reset} aria-label={t("重置试驾", "Reset course")}>
          <RotateCcw size={16} />R
        </button>
      </header>
      <button
        className="drive-camera-toggle"
        data-testid="drive-camera-toggle"
        onClick={toggleCamera}
        disabled={cameraReduced}
        aria-pressed={cameraMode === "follow"}
      >
        {cameraMode === "follow"
          ? t("镜头：行进跟随", "Camera: heading follow")
          : t("镜头：固定场地", "Camera: field view")}
        {cameraReduced && <small>{t("减少动态效果", "Reduced motion")}</small>}
      </button>
      <div className="drive-boundary" data-testid="drive-boundary">
        {task === "wheel-docking"
          ? t(
              "轮式路线与精确停靠：运动学位姿任务，不计算轮地滚动、滑移、接触或碰撞；不提供跳跃，不代表实机性能或硬件控制。",
              "Wheeled route and precision docking: kinematic poses, no wheel-ground rolling, slip, contact or collision solving. No jump; not real performance or hardware control.",
            )
          : t(
              "腿式路线与示意跨越：运动学模拟，不计算平衡、接触或碰撞；跳跃仅为示意，不代表实机性能或硬件控制。",
              "Legged route with illustrative crossing: kinematic only, without balance, contact or collision solving. Jumping is illustrative, not real performance or hardware control.",
            )}
        {["arm", "hand", "gripper"].includes(robot.form) && (
          <span>
            {t(
              "机械臂、机械手或夹爪随教学载台平移，不表示它具有移动底盘或行走能力。",
              "The arm, hand or gripper moves on a teaching carrier; this is not a mobile base or walking capability.",
            )}
          </span>
        )}
      </div>
      <aside className="drive-hud">
        <div className="drive-goal">
          <Flag size={20} />
          <span>
            {snapshot.complete
              ? t("路线完成", "COURSE COMPLETE")
              : task === "wheel-docking" && snapshot.gate === 7
                ? t("精确停靠", "PRECISION DOCK")
                : `${t("目标门", "GATE")} ${Math.min(7, snapshot.gate + 1)} / 7`}
          </span>
        </div>
        <div className="drive-gate-dots">
          {DRIVE_GATES.map((_, i) => (
            <i
              key={i}
              className={
                i < snapshot.gate
                  ? "done"
                  : i === snapshot.gate
                    ? "current"
                    : ""
              }
            >
              {i < snapshot.gate ? <Check size={11} /> : i + 1}
            </i>
          ))}
        </div>
        <dl>
          <div>
            <dt>{t("演示速度", "SCENE SPEED")}</dt>
            <dd data-testid="drive-speed">
              {Math.abs(snapshot.speed).toFixed(1)}
              <small>m/s</small>
            </dd>
          </div>
          <div>
            <dt>{t("场景距离", "SCENE DISTANCE")}</dt>
            <dd data-testid="drive-distance">
              {snapshot.distance.toFixed(1)}
              <small>m</small>
            </dd>
          </div>
          <div>
            <dt>{t("用时", "TIME")}</dt>
            <dd>
              {snapshot.elapsed.toFixed(1)}
              <small>s</small>
            </dd>
          </div>
          <div>
            <dt>
              {task === "wheel-docking"
                ? t("停靠距离", "DOCK DISTANCE")
                : t("示意跳跃", "DEMO JUMP")}
            </dt>
            <dd>
              {(task === "wheel-docking"
                ? dockFeedback.distance
                : snapshot.bestJump
              ).toFixed(2)}
              <small>m</small>
            </dd>
          </div>
        </dl>
        {task === "wheel-docking" && (
          <div className="drive-docking" data-testid="drive-docking">
            <strong>{t("轮式精确停靠", "Wheeled precision dock")}</strong>
            <span>
              {t("朝向误差", "Heading error")}:{" "}
              {((dockFeedback.angle * 180) / Math.PI).toFixed(0)}°
            </span>
            <progress
              aria-label={t("停稳进度", "Stable stop progress")}
              value={snapshot.dockingHold}
              max={DOCK_TARGET.holdSeconds}
            />
            <small>
              {snapshot.gate < 7
                ? t(
                    "先依次通过七门，再停入蓝色箭头区。",
                    "Clear seven gates, then stop in the blue arrow zone.",
                  )
                : t(
                    "距离≤0.45m、朝向≤10°、低速且停止转向，连续1.2秒。",
                    "Within 0.45m and 10°, low speed and no turn, for 1.2 seconds.",
                  )}
            </small>
          </div>
        )}
        <svg
          className="drive-map"
          viewBox="-10 -12 16 18"
          aria-label={t("路线地图", "Course map")}
        >
          <polyline
            points={"0,0 " + DRIVE_GATES.map((g) => `${g.x},${g.z}`).join(" ")}
            fill="none"
            stroke="#526d7c"
            strokeWidth=".12"
            strokeDasharray=".3 .3"
          />
          {DRIVE_GATES.map((g, i) => (
            <g key={i}>
              <circle
                cx={g.x}
                cy={g.z}
                r=".45"
                fill={
                  i < snapshot.gate
                    ? "#38d99c"
                    : i === snapshot.gate
                      ? "#ff9b36"
                      : "#52616e"
                }
              />
              <text
                x={g.x}
                y={g.z + 0.12}
                textAnchor="middle"
                fontSize=".45"
                fill="#10202b"
              >
                {i + 1}
              </text>
            </g>
          ))}
          {task === "wheel-docking" && (
            <circle
              cx={DOCK_TARGET.x}
              cy={DOCK_TARGET.z}
              r=".45"
              fill="none"
              stroke="#69d5ff"
              strokeWidth=".12"
            />
          )}
          <circle cx={snapshot.x} cy={snapshot.z} r=".3" fill="#e8f7ff" />
          <path
            d="M 0 -.65 L -.3 -.15 L .3 -.15 Z"
            fill="#e8f7ff"
            transform={`translate(${snapshot.x},${snapshot.z}) rotate(${(snapshot.heading * 180) / Math.PI})`}
          />
        </svg>
        <p>
          {t(
            "沿虚线依次穿过橙色目标门；绿色表示已通过。",
            "Follow the dashed route through each orange gate. Green means cleared.",
          )}
        </p>
      </aside>
      <div className="drive-controls">
        <div className="drive-keypad">
          <button
            aria-label={t("向前", "Forward")}
            onPointerDown={press("KeyW")}
            onPointerUp={release("KeyW")}
            onPointerCancel={release("KeyW")}
          >
            <ArrowUp size={18} />
            <small>W</small>
          </button>
          <div>
            {[
              ["KeyA", ArrowLeft, "A"],
              ["KeyS", ArrowDown, "S"],
              ["KeyD", ArrowRight, "D"],
            ].map(([code, Icon, label]) => {
              const I = Icon as typeof ArrowLeft;
              return (
                <button
                  key={code as string}
                  aria-label={label as string}
                  onPointerDown={press(code as string)}
                  onPointerUp={release(code as string)}
                  onPointerCancel={release(code as string)}
                >
                  <I size={18} />
                  <small>{label as string}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="drive-actions">
          {task === "leg-route" && (
            <button
              onClick={jump}
              disabled={status !== "ready" || paused || snapshot.complete}
            >
              {t("跳跃演示", "Jump demo")}
              <kbd>SPACE</kbd>
            </button>
          )}
          <button
            onPointerDown={press("ShiftLeft")}
            onPointerUp={release("ShiftLeft")}
            onPointerCancel={release("ShiftLeft")}
          >
            {t("加速", "Faster")}
            <kbd>SHIFT</kbd>
          </button>
          <button onClick={togglePause}>
            {paused ? <Play size={14} /> : <Pause size={14} />}{" "}
            {paused ? t("继续", "Resume") : t("暂停", "Pause")}
          </button>
        </div>
        <p>
          {task === "wheel-docking"
            ? t(
                "W/S 前后 · A/D 转向 · Shift 加速 · R 重置；松键减速停稳",
                "W/S move · A/D turn · Shift faster · R reset; release to slow and stop",
              )
            : t(
                "W/S 前后 · A/D 转向 · Shift 加速 · Space 示意跨越 · R 重置",
                "W/S move · A/D turn · Shift faster · Space illustrative jump · R reset",
              )}
        </p>
      </div>
      {status !== "ready" && (
        <div className="drive-overlay">
          <strong>
            {status === "loading"
              ? t("正在载入官方模型…", "Loading official model…")
              : t("模型加载失败", "Model load failed")}
          </strong>
          {status === "error" && (
            <>
              <small>{detail}</small>
              <button onClick={() => setRetry((v) => v + 1)}>
                {t("重试", "Retry")}
              </button>
            </>
          )}
        </div>
      )}
      {paused && status === "ready" && !snapshot.complete && (
        <div className="drive-paused">
          <strong>{t("已暂停", "PAUSED")}</strong>
          <button onClick={togglePause}>
            {t("继续试驾", "Resume course")}
          </button>
        </div>
      )}
      {snapshot.complete && (
        <div className="drive-complete">
          <Check size={36} />
          <h2>
            {task === "wheel-docking"
              ? t("路线＋精确停靠完成", "ROUTE + DOCK COMPLETE")
              : t("7 / 7 路线完成", "7 / 7 COURSE COMPLETE")}
          </h2>
          <p>
            {snapshot.elapsed.toFixed(1)} s · {snapshot.distance.toFixed(1)} m
          </p>
          <p>
            {t(
              "你完成的是运动学教学任务，不是实机性能认证。",
              "This completes a kinematic learning task, not real-robot certification.",
            )}
          </p>
          <button onClick={reset}>{t("再试一次", "Try again")}</button>
        </div>
      )}
    </section>
  );
}
