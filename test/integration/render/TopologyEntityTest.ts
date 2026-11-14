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
import { EntityDocument, LocalOrigin, Viewport } from "../../../src/typescript/index.js";
import { readPixel } from "../../helpers/ReadPixel.js";

describe("logical topology rendering", () => {
    it("renders and picks a box before preview, after face editing and after undo", () => {
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        const viewport = new Viewport({canvas, origin: new LocalOrigin({x: 0, y: 0, z: 0}),
            background: "#000000", preserveDrawingBuffer: true});
        try {
            viewport.Resize(128, 128);
            viewport.LookAt({x: 0, y: 0, z: 0}, 10);
            const scene = new EntityDocument();
            scene.AddEntities({entities: [
                {id: "box", type: "box", name: "Logical box", data: {size: {x: 2, y: 2, z: 2}}}
            ]});
            const original = scene.getDrawing();
            const part = {kind: EntityPartKind.FACE, id: "face:1"};
            const delta = {x: 0, y: 0, z: 2};
            const preview = scene.PreviewPart("box", part, delta, scene.getRevision());
            for (const drawing of [original, preview]) {
                viewport.setDrawing(drawing);
                viewport.Render();
                const screen = viewport.ProjectPoint({x: 0, y: 0, z: 0});
                const hit = viewport.PickEntity(screen?.x ?? 0, screen?.y ?? 0);
                expect(hit?.id).toBe("box");
                expect(scene.getTopology("box")?.faces.some((face) => face.id === hit?.faceId)).toBe(true);
                expect(readPixel(canvas, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2))[0])
                    .toBeGreaterThan(50);
            }
            expect(scene.getDrawing()).toEqual(original);
            scene.MovePart({id: "box", part, delta});
            expect(scene.getDrawing()).toEqual(preview);
            scene.Undo();
            viewport.setDrawing(scene.getDrawing());
            viewport.Render();
            expect(scene.getDrawing()).toEqual(original);
        } finally {
            viewport.Dispose();
            canvas.remove();
        }
    });
});
