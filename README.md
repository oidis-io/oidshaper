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
