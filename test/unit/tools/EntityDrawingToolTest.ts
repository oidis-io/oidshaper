/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { describe, it, expect } from "vitest";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";
import { DrawingPrimitive, EntityDrawingTool } from "../../../src/typescript/tools/EntityDrawingTool.js";
import { EntityTransforms } from "../../../src/typescript/core/entities/EntityTransform.js";

describe("entity drawing sessions", () => {
    it("keeps preview separate and commits an entire polygon as one undo step", () => {
        const document = new EntityDocument();
        const tool = new EntityDrawingTool(document, {primitive: DrawingPrimitive.POLYGON, layer: "default"});
        tool.AddPoint({x: 0, y: 0, z: 0});
        tool.AddPoint({x: 5, y: 0, z: 0});
        expect(tool.Preview({x: 5, y: 5, z: 0}).paths).toHaveLength(1);
        expect(document.getEntities()).toHaveLength(0);
        expect(() => {
            tool.Finish();
        }).toThrow(/points/);
        tool.AddPoint({x: 5, y: 5, z: 0});
        tool.Finish();
        expect(document.getEntities()).toHaveLength(1);
        expect(document.getGeometry(document.getEntities()[0]?.id ?? "")[0]?.closed).toBe(true);
        document.Undo();
        expect(document.getEntities()).toHaveLength(0);
        document.Redo();
        expect(document.getEntities()).toHaveLength(1);
    });

    it("draws parametric circles in vertical and tilted planes", () => {
        for (const angle of [Math.PI / 2, Math.PI / 4]) {
            const document = new EntityDocument();
            const plane = EntityTransforms.Multiply(EntityTransforms.Translation({x: 10, y: 20, z: 30}),
                EntityTransforms.Rotation({x: angle, y: 0, z: 0}));
            const tool = new EntityDrawingTool(document, {primitive: DrawingPrimitive.CIRCLE, layer: "default", plane});
            const centre = EntityTransforms.TransformPoint(plane, {x: 1, y: 2, z: 0});
            expect(tool.AddPoint(centre)).toBe(false);
            expect(tool.AddPoint(EntityTransforms.TransformPoint(plane, {x: 4, y: 2, z: 0}))).toBe(true);
            const entity = document.getEntities()[0];
            expect(entity?.type).toBe("circle");
            expect(entity?.transform).toEqual(plane);
            const grip = document.getGrips(entity?.id ?? "")[0];
            expect(grip?.position.x).toBeCloseTo(centre.x);
            expect(grip?.position.y).toBeCloseTo(centre.y);
            expect(grip?.position.z).toBeCloseTo(centre.z);
        }
    });

    it("rejects stale sessions and off-plane or duplicate points without corrupting pending input", () => {
        const document = new EntityDocument();
        const tool = new EntityDrawingTool(document, {primitive: DrawingPrimitive.RECTANGLE, layer: "default"});
        tool.AddPoint({x: 0, y: 0, z: 0});
        expect(() => tool.AddPoint({x: 0, y: 0, z: 0})).toThrow();
        expect(() => tool.AddPoint({x: 0, y: 1, z: 0})).toThrow();
        expect(() => tool.AddPoint({x: 1, y: 1, z: 1})).toThrow(/plane/);
        expect(tool.getPointCount()).toBe(1);
        expect(document.getEntities()).toHaveLength(0);
        tool.UndoPoint();
        expect(tool.getPointCount()).toBe(0);
        tool.AddPoint({x: 0, y: 0, z: 0});
        tool.Cancel();
        expect(tool.getPointCount()).toBe(0);
        document.setLayer({layer: {name: "other", visible: true, locked: false}});
        expect(() => tool.Preview({x: 1, y: 1, z: 0})).toThrow(/stale/);
        expect(() => tool.AddPoint({x: 1, y: 1, z: 0})).toThrow(/stale/);
    });
});
