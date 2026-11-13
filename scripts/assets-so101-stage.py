"""Stage SO-101 follower assets only. Does not publish or run hardware code."""
from assets_source_pins import verify
from pathlib import Path
import hashlib,json,shutil,subprocess,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT/'assets-source/SO-ARM100'
COMMIT='a758567c3978dfeefe282ede0500085a48fe8f78'
verify(REPO)
verify(ROOT/'assets-source/lerobot-guides')
BASE=REPO/'Simulation/SO101'
OUT=ROOT/'assets-source/candidates/so101'
OUT.mkdir(parents=True,exist_ok=True)
URL='https://github.com/TheRobotStudio/SO-ARM100'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source_file=BASE/'so101_new_calib.urdf'
tree=ET.parse(source_file).getroot()
files={}
for mesh in tree.findall('.//mesh'):
 rel=Path(mesh.get('filename'));src=BASE/rel
 assert src.resolve().is_relative_to(BASE.resolve()) and src.is_file()
 dest=OUT/rel;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
 mesh.set('filename','/robots/so101/'+rel.as_posix())
 path=src.relative_to(REPO).as_posix()
 files[rel.as_posix()]={'file':rel.as_posix(),'sha256':sha(src),'bytes':src.stat().st_size,'sourcePath':path,'sourceUrl':f'{URL}/blob/{COMMIT}/{path}','license':'Apache-2.0','licenseEvidence':['LICENSE']}
ET.indent(tree);ET.ElementTree(tree).write(OUT/'robot.urdf',encoding='utf-8',xml_declaration=True)
joints=[]
for j in tree.findall('joint'):
 limit=j.find('limit');origin=j.find('origin');axis=j.find('axis')
 joints.append({'id':j.get('name'),'type':j.get('type'),'parent':j.find('parent').get('link'),'child':j.find('child').get('link'),'axis':axis.get('xyz') if axis is not None else '1 0 0','origin':dict(origin.attrib) if origin is not None else {},'limit':dict(limit.attrib) if limit is not None else {}})
support={'zh':'基础开放硬件 SO-101 follower，新校准零位；不是 SO-100 或 leader。五个臂关节加一个旋转夹爪，非 LeRobot 0–100 归一化夹爪接口。未运行串口、电机、校准或控制代码。','en':'Foundational open-hardware SO-101 follower, new-calibration zero; not SO-100 or leader. Five arm joints plus a revolute gripper, not the LeRobot normalized 0–100 gripper interface. No serial, motor, calibration or control code executed.'}
limitations={'zh':'官方已移除基座碰撞网格；这里验证外观、运动学及官方装配文字出处，不代表实机装配验证、碰撞安全或电气仿真。 '+support['zh'],'en':'Upstream removed base collision meshes. Visual geometry, kinematics and assembly-text provenance only; no physical assembly validation, collision safety or electrical simulation. '+support['en']}
evidence=[{'repositoryPath':p,'sha256':sha(REPO/p),'url':f'{URL}/blob/{COMMIT}/{p}'} for p in ['LICENSE','README.md','Simulation/SO101/README.md']]
notices=['LICENSE.txt','ATTRIBUTION.txt','MODIFICATIONS.txt']
shutil.copy2(REPO/'LICENSE',OUT/'LICENSE.txt')
if (REPO/'NOTICE').exists(): shutil.copy2(REPO/'NOTICE',OUT/'NOTICE.txt');notices.append('NOTICE.txt')
(OUT/'ATTRIBUTION.txt').write_text(f'SO-101 follower by TheRobotStudio with Hugging Face collaboration.\nSource: {URL}\nPinned commit: {COMMIT}\nApache-2.0: see LICENSE.txt. No upstream NOTICE file present at this commit.\nMotor parameters upstream adapted from Open Duck Mini.\nExternal linked videos, images and vendor internal designs are not included or relicensed.\n')
(OUT/'MODIFICATIONS.txt').write_text('Imported so101_new_calib.urdf (follower only). Only XML serialization and mesh paths changed. All referenced STL bytes retained.\nUpstream generated model using onshape-to-robot; upstream removed base collision meshes. New-calibration virtual zero is joint-range midpoint. No geometry, calibration, inertia or joint limit changed here. No control software executed.\n')
provenance={'repository':URL,'commit':COMMIT,'sourceFile':source_file.relative_to(REPO).as_posix(),'sourceSha256':sha(source_file),'generatedUrdfSha256':sha(OUT/'robot.urdf'),'license':'Apache-2.0','method':'Pinned official SO-101 follower new-calibration URDF; mesh paths rewritten only. Unmodified STL bytes.','files':list(files.values()),'joints':joints,'links':[x.get('name') for x in tree.findall('link')],'licenseAudit':{'status':'source-scoped-review','basis':'Root Apache-2.0 LICENSE; no subtree license or NOTICE found in pinned tracked tree. Covers actual referenced files as declared by repository, not independent vendor IP warranty. External linked resources excluded.','evidence':evidence},'distributionNotices':notices,'supportStatus':support,'assemblyEvidence':{'repository':'https://github.com/huggingface/lerobot','commit':'e6ffde60312365c5452c46189a26872483943154','path':'docs/source/so101.mdx','scope':'Textual follower assembly instructions; external videos not independently licensed or frame-verified.'}}
item={'id':'so101','name':{'zh':'SO-101 follower · 基础开放硬件','en':'SO-101 follower · Foundational open hardware'},'manufacturer':'TheRobotStudio / Hugging Face','form':'arm','description':{'zh':'SO-101 五轴机械臂与旋转夹爪，用于学习有公开 CAD 与装配文字证据的基础硬件。不是主流工业机型内部结构替代品。','en':'SO-101 five-axis arm with revolute gripper for foundational open-hardware study backed by public CAD and assembly text. Not a substitute for industrial robot internals.'},'license':'Apache-2.0','urdfUrl':'/robots/so101/robot.urdf','sourceUrl':f'{URL}/tree/{COMMIT}/Simulation/SO101','sourceCommit':COMMIT,'provenanceUrl':'/robots/so101/provenance.json','verifiedScope':{'zh':'官方描述模型、CAD/打印件与装配文字出处','en':'Official description, CAD/print files and assembly-text provenance'},'limitations':limitations,'supportStatus':support,'jointCount':6,'linkCount':8,'downloadBytes':sum(x['bytes'] for x in files.values()),'licenseEvidenceUrl':'/robots/so101/provenance.json','licenseNoticeUrl':'/robots/so101/LICENSE.txt'}
# Preserve the separate upstream copyright for adapted assembly-course text.
guide_repo=ROOT/'assets-source/lerobot-guides'
verify(guide_repo)
shutil.copy2(guide_repo/'LICENSE',OUT/'LEROBOT-LICENSE.txt')
with (OUT/'ATTRIBUTION.txt').open('a') as f:
 f.write('\nAssembly-course text adapted and summarized/translated from Hugging Face LeRobot docs/source/so101.mdx, commit e6ffde60312365c5452c46189a26872483943154.\nCopyright 2024 The Hugging Face team. All rights reserved. Apache-2.0; see LEROBOT-LICENSE.txt.\nSource: https://github.com/huggingface/lerobot/blob/e6ffde60312365c5452c46189a26872483943154/docs/source/so101.mdx\nNo upstream NOTICE or docs-specific override found. External linked media are excluded. These adaptations are not manufacturer-certified work instructions.\n')
provenance['distributionNotices'].append('LEROBOT-LICENSE.txt')
provenance['assemblyEvidence'].update(license='Apache-2.0',licenseFile='LEROBOT-LICENSE.txt',licenseSha256=sha(guide_repo/'LICENSE'),sourceSha256=sha(guide_repo/'docs/source/so101.mdx'),modifications='Text summarized and translated for teaching; external linked media excluded.')
(OUT/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
(OUT/'manifest-item.json').write_text(json.dumps(item,ensure_ascii=False,indent=2)+'\n')
assert len(files)==13 and len(joints)==7
for f in files.values():assert sha(OUT/f['file'])==f['sha256']
print(json.dumps({'candidate':str(OUT),'links':8,'joints':7,'movable':6,'meshes':len(files),'bytes':item['downloadBytes'],'published':False}))
