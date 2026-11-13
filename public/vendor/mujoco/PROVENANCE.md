# Browser MuJoCo runtime

Runtime: MuJoCo 3.5.1, single-thread WebAssembly. Distribution: npm `mujoco@3.1.16`, tarball SHA1 `096d41c1f4698812cf3166cd5c4db2f2094b515f`. The npm maintainer is `manevimatias`; this is a community-published build of the canonical bindings, NOT a verified official DeepMind npm release.

Canonical bindings source and documentation: https://github.com/google-deepmind/mujoco/tree/main/wasm . Upstream package metadata names `mujoco` and Google DeepMind as author, but does not establish ownership of this npm publication. Engine code is Apache-2.0; see LICENSE. The shipped JS/WASM are unmodified npm single-thread artifacts. No network CDN dependency or Python server is required. No cross-origin isolation headers are needed.

Model resources reuse `robots/g1/robot.urdf` and its existing meshes and retain their existing Unitree attribution/license. Worker rewrites mesh paths to its virtual filesystem and sets compiler `usethread=false`: this changes compilation concurrency, not model dynamics. Fixed base, 23 DOFs, gravity, 0.001 s step, external generalized torque only. No ground, floating base, motor control or walking policy. These results are not hardware validation.

Browser experiment: 200 steps, left elbow 0.2 Nm versus zero torque gives final position delta 0.3578402740911404 rad, matching existing Python MuJoCo 3.4.0 reference. Version equivalence is established only for the tested case, not every model/input.

Runtime payload is roughly 8.9 MB uncompressed plus existing model meshes (~24 MB fetched once per fresh worker, cache permitting). Initial browser initialization and three short checks measured ~699 ms on this development machine; not a mobile-device guarantee. Worker cancellation terminates the worker, bounds are ±0.5 Nm and 0.01–0.5 s, and client timeout is 60 s. No arbitrary code/model uploads or hardware connection. GitHub Pages subpaths use caller-provided site base.

QA hashes: qa/browser-mujoco-assets.json. Numeric browser record: qa/browser-mujoco-check.json. Regression: tests/e2e/browser-physics.spec.ts. Cancellation/failed-asset recovery: qa/check-browser-physics.mjs.
