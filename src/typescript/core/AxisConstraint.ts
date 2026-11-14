/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IVector3 } from "./LocalOrigin.js";

// Closest point on an axis to a forward ray; parallel views have no stable result.

export class AxisConstraint {
    private static readonly PARALLEL_RELATIVE_TOLERANCE : number = 1e-8;

    public static AxisRayParameter(origin : IVector3, direction : IVector3,
        pivot : IVector3, axis : IVector3) : number | null {
        const delta = {x: origin.x - pivot.x, y: origin.y - pivot.y, z: origin.z - pivot.z};
        const aa = AxisConstraint.dot(axis, axis);
        const rr = AxisConstraint.dot(direction, direction);
        const ar = AxisConstraint.dot(axis, direction);
        const denominator = (aa * rr) - (ar * ar);
        if (!Number.isFinite(denominator) ||
            denominator <= AxisConstraint.PARALLEL_RELATIVE_TOLERANCE * aa * rr || aa === 0 || rr === 0) {
            return null;
        }
        const position = ((rr * AxisConstraint.dot(axis, delta)) -
            (ar * AxisConstraint.dot(direction, delta))) / denominator;
        const rayDistance = ((ar * position) - AxisConstraint.dot(direction, delta)) / rr;
        return Number.isFinite(position) && rayDistance >= 0 ? position : null;
    }

    private static dot(a : IVector3, b : IVector3) : number {
        return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
    }

}
