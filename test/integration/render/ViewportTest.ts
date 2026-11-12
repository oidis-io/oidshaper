/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { afterEach, describe, expect, it } from "vitest";
import { LocalOrigin, Viewport, type IVector3 } from "../../../src/typescript/index.js";
import { readPixel } from "../../helpers/ReadPixel.js";

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
    });
});
