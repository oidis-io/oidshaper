/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export interface IVector3 {
    readonly x : number;
    readonly y : number;
    readonly z : number;
}

// National coordinates reach millions of metres, where a 32-bit float on the GPU steps by centimetres.
export class LocalOrigin implements IVector3 {
    public readonly x : number;
    public readonly y : number;
    public readonly z : number;

    /**
     * @param {ArrayLike<number>} points Packed x, y, z triplets.
     * @returns {LocalOrigin} Returns the centre of their bounding box.
     */
    public static CentreOf(points : ArrayLike<number>) : LocalOrigin {
        if (points.length === 0 || points.length % 3 !== 0) {
            throw new RangeError(`Expected non-empty packed xyz triplets, got ${String(points.length)} values.`);
        }
        const min : number[] = [Infinity, Infinity, Infinity];
        const max : number[] = [-Infinity, -Infinity, -Infinity];
        for (let index = 0; index < points.length; index++) {
            const axis : number = index % 3;
            const value : number = points[index] ?? NaN;
            min[axis] = Math.min(min[axis] ?? Infinity, value);
            max[axis] = Math.max(max[axis] ?? -Infinity, value);
        }
        return new LocalOrigin({
            x: middle(min[0], max[0]),
            y: middle(min[1], max[1]),
            z: middle(min[2], max[2])
        });
    }

    constructor(origin : IVector3) {
        assertFinite(origin, "origin");
        this.x = origin.x;
        this.y = origin.y;
        this.z = origin.z;
    }

    public ToLocal(point : IVector3) : IVector3 {
        return {x: point.x - this.x, y: point.y - this.y, z: point.z - this.z};
    }

    public ToWorld(local : IVector3) : IVector3 {
        return {x: local.x + this.x, y: local.y + this.y, z: local.z + this.z};
    }

    /**
     * @param {ArrayLike<number>} points Packed x, y, z triplets.
     * @returns {Float32Array} Returns them relative to this origin.
     */
    public ToLocalBuffer(points : ArrayLike<number>) : Float32Array {
        if (points.length % 3 !== 0) {
            throw new RangeError(`Expected packed xyz triplets, got ${String(points.length)} values.`);
        }
        const buffer : Float32Array = new Float32Array(points.length);
        for (let index = 0; index < points.length; index += 3) {
            buffer[index] = (points[index] ?? NaN) - this.x;
            buffer[index + 1] = (points[index + 1] ?? NaN) - this.y;
            buffer[index + 2] = (points[index + 2] ?? NaN) - this.z;
        }
        return buffer;
    }
}

function middle(min : number | undefined, max : number | undefined) : number {
    return ((min ?? NaN) + (max ?? NaN)) / 2;
}

function assertFinite(point : IVector3, name : string) : void {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        throw new RangeError(`The ${name} must have finite coordinates.`);
    }
}
