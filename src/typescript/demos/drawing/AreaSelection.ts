/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { SelectionMode, SelectionOperation } from "@oidis-io/oidshaper";

import type { IPoint2 } from "@oidis-io/oidshaper";

export interface ISelectionController {
    Select(x : number, y : number, operation : SelectionOperation) : void;
    SelectRegion(region : readonly IPoint2[], mode : SelectionMode, operation : SelectionOperation) : void;
}

interface ISelectionDrag {
    readonly pointer : number;
    readonly start : IPoint2;
    readonly operation : SelectionOperation;
    readonly lasso : boolean;
    points : IPoint2[];
    end : IPoint2;
    mode : SelectionMode | null;
    moved : boolean;
}

export class AreaSelection {
    private static readonly DRAG_THRESHOLD_PIXELS : number = 4;
    private static readonly LASSO_POINT_SPACING_PIXELS : number = 3;
    private static readonly MAX_LASSO_POINTS : number = 2048;

    private readonly listeners : AbortController;
    private readonly overlay : SVGSVGElement;
    private readonly outline : SVGPolygonElement;
    private drag? : ISelectionDrag;
    private readonly canvas : HTMLCanvasElement;
    private space : boolean;

    constructor(canvas : HTMLCanvasElement, editor : ISelectionController,
        tool : HTMLSelectElement, shape : HTMLSelectElement) {
        this.listeners = new AbortController();
        this.overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        this.outline = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        this.space = false;
        this.canvas = canvas;
        this.overlay.classList.add("area-selection");
        this.overlay.setAttribute("aria-hidden", "true");
        this.overlay.append(this.outline);
        this.overlay.style.display = "none";
        document.body.append(this.overlay);
        const options = {capture: true, signal: this.listeners.signal};
        canvas.addEventListener("pointerdown", (event) => {
            if (tool.value !== "edit" || event.button !== 0 || event.altKey || this.space) {
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            this.Cancel();
            const start = {x: event.clientX, y: event.clientY};
            this.drag = {pointer: event.pointerId, start, end: start, points: [start], mode: null,
                moved: false, lasso: shape.value === "lasso",
                operation: event.ctrlKey || event.metaKey ? SelectionOperation.REMOVE :
                    event.shiftKey ? SelectionOperation.ADD : SelectionOperation.REPLACE};
            canvas.setPointerCapture(event.pointerId);
        }, options);
        canvas.addEventListener("pointermove", (event) => {
            if (this.drag?.pointer !== event.pointerId) {
                return;
            }
            event.stopImmediatePropagation();
            this.update(event);
        }, options);
        canvas.addEventListener("pointerup", (event) => {
            const drag = this.drag;
            if (drag?.pointer !== event.pointerId) {
                return;
            }
            event.stopImmediatePropagation();
            this.update(event);
            const region = this.region(drag);
            this.Cancel();
            if (!drag.moved) {
                editor.Select(event.clientX, event.clientY, drag.operation);
                return;
            }
            editor.SelectRegion(region, drag.mode ?? SelectionMode.WINDOW, drag.operation);
        }, options);
        canvas.addEventListener("click", (event) => {
            if (tool.value === "edit") {
                event.stopImmediatePropagation();
            }
        }, options);
        for (const name of ["pointercancel", "lostpointercapture", "wheel"]) {
            canvas.addEventListener(name, () => {
                this.Cancel();
            }, options);
        }
        tool.addEventListener("change", () => {
            this.Cancel();
        }, options);
        shape.addEventListener("change", () => {
            this.Cancel();
        }, options);
        window.addEventListener("keydown", (event) => {
            if (event.code === "Space") {
                this.space = true;
            }
            if (event.key === "Escape") {
                this.Cancel();
            }
        }, options);
        window.addEventListener("keyup", (event) => {
            if (event.code === "Space") {
                this.space = false;
            }
        }, options);
        window.addEventListener("blur", () => {
            this.space = false;
            this.Cancel();
        }, options);
    }

    public Cancel() : void {
        const pointer = this.drag?.pointer;
        delete this.drag;
        this.overlay.style.display = "none";
        if (pointer !== undefined && this.canvas.hasPointerCapture(pointer)) {
            this.canvas.releasePointerCapture(pointer);
        }
    }

    public Dispose() : void {
        this.Cancel();
        this.listeners.abort();
        this.overlay.remove();
    }

    private update(event : PointerEvent) : void {
        const drag = this.drag;
        if (drag === undefined) {
            return;
        }
        drag.end = {x: event.clientX, y: event.clientY};
        drag.moved ||= Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y) >
            AreaSelection.DRAG_THRESHOLD_PIXELS;
        if (!drag.moved) {
            return;
        }
        const dx = drag.end.x - drag.start.x;
        if (!drag.lasso || (drag.mode === null && Math.abs(dx) > AreaSelection.DRAG_THRESHOLD_PIXELS)) {
            drag.mode = dx < 0 ? SelectionMode.CROSSING : SelectionMode.WINDOW;
        }
        const previous = drag.points.at(-1) ?? drag.start;
        if (Math.hypot(drag.end.x - previous.x, drag.end.y - previous.y) >= AreaSelection.LASSO_POINT_SPACING_PIXELS) {
            drag.points.push(drag.end);
            if (drag.points.length > AreaSelection.MAX_LASSO_POINTS) {
                drag.points = drag.points.filter((_, index) => index % 2 === 0);
            }
        }
        this.overlay.style.display = "block";
        this.overlay.dataset["mode"] = drag.mode ?? SelectionMode.WINDOW;
        this.outline.setAttribute("points", this.region(drag).map((point) => `${String(point.x)},${String(point.y)}`)
            .join(" "));
    }

    private region(drag : ISelectionDrag) : readonly IPoint2[] {
        return drag.lasso ? [...drag.points, drag.end] : [drag.start,
            {x: drag.end.x, y: drag.start.y}, drag.end, {x: drag.start.x, y: drag.end.y}];
    }
}
