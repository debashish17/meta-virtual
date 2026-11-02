import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { useCalls, type CallPhase } from "../../calls/store.js";
import type { CallVideo } from "../../calls/room.js";
import "./displays.css";

export interface LiveSharePlacement {
  zoneId: string;
  title: string;
  position: [number, number, number];
  size: [number, number];
}

/**
 * The TVs a screen share can take over: the same geometry as WallDisplays'
 * screens (x 13.7 in the Acme room, x 27.5 in the Project room, against the
 * north wall), nudged 3 mm toward the viewer so the share plane never
 * z-fights the TV face.
 */
export const LIVE_SHARE_SCREENS: readonly LiveSharePlacement[] = [
  { zoneId: "acme_room", title: "Acme room", position: [13.7, 1.33, 0.218], size: [1.08, 0.675] },
  {
    zoneId: "project_room",
    title: "Project room",
    position: [27.5, 1.405, 0.218],
    size: [1.34, 0.8375],
  },
];

/** The TV in `zoneId`, or null when that room has none. */
export function liveShareFor(zoneId: string | null): LiveSharePlacement | null {
  if (!zoneId) return null;
  return LIVE_SHARE_SCREENS.find((s) => s.zoneId === zoneId) ?? null;
}

/** The TV the current call's screen share shows on, when there is one. */
export function sharePlacementForCall(
  phase: CallPhase,
  zoneId: string | null,
  hasScreen: boolean,
): LiveSharePlacement | null {
  if (phase !== "live" || !hasScreen) return null;
  return liveShareFor(zoneId);
}

function ShareMesh({
  placement,
  video,
  onOpen,
}: {
  placement: LiveSharePlacement;
  video: CallVideo;
  onOpen: () => void;
}) {
  const [texture, setTexture] = useState<THREE.VideoTexture | null>(null);
  useEffect(() => {
    const el = video.attach();
    const t = new THREE.VideoTexture(el);
    t.colorSpace = THREE.SRGBColorSpace;
    setTexture(t);
    return () => {
      t.dispose();
      video.detach(el);
    };
  }, [video]);
  if (!texture) return null;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onOpen();
  };
  return (
    <mesh
      position={placement.position}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <planeGeometry args={placement.size} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/**
 * The larger DOM view of a shared screen: the track's own element, so it
 * plays the live share. Closes on the backdrop, the button or Escape.
 */
export function LiveShareOverlay({
  title,
  name,
  video,
  onClose,
}: {
  title: string;
  name: string;
  video: CallVideo;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    const div = host.current;
    if (!div) return;
    const el = video.attach();
    // Inline: this package does not own displays.css, so the share fits the
    // panel without touching it.
    el.style.display = "block";
    el.style.width = "100%";
    el.style.maxHeight = "60vh";
    el.style.background = "#000";
    div.appendChild(el);
    return () => {
      video.detach(el);
      el.remove();
    };
  }, [video]);

  // Plain DOM: the caller mounts this in its own root on document.body, never
  // as a portal inside the Canvas (the three reconciler cannot host DOM).
  return (
    <div className="display-backdrop" onClick={onClose}>
      <div
        className="display-panel tone-ok"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} screen share`}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>
            {title} · {name}&rsquo;s screen
          </h2>
          <button ref={closeRef} type="button" className="display-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div ref={host} />
        <p className="display-foot">Live from the call</p>
      </div>
    </div>
  );
}

/**
 * The live screen share on the room's wall display (P5-B task 3): while the
 * local call has a screen share and the avatar is in a TV room, the share
 * draws as a `VideoTexture` on that TV's mesh; clicking it opens the larger
 * overlay. Renders nothing otherwise. Mounted inside the Canvas next to
 * `WallDisplays` (a one-line Request to the lead: this package owns only this
 * file, not the scene composition).
 */
export default function LiveShare() {
  const phase = useCalls((s) => s.phase);
  const zoneId = useCalls((s) => s.zoneId);
  const screen = useCalls((s) => s.screen);
  const [open, setOpen] = useState(false);
  const placement = sharePlacementForCall(phase, zoneId, screen !== null);

  useEffect(() => {
    if (!placement || !screen) setOpen(false);
  }, [placement, screen]);

  // The overlay is DOM, so it mounts in its own root on document.body: the
  // Canvas tree can only host three.js elements.
  useEffect(() => {
    if (!open || !placement || !screen) return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(
      <LiveShareOverlay
        title={placement.title}
        name={screen.fromName}
        video={screen.video}
        onClose={() => setOpen(false)}
      />,
    );
    return () => {
      root.unmount();
      host.remove();
    };
  }, [open, placement, screen]);

  if (!placement || !screen) return null;
  return (
    <group>
      <ShareMesh placement={placement} video={screen.video} onOpen={() => setOpen(true)} />
    </group>
  );
}
