#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
# Robot Radar adaptation, 2026. This script belongs only to the SVH asset package.
"""Rebuild the static left-hand model from bundled unmodified official model source.
Requires Python 3 and xacro==2.1.1. Does not execute any ROS/hardware driver.
Run: python rebuild.py --output /path/to/new-output
"""
from pathlib import Path
import argparse, importlib.metadata, shutil, xml.etree.ElementTree as ET
import xacro
import xacro.substitution_args
BASE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=BASE/'rebuilt')
args=parser.parse_args()
if importlib.metadata.version('xacro')!='2.1.1':
    raise RuntimeError('Reproduction is pinned to xacro==2.1.1')
package=BASE/'source/schunk_svh_description'
def find(name):
    if name!='schunk_svh_description': raise ValueError('Unexpected package '+name)
    return str(package)
xacro.substitution_args._eval_find=find
# Official standalone source explicitly selects left_hand and side=-1.
doc=xacro.process_file(str(package/'urdf/svh-standalone.urdf.xacro'))
# Serialize the robot root only: omits generated absolute build-directory comments,
# but preserves all upstream comments within the model, including guessed lengths.
expanded='<?xml version="1.0"?>\n'+doc.documentElement.toxml()+'\n'
args.output.mkdir(parents=True,exist_ok=True)
(args.output/'source-expanded.urdf').write_text(expanded)
prefix='package://schunk_svh_description/'
runtime=expanded.replace(prefix,'/robots/svh_hand/')
(args.output/'robot.urdf').write_text(runtime)
root=ET.fromstring(expanded)
for mesh in root.findall('.//mesh'):
    url=mesh.get('filename','')
    if not url.startswith(prefix): raise ValueError('Unexpected mesh URI '+url)
    relative=Path(url.removeprefix(prefix))
    if relative.is_absolute() or '..' in relative.parts: raise ValueError('Unsafe mesh path')
    destination=args.output/relative;destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(package/relative,destination)
print('Expanded official standalone left hand; only mesh URI prefix adapted. No hardware code executed.')
