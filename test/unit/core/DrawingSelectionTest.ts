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
import { DrawingSelection, SelectionMode } from "../../../src/typescript/core/DrawingSelection.js";
import { DrawingArea } from "../../../src/typescript/core/DrawingArea.js";
import { DrawingShape, DrawingShapes } from "../../../src/typescript/core/DrawingShapes.js";

import type { IPoint2 } from "../../../src/typescript/core/DrawingSelection.js";

const box : readonly IPoint2[] = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}];

describe("directional area selection", () => {
    it("distinguishes full containment, intersection, boundary touch and unrelated geometry", () => {
        const inside = [{x: 1, y: 1}, {x: 9, y: 9}];
        const across = [{x: -10, y: 5}, {x: 20, y: 5}];
        const touch = [{x: -10, y: 0}, {x: 0, y: 0}];
        const outside = [{x: -10, y: -10}, {x: -5, y: -5}];
        for (const mode of <const>[SelectionMode.WINDOW, SelectionMode.CROSSING]) {
            expect(DrawingSelection.PathInSelection(inside, box, mode)).toBe(true);
            expect(DrawingSelection.PathInSelection(outside, box, mode)).toBe(false);
            expect(DrawingSelection.PathInSelection(box, box, mode, true)).toBe(true);
            expect(DrawingSelection.PathInSelection(across, box, mode)).toBe(mode === SelectionMode.CROSSING);
            expect(DrawingSelection.PathInSelection(touch, box, mode)).toBe(mode === SelectionMode.CROSSING);
        }
    });

    it("rejects an edge leaving a concave lasso even when both endpoints are inside", () => {
        const lasso = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 7, y: 10},
            {x: 7, y: 3}, {x: 3, y: 3}, {x: 3, y: 10}, {x: 0, y: 10}];
        expect(DrawingSelection.PathInSelection([{x: 1, y: 8}, {x: 9, y: 8}], lasso, SelectionMode.WINDOW)).toBe(false);
        expect(DrawingSelection.PathInSelection([{x: 1, y: 8}, {x: 9, y: 8}], lasso,
            SelectionMode.CROSSING)).toBe(true);
        expect(DrawingSelection.PathInSelection([{x: 1, y: 1}, {x: 9, y: 1}], lasso, SelectionMode.WINDOW)).toBe(true);
        expect(DrawingSelection.PathInSelection([{x: 4, y: 8}, {x: 6, y: 8}], lasso,
            SelectionMode.CROSSING)).toBe(false);
    });

    it("handles collinear overlaps, single points and filled shapes containing the selection", () => {
        expect(DrawingSelection.PathInSelection([{x: -1, y: 0}, {x: 11, y: 0}], box,
            SelectionMode.CROSSING)).toBe(true);
        expect(DrawingSelection.PathInSelection([{x: 1, y: 0}, {x: 9, y: 0}], box, SelectionMode.WINDOW)).toBe(true);
        expect(DrawingSelection.PathInSelection([{x: 5, y: 5}], box, SelectionMode.WINDOW)).toBe(true);
        const outer = [{x: -10, y: -10}, {x: 20, y: -10}, {x: 20, y: 20}, {x: -10, y: 20}];
        expect(DrawingSelection.PathInSelection(outer, box, SelectionMode.CROSSING, true, true)).toBe(true);
        expect(DrawingSelection.PathInSelection(outer, box, SelectionMode.CROSSING, true, false)).toBe(false);
        expect(DrawingSelection.PathInSelection(outer, box, SelectionMode.WINDOW, true, true)).toBe(false);
        expect(DrawingSelection.PathInSelection([{x: NaN, y: 0}], box, SelectionMode.WINDOW)).toBe(false);
        expect(DrawingSelection.PathInSelection([{x: 5, y: 5}], [{x: 0, y: 0}, {x: 5, y: 5}, {x: 10, y: 10}],
            SelectionMode.WINDOW)).toBe(false);
    });

    it("deletes a multi-selection in one undo step and validates all indices before changing anything", () => {
        const area = new DrawingArea();
        for (let x = 0; x < 3; x++) {
            area.AddPath(DrawingShapes.CreateDrawingShape(DrawingShape.LINE, {x, y: 0, z: 0}, {x, y: 5, z: 0}));
        }
        const before = area.getDrawing();
        expect(() => {
            area.RemovePaths([0, 10]);
        }).toThrow();
        expect(area.getDrawing()).toEqual(before);
        area.RemovePaths([0, 2, 2]);
        expect(area.getDrawing().paths).toEqual([before.paths[1]]);
        area.Undo();
        expect(area.getDrawing()).toEqual(before);
        area.Redo();
        expect(area.getDrawing().paths).toHaveLength(1);
    });
});
