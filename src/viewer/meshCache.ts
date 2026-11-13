import {
  BufferGeometry,
  LoadingManager,
  Material,
  Mesh,
  Object3D,
  Texture,
} from "three";
import type { UrdfMeshLoader } from "./urdfMeshLoader";

/** Templates never enter a scene. Every consumer owns its resources and may
 * mutate/dispose them independently. Bound retained CPU geometry, not just URLs. */
export function createMeshCache(maxBytes = 96 * 1024 * 1024, maxEntries = 128) {
  const retained = new Map<string, { object: Object3D; bytes: number }>();
  const pending = new Map<string, Promise<Object3D>>();
  let bytes = 0,
    hits = 0,
    misses = 0;
  const dispose = (root: Object3D) => {
    const geometries = new Set<BufferGeometry>(),
      materials = new Set<Material>(),
      textures = new Set<Texture>();
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof Texture) textures.add(value);
      }
    });
    geometries.forEach((x) => x.dispose());
    materials.forEach((x) => x.dispose());
    textures.forEach((x) => x.dispose());
  };
  const size = (root: Object3D) => {
    const buffers = new Set<ArrayBufferLike>();
    let total = 0;
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      for (const attribute of [
        ...Object.values(node.geometry.attributes),
        node.geometry.index,
      ]) {
        if (!attribute) continue;
        const buffer =
          "array" in attribute
            ? attribute.array.buffer
            : attribute.data.array.buffer;
        if (!buffers.has(buffer)) {
          buffers.add(buffer);
          total += buffer.byteLength;
        }
      }
      // Textures retain decoded images too. Conservatively account RGBA pixels.
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        for (const value of Object.values(material))
          if (value instanceof Texture) {
            const image = value.image as
              { width?: number; height?: number } | undefined;
            total += (image?.width || 0) * (image?.height || 0) * 4;
          }
    });
    return total;
  };
  const clone = (template: Object3D) => {
    const root = template.clone(true);
    const geometries = new Map<BufferGeometry, BufferGeometry>(),
      materials = new Map<Material, Material>(),
      textures = new Map<Texture, Texture>();
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      let geometry = geometries.get(node.geometry);
      if (!geometry) {
        geometry = (node.geometry as BufferGeometry).clone();
        geometries.set(node.geometry, geometry);
      }
      node.geometry = geometry;
      const copyMaterial = (source: Material) => {
        let material = materials.get(source);
        if (!material) {
          material = source.clone();
          materials.set(source, material);
          for (const [key, value] of Object.entries(source))
            if (value instanceof Texture) {
              let texture = textures.get(value);
              if (!texture) {
                texture = value.clone();
                textures.set(value, texture);
              }
              (material as unknown as Record<string, unknown>)[key] = texture;
            }
        }
        return material;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(copyMaterial)
        : copyMaterial(node.material);
    });
    return root;
  };
  return {
    disposeInstance: dispose,
    stats: () => ({
      entries: retained.size,
      pending: pending.size,
      bytes,
      hits,
      misses,
      maxBytes,
    }),
    clear: () => {
      retained.forEach((x) => dispose(x.object));
      retained.clear();
      bytes = 0;
    },
    wrap(original: UrdfMeshLoader): UrdfMeshLoader {
      return (path, manager: LoadingManager, done) => {
        const key = manager.resolveURL(path);
        manager.itemStart(key);
        const cached = retained.get(key);
        let promise: Promise<Object3D>;
        if (cached) {
          hits++;
          retained.delete(key);
          retained.set(key, cached);
          promise = Promise.resolve(cached.object);
        } else if (pending.has(key)) {
          hits++;
          promise = pending.get(key)!;
        } else {
          misses++;
          promise = new Promise<Object3D>((resolve, reject) => {
            try {
              original(path, manager, (object, error) =>
                error ? reject(error) : resolve(object),
              );
            } catch (error) {
              reject(error);
            }
          });
          pending.set(key, promise);
          promise.then(
            (object) => {
              pending.delete(key);
              const cost = size(object);
              if (cost > maxBytes) {
                setTimeout(() => dispose(object), 0);
                return;
              }
              retained.set(key, { object, bytes: cost });
              bytes += cost;
              while (bytes > maxBytes || retained.size > maxEntries) {
                const oldest = retained.entries().next().value!;
                retained.delete(oldest[0]);
                bytes -= oldest[1].bytes;
                // Defer disposal until all consumers in this microtask have cloned.
                setTimeout(() => dispose(oldest[1].object), 0);
              }
            },
            () => {
              pending.delete(key);
            },
          );
        }
        promise.then(
          (object) => {
            try {
              done(clone(object));
            } finally {
              manager.itemEnd(key);
            }
          },
          (error) => {
            try {
              done(
                new Object3D(),
                error instanceof Error ? error : new Error(String(error)),
              );
            } finally {
              manager.itemError(key);
              manager.itemEnd(key);
            }
          },
        );
      };
    },
  };
}
export const robotMeshCache = createMeshCache();
