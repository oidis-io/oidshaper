/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import type { IDrawingPath } from "./IDrawing.js";
import type { IVector3 } from "./LocalOrigin.js";

export enum DrawingShape {
    LINE = "line",
    RECTANGLE = "rectangle",
    CIRCLE = "circle"
}

export class DrawingShapes {
    private static readonly CIRCLE_SEGMENT_COUNT : number = 128;
    private static readonly UNSNAPPED_SPACING : number = 0;

    public static SnapDrawingPoint(point : IVector3, spacing : number) : IVector3 {
        if (![point.x, point.y, point.z, spacing].every(Number.isFinite) || spacing < 0) {
            throw new RangeError("Drawing coordinates and snap must be finite; snap cannot be negative.");
        }
        const result = {x: DrawingShapes.round(point.x, spacing), y: DrawingShapes.round(point.y, spacing), z: point.z};
        if (![result.x, result.y].every(Number.isFinite)) {
            throw new RangeError("Snap exceeds the supported coordinate range.");
        }
        return result;
    }

    public static CreateDrawingShape(shape : DrawingShape, start : IVector3, end : IVector3) : IDrawingPath {
        const a = DrawingShapes.SnapDrawingPoint(start, DrawingShapes.UNSNAPPED_SPACING);
        const b = DrawingShapes.SnapDrawingPoint({...end, z: a.z}, DrawingShapes.UNSNAPPED_SPACING);
        const radius = Math.hypot(b.x - a.x, b.y - a.y);
        if (radius === 0 || !Number.isFinite(radius)) {
            throw new RangeError("A shape must have a non-zero finite size.");
        }
        if (shape === DrawingShape.LINE) {
            return {layer: "drawing", points: [a, b], closed: false};
        }
        if (shape === DrawingShape.RECTANGLE) {
            if (a.x === b.x || a.y === b.y) {
                throw new RangeError("A rectangle needs non-zero width and height.");
            }
            return {layer: "drawing", points: [a, {x: b.x, y: a.y, z: a.z}, b,
                {x: a.x, y: b.y, z: a.z}], closed: true};
        }
        const points = Array.from({length: DrawingShapes.CIRCLE_SEGMENT_COUNT}, (_, index) => {
            const angle = (index * Math.PI * 2) / DrawingShapes.CIRCLE_SEGMENT_COUNT;
            return {x: a.x + (radius * Math.cos(angle)), y: a.y + (radius * Math.sin(angle)), z: a.z};
        });
        return {layer: "drawing", points, closed: true,
            curve: {centre: a, axisU: {x: radius, y: 0, z: 0}, axisV: {x: 0, y: radius, z: 0},
                start: 0, sweep: Math.PI * 2}};
    }

    private static round(value : number, spacing : number) : number {
        return spacing > 0 ? Math.round(value / spacing) * spacing : value;
    }

}
