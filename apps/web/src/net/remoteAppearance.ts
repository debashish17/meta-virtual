import type { AvatarLook } from "@office/shared";

/** The props of one remote renderer that must re-render it when they change. */
export interface RemoteAppearance {
  id: string;
  kind: "player" | "npc";
  name: string;
  look: AvatarLook;
}

/**
 * Whether two remote renders look identical. Position, facing, pose and speed flow
 * through the snapshot buffer (fed by a store subscription, not by rendering), so the
 * 20 Hz movement patches must not re-render the drei label subtree; only identity,
 * name and clothing do. Used as the `React.memo` comparator in Players.tsx.
 */
export function sameRemoteAppearance(a: RemoteAppearance, b: RemoteAppearance): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.name === b.name &&
    a.look.body === b.look.body &&
    a.look.top === b.look.top &&
    a.look.accent === b.look.accent &&
    a.look.bottom === b.look.bottom &&
    a.look.shoes === b.look.shoes &&
    a.look.height === b.look.height
  );
}
