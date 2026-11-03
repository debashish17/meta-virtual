import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DESK, ELBOW_CLEAR, WRIST_CLEAR, keepHandsOnDesk } from "./deskReach";

const DOWN = new THREE.Vector3(0, -1, 0);
const A = 0.28; // upper arm
const B = 0.26; // forearm

/**
 * A seat frame (origin under the hips, +z to the desk) holding one left arm with its shoulder,
 * elbow and wrist where given, as the typing move leaves it before the reach fix.
 */
function arm(shoulder: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3) {
  const frame = new THREE.Group();
  const model = new THREE.Group();
  frame.add(model);
  const upper = new THREE.Bone();
  upper.name = "LeftArm";
  upper.position.copy(shoulder);
  model.add(upper);
  const fore = new THREE.Bone();
  fore.name = "LeftForeArm";
  fore.position.set(0, -A, 0);
  upper.add(fore);
  const hand = new THREE.Bone();
  hand.name = "LeftHand";
  hand.position.set(0, -B, 0);
  fore.add(hand);
  upper.quaternion.setFromUnitVectors(DOWN, elbow.clone().sub(shoulder).normalize());
  const foreWorld = new THREE.Quaternion().setFromUnitVectors(DOWN, wrist.clone().sub(elbow).normalize());
  fore.quaternion.copy(upper.quaternion.clone().invert().multiply(foreWorld));
  frame.updateMatrixWorld(true);
  const at = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  return { frame, model, at, upper, fore, hand };
}

/** The elbow `A` from the shoulder at height `elbowY`, in the vertical plane through x = 0.2. */
function typingArm(elbowY: number, wristY: number) {
  const shoulder = new THREE.Vector3(0.2, 0.98, 0.05);
  const elbow = new THREE.Vector3(0.2, elbowY, 0.05 + Math.sqrt(A * A - (0.98 - elbowY) ** 2));
  const wrist = new THREE.Vector3(0.2, wristY, elbow.z + Math.sqrt(B * B - (wristY - elbowY) ** 2));
  return { ...arm(shoulder, elbow, wrist), shoulder, elbow, wrist };
}

describe("keepHandsOnDesk", () => {
  it("lifts an elbow sunk into the desk above it, keeping the hand where it types", () => {
    const a = typingArm(0.72, 0.75); // elbow 3 cm into the desk, past its edge
    expect(a.elbow.z).toBeGreaterThan(DESK.edge);
    keepHandsOnDesk(a.model, a.frame);
    const s = a.at(a.upper), e = a.at(a.fore), w = a.at(a.hand);
    expect(e.y).toBeGreaterThanOrEqual(DESK.top + ELBOW_CLEAR - 1e-6);
    expect(w.y).toBeCloseTo(DESK.top + WRIST_CLEAR, 6);
    expect(w.x).toBeCloseTo(a.wrist.x, 6); // same place on the desk
    expect(w.z).toBeCloseTo(a.wrist.z, 6);
    expect(s.distanceTo(e)).toBeCloseTo(A, 6); // the bones keep their lengths
    expect(e.distanceTo(w)).toBeCloseTo(B, 6);
    // the whole forearm clears the desktop
    for (let k = 0; k <= 10; k += 1) {
      const p = e.clone().lerp(w, k / 10);
      if (p.z > DESK.edge) expect(p.y).toBeGreaterThanOrEqual(DESK.top + WRIST_CLEAR - 1e-6);
    }
  });

  it("leaves an arm already clear of the desk alone", () => {
    const a = typingArm(0.82, 0.8);
    const before = [a.at(a.fore), a.at(a.hand)];
    keepHandsOnDesk(a.model, a.frame);
    expect(a.at(a.fore).distanceTo(before[0])).toBeLessThan(1e-9);
    expect(a.at(a.hand).distanceTo(before[1])).toBeLessThan(1e-9);
  });

  it("leaves a hand resting on the lap, below the desk, alone", () => {
    const shoulder = new THREE.Vector3(0.2, 0.98, 0.05);
    const elbow = new THREE.Vector3(0.2, 0.71, 0.11);
    const wrist = new THREE.Vector3(0.2, 0.55, 0.3);
    const a = arm(shoulder, elbow.sub(shoulder).setLength(A).add(shoulder), wrist);
    const before = [a.at(a.fore), a.at(a.hand)];
    keepHandsOnDesk(a.model, a.frame);
    expect(a.at(a.fore).distanceTo(before[0])).toBeLessThan(1e-9);
    expect(a.at(a.hand).distanceTo(before[1])).toBeLessThan(1e-9);
  });
});
