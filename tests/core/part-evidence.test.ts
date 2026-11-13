import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parsePartEvidence } from "../../src/core/partEvidence.ts";
for (const id of ["g1", "go2", "panda", "ur5e", "fr3", "so101"])
  test(`${id}: evidence matches independent XML parser for every link/joint`, () => {
    const path = `public/robots/${id}/robot.urdf`;
    const actual = parsePartEvidence(readFileSync(path, "utf8"));
    const expected = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          `import xml.etree.ElementTree as E,json,sys
r=E.parse(sys.argv[1]).getroot()
links={}
for l in r.findall('link'):
 i=l.find('inertial'); m=i.find('mass') if i is not None else None; o=i.find('origin') if i is not None else None
 links[l.get('name')]={'visualCount':len(l.findall('visual')),'collisionCount':len(l.findall('collision')),'massKg':float(m.get('value')) if m is not None else None,'centerOfMassM':[float(x) for x in o.get('xyz').split()] if o is not None and o.get('xyz') else None}
joints=[]
for j in r.findall('joint'):
 a=j.find('axis'); l=j.find('limit'); t=j.get('type')
 joints.append({'name':j.get('name'),'type':t,'parent':j.find('parent').get('link'),'child':j.find('child').get('link'),'axis':[float(x) for x in a.get('xyz').split()] if a is not None else None,'lower':float(l.get('lower')) if l is not None and l.get('lower') is not None else None,'upper':float(l.get('upper')) if l is not None and l.get('upper') is not None else None,'unit':'rad' if t in ['revolute','continuous'] else 'm' if t=='prismatic' else None})
for source,entry in zip(r.findall('joint'),joints):
 if source.find('mimic') is not None:entry['mimic']=True
print(json.dumps({'links':links,'joints':joints}))`,
          path,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.deepEqual(actual.joints, expected.joints);
    assert.deepEqual(Object.keys(actual.links), Object.keys(expected.links));
    for (const [name, link] of Object.entries(actual.links)) {
      const { name: n, upstream, downstream, ...fields } = link;
      assert.equal(n, name);
      assert.deepEqual(fields, expected.links[name]);
      assert.deepEqual(
        upstream,
        actual.joints.filter((j) => j.child === name),
      );
      assert.deepEqual(
        downstream,
        actual.joints.filter((j) => j.parent === name),
      );
    }
  });
test("missing/invalid mass is unknown, explicit zero remains zero", () => {
  const e = parsePartEvidence(
    `<robot><link name="a"/><link name="b"><inertial><mass value="0"/></inertial></link><link name="c"><inertial><mass value="NaN"/><origin xyz="1 Infinity 3"/></inertial></link><link name="d"><inertial><mass value="-1"/></inertial></link></robot>`,
  );
  assert.equal(e.links.a.massKg, null);
  assert.equal(e.links.b.massKg, 0);
  assert.equal(e.links.c.massKg, null);
  assert.equal(e.links.c.centerOfMassM, null);
  assert.equal(e.links.d.massKg, null);
});
test("fixed/continuous/prismatic units do not fabricate limits or axes", () => {
  const e = parsePartEvidence(
    `<robot><link name="a"/><link name="b"/><link name="c"/><link name="d"/><joint name="j1" type="fixed"><parent link="a"/><child link="b"/></joint><joint name="j2" type="continuous"><parent link="b"/><child link="c"/></joint><joint name="j3" type="prismatic"><parent link="c"/><child link="d"/><limit lower="0" upper="0.04"/></joint></robot>`,
  );
  assert.equal(e.joints[0].unit, null);
  assert.equal(e.joints[1].unit, "rad");
  assert.equal(e.joints[1].lower, null);
  assert.equal(e.joints[1].axis, null);
  assert.equal(e.joints[2].unit, "m");
});
test("rejects malicious XML, invalid topology and bounded resource abuse", () => {
  for (const input of [
    '<!DOCTYPE robot [<!ENTITY x SYSTEM "file:///etc/passwd">]><robot/>',
    '<robot><link name="&evil;"/></robot>',
    '<robot><link name="a"></robot>',
    '<robot><link name="a"/><link name="a"/></robot>',
    '<robot><link name="a"/><joint name="j" type="fixed"><parent link="a"/><child link="missing"/></joint></robot>',
    '<robot><link name="a"/><link name="b"/><joint name="j" type="fixed"><parent link="a"/><child link="b"/></joint><joint name="k" type="fixed"><parent link="b"/><child link="a"/></joint></robot>',
    "x".repeat(2_000_001),
  ])
    assert.throws(() => parsePartEvidence(input));
});
test("prototype-like identifiers remain inert data", () => {
  const e = parsePartEvidence(
    '<robot><link name="__proto__"/><link name="constructor"/></robot>',
  );
  assert.equal(e.links.__proto__.massKg, null);
  assert.equal(Object.getPrototypeOf(e.links), null);
});
