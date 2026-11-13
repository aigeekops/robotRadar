import { defineConfig, type Plugin, type ResolvedConfig } from "vite";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

/** Static hosts need no special content-encoding configuration: the runtime
 * explicitly fetches and decompresses these lossless sidecars. Originals stay
 * available for older browsers and transport failures. Never modify public/. */
function compressedRobotMeshes(): Plugin {
  let config: ResolvedConfig;
  return {
    name: "compressed-robot-meshes",
    apply: "build",
    configResolved(value) {
      config = value;
    },
    async closeBundle() {
      const root = resolve(config.root, config.build.outDir, "robots");
      let count = 0;
      let originalBytes = 0;
      let compressedBytes = 0;
      async function walk(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) await walk(path);
          else if (entry.isFile() && /\.(stl|dae|obj)$/i.test(entry.name)) {
            const source = await readFile(path);
            const compressed = gzipSync(source, { level: 9 });
            await writeFile(`${path}.gz`, compressed);
            count++;
            originalBytes += source.length;
            compressedBytes += compressed.length;
          }
        }
      }
      // Missing copied assets are a build error rather than a silently broken
      // compressed-only production path.
      await walk(root);
      config.logger.info(
        `Robot mesh sidecars: ${count} files, ${(originalBytes / 1e6).toFixed(2)} MB → ${(compressedBytes / 1e6).toFixed(2)} MB`,
      );
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  plugins: [compressedRobotMeshes()],
  // Keep production code compact; source modules remain readable during dev.
  build: { minify: "esbuild" },
  server: { host: "127.0.0.1" },
});
