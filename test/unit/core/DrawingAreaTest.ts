/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, expect, it } from "vitest";
import { DrawingShape, DrawingShapes } from "../../../src/typescript/core/DrawingShapes.js";
import { DrawingArea } from "../../../src/typescript/core/DrawingArea.js";
import { Coordinates } from "../../../src/typescript/core/Coordinates.js";

describe("DrawingArea", () => {
    it("supports snap, closed paths, cancellation, undo and redo without losing imports", () => {
        const area : DrawingArea = new DrawingArea();
        area.AddPoint({x: 0.1, y: 0.2, z: 5}, 1);
        area.AddPoint({x: 0.2, y: 0.3, z: 5}, 1);
        expect(area.Finish()).toBe(false);
        area.AddPoint({x: 10, y: 0, z: 5});
        area.AddPoint({x: 10, y: 10, z: 5});
        expect(area.Finish(true)).toBe(true);
        const original = area.getDrawing();
        expect(original.paths[0]?.points).toHaveLength(3);
        area.Replace({paths: [], warnings: ["test"]});
        area.Undo();
        expect(area.getDrawing()).toEqual(original);
        area.Redo();
        expect(area.getDrawing().warnings).toEqual(["test"]);
        area.AddPoint({x: 4, y: 5, z: 0});
        area.Cancel();
        expect(area.getVisibleDrawing().paths).toHaveLength(0);
    });

    it("hides layers without deleting them from export and computes large-coordinate bounds", () => {
        const area : DrawingArea = new DrawingArea();
        area.Replace({warnings: [], paths: [{layer: "survey", closed: false,
            points: [{x: -700000, y: -1000000, z: 200}, {x: -699990, y: -999990, z: 210}]}]});
        area.setLayerVisible("survey", false);
        expect(area.getVisibleDrawing().paths).toHaveLength(0);
        expect(area.getDrawing().paths).toHaveLength(1);
        expect(area.getBounds()?.centre).toEqual({x: -699995, y: -999995, z: 205});
        area.setLayerVisible("survey", true);
        expect(area.getVisibleDrawing().paths).toHaveLength(1);
    });

    it("rejects invalid input without changing the drawing", () => {
        const area : DrawingArea = new DrawingArea();
        expect(() => {
            area.AddPoint({x: Infinity, y: 0, z: 0});
        }).toThrow();
        expect(() => {
            area.AddPoint({x: 0, y: 0, z: 0}, -1);
        }).toThrow();
        expect(area.getBounds()).toBeNull();
    });
    it("roundtrips pending point undo and redo and invalidates redo on a new edit", () => {
        const area = new DrawingArea();
        area.AddPoint({x: 1, y: 2, z: 3});
        area.AddPoint({x: 4, y: 5, z: 3});
        area.Undo();
        area.Redo();
        expect(area.getVisibleDrawing().paths[0]?.points).toHaveLength(2);
        area.Finish();
        area.Undo();
        area.AddPoint({x: 9, y: 8, z: 7});
        area.Redo();
        expect(area.getDrawing().paths).toHaveLength(0);
        expect(area.getVisibleDrawing().paths[0]?.points).toEqual([{x: 9, y: 8, z: 7}]);
        area.Undo();
        area.Cancel();
        area.Redo();
        expect(area.getVisibleDrawing().paths).toHaveLength(0);
    });

    it("preserves layer visibility through replacement history and hides pending geometry", () => {
        const area = new DrawingArea();
        area.AddPoint({x: 1, y: 2, z: 0});
        area.AddPoint({x: 4, y: 5, z: 0});
        area.Finish();
        area.setLayerVisible("drawing", false);
        area.AddPoint({x: 6, y: 7, z: 0});
        expect(area.getVisibleDrawing().paths).toHaveLength(0);
        area.Cancel();
        area.Replace({paths: [], warnings: []});
        area.Undo();
        expect(area.getLayerVisible("drawing")).toBe(false);
        expect(area.getDrawing().paths).toHaveLength(1);
        area.Redo();
        expect(area.getDrawing().paths).toHaveLength(0);
    });

    it("snaps fractional negative coordinates without changing height or retaining duplicate vertices", () => {
        const area = new DrawingArea();
        area.AddPoint({x: -743123.46, y: -1043210.79, z: 312.45}, 0.25);
        area.AddPoint({x: -743123.48, y: -1043210.78, z: 312.45}, 0.25);
        expect(area.getVisibleDrawing().paths[0]?.points).toEqual([
            {x: -743123.5, y: -1043210.75, z: 312.45}
        ]);
        expect(() => {
            area.AddPoint({x: 1, y: 2, z: 3}, Number.MIN_VALUE);
        }).toThrow(RangeError);
        expect(area.getVisibleDrawing().paths[0]?.points).toHaveLength(1);
        expect(area.Finish(true)).toBe(false);
    });

});

describe("Coordinates", () => {
    it("roundtrips JTSK without altering Bpv height", () => {
        const service : Coordinates = new Coordinates();
        const point = {x: -743123.456, y: -1043210.789, z: 312.45};
        const world = service.ToGeographic(point);
        expect(world.x).toBeGreaterThan(12);
        expect(world.x).toBeLessThan(19);
        expect(world.y).toBeGreaterThan(48);
        expect(world.y).toBeLessThan(51);
        const restored = service.FromGeographic(world);
        expect(restored.x).toBeCloseTo(point.x, 2);
        expect(restored.y).toBeCloseTo(point.y, 2);
        expect(restored.z).toBe(point.z);
    });
});

describe("planar editor", () => {
    it("creates shapes in the first point's plane and retains analytic circles", () => {
        const a = {x: -700000, y: -1000000, z: 123.5};
        const b = {x: -699990, y: -999980, z: 999};
        for (const shape of <const>[DrawingShape.LINE, DrawingShape.RECTANGLE, DrawingShape.CIRCLE]) {
            const path = DrawingShapes.CreateDrawingShape(shape, a, b);
            expect(path.points.every((point) => point.z === a.z)).toBe(true);
            expect(path.closed).toBe(shape !== DrawingShape.LINE);
            if (shape === DrawingShape.CIRCLE) {
                expect(path.curve?.centre).toEqual(a);
                expect(path.curve?.axisU.x).toBeCloseTo(Math.sqrt(500));
            }
        }
        expect(() => DrawingShapes.CreateDrawingShape(DrawingShape.RECTANGLE, a, {...a, x: a.x + 1})).toThrow();
        expect(() => DrawingShapes.CreateDrawingShape(DrawingShape.CIRCLE, a, a)).toThrow();
        expect(() => DrawingShapes.SnapDrawingPoint(a, -1)).toThrow();
        expect(() => DrawingShapes.SnapDrawingPoint({...a, x: NaN}, 1)).toThrow();
    });

    it("edits and deletes vertices atomically, preserves styles and restores every step", () => {
        const area = new DrawingArea();
        const rectangle = DrawingShapes.CreateDrawingShape(
            DrawingShape.RECTANGLE, {x: 0, y: 0, z: 7}, {x: 10, y: 5, z: 7});
        area.AddPath({...rectangle, colour: 0xff00ff});
        const before = area.getDrawing();
        const points = rectangle.points.map((point, index) => index === 1 ? {x: 12, y: 0, z: 7} : point);
        area.EditVertices(0, points);
        expect(area.getDrawing().paths[0]?.colour).toBe(0xff00ff);
        area.Undo();
        expect(area.getDrawing()).toEqual(before);
        area.Redo();
        expect(area.getDrawing().paths[0]?.points).toEqual(points);
        expect(() => {
            area.EditVertices(0, points.slice(0, 2));
        }).toThrow();
        expect(() => {
            area.EditVertices(0, [{x: NaN, y: 0, z: 0}, ...points]);
        }).toThrow();
        area.RemovePath(0);
        expect(area.getDrawing().paths).toHaveLength(0);
        area.Undo();
        expect(area.getDrawing().paths[0]?.points).toEqual(points);
        area.EditVertices(0, points);
        area.Undo();
        expect(area.getDrawing()).toEqual(before);
        area.AddPath(DrawingShapes.CreateDrawingShape(DrawingShape.CIRCLE, {x: 0, y: 0, z: 0}, {x: 2, y: 0, z: 0}));
        expect(() => {
            area.EditVertices(1, points);
        }).toThrow();
        area.Redo();
        expect(area.getDrawing().paths).toHaveLength(2);
    });
});
