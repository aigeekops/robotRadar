#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
export PYTHONDONTWRITEBYTECODE=1
exec services/mujoco/.venv/bin/python services/mujoco/server.py
