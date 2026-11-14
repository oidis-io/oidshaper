/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { DrawingShapes, DrawingSelection, SelectionOperation } from "@oidis-io/oidshaper";

import type {
    DrawingArea, Viewport, IVector3, IDrawingPath, IDrawing, IPoint2, SelectionMode
} from "@oidis-io/oidshaper";

interface IDrawingPaint {
    (drawing : IDrawing) : void;
}

interface IEditorAction {
    () : void;
}

interface IVertexDrag {
    readonly pointer : number;
    readonly vertex : number;
    readonly original : IDrawingPath;
    points : readonly IVector3[];
}

export class VertexEditor {
    private static readonly PICK_RADIUS_PIXELS : number = 10;

    private readonly listeners : AbortController;
    private readonly handles : HTMLDivElement;
    private selected : number;
    private readonly selection : Set<number>;
    private vertex : number;
    private drag? : IVertexDrag;
    private enabled : boolean;

    private readonly area : DrawingArea;
    private readonly view : Viewport;
    private readonly list : HTMLSelectElement;
    private readonly snap : HTMLInputElement;
    private readonly status : HTMLElement;
    private readonly paint : IDrawingPaint;
    private readonly changed : IEditorAction;

    constructor(area : DrawingArea, view : Viewport, list : HTMLSelectElement, snap : HTMLInputElement,
        status : HTMLElement, paint : IDrawingPaint, changed : IEditorAction) {
        this.listeners = new AbortController();
        this.handles = document.createElement("div");
        this.selected = -1;
        this.selection = new Set<number>();
        this.vertex = 0;
        this.enabled = false;
        this.area = area;
        this.view = view;
        this.list = list;
        this.snap = snap;
        this.status = status;
        this.paint = paint;
        this.changed = changed;
        this.handles.className = "vertex-handles";
        document.body.append(this.handles);
        const options = {signal: this.listeners.signal};
        list.addEventListener("change", () => {
            this.setSelection([Number(list.value)]);
        }, options);
        document.querySelector("#delete-path")?.addEventListener("click", () => {
            this.apply(() => {
                this.area.RemovePaths([...this.selection]);
                this.selection.clear();
                this.selected = -1;
            });
        }, options);
        document.querySelector("#delete-vertex")?.addEventListener("click", () => {
            this.apply(() => {
                const path = this.area.getDrawing().paths[this.selected];
                if (path !== undefined) {
                    this.area.EditVertices(this.selected, path.points.filter((_, index) => index !== this.vertex));
                    this.vertex = 0;
                }
            });
        }, options);
        document.querySelector("#insert-vertex")?.addEventListener("click", () => {
            this.apply(() => {
                const path = this.area.getDrawing().paths[this.selected];
                if (path === undefined) {
                    return;
                }
                const a = path.points[this.vertex];
                const b = path.points[(this.vertex + 1) % path.points.length];
                if (a === undefined || b === undefined || (!path.closed && this.vertex === path.points.length - 1)) {
                    throw new Error("Select a vertex with a following edge.");
                }
                const points = [...path.points];
                points.splice(this.vertex + 1, 0, {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2});
                this.area.EditVertices(this.selected, points);
                this.vertex++;
            });
        }, options);
        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                if (this.drag !== undefined) {
                    this.Cancel();
                } else {
                    this.setSelection([]);
                }
            }
        }, options);
    }

    public setEnabled(enabled : boolean) : void {
        this.Cancel();
        this.enabled = enabled;
        this.Refresh();
    }

    public Select(clientX : number, clientY : number,
        operation : SelectionOperation = SelectionOperation.REPLACE) : void {
        let closest : number = VertexEditor.PICK_RADIUS_PIXELS;
        this.selected = -1;
        this.area.getDrawing().paths.forEach((path, index) => {
            if (!this.area.getLayerVisible(path.layer)) {
                return;
            }
            for (let vertex = 0; vertex < path.points.length; vertex++) {
                const a = path.points[vertex];
                const b = path.points[(vertex + 1) % path.points.length];
                if (a === undefined || b === undefined || (!path.closed && vertex === path.points.length - 1)) {
                    continue;
                }
                const start = this.view.ProjectPoint(a);
                const end = this.view.ProjectPoint(b);
                if (start === null || end === null) {
                    continue;
                }
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                const length = (dx * dx) + (dy * dy);
                const t = length === 0 ? 0 : Math.max(0, Math.min(1,
                    (((clientX - start.x) * dx) + ((clientY - start.y) * dy)) / length));
                const distance = Math.hypot(clientX - start.x - (t * dx), clientY - start.y - (t * dy));
                if (distance < closest) {
                    closest = distance;
                    this.selected = index;
                    this.vertex = vertex;
                }
            }
        });
        this.setSelection(this.selected < 0 ? [] : [this.selected], operation);
    }

    public SelectRegion(region : readonly IPoint2[], mode : SelectionMode, operation : SelectionOperation) : void {
        const selected : number[] = [];
        this.area.getDrawing().paths.forEach((path, index) => {
            if (!this.area.getLayerVisible(path.layer)) {
                return;
            }
            const projected = path.points.map((point) => this.view.ProjectPoint(point));
            if (projected.some((point) => point === null)) {
                return;
            }
            const points = projected.filter((point) => point !== null);
            if (DrawingSelection.PathInSelection(points, region, mode, path.closed, path.filled ?? false)) {
                selected.push(index);
            }
        });
        this.setSelection(selected, operation);
    }

    public setSelection(indices : readonly number[],
        operation : SelectionOperation = SelectionOperation.REPLACE) : void {
        this.Cancel();
        if (operation === SelectionOperation.REPLACE) {
            this.selection.clear();
        }
        for (const index of indices) {
            const path = this.area.getDrawing().paths[index];
            if (path !== undefined && this.area.getLayerVisible(path.layer)) {
                if (operation === SelectionOperation.REMOVE) {
                    this.selection.delete(index);
                } else {
                    this.selection.add(index);
                }
            }
        }
        this.vertex = 0;
        this.Refresh();
    }

    public Refresh() : void {
        this.Cancel();
        this.list.replaceChildren(new Option("Select a shape", "-1"));
        this.area.getDrawing().paths.forEach((path, index) => {
            if (this.area.getLayerVisible(path.layer)) {
                this.list.add(new Option(`${String(index + 1)} · ${path.layer} · ${path.curve ? "curve" : "polyline"}`,
                    String(index)));
            }
        });
        for (const index of this.selection) {
            const path = this.area.getDrawing().paths[index];
            if (path === undefined || !this.area.getLayerVisible(path.layer)) {
                this.selection.delete(index);
            }
        }
        this.selected = this.selection.size === 1 ? [...this.selection][0] ?? -1 : -1;
        const count = document.querySelector("#selection-count");
        if (count !== null) {
            count.textContent = `${String(this.selection.size)} selected`;
        }
        this.list.value = String(this.selected);
        if (this.list.selectedIndex < 0) {
            this.selected = -1;
            this.list.value = "-1";
        }
        this.handles.replaceChildren();
        const drawing = this.area.getVisibleDrawing();
        const selected = new Set([...this.selection].map((index) => this.area.getDrawing().paths[index]));
        this.paint({...drawing, paths: drawing.paths.map((path) =>
            this.enabled && selected.has(path) ? {...path, colour: 0xffbb33} : path)});
        const path = this.area.getDrawing().paths[this.selected];
        if (!this.enabled || path === undefined) {
            return;
        }
        if (path.curve !== undefined) {
            this.status.textContent = "Curve selected. Vertex editing applies to polylines; curves stay analytic.";
            return;
        }
        path.points.forEach((_, index) => {
            const handle = document.createElement("button");
            handle.type = "button";
            handle.className = "vertex-handle";
            handle.setAttribute("aria-label", `Vertex ${String(index + 1)}`);
            handle.setAttribute("aria-pressed", String(index === this.vertex));
            handle.addEventListener("pointerdown", (event) => {
                if (event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                this.vertex = index;
                this.drag = {pointer: event.pointerId, vertex: index, original: path, points: path.points};
                handle.setPointerCapture(event.pointerId);
                this.handles.querySelectorAll("button").forEach((button) => {
                    button.setAttribute("aria-pressed", String(button === handle));
                });
            });
            handle.addEventListener("pointermove", (event) => {
                this.move(event);
            });
            handle.addEventListener("pointerup", (event) => {
                const drag = this.drag;
                if (drag?.pointer === event.pointerId) {
                    delete this.drag;
                    this.apply(() => {
                        this.area.EditVertices(this.selected, drag.points);
                    });
                }
            });
            handle.addEventListener("pointercancel", () => {
                this.Cancel();
            });
            handle.addEventListener("lostpointercapture", () => {
                this.Cancel();
            });
            this.handles.append(handle);
        });
        this.Position();
    }

    public Position() : void {
        const points = this.drag?.points ?? this.area.getDrawing().paths[this.selected]?.points ?? [];
        this.handles.querySelectorAll<HTMLButtonElement>("button").forEach((handle, index) => {
            const point = points[index];
            const screen = point === undefined ? null : this.view.ProjectPoint(point);
            handle.hidden = screen === null;
            if (screen !== null) {
                handle.style.left = `${String(screen.x)}px`;
                handle.style.top = `${String(screen.y)}px`;
            }
        });
    }

    public Cancel() : void {
        if (this.drag !== undefined) {
            delete this.drag;
            this.paint(this.area.getVisibleDrawing());
            this.Position();
        }
    }

    public Dispose() : void {
        this.listeners.abort();
        this.handles.remove();
        delete this.drag;
    }

    private move(event : PointerEvent) : void {
        const drag = this.drag;
        const original = drag?.original.points[drag.vertex];
        if (drag?.pointer !== event.pointerId || original === undefined) {
            return;
        }
        const hit = this.view.PickPlane(event.clientX, event.clientY, original.z);
        if (hit === null) {
            return;
        }
        try {
            const point = DrawingShapes.SnapDrawingPoint(hit, Number(this.snap.value));
            drag.points = drag.original.points.map((value, index) => index === drag.vertex ? point : value);
            const drawing = this.area.getVisibleDrawing();
            this.paint({...drawing, paths: drawing.paths.map((path) =>
                path === drag.original ? {...path, points: drag.points, colour: 0xffbb33} : path)});
            this.Position();
        } catch (error : unknown) {
            this.status.textContent = String(error);
        }
    }

    private apply(action : IEditorAction) : void {
        this.Cancel();
        try {
            action();
            this.changed();
        } catch (error : unknown) {
            this.status.textContent = String(error);
        }
    }
}
