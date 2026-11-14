/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityPartKind } from "./IEntity.js";

import type { IVector3 } from "../LocalOrigin.js";

// IDs are stable within a topology and distinct across component kinds.
export type VertexId = `vertex:${string}`;
export type EdgeId = `edge:${string}`;
export type FaceId = `face:${string}`;

export interface ITopologyVertex {
    readonly id : VertexId;
    readonly position : IVector3;
}

export interface ITopologyEdge {
    readonly id : EdgeId;
    readonly start : VertexId;
    readonly end : VertexId;
}

export interface IOrientedEdge {
    readonly edgeId : EdgeId;
    readonly reversed : boolean;
}

export enum FaceRepresentationKind {
    PLANAR = "planar",
    MESH = "mesh"
}

export interface IPlanarFaceRepresentation {
    readonly kind : FaceRepresentationKind.PLANAR;
}

// Reserved capability contract; mesh conversion is not implemented by this foundation.
export interface IMeshFaceRepresentation {
    readonly kind : FaceRepresentationKind.MESH;
    readonly triangles : ReadonlyArray<readonly [VertexId, VertexId, VertexId]>;
}

export interface ITopologyFace {
    readonly id : FaceId;
    readonly boundary : readonly IOrientedEdge[];
    readonly representation : IPlanarFaceRepresentation;
}

export interface IEntityTopologyData {
    readonly vertices : readonly ITopologyVertex[];
    readonly edges : readonly ITopologyEdge[];
    readonly faces : readonly ITopologyFace[];
}

export class EntityTopology {
    private static readonly BOX_MIN_X_MIN_Y_MIN_Z : number = 0;
    private static readonly BOX_MAX_X_MIN_Y_MIN_Z : number = 1;
    private static readonly BOX_MAX_X_MAX_Y_MIN_Z : number = 2;
    private static readonly BOX_MIN_X_MAX_Y_MIN_Z : number = 3;
    private static readonly BOX_MIN_X_MIN_Y_MAX_Z : number = 4;
    private static readonly BOX_MAX_X_MIN_Y_MAX_Z : number = 5;
    private static readonly BOX_MAX_X_MAX_Y_MAX_Z : number = 6;
    private static readonly BOX_MIN_X_MAX_Y_MAX_Z : number = 7;

    private static readonly MIN_NORMALIZED_FACE_AREA : number = 1e-12;
    private static readonly NORMALIZED_COPLANARITY_TOLERANCE : number = 1e-10;
    private static readonly MIN_NORMALIZED_CONVEX_CROSS_PRODUCT : number = 1e-12;
    private static readonly MIN_FACE_EDGES : number = 3;

    public readonly vertices : readonly ITopologyVertex[];
    public readonly edges : readonly ITopologyEdge[];
    public readonly faces : readonly ITopologyFace[];

    private readonly vertexIndex : ReadonlyMap<VertexId, ITopologyVertex>;
    private readonly edgeIndex : ReadonlyMap<EdgeId, ITopologyEdge>;
    private readonly faceIndex : ReadonlyMap<FaceId, ITopologyFace>;
    private readonly vertexEdges : ReadonlyMap<VertexId, readonly ITopologyEdge[]>;
    private readonly edgeFaces : ReadonlyMap<EdgeId, readonly ITopologyFace[]>;
    private readonly vertexFaces : ReadonlyMap<VertexId, readonly ITopologyFace[]>;
    private readonly faceVertices : ReadonlyMap<FaceId, readonly ITopologyVertex[]>;

    // Centred box with outward face loops; render diagonals are not topology edges.
    public static Box(size : IVector3) : EntityTopology {
        EntityTopology.validatePoint(size);
        if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
            throw new RangeError("Box dimensions must be positive.");
        }
        const vertices : ITopologyVertex[] = [
            [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ].map(([x = 0, y = 0, z = 0], index) => ({
            id: `vertex:${String(index)}`,
            position: {x: x * (size.x / 2), y: y * (size.y / 2), z: z * (size.z / 2)}
        }));
        const edges : ITopologyEdge[] = [];
        const faces : ITopologyFace[] = [
            [
                EntityTopology.BOX_MIN_X_MIN_Y_MIN_Z,
                EntityTopology.BOX_MIN_X_MAX_Y_MIN_Z,
                EntityTopology.BOX_MAX_X_MAX_Y_MIN_Z,
                EntityTopology.BOX_MAX_X_MIN_Y_MIN_Z
            ],
            [
                EntityTopology.BOX_MIN_X_MIN_Y_MAX_Z,
                EntityTopology.BOX_MAX_X_MIN_Y_MAX_Z,
                EntityTopology.BOX_MAX_X_MAX_Y_MAX_Z,
                EntityTopology.BOX_MIN_X_MAX_Y_MAX_Z
            ],
            [
                EntityTopology.BOX_MIN_X_MIN_Y_MIN_Z,
                EntityTopology.BOX_MAX_X_MIN_Y_MIN_Z,
                EntityTopology.BOX_MAX_X_MIN_Y_MAX_Z,
                EntityTopology.BOX_MIN_X_MIN_Y_MAX_Z
            ],
            [
                EntityTopology.BOX_MAX_X_MIN_Y_MIN_Z,
                EntityTopology.BOX_MAX_X_MAX_Y_MIN_Z,
                EntityTopology.BOX_MAX_X_MAX_Y_MAX_Z,
                EntityTopology.BOX_MAX_X_MIN_Y_MAX_Z
            ],
            [
                EntityTopology.BOX_MAX_X_MAX_Y_MIN_Z,
                EntityTopology.BOX_MIN_X_MAX_Y_MIN_Z,
                EntityTopology.BOX_MIN_X_MAX_Y_MAX_Z,
                EntityTopology.BOX_MAX_X_MAX_Y_MAX_Z
            ],
            [
                EntityTopology.BOX_MIN_X_MAX_Y_MIN_Z,
                EntityTopology.BOX_MIN_X_MIN_Y_MIN_Z,
                EntityTopology.BOX_MIN_X_MIN_Y_MAX_Z,
                EntityTopology.BOX_MIN_X_MAX_Y_MAX_Z
            ]
        ].map((loop, index) => ({
            id: `face:${String(index)}`,
            representation: {kind: FaceRepresentationKind.PLANAR},
            boundary: loop.map((vertex, offset) => {
                const start : VertexId = `vertex:${String(vertex)}`;
                const end : VertexId = `vertex:${String(loop[(offset + 1) % loop.length])}`;
                const existing = edges.find((edge) =>
                    (edge.start === start && edge.end === end) || (edge.start === end && edge.end === start));
                if (existing !== undefined) {
                    return {edgeId: existing.id, reversed: existing.start !== start};
                }
                const id : EdgeId = `edge:${String(edges.length)}`;
                edges.push({id, start, end});
                return {edgeId: id, reversed: false};
            })
        }));
        return new EntityTopology({vertices, edges, faces});
    }

    private static lookup<K extends string, T>(items : ReadonlyMap<K, T>, id : K) : T {
        const item = items.get(id);
        if (item === undefined) {
            throw new RangeError(`Unknown topology reference: ${id}`);
        }
        return item;
    }

    private static validateIds(items : readonly IIdentified[], kind : EntityPartKind) : void {
        const ids = new Set<string>();
        for (const item of items) {
            if (typeof item.id !== "string" || !item.id.startsWith(`${kind}:`) ||
                item.id.slice(kind.length + 1).trim().length === 0) {
                throw new RangeError(`Invalid ${kind} ID.`);
            }
            if (ids.has(item.id)) {
                throw new RangeError(`Duplicate topology ID: ${item.id}`);
            }
            ids.add(item.id);
        }
    }

    private static validatePoint(point : IVector3) : void {
        if (![point.x, point.y, point.z].every(Number.isFinite)) {
            throw new RangeError("Topology coordinates must be finite.");
        }
    }

    // Normalize before cross products to keep large and small local coordinates usable.
    private static validatePlanar(points : readonly IVector3[]) : void {
        const origin = points[0];
        if (origin === undefined) {
            throw new RangeError("Missing face vertices.");
        }
        const offsets = points.map((point) => ({
            x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z
        }));
        const scale = offsets.reduce((maximum, point) =>
            Math.max(maximum, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)), 0);
        if (!Number.isFinite(scale) || scale === 0) {
            throw new RangeError("Degenerate face coordinates.");
        }
        const normalized = offsets.map((point) => ({x: point.x / scale, y: point.y / scale, z: point.z / scale}));
        const normal = {x: 0, y: 0, z: 0};
        for (let index = 0; index < normalized.length; index++) {
            const a = normalized[index];
            const b = normalized[(index + 1) % normalized.length];
            if (a !== undefined && b !== undefined) {
                normal.x += (a.y * b.z) - (a.z * b.y);
                normal.y += (a.z * b.x) - (a.x * b.z);
                normal.z += (a.x * b.y) - (a.y * b.x);
            }
        }
        const length = Math.hypot(normal.x, normal.y, normal.z);
        if (length <= EntityTopology.MIN_NORMALIZED_FACE_AREA) {
            throw new RangeError("A planar face must have nonzero area.");
        }
        if (normalized.some((point) =>
            Math.abs((point.x * normal.x) + (point.y * normal.y) + (point.z * normal.z)) / length >
                EntityTopology.NORMALIZED_COPLANARITY_TOLERANCE)) {
            throw new RangeError("A planar face must remain coplanar.");
        }
        // Every other vertex must lie strictly inside each directed boundary half-plane.
        for (let index = 0; index < normalized.length; index++) {
            const a = normalized[index];
            const b = normalized[(index + 1) % normalized.length];
            if (a === undefined || b === undefined) {
                continue;
            }
            for (let other = 0; other < normalized.length; other++) {
                const c = normalized[other];
                if (c === undefined || other === index || other === (index + 1) % normalized.length) {
                    continue;
                }
                const crossX = ((b.y - a.y) * (c.z - a.z)) - ((b.z - a.z) * (c.y - a.y));
                const crossY = ((b.z - a.z) * (c.x - a.x)) - ((b.x - a.x) * (c.z - a.z));
                const crossZ = ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));
                if (((crossX * normal.x) + (crossY * normal.y) + (crossZ * normal.z)) / length <=
                    EntityTopology.MIN_NORMALIZED_CONVEX_CROSS_PRODUCT) {
                    throw new RangeError("A planar face must be strictly convex with no crossing or collinear edges.");
                }
            }
        }
    }

    constructor(data : IEntityTopologyData) {
        this.vertices = Object.freeze(data.vertices.map((vertex) => Object.freeze({
            id: vertex.id, position: Object.freeze({...vertex.position})
        })));
        this.edges = Object.freeze(data.edges.map((edge) => Object.freeze({...edge})));
        this.faces = Object.freeze(data.faces.map((face) => Object.freeze({
            id: face.id,
            boundary: Object.freeze(face.boundary.map((edge) => Object.freeze({...edge}))),
            representation: Object.freeze({...face.representation})
        })));
        EntityTopology.validateIds(this.vertices, EntityPartKind.VERTEX);
        EntityTopology.validateIds(this.edges, EntityPartKind.EDGE);
        EntityTopology.validateIds(this.faces, EntityPartKind.FACE);
        this.vertexIndex = new Map(this.vertices.map((vertex) => [vertex.id, vertex]));
        this.edgeIndex = new Map(this.edges.map((edge) => [edge.id, edge]));
        this.faceIndex = new Map(this.faces.map((face) => [face.id, face]));
        const vertexEdges = new Map(this.vertices.map((vertex) => [vertex.id, <ITopologyEdge[]>[]]));
        const edgeFaces = new Map(this.edges.map((edge) => [edge.id, <ITopologyFace[]>[]]));
        const vertexFaces = new Map(this.vertices.map((vertex) => [vertex.id, <ITopologyFace[]>[]]));
        const faceVertices = new Map<FaceId, readonly ITopologyVertex[]>();
        this.vertexEdges = vertexEdges;
        this.edgeFaces = edgeFaces;
        this.vertexFaces = vertexFaces;
        this.faceVertices = faceVertices;
        for (const vertex of this.vertices) {
            EntityTopology.validatePoint(vertex.position);
        }
        for (const edge of this.edges) {
            this.getVertex(edge.start);
            this.getVertex(edge.end);
            if (edge.start === edge.end) {
                throw new RangeError("An edge must reference two distinct vertices.");
            }
        }
        for (const edge of this.edges) {
            vertexEdges.get(edge.start)?.push(edge);
            vertexEdges.get(edge.end)?.push(edge);
        }
        for (const face of this.faces) {
            const ordered = face.boundary.map((reference) => {
                const edge = this.getEdge(reference.edgeId);
                return this.getVertex(reference.reversed ? edge.end : edge.start);
            });
            faceVertices.set(face.id, Object.freeze(ordered));
            this.validateFace(face);
            for (const reference of face.boundary) {
                edgeFaces.get(reference.edgeId)?.push(face);
            }
            for (const vertex of ordered) {
                vertexFaces.get(vertex.id)?.push(face);
            }
        }
        for (const items of vertexEdges.values()) {
            Object.freeze(items);
        }
        for (const items of edgeFaces.values()) {
            Object.freeze(items);
        }
        for (const items of vertexFaces.values()) {
            Object.freeze(items);
        }
        Object.freeze(this);
    }

    public Serialize() : IEntityTopologyData {
        return Object.freeze({vertices: this.vertices, edges: this.edges, faces: this.faces});
    }

    public getVertices() : readonly ITopologyVertex[] {
        return this.vertices;
    }

    public getEdges() : readonly ITopologyEdge[] {
        return this.edges;
    }

    public getFaces() : readonly ITopologyFace[] {
        return this.faces;
    }

    public getVertex(id : VertexId) : ITopologyVertex {
        return EntityTopology.lookup(this.vertexIndex, id);
    }

    public getEdge(id : EdgeId) : ITopologyEdge {
        return EntityTopology.lookup(this.edgeIndex, id);
    }

    public getFace(id : FaceId) : ITopologyFace {
        return EntityTopology.lookup(this.faceIndex, id);
    }

    public getVertexEdges(id : VertexId) : readonly ITopologyEdge[] {
        return EntityTopology.lookup(this.vertexEdges, id);
    }

    public getEdgeFaces(id : EdgeId) : readonly ITopologyFace[] {
        return EntityTopology.lookup(this.edgeFaces, id);
    }

    public getVertexFaces(id : VertexId) : readonly ITopologyFace[] {
        return EntityTopology.lookup(this.vertexFaces, id);
    }

    // Ordered shared vertices; the closing vertex is not repeated.
    public getFaceVertices(id : FaceId) : readonly ITopologyVertex[] {
        return EntityTopology.lookup(this.faceVertices, id);
    }

    public MoveVertex(id : VertexId, position : IVector3) : EntityTopology {
        return this.MoveVertices(new Map([[id, position]]));
    }

    public MoveVertices(positions : ReadonlyMap<VertexId, IVector3>) : EntityTopology {
        for (const id of positions.keys()) {
            this.getVertex(id);
        }
        return new EntityTopology({
            vertices: this.vertices.map((vertex) => {
                const position = positions.get(vertex.id);
                return position === undefined ? vertex : {id: vertex.id, position};
            }),
            edges: this.edges,
            faces: this.faces
        });
    }

    private validateFace(face : ITopologyFace) : void {
        if (![FaceRepresentationKind.PLANAR].includes(face.representation.kind)) {
            throw new RangeError("Unsupported face representation.");
        }
        if (face.boundary.length < EntityTopology.MIN_FACE_EDGES) {
            throw new RangeError("A face loop requires at least three edges.");
        }
        const edges = new Set<EdgeId>();
        const vertices = new Set<VertexId>();
        let first : VertexId | undefined;
        let previous : VertexId | undefined;
        for (const reference of face.boundary) {
            if (typeof reference.reversed !== "boolean") {
                throw new RangeError("An oriented edge requires a boolean direction.");
            }
            const edge = this.getEdge(reference.edgeId);
            const start = reference.reversed ? edge.end : edge.start;
            const end = reference.reversed ? edge.start : edge.end;
            if (edges.has(edge.id) || vertices.has(start)) {
                throw new RangeError("A face loop cannot repeat edges or vertices.");
            }
            if (previous !== undefined && previous !== start) {
                throw new RangeError("A face loop must connect oriented edges.");
            }
            first ??= start;
            previous = end;
            edges.add(edge.id);
            vertices.add(start);
        }
        if (previous !== first) {
            throw new RangeError("A face loop must close.");
        }
        EntityTopology.validatePlanar(this.getFaceVertices(face.id).map((vertex) => vertex.position));
    }
}

interface IIdentified {
    readonly id : string;
}
