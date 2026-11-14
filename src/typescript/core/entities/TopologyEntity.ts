/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityGripRole, EntitySnapKind, EntityPartKind, EntityTypeId } from "./IEntity.js";
import { BaseEntity } from "./BaseEntity.js";
import { EntityTopology, FaceRepresentationKind } from "./EntityTopology.js";

import type { IVector3 } from "../LocalOrigin.js";
import type {
    IEntityCapabilities, IEntityEdit, IEntityGeometry, IEntityGrip, IEntityPart, IEntitySnap
} from "./IEntity.js";
import type {
    IEntityTopologyData, VertexId, ITopologyVertex, ITopologyEdge, ITopologyFace, IOrientedEdge
} from "./EntityTopology.js";

/** Geometry, grips and snaps share the same logical topology. */
export abstract class BaseTopologyEntity<TData> extends BaseEntity<TData> {
    private static readonly DEFAULT_COLOUR : number = 0xe2a700;

    public override getCapabilities(_data : TData) : IEntityCapabilities {
        return {children: false, grips: true, topology: true};
    }

    public getGeometry(data : TData) : IEntityGeometry {
        const topology = this.getTopology(data);
        const indices = new Map(topology.vertices.map((vertex, index) => [vertex.id, index]));
        const triangles : number[] = [];
        const triangleFaces : string[] = [];
        for (const face of topology.faces) {
            const vertices = topology.getFaceVertices(face.id).map((vertex) => {
                const index = indices.get(vertex.id);
                if (index === undefined) {
                    throw new Error("Missing topology vertex.");
                }
                return index;
            });
            const first = vertices[0];
            if (first === undefined) {
                continue;
            }
            for (let index = 1; index < vertices.length - 1; index++) {
                const a = vertices[index], b = vertices[index + 1];
                if (a !== undefined && b !== undefined) {
                    triangles.push(first, a, b);
                    triangleFaces.push(face.id);
                }
            }
        }
        return {paths: [], meshes: [{layer: "default", colour: BaseTopologyEntity.DEFAULT_COLOUR,
            vertices: topology.vertices.map((vertex) => vertex.position), triangles, triangleFaces}]};
    }

    public override getGrips(data : TData) : readonly IEntityGrip[] {
        return this.getTopology(data).vertices.map((vertex) => ({id: vertex.id,
            position: vertex.position, role: EntityGripRole.VERTEX,
            part: {kind: EntityPartKind.VERTEX, id: vertex.id}}));
    }

    public override getSnapPoints(data : TData) : readonly IEntitySnap[] {
        const topology = this.getTopology(data);
        return [...topology.vertices.map((vertex) : IEntitySnap => ({position: vertex.position,
            kind: EntitySnapKind.ENDPOINT, part: {kind: EntityPartKind.VERTEX, id: vertex.id}})),
        ...topology.edges.map((edge) : IEntitySnap => {
            const a = topology.getVertex(edge.start).position, b = topology.getVertex(edge.end).position;
            return {kind: EntitySnapKind.MIDPOINT, part: {kind: EntityPartKind.EDGE, id: edge.id},
                position: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2}};
        })];
    }

    public override MoveGrip(data : TData, grip : string, position : IVector3) : IEntityEdit<IEntityTopologyData> {
        const topology = this.getTopology(data);
        const vertex = topology.vertices.find((item) => item.id === grip);
        if (vertex === undefined) {
            throw new RangeError("Unknown vertex.");
        }
        return this.createEdit(topology.MoveVertex(vertex.id, position));
    }

    public MovePart(data : TData, part : IEntityPart, delta : IVector3) : IEntityEdit<IEntityTopologyData> {
        const topology = this.getTopology(data);
        let ids : readonly VertexId[];
        switch (part.kind) {
            case EntityPartKind.VERTEX: {
                const vertex = topology.vertices.find((item) => item.id === part.id);
                if (vertex === undefined) {
                    throw new RangeError("Unknown vertex.");
                }
                ids = [vertex.id];
                break;
            }
            case EntityPartKind.EDGE: {
                const edge = topology.edges.find((item) => item.id === part.id);
                if (edge === undefined) {
                    throw new RangeError("Unknown edge.");
                }
                ids = [edge.start, edge.end];
                break;
            }
            case EntityPartKind.FACE: {
                const face = topology.faces.find((item) => item.id === part.id);
                if (face === undefined) {
                    throw new RangeError("Unknown face.");
                }
                ids = topology.getFaceVertices(face.id).map((vertex) => vertex.id);
                break;
            }
            default:
                throw new RangeError("Unknown component kind.");
        }
        const positions = new Map(ids.map((id) => {
            const point = topology.getVertex(id).position;
            return [id, {x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z}];
        }));
        return this.createEdit(topology.MoveVertices(positions));
    }

    public abstract getTopology(data : TData) : EntityTopology;
    protected abstract createEdit(topology : EntityTopology) : IEntityEdit<IEntityTopologyData>;
}

export class TopologyEntity extends BaseTopologyEntity<IEntityTopologyData> {
    private static readonly CLOSED_EDGE_FACE_COUNT : number = 2;

    public readonly typeId : string = EntityTypeId.POLYHEDRON;

    // Topological closure only; geometric self-intersection requires a separate solid validator.
    private static validatePolyhedron(topology : EntityTopology) : void {
        if (topology.faces.length === 0) {
            throw new RangeError("A polyhedron requires faces.");
        }
        for (const edge of topology.edges) {
            const faces = topology.getEdgeFaces(edge.id);
            const directions = faces.flatMap((face) => face.boundary.filter((item) => item.edgeId === edge.id))
                .map((item) => item.reversed);
            if (faces.length !== TopologyEntity.CLOSED_EDGE_FACE_COUNT || directions[0] === directions[1]) {
                throw new RangeError("Polyhedron edges must join two oppositely oriented faces.");
            }
        }
        for (const vertex of topology.vertices) {
            const faces = topology.getVertexFaces(vertex.id);
            const first = faces[0];
            if (first === undefined) {
                throw new RangeError("A polyhedron cannot contain unused vertices.");
            }
            const neighbours = new Map<string, Set<string>>(faces.map((face) => [face.id, new Set<string>()]));
            for (const edge of topology.getVertexEdges(vertex.id)) {
                const incident = topology.getEdgeFaces(edge.id);
                for (const face of incident) {
                    for (const other of incident) {
                        neighbours.get(face.id)?.add(other.id);
                    }
                }
            }
            const visited = new Set<string>();
            const pending : string[] = [first.id];
            while (pending.length > 0) {
                const id = pending.pop();
                if (id === undefined || visited.has(id)) {
                    continue;
                }
                visited.add(id);
                pending.push(...(neighbours.get(id) ?? []));
            }
            if (visited.size !== faces.length) {
                throw new RangeError("Polyhedron faces must form one connected fan at each vertex.");
            }
        }
    }

    private static vertex(value : unknown) : value is ITopologyVertex {
        return value !== null && typeof value === "object" && "id" in value && "position" in value &&
            typeof value.id === "string" && value.id.startsWith(`${EntityPartKind.VERTEX}:`) &&
            BaseEntity.point(value.position);
    }

    private static edge(value : unknown) : value is ITopologyEdge {
        return value !== null && typeof value === "object" && "id" in value && "start" in value &&
            "end" in value && typeof value.id === "string" && value.id.startsWith(`${EntityPartKind.EDGE}:`) &&
            typeof value.start === "string" && value.start.startsWith(`${EntityPartKind.VERTEX}:`) &&
            typeof value.end === "string" && value.end.startsWith(`${EntityPartKind.VERTEX}:`);
    }

    private static orientedEdge(value : unknown) : value is IOrientedEdge {
        return value !== null && typeof value === "object" && "edgeId" in value && "reversed" in value &&
            typeof value.edgeId === "string" && value.edgeId.startsWith(`${EntityPartKind.EDGE}:`) &&
            typeof value.reversed === "boolean";
    }

    private static face(value : unknown) : value is ITopologyFace {
        return value !== null && typeof value === "object" && "id" in value && "boundary" in value &&
            "representation" in value && typeof value.id === "string" &&
            value.id.startsWith(`${EntityPartKind.FACE}:`) && Array.isArray(value.boundary) &&
            value.boundary.every((item : unknown) => TopologyEntity.orientedEdge(item)) &&
            value.representation !== null &&
            typeof value.representation === "object" && "kind" in value.representation &&
            value.representation.kind === FaceRepresentationKind.PLANAR;
    }

    public Validate(data : unknown) : asserts data is IEntityTopologyData {
        BaseEntity.record(data);
        if (!Array.isArray(data["vertices"]) ||
            !data["vertices"].every((item : unknown) => TopologyEntity.vertex(item)) ||
            !Array.isArray(data["edges"]) || !data["edges"].every((item : unknown) => TopologyEntity.edge(item)) ||
            !Array.isArray(data["faces"]) || !data["faces"].every((item : unknown) => TopologyEntity.face(item))) {
            throw new TypeError("Invalid topology data.");
        }
        this.getTopology({vertices: data["vertices"], edges: data["edges"], faces: data["faces"]});
    }

    public getTopology(data : IEntityTopologyData) : EntityTopology {
        const topology = new EntityTopology(data);
        TopologyEntity.validatePolyhedron(topology);
        return topology;
    }

    protected createEdit(topology : EntityTopology) : IEntityEdit<IEntityTopologyData> {
        return {type: this.typeId, data: topology.Serialize()};
    }
}

export interface IBoxData {
    readonly size : IVector3;
}

export class BoxEntity extends BaseTopologyEntity<IBoxData> {
    public readonly typeId : string = EntityTypeId.BOX;

    public Validate(data : unknown) : asserts data is IBoxData {
        BaseEntity.record(data);
        if (!BaseEntity.point(data["size"])) {
            throw new TypeError("Box needs finite dimensions.");
        }
        EntityTopology.Box(data["size"]);
    }

    public getTopology(data : IBoxData) : EntityTopology {
        return EntityTopology.Box(data.size);
    }

    protected createEdit(topology : EntityTopology) : IEntityEdit<IEntityTopologyData> {
        // Component edits replace parametric dimensions with explicit geometry.
        return {type: EntityTypeId.POLYHEDRON, data: topology.Serialize()};
    }
}
