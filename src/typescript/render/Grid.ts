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
import { AxisColours } from "./AxisColours.js";

import type { IGridOptions } from "./IGridOptions.js";

export class Grid {
    private static readonly POSITION_COMPONENTS : number = 3;
    private static readonly COLOUR_COMPONENTS : number = 4;
    private static readonly DEFAULT_STEP : number = 1;
    private static readonly DEFAULT_MAJOR_EVERY : number = 10;
    private static readonly DEFAULT_SIZE : number = 100;
    private static readonly MAX_CELLS : number = 1000; // per half
    private static readonly LINE_COLOUR : string = "#9aa0a6";
    private static readonly MINOR_ALPHA : number = 0.22;
    private static readonly MAJOR_ALPHA : number = 0.5;
    private static readonly AXIS_ALPHA : number = 1;
    private static readonly FADE_START : number = 0.3; // share of the half size
    private readonly step : number;
    private readonly majorEvery : number;
    private readonly cells : number;
    private readonly positions : number[] = [];
    private readonly colours : number[] = [];

    // Around (0, 0, 0); the caller moves it to options.centre.
    public static Create(options : IGridOptions) : LineSegments {
        return new Grid(options).build();
    }

    private constructor(options : IGridOptions) {
        this.step = options.step ?? Grid.DEFAULT_STEP;
        this.majorEvery = options.majorEvery ?? Grid.DEFAULT_MAJOR_EVERY;
        this.cells = Math.round((options.size ?? Grid.DEFAULT_SIZE) / this.step / 2);
        if (!(this.step > 0) || !Number.isInteger(this.majorEvery) || this.majorEvery < 1 ||
            this.cells < 1 || this.cells > Grid.MAX_CELLS) {
            throw new Error(
                `Grid needs a positive step, a whole majorEvery and 1 to ${String(Grid.MAX_CELLS)} cells per half.`
            );
        }
    }

    private build() : LineSegments {
        const grey : Color = new Color(Grid.LINE_COLOUR);
        for (let index : number = -this.cells; index <= this.cells; index++) {
            if (index !== 0) {
                const alpha : number = index % this.majorEvery === 0 ? Grid.MAJOR_ALPHA : Grid.MINOR_ALPHA;
                this.addLine(index * this.step, false, grey, alpha);
                this.addLine(index * this.step, true, grey, alpha);
            }
        }
        this.addLine(0, false, new Color(AxisColours.VALUES.x), Grid.AXIS_ALPHA);
        this.addLine(0, true, new Color(AxisColours.VALUES.y), Grid.AXIS_ALPHA);
        const blue : Color = new Color(AxisColours.VALUES.z);
        this.addVertex(0, 0, 0, blue, Grid.AXIS_ALPHA);
        this.addVertex(0, 0, this.majorEvery * this.step, blue, Grid.AXIS_ALPHA);

        const geometry : BufferGeometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(this.positions, Grid.POSITION_COMPONENTS));
        geometry.setAttribute("color", new Float32BufferAttribute(this.colours, Grid.COLOUR_COMPONENTS));
        return new LineSegments(geometry, new LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            depthWrite: false
        }));
    }

    private addVertex(x : number, y : number, z : number, colour : Color, alpha : number) : void {
        this.positions.push(x, y, z);
        this.colours.push(colour.r, colour.g, colour.b, alpha);
    }

    // Split per cell, so the alpha fades with the distance from the centre.
    private addLine(offset : number, alongY : boolean, colour : Color, alpha : number) : void {
        const half : number = this.cells * this.step;
        for (let cell : number = -this.cells; cell < this.cells; cell++) {
            [cell, cell + 1].forEach((end) => {
                const along : number = end * this.step;
                const fade : number = 1 - MathUtils.smoothstep(Math.hypot(along, offset), half * Grid.FADE_START, half);
                if (alongY) {
                    this.addVertex(offset, along, 0, colour, alpha * fade);
                } else {
                    this.addVertex(along, offset, 0, colour, alpha * fade);
                }
            });
        }
    }
}
