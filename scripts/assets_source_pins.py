"""Fail-closed source pins for asset builds; never checkout or mutate sources."""
from pathlib import Path
import subprocess
PINS={
 'unitree_ros':'725b59b6de39a26c425632120c89f23c49a36f1e',
 'franka_ros':'ddd2fffd9de44b02ad15b4bbb2bfa2cec4d60d98',
 'ur_description':'0eb1a861f7772fceb38510d90fa2f98ec668070c',
 'franka_description_current':'7aeeddc449edf8d62b594f9e36a81da53e7796f9',
 'SO-ARM100':'a758567c3978dfeefe282ede0500085a48fe8f78',
 'lerobot-guides':'e6ffde60312365c5452c46189a26872483943154',
}
def verify(repo):
 repo=Path(repo)
 if repo.name not in PINS:raise RuntimeError(f'Unregistered asset source: {repo.name}')
 actual=subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()
 if actual!=PINS[repo.name]:raise RuntimeError(f'Asset source pin mismatch: {repo.name}: expected {PINS[repo.name]}, got {actual}. Audit before updating pins.')
 # HEAD alone cannot detect modified tracked source files.
 for args in [['diff','--quiet','--'],['diff','--cached','--quiet','--']]:
  if subprocess.run(['git','-C',str(repo),*args]).returncode:raise RuntimeError(f'Modified tracked asset source: {repo.name}; refusing rebuild.')
 return actual

def verify_all(source_root):
 return {name:verify(Path(source_root)/name) for name in PINS}
