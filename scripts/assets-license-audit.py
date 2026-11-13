"""Enrich imported official assets with scoped licence and support evidence."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
PUB=ROOT/'public/robots'
SRC=ROOT/'assets-source'
manifest=json.loads((PUB/'manifest.json').read_text())
configs={
'g1':dict(repo='unitree_ros',base='robots/g1_description',url='https://github.com/unitreerobotics/unitree_ros',evidence=['LICENSE','robots/g1_description/README.md'],licenseBasis='Repository BSD-3-Clause licence; tracked G1 subtree contains no separate licence or exception. Each used mesh checked against the pinned tree.',support={'zh':'Mode 10：12 个腿部、1 个腰部、10 个手臂主动关节，不含主动灵巧手；官方 README 标为 Up-to-date。仅核验此配置，不等同于 29/31 自由度型号。尚无匹配 Mode 10 MJCF 或已运行控制器。','en':'Mode 10 has 12 leg, 1 waist and 10 arm actuated joints, excluding active dexterous hands. The pinned README marks it Up-to-date. This is not a 29/31-DOF variant; no matching Mode 10 MJCF or running controller is verified.'}),
'go2':dict(repo='unitree_ros',base='robots/go2_description',url='https://github.com/unitreerobotics/unitree_ros',evidence=['LICENSE','robots/go2_description/package.xml','README.md','robots/go2_description/README.md','robots/go2_description/launch/gazebo.launch','robots/go2_description/config/robot_control.yaml'],licenseBasis='Package manifest explicitly covers configuration, 3D models and launch files under BSD; root provides BSD-3-Clause terms. No per-file or subtree exceptions found.',support={'zh':'12 个主动腿部关节。仓库提供 ROS 1 Gazebo 低层控制配置，但本应用只加载可视化 URDF；未运行 Gazebo、SDK 或行走控制器，不能据此声称高层行走支持。','en':'12 actuated leg joints. The repository supplies ROS 1 Gazebo low-level control configuration; this app only loads the visual URDF. Gazebo, SDK and locomotion controllers have not been run; high-level walking support is not claimed.'}),
'panda':dict(repo='franka_ros',base='franka_description',url='https://github.com/frankarobotics/franka_ros',evidence=['LICENSE','NOTICE','README.md','franka_description/package.xml'],licenseBasis='franka_description package manifest explicitly covers URDF and meshes under Apache-2.0; repository README covers all packages; upstream NOTICE retained.',support={'zh':'历史 Panda/FER 七轴机械臂及双指夹爪（其中一指 mimic）。并非 FR3。现行官方 franka_description 文档称 FER 仍可生成但不再维护问题；保留为历史教学模型，不代表当前官方受支持机型。','en':'Historical Panda/FER seven-axis arm with a two-finger gripper (one mimic joint), not FR3. Current official franka_description docs say FER remains generatable but reported issues are not fixed. Retained for historical education, not represented as a currently maintained model.'}),
'fr3':dict(repo='franka_description_current',base='',url='https://github.com/frankarobotics/franka_description',evidence=['LICENSE','NOTICE','README.rst','package.xml','robots/fr3/fr3.urdf.xacro'],licenseBasis='The package manifest explicitly covers robot URDF and meshes under Apache-2.0; README confirms the project licence; all 19 selected FR3/white-hand meshes are within that scope with no local override in the tracked tree; NOTICE retained.',support={'zh':'官方维护中的 fr3（Desk 标识 Arm3R）描述配置，7 个手臂主动关节、2 个夹爪关节（其中一个 mimic）。不是 Arm3Rv2/v2.1。这里只验证文件和运动学，未运行 FCI/ROS 控制器或实机。','en':'Maintained official fr3 description (Desk identity Arm3R): 7 actuated arm joints and 2 gripper joints, one mimic. Not Arm3Rv2/v2.1. File and kinematic validation only; no FCI/ROS controller or hardware run.'}),
'ur5e':dict(repo='ur_description',base='',url='https://github.com/UniversalRobots/Universal_Robots_ROS2_Description',evidence=['LICENSE','README.md','config/ur5e/visual_parameters.yaml'],licenseBasis='README explicitly identifies restricted mesh subtrees and licenses all other content BSD-3-Clause. All 14 used meshes are under meshes/ur5e, outside every named exception; the tracked UR5e subtree has no local licence override.',support={'zh':'UR5e 六轴官方默认模型，不带 Smart Panel 或末端工具。参数不是特定实机标定；未运行 ROS 2 驱动或实体控制。','en':'Official nominal six-axis UR5e, without Smart Panel or tool. Parameters are not calibration of a specific physical unit; no ROS 2 driver or hardware control has been run.'})}
for item in manifest:
 if item['id'] in ('h1','turtlebot3','go2w','spot','franka-hand'):
  # Independently published packages have their own pinned, per-file audit.
  provenance=json.loads((PUB/item['id']/'provenance.json').read_text())
  assert provenance['commit']==item['sourceCommit'] and provenance['licenseAudit']['evidence']
  for record in provenance['files']:
   assert record['license']==item['license'] and record['licenseEvidence']
   assert hashlib.sha256((PUB/item['id']/record['file']).read_bytes()).hexdigest()==record['sha256']
  continue
 item.pop('noticeUrl',None)
 if item['id'] in ['panda','fr3'] and (PUB/item['id']/'NOTICE.txt').is_file():
  item['noticeUrl']=f'/robots/{item["id"]}/NOTICE.txt'
 if item['id']=='so101':
  # This static importer owns its specialized open-hardware/assembly boundaries.
  # Validate its scoped source evidence rather than applying industrial-model boilerplate.
  target=PUB/'so101';source=json.loads((target/'provenance.json').read_text());repo=SRC/'SO-ARM100'
  assert source['commit']=='a758567c3978dfeefe282ede0500085a48fe8f78'
  assert source['sourceFile']=='Simulation/SO101/so101_new_calib.urdf'
  for evidence in source['licenseAudit']['evidence']:
   assert hashlib.sha256((repo/evidence['repositoryPath']).read_bytes()).hexdigest()==evidence['sha256']
  for mesh in source['files']:
   assert mesh['sourcePath'].startswith('Simulation/SO101/assets/')
   assert mesh['license']=='Apache-2.0' and mesh['licenseEvidence']==['LICENSE']
   assert hashlib.sha256((repo/mesh['sourcePath']).read_bytes()).hexdigest()==mesh['sha256']
   assert hashlib.sha256((target/mesh['file']).read_bytes()).hexdigest()==mesh['sha256']
  assert source['supportStatus']==item['supportStatus']
  for notice in source['distributionNotices']:assert (target/notice).is_file()
  (ROOT/'content/robots/so101.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
  continue
 c=configs[item['id']]; target=PUB/item['id']; source=json.loads((target/'provenance.json').read_text());repo=SRC/c['repo'];commit=source['commit']
 evidence=[]
 for path in c['evidence']:
  f=repo/path
  evidence.append({'repositoryPath':path,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'url':f'{c["url"]}/blob/{commit}/{path}'})
 source['licenseAudit']={'status':'source-scoped-review','basis':c['licenseBasis'],'evidence':evidence,'scope':'Actual referenced meshes and generated description only. No blanket licence inference for other robot assets.','reviewDate':'2026-11-13'}
 for record in source['files']:
  rel='/'.join(x for x in [c['base'],record['file']] if x)
  record['sourcePath']=rel;record['sourceUrl']=f'{c["url"]}/blob/{commit}/{rel}';record['license']=item['license'];record['licenseEvidence']=[e['repositoryPath'] for e in evidence if 'LICENSE' in e['repositoryPath'] or 'README' in e['repositoryPath'] or 'package.xml' in e['repositoryPath']]
  assert hashlib.sha256((repo/rel).read_bytes()).hexdigest()==record['sha256']
 if item['id']=='ur5e':
  assert len(source['files'])==14 and all(r['sourcePath'].startswith('meshes/ur5e/') for r in source['files'])
 source['supportStatus']=c['support']
 if item['id']=='panda':
  source['supportEvidence']={'url':'https://frankarobotics.github.io/docs/doc/franka_description/README.html#robot-model-support','retrieved':'2026-11-13','localEvidence':'assets-source/evidence/franka-description.html','sha256':hashlib.sha256((SRC/'evidence/franka-description.html').read_bytes()).hexdigest(),'qualification':'Current standalone franka_description documentation; imported geometry is pinned legacy franka_ros Panda.'}
 if (repo/'NOTICE').is_file():
  shutil.copy2(repo/'NOTICE',target/'NOTICE.txt')
 modifications='This runtime description is derived from the identified official source. Xacro was expanded where applicable, XML was formatted, and mesh URLs were changed to local browser paths. Original mesh bytes, dimensions, joint axes and limits were not changed. See provenance.json for exact source and checksum.\n'
 (target/'MODIFICATIONS.txt').write_text(modifications)
 attribution=f'{item["manufacturer"]}\nSource: {c["url"]}\nPinned commit: {commit}\nLicence: {item["license"]}; see LICENSE.txt and provenance.json.\n'+c['licenseBasis']+'\n'
 if item['id']=='ur5e':
  macro=(repo/'urdf/ur_macro.xacro').read_text();attribution+='\nUpstream model attribution and calibration warning:\n'+macro.split('<!--',1)[1].split('-->',1)[0]+'\n'
 (target/'ATTRIBUTION.txt').write_text(attribution)
 source['distributionNotices']=['LICENSE.txt','MODIFICATIONS.txt','ATTRIBUTION.txt']+(['NOTICE.txt'] if (repo/'NOTICE').is_file() else [])
 (target/'provenance.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n');(ROOT/'content/robots'/f'{item["id"]}.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
 item['supportStatus']=c['support'];item['licenseEvidenceUrl']=f'/robots/{item["id"]}/provenance.json';item['licenseNoticeUrl']=f'/robots/{item["id"]}/LICENSE.txt'
 # These visible limitations must stay understandable even when the UI does not yet render supportStatus.
 for lang in ['zh','en']:
  core='仅核验官方描述文件的关节树与外观资源；未核验内部电路、电机内部、维修拆装顺序或实机精度。' if lang=='zh' else 'Official description topology and visual resources only; no validation of internal electronics, motor internals, service disassembly or physical accuracy.'
  item['limitations'][lang]=core+' '+c['support'][lang]
(PUB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Scoped licence/support audit enriched all imported models; source mesh hashes unchanged.')
