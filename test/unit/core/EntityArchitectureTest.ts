/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { EntityPartKind } from "../../../src/typescript/core/entities/IEntity.js";
import { describe, expect, it } from "vitest";
import { BaseEntity } from "../../../src/typescript/core/entities/BaseEntity.js";
import { EntityTopology } from "../../../src/typescript/core/entities/EntityTopology.js";
import { BoxEntity, TopologyEntity } from "../../../src/typescript/core/entities/TopologyEntity.js";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";
import { CircleEntity } from "../../../src/typescript/core/entities/EntityTypes.js";
import { EntitySnapResolver } from "../../../src/typescript/tools/EntitySnapResolver.js";
import { WorkingPlane } from "../../../src/typescript/core/WorkingPlane.js";
import { EntityTransforms } from "../../../src/typescript/core/entities/EntityTransform.js";

import type { IEntityDocumentData } from "../../../src/typescript/core/entities/IEntity.js";

function scene() : EntityDocument {
    const document = new EntityDocument();
    document.AddEntities({entities: [
        {id: "group", name: "Group", type: "group", data: {},
            transform: EntityTransforms.Translation({x: 10, y: 20, z: 30})},
        {id: "box", name: "Box", type: "box", data: {size: {x: 2, y: 4, z: 6}}, parentId: "group"}
    ]});
    return document;
}

class CustomSolid extends TopologyEntity {
    public override readonly typeId : string = "custom-solid";
}

describe("entity architecture", () => {
    it("rejects open or inconsistently oriented boundaries for the polyhedron entity", () => {
        const entityType : TopologyEntity = new TopologyEntity();
        const data = EntityTopology.Box({x: 2, y: 2, z: 2}).Serialize();
        expect(() => {
            entityType.Validate({...data, faces: []});
        }).toThrow(/requires faces/);
        expect(() => {
            entityType.Validate({...data, faces: data.faces.slice(1)});
        }).toThrow(/oriented faces/);
        const flipped = data.faces.map((face, index) => index === 0 ? {...face,
            boundary: [...face.boundary].reverse().map((edge) => ({...edge, reversed: !edge.reversed}))} : face);
        expect(() => {
            entityType.Validate({...data, faces: flipped});
        }).toThrow(/oriented faces/);
        expect(() => {
            entityType.Validate({...data, vertices: [...data.vertices,
                {id: "vertex:unused", position: {x: 0, y: 0, z: 0}}]});
        }).toThrow(/unused/);
    });

    it("lets registered subclasses retain their representation through common component edits", () => {
        const document = new EntityDocument();
        document.registry.Register(new CustomSolid());
        document.AddEntities({entities: [
            {id: "custom", type: "custom-solid", name: "Custom", data: EntityTopology.Box({x: 2, y: 2, z: 2})
                .Serialize()}
        ]});
        document.MovePart({id: "custom", part: {kind: EntityPartKind.FACE, id: "face:1"},
            delta: {x: 0, y: 0, z: 1}});
        expect(document.getEntity("custom").type).toBe("custom-solid");
        expect(document.getTopology("custom")?.getVertex("vertex:4").position.z).toBe(2);
    });

    it("shares base implementation without turning topology into independently transformed scene children", () => {
        expect(new BoxEntity()).toBeInstanceOf(BaseEntity);
        expect(new CircleEntity()).toBeInstanceOf(BaseEntity);
        const document = scene();
        expect(document.getEntities()).toHaveLength(2);
        expect(document.getChildren("box")).toEqual([]);
        expect(document.getCapabilities("group")).toEqual({children: true, grips: false, topology: false});
        expect(document.getCapabilities("box")).toEqual({children: false, grips: true, topology: true});
        const topology = document.getTopology("box");
        expect(topology?.vertices).toHaveLength(8);
        expect(topology?.edges).toHaveLength(12);
        expect(topology?.faces).toHaveLength(6);
        const mesh = document.getDrawing().meshes?.[0];
        expect(mesh?.vertices).toHaveLength(8);
        expect(mesh?.triangles).toHaveLength(36);
        expect(mesh?.triangleFaces).toHaveLength(12);
        expect(new Set(mesh?.triangleFaces).size).toBe(6);
        expect(mesh?.vertices[0]).toEqual({x: 9, y: 18, z: 27});
        expect(document.getGrips("box")[0]?.part).toEqual({kind: "vertex", id: "vertex:0"});
    });

    it("moves a whole logical face atomically with stable references and exact undo", () => {
        const document = scene();
        const before = document.Serialize();
        const revision = document.getRevision();
        const command = {id: "box",
            part: {kind: EntityPartKind.FACE, id: "face:1"}, delta: {x: 0, y: 0, z: 2}, expectedRevision: revision};
        const preview = document.PreviewPart(command.id, command.part, command.delta, revision);
        expect(document.Serialize()).toEqual(before);
        expect(preview.meshes?.[0]?.vertices[4]?.z).toBe(35);
        document.MovePart(command);
        expect(document.getEntity("box").type).toBe("polyhedron");
        expect(document.getDrawing()).toEqual(preview);
        expect(document.getTopology("box")?.getVertex("vertex:4").position.z).toBe(5);
        expect(document.getTopology("box")?.getVertex("vertex:0").position.z).toBe(-3);
        expect(document.getTopology("box")?.getVertexFaces("vertex:4")).toHaveLength(3);
        const after = document.Serialize();
        document.Undo();
        expect(document.Serialize()).toEqual(before);
        document.Redo();
        expect(document.Serialize()).toEqual(after);
        const restored = new EntityDocument();
        restored.ReplaceDocument({document: <IEntityDocumentData>JSON.parse(JSON.stringify(after))});
        expect(restored.Serialize()).toEqual(after);
        expect(restored.getTopology("box")?.Serialize()).toEqual(document.getTopology("box")?.Serialize());
    });

    it("converts world displacement to the rotated local frame exactly once", () => {
        const document = scene();
        document.TransformEntities({ids: ["group", "box"],
            delta: EntityTransforms.Rotation({x: 0, y: Math.PI / 2, z: 0})});
        const before = document.getDrawing().meshes?.[0]?.vertices[4];
        document.MovePart({id: "box", part: {kind: EntityPartKind.FACE, id: "face:1"},
            delta: {x: 2, y: 0, z: 0}});
        const after = document.getDrawing().meshes?.[0]?.vertices[4];
        expect(after?.x).toBeCloseTo((before?.x ?? 0) + 2);
        expect(after?.y).toBeCloseTo(before?.y ?? 0);
        expect(after?.z).toBeCloseTo(before?.z ?? 0);
    });

    it("rejects warped regular faces, invalid references and stale previews without changing the document", () => {
        const document = scene();
        const before = document.Serialize();
        for (const part of [{kind: EntityPartKind.VERTEX, id: "vertex:0"},
            {kind: EntityPartKind.FACE, id: "face:missing"}]) {
            expect(() => {
                document.MovePart({id: "box", part, delta: {x: 0, y: 0, z: 1}});
            }).toThrow();
            expect(document.Serialize()).toEqual(before);
        }
        expect(() => document.PreviewPart("box", {kind: EntityPartKind.FACE, id: "face:1"},
            {x: 0, y: 0, z: 1}, -1)).toThrow(/stale/);
        document.setLayer({layer: {name: "default", visible: true, locked: true}});
        expect(document.getCapabilities("box").grips).toBe(false);
        expect(document.getGrips("box")).toEqual([]);
        expect(() => {
            document.MovePart({id: "box", part: {kind: EntityPartKind.FACE, id: "face:1"},
                delta: {x: 0, y: 0, z: 1}});
        }).toThrow(/locked/);
    });

    it("returns stable component identity from snaps, including read-only locked geometry", () => {
        const document = new EntityDocument();
        document.AddEntities({entities: [
            {id: "box", name: "Box", type: "box", data: {size: {x: 2, y: 4, z: 6}}}
        ]});
        document.setLayer({layer: {name: "default", visible: true, locked: true}});
        const resolver = new EntitySnapResolver(document);
        const result = resolver.Resolve({x: -1, y: -2, z: -3},
            new WorkingPlane(EntityTransforms.Translation({x: 0, y: 0, z: -3})), 0, {x: -1, y: -2},
            (point) => ({x: point.x, y: point.y}), 0.1);
        expect(result.entity).toBe("box");
        expect(result.part).toEqual({kind: "vertex", id: "vertex:0"});
        document.setLayer({layer: {name: "default", visible: false, locked: true}});
        expect(resolver.Resolve({x: -1, y: -2, z: -3},
            new WorkingPlane(EntityTransforms.Translation({x: 0, y: 0, z: -3})), 0, {x: -1, y: -2},
            (point) => ({x: point.x, y: point.y}), 0.1).entity).toBeUndefined();
    });
});
