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
import type { IEntityInput } from "../core/entities/IEntity.js";
import type { IVector3 } from "../core/LocalOrigin.js";
import type { IDrawing } from "../core/IDrawing.js";
import type { EntityTransform } from "../core/entities/EntityTransform.js";

export enum DrawingPrimitive {
    POINT = "point",
    LINE = "line",
    POLYLINE = "polyline",
    POLYGON = "polygon",
    RECTANGLE = "rectangle",
    CIRCLE = "circle"
}

export interface IEntityDrawingOptions {
    readonly primitive : DrawingPrimitive;
    readonly layer : string;
    readonly plane? : EntityTransform;
}

/** A drawing session commits one entity; pending points never mutate the document. */
export class EntityDrawingTool {
    private static readonly POINT_SEPARATION_TOLERANCE : number = 1e-10;
    private static readonly PLANE_DISTANCE_TOLERANCE : number = 1e-6;
    private static readonly PREVIEW_COLOUR : number = 0xffbb33;
    private static readonly MIN_POLYGON_POINTS : number = 3;

    private readonly document : EntityDocument;
    private readonly options : IEntityDrawingOptions;
    private points : IVector3[] = [];
    private readonly plane : EntityTransform;
    private readonly inverse : EntityTransform;
    private readonly revision : number;

    constructor(document : EntityDocument, options : IEntityDrawingOptions) {
        this.document = document;
        this.options = options;
        this.plane = [...options.plane ?? EntityTransforms.Identity()];
        EntityTransforms.Validate(this.plane);
        this.inverse = EntityTransforms.Inverse(this.plane);
        this.revision = document.getRevision();
    }

    public AddPoint(world : IVector3) : boolean {
        this.assertCurrent();
        const point = this.localPoint(world);
        const last = this.points.at(-1);
        if (last !== undefined && Math.hypot(point.x - last.x, point.y - last.y, point.z -
            last.z) < EntityDrawingTool.POINT_SEPARATION_TOLERANCE) {
            throw new Error("Choose a different point.");
        }
        this.points.push(point);
        const count = this.options.primitive === DrawingPrimitive.POINT ? 1 :
            [DrawingPrimitive.LINE, DrawingPrimitive.RECTANGLE, DrawingPrimitive.CIRCLE]
                .includes(this.options.primitive) ? 2 : Infinity;
        if (this.points.length === count) {
            try {
                this.Finish();
                return true;
            } catch (error : unknown) {
                this.points.pop();
                throw error;
            }
        }
        return false;
    }

    public UndoPoint() : void {
        this.points.pop();
    }

    public Cancel() : void {
        this.points = [];
    }

    public getPointCount() : number {
        return this.points.length;
    }

    public Preview(world : IVector3) : IDrawing {
        this.assertCurrent();
        const points = [...this.points, this.localPoint(world)];
        const drawing = this.document.getDrawing();
        let entity : IEntityInput;
        try {
            entity = this.entity(points);
            this.document.registry.getType(entity.type).Validate(entity.data);
        } catch {
            return {...drawing, paths: [...drawing.paths, {layer: this.options.layer, closed: false,
                points: points.map((point) => EntityTransforms.TransformPoint(this.plane, point)), colour:
                    EntityDrawingTool.PREVIEW_COLOUR}]};
        }
        const paths = this.document.registry.getType(entity.type).Parse(entity.data).getGeometry().paths.map((path) =>
            ({...path, layer: this.options.layer, colour: EntityDrawingTool.PREVIEW_COLOUR,
                points: path.points.map((point) => EntityTransforms.TransformPoint(this.plane, point))}));
        return {...drawing, paths: [...drawing.paths, ...paths]};
    }

    public Finish() : void {
        this.assertCurrent();
        const entity = this.entity(this.points);
        this.document.AddEntities({entities: [entity]});
        this.points = [];
    }

    private localPoint(world : IVector3) : IVector3 {
        if (![world.x, world.y, world.z].every(Number.isFinite)) {
            throw new Error("Drawing point must be finite.");
        }
        const local = EntityTransforms.TransformPoint(this.inverse, world);
        if (Math.abs(local.z) > EntityDrawingTool.PLANE_DISTANCE_TOLERANCE) {
            throw new Error("Point is outside the working plane.");
        }
        return {...local, z: 0};
    }

    private entity(points : readonly IVector3[]) : IEntityInput {
        const kind = this.options.primitive;
        const a = points[0], b = points[1];
        const minimum = kind === DrawingPrimitive.POINT ? 1 : kind === DrawingPrimitive.POLYGON ?
            EntityDrawingTool.MIN_POLYGON_POINTS : 2;
        if (points.length < minimum || a === undefined) {
            throw new Error(`The ${kind} requires at least ${String(minimum)} points.`);
        }
        const type = kind === DrawingPrimitive.RECTANGLE || kind === DrawingPrimitive.CIRCLE ?
            kind : DrawingPrimitive.POLYLINE;
        const data = kind === DrawingPrimitive.RECTANGLE ? {a, b} :
            kind === DrawingPrimitive.CIRCLE && b !== undefined ?
                {centre: a, radius: Math.hypot(b.x - a.x, b.y - a.y)} :
                {points, closed: kind === DrawingPrimitive.POLYGON};
        return {type, name: kind, layer: this.options.layer, transform: this.plane, data};
    }

    private assertCurrent() : void {
        if (this.document.getRevision() !== this.revision) {
            throw new Error("Drawing session is stale; restart it against the current document.");
        }
    }
}
