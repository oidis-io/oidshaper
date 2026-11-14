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
import { EntityTopology, FaceRepresentationKind } from "../../../src/typescript/core/entities/EntityTopology.js";

import type {
    IEntityTopologyData, ITopologyFace, VertexId, EdgeId, FaceId
} from "../../../src/typescript/core/entities/EntityTopology.js";
import type { IVector3 } from "../../../src/typescript/core/LocalOrigin.js";

function square() : IEntityTopologyData {
    return {
        vertices: [
            {id: "vertex:a", position: {x: 0, y: 0, z: 0}},
            {id: "vertex:b", position: {x: 2, y: 0, z: 0}},
            {id: "vertex:c", position: {x: 2, y: 2, z: 0}},
            {id: "vertex:d", position: {x: 0, y: 2, z: 0}}
        ],
        edges: [
            {id: "edge:a", start: "vertex:a", end: "vertex:b"},
            {id: "edge:b", start: "vertex:c", end: "vertex:b"},
            {id: "edge:c", start: "vertex:c", end: "vertex:d"},
            {id: "edge:d", start: "vertex:d", end: "vertex:a"}
        ],
        faces: [{id: "face:a", representation: {kind: FaceRepresentationKind.PLANAR}, boundary: [
            {edgeId: "edge:a", reversed: false}, {edgeId: "edge:b", reversed: true},
            {edgeId: "edge:c", reversed: false}, {edgeId: "edge:d", reversed: false}
        ]}]
    };
}

function replaceFace(face : Partial<ITopologyFace>) : EntityTopology {
    const data = square();
    return new EntityTopology({...data, faces: data.faces.map((original) => ({...original, ...face}))});
}

describe("shared entity topology", () => {
    it("roundtrips the existing square fixture with literal planar tags and stable component ids", () => {
        const fixture = square();
        const wire = JSON.stringify(fixture);
        expect(JSON.parse(wire)).toMatchObject({faces: [{id: "face:a", representation: {kind: "planar"}}]});
        const restored = new EntityTopology(<IEntityTopologyData>JSON.parse(wire));
        expect(restored.Serialize()).toEqual(fixture);
        const serialized = JSON.stringify(restored.Serialize());
        expect(JSON.parse(serialized)).toEqual(JSON.parse(wire));
        expect(new EntityTopology(<IEntityTopologyData>JSON.parse(serialized)).Serialize()).toEqual(fixture);
        expect(restored.getFaceVertices("face:a").map((vertex) => vertex.id))
            .toEqual(["vertex:a", "vertex:b", "vertex:c", "vertex:d"]);
    });

    it("constructs a centred box with six logical faces and shared outward edge loops", () => {
        const box = EntityTopology.Box({x: 2, y: 4, z: 6});
        expect(box.getVertices()).toHaveLength(8);
        expect(box.getEdges()).toHaveLength(12);
        expect(box.getFaces()).toHaveLength(6);
        expect(box.getVertex("vertex:0").position).toEqual({x: -1, y: -2, z: -3});
        expect(box.Serialize()).toEqual(EntityTopology.Box({x: 2, y: 4, z: 6}).Serialize());
        for (const vertex of box.getVertices()) {
            expect(box.getVertexEdges(vertex.id)).toHaveLength(3);
            expect(box.getVertexFaces(vertex.id)).toHaveLength(3);
        }
        for (const edge of box.getEdges()) {
            const faces = box.getEdgeFaces(edge.id);
            expect(faces).toHaveLength(2);
            expect(faces.map((face) => face.boundary.find((item) => item.edgeId === edge.id)?.reversed)
                .sort()).toEqual([false, true]);
        }
        for (const face of box.getFaces()) {
            expect(face.representation.kind).toBe("planar");
            const vertices = box.getFaceVertices(face.id);
            expect(vertices).toHaveLength(4);
            for (let index = 0; index < face.boundary.length; index++) {
                const reference = face.boundary[index];
                if (reference === undefined) {
                    throw new Error("Missing edge reference.");
                }
                const edge = box.getEdge(reference.edgeId);
                expect(vertices[index]).toBe(box.getVertex(reference.reversed ? edge.end : edge.start));
                expect(vertices[(index + 1) % vertices.length]?.id)
                    .toBe(reference.reversed ? edge.start : edge.end);
            }
            const [a, b, c] = vertices.map((vertex) => vertex.position);
            if (a === undefined || b === undefined || c === undefined) {
                throw new Error("Missing face vertices.");
            }
            const normal = {
                x: ((b.y - a.y) * (c.z - a.z)) - ((b.z - a.z) * (c.y - a.y)),
                y: ((b.z - a.z) * (c.x - a.x)) - ((b.x - a.x) * (c.z - a.z)),
                z: ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x))
            };
            expect((normal.x * a.x) + (normal.y * a.y) + (normal.z * a.z)).toBeGreaterThan(0);
        }
    });

    it("resolves reversed edges and returns shared vertex records with cached adjacency", () => {
        const topology = new EntityTopology(square());
        expect(topology.getFaceVertices("face:a").map((vertex) => vertex.id))
            .toEqual(["vertex:a", "vertex:b", "vertex:c", "vertex:d"]);
        expect(topology.getFaceVertices("face:a")[0]).toBe(topology.getVertex("vertex:a"));
        expect(topology.getVertexEdges("vertex:a")[0]).toBe(topology.getEdge("edge:a"));
        expect(topology.getEdgeFaces("edge:a")[0]).toBe(topology.getFace("face:a"));
        expect(topology.getVertexFaces("vertex:a")).toBe(topology.getVertexFaces("vertex:a"));
        expect(topology.getFaceVertices("face:a")).toBe(topology.getFaceVertices("face:a"));
    });

    it("copies input and deeply freezes all public state and serialized data", () => {
        const input = <IEntityTopologyData>JSON.parse(JSON.stringify(square()));
        const topology = new EntityTopology(input);
        const vertex = input.vertices[0];
        const face = input.faces[0];
        if (vertex === undefined || face === undefined) {
            throw new Error("Missing input records.");
        }
        Object.assign(vertex.position, {x: 99});
        Object.assign(face.boundary[0] ?? {}, {reversed: true});
        expect(topology.getVertex("vertex:a").position.x).toBe(0);
        expect(topology.getFace("face:a").boundary[0]?.reversed).toBe(false);
        const frozen = [topology, topology.Serialize(), topology.getVertices(), topology.getEdges(),
            topology.getFaces(), topology.getVertex("vertex:a"), topology.getVertex("vertex:a").position,
            topology.getEdge("edge:a"), topology.getFace("face:a"), topology.getFace("face:a").boundary,
            topology.getFace("face:a").boundary[0], topology.getFace("face:a").representation,
            topology.getFaceVertices("face:a"), topology.getVertexEdges("vertex:a"),
            topology.getVertexFaces("vertex:a"), topology.getEdgeFaces("edge:a")];
        expect(frozen.every(Object.isFrozen)).toBe(true);
        expect(() => Object.assign(topology.getVertex("vertex:a").position, {x: 99})).toThrow();
        expect(new EntityTopology(topology.Serialize()).Serialize()).toEqual(topology.Serialize());
    });

    it("moves a shared vertex immutably while preserving all component IDs", () => {
        const data = square();
        const topology = new EntityTopology({...data, faces: [
            ...data.faces, ...data.faces.map((face) : ITopologyFace => ({...face, id: "face:other"}))
        ]});
        const target = {x: -1, y: -1, z: 0};
        const moved = topology.MoveVertex("vertex:a", target);
        target.x = -100;
        expect(moved).not.toBe(topology);
        expect(topology.getVertex("vertex:a").position).toEqual({x: 0, y: 0, z: 0});
        expect(moved.getVertex("vertex:a").position).toEqual({x: -1, y: -1, z: 0});
        expect(moved.getEdges()).toEqual(topology.getEdges());
        expect(moved.getFaces()).toEqual(topology.getFaces());
        expect(moved.getVertices().map((vertex) => vertex.id)).toEqual(topology.vertices.map((vertex) => vertex.id));
        for (const face of moved.getVertexFaces("vertex:a")) {
            expect(moved.getFaceVertices(face.id)[0]).toBe(moved.getVertex("vertex:a"));
        }
    });

    it("moves a complete box face atomically and rejects a warped corner", () => {
        const box = EntityTopology.Box({x: 2, y: 2, z: 2});
        const before = box.Serialize();
        const positions = new Map<VertexId, IVector3>(box.getFaceVertices("face:1").map((vertex) =>
            [vertex.id, {...vertex.position, z: vertex.position.z + 2}]));
        const moved = box.MoveVertices(positions);
        expect(moved.getFaceVertices("face:1").every((vertex) => vertex.position.z === 3)).toBe(true);
        expect(moved.getFaceVertices("face:0").every((vertex) => vertex.position.z === -1)).toBe(true);
        expect(moved.getEdges()).toEqual(box.getEdges());
        expect(moved.getFaces()).toEqual(box.getFaces());
        expect(() => box.MoveVertex("vertex:4", {x: -1, y: -1, z: 3})).toThrow(/coplanar/);
        expect(box.Serialize()).toEqual(before);
        positions.set("vertex:missing", {x: 0, y: 0, z: 0});
        expect(() => box.MoveVertices(positions)).toThrow(/Unknown/);
        expect(box.Serialize()).toEqual(before);
    });

    it("allows empty topology, isolated vertices and wire edges", () => {
        expect(new EntityTopology({vertices: [], edges: [], faces: []}).getFaces()).toEqual([]);
        const data = square();
        const wire = new EntityTopology({...data, faces: []});
        expect(wire.getEdgeFaces("edge:a")).toEqual([]);
        const isolated = new EntityTopology({...data, edges: [], faces: []});
        expect(isolated.getVertexEdges("vertex:a")).toEqual([]);
        expect(isolated.getVertexFaces("vertex:a")).toEqual([]);
    });

    it.each(<const>["vertices", "edges", "faces"])("rejects duplicate %s IDs", (kind) => {
        const data = square();
        expect(() => new EntityTopology({...data, [kind]: [...data[kind], ...data[kind]]})).toThrow(/Duplicate/);
    });

    it("rejects missing references, self edges and malformed IDs", () => {
        const data = square();
        expect(() => new EntityTopology({...data, edges: [
            {id: "edge:a", start: "vertex:a", end: "vertex:missing"}
        ]})).toThrow(/Unknown/);
        expect(() => new EntityTopology({...data, edges: [
            {id: "edge:a", start: "vertex:a", end: "vertex:a"}
        ]})).toThrow(/distinct/);
        expect(() => new EntityTopology({...data, vertices: [
            {id: "vertex:", position: {x: 0, y: 0, z: 0}}
        ]})).toThrow(/Invalid/);
        expect(() => replaceFace({boundary: [
            {edgeId: "edge:missing", reversed: false},
            {edgeId: "edge:b", reversed: true}, {edgeId: "edge:c", reversed: false}
        ]})).toThrow(/Unknown/);
        const topology = new EntityTopology(data);
        expect(() => topology.getVertex("vertex:missing")).toThrow(/Unknown/);
        expect(() => topology.getEdge("edge:missing")).toThrow(/Unknown/);
        expect(() => topology.getFace("face:missing")).toThrow(/Unknown/);
        expect(() => topology.getVertexEdges("vertex:missing")).toThrow(/Unknown/);
        expect(() => topology.getVertexFaces("vertex:missing")).toThrow(/Unknown/);
        expect(() => topology.getEdgeFaces("edge:missing")).toThrow(/Unknown/);
        expect(() => topology.getFaceVertices("face:missing")).toThrow(/Unknown/);
    });

    it("rejects short, disconnected, unclosed and repeated loops", () => {
        expect(() => replaceFace({boundary: []})).toThrow(/three/);
        expect(() => replaceFace({boundary: [
            {edgeId: "edge:a", reversed: false}, {edgeId: "edge:b", reversed: false},
            {edgeId: "edge:c", reversed: false}, {edgeId: "edge:d", reversed: false}
        ]})).toThrow(/connect/);
        expect(() => replaceFace({boundary: [
            {edgeId: "edge:a", reversed: false}, {edgeId: "edge:b", reversed: true},
            {edgeId: "edge:c", reversed: false}
        ]})).toThrow(/close/);
        expect(() => replaceFace({boundary: [
            {edgeId: "edge:a", reversed: false}, {edgeId: "edge:a", reversed: true},
            {edgeId: "edge:d", reversed: true}
        ]})).toThrow(/repeat/);
    });

    it.each([NaN, Infinity, -Infinity])("rejects nonfinite coordinate %s", (value) => {
        const data = square();
        expect(() => new EntityTopology({...data, vertices: data.vertices.map((vertex) =>
            ({...vertex, position: {...vertex.position, y: value}}))})).toThrow(/finite/);
        expect(() => new EntityTopology(data).MoveVertex("vertex:a", {x: 0, y: 0, z: value})).toThrow(/finite/);
        expect(() => EntityTopology.Box({x: value, y: 1, z: 1})).toThrow(/finite/);
    });

    it.each([0, -1])("rejects nonpositive box dimensions %s", (value) => {
        expect(() => EntityTopology.Box({x: 1, y: value, z: 1})).toThrow(/positive/);
    });

    it("rejects concave, crossing, collinear, degenerate and warped faces", () => {
        const topology = new EntityTopology(square());
        expect(() => topology.MoveVertex("vertex:b", {x: 0.5, y: 1, z: 0})).toThrow(/convex/);
        expect(() => topology.MoveVertex("vertex:b", {x: -1, y: 0.5, z: 0})).toThrow(/convex/);
        expect(() => topology.MoveVertex("vertex:b", {x: 1, y: 1, z: 0})).toThrow(/convex/);
        expect(() => topology.MoveVertex("vertex:b", {x: 0, y: 0, z: 0})).toThrow(/convex/);
        expect(() => topology.MoveVertex("vertex:b", {x: 2, y: 0, z: 1})).toThrow(/coplanar/);
        const data = square();
        expect(() => new EntityTopology({...data, vertices: data.vertices.map((vertex) =>
            ({...vertex, position: {x: 0, y: 0, z: 0}}))})).toThrow(/Degenerate/);
    });

    it("rejects unsupported representation and malformed edge orientation", () => {
        expect(() => replaceFace({representation: <ITopologyFace["representation"]><unknown>{kind: "mesh"}}))
            .toThrow(/Unsupported/);
        expect(() => replaceFace({boundary: [
            {edgeId: "edge:a", reversed: <boolean><unknown>1}, {edgeId: "edge:b", reversed: true},
            {edgeId: "edge:c", reversed: false}, {edgeId: "edge:d", reversed: false}
        ]})).toThrow(/boolean/);
    });

    it("keeps vertex, edge and face identifiers distinct at compile time", () => {
        const vertex : VertexId = "vertex:a";
        // @ts-expect-error Vertex IDs cannot be used as edge IDs.
        const edge : EdgeId = vertex;
        // @ts-expect-error Edge IDs cannot be used as face IDs.
        const face : FaceId = edge;
        expect(face).toBe(vertex);
    });
});
