/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityGripRole, EntitySnapKind } from "./IEntity.js";

import type { IRawEntityData } from "./contracts/IRawEntityData.js";
import type { IVector3 } from "../LocalOrigin.js";
import type {
    IEntityType, IEntityCapabilities, IEntityEdit, IEntityGeometry, IEntityGrip, IEntitySnap
} from "./IEntity.js";

/** Stateless type implementation shared by document entities; mutable state belongs to EntityDocument. */
export abstract class BaseEntity<TData> implements IEntityType<TData> {
    public readonly acceptsChildren : boolean = false;

    protected static record(data : unknown) : asserts data is IRawEntityData {
        if (data === null || typeof data !== "object" || Array.isArray(data)) {
            throw new TypeError("Expected entity data.");
        }
    }

    protected static point(value : unknown) : value is IVector3 {
        return value !== null && typeof value === "object" && "x" in value && "y" in value && "z" in value &&
            [value.x, value.y, value.z].every((item) => typeof item === "number" && Number.isFinite(item));
    }

    protected static vertexGrips(points : readonly IVector3[]) : readonly IEntityGrip[] {
        return points.map((position, index) => ({id: String(index), position, role: EntityGripRole.VERTEX}));
    }

    protected static polylineSnaps(points : readonly IVector3[], closed : boolean) : readonly IEntitySnap[] {
        const result : IEntitySnap[] = points.map((position) => ({position, kind: EntitySnapKind.ENDPOINT}));
        for (let index = 0; index < points.length; index++) {
            const a = points[index], b = points[(index + 1) % points.length];
            if (a !== undefined && b !== undefined && (closed || index + 1 < points.length)) {
                result.push({kind: EntitySnapKind.MIDPOINT, position: {
                    x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2}});
            }
        }
        return result;
    }

    protected static movedPoints(points : readonly IVector3[], grip : string, value : IVector3) : readonly IVector3[] {
        const index = Number(grip);
        if (!Number.isInteger(index) || points[index] === undefined || !BaseEntity.point(value)) {
            throw new RangeError("Unknown vertex grip or invalid position.");
        }
        return points.map((old, position) => position === index ? {...value} : old);
    }

    public getCapabilities(data : TData) : IEntityCapabilities {
        return {children: this.acceptsChildren, grips: this.getGrips(data).length > 0, topology: false};
    }

    public getGrips(_data : TData) : readonly IEntityGrip[] {
        return [];
    }

    public getSnapPoints(data : TData) : readonly IEntitySnap[] {
        return this.getGrips(data).map((grip) => ({position: grip.position,
            kind: grip.role === EntityGripRole.CENTRE ? EntitySnapKind.CENTRE : EntitySnapKind.ENDPOINT,
            ...(grip.part === undefined ? {} : {part: grip.part})}));
    }

    public MoveGrip(_data : TData, _grip : string, _position : IVector3) : IEntityEdit {
        throw new Error("This entity has no editable grips.");
    }

    public abstract readonly typeId : string;
    public abstract Validate(data : unknown) : asserts data is TData;
    public abstract getGeometry(data : TData) : IEntityGeometry;
}
