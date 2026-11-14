# oidshaper

Browser engine for 3D drawing, modelling, point clouds and maps, built on [three.js](https://threejs.org) and
[CesiumJS](https://cesium.com/platform/cesiumjs/).

## Requirements

Node.js 26 and npm; Chromium for the browser tests: `npm run browsers`.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | demos with live reload at http://localhost:5173 |
| `npm run build` | library to `dist/`, demos to `build/demos/` |
| `npm run preview` | built demos at http://localhost:4173 |
| `npm run lint`, `npm run typecheck` | ESLint and TypeScript |
| `npm test` | unit, integration and e2e tests (`test:unit`, `test:integration`, `test:e2e`) |
| `npm run pack`, `npm run test:package` | npm package and its check in a clean project |
| `npm run check:licences` | licences of all dependencies |

## Layout

| Path | Content |
|---|---|
| `src/typescript/` | modules (`core`, `render`, …), the public API in `index.ts`, demo scripts in `demos/` |
| `src/html/demos/` | demo pages |
| `test/` | `unit/`, `integration/` and `e2e/`; files end with `Test.ts` |
| `config/` | TypeScript, ESLint, Vite, Vitest and Playwright |
| `scripts/` | build and check scripts |

The linter keeps the module boundaries: three.js only in `render`, CesiumJS only in `map`, demos only through the
public API.

## Map and drawing demos

Run `npm run dev`, then open `maps/` or `drawing/` from the demo index.

All demos enable `navigationCube: true` on the viewport. Click a face, edge or corner to select a view without changing
its target or zoom. The selector below the cube also provides keyboard access to the six faces and the isometric view.
The highlighted area indicates the selected click target; the cube follows orbit navigation and the shared map camera.
Edges highlight both adjacent faces, corners all three. Set `navigationCubeTheme` to `NavigationCubeTheme.LIGHT` or
`NavigationCubeTheme.DARK`, or change it at runtime with `setNavigationCubeTheme()`. The demo theme selector updates
panels, controls, background and cube together; axis markers share the axis colours.

- Maps: CesiumJS 1.147.0 loads on `MapView.Create()`. The three.js viewport drives both cameras. Select
  OpenStreetMap, ČÚZK topographic or orthophoto backgrounds and optionally the cadastre overlay. The demo loads
  DMR 5G terrain and places its model at the sampled terrain height. No Cesium ion token is required.
  The renderers share a camera and coordinates, but not a depth buffer: terrain does not occlude three.js geometry.
- Drawing: enable drawing, choose a Z plane and optional snap spacing, then click points and finish the path.
  Closed paths, cancellation, undo/redo and layer visibility are available. The demo opens the Zlaté Hory gas-network
  drawing from the Homola sample data (`drawing/sample.dxf`, original ANSI-1250 encoding). **New drawing** starts empty;
  **Sample DXF** reloads this file. **Geometry sample** exercises arcs, a filled face and text. Import replaces the
  drawing only after parsing succeeds. The survey file is supplied for local testing; no redistribution licence is assumed.
- The drawing editor works in XY at the chosen Z. **Line**, **Rectangle** and **Circle** use two clicks with a live
  preview. **Polyline / polygon** uses **Finish path** and **Closed**. **Snap** sets XY grid spacing; zero disables it.
- **Select / edit** selects a shape by its edge or the **Shape** list. Drag a vertex handle to move it at its original
  Z, or click it before inserting/deleting a vertex. **Delete selected** removes the selection. Each completed drag is
  one undo step; Escape cancels it. Hidden layers cannot be selected. Analytic curves remain curves and are not exposed
  as polygon vertices. Imported polylines use the same editing workflow.
- Drag a **Rectangle** or **Lasso** in selection mode. Left to right selects fully enclosed paths; right to left
  includes touched paths. Lasso direction locks on its first horizontal movement. Blue solid outlines mean enclosure,
  green dashed outlines mean crossing. Shift adds, Ctrl/Cmd removes. Bulk deletion is one undo step.
- DXF supports POINT, LINE, LWPOLYLINE (including bulges), POLYLINE, ARC, CIRCLE, ELLIPSE, INSERT, SOLID, 3DFACE,
  TEXT and MTEXT. Blocks expand with their insertion transforms. Export preserves analytic curves, true colours,
  layers, faces, text and `$INSUNITS`; it does not rebuild the original block hierarchy. Other entity types are
  reported, not interpreted as straight lines. This is geometry interchange, not a lossless AutoCAD document editor.
- `DrawingArea` owns drawing state and bounded undo/redo history independently of the renderer. Drawing coordinates
  remain doubles; GPU vertices use a local origin. DXF units are retained without automatic conversion. Use metre
  coordinates in S-JTSK when combining a drawing with the default map projection.
- `Coordinates` uses the same seven-parameter S-JTSK transformation as the Potree integration. DMR and scene heights
  share the **Bpv display convention**; this is not a Bpv-to-ellipsoidal-height transformation. Remote services require
  network access and CORS. Areas without DMR data use zero-height background geometry, not measured elevations.
- Cesium runtime assets are copied by `predev` and `prebuild` into the generated static directory and shipped
  with the build. Hosts pass their deployed asset URL to `MapView.Create()` and include `Widgets/widgets.css`.
  All map instances must use the same asset directory. Keep provider attribution visible; the demo supplies a
  separate credit container above the navigation canvas.

Run the full test suite with `npm test`. A separate live-service check verifies actual terrain and imagery responses
and saves screenshots under `build/live-maps/`:

```bash
# Start the demos in one terminal.
npm run dev

# Check live ČÚZK and OpenStreetMap services from another terminal.
node scripts/check-map-services.mjs
```

Set `OIDSHAPER_DEMO_URL` to check a deployed or preview build instead. Unit and browser tests also cover DXF roundtrips,
block transforms, NoData handling, camera alignment, transparent composition, drawing history and failed imports.

## Scene interaction design

The [design manual](docs/design/scene-interactions.html) defines entity editing and scene interactions.

## Code style

Checked by the linter: public methods in PascalCase except `getX`/`setX`, interfaces with `I`, `name : Type`,
`{x: 1}`, angle-bracket assertions, parameters without `$`, strict TypeScript without `any`.

## Branches and releases

| Branch or tag | Version | Published as |
|---|---|---|
| `feature/<ticket>`, pull request to `develop` | `<version>-ci.<run>` | workflow artifact |
| `develop` | `<version>-dev.<run>` | pre-release `dev` |
| `main` | `<version>-eap.<run>` | pre-release `eap` |
| tag `<version>` on `main` | `<version>` | release, latest |

- `dev` and `eap` hold only the newest build. Every release has `oidshaper.zip`, `oidshaper.tgz` (npm),
  `oidshaper-demos.zip` and `oidshaper.js.map` under the same names, so the URLs are stable: `releases/download/dev/…`,
  `releases/download/eap/…` and `releases/latest/download/…`.
- The version is `<year>.<release>.<patch>` in `package.json`. A build of a released version or of a past year fails;
  the year is changed by hand. A release moves `develop` to the next release, 2026.3.0 to 2026.4.0.

Local run of the workflow:

```bash
act push -W .github/workflows/ci.yml -P ubuntu-latest=catthehacker/ubuntu:act-latest
```

## License

BSD-3-Clause, see [LICENSE](LICENSE).

Copyright 2026 [Oidis](https://www.oidis.io/).
