import { withObjMeshSupport } from "./urdfMeshLoader";
import { applyExplode } from "../core/explode";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  installPhotographicLighting,
  photographicMaterial,
  collectMaterialTextures,
} from "./realism";
import { siteAsset } from "../siteAssets";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader, { URDFRobot } from "urdf-loader";
import type { Lang, ModelInfo } from "../types";
import { isMimicJoint } from "../core/urdf";

type Props = {
  url: string;
  lang: Lang;
  selected: string | null;
  highlighted?: string[];
  focusToken?: number;
  viewToken?: number;
  hidden: string[];
  jointValues: Record<string, number>;
  explode: number;
  view: string;
  onSelect: (part: string | null) => void;
  onLoaded: (info: ModelInfo) => void;
  resetToken: number;
  ignoreJointLimits?: boolean;
};
/** Procedural studio scenery. None of these objects are robot parts or physical claims. */
function createWorkshop(): THREE.Group {
  const room = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({
    color: 0x465158,
    emissive: 0x152027,
    emissiveIntensity: 0.3,
    metalness: 0.55,
    roughness: 0.55,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x293238,
    emissive: 0x142028,
    emissiveIntensity: 0.22,
    metalness: 0.35,
    roughness: 0.6,
  });
  const orange = new THREE.MeshStandardMaterial({
    color: 0xb7501c,
    metalness: 0.45,
    roughness: 0.52,
  });
  const pale = new THREE.MeshStandardMaterial({
    color: 0x9da8a8,
    metalness: 0.4,
    roughness: 0.55,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xc6ebf4,
    emissive: 0xa4dce8,
    emissiveIntensity: 1.5,
  });
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.08),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    room.add(mesh);
    return mesh;
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#474949";
  ctx.fillRect(0, 0, 1024, 1024);
  let seed = 7391;
  for (let i = 0; i < 20000; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % 1024;
    seed = (seed * 16807) % 2147483647;
    const y = seed % 1024;
    ctx.fillStyle = i % 2 ? "rgba(230,225,210,.035)" : "rgba(0,0,0,.035)";
    ctx.fillRect(x, y, 1 + (i % 3), 1);
  }
  // Fixed engineering-grid and inset bay markings, not random texture flicker.
  ctx.strokeStyle = "#555858";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 1024; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }
  ctx.strokeStyle = "#9ca998";
  ctx.lineWidth = 3;
  ctx.strokeRect(390, 390, 244, 244);
  ctx.strokeStyle = "#c88435";
  ctx.lineWidth = 5;
  ctx.strokeRect(372, 372, 280, 280);
  ctx.strokeStyle = "#748185";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(512, 512, 88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#a1aaac";
  ctx.font = "bold 17px monospace";
  ctx.fillText("ROBOT RADAR / LAB", 401, 676);
  ctx.fillStyle = "#929d9c";
  ctx.font = "12px monospace";
  ctx.fillText("OBSERVATION BAY 01", 417, 694);
  const floorTexture = new THREE.CanvasTexture(canvas);
  floorTexture.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({
      map: floorTexture,
      roughness: 0.68,
      metalness: 0.08,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.studyFloor = true;
  room.add(floor);
  room.userData.textures = [floorTexture];
  // Corrugated rear wall and structural uprights frame the subject without occlusion.
  box(0, 1.55, -3.4, 10, 3.1, 0.12, dark);
  for (let x = -4.8; x < 5; x += 0.25)
    box(x, 1.65, -3.3, 0.045, 2.9, 0.06, steel);
  for (const x of [-4, -2, 2, 4]) {
    box(x, 1.6, -3.12, 0.12, 3.2, 0.18, steel);
    box(x, 0.22, -3.03, 0.15, 0.42, 0.12, orange);
  }
  box(0, 2.95, -3.05, 9.6, 0.12, 0.18, steel);
  for (const x of [-3, 0, 3]) box(x, 2.88, -2.93, 1.45, 0.025, 0.06, glow);
  // Low workshop cabinets and a restrained workbench sit behind the viewing bay.
  for (const x of [-2.7, 2.7]) {
    box(x, 0.39, -2.05, 0.85, 0.76, 0.45, x < 0 ? steel : orange);
    box(x, 0.8, -2.05, 0.94, 0.06, 0.5, dark);
    for (let i = 0; i < 5; i++) {
      box(
        x,
        0.16 + i * 0.125,
        -1.815,
        0.74,
        0.09,
        0.022,
        x < 0 ? dark : orange,
      );
      box(x, 0.19 + i * 0.125, -1.792, 0.48, 0.012, 0.015, pale);
    }
  }
  box(0, 0.82, -2.55, 2.2, 0.08, 0.6, steel);
  for (const x of [-0.96, 0.96]) box(x, 0.4, -2.55, 0.055, 0.8, 0.5, dark);
  box(-0.6, 0.98, -2.6, 0.38, 0.24, 0.24, dark);
  box(0.58, 0.91, -2.55, 0.35, 0.11, 0.28, pale);
  // Side service racks add depth while keeping the central silhouette uncluttered.
  for (const x of [-3.9]) {
    box(x, 0.72, -1.15, 0.6, 1.44, 0.62, dark);
    for (let y = 0.2; y < 1.4; y += 0.2) {
      box(x, y, -0.825, 0.5, 0.12, 0.025, steel);
      box(x - 0.18, y, -0.807, 0.018, 0.02, 0.008, glow);
    }
  }
  return room;
}
export default function RobotViewer(props: Props) {
  const leapPresentation = /\/leap_hand\/robot\.urdf(?:[?#]|$)/.test(props.url);
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<{
    invalidate: () => void;
    robot: URDFRobot;
    controls: OrbitControls;
    camera: THREE.PerspectiveCamera;
    center: THREE.Vector3;
    radius: number;
    explodeTargetSphere?: THREE.Sphere;
    originals: Map<THREE.Object3D, THREE.Vector3>;
    workshop: THREE.Group;
    study: THREE.Group;
    updateStudy: () => void;
  } | null>(null);
  const cameraTransition = useRef<{
    from: THREE.Vector3;
    to: THREE.Vector3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
    started: number;
  } | null>(null);
  const moveCamera = (position: THREE.Vector3, target: THREE.Vector3) => {
    const r = runtime.current;
    if (!r) return;
    if (document.documentElement.dataset.reducedMotion === "true") {
      cameraTransition.current = null;
      if (host.current) host.current.dataset.cameraTransition = "false";
      r.camera.position.copy(position);
      r.controls.target.copy(target);
      r.controls.update();
    } else {
      if (host.current) host.current.dataset.cameraTransition = "true";
      cameraTransition.current = {
        from: r.camera.position.clone(),
        to: position.clone(),
        targetFrom: r.controls.target.clone(),
        targetTo: target.clone(),
        started: performance.now(),
      };
    }
  };
  const callbacks = useRef(props);
  callbacks.current = props;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [detail, setDetail] = useState("");
  useEffect(() => {
    if (!host.current || !props.url) return;
    const element = host.current;
    let disposed = false;
    let frame = 0;
    const ownedTextures = new Set<THREE.Texture>();
    let dirty = true;
    let renderedFrames = 0;
    const invalidate = () => {
      dirty = true;
    };
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#10171b");
    scene.fog = new THREE.Fog("#10171b", 10, 30);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    element.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    const cancelTransition = () => {
      cameraTransition.current = null;
    };
    const preferenceChanged = () => {
      const reduced = document.documentElement.dataset.reducedMotion === "true";
      controls.enableDamping = !reduced;
      element.dataset.reducedMotion = String(reduced);
      const transition = cameraTransition.current;
      if (reduced && transition) {
        camera.position.copy(transition.to);
        controls.target.copy(transition.targetTo);
        cameraTransition.current = null;
        controls.update();
      }
    };
    preferenceChanged();
    controls.addEventListener("start", cancelTransition);
    controls.addEventListener("change", invalidate);
    window.addEventListener("robot-radar-motion-preference", preferenceChanged);
    controls.minDistance = 0.15;
    controls.maxDistance = 15;
    const photography = installPhotographicLighting(scene, renderer, {
      deferEnvironment: true,
    });
    // A presentation environment, deliberately separate from the sourced robot geometry.
    const workshop = createWorkshop();
    scene.add(workshop);
    const study = new THREE.Group();
    scene.add(study);
    const clearStudy = () => {
      study.traverse((node) => {
        const object = node as THREE.Mesh;
        object.geometry?.dispose();
        if (object.material)
          (Array.isArray(object.material)
            ? object.material
            : [object.material]
          ).forEach((material) => {
            const map = (material as THREE.SpriteMaterial).map;
            map?.dispose();
            material.dispose();
          });
      });
      study.clear();
    };
    const observer = new ResizeObserver(() => {
      const w = element.clientWidth;
      const h = element.clientHeight;
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      invalidate();
    });
    observer.observe(element);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(siteAsset);
    let failed = false;
    let pendingMeshes = 0;
    let robotParsed = false;
    let finalized = false;
    manager.onProgress = (_, loaded, total) => {
      if (!disposed) setDetail(`${loaded} / ${total}`);
    };
    manager.onError = (url) => {
      failed = true;
      if (!disposed) {
        setDetail(url.split("/").pop() || url);
        setStatus("error");
      }
    };
    const finalizeModel = () => {
      if (
        !disposed &&
        !failed &&
        !finalized &&
        robotParsed &&
        pendingMeshes === 0 &&
        runtime.current
      ) {
        finalized = true;
        const robot = runtime.current.robot;
        robot.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            (Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material]
            ).forEach((material) =>
              collectMaterialTextures(material, ownedTextures),
            );
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map(photographicMaterial)
              : photographicMaterial(mesh.material);
            runtime.current!.originals.set(node, node.position.clone());
          }
        });
        robot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(robot);
        const size = box.getSize(new THREE.Vector3());
        if (
          box.isEmpty() ||
          !Number.isFinite(box.min.y) ||
          !Number.isFinite(size.length()) ||
          size.length() === 0
        ) {
          failed = true;
          setStatus("error");
          setDetail("No finite visual geometry loaded");
          return;
        }
        robot.position.y -= box.min.y;
        // LEAP is displayed upright and suspended so curling fingertips cannot
        // disappear behind the decorative floor. This is a rigid presentation
        // transform, not a source-joint edit or physical support/contact model.
        if (leapPresentation)
          robot.position.y += Math.max(size.length(), 0.3) * 0.8;
        element.dataset.presentation = leapPresentation
          ? "hand-upright-suspended"
          : "source-grounded";
        const center = new THREE.Box3()
          .setFromObject(robot)
          .getCenter(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 0.3);
        workshop.scale.setScalar(radius);
        photography.prepareEnvironment();
        photography.fit(radius, center);
        element.dataset.renderPipeline = "pbr-studio";
        runtime.current.center.copy(center);
        runtime.current.radius = radius;
        element.dataset.modelBounds = JSON.stringify({
          size: size.toArray(),
          center: center.toArray(),
          position: robot.position.toArray(),
          meshCount: runtime.current.originals.size,
        });
        camera.position
          .copy(center)
          .add(new THREE.Vector3(radius * 1.9, radius * 0.5, radius * 1.3));
        controls.target.copy(center);
        controls.update();
        invalidate();
        setStatus("ready");
      }
    };
    manager.onLoad = finalizeModel;
    setStatus("loading");
    setDetail("");
    runtime.current = null;
    const loader = new URDFLoader(manager);
    // Imported URDF files use root-relative mesh URLs; avoid prefixing their directory twice.
    loader.workingPath = window.location.origin;
    loader.parseCollision = false;
    // LoadingManager may finish early for in-flight URLs shared by another loader.
    // Track callbacks belonging to this robot, including StrictMode/remount loads.
    const defaultMeshLoader = withObjMeshSupport(
      loader.loadMeshCb.bind(loader),
    );
    loader.loadMeshCb = (path, loadingManager, done) => {
      pendingMeshes += 1;
      defaultMeshLoader(path, loadingManager, (object, error) => {
        done(object, error);
        pendingMeshes -= 1;
        if (error) {
          failed = true;
          if (!disposed) {
            setStatus("error");
            setDetail(String(error));
          }
        }
        queueMicrotask(finalizeModel);
      });
    };
    loader.load(
      props.url,
      (robot) => {
        if (disposed) return;
        if (leapPresentation) robot.rotation.set(0, 0, Math.PI / 2);
        else robot.rotation.x = -Math.PI / 2;
        const originals = new Map<THREE.Object3D, THREE.Vector3>();
        robot.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            const mesh = node as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.material = Array.isArray(mesh.material)
              ? mesh.material.map((m) => m.clone())
              : mesh.material.clone();
            originals.set(node, node.position.clone());
          }
        });
        scene.add(robot);
        runtime.current = {
          invalidate,
          robot,
          controls,
          camera,
          center: new THREE.Vector3(0, 0.5, 0),
          radius: 1,
          originals,
          workshop,
          study,
          updateStudy: () => {},
        };
        const joints = Object.entries(robot.joints)
          .filter(([, j]) => j.jointType !== "fixed" && !isMimicJoint(j))
          .map(([name, j]) => ({
            name,
            type: j.jointType,
            lower: j.jointType === "continuous" ? -Math.PI : j.limit.lower,
            upper: j.jointType === "continuous" ? Math.PI : j.limit.upper,
            value: j.jointValue[0] || 0,
          }));
        callbacks.current.onLoaded({ parts: Object.keys(robot.links), joints });
        robotParsed = true;
        queueMicrotask(finalizeModel);
      },
      undefined,
      (error) => {
        if (!disposed) {
          setStatus("error");
          setDetail(String(error));
        }
      },
    );
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const select = (e: PointerEvent) => {
      if (
        !runtime.current ||
        Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5
      )
        return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObject(runtime.current.robot, true)
        .find((h) => {
          let n: THREE.Object3D | null = h.object;
          while (n) {
            if (!n.visible) return false;
            n = n.parent;
          }
          return true;
        });
      let node: THREE.Object3D | null = hit?.object || null;
      while (
        node &&
        !(node as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink
      )
        node = node.parent;
      callbacks.current.onSelect(node?.name || null);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", select);
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (!document.hidden) {
        const transition = cameraTransition.current;
        if (transition) {
          invalidate();
          const progress = Math.min(
            1,
            (performance.now() - transition.started) / 420,
          );
          const ease = progress * progress * (3 - 2 * progress);
          camera.position.lerpVectors(transition.from, transition.to, ease);
          controls.target.lerpVectors(
            transition.targetFrom,
            transition.targetTo,
            ease,
          );
          if (progress === 1) cameraTransition.current = null;
        }
        element.dataset.cameraTransition = String(!!cameraTransition.current);
        controls.update();
        if (dirty && finalized) {
          runtime.current?.updateStudy();
          renderer.render(scene, camera);
          if (
            runtime.current &&
            Number(
              element.dataset.explodeEvidence
                ? JSON.parse(element.dataset.explodeEvidence).amount
                : 0,
            ) > 0
          ) {
            const bounds = new THREE.Box3().setFromObject(
              runtime.current.robot,
            );
            const projected = [];
            for (const x of [bounds.min.x, bounds.max.x])
              for (const y of [bounds.min.y, bounds.max.y])
                for (const z of [bounds.min.z, bounds.max.z])
                  projected.push(
                    new THREE.Vector3(x, y, z).project(camera).toArray(),
                  );
            element.dataset.explodeProjection = JSON.stringify(projected);
          }
          dirty = false;
          element.dataset.renderFrames = String(++renderedFrames);
          element.dataset.renderResources = JSON.stringify(
            renderer.info.memory,
          );
        }
      }
    };
    animate();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      cameraTransition.current = null;
      controls.removeEventListener("start", cancelTransition);
      controls.removeEventListener("change", invalidate);
      window.removeEventListener(
        "robot-radar-motion-preference",
        preferenceChanged,
      );
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", select);
      clearStudy();
      scene.traverse((n) => {
        const mesh = n as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]
          ).forEach((m) => {
            collectMaterialTextures(m, ownedTextures);
            m.dispose();
          });
        }
      });
      (workshop.userData.textures as THREE.Texture[]).forEach((texture) =>
        ownedTextures.add(texture),
      );
      ownedTextures.forEach((texture) => texture.dispose());
      photography.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, [props.url, props.resetToken]);
  // React updates cover joint pose, visibility, selections, focus, explode and status.
  // The RAF stays alive for OrbitControls damping and camera transitions; only dirty scenes draw.
  useEffect(() => {
    runtime.current?.invalidate();
  });
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    Object.values(r.robot.joints).forEach((joint) => {
      joint.ignoreLimits = props.ignoreJointLimits ?? false;
    });
    Object.entries(r.robot.joints).forEach(([name, joint]) => {
      if (joint.jointType !== "fixed" && !isMimicJoint(joint))
        r.robot.setJointValue(
          name,
          props.jointValues[name] ??
            Math.min(joint.limit.upper, Math.max(joint.limit.lower, 0)),
        );
    });
    if (host.current)
      host.current.dataset.jointState = JSON.stringify(
        Object.fromEntries(
          Object.entries(r.robot.joints)
            .filter(([, joint]) => joint.jointType !== "fixed")
            .map(([name, joint]) => [name, joint.jointValue[0]]),
        ),
      );
    if (host.current && leapPresentation) {
      r.robot.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(r.robot);
      host.current.dataset.handPoseBounds = JSON.stringify({
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
        floorY: 0,
      });
    } else if (host.current) delete host.current.dataset.handPoseBounds;
  }, [props.jointValues, props.ignoreJointLimits, status]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    Object.entries(r.robot.links).forEach(([name, link]) => {
      link.visible = true;
    });
    const visibleSourceLinks = new Set<string>();
    r.robot.traverse((n) => {
      if (!(n as THREE.Mesh).isMesh) return;
      let p: THREE.Object3D | null = n;
      while (p && !(p as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink)
        p = p.parent;
      n.visible = !p || !props.hidden.includes(p.name);
      if (n.visible && p) visibleSourceLinks.add(p.name);
      const match =
        !!p &&
        (p.name === props.selected || !!props.highlighted?.includes(p.name));
      const m = (n as THREE.Mesh).material;
      (Array.isArray(m) ? m : [m]).forEach((mat) => {
        if (
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshStandardMaterial
        ) {
          mat.emissive.set(match ? 0xd66a25 : 0x000000);
          mat.emissiveIntensity = match ? 0.45 : 0;
        }
      });
    });
    if (host.current)
      host.current.dataset.visibleSourceLinks = JSON.stringify(
        [...visibleSourceLinks].sort(),
      );
  }, [props.selected, props.highlighted, props.hidden, status]);
  useEffect(() => {
    const current = runtime.current;
    if (!current || !props.focusToken) return;
    const ids = new Set(
      props.highlighted?.length
        ? props.highlighted
        : props.selected
          ? [props.selected]
          : [],
    );
    const bounds = new THREE.Box3();
    current.robot.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh) return;
      let parent: THREE.Object3D | null = node;
      while (
        parent &&
        !(parent as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink
      )
        parent = parent.parent;
      if (parent && ids.has(parent.name))
        bounds.union(new THREE.Box3().setFromObject(node));
    });
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const direction = current.camera.position
      .clone()
      .sub(current.controls.target)
      .normalize();
    const distance = Math.max(
      0.15,
      (sphere.radius /
        Math.sin(THREE.MathUtils.degToRad(current.camera.fov / 2))) *
        1.15,
    );
    moveCamera(
      sphere.center.clone().addScaledVector(direction, distance),
      sphere.center,
    );
  }, [props.focusToken, status]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const expanded = props.explode > 0;
    r.workshop.children.forEach((node) => {
      node.visible = !expanded || node.userData.studyFloor === true;
    });
    if (!expanded) {
      r.invalidate();
      return;
    }
    const floorMesh = r.workshop.children.find(
      (node) => node.userData.studyFloor,
    ) as THREE.Mesh;
    const floorMaterial = floorMesh.material as THREE.MeshStandardMaterial;
    const floorMap = floorMaterial.map;
    const floorShadow = floorMesh.receiveShadow;
    floorMesh.receiveShadow = false;
    const floorColor = floorMaterial.color.clone();
    floorMaterial.map = null;
    floorMaterial.color.setHex(0x414849);
    floorMaterial.needsUpdate = true;
    // Source-link adjacency, NOT wiring or a mechanical removal sequence.
    const meshes = new Map<THREE.Object3D, THREE.Object3D[]>();
    r.originals.forEach((_, mesh) => {
      let link: THREE.Object3D | null = mesh.parent;
      while (
        link &&
        !(link as THREE.Object3D & { isURDFLink?: boolean }).isURDFLink
      )
        link = link.parent;
      if (link) meshes.set(link, [...(meshes.get(link) || []), mesh]);
    });
    const center = (link: THREE.Object3D) => {
      const box = new THREE.Box3();
      for (const mesh of meshes.get(link) || [])
        if (mesh.visible) box.expandByObject(mesh);
      return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
    };
    const edges: {
      child: THREE.Object3D;
      parent: THREE.Object3D;
      line: THREE.Line;
    }[] = [];
    meshes.forEach((_, child) => {
      let parent = child.parent;
      while (parent && !meshes.has(parent)) parent = parent.parent;
      if (!parent) return;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
        ]),
        new THREE.LineDashedMaterial({
          color: 0x8ac6c8,
          transparent: true,
          opacity: 0.42,
          dashSize: r.radius * 0.035,
          gapSize: r.radius * 0.025,
          depthWrite: false,
        }),
      );
      line.raycast = () => {};
      r.study.add(line);
      edges.push({ child, parent, line });
    });
    const zh = props.lang === "zh";
    const names: [string, string][] = r.robot.links.left_shoulder_pitch_link
      ? [
          ["left_elbow_link", zh ? "左臂" : "LEFT ARM"],
          ["right_elbow_link", zh ? "右臂" : "RIGHT ARM"],
          ["left_knee_link", zh ? "左腿" : "LEFT LEG"],
          ["right_knee_link", zh ? "右腿" : "RIGHT LEG"],
        ]
      : [
          ["FL_thigh", zh ? "左前腿" : "FRONT LEFT"],
          ["FR_thigh", zh ? "右前腿" : "FRONT RIGHT"],
          ["RL_thigh", zh ? "左后腿" : "REAR LEFT"],
          ["RR_thigh", zh ? "右后腿" : "REAR RIGHT"],
        ];
    const labels = names.flatMap(([name, text]) => {
      const link = r.robot.links[name];
      if (!link || !meshes.has(link)) return [];
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "rgba(13,27,32,.88)";
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = "#d1eeee";
      ctx.font = "500 38px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 256, 48);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
          depthWrite: false,
          transparent: true,
        }),
      );
      sprite.scale.set(r.radius * 0.58, r.radius * 0.109, 1);
      sprite.raycast = () => {};
      r.study.add(sprite);
      return [{ link, sprite }];
    });
    r.updateStudy = () => {
      r.robot.updateMatrixWorld(true);
      for (const { child, parent, line } of edges) {
        const a = center(child),
          b = center(parent);
        line.visible = !!a && !!b;
        if (a && b) {
          const points = line.geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute;
          points.setXYZ(0, a.x, a.y, a.z);
          points.setXYZ(1, b.x, b.y, b.z);
          points.needsUpdate = true;
          line.geometry.computeBoundingSphere();
          line.computeLineDistances();
        }
      }
      for (const { link, sprite } of labels) {
        const point = center(link);
        sprite.visible = !!point;
        if (point)
          sprite.position
            .copy(point)
            .add(
              new THREE.Vector3(0, r.radius * 0.24, 0).applyQuaternion(
                r.camera.quaternion,
              ),
            );
      }
    };
    r.invalidate();
    return () => {
      r.updateStudy = () => {};
      floorMaterial.map = floorMap;
      floorMesh.receiveShadow = floorShadow;
      floorMaterial.color.copy(floorColor);
      floorMaterial.needsUpdate = true;
      edges.forEach(({ line }) => {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        r.study.remove(line);
      });
      labels.forEach(({ sprite }) => {
        sprite.material.map?.dispose();
        sprite.material.dispose();
        r.study.remove(sprite);
      });
      r.workshop.children.forEach((node) => {
        node.visible = true;
      });
    };
  }, [props.explode > 0, props.lang, status]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const previous = new Map(
      [...r.originals.keys()].map((node) => [node, node.position.clone()]),
    );
    applyExplode(r.robot, r.originals, r.center, 0);
    const floor = new THREE.Box3().setFromObject(r.robot).min.y;
    applyExplode(
      r.robot,
      r.originals,
      r.center,
      props.explode * r.radius * 0.32,
    );
    if (props.explode > 0) {
      const box = new THREE.Box3().setFromObject(r.robot);
      const lift = Math.max(0, floor - box.min.y);
      if (lift > 0) {
        const targets = [...r.originals.keys()]
          .filter((node) => {
            let parent = node.parent;
            while (parent && parent !== r.robot) {
              if (r.originals.has(parent)) return false;
              parent = parent.parent;
            }
            return true;
          })
          .map((node) => ({
            node,
            target: node
              .getWorldPosition(new THREE.Vector3())
              .add(new THREE.Vector3(0, lift, 0)),
          }));
        targets.forEach(({ node, target }) =>
          node.position.copy(
            node.parent ? node.parent.worldToLocal(target) : target,
          ),
        );
        r.robot.updateMatrixWorld(true);
      }
      const sphere = new THREE.Box3()
        .setFromObject(r.robot)
        .getBoundingSphere(new THREE.Sphere());
      // Snapshot the FINAL layout before its mesh animation starts. Preset clicks
      // during separation must not fit transient, smaller geometry bounds.
      r.explodeTargetSphere = sphere.clone();
      const direction = r.camera.position
        .clone()
        .sub(r.controls.target)
        .normalize();
      const halfFov = Math.min(
        THREE.MathUtils.degToRad(r.camera.fov / 2),
        Math.atan(
          Math.tan(THREE.MathUtils.degToRad(r.camera.fov / 2)) *
            r.camera.aspect,
        ),
      );
      const distance = (sphere.radius / Math.sin(halfFov)) * 1.15;
      moveCamera(
        sphere.center.clone().addScaledVector(direction, distance),
        sphere.center,
      );
    }
    if (props.explode === 0) r.explodeTargetSphere = undefined;
    if (host.current)
      host.current.dataset.explodeEvidence = JSON.stringify({
        amount: props.explode,
        floor,
        minY: new THREE.Box3().setFromObject(r.robot).min.y,
        positions: [...r.originals.keys()].map((node) =>
          node.position.toArray(),
        ),
      });
    const targets = new Map(
      [...r.originals.keys()].map((node) => [node, node.position.clone()]),
    );
    if (document.documentElement.dataset.reducedMotion === "true") {
      r.invalidate();
      return;
    }
    const started = performance.now();
    let animation = 0;
    const animateSeparation = () => {
      const progress = Math.min(1, (performance.now() - started) / 360);
      const eased = progress * progress * (3 - 2 * progress);
      targets.forEach((target, node) =>
        node.position.lerpVectors(previous.get(node) || target, target, eased),
      );
      r.robot.updateMatrixWorld(true);
      r.invalidate();
      if (progress < 1) animation = requestAnimationFrame(animateSeparation);
    };
    animation = requestAnimationFrame(animateSeparation);
    return () => cancelAnimationFrame(animation);
  }, [props.explode, status]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const dirs: Record<string, number[]> = {
      hero: [1.9, 0.5, 1.3],
      iso: [1.7, 1.5, 1.7],
      front: [2.4, 0.1, 0],
      side: [0, 0.1, 2.4],
      back: [-2.4, 0.1, 0],
      top: [0, 2.4, 0.01],
    };
    const d = dirs[props.view] || dirs.hero;
    if (props.explode > 0) {
      const sphere =
        r.explodeTargetSphere?.clone() ||
        new THREE.Box3()
          .setFromObject(r.robot)
          .getBoundingSphere(new THREE.Sphere());
      const halfFov = Math.min(
        THREE.MathUtils.degToRad(r.camera.fov / 2),
        Math.atan(
          Math.tan(THREE.MathUtils.degToRad(r.camera.fov / 2)) *
            r.camera.aspect,
        ),
      );
      moveCamera(
        sphere.center
          .clone()
          .addScaledVector(
            new THREE.Vector3(...d).normalize(),
            (sphere.radius / Math.sin(halfFov)) * 1.15,
          ),
        sphere.center,
      );
    } else {
      moveCamera(
        r.center.clone().add(new THREE.Vector3(...d).multiplyScalar(r.radius)),
        r.center,
      );
    }
  }, [props.view, props.viewToken, status]);
  return (
    <div className="viewer" ref={host}>
      {props.explode > 0 && status === "ready" && (
        <div
          style={{
            position: "absolute",
            top: 130,
            left: 14,
            pointerEvents: "none",
            fontSize: 11,
            color: "#c5dfe0",
            background: "rgba(13,27,32,.8)",
            padding: "7px 10px",
            borderRadius: 6,
          }}
        >
          {props.lang === "zh"
            ? "虚线：源模型连杆父子关系 · 非线束 / 非拆卸步骤"
            : "Dashed lines: source link hierarchy · not wiring or removal steps"}
        </div>
      )}
      {status !== "ready" && (
        <div className="viewer-status">
          <span className={status === "loading" ? "spinner" : ""} />
          <strong>
            {status === "loading"
              ? props.lang === "zh"
                ? "正在加载官方模型"
                : "Loading official model"
              : props.lang === "zh"
                ? "模型加载失败"
                : "Model failed to load"}
          </strong>
          <small>{detail}</small>
        </div>
      )}
    </div>
  );
}
