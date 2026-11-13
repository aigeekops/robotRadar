import {
  FileLoader,
  LoadingManager,
  Mesh,
  MeshPhongMaterial,
  Object3D,
  Group,
  Light,
} from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import type URDFLoader from "urdf-loader";

export type UrdfMeshLoader = URDFLoader["loadMeshCb"];
export type ObjTextReader = (
  path: string,
  manager: LoadingManager,
  success: (text: string) => void,
  failure: (error: unknown) => void,
) => void;

const readObj: ObjTextReader = (path, manager, success, failure) => {
  // Let the existing manager map root-relative URLs to the static site's base.
  // Resolving the URL here as well would duplicate the base prefix.
  new FileLoader(manager)
    .setResponseType("text")
    .load(path, (text) => success(String(text)), undefined, failure);
};

/** Preserve OBJ geometry; expose a plain single mesh so URDFLoader can apply its
 * declared visual material (e.g. Spot's yellow body). Vertex-coloured or grouped
 * geometry stays grouped so the upstream loader does not replace its materials.
 * External MTL is deliberately rejected, never silently rendered as white. Add
 * an audited MTL/texture resolver before accepting such source packages.
 */
export function parseUrdfObj(text: string): Object3D {
  if (/^\s*mtllib\s+/m.test(text) || /^\s*usemtl\s+/m.test(text)) {
    throw new Error(
      "OBJ references external/named materials; audited MTL support is required",
    );
  }
  const group = new OBJLoader().parse(text);
  let meshes = 0;
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute("position");
    if (!positions || positions.count < 3)
      throw new Error("OBJ contains no drawable triangle geometry");
    for (const value of positions.array) {
      if (!Number.isFinite(value))
        throw new Error("OBJ has non-finite vertices");
    }
    meshes++;
  });
  if (!meshes) throw new Error("OBJ contains no drawable meshes");
  const child = group.children[0];
  if (
    group.children.length === 1 &&
    child instanceof Mesh &&
    !child.geometry.getAttribute("color")
  ) {
    group.remove(child);
    return child;
  }
  return group;
}

/** Asset-export lights are not robot parts. In particular, Go2-W wheel DAE
 * files carry authoring lights that otherwise overexpose every app scene.
 * Remove only runtime Light nodes; source bytes, mesh/material references and
 * transforms are untouched, and the application's own lighting is not passed here.
 */
export function removeImportedAssetLights(object: Object3D): Object3D {
  if (object instanceof Light) return new Group();
  const lights: Light[] = [];
  object.traverse((node) => {
    if (node instanceof Light) lights.push(node);
  });
  for (const light of lights) light.removeFromParent();
  return object;
}

/** Wrap the bound original loadMeshCb before the consumer's pending/error wrapper.
 * STL/DAE retain the original implementation; unsupported files fail rather than
 * leaving per-model pending counters stuck forever. Exactly one completion per
 * invocation, including transport/parser errors and synchronous loader throws.
 */
export function withObjMeshSupport(
  original: UrdfMeshLoader,
  read: ObjTextReader = readObj,
): UrdfMeshLoader {
  return (path, manager, done) => {
    let finished = false;
    const complete: Parameters<UrdfMeshLoader>[2] = (object, error) => {
      if (finished) return;
      finished = true;
      done(error ? object : removeImportedAssetLights(object), error);
    };
    const fail = (error: unknown) =>
      complete(
        new Group(),
        error instanceof Error ? error : new Error(String(error)),
      );
    const extension = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
    try {
      if (extension === "obj") {
        read(
          path,
          manager,
          (text) => {
            let object: Object3D;
            try {
              object = parseUrdfObj(text);
            } catch (error) {
              fail(error);
              return;
            }
            complete(object);
          },
          fail,
        );
      } else if (extension === "stl" || extension === "dae") {
        original(path, manager, complete);
      } else {
        fail(
          new Error(`Unsupported URDF mesh format: ${extension || "unknown"}`),
        );
      }
    } catch (error) {
      fail(error);
    }
  };
}

/** Build-generated lossless gzip sidecars reduce network bytes without changing
 * source topology, link boundaries or material assignments. Old deployments and
 * browsers without streaming decompression fall back to original assets. */
export function withCompressedMeshSupport(
  original: UrdfMeshLoader,
): UrdfMeshLoader {
  return (path, manager, done) => {
    if (!import.meta.env?.PROD || typeof DecompressionStream === "undefined") {
      original(path, manager, done);
      return;
    }
    const extension = path.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
    if (!["stl", "dae", "obj"].includes(extension || "")) {
      original(path, manager, done);
      return;
    }
    const url = manager.resolveURL(path);
    manager.itemStart(url);
    void (async () => {
      let object: Object3D;
      try {
        const response = await fetch(`${url}.gz`, {
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok || !response.body)
          throw new Error("Compressed mesh unavailable");
        // Some servers mark .gz with Content-Encoding:gzip and the browser
        // has already decoded it; never decompress those bytes a second time.
        const wire = await response.arrayBuffer();
        const magic = new Uint8Array(wire, 0, Math.min(2, wire.byteLength));
        const buffer =
          magic[0] === 0x1f && magic[1] === 0x8b
            ? await new Response(
                new Blob([wire])
                  .stream()
                  .pipeThrough(new DecompressionStream("gzip")),
              ).arrayBuffer()
            : wire;
        if (extension === "stl") {
          const { STLLoader } =
            await import("three/examples/jsm/loaders/STLLoader.js");
          object = new Mesh(
            new STLLoader().parse(buffer),
            new MeshPhongMaterial(),
          );
        } else if (extension === "dae") {
          const { ColladaLoader } =
            await import("three/examples/jsm/loaders/ColladaLoader.js");
          object = new ColladaLoader(manager).parse(
            new TextDecoder().decode(buffer),
            url.slice(0, url.lastIndexOf("/") + 1),
          )!.scene;
        } else object = parseUrdfObj(new TextDecoder().decode(buffer));
      } catch {
        // Do not poison the manager on sidecar failure. The original loader owns
        // final error reporting and callers keep their normal retry controls.
        try {
          original(path, manager, done);
        } finally {
          manager.itemEnd(url);
        }
        return;
      }
      // Consumer errors are not transport errors and must not trigger a second
      // callback via the fallback loader.
      try {
        done(removeImportedAssetLights(object));
      } finally {
        manager.itemEnd(url);
      }
    })();
  };
}
