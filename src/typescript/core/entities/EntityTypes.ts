/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityGripRole, EntitySnapKind, EntityTypeId } from "./IEntity.js";
import { BoxEntity, TopologyEntity } from "./TopologyEntity.js";
import { BaseEntity } from "./BaseEntity.js";
import { EntityRegistry } from "./EntityRegistry.js";
import { EntityTransforms } from "./EntityTransform.js";

import type { IVector3 } from "../LocalOrigin.js";
import type { IEntityEdit, IEntityGeometry, IEntityGrip, IEntitySnap } from "./IEntity.js";

export interface IPolylineData {
    readonly points : readonly IVector3[];
    readonly closed : boolean;
    readonly colour? : number;
    readonly filled? : boolean;
}

export interface ICircleData {
    readonly centre : IVector3;
    readonly radius : number;
}

export interface IRectangleData {
    readonly a : IVector3;
    readonly b : IVector3;
}

export interface IMeshData {
    readonly vertices : readonly IVector3[];
    readonly triangles : readonly number[];
    readonly colour? : number;
}

export class PolylineEntity extends BaseEntity<IPolylineData> {
    private static readonly MIN_CLOSED_POINTS : number = 3;
    private static readonly MIN_OPEN_POINTS : number = 1;

    public readonly typeId : string = EntityTypeId.POLYLINE;

    public Validate(data : unknown) : asserts data is IPolylineData {
        BaseEntity.record(data);
        if ((data["colour"] !== undefined &&
            (typeof data["colour"] !== "number" || !Number.isFinite(data["colour"]))) ||
            (data["filled"] !== undefined && typeof data["filled"] !== "boolean")) {
            throw new RangeError("Invalid polyline appearance.");
        }
        if (!Array.isArray(data["points"]) || !data["points"].every((item : unknown) => BaseEntity.point(item)) ||
            typeof data["closed"] !== "boolean" ||
            data["points"].length <
            (data["closed"] ? PolylineEntity.MIN_CLOSED_POINTS : PolylineEntity.MIN_OPEN_POINTS)) {
            throw new RangeError("Invalid polyline vertices.");
        }
    }

    public getGeometry(data : IPolylineData) : IEntityGeometry {
        return {paths: [{...data, layer: "default"}]};
    }

    public override getGrips(data : IPolylineData) : readonly IEntityGrip[] {
        return BaseEntity.vertexGrips(data.points);
    }

    public override getSnapPoints(data : IPolylineData) : readonly IEntitySnap[] {
        return BaseEntity.polylineSnaps(data.points, data.closed);
    }

    public override MoveGrip(data : IPolylineData, grip : string, position : IVector3) : IEntityEdit<IPolylineData> {
        return {type: this.typeId, data: {...data, points: BaseEntity.movedPoints(data.points, grip, position)}};
    }
}

export class CircleEntity extends BaseEntity<ICircleData> {
    private static readonly QUADRANT_COUNT : number = 4;
    private static readonly PLANE_DISTANCE_TOLERANCE : number = 1e-6;
    private static readonly SEGMENT_COUNT : number = 128;
    private static readonly HALF_SEGMENT_COUNT : number = 64;
    private static readonly DEFAULT_COLOUR : number = 0xb74b88;

    private static readonly CENTRE_GRIP : string = "centre";
    private static readonly RADIUS_GRIP : string = "radius";

    public readonly typeId : string = EntityTypeId.CIRCLE;

    public Validate(data : unknown) : asserts data is ICircleData {
        BaseEntity.record(data);
        if (!BaseEntity.point(data["centre"]) || typeof data["radius"] !== "number" ||
            !Number.isFinite(data["radius"]) || data["radius"] <= 0) {
            throw new RangeError("Circle needs a finite centre and positive radius.");
        }
    }

    public getGeometry(data : ICircleData) : IEntityGeometry {
        const points = Array.from({length: CircleEntity.SEGMENT_COUNT}, (_, index) => {
            const angle = (index * Math.PI) / CircleEntity.HALF_SEGMENT_COUNT;
            return {x: data.centre.x + (data.radius * Math.cos(angle)),
                y: data.centre.y + (data.radius * Math.sin(angle)), z: data.centre.z};
        });
        return {paths: [{layer: "default", closed: true, points, colour: CircleEntity.DEFAULT_COLOUR,
            curve: {centre: data.centre, axisU: {x: data.radius, y: 0, z: 0},
                axisV: {x: 0, y: data.radius, z: 0}, start: 0, sweep: Math.PI * 2}}]};
    }

    public override getGrips(data : ICircleData) : readonly IEntityGrip[] {
        const plane = EntityTransforms.Translation({x: 0, y: 0, z: data.centre.z});
        return [{id: CircleEntity.CENTRE_GRIP, position: data.centre, role: EntityGripRole.CENTRE, plane},
            {id: CircleEntity.RADIUS_GRIP, position: {...data.centre, x: data.centre.x + data.radius},
                role: EntityGripRole.RADIUS, plane}];
    }

    public override getSnapPoints(data : ICircleData) : readonly IEntitySnap[] {
        const centre = data.centre;
        const radius = data.radius;
        return [{kind: EntitySnapKind.CENTRE, position: centre},
            ...Array.from({length: CircleEntity.QUADRANT_COUNT}, (_, index) => ({
                kind: EntitySnapKind.QUADRANT, position: {x: centre.x + (radius * Math.cos((index * Math.PI) / 2)),
                    y: centre.y + (radius * Math.sin((index * Math.PI) / 2)), z: centre.z}}))];
    }

    public override MoveGrip(data : ICircleData, grip : string, position : IVector3) : IEntityEdit<ICircleData> {
        if (grip === CircleEntity.CENTRE_GRIP) {
            return {type: this.typeId, data: {...data, centre: position}};
        }
        if (grip !== CircleEntity.RADIUS_GRIP ||
            Math.abs(position.z - data.centre.z) > CircleEntity.PLANE_DISTANCE_TOLERANCE) {
            throw new Error("Unknown circle grip or point outside the circle plane.");
        }
        return {type: this.typeId, data: {...data,
            radius: Math.hypot(position.x - data.centre.x, position.y - data.centre.y)}};
    }
}

export class RectangleEntity extends BaseEntity<IRectangleData> {
    public readonly typeId : string = EntityTypeId.RECTANGLE;

    public Validate(data : unknown) : asserts data is IRectangleData {
        BaseEntity.record(data);
        if (!BaseEntity.point(data["a"]) || !BaseEntity.point(data["b"]) || data["a"].z !== data["b"].z ||
            data["a"].x === data["b"].x || data["a"].y === data["b"].y) {
            throw new RangeError("Rectangle requires two opposite corners in its local plane.");
        }
    }

    public getGeometry(data : IRectangleData) : IEntityGeometry {
        const a = data.a;
        const b = data.b;
        return {paths: [{layer: "default", closed: true,
            points: [a, {x: b.x, y: a.y, z: a.z}, b, {x: a.x, y: b.y, z: a.z}]}]};
    }

    public override getGrips(data : IRectangleData) : readonly IEntityGrip[] {
        return BaseEntity.vertexGrips(this.getGeometry(data).paths[0]?.points ?? []);
    }

    public override getSnapPoints(data : IRectangleData) : readonly IEntitySnap[] {
        return BaseEntity.polylineSnaps(this.getGeometry(data).paths[0]?.points ?? [], true);
    }

    public override MoveGrip(data : IRectangleData, grip : string, position : IVector3) : IEntityEdit<IPolylineData> {
        const points = BaseEntity.movedPoints(this.getGeometry(data).paths[0]?.points ?? [], grip, position);
        return {type: EntityTypeId.POLYLINE, data: {points, closed: true}};
    }
}

export class MeshEntity extends BaseEntity<IMeshData> {
    private static readonly TRIANGLE_VERTEX_COUNT : number = 3;
    private static readonly MIN_VERTICES : number = 3;
    private static readonly DEFAULT_COLOUR : number = 0xe2a700;

    public readonly typeId : string = EntityTypeId.MESH;

    public Validate(data : unknown) : asserts data is IMeshData {
        BaseEntity.record(data);
        if (data["colour"] !== undefined &&
            (typeof data["colour"] !== "number" || !Number.isFinite(data["colour"]))) {
            throw new RangeError("Invalid mesh colour.");
        }
        const vertices = data["vertices"];
        const triangles = data["triangles"];
        if (!Array.isArray(vertices) || vertices.length < MeshEntity.MIN_VERTICES ||
            !vertices.every((item : unknown) => BaseEntity.point(item)) ||
            !Array.isArray(triangles) || triangles.length === 0 ||
            triangles.length % MeshEntity.TRIANGLE_VERTEX_COUNT !== 0 ||
            !triangles.every((index : unknown) => typeof index === "number" && Number.isInteger(index) &&
                index >= 0 && index < vertices.length)) {
            throw new RangeError("Mesh needs finite vertices and valid triangle indices.");
        }
    }

    public getGeometry(data : IMeshData) : IEntityGeometry {
        return {paths: [], meshes: [{...data, layer: "default", colour: data.colour ?? MeshEntity.DEFAULT_COLOUR}]};
    }

    public override getGrips(data : IMeshData) : readonly IEntityGrip[] {
        return BaseEntity.vertexGrips(data.vertices);
    }

    public override MoveGrip(data : IMeshData, grip : string, position : IVector3) : IEntityEdit<IMeshData> {
        return {type: this.typeId, data: {...data, vertices: BaseEntity.movedPoints(data.vertices, grip, position)}};
    }
}

export interface IGroupData {
    readonly [key : string] : unknown;
}

export class GroupEntity extends BaseEntity<IGroupData> {
    public override readonly acceptsChildren : boolean = true;

    public readonly typeId : string;

    constructor(typeId : string = EntityTypeId.GROUP) {
        super();
        this.typeId = typeId;
    }

    public Validate(data : unknown) : asserts data is IGroupData {
        BaseEntity.record(data);
    }

    public getGeometry(_data : IGroupData) : IEntityGeometry {
        return {paths: []};
    }

}

export class EntityTypes {
    private static readonly BOX_MIN_X_MIN_Y_MIN_Z : number = 0;
    private static readonly BOX_MAX_X_MIN_Y_MIN_Z : number = 1;
    private static readonly BOX_MAX_X_MAX_Y_MIN_Z : number = 2;
    private static readonly BOX_MIN_X_MAX_Y_MIN_Z : number = 3;
    private static readonly BOX_MIN_X_MIN_Y_MAX_Z : number = 4;
    private static readonly BOX_MAX_X_MIN_Y_MAX_Z : number = 5;
    private static readonly BOX_MAX_X_MAX_Y_MAX_Z : number = 6;
    private static readonly BOX_MIN_X_MAX_Y_MAX_Z : number = 7;

    public static CreateRegistry() : EntityRegistry {
        const registry = new EntityRegistry();
        registry.Register(new PolylineEntity());
        registry.Register(new CircleEntity());
        registry.Register(new RectangleEntity());
        registry.Register(new MeshEntity());
        registry.Register(new BoxEntity());
        registry.Register(new TopologyEntity());
        registry.Register(new GroupEntity());
        registry.Register(new GroupEntity(EntityTypeId.MODEL));
        return registry;
    }

    public static BoxMesh(size : IVector3) : IMeshData {
        const value : unknown = size;
        if (value === null || typeof value !== "object" || !("x" in value) || !("y" in value) || !("z" in value) ||
            ![value.x, value.y, value.z].every((item) => typeof item === "number" && Number.isFinite(item)) ||
            size.x <= 0 || size.y <= 0 || size.z <= 0) {
            throw new RangeError("Box dimensions must be positive.");
        }
        const vertices = [
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ].map(([x = 0, y = 0, z = 0]) => ({x: (x * size.x) / 2, y: (y * size.y) / 2, z: (z * size.z) / 2}));
        return {vertices, triangles: [
            EntityTypes.BOX_MIN_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MAX_X_MAX_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MIN_Z,
            EntityTypes.BOX_MIN_X_MIN_Y_MAX_Z,
            EntityTypes.BOX_MIN_X_MAX_Y_MAX_Z
        ]};
    }
}
