import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { FURNITURE, partSize } from "@office/shared";
import { boardApi } from "../api/board.js";
import { BOARD_H, BOARD_W, boardHash, drawBoard } from "./draw.js";
import { useBoard, useBoardStore, useBoardUi } from "./store.js";

/**
 * The newest board pins drawn on the cork boards (ARCHITECTURE.md 12.10, P6-D),
 * as canvas textures the way the wall displays are. The placements mirror
 * `packages/shared/src/world/office.ts` (read here, never moved): the ideas
 * wall's board and the project room's, both facing south. Clicking either
 * opens the overlay; the texture refetches on `records_changed board`.
 */

const CORK_PART = "tech.cork-board-1200x900";

interface Placement {
  key: string;
  position: [number, number, number];
  rotationY: number;
  size: [number, number];
}

function corkBoards(): Placement[] {
  return FURNITURE.filter((part) => part.part === CORK_PART).map((part, i) => {
    const [w, d, h] = partSize(CORK_PART) ?? [1.2, 0.034, 0.9];
    const rad = (part.rotY * Math.PI) / 180;
    const out = d / 2 + 0.006;
    return {
      key: `${part.x},${part.z},${i}`,
      position: [part.x + Math.sin(rad) * out, part.y + h / 2, part.z + Math.cos(rad) * out],
      rotationY: rad,
      size: [w - 0.06, h - 0.06],
    };
  });
}

function Board({ placement, hash, pins }: { placement: Placement; hash: string; pins: Parameters<typeof drawBoard>[1] }) {
  const open = useBoardUi((state) => state.setOpen);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const drawn = useRef<string | null>(null);
  useEffect(() => {
    if (drawn.current === hash) return;
    drawn.current = hash;
    drawBoard(texture.image as HTMLCanvasElement, pins);
    texture.needsUpdate = true;
  }, [hash, texture, pins]);

  return (
    <mesh
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      onClick={(e) => {
        e.stopPropagation();
        open(true);
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

const SEED_PINS = [
  { text: "Demo Friday at 4 — all welcome", color: "#fbe7a1" },
  { text: "Tea point restocked ☕", color: "#cde6b8" },
  { text: "Book the Acme room before Thursday", color: "#f4c2cd" },
];

export default function BoardTexture() {
  const pins = useBoard();
  const hash = boardHash(pins);
  const placements = useMemo(corkBoards, []);

  // DEV hooks for screenshots and manual checks: __board.open() opens the overlay,
  // .aim(i) returns a board's centre in client pixels for clicks, .seed() pins samples.
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__board = {
      open: (open = true) => useBoardUi.getState().setOpen(open),
      aim: (i = 0) => {
        const found = placements[i];
        if (!found) return null;
        const v = new THREE.Vector3(...found.position).project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        return {
          x: Math.round(rect.left + ((v.x + 1) / 2) * rect.width),
          y: Math.round(rect.top + ((1 - v.y) / 2) * rect.height),
        };
      },
      seed: async () => {
        for (const pin of SEED_PINS) {
          await boardApi.create(pin).catch(() => undefined);
        }
        await useBoardStore.getState().load(boardApi).catch(() => undefined);
        return useBoardStore.getState().pins.length;
      },
    };
  }, [camera, gl, placements]);

  return (
    <group>
      {placements.map((placement) => (
        <Board key={placement.key} placement={placement} hash={hash} pins={pins} />
      ))}
    </group>
  );
}
