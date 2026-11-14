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
import { SelectionMode, SelectionOperation } from "../../../src/typescript/core/DrawingSelection.js";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";
import { EntityTypes, PolylineEntity } from "../../../src/typescript/core/entities/EntityTypes.js";
import { EntityTransforms } from "../../../src/typescript/core/entities/EntityTransform.js";

import type { IEntityDocumentData, IEntityType } from "../../../src/typescript/core/entities/IEntity.js";
import type { IPolylineData } from "../../../src/typescript/core/entities/EntityTypes.js";

interface IMutableVertices {
    vertices : IMutablePoint[];
}

interface IMutablePoint {
    x : number;
}

function model() : EntityDocument {
    const document = new EntityDocument();
    document.AddEntities({entities: [
        {id: "model", type: "model", name: "Imported model", data: {},
            transform: EntityTransforms.Translation({x: 100, y: 200, z: 300})},
        {id: "group", type: "group", name: "Nested group", parentId: "model", data: {},
            transform: EntityTransforms.Rotation({x: 0, y: 0, z: Math.PI / 2})},
        {id: "mesh", type: "mesh", name: "Mesh", parentId: "group", data: EntityTypes.BoxMesh({x: 2, y: 4, z: 6}),
            transform: EntityTransforms.Translation({x: 10, y: 0, z: 0})}
    ]});
    return document;
}

describe("entity hierarchy and commands", () => {
    for (const explicitFirst of [true, false]) {
        it(`reserves explicit batch ids with the explicit parent ${explicitFirst ? "first" : "last"}`, () => {
            const document = new EntityDocument();
            const before = document.Serialize();
            const explicit = {id: "entity-1", type: "group", name: "Explicit parent", data: {}};
            const children = [
                {type: "group", name: "Automatic child A", parentId: "entity-1", data: {}},
                {type: "group", name: "Automatic child B", parentId: "entity-1", data: {}}
            ];
            document.AddEntities({entities: explicitFirst ? [explicit, ...children] : [...children, explicit]});
            const added = document.getEntities();
            expect(added).toHaveLength(3);
            expect(new Set(added.map((entity) => entity.id)).size).toBe(3);
            expect(document.getEntity("entity-1").name).toBe("Explicit parent");
            expect(document.getChildren("entity-1").map((entity) => entity.name))
                .toEqual(["Automatic child A", "Automatic child B"]);
            expect(document.getChildren("entity-1").every((entity) => entity.id !== "entity-1")).toBe(true);
            expect(document.getRevision()).toBe(1);
            const committed = document.Serialize();
            document.Undo();
            expect(document.Serialize()).toEqual(before);
            document.Redo();
            expect(document.Serialize()).toEqual(committed);
        });
    }

    it("keeps an empty add batch out of revision, selection and redo history", () => {
        const document = model();
        document.TransformEntities({ids: ["model"], delta: EntityTransforms.Translation({x: 1, y: 0, z: 0})});
        const redoState = document.Serialize();
        document.Undo();
        document.Select(["model"]);
        const before = document.Serialize();
        const revision = document.getRevision();
        const events : string[] = [];
        const unsubscribe = document.Subscribe((event) => events.push(event.kind));
        document.AddEntities({entities: []});
        expect(document.Serialize()).toEqual(before);
        expect(document.getSelection()).toEqual(["model"]);
        expect(document.getRevision()).toBe(revision);
        expect(events).toEqual([]);
        unsubscribe();
        document.Redo();
        expect(document.Serialize()).toEqual(redoState);
    });

    it("rolls back generated batch entities after validation failure and allows explicit ids to be retried", () => {
        const document = model();
        document.TransformEntities({ids: ["model"], delta: EntityTransforms.Translation({x: 1, y: 0, z: 0})});
        const redoState = document.Serialize();
        document.Undo();
        document.Select(["model"]);
        const before = document.Serialize();
        const revision = document.getRevision();
        const events : string[] = [];
        const unsubscribe = document.Subscribe((event) => events.push(event.kind));
        expect(() => {
            document.AddEntities({entities: [
                {type: "group", name: "Staged automatic", data: {}},
                {id: "entity-1", type: "group", name: "Invalid explicit", parentId: "missing-parent", data: {}}
            ]});
        }).toThrow();
        expect(document.Serialize()).toEqual(before);
        expect(document.getSelection()).toEqual(["model"]);
        expect(document.getRevision()).toBe(revision);
        expect(events).toEqual([]);
        unsubscribe();
        document.Redo();
        expect(document.Serialize()).toEqual(redoState);
        document.AddEntities({entities: [
            {id: "entity-1", type: "group", name: "Retried explicit", data: {}},
            {type: "group", name: "Retried automatic", parentId: "entity-1", data: {}}
        ]});
        expect(document.getEntity("entity-1").name).toBe("Retried explicit");
        expect(document.getChildren("entity-1").map((entity) => entity.name)).toEqual(["Retried automatic"]);
        expect(new Set(document.getEntities().map((entity) => entity.id)).size).toBe(5);
        document.Undo();
        expect(document.Serialize()).toEqual(redoState);
    });

    it("reserves import wrapper ids while remapping a nested hierarchy and copying it", () => {
        const document = new EntityDocument();
        const source = model();
        document.ImportDocument({id: "entity-1", name: "Imported", document: source.Serialize()});
        const imported = document.Serialize();
        expect(imported.entities).toHaveLength(4);
        expect(new Set(imported.entities.map((entity) => entity.id)).size).toBe(4);
        expect(document.getChildren("entity-1")).toHaveLength(1);
        expect(document.getGeometry("entity-1")).toEqual(source.getGeometry("model"));
        document.CopyEntities({ids: ["entity-1"], delta: EntityTransforms.Identity()});
        const copied = document.getEntities();
        expect(copied).toHaveLength(8);
        expect(new Set(copied.map((entity) => entity.id)).size).toBe(8);
        const roots = document.getChildren(null);
        expect(roots).toHaveLength(2);
        for (const root of roots) {
            expect(document.getChildren(root.id)).toHaveLength(1);
            expect(document.getGeometry(root.id)).toEqual(source.getGeometry("model"));
        }
        document.Undo();
        expect(document.Serialize()).toEqual(imported);
    });

    it("imports a hierarchy with fresh ids and transforms the inserted model as a whole", () => {
        const source = model();
        const document = model();
        const before = document.Serialize();
        document.ImportDocument({id: "imported", name: "model.json", document: source.Serialize(),
            transform: EntityTransforms.Translation({x: 10, y: 0, z: 0})});
        expect(document.getEntities()).toHaveLength(7);
        expect(document.getGeometry("imported")[0]?.points[0]?.x)
            .toBeCloseTo((source.getGeometry("model")[0]?.points[0]?.x ?? 0) + 10);
        expect(document.getEntity("model")).toEqual(before.entities[0]);
        document.Undo();
        expect(document.Serialize()).toEqual(before);
        document.Redo();
        expect(document.getChildren("imported")).toHaveLength(1);
        const invalid = {...source.Serialize(), entities: [...source.getEntities(), source.getEntity("model")]};
        const imported = document.Serialize();
        expect(() => {
            document.ImportDocument({id: "invalid", name: "bad", document: invalid});
        })
            .toThrow(/Duplicate/);
        expect(document.Serialize()).toEqual(imported);
    });

    it("copies a complete subtree without sharing mutable public data", () => {
        const document = model();
        const before = document.Serialize();
        document.CopyEntities({ids: ["model", "mesh"],
            delta: EntityTransforms.Translation({x: 5, y: 0, z: 0})});
        expect(document.getEntities()).toHaveLength(6);
        const copy = document.getChildren(null).find((entity) => entity.id !== "model");
        if (copy === undefined) {
            throw new Error("Missing copied model.");
        }
        expect(copy.transform[12]).toBe(105);
        const group = document.getChildren(copy.id)[0];
        const mesh = document.getChildren(group?.id ?? "")[0];
        expect(mesh?.data).toEqual(document.getEntity("mesh").data);
        expect(mesh?.transform).toEqual(document.getEntity("mesh").transform);
        const matrix = <number[]>document.getWorldTransform("model");
        matrix[12] = -1000;
        expect(document.getWorldTransform("model")[12]).toBe(100);
        document.Undo();
        expect(document.Serialize()).toEqual(before);
        document.Redo();
        expect(document.getEntities()).toHaveLength(6);
    });

    it("renames and removes layers atomically, preserving entities and undo", () => {
        const document = model();
        document.setLayer({layer: {name: "models", visible: true, locked: false}});
        document.MoveEntitiesToLayer({ids: ["model"], layer: "models"});
        const before = document.Serialize();
        document.RenameLayer({name: "models", replacement: "imports"});
        expect(document.getEntity("model").layer).toBe("imports");
        document.RemoveLayer({name: "imports", target: "default"});
        expect(document.getEntities()).toHaveLength(3);
        expect(document.getEntity("model").layer).toBe("default");
        document.Undo();
        document.Undo();
        expect(document.Serialize()).toEqual(before);
        expect(() => {
            document.RemoveLayer({name: "default", target: "models"});
        }).toThrow();
        expect(() => {
            document.RenameLayer({name: "models", replacement: "default"});
        }).toThrow();
        expect(document.Serialize()).toEqual(before);
    });

    it("moves an imported hierarchy once without rewriting child transforms or geometry", () => {
        const document = model();
        const mesh = document.getEntity("mesh");
        const group = document.getEntity("group");
        const original = document.getGeometry("mesh")[0]?.points[0];
        expect(original).toBeDefined();
        document.TransformEntities({ids: ["model", "mesh"],
            delta: EntityTransforms.Translation({x: 7, y: 8, z: 9})});
        expect(document.getEntity("mesh")).toEqual(mesh);
        expect(document.getEntity("group")).toEqual(group);
        const moved = document.getGeometry("mesh")[0]?.points[0];
        expect(moved?.x).toBeCloseTo((original?.x ?? 0) + 7);
        expect(moved?.y).toBeCloseTo((original?.y ?? 0) + 8);
        expect(moved?.z).toBeCloseTo((original?.z ?? 0) + 9);
        document.Undo();
        expect(document.getGeometry("mesh")[0]?.points[0]).toEqual(original);
        document.Redo();
        expect(document.getGeometry("mesh")[0]?.points[0]).toEqual(moved);
    });

    it("composes rotation and nonuniform scale and edits grips in child-local coordinates", () => {
        const document = model();
        const delta = EntityTransforms.Multiply(EntityTransforms.Rotation({x: 0.2, y: 0.3, z: 0.4}),
            EntityTransforms.Scale({x: 2, y: 3, z: 4}));
        document.TransformEntities({ids: ["model"], delta});
        const original = document.getGrips("mesh")[0];
        expect(original).toBeDefined();
        const target = {x: 10, y: 20, z: 30};
        document.MoveGrip({id: "mesh", grip: "0", position: target});
        const edited = document.getGrips("mesh")[0]?.position;
        expect(edited?.x).toBeCloseTo(target.x, 9);
        expect(edited?.y).toBeCloseTo(target.y, 9);
        expect(edited?.z).toBeCloseTo(target.z, 9);
        document.Undo();
        expect(document.getGrips("mesh")[0]).toEqual(original);
        const matrix = document.getWorldTransform("mesh");
        const identity = EntityTransforms.Multiply(EntityTransforms.Inverse(matrix), matrix);
        expect(EntityTransforms.TransformPoint(identity, target).x).toBeCloseTo(10);
    });

    it("groups and ungroups across different parents without moving entities", () => {
        const document = model();
        document.AddEntities({entities: [{id: "circle", type: "circle", name: "Circle",
            data: {centre: {x: 0, y: 0, z: 0}, radius: 3}}]});
        const before = document.getGeometry("mesh");
        document.GroupEntities({id: "new", name: "Group", ids: ["mesh", "circle"]});
        expect(document.getEntity("mesh").parentId).toBe("new");
        expect(document.getGeometry("mesh")).toEqual(before);
        document.TransformEntities({ids: ["new"],
            delta: EntityTransforms.Translation({x: 5, y: 0, z: 0})});
        const moved = document.getGeometry("mesh");
        document.UngroupEntity({id: "new"});
        expect(document.getEntity("mesh").parentId).toBeNull();
        expect(document.getGeometry("mesh")).toEqual(moved);
        document.Undo();
        expect(document.getEntity("mesh").parentId).toBe("new");
        expect(document.getGeometry("mesh")).toEqual(moved);
    });

    it("rejects invalid trees, singular transforms and stale previews atomically", () => {
        const document = model();
        const before = document.Serialize();
        expect(() => {
            document.AddEntities({entities: [
                {id: "a", type: "group", name: "a", parentId: "b", data: {}},
                {id: "b", type: "group", name: "b", parentId: "a", data: {}}
            ]});
        }).toThrow(/cyclic/);
        expect(document.Serialize()).toEqual(before);
        expect(() => {
            document.TransformEntities({ids: ["model"],
                delta: EntityTransforms.Scale({x: 0, y: 1, z: 1})});
        }).toThrow(/singular/);
        const revision = document.getRevision();
        const preview = document.PreviewGrip("mesh", "0", {x: 1, y: 2, z: 3}, revision);
        expect(preview.meshes?.[0]?.vertices[0]).toEqual({x: 1, y: 2, z: 3});
        expect(document.Serialize()).toEqual(before);
        document.TransformEntities({ids: ["model"],
            delta: EntityTransforms.Translation({x: 1, y: 0, z: 0})});
        expect(() => {
            document.MoveGrip({id: "mesh", grip: "0",
                position: {x: 1, y: 2, z: 3}, expectedRevision: revision});
        }).toThrow(/stale/);
    });

    it("uses registered entity types, including analytic circle grips", () => {
        const registry = EntityTypes.CreateRegistry();
        const base : PolylineEntity = new PolylineEntity();
        const custom : IEntityType<IPolylineData> = {typeId: "custom", acceptsChildren: false,
            Validate(data : unknown) : asserts data is IPolylineData {
                base.Validate(data);
            }, getGeometry: (data) => base.getGeometry(data),
            getGrips: (data) => base.getGrips(data), MoveGrip: (data, grip, point) =>
                ({...base.MoveGrip(data, grip, point), type: "custom"})};
        registry.Register(custom);
        const document = new EntityDocument(registry);
        document.AddEntities({entities: [
            {id: "custom", type: "custom", name: "Custom", data: {points: [{x: 0, y: 0, z: 0}], closed: false}},
            {id: "circle", type: "circle", name: "Circle", data: {centre: {x: 0, y: 0, z: 0}, radius: 2}}
        ]});
        document.MoveGrip({id: "custom", grip: "0", position: {x: 3, y: 4, z: 5}});
        expect(document.getGrips("custom")[0]?.position).toEqual({x: 3, y: 4, z: 5});
        document.MoveGrip({id: "circle", grip: "radius", position: {x: 0, y: 5, z: 0}});
        expect(document.getEntity("circle").type).toBe("circle");
        expect(document.getGeometry("circle")[0]?.curve?.axisU.x).toBe(5);
        document.Undo();
        expect(document.getGeometry("circle")[0]?.curve?.axisU.x).toBe(2);
    });

    it("selects groups as units and respects ancestor visibility and child locks", () => {
        const document = model();
        const region = [{x: 90, y: 190}, {x: 120, y: 190}, {x: 120, y: 230}, {x: 90, y: 230}];
        document.SelectRegion(region, SelectionMode.WINDOW, SelectionOperation.REPLACE, (point) => point);
        expect(document.getSelection()).toEqual(["model"]);
        document.setLayer({layer: {name: "locked", visible: true, locked: true}});
        document.MoveEntitiesToLayer({ids: ["mesh"], layer: "locked"});
        expect(() => {
            document.TransformEntities({ids: ["model"],
                delta: EntityTransforms.Identity()});
        }).toThrow(/locked/);
        document.setLayer({layer: {name: "default", visible: false, locked: false}});
        expect(document.getDrawing().paths).toHaveLength(0);
        expect(document.getSelection()).toHaveLength(0);
        document.Undo();
        expect(document.getDrawing().meshes).toHaveLength(1);
    });

    it("serializes hierarchy and restores deletion as one operation", () => {
        const document = model();
        const saved = <IEntityDocumentData>JSON.parse(JSON.stringify(document.Serialize()));
        const copy = new EntityDocument();
        copy.ReplaceDocument({document: saved});
        expect(copy.getGeometry("model")).toEqual(document.getGeometry("model"));
        copy.RemoveEntities({ids: ["model", "group", "mesh"]});
        expect(copy.getEntities()).toHaveLength(0);
        copy.Undo();
        expect(copy.getEntities()).toHaveLength(3);
        expect(copy.Serialize()).toEqual(saved);
        copy.Redo();
        expect(copy.getEntities()).toHaveLength(0);
    });

    it("bounds history, rejects oversized commands and protects document state from callers", () => {
        const tiny = new EntityDocument(EntityTypes.CreateRegistry(), {historyBytes: 20});
        expect(() => {
            tiny.AddEntities({entities: [
                {type: "group", name: "Too large", data: {}}
            ]});
        }).toThrow(/history/);
        expect(tiny.getEntities()).toHaveLength(0);
        const document = model();
        const entity = document.getEntity("mesh");
        const data = <IMutableVertices>entity.data;
        if (data.vertices[0] !== undefined) {
            data.vertices[0].x = 999;
        }
        expect(document.getEntity("mesh").data).not.toEqual(entity.data);
        document.TransformEntities({ids: ["model"],
            delta: EntityTransforms.Translation({x: 1, y: 0, z: 0})});
        document.Undo();
        document.TransformEntities({ids: ["model"],
            delta: EntityTransforms.Translation({x: 2, y: 0, z: 0})});
        const current = document.Serialize();
        document.Redo();
        expect(document.Serialize()).toEqual(current);
    });

    it("queues commands issued by listeners and isolates failed listeners", () => {
        const errors : unknown[] = [];
        const document = new EntityDocument(EntityTypes.CreateRegistry(), {OnError: (error) => errors.push(error)});
        document.Subscribe(() => {
            throw new Error("Listener failed");
        });
        let queued = false;
        document.Subscribe((event) => {
            if (event.kind === "document.changed" && !queued) {
                queued = true;
                document.AddEntities({entities: [{type: "group", name: "Second", data: {}}]});
            }
        });
        document.AddEntities({entities: [{type: "group", name: "First", data: {}}]});
        expect(document.getEntities().map((entity) => entity.name)).toEqual(["First", "Second"]);
        expect(errors).toHaveLength(2);
    });

    it("snapshots queued entity data, target ids and transforms before callers mutate them", () => {
        const document = new EntityDocument();
        let queued = false;
        document.Subscribe((event) => {
            if (event.kind !== "document.changed" || queued) {
                return;
            }
            queued = true;
            const point = {x: 2, y: 3, z: 4};
            const entities = [{id: "queued", type: "polyline", name: "Original",
                data: {points: [point], closed: false}}];
            document.AddEntities({entities});
            const input = entities[0];
            if (input === undefined) {
                throw new Error("Missing queued input.");
            }
            input.name = "Mutated";
            point.x = 999;
            entities.length = 0;
            const ids = ["queued"];
            const delta = [...EntityTransforms.Translation({x: 5, y: 0, z: 0})];
            const request = {ids, delta, expectedRevision: event.revision + 1};
            document.TransformEntities(request);
            request.expectedRevision = -1;
            ids[0] = "trigger";
            delta[12] = 1000;
        });
        document.AddEntities({entities: [{id: "trigger", type: "group", name: "Trigger", data: {}}]});
        expect(document.getEntity("queued").name).toBe("Original");
        expect(document.getEntity("queued").data).toEqual({points: [{x: 2, y: 3, z: 4}], closed: false});
        expect(document.getGeometry("queued")[0]?.points[0]).toEqual({x: 7, y: 3, z: 4});
        expect(document.getWorldTransform("trigger")).toEqual(EntityTransforms.Identity());
        const committed = document.Serialize();
        document.Undo();
        expect(document.getGeometry("queued")[0]?.points[0]).toEqual({x: 2, y: 3, z: 4});
        document.Undo();
        expect(document.getEntities().map((entity) => entity.id)).toEqual(["trigger"]);
        document.Redo();
        document.Redo();
        expect(document.Serialize()).toEqual(committed);
    });

    it("checks queued revisions at execution and discards actions after a stale transaction", () => {
        const document = model();
        const before = document.Serialize();
        const revision = document.getRevision();
        const changes : number[] = [];
        let queued = false;
        const unsubscribe = document.Subscribe((event) => {
            if (event.kind !== "document.changed") {
                return;
            }
            changes.push(event.revision);
            if (queued) {
                return;
            }
            queued = true;
            document.TransformEntities({ids: ["model"], delta: EntityTransforms.Translation({x: 2, y: 0, z: 0}),
                expectedRevision: event.revision});
            document.TransformEntities({ids: ["model"], delta: EntityTransforms.Translation({x: 100, y: 0, z: 0}),
                expectedRevision: event.revision});
            document.AddEntities({entities: [{id: "discarded", type: "group", name: "Discarded", data: {}}]});
        });
        expect(() => {
            document.TransformEntities({ids: ["model"], delta: EntityTransforms.Translation({x: 1, y: 0, z: 0})});
        }).toThrow(/stale/);
        unsubscribe();
        expect(changes).toEqual([revision + 1, revision + 2]);
        expect(document.getRevision()).toBe(revision + 2);
        expect(document.getWorldTransform("model")[12]).toBe(103);
        expect(document.getEntities().map((entity) => entity.id)).toEqual(["model", "group", "mesh"]);
        const committed = document.Serialize();
        document.Undo();
        expect(document.getWorldTransform("model")[12]).toBe(101);
        document.Undo();
        expect(document.Serialize()).toEqual(before);
        document.Redo();
        document.Redo();
        expect(document.Serialize()).toEqual(committed);
        document.AddEntities({entities: [{id: "recovered", type: "group", name: "Recovered", data: {}}]});
        expect(document.getEntities().map((entity) => entity.id)).toEqual(["model", "group", "mesh", "recovered"]);
    });

    it("rolls back a partially staged transaction without changing selection, revision or redo history", () => {
        const document = model();
        document.TransformEntities({ids: ["model"], delta: EntityTransforms.Translation({x: 7, y: 0, z: 0})});
        const redoState = document.Serialize();
        document.Undo();
        document.Select(["model"]);
        const before = document.Serialize();
        const revision = document.getRevision();
        const events : string[] = [];
        const unsubscribe = document.Subscribe((event) => events.push(event.kind));
        expect(() => {
            document.AddEntities({entities: [
                {id: "staged", type: "group", name: "Staged", data: {}},
                {id: "model", type: "group", name: "Duplicate", data: {}}
            ]});
        }).toThrow(/Duplicate/);
        expect(document.Serialize()).toEqual(before);
        expect(document.getRevision()).toBe(revision);
        expect(document.getSelection()).toEqual(["model"]);
        expect(events).toEqual([]);
        unsubscribe();
        document.Redo();
        expect(document.Serialize()).toEqual(redoState);
        document.Undo();
        expect(document.Serialize()).toEqual(before);
    });

});
