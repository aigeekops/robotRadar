"""Append H1 and TurtleBot3 from exact official commits; never rewrite existing packages.
Run assets-source/tools/bin/python scripts/assets-expand-publish.py after sparse checkout.
"""
from pathlib import Path
import hashlib,json,shutil,subprocess,xml.etree.ElementTree as ET
import xacro
ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'assets-source'; PUB=ROOT/'public/robots'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def loc(zh,en):return dict(zh=zh,en=en)
models=[dict(id='h1',repo='unitree_ros',commit='725b59b6de39a26c425632120c89f23c49a36f1e',url='https://github.com/unitreerobotics/unitree_ros',base='robots/h1_description',file='urdf/h1.urdf',license='BSD-3-Clause',name=loc('宇树 H1 · 无灵巧手','Unitree H1 · Without dexterous hands'),manufacturer='Unitree',form='humanoid',description=loc('官方 H1 19 关节基础配置，探索长腿人形机构；不是 H1-2。','Official basic H1 configuration with 19 joints, not H1-2.'),evidence=['LICENSE','robots/h1_description/README.md','robots/h1_description/package.xml'],basis='Repository BSD-3-Clause licence applies to the tracked H1 subtree, with no separate licence or exception found. The package.xml licence field is TODO, not an additional licence grant; reliance is on root LICENSE. README identifies this as official H1 description.',support=loc('19 个主动关节，无灵巧手；保留官方外观和关节链。仅展示/运动学，未集成 H1 动力学模型或行走控制器；未核验内部机构、拆装工艺或制造尺寸。','19 actuated joints without dexterous hands. Official visual assets and topology only. No integrated H1 dynamics or walking controller; internals, service assembly and manufacturing dimensions unverified.')),
dict(id='turtlebot3',repo='turtlebot3',commit='0d4e59cf34da9c0661f80008bb0fa02636c713b2',url='https://github.com/ROBOTIS-GIT/turtlebot3',base='turtlebot3_description',file='urdf/turtlebot3_burger.urdf',license='Apache-2.0',name=loc('TurtleBot3 Burger · 双轮移动底盘','TurtleBot3 Burger · Differential drive'),manufacturer='ROBOTIS',form='mobile',description=loc('官方 Burger 模型，探索双轮、底盘与激光雷达布局。','Official Burger model for exploring differential wheels, chassis and lidar layout.'),evidence=['LICENSE','turtlebot3_description/package.xml'],basis='Package manifest explicitly describes the package as 3D models for simulation and visualization and declares Apache 2.0; root LICENSE provides terms. No nested licence override or NOTICE found.',support=loc('2 个连续旋转轮关节；仅官方外观和关节链。试驾为教学运动学示意，未集成 ROS 导航、避障、传感器数据或实机；不代表完整可制造文件。','Two continuous wheel joints. Official visuals and topology only; driving is a teaching kinematic illustration. No ROS navigation, avoidance, sensor stream or hardware integration; not a complete manufacturing package.'))]
manifest=json.loads((PUB/'manifest.json').read_text())
for m in models:
 repo=SRC/m['repo']; base=repo/m['base']; source=base/m['file']; target=PUB/m['id']
 assert subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip()==m['commit']
 assert not subprocess.check_output(['git','-C',str(repo),'diff','HEAD','--',m['base'],'LICENSE'],text=True).strip()
 target.mkdir(exist_ok=True)
 text=xacro.process_file(str(source),mappings={'namespace':''}).toxml() if m['id']=='turtlebot3' else source.read_text()
 tree=ET.fromstring(text); records={}
 for mesh in tree.findall('.//mesh'):
  uri=mesh.get('filename'); rel=uri.split('package://',1)[-1].split('/',1)[-1] if uri.startswith('package://') else uri
  path=base/rel; assert path.is_file(),path
  dest=target/rel; dest.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(path,dest)
  mesh.set('filename',f'/robots/{m["id"]}/{rel}')
  records[rel]=dict(file=rel,sha256=sha(path),bytes=path.stat().st_size,sourcePath=f'{m["base"]}/{rel}',sourceUrl=f'{m["url"]}/blob/{m["commit"]}/{m["base"]}/{rel}',license=m['license'],licenseEvidence=m['evidence'])
 ET.indent(tree); ET.ElementTree(tree).write(target/'robot.urdf',encoding='utf-8',xml_declaration=True)
 shutil.copy2(repo/'LICENSE',target/'LICENSE.txt')
 (target/'ATTRIBUTION.txt').write_text(f'{m["manufacturer"]}\nSource: {m["url"]}\nCommit: {m["commit"]}\n'+m['basis']+'\n')
 (target/'MODIFICATIONS.txt').write_text('Official mesh bytes unchanged. Xacro namespace expanded to empty for TurtleBot3; XML formatted and mesh paths rewritten for local static hosting. No geometry, axes, limits or dimensions changed. No claim of hardware or manufacturing validation.\n')
 evidence=[dict(repositoryPath=p,sha256=sha(repo/p),url=f'{m["url"]}/blob/{m["commit"]}/{p}') for p in m['evidence']]
 joints=[]
 for j in tree.findall('joint'):
  axis=j.find('axis');origin=j.find('origin');limit=j.find('limit')
  joints.append(dict(id=j.get('name'),type=j.get('type'),parent=j.find('parent').get('link'),child=j.find('child').get('link'),axis=axis.get('xyz') if axis is not None else '1 0 0',origin=dict(origin.attrib) if origin is not None else {},limit=dict(limit.attrib) if limit is not None else {}))
 provenance=dict(repository=m['url'],commit=m['commit'],sourceFile=f'{m["base"]}/{m["file"]}',sourceSha256=sha(source),license=m['license'],method='Official URDF; Xacro expanded for TurtleBot3. Only local mesh paths and XML formatting changed.',files=list(records.values()),joints=joints,licenseAudit=dict(status='source-scoped-review',basis=m['basis'],evidence=evidence,reviewDate='2026-11-13'),distributionNotices=['LICENSE.txt','ATTRIBUTION.txt','MODIFICATIONS.txt'],supportStatus=m['support'])
 (target/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2)+'\n')
 item={k:m[k] for k in ['id','name','manufacturer','form','description','license']}
 item.update(urdfUrl=f'/robots/{m["id"]}/robot.urdf',sourceUrl=f'{m["url"]}/tree/{m["commit"]}/{m["base"]}',sourceCommit=m['commit'],provenanceUrl=f'/robots/{m["id"]}/provenance.json',verifiedScope=loc('官方描述 · 外观资源与关节树','Official description · visuals and topology'),limitations=m['support'],supportStatus=m['support'],jointCount=sum(j['type']!='fixed' for j in joints),linkCount=len(tree.findall('link')),downloadBytes=sum(r['bytes'] for r in records.values()),licenseEvidenceUrl=f'/robots/{m["id"]}/provenance.json',licenseNoticeUrl=f'/robots/{m["id"]}/LICENSE.txt')
 manifest=[i for i in manifest if i['id']!=m['id']]+[item]
 print(m['id'],item['jointCount'],item['linkCount'],len(records),item['downloadBytes'])
(PUB/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
