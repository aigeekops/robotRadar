"""Real fixed-base G1 Mode 10 dynamics. No SDK or physical robot connection."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import platform
import sys
import xml.etree.ElementTree as ET

import mujoco
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'assets-source/unitree_ros/robots/g1_description/g1_23dof_mode_10.urdf'
TIMESTEP = 0.001
MAX_DURATION = 0.5
MAX_TORQUE = 0.5
SOURCE_COMMIT = '725b59b6de39a26c425632120c89f23c49a36f1e'
SOURCE_URL = f'https://github.com/unitreerobotics/unitree_ros/blob/{SOURCE_COMMIT}/robots/g1_description/g1_23dof_mode_10.urdf'


def load_model() -> mujoco.MjModel:
    model = mujoco.MjModel.from_xml_path(str(SOURCE))
    if model.nq != 23 or model.nv != 23 or model.nu != 0:
        raise RuntimeError('Unexpected source configuration; expected fixed-base G1 Mode 10 with 23 joints and no actuators.')
    if any(model.jnt_type == mujoco.mjtJoint.mjJNT_FREE):
        raise RuntimeError('This experiment requires a fixed base, not a floating robot.')
    model.opt.timestep = TIMESTEP
    return model


def profile(model: mujoco.MjModel) -> dict:
    return {
        'schemaVersion': 1,
        'engine': 'MuJoCo',
        'engineVersion': mujoco.__version__,
        'configuration': 'g1_23dof_mode_10',
        'sourceUrl': SOURCE_URL,
        'sourceCommit': SOURCE_COMMIT,
        'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'base': 'fixed',
        'control': 'qfrc_applied generalized torque, not SDK or motor firmware',
        'jointCount': int(model.njnt),
        'actuatorCount': int(model.nu),
        'bodyCount': int(model.nbody),
        'geometryCount': int(model.ngeom),
        'timestepSeconds': float(model.opt.timestep),
        'gravityMS2': model.opt.gravity.tolist(),
        'maxDurationSeconds': MAX_DURATION,
        'maxAbsTorqueNm': MAX_TORQUE,
        'joints': [
            {
                'name': mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, index),
                'lowerRad': float(model.jnt_range[index, 0]),
                'upperRad': float(model.jnt_range[index, 1]),
            }
            for index in range(model.njnt)
        ],
        'scope': {
            'zh': '真实 MuJoCo 固定基座动力学。使用 G1 Mode 10 官方 URDF 的质量、惯性、碰撞与关节数据。小幅外加广义力矩，不是 SDK、电机固件、行走控制器或实机验证。没有地面和自由浮动基座；接触计数仅来自模型内部碰撞。',
            'en': 'Real MuJoCo fixed-base dynamics using the official G1 Mode 10 URDF mass, inertia, collision, and joint data. Small applied generalized torques are not SDK calls, motor firmware, a walking controller, or hardware validation. There is no floor or floating base; contacts come from model self-collision.',
        },
        'limitsNote': {
            'zh': '这是无闭环控制的短时实验，其他关节在重力下也会运动。MuJoCo 位置限制是软约束，数值结果可能略超限；不能用于实机安全判断。',
            'en': 'This short experiment has no closed-loop controller; other joints also move under gravity. MuJoCo joint limits are soft constraints and may be slightly exceeded numerically. Do not use this for hardware safety decisions.',
        },
    }


def validate_request(model: mujoco.MjModel, request: dict) -> tuple[str, float, int]:
    if not isinstance(request, dict) or set(request) - {'joint', 'torque', 'duration'}:
        raise ValueError('Only joint, torque, and duration parameters are accepted.')
    name = request.get('joint', 'left_elbow_joint')
    if not isinstance(name, str):
        raise ValueError('joint must be a supported joint name.')
    index = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
    if index < 0 or model.jnt_type[index] != mujoco.mjtJoint.mjJNT_HINGE:
        raise ValueError('joint must identify a model hinge joint.')
    torque = request.get('torque', 0.2)
    duration = request.get('duration', 0.2)
    for label, value in [('torque', torque), ('duration', duration)]:
        if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
            raise ValueError(f'{label} must be a finite number.')
    if abs(torque) > MAX_TORQUE:
        raise ValueError(f'torque must be between {-MAX_TORQUE} and {MAX_TORQUE} N·m.')
    if not 0.01 <= duration <= MAX_DURATION:
        raise ValueError(f'duration must be between 0.01 and {MAX_DURATION} seconds.')
    return name, float(torque), round(float(duration) / TIMESTEP)


def run_trial(model: mujoco.MjModel, joint: str, torque: float, steps: int) -> dict:
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    joint_id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, joint)
    qadr, vadr = int(model.jnt_qposadr[joint_id]), int(model.jnt_dofadr[joint_id])
    names = [mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, i) for i in range(model.njnt)]
    max_contact_count = int(data.ncon)
    max_limit_excess = 0.0
    samples: list[dict] = []

    def sample() -> dict:
        return {
            'time': float(data.time),
            'jointPositionRad': float(data.qpos[qadr]),
            'jointVelocityRadS': float(data.qvel[vadr]),
            'contactCount': int(data.ncon),
            'positions': {name: float(data.qpos[model.jnt_qposadr[i]]) for i, name in enumerate(names)},
        }

    samples.append(sample())
    for step in range(1, steps + 1):
        data.qfrc_applied[:] = 0.0
        data.qfrc_applied[vadr] = torque
        mujoco.mj_step(model, data)
        if not np.isfinite(data.qpos).all() or not np.isfinite(data.qvel).all() or not np.isfinite(data.qacc).all():
            raise RuntimeError('Non-finite physics state; simulation result rejected.')
        if not math.isclose(float(data.time), step * TIMESTEP, rel_tol=0, abs_tol=1e-9):
            raise RuntimeError('Simulation time reset or failed to advance; result rejected.')
        max_contact_count = max(max_contact_count, int(data.ncon))
        for index in range(model.njnt):
            if model.jnt_limited[index]:
                value = float(data.qpos[model.jnt_qposadr[index]])
                lower, upper = model.jnt_range[index]
                max_limit_excess = max(max_limit_excess, float(lower - value), float(value - upper))
        if step % 10 == 0 or step == steps:
            samples.append(sample())
    warnings = [
        {'type': int(index), 'count': int(item.number)}
        for index, item in enumerate(data.warning)
        if item.number
    ]
    if warnings:
        raise RuntimeError(f'MuJoCo warnings occurred; result rejected: {warnings}')
    return {
        'torqueNm': torque,
        'steps': steps,
        'durationSeconds': float(data.time),
        'finite': True,
        'maxContactCount': max_contact_count,
        'maxJointLimitExcessRad': max_limit_excess,
        'initial': samples[0],
        'final': samples[-1],
        'samples': samples,
        'warnings': warnings,
    }


def compare(model: mujoco.MjModel, request: dict) -> dict:
    joint, torque, steps = validate_request(model, request)
    baseline = run_trial(model, joint, 0.0, steps)
    controlled = run_trial(model, joint, torque, steps)
    delta = controlled['final']['jointPositionRad'] - baseline['final']['jointPositionRad']
    return {
        'profile': profile(model),
        'request': {'joint': joint, 'torque': torque, 'duration': steps * TIMESTEP},
        'baseline': baseline,
        'controlled': controlled,
        'comparison': {
            'finalPositionDeltaRad': delta,
            'differentResult': abs(delta) > 1e-9,
            'sameInitialState': baseline['initial'] == controlled['initial'],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--joint', default='left_elbow_joint')
    parser.add_argument('--torque', type=float, default=0.2)
    parser.add_argument('--duration', type=float, default=0.2)
    parser.add_argument('--report', action='store_true', help='Save the result to services/mujoco/verification.json.')
    args = parser.parse_args()
    result = compare(load_model(), {'joint': args.joint, 'torque': args.torque, 'duration': args.duration})
    result['environment'] = {'python': sys.version, 'platform': platform.platform()}
    output = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False)
    if args.report:
        path = Path(__file__).with_name('verification.json')
        path.write_text(output + '\n')
        print(f'Wrote {path}')
        print(json.dumps(result['comparison'], indent=2))
    else:
        print(output)


if __name__ == '__main__':
    main()
