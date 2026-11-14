/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { DrawingShapes } from "./DrawingShapes.js";

import type { IDrawing, IDrawingPath } from "./IDrawing.js";
import type { IVector3 } from "./LocalOrigin.js";

export interface IDrawingBounds {
    readonly centre : IVector3;
    readonly radius : number;
}

interface IDrawingExtent {
    x : number;
    y : number;
    z : number;
}

interface IDrawingHistory {
    readonly drawing : IDrawing;
    readonly hidden : readonly string[];
}

export class DrawingArea {
    private static readonly HISTORY_STEP_LIMIT : number = 50;
    private static readonly DEFAULT_SNAP_SPACING : number = 0;
    private static readonly MIN_CLOSED_POINTS : number = 3;
    private static readonly MIN_OPEN_POINTS : number = 2;

    private drawing : IDrawing = {paths: [], warnings: []};
    private pending : IVector3[] = [];
    private readonly undo : IDrawingHistory[] = [];
    private readonly redo : IDrawingHistory[] = [];
    private readonly pendingRedo : IVector3[] = [];
    private readonly hidden  = new Set<string>();

    public getDrawing() : IDrawing {
        return this.drawing;
    }

    public getVisibleDrawing() : IDrawing {
        const paths = this.drawing.paths.filter((path) => !this.hidden.has(path.layer));
        if (this.pending.length > 0 && !this.hidden.has("drawing")) {
            paths.push({layer: "drawing", points: this.pending, closed: false});
        }
        return {...this.drawing, paths, ...(this.drawing.labels === undefined ? {} :
            {labels: this.drawing.labels.filter((label) => !this.hidden.has(label.layer))})};
    }

    public getLayers() : readonly string[] {
        return [...new Set([...this.drawing.paths.map((path) => path.layer),
            ...(this.drawing.labels ?? []).map((label) => label.layer)])].sort();
    }

    public getLayerVisible(layer : string) : boolean {
        return !this.hidden.has(layer);
    }

    public setLayerVisible(layer : string, visible : boolean) : void {
        if (visible) {
            this.hidden.delete(layer);
        } else {
            this.hidden.add(layer);
        }
    }

    public Replace(drawing : IDrawing) : void {
        this.remember();
        this.drawing = structuredClone(drawing);
        this.Cancel();
        this.hidden.clear();
    }

    public AddPoint(point : IVector3, snap : number = DrawingArea.DEFAULT_SNAP_SPACING) : void {
        const value : IVector3 = DrawingShapes.SnapDrawingPoint(point, snap);
        const last : IVector3 | undefined = this.pending.at(-1);
        if (last?.x !== value.x || last.y !== value.y || last.z !== value.z) {
            this.pending = [...this.pending, value];
            this.pendingRedo.length = 0;
            this.redo.length = 0;
        }
    }

    public Finish(closed : boolean = false) : boolean {
        if (this.pending.length < (closed ? DrawingArea.MIN_CLOSED_POINTS : DrawingArea.MIN_OPEN_POINTS)) {
            return false;
        }
        this.remember();
        const path : IDrawingPath = {layer: "drawing", points: this.pending, closed};
        this.drawing = {...this.drawing, paths: [...this.drawing.paths, path]};
        this.Cancel();
        return true;
    }

    public AddPath(path : IDrawingPath) : void {
        if (path.points.length < (path.closed ? DrawingArea.MIN_CLOSED_POINTS : DrawingArea.MIN_OPEN_POINTS) ||
            path.points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))) {
            throw new RangeError("A path needs finite vertices and sufficient points.");
        }
        this.remember();
        this.drawing = {...this.drawing, paths: [...this.drawing.paths, structuredClone(path)]};
        this.Cancel();
    }

    public EditVertices(index : number, points : readonly IVector3[]) : void {
        const path = this.drawing.paths[index];
        if (path === undefined || path.curve !== undefined) {
            throw new Error("Select a polyline before editing vertices.");
        }
        if (points.length < (path.closed ? DrawingArea.MIN_CLOSED_POINTS : DrawingArea.MIN_OPEN_POINTS) ||
            points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))) {
            throw new RangeError("A path needs finite vertices and sufficient points.");
        }
        if (points.length === path.points.length && points.every((point, vertex) =>
            point.x === path.points[vertex]?.x && point.y === path.points[vertex].y &&
            point.z === path.points[vertex].z)) {
            return;
        }
        this.remember();
        this.drawing = {...this.drawing, paths: this.drawing.paths.map((item, position) =>
            position === index ? {...path, points: structuredClone(points)} : item)};
        this.Cancel();
    }

    public RemovePath(index : number) : void {
        this.RemovePaths([index]);
    }

    public RemovePaths(indices : readonly number[]) : void {
        const selected = new Set(indices);
        if ([...selected].some((index) => !Number.isInteger(index) || this.drawing.paths[index] === undefined)) {
            throw new RangeError("Unknown drawing path.");
        }
        if (selected.size === 0) {
            return;
        }
        this.remember();
        this.drawing = {...this.drawing, paths: this.drawing.paths.filter((_, position) => !selected.has(position))};
        this.Cancel();
    }

    public Cancel() : void {
        this.pending = [];
        this.pendingRedo.length = 0;
    }

    public Undo() : void {
        if (this.pending.length > 0) {
            const point = this.pending.at(-1);
            if (point !== undefined) {
                this.pendingRedo.push(point);
            }
            this.pending = this.pending.slice(0, -1);
            return;
        }
        const previous : IDrawingHistory | undefined = this.undo.pop();
        if (previous !== undefined) {
            this.pendingRedo.length = 0;
            this.redo.push(this.snapshot());
            this.restore(previous);
        }
    }

    public Redo() : void {
        const point = this.pendingRedo.pop();
        if (point !== undefined) {
            this.pending = [...this.pending, point];
            return;
        }
        const next : IDrawingHistory | undefined = this.redo.pop();
        if (next !== undefined) {
            this.undo.push(this.snapshot());
            this.restore(next);
            this.Cancel();
        }
    }

    public getBounds() : IDrawingBounds | null {
        const minimum = {x: Infinity, y: Infinity, z: Infinity};
        const maximum = {x: -Infinity, y: -Infinity, z: -Infinity};

        this.drawing.paths.forEach((path) => {
            path.points.forEach((point) => {
                this.includeBounds(minimum, maximum, point);
            });
        });
        this.drawing.labels?.forEach((label) => {
            this.includeBounds(minimum, maximum, label.position);
        });
        if (!Number.isFinite(minimum.x)) {
            return null;
        }
        return {centre: {x: (minimum.x + maximum.x) / 2, y: (minimum.y + maximum.y) / 2,
            z: (minimum.z + maximum.z) / 2},
        radius: Math.hypot(maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z) / 2};
    }

    private includeBounds(minimum : IDrawingExtent, maximum : IDrawingExtent, point : IVector3) : void {
        minimum.x = Math.min(minimum.x, point.x);
        minimum.y = Math.min(minimum.y, point.y);
        minimum.z = Math.min(minimum.z, point.z);
        maximum.x = Math.max(maximum.x, point.x);
        maximum.y = Math.max(maximum.y, point.y);
        maximum.z = Math.max(maximum.z, point.z);
    }

    private snapshot() : IDrawingHistory {
        return {drawing: this.drawing, hidden: [...this.hidden]};
    }

    private restore(state : IDrawingHistory) : void {
        this.drawing = state.drawing;
        this.hidden.clear();
        state.hidden.forEach((layer) => this.hidden.add(layer));
    }

    private remember() : void {
        this.undo.push(this.snapshot());
        if (this.undo.length > DrawingArea.HISTORY_STEP_LIMIT) {
            this.undo.shift();
        }
        this.redo.length = 0;
    }
}
