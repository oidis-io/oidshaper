/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { BufferGeometry, Color, Float32BufferAttribute, LineBasicMaterial, LineSegments, MathUtils } from "three";
import { AXIS_COLOURS } from "./AxisColours.js";
import type { IGridOptions } from "./IGridOptions.js";

const MAX_CELLS : number = 1000; // per half
const LINE_COLOUR : string = "#9aa0a6";
const MINOR_ALPHA : number = 0.22;
const MAJOR_ALPHA : number = 0.5;
const AXIS_ALPHA : number = 1;
const FADE_START : number = 0.3; // share of the half size

// Around (0, 0, 0); the caller moves it to options.centre.
export function createGrid(options : IGridOptions) : LineSegments {
    const step : number = options.step ?? 1;
    const majorEvery : number = options.majorEvery ?? 10;
    const cells : number = Math.round((options.size ?? 100) / step / 2);
    if (!(step > 0) || !Number.isInteger(majorEvery) || majorEvery < 1 || cells < 1 || cells > MAX_CELLS) {
        throw new Error(`Grid needs a positive step, a whole majorEvery and 1 to ${String(MAX_CELLS)} cells per half.`);
    }
    const half : number = cells * step;
    const positions : number[] = [];
    const colours : number[] = [];
    const vertex = (x : number, y : number, z : number, colour : Color, alpha : number) : void => {
        positions.push(x, y, z);
        colours.push(colour.r, colour.g, colour.b, alpha);
    };
    // Split per cell, so the alpha fades with the distance from the centre.
    const line = (offset : number, alongY : boolean, colour : Color, alpha : number) : void => {
        for (let cell : number = -cells; cell < cells; cell++) {
            [cell, cell + 1].forEach((end) => {
                const along : number = end * step;
                const fade : number = 1 - MathUtils.smoothstep(Math.hypot(along, offset), half * FADE_START, half);
                if (alongY) {
                    vertex(offset, along, 0, colour, alpha * fade);
                } else {
                    vertex(along, offset, 0, colour, alpha * fade);
                }
            });
        }
    };

    const grey : Color = new Color(LINE_COLOUR);
    for (let index : number = -cells; index <= cells; index++) {
        if (index !== 0) {
            const alpha : number = index % majorEvery === 0 ? MAJOR_ALPHA : MINOR_ALPHA;
            line(index * step, false, grey, alpha);
            line(index * step, true, grey, alpha);
        }
    }
    line(0, false, new Color(AXIS_COLOURS.x), AXIS_ALPHA);
    line(0, true, new Color(AXIS_COLOURS.y), AXIS_ALPHA);
    const blue : Color = new Color(AXIS_COLOURS.z);
    vertex(0, 0, 0, blue, AXIS_ALPHA);
    vertex(0, 0, majorEvery * step, blue, AXIS_ALPHA);

    const geometry : BufferGeometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colours, 4));
    return new LineSegments(geometry, new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false
    }));
}
