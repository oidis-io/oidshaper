/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { PerspectiveCamera, Vector2, Vector3 } from "three";
import { beforeEach, describe, expect, it } from "vitest";
import { ViewCamera } from "../../../src/typescript/render/ViewCamera.js";

function project(view : ViewCamera, point : Vector3) : Vector2 {
    const projected : Vector3 = point.clone().project(view.camera);
    return new Vector2(projected.x, projected.y);
}

function expectClose(actual : Vector2, expected : Vector2) : void {
    expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
}

describe("ViewCamera", () => {
    let view : ViewCamera;

    beforeEach(() => {
        view = new ViewCamera(new PerspectiveCamera(45, 1.5, 0.1, 1000));
        view.LookAt(new Vector3(1, 2, 3), 20);
    });

    it("zooms to a point and keeps it under the cursor", () => {
        const cursor : Vector2 = new Vector2(0.4, -0.3);
        const point : Vector3 = view.PointOnTargetPlane(cursor);
        const distance : number = view.camera.position.distanceTo(point);

        view.Zoom(point, 0.5);

        expectClose(project(view, point), cursor);
        expect(view.camera.position.distanceTo(point)).toBeCloseTo(distance / 2, 9);
    });

    it("returns to the same view when zooming back by the inverse factor", () => {
        const start : Vector3 = view.camera.position.clone();
        const point : Vector3 = view.PointOnTargetPlane(new Vector2(-0.6, 0.2));

        view.Zoom(point, 0.3);
        view.Zoom(point, 1 / 0.3);

        expect(view.camera.position.distanceTo(start)).toBeLessThan(1e-6);
    });

    it("pans so that the grabbed point follows the cursor", () => {
        const grab : Vector3 = view.PointOnTargetPlane(new Vector2(0.1, 0.1));
        const cursor : Vector2 = new Vector2(-0.5, 0.35);

        view.Pan(grab, cursor);

        expectClose(project(view, grab), cursor);
    });

    it("orbits around a pivot at a constant distance and keeps the pivot in place on the screen", () => {
        const pivot : Vector3 = view.PointOnTargetPlane(new Vector2(0.3, 0.2));
        const distance : number = view.camera.position.distanceTo(pivot);
        const onScreen : Vector2 = project(view, pivot);

        view.Orbit(pivot, 0.7, 0.2);

        expect(view.camera.position.distanceTo(pivot)).toBeCloseTo(distance, 9);
        expectClose(project(view, pivot), onScreen);
    });

    it("stops the orbit short of the poles", () => {
        view.Orbit(view.getTarget(), 0, -10);
        expect(view.getDirection().z).toBeGreaterThan(-1);
        expect(view.getDirection().z).toBeLessThan(-0.99);

        view.Orbit(view.getTarget(), 0, 10);
        expect(view.getDirection().z).toBeLessThan(1);
        expect(view.getDirection().z).toBeGreaterThan(0.99);
        expect(view.camera.position.toArray().every(Number.isFinite)).toBe(true);
    });
});
