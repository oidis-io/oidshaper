/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityTransforms } from "./entities/EntityTransform.js";

import type { IVector3 } from "./LocalOrigin.js";
import type { EntityTransform } from "./entities/EntityTransform.js";

export class WorkingPlane {
    private static readonly PARALLEL_DIRECTION_TOLERANCE : number = 1e-12;

    private readonly transform : EntityTransform;
    private readonly inverse : EntityTransform;

    constructor(transform : EntityTransform = EntityTransforms.Identity()) {
        EntityTransforms.Validate(transform);
        this.transform = [...transform];
        this.inverse = EntityTransforms.Inverse(transform);
    }

    public getTransform() : EntityTransform {
        return [...this.transform];
    }

    public ToLocal(point : IVector3) : IVector3 {
        return EntityTransforms.TransformPoint(this.inverse, point);
    }

    public ToWorld(point : IVector3) : IVector3 {
        return EntityTransforms.TransformPoint(this.transform, point);
    }

    public Intersect(origin : IVector3, direction : IVector3) : IVector3 | null {
        if (![origin.x, origin.y, origin.z, direction.x, direction.y, direction.z].every(Number.isFinite)) {
            return null;
        }
        const point = this.ToLocal(origin);
        const ray = EntityTransforms.TransformPoint(this.inverse, direction, true);
        if (Math.abs(ray.z) < WorkingPlane.PARALLEL_DIRECTION_TOLERANCE) {
            return null;
        }
        const distance = -point.z / ray.z;
        return distance < 0 ? null : this.ToWorld({x: point.x + (distance * ray.x),
            y: point.y + (distance * ray.y), z: 0});
    }
}
