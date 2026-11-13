/** Audited against bundled provenance.json; only exact pinned revisions are exposed. */
const pinnedSources: Record<string, { url: string; commit: string }> = {
  svh_hand: {
    url: "https://github.com/SCHUNK-SE-Co-KG/schunk_svh_ros_driver/blob/eece0762dc080431630301d02d5ddcaef69128bc/schunk_svh_description/urdf/svh-standalone.urdf.xacro",
    commit: "eece0762dc080431630301d02d5ddcaef69128bc",
  },
  g1: {
    url: "https://github.com/unitreerobotics/unitree_ros/blob/725b59b6de39a26c425632120c89f23c49a36f1e/robots/g1_description/g1_23dof_mode_10.urdf",
    commit: "725b59b6de39a26c425632120c89f23c49a36f1e",
  },
  go2: {
    url: "https://github.com/unitreerobotics/unitree_ros/blob/725b59b6de39a26c425632120c89f23c49a36f1e/robots/go2_description/urdf/go2_description.urdf",
    commit: "725b59b6de39a26c425632120c89f23c49a36f1e",
  },
  panda: {
    url: "https://github.com/frankarobotics/franka_ros/blob/ddd2fffd9de44b02ad15b4bbb2bfa2cec4d60d98/franka_description/robots/panda/panda.urdf.xacro",
    commit: "ddd2fffd9de44b02ad15b4bbb2bfa2cec4d60d98",
  },
  ur5e: {
    url: "https://github.com/UniversalRobots/Universal_Robots_ROS2_Description/blob/0eb1a861f7772fceb38510d90fa2f98ec668070c/urdf/ur.urdf.xacro",
    commit: "0eb1a861f7772fceb38510d90fa2f98ec668070c",
  },
  fr3: {
    url: "https://github.com/frankarobotics/franka_description/blob/7aeeddc449edf8d62b594f9e36a81da53e7796f9/robots/fr3/fr3.urdf.xacro",
    commit: "7aeeddc449edf8d62b594f9e36a81da53e7796f9",
  },
  "franka-hand": {
    url: "https://github.com/frankarobotics/franka_description/blob/7aeeddc449edf8d62b594f9e36a81da53e7796f9/robots/fr3/fr3.urdf.xacro",
    commit: "7aeeddc449edf8d62b594f9e36a81da53e7796f9",
  },
  so101: {
    url: "https://github.com/TheRobotStudio/SO-ARM100/blob/a758567c3978dfeefe282ede0500085a48fe8f78/Simulation/SO101/so101_new_calib.urdf",
    commit: "a758567c3978dfeefe282ede0500085a48fe8f78",
  },
  h1: {
    url: "https://github.com/unitreerobotics/unitree_ros/blob/725b59b6de39a26c425632120c89f23c49a36f1e/robots/h1_description/urdf/h1.urdf",
    commit: "725b59b6de39a26c425632120c89f23c49a36f1e",
  },
  turtlebot3: {
    url: "https://github.com/ROBOTIS-GIT/turtlebot3/blob/0d4e59cf34da9c0661f80008bb0fa02636c713b2/turtlebot3_description/urdf/turtlebot3_burger.urdf",
    commit: "0d4e59cf34da9c0661f80008bb0fa02636c713b2",
  },
  go2w: {
    url: "https://github.com/unitreerobotics/unitree_ros/blob/725b59b6de39a26c425632120c89f23c49a36f1e/robots/go2w_description/urdf/go2w_description.urdf",
    commit: "725b59b6de39a26c425632120c89f23c49a36f1e",
  },
  spot: {
    url: "https://github.com/bdaiinstitute/spot_description/blob/156d1802bfb117f219dbfce7597d283d5fabc968/spot_description/urdf/spot_simple.urdf.xacro",
    commit: "156d1802bfb117f219dbfce7597d283d5fabc968",
  },
  "open-duck-mini": {
    url: "https://github.com/apirrone/Open_Duck_Mini/blob/b23317a485b3cec7d8417f352478778b3475173c/mini_bdx/robots/open_duck_mini_v2/robot.urdf",
    commit: "b23317a485b3cec7d8417f352478778b3475173c",
  },
  leap_hand: {
    url: "https://github.com/leap-hand/LEAP_Hand_Sim/blob/150bc3d4b61fd6619193ba5a8ef209f3609ced89/assets/leap_hand/robot.urdf",
    commit: "150bc3d4b61fd6619193ba5a8ef209f3609ced89",
  },
};
export function pinnedRobotSource(robot: {
  id: string;
  sourceCommit?: string;
}): string | null {
  const source = Object.hasOwn(pinnedSources, robot.id)
    ? pinnedSources[robot.id]
    : undefined;
  return source && source.commit === robot.sourceCommit ? source.url : null;
}
