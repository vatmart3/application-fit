/**
 * Écriture du GLB avec glTF-Transform : squelette, skin, meshes skinnés avec
 * morph targets (POSITION + NORMAL), attributs custom, matériaux, animations.
 */
import { type Accessor, Document, type Material, type Mesh, type Node, type Skin } from "@gltf-transform/core";

type AccessorType = "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT4";
import type { Bone } from "./skeleton";

export interface MeshData {
  name: string;
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs?: Float32Array;
  indices: Uint32Array;
  joints: Uint16Array;
  weights: Float32Array;
  /** Attributs supplémentaires (nom glTF → [données, taille]). */
  extra?: Record<string, [Float32Array, 1 | 2 | 3 | 4]>;
  /** Morphs : nom → deltas position / normale. */
  morphs: { name: string; position: Float32Array; normal: Float32Array }[];
  visible?: boolean;
}

export interface MaterialDef {
  name: string;
  color: [number, number, number, number];
  roughness: number;
  metalness: number;
  doubleSided?: boolean;
}

export interface Track {
  bone: string;
  path: "rotation" | "translation";
  times: Float32Array;
  values: Float32Array;
}
export interface ClipData {
  name: string;
  tracks: Track[];
}

export class HeroDocument {
  readonly doc = new Document();
  private buffer = this.doc.createBuffer();
  private scene = this.doc.createScene("Hero");
  readonly root: Node;
  private joints = new Map<string, Node>();
  private skin!: Skin;
  private materials = new Map<string, Material>();

  constructor() {
    this.root = this.doc.createNode("Hero");
    this.scene.addChild(this.root);
    this.doc.getRoot().setDefaultScene(this.scene);
    this.doc.getRoot().getAsset().generator = "MUE character pipeline (MakeHuman CC0)";
  }

  private accessor(name: string, array: Float32Array | Uint16Array | Uint32Array, type: AccessorType): Accessor {
    return this.doc
      .createAccessor(name)
      .setArray(array as Parameters<Accessor["setArray"]>[0])
      .setType(type)
      .setBuffer(this.buffer);
  }

  /** Crée la hiérarchie d'os (rotations de repos identité) + le skin. */
  addSkeleton(bones: Bone[]) {
    const armature = this.doc.createNode("Armature");
    this.root.addChild(armature);
    const byName = new Map(bones.map((b) => [b.name, b]));
    for (const b of bones) {
      const parent = b.parent ? byName.get(b.parent)! : null;
      const t = parent ? [b.head[0] - parent.head[0], b.head[1] - parent.head[1], b.head[2] - parent.head[2]] : b.head;
      const node = this.doc.createNode(b.name).setTranslation([t[0], t[1], t[2]]);
      this.joints.set(b.name, node);
      (parent ? this.joints.get(parent.name)! : armature).addChild(node);
    }
    const ibm = new Float32Array(bones.length * 16);
    bones.forEach((b, i) => {
      // Inverse de la matrice monde de repos = translation opposée (rotation identité).
      ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.head[0], -b.head[1], -b.head[2], 1], i * 16);
    });
    this.skin = this.doc.createSkin("HeroSkin").setInverseBindMatrices(this.accessor("ibm", ibm, "MAT4"));
    for (const b of bones) this.skin.addJoint(this.joints.get(b.name)!);
  }

  addMaterial(def: MaterialDef) {
    const m = this.doc
      .createMaterial(def.name)
      .setBaseColorFactor(def.color)
      .setRoughnessFactor(def.roughness)
      .setMetallicFactor(def.metalness)
      .setDoubleSided(!!def.doubleSided);
    this.materials.set(def.name, m);
  }

  addMesh(data: MeshData): Mesh {
    const mat = this.materials.get(data.material);
    if (!mat) throw new Error(`Matériau inconnu : ${data.material}`);
    const prim = this.doc
      .createPrimitive()
      .setMaterial(mat)
      .setIndices(this.accessor(`${data.name}_idx`, data.indices, "SCALAR"))
      .setAttribute("POSITION", this.accessor(`${data.name}_pos`, data.positions, "VEC3"))
      .setAttribute("NORMAL", this.accessor(`${data.name}_nrm`, data.normals, "VEC3"))
      .setAttribute("JOINTS_0", this.accessor(`${data.name}_j`, data.joints, "VEC4"))
      .setAttribute("WEIGHTS_0", this.accessor(`${data.name}_w`, data.weights, "VEC4"));
    if (data.uvs) prim.setAttribute("TEXCOORD_0", this.accessor(`${data.name}_uv`, data.uvs, "VEC2"));
    for (const [attr, [arr, size]] of Object.entries(data.extra ?? {})) {
      const type = (["SCALAR", "VEC2", "VEC3", "VEC4"] as const)[size - 1];
      prim.setAttribute(attr, this.accessor(`${data.name}${attr}`, arr, type));
    }
    for (const m of data.morphs) {
      const t = this.doc
        .createPrimitiveTarget(m.name)
        .setAttribute("POSITION", this.accessor(`${data.name}_${m.name}_dp`, m.position, "VEC3"))
        .setAttribute("NORMAL", this.accessor(`${data.name}_${m.name}_dn`, m.normal, "VEC3"));
      prim.addTarget(t);
    }
    const mesh = this.doc.createMesh(data.name).addPrimitive(prim);
    if (data.morphs.length) {
      mesh.setWeights(data.morphs.map(() => 0));
      mesh.setExtras({ targetNames: data.morphs.map((m) => m.name) });
    }
    const node = this.doc.createNode(data.name).setMesh(mesh).setSkin(this.skin);
    if (data.visible === false) node.setExtras({ hidden: true });
    this.root.addChild(node);
    return mesh;
  }

  addClip(clip: ClipData) {
    const anim = this.doc.createAnimation(clip.name);
    for (const tr of clip.tracks) {
      const node = this.joints.get(tr.bone);
      if (!node) throw new Error(`Os inconnu dans le clip ${clip.name} : ${tr.bone}`);
      const sampler = this.doc
        .createAnimationSampler()
        .setInput(this.accessor(`${clip.name}_${tr.bone}_${tr.path}_t`, tr.times, "SCALAR"))
        .setOutput(this.accessor(`${clip.name}_${tr.bone}_${tr.path}_v`, tr.values, tr.path === "rotation" ? "VEC4" : "VEC3"))
        .setInterpolation("LINEAR");
      const channel = this.doc.createAnimationChannel().setTargetNode(node).setTargetPath(tr.path).setSampler(sampler);
      anim.addSampler(sampler).addChannel(channel);
    }
  }
}
