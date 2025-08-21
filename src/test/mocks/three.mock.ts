// Comprehensive Three.js mock for testing

export class Vector3 {
  x: number;
  y: number;
  z: number;
  
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
  
  set(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }
  
  clone() {
    return new Vector3(this.x, this.y, this.z);
  }
  
  copy(v: Vector3) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }
  
  add(v: Vector3) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }
  
  sub(v: Vector3) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }
  
  addScaledVector(v: Vector3, s: number) {
    this.x += v.x * s;
    this.y += v.y * s;
    this.z += v.z * s;
    return this;
  }
  
  multiplyScalar(s: number) {
    this.x *= s;
    this.y *= s;
    this.z *= s;
    return this;
  }
  
  normalize() {
    const l = this.length();
    if (l > 0) {
      this.multiplyScalar(1 / l);
    }
    return this;
  }
  
  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  
  lengthSq() {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  
  distanceTo(v: Vector3) {
    return Math.sqrt(
      (this.x - v.x) ** 2 +
      (this.y - v.y) ** 2 +
      (this.z - v.z) ** 2
    );
  }
  
  applyAxisAngle(axis: Vector3, angle: number) {
    // Simplified rotation
    return this;
  }
  
  setScalar(s: number) {
    this.x = s;
    this.y = s;
    this.z = s;
    return this;
  }
}

export class Vector2 {
  x: number;
  y: number;
  
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

export class Color {
  r: number;
  g: number;
  b: number;
  
  constructor(color?: number | string) {
    this.r = 1;
    this.g = 1;
    this.b = 1;
    
    if (typeof color === 'number') {
      this.setHex(color);
    }
  }
  
  setHex(hex: number) {
    this.r = ((hex >> 16) & 0xff) / 255;
    this.g = ((hex >> 8) & 0xff) / 255;
    this.b = (hex & 0xff) / 255;
    return this;
  }
  
  clone() {
    return new Color();
  }
}

export class Euler {
  x: number;
  y: number;
  z: number;
  
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

export class Matrix4 {
  elements: number[];
  
  constructor() {
    this.elements = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];
  }
}

export class Object3D {
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
  children: Object3D[];
  parent: Object3D | null;
  visible: boolean;
  
  constructor() {
    this.position = new Vector3();
    this.rotation = new Euler();
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.visible = true;
  }
  
  add(...objects: Object3D[]) {
    for (const object of objects) {
      this.children.push(object);
      object.parent = this;
    }
    return this;
  }
  
  remove(...objects: Object3D[]) {
    for (const object of objects) {
      const index = this.children.indexOf(object);
      if (index !== -1) {
        this.children.splice(index, 1);
        object.parent = null;
      }
    }
    return this;
  }
  
  traverse(callback: (object: Object3D) => void) {
    callback(this);
    for (const child of this.children) {
      child.traverse(callback);
    }
  }
}

export class Group extends Object3D {}

export class Scene extends Object3D {
  fog: any;
  background: any;
}

export class BufferGeometry {
  attributes: any = {};
  
  setAttribute(name: string, attribute: any) {
    this.attributes[name] = attribute;
  }
  
  dispose() {}
  
  setDrawRange(start: number, count: number) {}
}

export class BufferAttribute {
  array: Float32Array;
  itemSize: number;
  needsUpdate: boolean = false;
  
  constructor(array: Float32Array, itemSize: number) {
    this.array = array;
    this.itemSize = itemSize;
  }
}

export class Material {
  transparent?: boolean;
  opacity?: number;
  color?: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  
  dispose() {}
}

export class MeshStandardMaterial extends Material {
  roughness?: number;
  metalness?: number;
  
  constructor(params?: any) {
    super();
    Object.assign(this, params);
  }
}

export class MeshBasicMaterial extends Material {
  constructor(params?: any) {
    super();
    Object.assign(this, params);
  }
}

export class PointsMaterial extends Material {
  size?: number;
  sizeAttenuation?: boolean;
  vertexColors?: boolean;
  blending?: number;
  depthWrite?: boolean;
  
  constructor(params?: any) {
    super();
    Object.assign(this, params);
  }
}

export class Mesh extends Object3D {
  geometry: BufferGeometry;
  material: Material | Material[];
  
  constructor(geometry?: BufferGeometry, material?: Material | Material[]) {
    super();
    this.geometry = geometry || new BufferGeometry();
    this.material = material || new MeshBasicMaterial();
  }
}

export class Points extends Object3D {
  geometry: BufferGeometry;
  material: Material;
  
  constructor(geometry?: BufferGeometry, material?: Material) {
    super();
    this.geometry = geometry || new BufferGeometry();
    this.material = material || new PointsMaterial();
  }
}

export class Light extends Object3D {
  intensity: number;
  color: Color;
  
  constructor(color?: number, intensity?: number) {
    super();
    this.color = new Color(color);
    this.intensity = intensity !== undefined ? intensity : 1;
  }
}

export class PointLight extends Light {
  distance: number;
  decay: number;
  userData: any = {};
  
  constructor(color?: number, intensity?: number, distance?: number, decay?: number) {
    super(color, intensity);
    this.distance = distance !== undefined ? distance : 0;
    this.decay = decay !== undefined ? decay : 1;
  }
}

export class AmbientLight extends Light {}
export class DirectionalLight extends Light {}

// Geometries
export class BoxGeometry extends BufferGeometry {
  constructor(width?: number, height?: number, depth?: number) {
    super();
  }
}

export class SphereGeometry extends BufferGeometry {
  constructor(radius?: number, widthSegments?: number, heightSegments?: number) {
    super();
  }
}

export class PlaneGeometry extends BufferGeometry {
  constructor(width?: number, height?: number) {
    super();
  }
}

export class ConeGeometry extends BufferGeometry {
  constructor(radius?: number, height?: number, radialSegments?: number) {
    super();
  }
}

export class DodecahedronGeometry extends BufferGeometry {
  constructor(radius?: number, detail?: number) {
    super();
  }
}

export class OctahedronGeometry extends BufferGeometry {
  constructor(radius?: number, detail?: number) {
    super();
  }
}

export class IcosahedronGeometry extends BufferGeometry {
  constructor(radius?: number, detail?: number) {
    super();
  }
}

// Camera
export class Camera extends Object3D {
  fov?: number;
  aspect?: number;
  near?: number;
  far?: number;
}

export class PerspectiveCamera extends Camera {
  constructor(fov?: number, aspect?: number, near?: number, far?: number) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
  }
  
  updateProjectionMatrix() {}
}

// Renderer
export class WebGLRenderer {
  domElement: any;
  shadowMap: any = { enabled: false };
  outputColorSpace: any;
  toneMapping: any;
  toneMappingExposure: number = 1;
  
  constructor(params?: any) {
    this.domElement = params?.canvas || {};
  }
  
  setSize(width: number, height: number) {}
  setPixelRatio(ratio: number) {}
  render(scene: Scene, camera: Camera) {}
  dispose() {}
}

// Math utilities
export const MathUtils = {
  clamp: (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(max, value));
  },
  degToRad: (degrees: number) => degrees * (Math.PI / 180),
  radToDeg: (radians: number) => radians * (180 / Math.PI),
};

// Constants
export const AdditiveBlending = 1;
export const NormalBlending = 0;
export const SubtractiveBlending = 2;
export const MultiplyBlending = 3;
export const CustomBlending = 4;

// Export everything as THREE namespace as well
const THREE = {
  Vector3,
  Vector2,
  Color,
  Euler,
  Matrix4,
  Object3D,
  Group,
  Scene,
  BufferGeometry,
  BufferAttribute,
  Material,
  MeshStandardMaterial,
  MeshBasicMaterial,
  PointsMaterial,
  Mesh,
  Points,
  Light,
  PointLight,
  AmbientLight,
  DirectionalLight,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  OctahedronGeometry,
  IcosahedronGeometry,
  Camera,
  PerspectiveCamera,
  WebGLRenderer,
  MathUtils,
  AdditiveBlending,
  NormalBlending,
  SubtractiveBlending,
  MultiplyBlending,
  CustomBlending,
};

export default THREE;