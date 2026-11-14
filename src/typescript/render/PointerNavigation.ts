/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { Vector2 } from "three";
import { NavigationAction, PointerKind } from "../core/NavigationPreset.js";

import type { Vector3 } from "three";
import type { NavigationPreset } from "../core/NavigationPreset.js";
import type { ViewCamera } from "./ViewCamera.js";

export interface INavigationHost {
    Pick(ndc : Vector2) : Vector3 | null;

    Changed() : void;

    ShowPivot(pivot : Vector3 | null) : void;
}

interface IDrag {
    readonly pointerId : number;
    readonly action : NavigationAction;
    /** Orbit pivot or grabbed point. */
    readonly anchor : Vector3;
    x : number;
    y : number;
}

export class PointerNavigation {
    private static readonly ORBIT_SPEED : number = 0.006; // rad per CSS pixel
    private static readonly ZOOM_SPEED : number = 0.0015; // ln of the zoom factor per wheel pixel
    private static readonly LINE_HEIGHT : number = 16;
    private static readonly PAGE_HEIGHT : number = 800;
    private readonly canvas : HTMLCanvasElement;
    private readonly view : ViewCamera;
    private readonly host : INavigationHost;
    private readonly listeners : AbortController = new AbortController();
    private preset : NavigationPreset;
    private drag? : IDrag;
    private space : boolean = false;

    private static pointerOf(event : PointerEvent) : PointerKind | null {
        if (event.pointerType === "touch") {
            return event.isPrimary ? PointerKind.TOUCH : null;
        }
        switch (event.button) {
            case 0:
                return PointerKind.LEFT;
            case 1:
                return PointerKind.MIDDLE;
            case 2:
                return PointerKind.RIGHT;
            default:
                return null;
        }
    }

    private static wheelPixels(event : WheelEvent) : number {
        switch (event.deltaMode) {
            case WheelEvent.DOM_DELTA_LINE:
                return event.deltaY * PointerNavigation.LINE_HEIGHT;
            case WheelEvent.DOM_DELTA_PAGE:
                return event.deltaY * PointerNavigation.PAGE_HEIGHT;
            default:
                return event.deltaY;
        }
    }

    constructor(canvas : HTMLCanvasElement, view : ViewCamera, preset : NavigationPreset, host : INavigationHost) {
        this.canvas = canvas;
        this.view = view;
        this.preset = preset;
        this.host = host;
        // Touch drags would scroll the page.
        canvas.style.touchAction = "none";

        const signal : AbortSignal = this.listeners.signal;
        canvas.addEventListener("pointerdown", (event) => {
            this.onPointerDown(event);
        }, {signal});
        canvas.addEventListener("pointermove", (event) => {
            this.onPointerMove(event);
        }, {signal});
        canvas.addEventListener("pointerup", (event) => {
            this.onPointerUp(event);
        }, {signal});
        canvas.addEventListener("pointercancel", (event) => {
            this.onPointerUp(event);
        }, {signal});
        canvas.addEventListener("wheel", (event) => {
            this.onWheel(event);
        }, {signal, passive: false});
        canvas.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        }, {signal});
        window.addEventListener("keydown", (event) => {
            this.onKey(event, true);
        }, {signal});
        window.addEventListener("keyup", (event) => {
            this.onKey(event, false);
        }, {signal});
        window.addEventListener("blur", () => {
            this.space = false;
        }, {signal});
    }

    public setPreset(preset : NavigationPreset) : void {
        this.end();
        this.preset = preset;
    }

    public Dispose() : void {
        this.end();
        this.listeners.abort();
    }

    private onPointerDown(event : PointerEvent) : void {
        const pointer : PointerKind | null = PointerNavigation.pointerOf(event);
        if (this.drag !== undefined || pointer === null) {
            return;
        }
        const action : NavigationAction | null = this.preset.Match({
            pointer,
            ctrl: event.ctrlKey || event.metaKey,
            alt: event.altKey,
            shift: event.shiftKey,
            space: this.space
        });
        if (action === null) {
            return;
        }
        // Stops middle-button autoscroll and text selection.
        event.preventDefault();
        const ndc : Vector2 = this.toNdc(event);
        const content : Vector3 | null = this.host.Pick(ndc);
        let anchor : Vector3;
        if (content !== null) {
            anchor = content;
        } else {
            anchor = action === NavigationAction.ORBIT ? this.view.getTarget() : this.view.PointOnTargetPlane(ndc);
        }
        this.canvas.setPointerCapture(event.pointerId);
        this.drag = {pointerId: event.pointerId, action, anchor, x: event.clientX, y: event.clientY};
        if (action === NavigationAction.ORBIT) {
            this.host.ShowPivot(anchor);
            this.host.Changed();
        }
    }

    private onPointerMove(event : PointerEvent) : void {
        const drag : IDrag | undefined = this.drag;
        if (drag?.pointerId !== event.pointerId) {
            return;
        }
        const dx : number = event.clientX - drag.x;
        const dy : number = event.clientY - drag.y;
        drag.x = event.clientX;
        drag.y = event.clientY;
        if (drag.action === NavigationAction.ORBIT) {
            // The scene follows the pointer.
            this.view.Orbit(drag.anchor, -dx * PointerNavigation.ORBIT_SPEED, -dy * PointerNavigation.ORBIT_SPEED);
        } else {
            this.view.Pan(drag.anchor, this.toNdc(event));
        }
        this.host.Changed();
    }

    private onPointerUp(event : PointerEvent) : void {
        if (this.drag?.pointerId === event.pointerId) {
            this.end();
        }
    }

    private onWheel(event : WheelEvent) : void {
        event.preventDefault();
        const ndc : Vector2 = this.toNdc(event);
        const point : Vector3 = this.host.Pick(ndc) ?? this.view.PointOnTargetPlane(ndc);
        // Exponential, so zooming back returns to the same view.
        this.view.Zoom(point, Math.exp(PointerNavigation.wheelPixels(event) * PointerNavigation.ZOOM_SPEED));
        this.host.Changed();
    }

    private onKey(event : KeyboardEvent, down : boolean) : void {
        if (event.code !== "Space") {
            return;
        }
        this.space = down;
        // Space would scroll the page; form controls keep it.
        if (event.target === document.body || event.target === this.canvas) {
            event.preventDefault();
        }
    }

    private end() : void {
        if (this.drag === undefined) {
            return;
        }
        if (this.canvas.hasPointerCapture(this.drag.pointerId)) {
            this.canvas.releasePointerCapture(this.drag.pointerId);
        }
        delete this.drag;
        this.host.ShowPivot(null);
        this.host.Changed();
    }

    private toNdc(event : MouseEvent) : Vector2 {
        const rect : DOMRect = this.canvas.getBoundingClientRect();
        return new Vector2(
            (((event.clientX - rect.left) / rect.width) * 2) - 1,
            1 - (((event.clientY - rect.top) / rect.height) * 2)
        );
    }
}
