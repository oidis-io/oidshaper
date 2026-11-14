/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DxfCodec } from "../../../src/typescript/io/DxfCodec.js";

import type { IDrawing } from "../../../src/typescript/core/IDrawing.js";

describe("DxfCodec", () => {
    it("preserves every survey vertex and layer through export and reimport", () => {
        const file : URL = new URL("../../../src/html/demos/drawing/sample.dxf", import.meta.url);
        const content : string = new TextDecoder("windows-1250").decode(readFileSync(file));
        const codec : DxfCodec = new DxfCodec();
        const drawing : IDrawing = codec.Import(content);
        expect(drawing.paths.map((path) => path.points.length)).toEqual([2, 14, 2]);
        expect(drawing.paths.map((path) => path.layer)).toEqual(["0", "0", "0"]);
        const exported = codec.Export(drawing);
        expect(exported).toContain("0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n");
        expect(exported).toContain("0\nPOLYLINE\n8\n0\n66\n1\n70\n8\n");
        expect(exported).toContain("0\nVERTEX\n8\n0\n70\n32\n10\n");
        expect(exported).toContain("0\nSEQEND\n");
        expect(exported).toMatch(/0\nENDSEC\n0\nEOF\n$/);
        expect(codec.Import(exported).paths).toEqual(drawing.paths);
    });

    it("roundtrips open and closed 3D paths including negative national coordinates", () => {
        const drawing : IDrawing = {warnings: [], paths: [
            {layer: "survey", closed: false, points: [
                {x: -743123.456, y: -1043210.789, z: 312.4}, {x: -743120, y: -1043200, z: 315}
            ]},
            {layer: "boundary", closed: true, points: [
                {x: 0, y: 0, z: 0}, {x: 10, y: 0, z: 0}, {x: 10, y: 10, z: 0}
            ]}
        ]};
        expect(new DxfCodec().Import(new DxfCodec().Export(drawing))).toEqual(drawing);
    });

    it("rejects non-finite coordinates and layer injection", () => {
        const path = {layer: "0", closed: false, points: [{x: NaN, y: 0, z: 0}, {x: 0, y: 0, z: 0}]};
        expect(() => new DxfCodec().Export({paths: [path], warnings: []})).toThrow();
        expect(() => new DxfCodec().Export({paths: [{...path, layer: "0\nENDSEC"}], warnings: []})).toThrow();
    });

    it("roundtrips an empty drawing", () => {
        const codec : DxfCodec = new DxfCodec();
        expect(codec.Import(codec.Export({paths: [], warnings: []}))).toEqual({paths: [], warnings: []});
    });
});

function entities(...groups : ReadonlyArray<string | number>) : string {
    return [0, "SECTION", 2, "ENTITIES", ...groups, 0, "ENDSEC", 0, "EOF", ""].join("\n");
}

describe("DXF geometry and transforms", () => {
    const codec : DxfCodec = new DxfCodec();

    it("retains circle geometry, truecolour and tilted extrusion through export", () => {
        const original = codec.Import(entities(0, "CIRCLE", 8, "curves", 10, 3, 20, 4, 30, 2,
            40, 5, 210, 0, 220, 1, 230, 0, 420, 0x123456));
        const path = original.paths[0];
        expect(path?.curve?.centre).toEqual({x: -3, y: 2, z: 4});
        expect(path?.colour).toBe(0x123456);
        const restored = codec.Import(codec.Export(original)).paths[0];
        expect(restored?.curve?.centre).toEqual(path?.curve?.centre);
        expect(restored?.colour).toBe(path?.colour);
        expect(restored?.closed).toBe(true);
        expect(restored?.points.length).toBeGreaterThan(20);
        expect(restored?.points.every((point) => Math.abs(point.y - 2) < 1e-9)).toBe(true);
    });

    it("preserves signed polyline bulges and elevation", () => {
        for (const bulge of [-1, 1]) {
            const drawing = codec.Import(entities(0, "LWPOLYLINE", 8, "bulge", 90, 2, 38, 12,
                10, 0, 20, 0, 42, bulge, 10, 10, 20, 0));
            expect(drawing.paths[0]?.curve?.sweep).toBeCloseTo(Math.PI * bulge);
            expect(drawing.paths[0]?.points.every((point) => point.z === 12)).toBe(true);
            const restored = codec.Import(codec.Export(drawing));
            expect(restored.paths[0]?.points.every((point) => point.z === 12)).toBe(true);
        }
    });

    it("roundtrips filled faces, points and labels including their layers and colour", () => {
        const drawing = codec.Import(entities(0, "3DFACE", 8, "face", 420, 0xb74b88,
            10, 0, 20, 0, 30, 2, 11, 5, 21, 0, 31, 2, 12, 0, 22, 5, 32, 3, 13, 0, 23, 5, 33, 3,
            0, "POINT", 8, "point", 10, 2, 20, 3, 30, 4,
            0, "TEXT", 8, "text", 10, 1, 20, 2, 30, 0, 40, 2, 1, "Survey", 50, 30));
        const restored = codec.Import(codec.Export(drawing));
        expect(restored.paths).toEqual(drawing.paths);
        expect(restored.labels).toEqual(drawing.labels);
    });

    it("expands block inserts with base point, rotation and scale", () => {
        const text = [0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 2, "part", 10, 1, 20, 1, 30, 0,
            0, "LINE", 8, "0", 10, 1, 20, 1, 30, 0, 11, 2, 21, 1, 31, 0,
            0, "ENDBLK", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES",
            0, "INSERT", 8, "assembly", 2, "part", 10, 10, 20, 20, 30, 5, 41, 2, 42, 3, 50, 90,
            0, "ENDSEC", 0, "EOF", ""].join("\n");
        const path = codec.Import(text).paths[0];
        expect(path?.layer).toBe("assembly");
        expect(path?.points[0]).toEqual({x: 10, y: 20, z: 5});
        expect(path?.points[1]?.x).toBeCloseTo(10);
        expect(path?.points[1]?.y).toBeCloseTo(22);
    });

    it("canonicalises non-uniformly transformed ellipse axes", () => {
        const drawing : IDrawing = {warnings: [], paths: [{layer: "0", closed: true, points: [{x: 0, y: 0, z: 0}],
            curve: {centre: {x: 3, y: 4, z: 5}, axisU: {x: 3, y: 1, z: 0}, axisV: {x: 1, y: 2, z: 0},
                start: 0, sweep: Math.PI * 2}}]};
        const curve = codec.Import(codec.Export(drawing)).paths[0]?.curve;
        expect(curve?.centre).toEqual({x: 3, y: 4, z: 5});
        expect(curve).toBeDefined();
        if (curve !== undefined) {
            expect(Math.hypot(curve.axisU.x, curve.axisU.y)).toBeGreaterThan(Math.hypot(curve.axisV.x, curve.axisV.y));
            expect((curve.axisU.x * curve.axisV.x) + (curve.axisU.y * curve.axisV.y)).toBeCloseTo(0);
        }
    });

    it("rejects invalid curve geometry and missing blocks", () => {
        expect(() => codec.Import(entities(0, "CIRCLE", 10, 0, 20, 0, 40, -1))).toThrow();
        expect(() => codec.Import(entities(0, "INSERT", 2, "missing", 10, 0, 20, 0))).toThrow();
    });
});

function blockDrawing(content : ReadonlyArray<string | number>, insert : ReadonlyArray<string | number>) : string {
    return [0, "SECTION", 2, "BLOCKS", 0, "BLOCK", 2, "part", 10, 0, 20, 0, 30, 0,
        ...content, 0, "ENDBLK", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES",
        0, "INSERT", 8, "assembly", 2, "part", ...insert, 0, "ENDSEC", 0, "EOF", ""].join("\n");
}

describe("DXF block regression cases", () => {
    const codec = new DxfCodec();

    it("transforms label size and orientation together with its position", () => {
        const drawing = codec.Import(blockDrawing([0, "TEXT", 8, "0", 10, 1, 20, 0, 30, 0,
            40, 2, 1, "Label", 50, 30], [10, 10, 20, 20, 30, 5, 41, 2, 42, 2, 43, 2, 50, 90]));
        const label = drawing.labels?.[0];
        expect(label?.position.x).toBeCloseTo(10);
        expect(label?.position.y).toBeCloseTo(22);
        expect(label?.position.z).toBe(5);
        expect(label?.height).toBeCloseTo(4);
        expect(label?.rotation).toBeCloseTo(120);
        expect(codec.Import(codec.Export(drawing)).labels).toEqual(drawing.labels);
    });

    it("expands mirrored rectangular arrays and preserves their coordinates through export", () => {
        const drawing = codec.Import(blockDrawing([0, "LINE", 8, "0", 10, 1, 20, 2, 30, 3,
            11, 2, 21, 3, 31, 4], [10, 10, 20, 20, 30, 5, 41, -2, 42, 3, 43, 4,
            70, 2, 71, 2, 44, 10, 45, 20]));
        expect(drawing.paths.map((path) => path.points[0])).toEqual([
            {x: 8, y: 26, z: 17}, {x: 18, y: 26, z: 17},
            {x: 8, y: 46, z: 17}, {x: 18, y: 46, z: 17}
        ]);
        expect(codec.Import(codec.Export(drawing)).paths).toEqual(drawing.paths);
    });

    it("composes nested rotations and scales in parent order", () => {
        const text = [0, "SECTION", 2, "BLOCKS",
            0, "BLOCK", 2, "inner", 10, 1, 20, 1, 30, 0,
            0, "LINE", 8, "0", 10, 1, 20, 1, 30, 0, 11, 2, 21, 1, 31, 0, 0, "ENDBLK",
            0, "BLOCK", 2, "outer", 10, 0, 20, 0, 30, 0,
            0, "INSERT", 8, "0", 2, "inner", 10, 3, 20, 4, 30, 0, 41, 2, 42, 2, 50, 90,
            0, "ENDBLK", 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES",
            0, "INSERT", 8, "nested", 2, "outer", 10, 10, 20, 20, 30, 5, 41, 3, 42, 4, 50, 90,
            0, "ENDSEC", 0, "EOF", ""].join("\n");
        const drawing = codec.Import(text);
        const points = drawing.paths[0]?.points;
        expect(drawing.paths[0]?.layer).toBe("nested");
        expect(points?.[0]?.x).toBeCloseTo(-6);
        expect(points?.[0]?.y).toBeCloseTo(29);
        expect(points?.[1]?.x).toBeCloseTo(-14);
        expect(points?.[1]?.y).toBeCloseTo(29);
        expect(points?.[1]?.z).toBe(5);
        expect(codec.Import(codec.Export(drawing)).paths).toEqual(drawing.paths);
    });

    it("reports unrepresentable text transforms instead of silently drawing incorrect labels", () => {
        for (const xScale of [-2, 3]) {
            const drawing = codec.Import(blockDrawing([0, "TEXT", 8, "0", 10, 1, 20, 0,
                40, 2, 1, "Label"], [10, 0, 20, 0, 41, xScale, 42, 2]));
            expect(drawing.labels ?? []).toHaveLength(0);
            expect(drawing.warnings).toContain("Unsupported text transform on layer: assembly");
        }
    });

    it("rejects recursive blocks and excessive array expansion", () => {
        expect(() => codec.Import(blockDrawing([0, "INSERT", 2, "part", 10, 0, 20, 0],
            [10, 0, 20, 0]))).toThrow(/recursive/);
        expect(() => codec.Import(blockDrawing([0, "POINT", 10, 0, 20, 0],
            [10, 0, 20, 0, 70, 101, 71, 100]))).toThrow(/10000/);
    });
});
