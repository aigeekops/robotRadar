# SCHUNK SVH left-hand model: license and scope

This **SVH asset package** is distributed under **GPL-3.0-or-later**. The pinned official `schunk_svh_description/package.xml` explicitly applies that license to its kinematic and visual description. The complete GPL v3 text is preserved as `LICENSE.txt`; the upstream copyright notices include SCHUNK SE & Co. KG (2024) and FZI Forschungszentrum Informatik, Karlsruhe, Germany (2022), preserved verbatim under `source/LICENSES/`. The original package sources and per-file hashes are retained.

The license statement here identifies this model package, its source files and adaptations. It does **not** label the Robot Radar application or unrelated robot models as GPL, and does not give a legal opinion or guarantee compatibility of a particular combined distribution. Review applicable distribution obligations before releasing a combined product.

Download `corresponding-source.zip` alongside this notice for the complete pinned description source, original license/copyright notices, generated model, mesh files and reproducible conversion script. The original source remains available at:
https://github.com/SCHUNK-SE-Co-KG/schunk_svh_ros_driver/tree/eece0762dc080431630301d02d5ddcaef69128bc/schunk_svh_description

## Verified scope

Official standalone **left** five-finger SVH model: 32 links, 31 total joints, 20 movable joints, 11 mimic joints, hence 9 independently driven joints. It is neither a five-independent-actuator simplification nor a 20-independent-actuator hand. Mimic coupling is part of the source model.

No hardware driver, ROS controller, Gazebo contact plugin or learned policy was executed. Source includes guessed auxiliary thumb dimensions; these remain explicitly documented. Visual and bounded kinematic demonstration is not evidence of contact grasp success, grip force, tactile sensing, manufacturing accuracy or hardware safety.
