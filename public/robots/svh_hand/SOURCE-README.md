# Reproducing this standalone SVH model package

The package is separate from the site's other robot assets. Its GPL-3.0-or-later scope is explained in `NOTICE.md`; `LICENSE.txt` is the unmodified GPL text. This is not a legal compatibility guarantee for a combined application.

`source/schunk_svh_description/` contains every tracked file in the official description subtree at commit `eece0762dc080431630301d02d5ddcaef69128bc`, including Xacro inputs, meshes/material definitions, package/build metadata and change log. Original root copyright/license notices and root README are included. `source-manifest.json` records their exact hashes. No hardware driver sources are needed or executed by this model-only expansion; the upstream root README is retained for attribution/context, not as a command to run its hardware instructions.

Requirements: Python 3 and the standard PyPI package `xacro==2.1.1` (also in `requirements.txt`). In an environment where that package is already installed:

```
python rebuild.py --output rebuilt
```

This resolves only the bundled model package, expands the official standalone left-hand configuration, and writes `source-expanded.urdf`, `robot.urdf` and the referenced DAE meshes to `rebuilt/`. It does not launch ROS, Gazebo, a driver, or any hardware commands. The expanded/runtime URDF hash and deployed mesh hashes are recorded in `provenance.json` in the served package. `MODIFICATIONS.md` records the path adaptation and retained upstream caveats.

The 23 deployed DAE meshes have no external image, URL or source references. Their `asset/contributor/author` fields read `Blender User`; no mesh-level alternative license notice was found. The licensing basis is the explicit scoped description-package license, not this generic author string.
