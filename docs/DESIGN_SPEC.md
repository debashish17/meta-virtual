# DESIGN_SPEC.md

**Visual authority:** `docs/reference/office-reference.png`. If this document and the image disagree, the image wins. Report the discrepancy.

The look is a stylized architectural illustration: clean geometric shapes, crisp edges, soft contact shadows, restrained colour. It is not pixel art, not a game-style map and not a photorealistic render. No outlines, no exaggerated effects.

## 1. What the reference shows

- **Camera:** high three-quarter isometric view from the south-west, looking north-east. The back (north) wall and the window (east) wall are visible from the inside. The west and south sides are cut away.
- **Ceiling:** open. Exposed black ducts, pipes and track lights are visible along the top edge (decorative, drawn as thin dark boxes and cylinders).
- **Floor:** light to mid concrete grey, with a slightly lighter patch near the windows.
- **Rear-left:** a glass-fronted meeting room with white solid walls, thin black frame, a whiteboard with sticky notes on the back wall, a dark wall display, a wooden conference table and dark chairs.
- **Rear-centre:** a small enclosed glass pod or phone booth, then a glass-walled office with a wooden desk, a monitor, a chair, a shelf with binders and a tall plant.
- **Left:** a kitchenette cut into a white wall with wooden lower and upper cabinets, dark countertop, sink, coffee machine, microwave and a white fridge. In front of it, a wooden dining table with four dark chairs, and a small lounge area with two dark armchairs with wooden arms.
- **Centre:** three open-plan desk clusters. Each has an orange-brown oak top, a black metal frame, one or two monitors, a keyboard, a small plant, a dark task chair and a small bin.
- **Right:** a floor-to-ceiling window wall with thin black mullions, a soft city skyline with trees beyond, large potted plants (monstera, rubber plant), a black metal shelving unit with books and boxes, and a small table with a printer.
- **Lighting:** bright, diffuse daylight from the right, soft shadows, no hard dramatic light.

## 2. Camera

- Orthographic camera, fixed angle: true isometric from the south-west (azimuth 45 degrees, elevation 35.264 degrees). No orbit, no rotation, no first person.
- **Walking view (default, owner request at G1):** the camera follows the local avatar at a walking zoom (62 px/m) and eases after it; the mouse wheel zooms between 34 and 120 px/m. The view target stays a few metres inside the floor's open south and west edges so walking along an edge does not fill the screen with void.
- **Overview (`?view=overview`):** frames the whole floor and its surrounding streets, for reviews and screenshots.
- On narrow windows, scale the frustum to fit; do not rotate.

## 3. Coordinates and layout (initial values, tune against the image)

Origin: north-west corner. X east, Z south, Y up. Wall height 3.2 m.

**Changed in M2 at the owner's request:** the floor is 64 m by 40 m (not 24 by 16), laid out on streets. The source of truth for every coordinate is `packages/shared/src/world/office.ts`; the summary below is for orientation.

| Area | Where | Notes |
|---|---|---|
| North rooms | Along the north wall, in groups with open bays between | Meeting room A, two phone pods and the Acme room (`customer_room`) rear-left as in the reference; Project room (`project_room`) and Meeting room B; the boardroom in the north-east corner. Bays: ideas wall, print hub, tea point. Glass fronts with a 1 m door. |
| Room corridor | z 6.5 to 9, wood floor | In front of the north rooms. |
| Main street | z 19.5 to 22.5, wood floor | Café to the windows. Three cross streets (x 13.5, 33.5, 53.5) join it to the corridor and the south edge. |
| Café | West, z 9 to 19.5, terrazzo | Kitchenette cut into a white wall, dining tables, counter with stools. |
| Library and focus rooms | West, z 22.5 to 32.5 | Shelves, reading corner; three glass focus rooms on the west edge. |
| Reception and entrance | South-west, terrazzo | Double glass doors in the low south wall, reception desk, waiting seats. |
| Team areas | Four carpeted neighbourhoods between the streets | 24 desks each (six 4-person benching clusters), lockers, team table, whiteboard, printer. |
| Window side | East, x 56 to 64 | Window lounge with standing desks; town hall; the reference's shelving, printer and big plants. |
| Break-out and quiet corner | South edge | Lounge sets; two huddle rooms and phone booths. |

Walking corridors at least 1.5 m wide between clusters (tested). All furniture bounds become obstacles in `packages/shared`.

## 4. Materials and colour tokens

| Token | Use | Value (start) |
|---|---|---|
| `floor` | Concrete | `#B9BBBE` |
| `floorLight` | Patch near windows | `#D2D3D4` |
| `wallWhite` | Solid walls | `#F4F4F2` |
| `frameDark` | Glass frames, desk legs, mullions | `#1E2126` |
| `glass` | Partitions and windows | `#BFD9E6` at about 25 percent opacity |
| `oak` | Desktops, cabinets, conference table | `#C9803F` |
| `chairDark` | Chairs | `#2B2E33` |
| `plantGreen` | Leaves | `#4E9A4A` |
| `potTerracotta` | Pots | `#D9824C` |
| `screen` | Monitors and wall displays | `#2A3038` with a faint lighter face |
| `skyline` | Distant buildings | `#CFD8DD` and `#B7C4CC` |

Use lightly shaded standard materials. **Changed at the owner's request (M1):** subtle detail textures (weave, felt, wood grain, leather, concrete) tinted to the tokens above, close to the reference boards; floors carry wood, carpet tile, terrazzo and concrete finishes per area. Glass is plain transparency with dark frames; a soft room environment gives glass and cars a faint reflection.

## 5. Lighting

**Changed at the owner's request (G1: the office looked flat; light through the windows):**

- A warm sun (`#ffe2bc`) from the south-east, 38 degrees up, with soft shadows. The ceiling and the space above the low walls cast shadows but are not drawn, so daylight enters only through the east windows (patches striped by the mullions, faint light shafts).
- A cool sky hemisphere, a weak cool fill from the north-west and a soft room environment fill the shade, so shadows take the sky's colour instead of going grey.
- Ambient occlusion (N8AO, cool tint) for contact shadows; neutral tone mapping, a light colour grade and a soft vignette. The overview adds a gentle tilt-shift; the walking view stays sharp.
- The city outside casts and receives shadows near the camera; distance haze fades it into the sky colour.
- Still no bloom, no outlines, no game effects.

## 6. Furniture components (reusable)

`Desk`, `Chair`, `Monitor`, `Plant` (two variants), `Shelf`, `ConferenceTable`, `Armchair`, `DiningTable`, `KitchenUnit`, `Fridge`, `Printer`, `Whiteboard`, `WallDisplay`, `GlassPanel`, `Wall`, `WindowWall`.

Each takes position and rotation props; placements come from `FURNITURE` in `packages/shared`. Use instanced meshes for repeated chairs, plants and monitors if frame rate drops.

## 7. Avatars

**Changed at the owner's request (M2):** people are Mixamo characters (a woman in a blouse, a man in a blazer, a man in a suit and tie) with Mixamo moves on the same skeleton (idle, walk, jog, talk, phone, counter, sit, sit and talk, type), converted by `apps/web/scripts/people/bake.mjs`. Each person's clothes are recoloured from a muted palette and their height set from their look (validated in `packages/shared/src/people/look.ts`), so a team does not look like copies. Seated, the hands are kept on the desk.

- Gentle walk with the stride matched to speed, and a small facing indicator.
- Name label above the head: small, dark text on a soft white pill, readable at the walking zoom.
- Scale: 1.55 to 1.95 m tall relative to the 0.75 m desk height.

## 8. Occlusion

The depth buffer handles most occlusion. For avatars standing behind the north and east walls or glass-room walls, fade near-side walls (lower opacity) or cut them to waist height. The south and west walls are not rendered (cutaway) except the low kitchen partition.

## 9. UI overlay placement

The scene is the hero. Overlays are compact and never cover the centre of the floor.

| Element | Position |
|---|---|
| Participants and presence | Top-left, collapsible |
| Ask-the-office input | Bottom-centre, single line, expands upward |
| My day panel | Right drawer, collapsible |
| Approval drawer | Right drawer, replaces My day when changes are pending |
| Chat | Bottom-left, collapsible |
| Status and room label | Top-centre pill (for example "Acme room") |
| Wall displays | Rendered on in-scene screens (canvas textures), with a larger overlay view on click |

Style: white and light-grey panels, dark text, oak accent for primary buttons, small radius, subtle shadow. System font stack.

## 10. Visual acceptance checklist (gate for Milestone 1)

Capture a screenshot at 1440 by 810 and compare with the reference. All must be true:

- [ ] Fixed isometric view from the south-west; the back and window walls are visible from the inside.
- [ ] Glass meeting room at rear-left with whiteboard, display, table and chairs.
- [ ] Kitchenette on the left with cabinets, fridge and a dining table.
- [ ] Three open-plan desk clusters in the middle with monitors, chairs and plants.
- [ ] Window wall on the right with mullions and a soft skyline.
- [ ] Shelving, printer and large plants on the right perimeter.
- [ ] Palette: grey floor, white walls, oak furniture, black frames, green plants.
- [ ] Soft shadows and diffuse light; no outlines or game effects.
- [ ] Layout proportions are within a reasonable tolerance of the reference (zones appear in the same relative places).
- [ ] The owner has reviewed the screenshot and approved it.

Do not start movement or multiplayer work until the last item is checked.
