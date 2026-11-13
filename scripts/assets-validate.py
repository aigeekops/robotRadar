"""Validate local robot assets and provenance without network access."""
from pathlib import Path
import hashlib,json,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
models=json.loads((ROOT/'public/robots/manifest.json').read_text())
results=[]
for model in models:
    folder=ROOT/'public/robots'/model['id']
    tree=ET.parse(folder/'robot.urdf').getroot()
    links={x.get('name') for x in tree.findall('link')}
    assert len(links)==len(tree.findall('link')), 'Duplicate link'
    children=set(); adjacency={x:[] for x in links}
    for joint in tree.findall('joint'):
        parent=joint.find('parent').get('link'); child=joint.find('child').get('link')
        assert parent in links and child in links, 'Invalid joint reference'
        assert child not in children, 'Multiple parent joints'
        children.add(child); adjacency[parent].append(child)
        if joint.get('type') in ['revolute','prismatic']:
            lim=joint.find('limit'); assert lim is not None
            assert float(lim.get('lower'))<=float(lim.get('upper')), 'Bad joint limits'
    roots=links-children
    assert len(roots)==1, 'Not a single rooted mechanism'
    visited=set()
    def visit(link):
        assert link not in visited, 'Cyclic joint graph'
        visited.add(link)
        for child in adjacency[link]: visit(child)
    visit(next(iter(roots)))
    assert visited==links
    for mesh in tree.findall('.//mesh'):
        file=ROOT/'public'/mesh.get('filename').lstrip('/')
        assert file.is_file(), f'Missing mesh: {file}'
        if file.suffix.lower()=='.dae':
            dae=ET.parse(file).getroot()
            ns={'c':'http://www.collada.org/2005/11/COLLADASchema'}
            for texture in dae.findall('.//c:library_images/c:image/c:init_from',ns):
                assert (file.parent/texture.text).is_file(), f'Missing texture: {texture.text}'
    provenance=json.loads((folder/'provenance.json').read_text())
    assert provenance.get('licenseAudit', {}).get('evidence'), 'Missing scoped licence evidence'
    for notice in provenance.get('distributionNotices', []):
        assert (folder/notice).is_file(), f'Missing distribution notice: {notice}'
    assert provenance.get('supportStatus'), 'Missing model-support boundary'
    for item in provenance['files']:
        assert item.get('license') and item.get('licenseEvidence'), 'Missing per-mesh licence evidence'
        assert hashlib.sha256((folder/item['file']).read_bytes()).hexdigest()==item['sha256']
    results.append({'id':model['id'],'links':len(links),'joints':len(tree.findall('joint')),'meshes':len(provenance['files']),'checks':'graph, limits, local meshes, DAE references, SHA-256 passed'})
print(json.dumps(results,indent=2))
