"""Rebuild browser assets from pinned official checkouts, without inventing geometry."""
from pathlib import Path
import hashlib, json, shutil, subprocess, xml.etree.ElementTree as ET
from assets_source_pins import verify, verify_all
import xacro
import xacro.substitution_args

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'assets-source'
PUBLIC = ROOT / 'public/robots'
# Verify every input before writing any runtime package.
verify_all(SOURCES)
packages = {
    'franka_description': SOURCES / 'franka_ros/franka_description',
    'ur_description': SOURCES / 'ur_description',
}
xacro.substitution_args._eval_find = lambda package: str(packages[package])

def expand(path, mappings):
    return xacro.process_file(str(path), mappings=mappings).toxml()

def version(repo):
    return verify(repo)

common_limit_zh = '仅核验官方描述文件的关节树与外观资源；未核验内部电路、电机内部、维修拆装顺序或实机精度。'
common_limit_en = 'Official description topology and visual resources only; no validation of internal electronics, motor internals, service disassembly or physical accuracy.'
models = [
    dict(id='g1', name={'zh':'宇树 G1 · 23 自由度 · Mode 10','en':'Unitree G1 · 23 DOF · Mode 10'}, manufacturer='Unitree', form='humanoid', file=SOURCES/'unitree_ros/robots/g1_description/g1_23dof_mode_10.urdf', repo=SOURCES/'unitree_ros', base=SOURCES/'unitree_ros/robots/g1_description', url='https://github.com/unitreerobotics/unitree_ros/tree/master/robots/g1_description', license='BSD-3-Clause', description={'zh':'官方 Mode 10（23 自由度）描述配置，观察双足、人形关节链与传感器布局。','en':'Official Mode 10 (23-DOF) description configuration for exploring biped kinematics and sensor layout.'}),
    dict(id='go2', name={'zh':'宇树 Go2','en':'Unitree Go2'}, manufacturer='Unitree', form='quadruped', file=SOURCES/'unitree_ros/robots/go2_description/urdf/go2_description.urdf', repo=SOURCES/'unitree_ros', base=SOURCES/'unitree_ros/robots/go2_description', url='https://github.com/unitreerobotics/unitree_ros/tree/master/robots/go2_description', license='BSD-3-Clause', description={'zh':'官方 Go2 描述模型，探索四条三关节腿；不声明对应某个零售配置。','en':'Official Go2 description with four three-joint legs; no retail variant equivalence is claimed.'}),
    dict(id='panda', name={'zh':'Franka Panda · 夹爪配置','en':'Franka Panda · With gripper'}, manufacturer='Franka Robotics', form='arm', file=SOURCES/'franka_ros/franka_description/robots/panda/panda.urdf.xacro', mappings={'hand':'true'}, repo=SOURCES/'franka_ros', base=SOURCES/'franka_ros/franka_description', url='https://github.com/frankarobotics/franka_ros/tree/develop/franka_description', license='Apache-2.0', description={'zh':'Panda 七轴机械臂与双指夹爪，展示冗余关节和末端机构；并非 FR3。','en':'Panda seven-axis arm and parallel gripper, illustrating redundancy and end-effector kinematics; not FR3.'}),
    dict(id='ur5e', name={'zh':'Universal Robots UR5e','en':'Universal Robots UR5e'}, manufacturer='Universal Robots', form='arm', file=SOURCES/'ur_description/urdf/ur.urdf.xacro', mappings={'name':'ur5e','ur_type':'ur5e','smart_panel':'false'}, repo=SOURCES/'ur_description', base=SOURCES/'ur_description', url='https://github.com/UniversalRobots/Universal_Robots_ROS2_Description', license='BSD-3-Clause', description={'zh':'UR5e 六轴协作臂，官方默认运动学参数；不代表特定实机标定。','en':'UR5e six-axis collaborative arm with official nominal kinematics, not calibration for a specific physical unit.'}),
    dict(id='fr3', name={'zh':'Franka Research 3 · Arm3R + Franka Hand','en':'Franka Research 3 · Arm3R + Franka Hand'}, manufacturer='Franka Robotics', form='arm', file=SOURCES/'franka_description_current/robots/fr3/fr3.urdf.xacro', mappings={'hand':'true','ee_id':'franka_hand','with_sc':'false'}, repo=SOURCES/'franka_description_current', base=SOURCES/'franka_description_current', url='https://github.com/frankarobotics/franka_description', license='Apache-2.0', description={'zh':'官方 Arm3R 配置，七轴机械臂与白色 Franka Hand。区别于 Panda、Arm3Rv2 与 Arm3Rv2.1。','en':'Official Arm3R configuration: seven-axis arm with the white Franka Hand. Distinct from Panda, Arm3Rv2 and Arm3Rv2.1.'}),
]
manifest = []
for model in models:
    target = PUBLIC/model['id']
    target.mkdir(parents=True, exist_ok=True)
    if model['id'] == 'fr3':
        packages['franka_description'] = SOURCES/'franka_description_current'
    else:
        packages['franka_description'] = SOURCES/'franka_ros/franka_description'
    text = expand(model['file'], model['mappings']) if 'mappings' in model else model['file'].read_text()
    tree = ET.fromstring(text)
    records = []
    for mesh in tree.findall('.//mesh'):
        uri = mesh.attrib['filename']
        rel = uri.split('package://', 1)[-1].split('/',1)[-1] if uri.startswith('package://') else uri
        src = model['base']/rel
        if not src.exists():
            src = model['base']/'meshes'/Path(rel).name
        if not src.is_file():
            raise FileNotFoundError((model['id'], uri, src))
        # Preserve hierarchy so visual and collision files cannot overwrite each other.
        dest_rel = src.relative_to(model['base'])
        dest = target/dest_rel
        dest.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(src,dest)
        mesh.set('filename',f'/robots/{model["id"]}/{dest_rel.as_posix()}')
        records.append({'file':dest_rel.as_posix(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size})
    ET.indent(tree)
    ET.ElementTree(tree).write(target/'robot.urdf', encoding='utf-8',xml_declaration=True)
    shutil.copy2(model['repo']/'LICENSE', target/'LICENSE.txt')
    joints=[]
    for j in tree.findall('joint'):
        limit=j.find('limit'); origin=j.find('origin'); axis=j.find('axis')
        joints.append({'id':j.attrib['name'],'type':j.attrib['type'],'parent':j.find('parent').get('link'),'child':j.find('child').get('link'),'axis':axis.get('xyz') if axis is not None else '1 0 0','origin':dict(origin.attrib) if origin is not None else {},'limit':dict(limit.attrib) if limit is not None else {}})
    source={'repository':model['url'],'commit':version(model['repo']),'sourceFile':str(model['file'].relative_to(model['repo'])),'sourceSha256':hashlib.sha256(model['file'].read_bytes()).hexdigest(),'license':model['license'],'method':'Official URDF or expanded vendor Xacro; mesh paths rewritten only. Visual meshes retained. No new geometry.','files':list({r['file']:r for r in records}.values()),'joints':joints}
    (target/'provenance.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'content/robots'/f'{model["id"]}.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
    item={key:model[key] for key in ['id','name','manufacturer','form','description','license']}
    item.update(urdfUrl=f'/robots/{model["id"]}/robot.urdf',sourceUrl=model['url'],sourceCommit=source['commit'],provenanceUrl=f'/robots/{model["id"]}/provenance.json',verifiedScope={'zh':'官方描述模型 · 外观资源与关节树','en':'Official description · visual resources and joint topology'},limitations={'zh':common_limit_zh,'en':common_limit_en},jointCount=sum(j['type'] not in ['fixed'] for j in joints),linkCount=len(tree.findall('link')),downloadBytes=sum(r['bytes'] for r in source['files']))
    manifest.append(item)
    print(model['id'],len(source['files']),item['jointCount'],item['downloadBytes'])
(PUBLIC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

# Include the separately pinned open-hardware teaching model.
subprocess.run(['python3', str(ROOT/'scripts/assets-so101-publish.py')], check=True)

# Keep scoped licence and support notices reproducible after every import.
subprocess.run(['python3', str(ROOT/'scripts/assets-license-audit.py')], check=True)

# Additional pinned humanoid and mobile models; append after base licence audit.
subprocess.run([__import__("sys").executable, str(ROOT/"scripts/assets-expand-publish.py")], check=True)
