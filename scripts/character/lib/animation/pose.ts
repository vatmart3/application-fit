/**
 * Solveur de poses : décrit une pose avec des intentions (rotation du bassin,
 * flexion du dos, cibles IK des poignets/chevilles, fermeture des mains...)
 * et la convertit en rotations locales d'os.
 *
 * Rappel du repère : Y vers le haut, le héros regarde +Z, sa gauche est +X.
 * Les rotations de repos sont l'identité : une rotation locale s'exprime
 * dans les axes du monde "tels qu'au repos".
 */
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Bone } from "../skeleton";
import { FINGERS } from "../../../../src/avatar/contract";

export type V3 = [number, number, number];
/** Angles en degrés, ordre XYZ. */
export type Deg = [number, number, number];

const D2R = Math.PI / 180;
export const q = (e?: Deg) =>
  e ? new Quaternion().setFromEuler(new Euler(e[0] * D2R, e[1] * D2R, e[2] * D2R, "XYZ")) : new Quaternion();
const v = (a: V3) => new Vector3(a[0], a[1], a[2]);

export type Grip = "fist" | "relaxed" | "open" | "grip" | "point";

export interface Ctx {
  /** Position monde d'un os déjà résolu (tête de l'os). */
  pos(bone: string): Vector3;
  rot(bone: string): Quaternion;
  /** Point exprimé dans le repère du thorax (Spine2) → monde. */
  chest(local: V3): Vector3;
}

export interface ArmSpec {
  /** Cible du poignet (monde) ou fonction du contexte (positions déjà résolues). */
  ik: V3 | ((ctx: Ctx) => Vector3);
  /** Direction vers laquelle pointe le coude (monde). */
  pole: V3;
  /** Rotation locale de la main (relative à l'avant-bras). */
  hand?: Deg;
  grip?: Grip | number;
}
export interface LegSpec {
  ik: V3 | ((ctx: Ctx) => Vector3);
  /** Direction vers laquelle pointe le genou (monde). */
  pole: V3;
  /** Orientation monde du pied (relative au repos). */
  foot?: Deg;
  toe?: number;
}
export interface Pose {
  hips?: { offset?: V3; rot?: Deg };
  spine?: Deg;
  spine1?: Deg;
  spine2?: Deg;
  neck?: Deg;
  head?: Deg;
  eyes?: Deg;
  shoulderL?: Deg;
  shoulderR?: Deg;
  armL: ArmSpec;
  armR: ArmSpec;
  legL: LegSpec;
  legR: LegSpec;
  /** Position/rotation monde de la barre ou fonction du contexte. */
  prop?: { pos: V3 | ((ctx: Ctx) => Vector3); rot?: Deg };
}

export interface Solved {
  local: Map<string, Quaternion>;
  hipsPos: Vector3;
  propPos: Vector3;
}

const GRIPS: Record<Grip, [number, number, number, number]> = {
  // [phalange 1, 2, 3, pouce]
  open: [2, 2, 2, 0],
  relaxed: [18, 25, 18, 10],
  grip: [55, 75, 45, 30],
  fist: [80, 100, 70, 45],
  point: [80, 100, 70, 45],
};

export class Rig {
  readonly byName: Map<string, Bone>;
  private fingerAxis = new Map<string, Vector3>();

  constructor(readonly bones: Bone[]) {
    this.byName = new Map(bones.map((b) => [b.name, b]));
    for (const side of ["Left", "Right"] as const) {
      const W = this.head(`${side}Hand`);
      const I = this.head(`${side}HandIndex1`);
      const Pk = this.head(`${side}HandPinky1`);
      const n = new Vector3().crossVectors(I.clone().sub(W), Pk.clone().sub(W)).normalize();
      // Le côté paume est celui vers lequel pointe l'extrémité du pouce.
      const thumbTip = v(this.byName.get(`${side}HandThumb3`)!.tail);
      if (thumbTip.clone().sub(W).dot(n) < 0) n.negate();
      for (const finger of FINGERS) {
        for (let k = 1; k <= 3; k++) {
          const b = this.byName.get(`${side}Hand${finger}${k}`)!;
          const d = v(b.tail).sub(v(b.head)).normalize();
          this.fingerAxis.set(b.name, new Vector3().crossVectors(d, n).normalize());
        }
      }
    }
  }

  head(name: string) {
    return v(this.byName.get(name)!.head);
  }
  length(a: string, b: string) {
    return this.head(a).distanceTo(this.head(b));
  }
  restDir(a: string, b: string) {
    return this.head(b).sub(this.head(a)).normalize();
  }

  /** Mesures utiles à l'écriture des clips. */
  get m() {
    const h = (n: string): V3 => this.byName.get(n)!.head;
    return {
      pelvis: h("Hips"),
      chest: h("Spine2"),
      neck: h("Neck"),
      head: h("Head"),
      shoulderL: h("LeftArm"),
      shoulderR: h("RightArm"),
      hipL: h("LeftUpLeg"),
      hipR: h("RightUpLeg"),
      ankleL: h("LeftFoot"),
      ankleR: h("RightFoot"),
      armLen: this.length("LeftArm", "LeftForeArm") + this.length("LeftForeArm", "LeftHand"),
      legLen: this.length("LeftUpLeg", "LeftLeg") + this.length("LeftLeg", "LeftFoot"),
    };
  }

  solve(pose: Pose): Solved {
    const local = new Map<string, Quaternion>();
    const wRot = new Map<string, Quaternion>();
    const wPos = new Map<string, Vector3>();
    for (const b of this.bones) local.set(b.name, new Quaternion());

    const hipsPos = this.head("Hips").add(v(pose.hips?.offset ?? [0, 0, 0]));
    local.set("Hips", q(pose.hips?.rot));
    wRot.set("Hips", local.get("Hips")!.clone());
    wPos.set("Hips", hipsPos.clone());

    /** FK : propage la transformation monde d'un os à partir de son parent. */
    const fk = (name: string) => {
      const b = this.byName.get(name)!;
      const pr = wRot.get(b.parent!)!;
      const pp = wPos.get(b.parent!)!;
      const offset = this.head(name).sub(this.head(b.parent!)).applyQuaternion(pr);
      wPos.set(name, pp.clone().add(offset));
      wRot.set(name, pr.clone().multiply(local.get(name)!));
    };
    const setLocal = (name: string, e?: Deg) => {
      local.set(name, q(e));
      fk(name);
    };

    setLocal("Spine", pose.spine);
    setLocal("Spine1", pose.spine1);
    setLocal("Spine2", pose.spine2);
    setLocal("Neck", pose.neck);
    setLocal("Head", pose.head);
    setLocal("LeftEye", pose.eyes);
    setLocal("RightEye", pose.eyes);
    setLocal("LeftShoulder", pose.shoulderL);
    setLocal("RightShoulder", pose.shoulderR);

    const ctx: Ctx = {
      pos: (n) => wPos.get(n)!.clone(),
      rot: (n) => wRot.get(n)!.clone(),
      chest: (p) => {
        const r = wRot.get("Spine2")!;
        return wPos.get("Spine2")!.clone().add(v(p).applyQuaternion(r));
      },
    };

    // ── Bras ────────────────────────────────────────────────────────────
    for (const side of ["Left", "Right"] as const) {
      const spec = side === "Left" ? pose.armL : pose.armR;
      const upper = `${side}Arm`,
        fore = `${side}ForeArm`,
        hand = `${side}Hand`;
      fk(upper); // position de l'épaule (rotation locale provisoire identité)
      const target = typeof spec.ik === "function" ? spec.ik(ctx) : v(spec.ik);
      const restU = this.restDir(upper, fore),
        restL = this.restDir(fore, hand);
      const hingeRest = new Vector3().crossVectors(restU, restL).normalize();
      this.twoBone(upper, fore, hand, target, v(spec.pole), restU, restL, hingeRest, hingeRest, local, wRot, wPos, fk);
      local.set(hand, q(spec.hand));
      fk(hand);
      this.fingers(side, spec.grip ?? "relaxed", local, fk);
    }

    // ── Jambes ──────────────────────────────────────────────────────────
    for (const side of ["Left", "Right"] as const) {
      const spec = side === "Left" ? pose.legL : pose.legR;
      const up = `${side}UpLeg`,
        leg = `${side}Leg`,
        foot = `${side}Foot`;
      fk(up);
      const target = typeof spec.ik === "function" ? spec.ik(ctx) : v(spec.ik);
      const restU = this.restDir(up, leg),
        restL = this.restDir(leg, foot);
      const h0 = new Vector3(1, 0, 0);
      const hU = h0.clone().sub(restU.clone().multiplyScalar(h0.dot(restU))).normalize();
      const hL = h0.clone().sub(restL.clone().multiplyScalar(h0.dot(restL))).normalize();
      this.twoBone(up, leg, foot, target, v(spec.pole), restU, restL, hU, hL, local, wRot, wPos, fk);
      // Pied : orientation monde voulue → locale.
      const footWorld = q(spec.foot);
      local.set(foot, wRot.get(leg)!.clone().invert().multiply(footWorld));
      fk(foot);
      setLocal(`${side}ToeBase`, [spec.toe ?? 0, 0, 0]);
    }

    // ── Prop ────────────────────────────────────────────────────────────
    // Position neutre (cachée) proche des mains : évite que la barre traverse le sol pendant les fondus.
    let propPos = new Vector3(0, 1.0, 0.25);
    if (pose.prop) {
      propPos = typeof pose.prop.pos === "function" ? pose.prop.pos(ctx) : v(pose.prop.pos);
      local.set("Prop", q(pose.prop.rot));
    }
    return { local, hipsPos, propPos };
  }

  /** IK analytique à deux os avec conservation du plan de flexion anatomique. */
  private twoBone(
    a: string,
    b: string,
    c: string,
    target: Vector3,
    pole: Vector3,
    restU: Vector3,
    restL: Vector3,
    hingeRestU: Vector3,
    hingeRestL: Vector3,
    local: Map<string, Quaternion>,
    wRot: Map<string, Quaternion>,
    wPos: Map<string, Vector3>,
    fk: (n: string) => void,
  ) {
    const A = wPos.get(a)!;
    const l1 = this.length(a, b),
      l2 = this.length(b, c);
    const d = target.clone().sub(A);
    const dist = Math.min(Math.max(d.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995);
    const dn = d.normalize();
    const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pn = pole.clone().sub(dn.clone().multiplyScalar(pole.dot(dn)));
    if (pn.lengthSq() < 1e-8) pn.set(0, 0, 1);
    pn.normalize();
    const B = A.clone().add(dn.clone().multiplyScalar(l1 * cosA)).add(pn.clone().multiplyScalar(l1 * sinA));
    const T = A.clone().add(dn.clone().multiplyScalar(dist));
    const uDir = B.clone().sub(A).normalize();
    const lDir = T.clone().sub(B).normalize();
    const hinge = new Vector3().crossVectors(uDir, lDir);
    if (hinge.lengthSq() < 1e-10) hinge.crossVectors(dn, pn);
    hinge.normalize();
    const frame = (dir: Vector3, h: Vector3) =>
      new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(dir, h, new Vector3().crossVectors(dir, h)));
    const wU = frame(uDir, hinge).multiply(frame(restU, hingeRestU).invert());
    const wL = frame(lDir, hinge).multiply(frame(restL, hingeRestL).invert());
    const parent = this.byName.get(a)!.parent!;
    local.set(a, wRot.get(parent)!.clone().invert().multiply(wU));
    fk(a);
    local.set(b, wU.clone().invert().multiply(wL));
    fk(b);
  }

  private fingers(side: "Left" | "Right", grip: Grip | number, local: Map<string, Quaternion>, fk: (n: string) => void) {
    const g: [number, number, number, number] =
      typeof grip === "number"
        ? (GRIPS.fist.map((x, i) => GRIPS.relaxed[i] + (x - GRIPS.relaxed[i]) * grip) as [number, number, number, number])
        : GRIPS[grip];
    for (const finger of FINGERS) {
      for (let k = 1; k <= 3; k++) {
        const name = `${side}Hand${finger}${k}`;
        // Le pouce se replie dans l'autre sens (opposition) et moins fort.
        let angle = finger === "Thumb" ? -g[3] * (k === 1 ? 0.2 : 0.6) : g[k - 1];
        if (grip === "point" && finger === "Index") angle = 5;
        local.set(name, new Quaternion().setFromAxisAngle(this.fingerAxis.get(name)!, angle * D2R));
        fk(name);
      }
    }
  }
}
