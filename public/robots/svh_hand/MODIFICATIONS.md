# SVH asset-package changes

Upstream: SCHUNK-SE-Co-KG/schunk_svh_ros_driver, commit `eece0762dc080431630301d02d5ddcaef69128bc`.

1. The complete `schunk_svh_description` subtree is copied unchanged into `source/`, together with the root GPL text, copyright notice templates and root README.
2. `xacro==2.1.1` expands the official `svh-standalone.urdf.xacro`, which explicitly selects `left_hand`, `side=-1`. Package lookup is redirected only to the bundled model source. No ROS process, controller, Gazebo plugin or hardware driver is executed.
3. The generated `source-expanded.urdf` preserves the expanded source model and its internal comments. Generated comments containing absolute build-directory paths are omitted.
4. In `robot.urdf` only mesh URI prefixes change from `package://schunk_svh_description/` to `/robots/svh_hand/`. Joint transforms, axes, limits, mimic multipliers, inertial values, geometry and materials are unchanged. All 23 deployed DAE files are byte-identical to the pinned upstream files.
5. `rebuild.py` and this package's added audit/documentation files describe this adaptation and are distributed as part of this GPL-3.0-or-later model package. The script contains no hardware commands.

Upstream limitations retained: five comments in `svh.urdf.xacro` explicitly mark auxiliary thumb geometry lengths as guessed/not found in the datasheet. The existence of an official visual model is not verification of manufacturing dimensions, fabrication suitability, contact dynamics, grasp force or hardware safety.
