/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

export interface IPoint2 {
    readonly x : number;
    readonly y : number;
}

export enum SelectionMode {
    WINDOW = "window",
    CROSSING = "crossing"
}

export enum SelectionOperation {
    REPLACE = "replace",
    ADD = "add",
    REMOVE = "remove"
}

export class DrawingSelection {
    private static readonly MIN_REGION_POINTS : number = 3;
    private static readonly POINT_DISTANCE_TOLERANCE : number = 1e-7;
    private static readonly PARALLEL_CROSS_PRODUCT_TOLERANCE : number = 1e-7;
    private static readonly SEGMENT_PARAMETER_TOLERANCE : number = 1e-7;
    private static readonly MIN_REGION_CROSS_PRODUCT : number = 1e-7;

    public static PathInSelection(points : readonly IPoint2[], region : readonly IPoint2[], mode : SelectionMode,
        closed : boolean = false, filled : boolean = false) : boolean {
        if (region.length < DrawingSelection.MIN_REGION_POINTS || !DrawingSelection.hasArea(region) ||
            points.length === 0 ||
            [...points, ...region].some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
            return false;
        }
        if (mode === SelectionMode.CROSSING && points.some((point) => DrawingSelection.PointInPolygon(point, region))) {
            return true;
        }
        if (mode === SelectionMode.WINDOW && !points.every((point) => DrawingSelection.PointInPolygon(point, region))) {
            return false;
        }
        for (let index = 0; index < points.length - (closed ? 0 : 1); index++) {
            const start = points[index];
            const end = points[(index + 1) % points.length];
            if (start === undefined || end === undefined) {
                continue;
            }
            const splits : number[] = [0, 1];
            for (let edge = 0; edge < region.length; edge++) {
                const a = region[edge];
                const b = region[(edge + 1) % region.length];
                if (a === undefined || b === undefined) {
                    continue;
                }
                const hits = DrawingSelection.intersections(start, end, a, b);
                if (mode === SelectionMode.CROSSING && hits.length > 0) {
                    return true;
                }
                splits.push(...hits);
            }
            if (mode === SelectionMode.WINDOW) {
                splits.sort((a, b) => a - b);
                for (let part = 1; part < splits.length; part++) {
                    const t = ((splits[part - 1] ?? 0) + (splits[part] ?? 1)) / 2;
                    if (!DrawingSelection.PointInPolygon({x: start.x + ((end.x - start.x) * t),
                        y: start.y + ((end.y - start.y) * t)}, region)) {
                        return false;
                    }
                }
            }
        }
        return mode === SelectionMode.WINDOW ||
            (filled && closed && region.some((point) => DrawingSelection.PointInPolygon(point, points)));
    }

    public static PointInPolygon(point : IPoint2, polygon : readonly IPoint2[]) : boolean {
        let inside : boolean = false;
        for (let index = 0; index < polygon.length; index++) {
            const a = polygon[index];
            const b = polygon[(index + 1) % polygon.length];
            if (a === undefined || b === undefined) {
                continue;
            }
            if (DrawingSelection.onSegment(point, a, b)) {
                return true;
            }
            if ((a.y > point.y) !== (b.y > point.y) &&
                point.x < ((((b.x - a.x) * (point.y - a.y)) / (b.y - a.y)) + a.x)) {
                inside = !inside;
            }
        }
        return inside;
    }

    private static onSegment(point : IPoint2, a : IPoint2, b : IPoint2) : boolean {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.abs(((point.x - a.x) * dy) - ((point.y - a.y) * dx)) <=
            (DrawingSelection.POINT_DISTANCE_TOLERANCE * Math.max(1, Math.hypot(dx, dy))) &&
            point.x >= Math.min(a.x, b.x) - DrawingSelection.POINT_DISTANCE_TOLERANCE &&
            point.x <= Math.max(a.x, b.x) + DrawingSelection.POINT_DISTANCE_TOLERANCE &&
            point.y >= Math.min(a.y, b.y) - DrawingSelection.POINT_DISTANCE_TOLERANCE &&
            point.y <= Math.max(a.y, b.y) + DrawingSelection.POINT_DISTANCE_TOLERANCE;
    }

    private static intersections(a : IPoint2, b : IPoint2, c : IPoint2, d : IPoint2) : readonly number[] {
        const rx = b.x - a.x;
        const ry = b.y - a.y;
        const sx = d.x - c.x;
        const sy = d.y - c.y;
        const denominator = (rx * sy) - (ry * sx);
        if (Math.abs(denominator) <= DrawingSelection.PARALLEL_CROSS_PRODUCT_TOLERANCE) {
            const length = (rx * rx) + (ry * ry);
            if (length === 0) {
                return DrawingSelection.onSegment(a, c, d) ? [0] : [];
            }
            const hits = [c, d].filter((point) => DrawingSelection.onSegment(point, a, b)).map((point) =>
                (((point.x - a.x) * rx) + ((point.y - a.y) * ry)) / length);
            if (DrawingSelection.onSegment(a, c, d)) {
                hits.push(0);
            }
            if (DrawingSelection.onSegment(b, c, d)) {
                hits.push(1);
            }
            return hits;
        }
        const t = (((c.x - a.x) * sy) - ((c.y - a.y) * sx)) / denominator;
        const u = (((c.x - a.x) * ry) - ((c.y - a.y) * rx)) / denominator;
        return t >= -DrawingSelection.SEGMENT_PARAMETER_TOLERANCE &&
            t <= 1 + DrawingSelection.SEGMENT_PARAMETER_TOLERANCE &&
            u >= -DrawingSelection.SEGMENT_PARAMETER_TOLERANCE &&
            u <= 1 + DrawingSelection.SEGMENT_PARAMETER_TOLERANCE ?
            [Math.max(0, Math.min(1, t))] : [];
    }

    private static hasArea(region : readonly IPoint2[]) : boolean {
        const a = region[0];
        if (a === undefined) {
            return false;
        }
        const b = region.find((point) =>
            Math.hypot(point.x - a.x, point.y - a.y) > DrawingSelection.POINT_DISTANCE_TOLERANCE);
        return b !== undefined && region.some((point) =>
            Math.abs(((b.x - a.x) * (point.y - a.y)) - ((b.y - a.y) * (point.x - a.x))) >
                DrawingSelection.MIN_REGION_CROSS_PRODUCT);
    }
}
