import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvatarLook, Pose } from "@office/shared";
import Person, { type Motion } from "../office/Person.js";
import { startNet, stopNet } from "./connection.js";
import { SnapshotBuffer } from "./interp.js";
import { sameRemoteAppearance } from "./remoteAppearance.js";
import { useNet } from "./store.js";

/**
 * The other people in the office (P2-B task 3): one `Person` per remote player (and per
 * npc, once P3-A syncs them), each drawn from a snapshot buffer `INTERP_DELAY_MS` behind
 * so movement slides smoothly, with jumps snapping so `Person`'s cut lines up. Name pills
 * match the colleagues' style. This slot also starts the room connection: with no server
 * it quietly stays single-player and renders nothing.
 */

function seedOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface RemoteProps {
  id: string;
  kind: "player" | "npc";
  name: string;
  look: AvatarLook;
  x: number;
  z: number;
  facing: number;
  pose: Pose;
  speed: number;
}

function RemotePerson({ id, kind, name, look, x, z, facing, pose, speed }: RemoteProps) {
  const group = useRef<THREE.Group>(null);
  const label = useRef<THREE.Group>(null);
  const motion = useRef<Motion>({ pose, speed });
  const buffer = useMemo(() => new SnapshotBuffer(), []);
  const seed = useMemo(() => seedOf(id), [id]);

  // Snapshots flow through a store subscription, not through rendering: the memo
  // below skips the 20 Hz movement patches, so a render-driven feed would starve.
  useEffect(() => {
    let last = "";
    return useNet.subscribe((state) => {
      const view = kind === "player" ? state.players[id] : state.npcs[id];
      if (!view) return;
      const key = `${view.x}|${view.z}|${view.facing}|${view.pose}|${view.speed}`;
      if (key === last) return;
      last = key;
      buffer.push({
        t: performance.now(),
        x: view.x,
        z: view.z,
        facing: view.facing,
        pose: view.pose,
        speed: view.speed,
      });
    });
  }, [buffer, id, kind]);

  useFrame(() => {
    const s = buffer.sample(performance.now());
    if (!s) return;
    group.current?.position.set(s.x, 0, s.z);
    if (group.current) group.current.rotation.y = s.facing;
    motion.current.pose = s.pose;
    motion.current.speed = s.speed;
    const seated = s.pose === "type" || s.pose === "sit_talk" || s.pose === "seated";
    label.current?.position.setY(seated ? 1.45 : look.height + 0.3);
  });

  return (
    <group ref={group} position={[x, 0, z]} rotation-y={facing}>
      <Person look={look} motion={motion.current} seed={seed} />
      <group ref={label} position={[0, look.height + 0.3, 0]}>
        <Html center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
          <div className="office-name colleague" data-testid="remote-name">
            {name}
          </div>
        </Html>
      </group>
    </group>
  );
}

// Movement patches must not re-render the drei label subtree; only identity, name
// and clothing do (sameRemoteAppearance). Snapshots still flow every patch through
// the subscription above, so interpolation is unaffected.
const MemoRemotePerson = memo(RemotePerson, sameRemoteAppearance);

export default function Players() {
  const players = useNet((s) => s.players);
  const npcs = useNet((s) => s.npcs);
  const selfId = useNet((s) => s.selfId);

  useEffect(() => {
    startNet();
    return () => {
      stopNet();
    };
  }, []);

  const remotes = useMemo(
    () => Object.values(players).filter((p) => p.id !== selfId),
    [players, selfId],
  );
  const npcList = useMemo(() => Object.values(npcs), [npcs]);

  return (
    <>
      {remotes.map((p) => (
        <MemoRemotePerson
          key={p.id}
          id={p.id}
          kind="player"
          name={p.name}
          look={p.look}
          x={p.x}
          z={p.z}
          facing={p.facing}
          pose={p.pose}
          speed={p.speed}
        />
      ))}
      {npcList.map((n) => (
        <MemoRemotePerson
          key={n.id}
          id={n.id}
          kind="npc"
          name={n.name}
          look={n.look}
          x={n.x}
          z={n.z}
          facing={n.facing}
          pose={n.pose}
          speed={n.speed}
        />
      ))}
    </>
  );
}
