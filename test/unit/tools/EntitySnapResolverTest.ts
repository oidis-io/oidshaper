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
import { WorkingPlane } from "../../../src/typescript/core/WorkingPlane.js";
import { EntitySnapResolver } from "../../../src/typescript/tools/EntitySnapResolver.js";
import { EntityTransforms } from "../../../src/typescript/core/entities/EntityTransform.js";

import type { IPoint2 } from "../../../src/typescript/core/DrawingSelection.js";

describe("working plane and entity snaps", () => {
    it("intersects horizontal, vertical and tilted planes and rejects parallel or backward rays", () => {
        for (const angle of [0, Math.PI / 4, Math.PI / 2]) {
            const plane = new WorkingPlane(EntityTransforms.Rotation({x: angle, y: 0, z: 0}));
            const target = plane.ToWorld({x: 2, y: 3, z: 0});
            const origin = plane.ToWorld({x: 2, y: 3, z: 10});
            const direction = {x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z};
            const hit = plane.Intersect(origin, direction);
            expect(hit?.x).toBeCloseTo(target.x);
            expect(hit?.y).toBeCloseTo(target.y);
            expect(hit?.z).toBeCloseTo(target.z);
            expect(plane.Intersect(origin, {x: -direction.x, y: -direction.y, z: -direction.z})).toBeNull();
            expect(plane.Intersect(origin, {x: 1, y: 0, z: 0})).toBeNull();
        }
    });

    it("keeps off-grid endpoints exact, refreshes after edits and excludes hidden or dragged entities", () => {
        const document = new EntityDocument();
        document.AddEntities({entities: [{id: "line", type: "polyline", name: "line",
            data: {points: [{x: 0.3, y: 0.7, z: 0}, {x: 10.3, y: 0.7, z: 0}], closed: false}}]});
        const resolver = new EntitySnapResolver(document);
        const plane = new WorkingPlane();
        const point = {x: 0.4, y: 0.6, z: 0};
        const project = (value : IPoint2) : IPoint2 => value;
        expect(resolver.Resolve(point, plane, 1, point, project, 0.5)).toEqual({
            kind: "endpoint", entity: "line", position: {x: 0.3, y: 0.7, z: 0}});
        expect(resolver.Resolve(point, plane, 1, point, project, 0.5, new Set(["line"])).kind).toBe("grid");
        document.TransformEntities({ids: ["line"],
            delta: EntityTransforms.Translation({x: 5, y: 0, z: 0})});
        expect(resolver.Resolve(point, plane, 1, point, project, 0.5).kind).toBe("grid");
        const middle = {x: 10.3, y: 0.7, z: 0};
        expect(resolver.Resolve(middle, plane, 1, middle, project, 0.5).kind).toBe("midpoint");
        document.setLayer({layer: {name: "default", visible: false, locked: false}});
        expect(resolver.Resolve(middle, plane, 1, middle, project, 0.5).kind).toBe("grid");
        expect(() => resolver.Resolve(point, plane, -1, point, project)).toThrow();
    });
});
