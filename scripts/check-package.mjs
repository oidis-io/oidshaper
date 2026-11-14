/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = createRequire(import.meta.url)("../package.json");
const tarballName = `${packageJson.name.replace("@", "").replace("/", "-")}-${packageJson.version}.tgz`;
const tarball = join(root, "build", tarballName);
if (!existsSync(tarball)) {
    process.stderr.write(`build/${tarballName} not found; run npm run build and npm run pack first.\n`);
    process.exit(1);
}
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const consumer = mkdtempSync(join(tmpdir(), "oidshaper-consumer-"));

try {
    writeFileSync(join(consumer, "package.json"), JSON.stringify({name: "consumer", private: true, type: "module"}));
    writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            lib: ["ES2022", "DOM"],
            types: [],
            noEmit: true
        },
        files: ["consumer.ts"]
    }));
    const enumContract = [
        "import { PointerKind, NavigationAction, SelectionMode, SelectionOperation, DrawingShape,",
        "    NavigationCubeTheme, AxisColours, CursorOperation, DrawingPrimitive, TransformMode, MapSource,",
        "    EntityTransformGizmo } from \"@oidis-io/oidshaper\";",
        "const actual = [PointerKind.LEFT, PointerKind.MIDDLE, PointerKind.RIGHT, PointerKind.TOUCH,",
        "    NavigationAction.ORBIT, NavigationAction.PAN, SelectionMode.WINDOW, SelectionMode.CROSSING,",
        "    SelectionOperation.REPLACE, SelectionOperation.ADD, SelectionOperation.REMOVE,",
        "    DrawingShape.LINE, DrawingShape.RECTANGLE, DrawingShape.CIRCLE,",
        "    NavigationCubeTheme.LIGHT, NavigationCubeTheme.DARK,",
        "    CursorOperation.MOVE, CursorOperation.AXIS, CursorOperation.ROTATE, CursorOperation.SCALE,",
        "    DrawingPrimitive.POINT, DrawingPrimitive.LINE, DrawingPrimitive.POLYLINE, DrawingPrimitive.POLYGON,",
        "    DrawingPrimitive.RECTANGLE, DrawingPrimitive.CIRCLE, TransformMode.MOVE, TransformMode.ROTATE,",
        "    TransformMode.SCALE, MapSource.OSM, MapSource.TOPOGRAPHIC, MapSource.ORTHOPHOTO, MapSource.CADASTRE];",
        "const expected = ['left', 'middle', 'right', 'touch', 'orbit', 'pan', 'window', 'crossing',",
        "    'replace', 'add', 'remove', 'line', 'rectangle', 'circle', 'light', 'dark',",
        "    'move', 'axis', 'rotate', 'scale', 'point', 'line', 'polyline', 'polygon', 'rectangle', 'circle',",
        "    'move', 'rotate', 'scale', 'osm', 'topographic', 'orthophoto', 'cadastre'];",
        "if (JSON.stringify(actual) !== JSON.stringify(expected)) { throw new Error('Changed enum values'); }",
        "if (!AxisColours.VALUES.x || !AxisColours.VALUES.y || !AxisColours.VALUES.z) {",
        "    throw new Error('Missing axis colours');",
        "}",
        "const sizes = [EntityTransformGizmo.GIZMO_AXIS_PX, EntityTransformGizmo.GIZMO_PLANE_PX,",
        "    EntityTransformGizmo.GIZMO_PLANE_SHOW_PX, EntityTransformGizmo.GIZMO_PLANE_HIDE_PX];",
        "if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) {",
        "    throw new Error('Invalid gizmo dimensions');",
        "}"
    ];
    const extensionContract = [
        "import { PolylineEntity } from \"@oidis-io/oidshaper\";",
        "class PackagePolyline extends PolylineEntity { typeId = 'package-polyline'; }",
        "const extension = new PackagePolyline();",
        "const extensionRegistry = EntityTypes.CreateRegistry();",
        "extensionRegistry.Register(extension);",
        "const extensionScene = new EntityDocument(extensionRegistry);",
        "const extensionData = {points: [{x: 1, y: 2, z: 3}], closed: false};",
        "extensionScene.AddEntities({entities: [{id: 'extension', type: extension.typeId,",
        "    name: 'Extension', data: extensionData}]});",
        "extensionScene.MoveGrip({id: 'extension', grip: '0', position: {x: 4, y: 5, z: 6}});",
        "if (extensionScene.getEntity('extension').type !== 'package-polyline') {",
        "    throw new Error('Extension wire type changed');",
        "}",
        "const binding = extensionRegistry.getType(extension.typeId).Parse(extensionData);",
        "if (binding.getSnapPoints().length !== 1) { throw new Error('Missing typed extension snap'); }",
        "let invalidRejected = false;",
        "try { extensionRegistry.getType(extension.typeId).Parse({points: 'invalid', closed: false}); }",
        "catch { invalidRejected = true; }",
        "if (!invalidRejected) { throw new Error('Untrusted extension data was accepted'); }"
    ];
    writeFileSync(join(consumer, "consumer.ts"), [
        ...enumContract,
        ...extensionContract,
        "import { CircleEntity, BaseEntity, type IEntityType, type ICircleData } from \"@oidis-io/oidshaper\";",
        "const typedCircle: IEntityType<ICircleData> = new CircleEntity();",
        "const typedBase: BaseEntity<ICircleData> = new CircleEntity();",
        "export function checkCircleContract(circle: CircleEntity): void {",
        "    circle.getSnapPoints({centre: {x: 1, y: 2, z: 3}, radius: 2});",
        "    // @ts-expect-error Polyline data must not satisfy the circle contract.",
        "    circle.getSnapPoints({points: [], closed: false});",
        "    const untrusted: unknown = JSON.parse('{}');",
        "    // @ts-expect-error Untrusted data requires validation before typed dispatch.",
        "    typedBase.getGeometry(untrusted);",
        "}",
        "export const typedEntities = [typedCircle, typedBase];",
        "import { LocalOrigin, Viewport, type IVector3 } from \"@oidis-io/oidshaper\";",
        "import { EntityDocument, EntityTypes, EntityTransforms } from \"@oidis-io/oidshaper\";",
        "const scene = new EntityDocument();",
        "scene.AddEntities({entities: [{id: \"mesh\", type: \"mesh\", name: \"Mesh\",",
        "    data: EntityTypes.BoxMesh({x: 2, y: 2, z: 2})}]});",
        "scene.TransformEntities({ids: [\"mesh\"],",
        "    delta: EntityTransforms.Translation({x: 1, y: 2, z: 3})});",
        "const origin: LocalOrigin = new LocalOrigin({ x: -743000, y: -1043000, z: 300 });",
        "const local: IVector3 = origin.ToLocal({ x: -743001, y: -1043001, z: 301 });",
        "export const types: unknown[] = [local, Viewport];",
        ""
    ].join("\n"));
    writeFileSync(join(consumer, "runtime.mjs"), [
        ...enumContract,
        ...extensionContract,
        "import { LocalOrigin } from \"@oidis-io/oidshaper\";",
        "import { EntityDocument, EntityTypes } from \"@oidis-io/oidshaper\";",
        "const scene = new EntityDocument();",
        "scene.AddEntities({entities: [{type: \"mesh\", name: \"Mesh\",",
        "    data: EntityTypes.BoxMesh({x: 2, y: 2, z: 2})}]});",
        "if (scene.getDrawing().meshes.length !== 1) { throw new Error(\"Missing entity mesh\"); }",
        "const origin = new LocalOrigin({ x: -743000, y: -1043000, z: 300 });",
        "const local = origin.ToLocal({ x: -743001, y: -1043002, z: 303 });",
        "if (local.x !== -1 || local.y !== -2 || local.z !== 3) { throw new Error(JSON.stringify(local)); }",
        ""
    ].join("\n"));

    const run = (command, args) => execFileSync(command, args, {cwd: consumer, stdio: "inherit"});
    run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", tarball]);
    run(process.execPath, [tsc, "-p", "tsconfig.json"]);
    run(process.execPath, ["runtime.mjs"]);
    process.stdout.write(`Package ${tarballName} installs, type-checks under NodeNext and imports at runtime.\n`);
} finally {
    rmSync(consumer, {recursive: true, force: true});
}
