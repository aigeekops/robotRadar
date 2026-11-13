"""Rebuild and publish only the audited static SO-101 follower; preserve other models."""
from pathlib import Path
import subprocess,shutil,json
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['python3',str(ROOT/'scripts/assets-so101-stage.py')],check=True)
candidate=ROOT/'assets-source/candidates/so101';target=ROOT/'public/robots/so101'
shutil.copytree(candidate,target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('manifest-item.json', 'five-model-baseline.json'))
item=json.loads((candidate/'manifest-item.json').read_text())
manifest_path=ROOT/'public/robots/manifest.json'
manifest=json.loads(manifest_path.read_text())
existing=next((i for i,x in enumerate(manifest) if x['id']=='so101'),None)
if existing is None:manifest.append(item)
else:manifest[existing]=item
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
shutil.copy2(target/'provenance.json',ROOT/'content/robots/so101.json')
print('Published static SO-101 follower; no hardware code executed.')
