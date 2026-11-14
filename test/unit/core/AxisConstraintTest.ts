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
import { AxisConstraint } from "../../../src/typescript/core/AxisConstraint.js";

describe("axis ray constraint", () => {
    it("preserves a world axis at national coordinates and does not require normalized rays", () => {
        const pivot = {x: -743000, y: -1043000, z: 300};
        const result = AxisConstraint.AxisRayParameter({x: pivot.x + 10, y: pivot.y, z: 320},
            {x: -2, y: 0, z: -1}, pivot, {x: 0, y: 0, z: 1});
        expect(result).toBeCloseTo(15);
    });
    it("rejects parallel, degenerate and backward rays", () => {
        const zero = {x: 0, y: 0, z: 0}, z = {x: 0, y: 0, z: 1};
        expect(AxisConstraint.AxisRayParameter(zero, z, zero, z)).toBeNull();
        expect(AxisConstraint.AxisRayParameter(zero, zero, zero, z)).toBeNull();
        expect(AxisConstraint.AxisRayParameter({x: 10, y: 0, z: 2}, {x: 1, y: 0, z: 0}, zero, z)).toBeNull();
        expect(AxisConstraint.AxisRayParameter(zero, z, zero, zero)).toBeNull();
    });
});
