/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityTransforms } from "../core/entities/EntityTransform.js";

import type { EntityDocument } from "../core/entities/EntityDocument.js";
import type { EntitySnapKind, IEntitySnap, IEntityPart } from "../core/entities/IEntity.js";
import type { IVector3 } from "../core/LocalOrigin.js";
import type { IPoint2 } from "../core/DrawingSelection.js";
import type { WorkingPlane } from "../core/WorkingPlane.js";

export interface ISnapPointProjector {
    (point : IVector3) : IPoint2 | null;
}

export enum SnapSurfaceKind {
    GRID = "grid",
    PLANE = "plane"
}

export interface ISnapResult {
    readonly position : IVector3;
    readonly kind : EntitySnapKind | SnapSurfaceKind;
    readonly entity? : string;
    readonly part? : IEntityPart;
}

interface ICandidate extends IEntitySnap {
    readonly entity : string;
    readonly ancestors : readonly string[];
}

export class EntitySnapResolver {
    private static readonly DEFAULT_RADIUS_PX : number = 10;
    private static readonly PLANE_DISTANCE_TOLERANCE : number = 1e-6;

    private readonly document : EntityDocument;
    private revision : number = -1;
    private candidates : readonly ICandidate[] = [];

    constructor(document : EntityDocument) {
        this.document = document;
    }

    public Resolve(point : IVector3, plane : WorkingPlane, grid : number, cursor : IPoint2,
        project : ISnapPointProjector, radius : number = EntitySnapResolver.DEFAULT_RADIUS_PX,
        excluded : ReadonlySet<string> = new Set()) : ISnapResult {
        if (!Number.isFinite(grid) || grid < 0 || !Number.isFinite(radius) || radius < 0) {
            throw new RangeError("Snap step and screen radius must be finite and nonnegative.");
        }
        if (![point.x, point.y, point.z, cursor.x, cursor.y].every(Number.isFinite)) {
            throw new RangeError("Snap position must be finite.");
        }
        this.refresh();
        let nearest : ICandidate | undefined;
        let distance = radius;
        for (const candidate of this.candidates) {
            if (candidate.ancestors.some((id) => excluded.has(id)) ||
                Math.abs(plane.ToLocal(candidate.position).z) > EntitySnapResolver.PLANE_DISTANCE_TOLERANCE) {
                continue;
            }
            const screen = project(candidate.position);
            if (screen !== null) {
                const current = Math.hypot(screen.x - cursor.x, screen.y - cursor.y);
                if (current <= distance) {
                    distance = current; nearest = candidate;
                }
            }
        }
        if (nearest !== undefined) {
            return {kind: nearest.kind, entity: nearest.entity, position: {...nearest.position},
                ...(nearest.part === undefined ? {} : {part: nearest.part})};
        }
        const local = plane.ToLocal(point);
        const position = plane.ToWorld({x: grid > 0 ? Math.round(local.x / grid) * grid : local.x,
            y: grid > 0 ? Math.round(local.y / grid) * grid : local.y, z: 0});
        return {position, kind: grid > 0 ? SnapSurfaceKind.GRID : SnapSurfaceKind.PLANE};
    }

    private refresh() : void {
        if (this.revision === this.document.getRevision()) {
            return;
        }
        this.candidates = this.document.getEntities().filter((entity) => this.document.IsVisible(entity.id))
            .flatMap((entity) => {
                const binding = this.document.registry.getType(entity.type).Parse(entity.data);
                const points = binding.getSnapPoints();
                const transform = this.document.getWorldTransform(entity.id);
                const ancestors = [entity.id];
                let parent = entity.parentId;
                while (parent !== null) {
                    ancestors.push(parent); parent = this.document.getEntity(parent).parentId;
                }
                return points.map((snap) => ({...snap, entity: entity.id, ancestors,
                    position: EntityTransforms.TransformPoint(transform, snap.position)}));
            });
        this.revision = this.document.getRevision();
    }
}
