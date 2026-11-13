import * as THREE from "three";

/** Authored product-photography finish. Geometry, source colours and texture maps are retained.
 * These optical values are presentation choices, not measured manufacturer material data. */
export function photographicMaterial(source: THREE.Material): THREE.Material {
  if (source instanceof THREE.MeshStandardMaterial) {
    const material = source.clone();
    material.envMapIntensity = 0.8;
    return material;
  }
  if (
    !(source instanceof THREE.MeshPhongMaterial) &&
    !(source instanceof THREE.MeshLambertMaterial)
  )
    return source.clone();
  const brightness = Math.max(source.color.r, source.color.g, source.color.b);
  const material = new THREE.MeshStandardMaterial({
    name: source.name,
    color: source.color.clone(),
    map: source.map,
    alphaMap: source.alphaMap,
    aoMap: source.aoMap,
    aoMapIntensity: source.aoMapIntensity,
    emissive: source.emissive.clone(),
    emissiveMap: source.emissiveMap,
    emissiveIntensity: source.emissiveIntensity,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: source.depthWrite,
    vertexColors: source.vertexColors,
    roughness: brightness < 0.055 ? 0.31 : 0.36,
    metalness: brightness < 0.055 ? 0.2 : 0.08,
    envMapIntensity: 0.85,
  });
  if (source instanceof THREE.MeshPhongMaterial) {
    material.normalMap = source.normalMap;
    material.normalScale.copy(source.normalScale);
    material.bumpMap = source.bumpMap;
    material.bumpScale = source.bumpScale;
  }
  return material;
}

/** Locally authored linear HDR softboxes, not a photographed manufacturer environment. */
function softboxEnvironment() {
  const width = 256,
    height = 128;
  const data = new Float32Array(width * height * 4);
  const softBox = (
    u: number,
    v: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    const edge = Math.max(Math.abs((u - x) / w), Math.abs((v - y) / h));
    return 1 - THREE.MathUtils.smoothstep(edge, 0.85, 1);
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const u = x / width,
        v = y / height;
      const base = v < 0.5 ? 0.12 : 0.035;
      const warm = softBox(u, v, 0.22, 0.29, 0.065, 0.21) * 5.5;
      const cool = softBox(u, v, 0.69, 0.3, 0.035, 0.22) * 3.5;
      const top = softBox(u, v, 0.48, 0.1, 0.2, 0.045) * 2;
      const i = (y * width + x) * 4;
      data[i] = base + warm + cool * 0.82 + top;
      data[i + 1] = base + warm * 0.94 + cool * 0.93 + top;
      data[i + 2] = base + warm * 0.84 + cool + top;
      data[i + 3] = 1;
    }
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

/** Three-point studio lighting plus real specular image-based reflections, with no remote assets. */
export function installPhotographicLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  options: { deferEnvironment?: boolean } = {},
) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  let target: THREE.WebGLRenderTarget | null = null;
  const prepareEnvironment = () => {
    if (target) return;
    const generator = new THREE.PMREMGenerator(renderer);
    const environment = softboxEnvironment();
    target = generator.fromEquirectangular(environment);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.3;
    environment.dispose();
    generator.dispose();
  };
  if (!options.deferEnvironment) prepareEnvironment();
  const ambient = new THREE.HemisphereLight(0xe7e9eb, 0x3c3935, 0.22);
  const key = new THREE.DirectionalLight(0xfff0db, 2.5);
  key.position.set(3, 5, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.006;
  key.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xc7d8e5, 0.35);
  fill.position.set(-4, 2, 2);
  const rim = new THREE.DirectionalLight(0xd7e9f4, 1.6);
  rim.position.set(-2, 4, -4);
  scene.add(ambient, key, key.target, fill, rim);
  return {
    prepareEnvironment,
    fit(radius: number, center = new THREE.Vector3(0, radius * 0.5, 0)) {
      const extent = Math.max(radius * 4.2, 0.5);
      key.position
        .copy(center)
        .add(new THREE.Vector3(3, 5, 4).multiplyScalar(radius));
      key.target.position.copy(center);
      Object.assign(key.shadow.camera, {
        left: -extent,
        right: extent,
        top: extent,
        bottom: -extent,
        near: 0.05,
        far: radius * 14,
      });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.normalBias = radius * 0.0045;
    },
    dispose() {
      scene.environment = null;
      target?.dispose();
      scene.remove(ambient, key, key.target, fill, rim);
      key.dispose();
    },
  };
}

/** Collect only textures owned by this loaded scene; conversion may share them within that scene. */
export function collectMaterialTextures(
  material: THREE.Material,
  textures: Set<THREE.Texture>,
) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value);
  }
}
