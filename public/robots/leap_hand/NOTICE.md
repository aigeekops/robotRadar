# LEAP Hand V1 simulation source audit

Pinned upstream: `leap-hand/LEAP_Hand_Sim` at `150bc3d4b61fd6619193ba5a8ef209f3609ced89`.

Only the official simulation URDF and its eight referenced STL meshes are staged in `model/`. Original bytes and SHA-256 are recorded per file in `audit.json`; MIT copyright/permission text is preserved in `LICENSE.txt`. The recursive upstream tree exposes no more-specific asset license or notice. Each imported binary STL header is zero-filled and contains no alternate notice.

This is a four-digit model (17 links, 16 revolute joints, no mimic joints), not Shadow or a five-finger hand. Finger groups are verified by parent/child chains; A/B/C describe source branch order, not assumed human finger identities.

No manufacturing CAD, fabrication drawings, printability certification, contact/grasp-force verification, or hardware-control claim is made. Upstream `.part` CAD files, left-hand archive, learned policies and object assets are not included in this staged model.
