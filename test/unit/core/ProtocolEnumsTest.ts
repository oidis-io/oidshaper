/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, expect, expectTypeOf, it } from "vitest";
import { PointerKind, NavigationAction } from "../../../src/typescript/core/NavigationPreset.js";
import { SelectionMode, SelectionOperation } from "../../../src/typescript/core/DrawingSelection.js";
import { DrawingShape } from "../../../src/typescript/core/DrawingShapes.js";
import { NavigationCubeTheme } from "../../../src/typescript/render/NavigationCubeTheme.js";
import { CursorOperation } from "../../../src/typescript/tools/TransformCursor.js";
import { DrawingPrimitive } from "../../../src/typescript/tools/EntityDrawingTool.js";
import { TransformMode } from "../../../src/typescript/tools/EntityTransformGizmo.js";
import { NavigationView } from "../../../src/typescript/render/NavigationView.js";
import { SnapSurfaceKind } from "../../../src/typescript/tools/EntitySnapResolver.js";
import { MapSource } from "../../../src/typescript/map/MapView.js";
import {
    EntityPartKind, EntityGripRole, EntitySnapKind, EntityTypeId
} from "../../../src/typescript/core/entities/IEntity.js";
import { FaceRepresentationKind } from "../../../src/typescript/core/entities/EntityTopology.js";
import { EntityDocumentEventKind } from "../../../src/typescript/core/entities/contracts/EntityDocumentEventKind.js";
import { DxfEntityType, DxfSectionName } from "../../../src/typescript/io/DxfEntityType.js";
import { DxfGroupCode, DxfGroupCodes } from "../../../src/typescript/io/DxfGroupCode.js";

import type { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";

interface IStringValues {
    readonly [key : string] : string;
}

interface IStringEnumContract {
    readonly name : string;
    readonly actual : IStringValues;
    readonly expected : IStringValues;
}

const contracts : readonly IStringEnumContract[] = [
    {name: "NavigationView", actual: NavigationView,
        expected: {RIGHT: "RIGHT", LEFT: "LEFT", BACK: "BACK", FRONT: "FRONT", TOP: "TOP",
            BOTTOM: "BOTTOM", ISO: "ISO", CUSTOM: "CUSTOM"}},
    {name: "SnapSurfaceKind", actual: SnapSurfaceKind, expected: {GRID: "grid", PLANE: "plane"}},
    {name: "DxfSectionName", actual: DxfSectionName,
        expected: {HEADER: "HEADER", ENTITIES: "ENTITIES", BLOCKS: "BLOCKS"}},
    {name: "PointerKind", actual: PointerKind,
        expected: {LEFT: "left", MIDDLE: "middle", RIGHT: "right", TOUCH: "touch"}},
    {name: "NavigationAction", actual: NavigationAction, expected: {ORBIT: "orbit", PAN: "pan"}},
    {name: "SelectionMode", actual: SelectionMode, expected: {WINDOW: "window", CROSSING: "crossing"}},
    {name: "SelectionOperation", actual: SelectionOperation,
        expected: {REPLACE: "replace", ADD: "add", REMOVE: "remove"}},
    {name: "DrawingShape", actual: DrawingShape, expected: {LINE: "line", RECTANGLE: "rectangle", CIRCLE: "circle"}},
    {name: "NavigationCubeTheme", actual: NavigationCubeTheme, expected: {LIGHT: "light", DARK: "dark"}},
    {name: "CursorOperation", actual: CursorOperation,
        expected: {MOVE: "move", AXIS: "axis", ROTATE: "rotate", SCALE: "scale"}},
    {name: "DrawingPrimitive", actual: DrawingPrimitive,
        expected: {POINT: "point", LINE: "line", POLYLINE: "polyline", POLYGON: "polygon",
            RECTANGLE: "rectangle", CIRCLE: "circle"}},
    {name: "TransformMode", actual: TransformMode, expected: {MOVE: "move", ROTATE: "rotate", SCALE: "scale"}},
    {name: "MapSource", actual: MapSource,
        expected: {OSM: "osm", TOPOGRAPHIC: "topographic", ORTHOPHOTO: "orthophoto", CADASTRE: "cadastre"}},
    {name: "EntityPartKind", actual: EntityPartKind, expected: {VERTEX: "vertex", EDGE: "edge", FACE: "face"}},
    {name: "EntityGripRole", actual: EntityGripRole, expected: {VERTEX: "vertex", CENTRE: "centre", RADIUS: "radius"}},
    {name: "EntitySnapKind", actual: EntitySnapKind,
        expected: {ENDPOINT: "endpoint", MIDPOINT: "midpoint", CENTRE: "centre", QUADRANT: "quadrant"}},
    {name: "EntityTypeId", actual: EntityTypeId,
        expected: {POLYLINE: "polyline", CIRCLE: "circle", RECTANGLE: "rectangle", MESH: "mesh",
            BOX: "box", POLYHEDRON: "polyhedron", GROUP: "group", MODEL: "model"}},
    {name: "FaceRepresentationKind", actual: FaceRepresentationKind, expected: {PLANAR: "planar", MESH: "mesh"}},
    {name: "EntityDocumentEventKind", actual: EntityDocumentEventKind,
        expected: {DOCUMENT_CHANGED: "document.changed", SELECTION_CHANGED: "selection.changed"}},
    {name: "DxfEntityType", actual: DxfEntityType,
        expected: {POINT: "POINT", LINE: "LINE", LWPOLYLINE: "LWPOLYLINE", POLYLINE: "POLYLINE",
            VERTEX: "VERTEX", SEQEND: "SEQEND", ARC: "ARC", CIRCLE: "CIRCLE", ELLIPSE: "ELLIPSE",
            INSERT: "INSERT", BLOCK: "BLOCK", ENDBLK: "ENDBLK", SOLID: "SOLID", FACE_3D: "3DFACE",
            TEXT: "TEXT", MTEXT: "MTEXT", SECTION: "SECTION", ENDSEC: "ENDSEC", EOF: "EOF"}}
];

describe("enum protocol compatibility", () => {
    for (const contract of contracts) {
        it(`preserves ${contract.name} literal values through JSON`, () => {
            expect(contract.actual).toEqual(contract.expected);
            expect(Object.values(contract.actual).every((value) => typeof value === "string")).toBe(true);
            expect(JSON.parse(JSON.stringify(contract.actual))).toEqual(contract.expected);
        });
    }

    it("preserves numeric DXF group codes through JSON", () => {
        const expected = {ENTITY_TYPE: 0, TEXT: 1, NAME: 2, LAYER: 8, HEADER_VARIABLE: 9,
            POINT_X: 10, SECOND_POINT_X: 11, THIRD_POINT_X: 12, FOURTH_POINT_X: 13,
            POINT_Y: 20, SECOND_POINT_Y: 21, POINT_Z: 30, SECOND_POINT_Z: 31,
            SIZE: 40, START_PARAMETER: 41, END_PARAMETER: 42, START_ANGLE: 50, END_ANGLE: 51,
            ENTITIES_FOLLOW: 66, FLAGS: 70, EXTRUSION_X: 210, EXTRUSION_Y: 220, EXTRUSION_Z: 230, TRUE_COLOUR: 420};
        const actual = Object.fromEntries(Object.entries(DxfGroupCode).filter((entry) => typeof entry[1] === "number"));
        expect(actual).toEqual(expected);
        expect(JSON.parse(JSON.stringify(actual))).toEqual(expected);
        expect(Object.values(actual).every((value) => typeof value === "number")).toBe(true);
        for (const value of Object.values(expected)) {
            expect(DxfGroupCodes.Decode(value)).toBe(value);
        }
        for (const value of [-1, 3, 10.5, 999, NaN, Infinity]) {
            expect(DxfGroupCodes.Decode(value)).toBeUndefined();
        }
    });

    it("requires typed operation payloads without legacy command discriminants", () => {
        expectTypeOf<"Execute">().not.toExtend<keyof EntityDocument>();
        expectTypeOf<"kind">().not.toExtend<keyof Parameters<EntityDocument["AddEntities"]>[0]>();
        expectTypeOf({}).not.toExtend<Parameters<EntityDocument["AddEntities"]>[0]>();
        expectTypeOf({entities: "invalid"}).not.toExtend<Parameters<EntityDocument["AddEntities"]>[0]>();
        expectTypeOf({ids: ["model"]}).not.toExtend<Parameters<EntityDocument["TransformEntities"]>[0]>();
        expectTypeOf({ids: ["model"], delta: [1], expectedRevision: "invalid"})
            .not.toExtend<Parameters<EntityDocument["TransformEntities"]>[0]>();
        expectTypeOf({id: "box", grip: "0", position: {x: 1, y: 2}})
            .not.toExtend<Parameters<EntityDocument["MoveGrip"]>[0]>();
        expectTypeOf({id: "box", part: {kind: "face", id: "face:1"}, delta: {x: 0, y: 0, z: 1}})
            .not.toExtend<Parameters<EntityDocument["MovePart"]>[0]>();
        expectTypeOf({ids: ["model"], delta: [1], expectedRevision: 1})
            .toExtend<Parameters<EntityDocument["TransformEntities"]>[0]>();
    });

});
