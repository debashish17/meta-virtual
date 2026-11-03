import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { DEMO_ACCOUNT, DEMO_PROJECT } from "@office/shared";
import { useRecords } from "../../api/records";
import { useReceipts } from "../../receipts/store";
import DisplayOverlay from "./DisplayOverlay";
import { SCREEN_H, SCREEN_W, drawScreen } from "./draw";
import { buildAcmeScreen, buildProjectScreen, screenHash, type ScreenData } from "./screens";
import "./displays.css";

/**
 * Canvas-texture screens on the meeting-room TVs. The placements mirror
 * `packages/shared/src/world/office.ts` (read here, never moved): the Acme room's 55" TV at
 * x 13.7 and the project room's 65" TV at x 27.5, both against the north wall (z 0.1, base
 * y 0.95). Each screen plane floats just in front of its TV's face. Data comes from the
 * records store (the mock api for now); the canvas redraws only when the data changes, and
 * clicking a screen opens the same content larger as a DOM overlay.
 */

interface Placement {
  room: "acme" | "project";
  position: [number, number, number];
  size: [number, number];
}

const SCREENS: Placement[] = [
  { room: "acme", position: [13.7, 1.33, 0.215], size: [1.08, 0.675] },
  { room: "project", position: [27.5, 1.405, 0.215], size: [1.34, 0.8375] },
];

function loadingScreen(room: "acme" | "project"): ScreenData {
  return {
    id: room,
    title: room === "acme" ? "Acme room" : "Project room",
    tone: "ok",
    sections: [{ heading: "Status", lines: ["Loading…"] }],
  };
}

function errorScreen(room: "acme" | "project"): ScreenData {
  return {
    id: room,
    title: room === "acme" ? "Acme room" : "Project room",
    tone: "warn",
    sections: [{ heading: "Status", lines: ["Could not load the status"] }],
  };
}

function Screen({
  placement,
  data,
  onOpen,
}: {
  placement: Placement;
  data: ScreenData;
  onOpen: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SCREEN_W;
    canvas.height = SCREEN_H;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const hash = screenHash(data);
  const drawn = useRef<string | null>(null);
  useEffect(() => {
    if (drawn.current === hash) return;
    drawn.current = hash;
    drawScreen(texture.image as HTMLCanvasElement, data);
    texture.needsUpdate = true;
  }, [hash, texture, data]);

  return (
    <mesh
      position={placement.position}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
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

export default function WallDisplays() {
  const project = useRecords((s) => s.project);
  const account = useRecords((s) => s.account);
  const load = useRecords((s) => s.load);
  // P6-R: the latest approved receipts per wall, refetched live on `records_changed`.
  const acmeReceipts = useReceipts({ accountId: DEMO_ACCOUNT.id });
  const projectReceipts = useReceipts({ projectId: DEMO_PROJECT.id });
  const [open, setOpen] = useState<"acme" | "project" | null>(null);

  useEffect(() => {
    if (!project || !account) void load();
  }, [project, account, load]);

  const screens: Record<"acme" | "project", ScreenData> = useMemo(() => {
    if (!project || !account) return { acme: loadingScreen("acme"), project: loadingScreen("project") };
    try {
      return {
        acme: buildAcmeScreen(account, project, acmeReceipts),
        project: buildProjectScreen(project, projectReceipts),
      };
    } catch {
      return { acme: errorScreen("acme"), project: errorScreen("project") };
    }
  }, [project, account, acmeReceipts, projectReceipts]);

  // DEV hook for screenshots and manual checks: __wallDisplays.open("acme" | "project" | null)
  // opens the overlay, and .aim(room) returns the screen centre in client pixels for clicks.
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__wallDisplays = {
      open: (room: "acme" | "project" | null) => setOpen(room),
      /** Client pixels of a screen's centre, so a click test can aim at the real mesh. */
      aim: (room: "acme" | "project") => {
        const found = SCREENS.find((s) => s.room === room);
        if (!found) return null;
        const v = new THREE.Vector3(...found.position).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return {
          x: Math.round(rect.left + ((v.x + 1) / 2) * rect.width),
          y: Math.round(rect.top + ((1 - v.y) / 2) * rect.height),
        };
      },
    };
  }, [camera, gl]);

  // The overlay is DOM, so it mounts in its own root on document.body: the Canvas tree
  // can only host three.js elements.
  const openData = open ? screens[open] : null;
  useEffect(() => {
    if (!openData) return;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(<DisplayOverlay data={openData} onClose={() => setOpen(null)} />);
    return () => {
      root.unmount();
      host.remove();
    };
  }, [openData]);

  return (
    <group>
      {SCREENS.map((placement) => (
        <Screen
          key={placement.room}
          placement={placement}
          data={screens[placement.room]}
          onOpen={() => setOpen(placement.room)}
        />
      ))}
    </group>
  );
}
