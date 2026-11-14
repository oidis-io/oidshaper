/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import "cesium/Build/Cesium/Widgets/widgets.css";
import { afterEach, describe, expect, it } from "vitest";
import {
    EntityTypes, EntityTransforms, LocalOrigin, MapView, Viewport, EntityDocument
} from "../../../src/typescript/index.js";
import { readPixel } from "../../helpers/ReadPixel.js";

import type { IVector3 } from "../../../src/typescript/index.js";

const TARGET : IVector3 = {x: -743123.456, y: -1043210.789, z: 312.4};

describe("Viewport", () => {
    let viewport : Viewport | undefined;
    let canvas : HTMLCanvasElement | undefined;

    afterEach(() => {
        viewport?.Dispose();
        canvas?.remove();
    });

    it("draws a box placed in national coordinates in the centre of the view", () => {
        canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        document.body.append(canvas);

        viewport = new Viewport({
            canvas,
            origin: new LocalOrigin({x: -743000, y: -1043000, z: 300}),
            background: "#000000",
            preserveDrawingBuffer: true
        });
        viewport.Resize(64, 64);
        viewport.AddBox({centre: TARGET, size: 2, colour: "#ff0000"});
        viewport.LookAt(TARGET, 10);
        viewport.Render();

        // The buffer size follows devicePixelRatio.
        const centreX : number = Math.floor(canvas.width / 2);
        const centreY : number = Math.floor(canvas.height / 2);
        // Lighting changes only the brightness.
        const [red, green, blue, alpha] = readPixel(canvas, centreX, centreY);
        expect(red).toBeGreaterThan(100);
        expect([green, blue, alpha]).toEqual([0, 0, 255]);
        expect(readPixel(canvas, 1, 1)).toEqual([0, 0, 0, 255]);
        viewport.setModelsVisible(false);
        viewport.Render();
        expect(readPixel(canvas, centreX, centreY)).toEqual([0, 0, 0, 255]);
        viewport.setBackground("#edf1f5");
        viewport.Render();
        expect(readPixel(canvas, centreX, centreY)).toEqual([237, 241, 245, 255]);
        viewport.setModelsVisible(true);
        viewport.Render();
        expect(readPixel(canvas, centreX, centreY)[0]).toBeGreaterThan(100);
    });
    it("renders indexed entity meshes and restores them after hierarchy edits", () => {
        canvas = document.createElement("canvas");
        document.body.append(canvas);
        viewport = new Viewport({canvas, origin: new LocalOrigin(TARGET), background: "#000000",
            preserveDrawingBuffer: true});
        viewport.Resize(64, 64);
        viewport.LookAt(TARGET, 10);
        const scene = new EntityDocument();
        scene.AddEntities({entities: [
            {id: "model", type: "model", name: "model", data: {}, transform: EntityTransforms.Translation(TARGET)},
            {id: "mesh", parentId: "model", type: "mesh", name: "mesh",
                data: {...EntityTypes.BoxMesh({x: 2, y: 2, z: 2}), colour: 0xff0000}}
        ]});
        const drawing = scene.getDrawing();
        expect(drawing.paths).toHaveLength(0);
        expect(drawing.meshes?.[0]?.vertices).toHaveLength(8);
        expect(drawing.meshes?.[0]?.triangles).toHaveLength(36);
        viewport.setDrawing(drawing); viewport.Render();
        const screen = viewport.ProjectPoint(TARGET);
        expect(viewport.PickEntity(screen?.x ?? 0, screen?.y ?? 0)?.id).toBe("mesh");
        const x = Math.floor(canvas.width / 2), y = Math.floor(canvas.height / 2);
        expect(readPixel(canvas, x, y)[0]).toBeGreaterThan(100);
        scene.RemoveEntities({ids: ["model"]});
        viewport.setDrawing(scene.getDrawing()); viewport.Render();
        expect(readPixel(canvas, x, y)).toEqual([0, 0, 0, 255]);
        scene.Undo();
        viewport.setDrawing(scene.getDrawing()); viewport.Render();
        expect(readPixel(canvas, x, y)[0]).toBeGreaterThan(100);
    });

    it("keeps the overlay transparent across frames and resize with the axis triad", () => {
        canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        document.body.append(canvas);
        viewport = new Viewport({canvas, origin: new LocalOrigin({x: 0, y: 0, z: 0}),
            transparent: true, axisTriad: true, preserveDrawingBuffer: true});
        viewport.LookAt({x: 0, y: 0, z: 0}, 20);
        for (let frame = 0; frame < 3; frame++) {
            viewport.setBackground(frame % 2 === 0 ? "#edf1f5" : "#202124");
            viewport.Resize(256, 256);
            viewport.Render();
            expect(readPixel(canvas, 200, 200)[3]).toBe(0);
        }
    });

    it("aligns Cesium and Three.js cameras and preserves overlay alpha", async () => {
        const container : HTMLDivElement = document.createElement("div");
        container.style.width = "256px";
        container.style.height = "256px";
        document.body.append(container);
        const map = await MapView.Create({container, assetsUrl: `${location.origin}/cesium/`, terrain: false});
        try {
            canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            document.body.append(canvas);
            viewport = new Viewport({canvas, origin: new LocalOrigin(TARGET), transparent: true,
                axisTriad: true, preserveDrawingBuffer: true, OnCameraChanged: (state) => {
                    map.SyncCamera(state);
                }});
            viewport.LookAt(TARGET, 100);
            viewport.AddBox({centre: TARGET, size: 5, colour: "#ff0000"});
            viewport.Render();
            map.Render();
            expect(readPixel(canvas, 200, 200)[3]).toBe(0);
            const pixel = map.Project(TARGET);
            expect(pixel?.[0]).toBeCloseTo(128, 0);
            expect(pixel?.[1]).toBeCloseTo(128, 0);
        } finally {
            map.Dispose();
            map.Dispose();
            container.remove();
        }
    });

    it("uses the configured background above and below the map in both themes", async () => {
        const container = document.createElement("div");
        container.style.width = "256px";
        container.style.height = "256px";
        document.body.append(container);
        const map = await MapView.Create({container, assetsUrl: `${location.origin}/cesium/`, terrain: false});
        try {
            const mapCanvas = container.querySelector("canvas");
            expect(mapCanvas).not.toBeNull();
            if (mapCanvas === null) {
                throw new Error("Missing map canvas.");
            }
            for (const colour of ["#202124", "#edf1f5"]) {
                const expected = colour === "#202124" ? [32, 33, 36, 255] : [237, 241, 245, 255];
                map.setBackground(colour);
                for (const height of [-500, 10000]) {
                    map.SyncCamera({position: {...TARGET, z: height}, target: {...TARGET, z: height + 100},
                        up: {x: 0, y: 1, z: 0}, aspect: 1, verticalFov: Math.PI / 3, near: 0.1, far: 1e8});
                    map.Render();
                    expect(readPixel(mapCanvas, 128, 128)).toEqual(expected);
                }
            }
            expect(() => {
                map.setBackground("not-a-colour");
            }).toThrow(TypeError);
        } finally {
            map.Dispose();
            container.remove();
        }
    });

});
