/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { BaseEntity } from "../../../src/typescript/core/entities/BaseEntity.js";
import { EntityRegistry } from "../../../src/typescript/core/entities/EntityRegistry.js";
import { EntityDocument } from "../../../src/typescript/core/entities/EntityDocument.js";
import { EntityTypes, PolylineEntity } from "../../../src/typescript/core/entities/EntityTypes.js";
import { EntitySnapKind } from "../../../src/typescript/core/entities/IEntity.js";

import type {
    CircleEntity, RectangleEntity, MeshEntity, ICircleData, IPolylineData, IRectangleData, IMeshData
} from "../../../src/typescript/core/entities/EntityTypes.js";
import type {
    IEntityType, IEntityGeometry, IEntitySnap, IEntityDocumentData
} from "../../../src/typescript/core/entities/IEntity.js";
import type { IVector3 } from "../../../src/typescript/core/LocalOrigin.js";

interface IMarkerData {
    readonly position : IVector3;
    readonly label : string;
}

class MarkerEntity extends BaseEntity<IMarkerData> {
    public readonly typeId : string = "extension-marker";

    public Validate(data : unknown) : asserts data is IMarkerData {
        if (data === null || typeof data !== "object" || !("position" in data) || !("label" in data) ||
            !BaseEntity.point(data.position) || typeof data.label !== "string") {
            throw new TypeError("Invalid marker data.");
        }
    }

    public getGeometry(data : IMarkerData) : IEntityGeometry {
        return {paths: [{layer: "default", closed: false, points: [data.position]}]};
    }

    public override getSnapPoints(data : IMarkerData) : readonly IEntitySnap[] {
        return [{kind: EntitySnapKind.CENTRE, position: data.position}];
    }
}

describe("typed entity data and untrusted registry dispatch", () => {
    afterEach(() => vi.restoreAllMocks());

    it("keeps concrete and generic geometry methods tied to their data contracts", () => {
        expectTypeOf<Parameters<CircleEntity["getGeometry"]>[0]>().toEqualTypeOf<ICircleData>();
        expectTypeOf<Parameters<CircleEntity["getSnapPoints"]>[0]>().toEqualTypeOf<ICircleData>();
        expectTypeOf<Parameters<PolylineEntity["getGrips"]>[0]>().toEqualTypeOf<IPolylineData>();
        expectTypeOf<Parameters<RectangleEntity["getGeometry"]>[0]>().toEqualTypeOf<IRectangleData>();
        expectTypeOf<Parameters<MeshEntity["MoveGrip"]>[0]>().toEqualTypeOf<IMeshData>();
        expectTypeOf<ReturnType<CircleEntity["MoveGrip"]>["data"]>().toEqualTypeOf<ICircleData>();
        expectTypeOf<Parameters<IEntityType<IMarkerData>["getGeometry"]>[0]>().toEqualTypeOf<IMarkerData>();
        expectTypeOf<Parameters<BaseEntity<IMarkerData>["getSnapPoints"]>[0]>().toEqualTypeOf<IMarkerData>();
        expectTypeOf<IPolylineData>().not.toExtend<Parameters<CircleEntity["getGeometry"]>[0]>();
        expectTypeOf<unknown>().not.toExtend<Parameters<MarkerEntity["getGeometry"]>[0]>();
        expectTypeOf({centre: {x: 0, y: 0, z: 0}, radius: "invalid"})
            .not.toExtend<Parameters<CircleEntity["getSnapPoints"]>[0]>();
        expectTypeOf<"type">().not.toExtend<keyof MarkerEntity>();
        expectTypeOf<MarkerEntity>().toExtend<IEntityType<IMarkerData>>();
    });

    it("narrows untrusted data through a custom validator without casting", () => {
        const marker : MarkerEntity = new MarkerEntity();
        const raw : unknown = {position: {x: 1, y: 2, z: 3}, label: "Station"};
        marker.Validate(raw);
        expectTypeOf(raw).toEqualTypeOf<IMarkerData>();
        expect(marker.getSnapPoints(raw)).toEqual([{kind: "centre", position: {x: 1, y: 2, z: 3}}]);
    });

    it("validates raw extension data before any typed geometry or snap dispatch", () => {
        const registry = new EntityRegistry();
        const marker = new MarkerEntity();
        const geometry = vi.spyOn(marker, "getGeometry");
        const snaps = vi.spyOn(marker, "getSnapPoints");
        registry.Register(marker);
        const registered = registry.getType("extension-marker");
        expect(registered.typeId).toBe("extension-marker");
        expect(registered.acceptsChildren).toBe(false);
        for (const raw of [null, [], {}, {position: {x: 1, y: 2}, label: "Missing Z"},
            {position: {x: NaN, y: 2, z: 3}, label: "Invalid X"},
            {position: {x: 1, y: 2, z: 3}, label: 7}]) {
            expect(() => registered.Parse(raw)).toThrow(/Invalid marker/);
        }
        expect(geometry).not.toHaveBeenCalled();
        expect(snaps).not.toHaveBeenCalled();
        const raw = {position: {x: 1, y: 2, z: 3}, label: "Station"};
        const binding = registered.Parse(raw);
        expect(binding.getGeometry()).toEqual({paths: [{layer: "default", closed: false, points: [raw.position]}]});
        expect(binding.getSnapPoints()).toEqual([{kind: "centre", position: raw.position}]);
        expect(geometry).toHaveBeenCalledExactlyOnceWith(raw);
        expect(snaps).toHaveBeenCalledExactlyOnceWith(raw);
        expect(() => {
            registry.Register(new MarkerEntity());
        }).toThrow(/already registered/);
        expect(() => registry.getType("unknown-extension")).toThrow(/Unknown entity type/);
    });

    it("retains grip snap fallback for structural extensions while respecting explicit empty snaps", () => {
        const registry = new EntityRegistry();
        const polyline : PolylineEntity = new PolylineEntity();
        const extension : IEntityType<IPolylineData> = {
            typeId: "grip-only",
            acceptsChildren: false,
            Validate(data : unknown) : asserts data is IPolylineData {
                polyline.Validate(data);
            },
            getGeometry: (data) => polyline.getGeometry(data),
            getGrips: (data) => polyline.getGrips(data),
            MoveGrip: (data, grip, position) => ({...polyline.MoveGrip(data, grip, position), type: "grip-only"})
        };
        registry.Register(extension);
        registry.Register({...extension, typeId: "no-snaps", getSnapPoints: () => []});
        const data : IPolylineData = {points: [{x: 1, y: 2, z: 3}], closed: false};
        const binding = registry.getType("grip-only").Parse(data);
        expect(binding.getSnapPoints()).toEqual([{kind: "endpoint", position: {x: 1, y: 2, z: 3}}]);
        expect(binding.getCapabilities()).toEqual({children: false, grips: true, topology: false});
        expect(binding.getTopology()).toBeUndefined();
        expect(binding.MoveGrip("0", {x: 4, y: 5, z: 6})).toEqual({type: "grip-only",
            data: {points: [{x: 4, y: 5, z: 6}], closed: false}});
        expect(data.points).toEqual([{x: 1, y: 2, z: 3}]);
        expect(registry.getType("no-snaps").Parse(data).getSnapPoints()).toEqual([]);
    });

    it("rejects invalid built-in data at the same untrusted boundary", () => {
        const registry = EntityTypes.CreateRegistry();
        expect(() => registry.getType("circle").Parse({centre: {x: 0, y: 0, z: 0}, radius: "2"})).toThrow();
        expect(() => registry.getType("polyline").Parse({points: [{x: 0, y: 0}], closed: false})).toThrow();
        expect(() => registry.getType("mesh").Parse({vertices: [], triangles: [0, 1, 2]})).toThrow();
        const circle = registry.getType("circle").Parse({centre: {x: 1, y: 2, z: 3}, radius: 2});
        expect(circle.getSnapPoints()).toContainEqual({kind: "centre", position: {x: 1, y: 2, z: 3}});
    });

    it("preserves extension wire types through documents and rejects malformed imported data atomically", () => {
        const registry = EntityTypes.CreateRegistry();
        registry.Register(new MarkerEntity());
        const document = new EntityDocument(registry);
        document.AddEntities({entities: [{id: "marker", type: "extension-marker", name: "Station",
            data: {position: {x: 1, y: 2, z: 3}, label: "Station"}}]});
        const saved = document.Serialize();
        expect(saved.entities[0]?.type).toBe("extension-marker");
        expect(saved.entities[0]).not.toHaveProperty("typeId");
        const restored = new EntityDocument(registry);
        restored.ReplaceDocument({document: <IEntityDocumentData>JSON.parse(JSON.stringify(saved))});
        expect(restored.Serialize()).toEqual(saved);
        expect(restored.getGeometry("marker")).toEqual(document.getGeometry("marker"));
        const revision = restored.getRevision();
        const malformed = {...saved, entities: saved.entities.map((entity) => ({...entity, data: {label: "Broken"}}))};
        expect(() => {
            restored.ReplaceDocument({document: malformed});
        }).toThrow(/Invalid marker/);
        expect(restored.Serialize()).toEqual(saved);
        expect(restored.getRevision()).toBe(revision);
        restored.Undo();
        expect(restored.getEntities()).toEqual([]);
        restored.Redo();
        expect(restored.Serialize()).toEqual(saved);
    });
});
