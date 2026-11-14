/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { WorkingPlane } from "../core/WorkingPlane.js";
import { EntityTransforms } from "../core/entities/EntityTransform.js";
import { ActiveCursor, TransformCursor, CursorOperation } from "./TransformCursor.js";

import type { IVector3 } from "../core/LocalOrigin.js";
import type { IDrawing } from "../core/IDrawing.js";
import type { IPoint2 } from "../core/DrawingSelection.js";
import type { EntityDocument } from "../core/entities/EntityDocument.js";
import type { EntityTransform } from "../core/entities/EntityTransform.js";

export enum TransformMode {
    MOVE = "move",
    ROTATE = "rotate",
    SCALE = "scale"
}

export interface IGripTarget {
    readonly entity : string;
    readonly grip : string;
}

export interface ITransformGizmoView {
    ProjectPoint(point : IVector3) : IVector3 | null;
    PickAxis(x : number, y : number, pivot : IVector3, axis : IVector3) : number | null;
    PickWorkingPlane(x : number, y : number, plane : WorkingPlane) : IVector3 | null;
    setDrawing(drawing : IDrawing) : void;
}

export interface ITransformGizmoOptions {
    /** Receives wheel and non-primary presses started over a handle, typically the navigation canvas. */
    readonly navigationTarget? : HTMLElement;
    IsNavigationGesture?(event : PointerEvent) : boolean;
    GridStep() : number;
    Changed() : void;
    Error(error : unknown) : void;
    Previewed?(position : IVector3 | null) : void;
}

enum AxisName {
    X = "x",
    Y = "y",
    Z = "z"
}

interface IJacobian {
    readonly scale : number;
    readonly normal : IVector3 | null;
}

enum PlaneName {
    XY = "xy",
    XZ = "xz",
    YZ = "yz"
}

enum HandleKind {
    AXIS = "axis",
    PLANE = "plane",
    CENTRE = "centre"
}

enum HandleState {
    NONE = "",
    HOVER = "hover",
    ACTIVE = "active",
    INACTIVE = "inactive"
}

interface IHandle {
    readonly kind : HandleKind;
    readonly name : string;
    readonly axis : IVector3;
    readonly element : SVGGElement;
    readonly shape : SVGPolygonElement;
    readonly line : SVGPolylineElement;
    readonly hit : SVGPolylineElement;
    readonly label : SVGTextElement;
    readonly guide : SVGLineElement;
    angle : number | null;
}

interface ICommitAction {
    () : void;
}

interface IDrag {
    readonly handle : IHandle;
    readonly pointer : number;
    readonly x : number;
    readonly y : number;
    readonly start : number;
    readonly anchor : IVector3 | null;
    readonly plane : WorkingPlane | null;
    readonly size : number;
    readonly revision : number;
    readonly ids : readonly string[];
    moved : boolean;
    commit? : ICommitAction;
    angle : number;
    previous : number;
}

/** World-axis transforms and single-grip edits share atomic preview/commit handling. */
export class EntityTransformGizmo {

    // Sizes in CSS px; the gizmo keeps its screen size while zooming.
    public static readonly GIZMO_AXIS_PX : number = 96;
    public static readonly GIZMO_PLANE_PX : number = 36;
    public static readonly GIZMO_PLANE_SHOW_PX : number = 56;
    public static readonly GIZMO_PLANE_HIDE_PX : number = 72;
    private static readonly SCALE_HALF_SIZE_PX : number = 5;
    private static readonly JACOBIAN_DISCRIMINANT_FACTOR : number = 4;
    private static readonly SCALE_CORNERS : ReadonlyArray<readonly [number, number]> =
        [[-EntityTransformGizmo.SCALE_HALF_SIZE_PX, -EntityTransformGizmo.SCALE_HALF_SIZE_PX],
            [EntityTransformGizmo.SCALE_HALF_SIZE_PX, -EntityTransformGizmo.SCALE_HALF_SIZE_PX],
            [EntityTransformGizmo.SCALE_HALF_SIZE_PX, EntityTransformGizmo.SCALE_HALF_SIZE_PX],
            [-EntityTransformGizmo.SCALE_HALF_SIZE_PX, EntityTransformGizmo.SCALE_HALF_SIZE_PX]];
    private static readonly MIN_SCREEN_SCALE : number = 1e-9;
    private static readonly MIN_NORMAL_LENGTH : number = 1e-12;
    private static readonly MIN_ROTATION_RADIUS : number = 1e-6;
    private static readonly VIEW_PLANE_POLE_THRESHOLD : number = 0.9;
    private static readonly MIN_SCALE_FACTOR : number = 0.01;
    private static readonly MIN_ROTATION_LENGTH_PX : number = 12;
    private static readonly ROTATION_SEGMENTS : number = 64;
    private static readonly GUIDE_REACH_PX : number = 4000;
    private static readonly PLANE_HIDE_MARGIN_PX : number = 16;
    private static readonly PLANE_SHOW_MARGIN_PX : number = 4;
    private static readonly PLANE_CORNERS : number = 4;
    private static readonly AXIS_LABEL_DISTANCE_PX : number = 12;
    private static readonly ARROW_LENGTH_PX : number = 11;
    private static readonly AXIS_HIT_START_PX : number = 10;
    private static readonly ARROW_HALF_WIDTH_PX : number = 5;
    private static readonly LABEL_OFFSET_PX : number = 4;
    private static readonly CENTRE_LABEL_X_PX : number = 14;
    private static readonly CENTRE_LABEL_Y_PX : number = 12;
    private static readonly CENTRE_HIT_HALF_SIZE_PX : number = 10;
    private static readonly CENTRE_HALF_SIZE_PX : number = 7;
    private static readonly DRAG_PX : number = 3;
    // Axes and planes closer than about 15° to the view ray cannot be dragged reliably.
    private static readonly FORESHORTENED : number = 0.25;
    private static readonly SVG = <const>"http://www.w3.org/2000/svg";
    private static readonly AXES : ReadonlyArray<readonly [AxisName, IVector3]> = [
        [AxisName.X, {x: 1, y: 0, z: 0}], [AxisName.Y, {x: 0, y: 1, z: 0}], [AxisName.Z, {x: 0, y: 0, z: 1}]];
    private static readonly PLANES : ReadonlyArray<readonly [PlaneName, AxisName]> = [
        [PlaneName.XY, AxisName.Z], [PlaneName.XZ, AxisName.Y], [PlaneName.YZ, AxisName.X]];

    private readonly scene : EntityDocument;
    private readonly view : ITransformGizmoView;
    private readonly options : ITransformGizmoOptions;
    private readonly root = document.createElement("div");
    private readonly overlay : SVGSVGElement;
    private readonly ghost : SVGCircleElement;
    private readonly handles : IHandle[] = [];
    private readonly cursor = new ActiveCursor();
    private pivot : IVector3 = {x: 0, y: 0, z: 0};
    private previewPivot? : IVector3;
    private drag? : IDrag;
    private enabled : boolean = false;
    private mode? : TransformMode;
    private grip? : IGripTarget;
    private hover? : IHandle;
    private size : number = 1;
    private normal? : IVector3;
    private origin? : IVector3;
    private reach : number = EntityTransformGizmo.GIZMO_PLANE_SHOW_PX;
    private pointer? : IPoint2;
    private planesShown : boolean = false;

    private static snap(value : number, step : number) : number {
        return step > 0 ? Math.round(value / step) * step : value;
    }

    private static svg<K extends keyof SVGElementTagNameMap>(name : K, parent : Element, className : string = "")
        : SVGElementTagNameMap[K] {
        const value = document.createElementNS(EntityTransformGizmo.SVG, name);
        if (className !== "") {
            value.setAttribute("class", className);
        }
        parent.append(value);
        return value;
    }

    private static add(a : IVector3, b : IVector3, scale : number = 1) : IVector3 {
        return {x: a.x + (b.x * scale), y: a.y + (b.y * scale), z: a.z + (b.z * scale)};
    }

    private static points(values : readonly IPoint2[]) : string {
        return values.map((point) => `${String(point.x)},${String(point.y)}`).join(" ");
    }

    private static show(element : SVGElement, visible : boolean) : void {
        element.style.display = visible ? "" : "none";
    }

    constructor(scene : EntityDocument, view : ITransformGizmoView,
        options : ITransformGizmoOptions, parent : HTMLElement) {
        this.scene = scene;
        this.view = view;
        this.options = options;
        this.root.className = "axis-move-gizmo";
        this.overlay = document.createElementNS(EntityTransformGizmo.SVG, "svg");
        this.overlay.classList.add("transform-overlay");
        // Layout and hit areas must not depend on host styles.
        this.root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2;";
        this.overlay.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;" +
            "overflow:visible;touch-action:none;";
        this.root.append(this.overlay);
        parent.append(this.root);
        const guides = EntityTransformGizmo.svg("g", this.overlay, "gizmo-guides");
        this.ghost = EntityTransformGizmo.svg("circle", this.overlay, "gizmo-ghost");
        this.ghost.setAttribute("r", "4");
        for (const [name, normal] of EntityTransformGizmo.PLANES) {
            this.create(HandleKind.PLANE, name,
                EntityTransformGizmo.AXES.find(([axis]) => axis === normal)?.[1] ?? {x: 0, y: 0, z: 1}, guides);
        }
        for (const [name, axis] of EntityTransformGizmo.AXES) {
            this.create(HandleKind.AXIS, name, axis, guides);
        }
        this.create(HandleKind.CENTRE, "view", {x: 0, y: 0, z: 0}, guides);
        this.overlay.addEventListener("wheel", this.wheel, {passive: false});
        window.addEventListener("blur", this.blur);
        window.addEventListener("keydown", this.key, {capture: true});
        window.addEventListener("pointermove", this.track, {capture: true, passive: true});
        document.addEventListener("pointerout", this.leave);
        document.addEventListener("visibilitychange", this.visibility);
        this.root.hidden = true;
    }

    public Refresh(mode : TransformMode | null, grip : IGripTarget | null = null) : void {
        this.Cancel();
        if (grip === null) {
            delete this.grip;
        } else {
            this.grip = grip;
        }
        if (grip !== null) {
            this.mode = TransformMode.MOVE;
        } else if (mode === null) {
            delete this.mode;
        } else {
            this.mode = mode;
        }
        const points = grip === null ? this.scene.getSelection().flatMap((id) =>
            this.scene.getGeometry(id).flatMap((path) => path.points)) : this.scene.getGrips(grip.entity)
            .filter((item) => item.id === grip.grip).map((item) => item.position);
        this.enabled = points.length > 0;
        const centre = {x: 0, y: 0, z: 0};
        if (points.length > 0) {
            for (const axis of [AxisName.X, AxisName.Y, AxisName.Z]) {
                let min = Infinity, max = -Infinity;
                for (const point of points) {
                    min = Math.min(min, point[axis]); max = Math.max(max, point[axis]);
                }
                centre[axis] = (min + max) / 2;
            }
        }
        this.pivot = centre;
        this.Position();
    }

    public Position() : void {
        const pivot = this.previewPivot ?? this.pivot;
        const origin = this.view.ProjectPoint(pivot);
        if (origin === null) {
            delete this.origin;
        } else {
            this.origin = origin;
        }
        this.root.hidden = !this.enabled || origin === null || this.mode === undefined;
        if (origin === null || this.root.hidden) {
            this.setHover(null);
            return;
        }
        this.measure(pivot);
        const size = this.size;
        const moving = this.drag !== undefined && this.mode === TransformMode.MOVE;
        EntityTransformGizmo.show(this.ghost, moving);
        const ghost = moving ? this.view.ProjectPoint(this.pivot) : null;
        if (ghost !== null) {
            this.ghost.setAttribute("cx", String(ghost.x)); this.ghost.setAttribute("cy", String(ghost.y));
        }
        let reach = 0;
        for (const handle of this.handles) {
            const label = this.mode === TransformMode.ROTATE ? "Rotate" :
                this.mode === TransformMode.SCALE ? "Scale" : "Move";
            handle.element.setAttribute("aria-label",
                `${label} ${handle.kind === HandleKind.CENTRE ? "view plane" : handle.name.toUpperCase()}`);
            if (handle.kind === HandleKind.AXIS) {
                this.placeAxis(handle, pivot, origin, size);
            } else if (handle.kind === HandleKind.PLANE) {
                reach = Math.max(reach, this.placePlane(handle, pivot, origin, size));
            } else {
                this.placeCentre(handle, origin);
            }
        }
        this.reach = Math.max(EntityTransformGizmo.GIZMO_PLANE_SHOW_PX, reach +
            EntityTransformGizmo.PLANE_SHOW_MARGIN_PX);
        this.updatePlanes();
        this.updateStates();
    }

    public Cancel() : void {
        if (this.drag !== undefined) {
            this.release(); this.view.setDrawing(this.scene.getDrawing()); this.Position();
            this.options.Previewed?.(null);
        }
    }

    public Dispose() : void {
        this.Cancel(); this.cursor.Clear(); this.root.remove();
        this.overlay.removeEventListener("wheel", this.wheel);
        window.removeEventListener("blur", this.blur);
        window.removeEventListener("keydown", this.key, {capture: true});
        window.removeEventListener("pointermove", this.track, {capture: true});
        document.removeEventListener("pointerout", this.leave);
        document.removeEventListener("visibilitychange", this.visibility);
    }

    private readonly blur = () : void => {
        this.Cancel();
    };
    private readonly visibility = () : void => {
        if (document.hidden) {
            this.Cancel();
        }
    };
    private readonly key = (event : KeyboardEvent) : void => {
        if (event.key === "Escape" && !event.isComposing && this.drag !== undefined) {
            event.preventDefault(); event.stopImmediatePropagation(); this.Cancel();
        }
    };
    private readonly track = (event : PointerEvent) : void => {
        this.pointer = {x: event.clientX, y: event.clientY};
        if (this.drag === undefined) {
            this.updatePlanes();
        }
    };
    private readonly leave = (event : PointerEvent) : void => {
        if (event.relatedTarget === null && this.drag === undefined) {
            delete this.pointer; this.updatePlanes();
        }
    };
    private readonly wheel = (event : WheelEvent) : void => {
        const target = this.options.navigationTarget;
        if (target !== undefined) {
            event.preventDefault(); target.dispatchEvent(new WheelEvent(event.type, event));
        }
    };

    private create(kind : HandleKind, name : string, axis : IVector3, guides : SVGGElement) : void {
        const normal = EntityTransformGizmo.PLANES.find(([plane]) => plane === name)?.[1] ?? AxisName.Z;
        const className = kind === HandleKind.AXIS ? `axis-${name}` :
            kind === HandleKind.PLANE ? `plane-${name} axis-${normal}` : "";
        const element = EntityTransformGizmo.svg("g", this.overlay, `gizmo-${kind} ${className}`);
        element.setAttribute("role", "button");
        const handle : IHandle = {kind, name, axis, element, angle: null,
            guide: EntityTransformGizmo.svg("line", guides,
                kind === HandleKind.AXIS ? `gizmo-guide axis-${name}` : "gizmo-guide"),
            line: EntityTransformGizmo.svg("polyline", element, "gizmo-line"),
            shape: EntityTransformGizmo.svg("polygon", element, "gizmo-shape"),
            hit: EntityTransformGizmo.svg("polyline", element, "gizmo-hit"),
            label: EntityTransformGizmo.svg("text", element, "gizmo-label")};
        handle.label.textContent = kind === HandleKind.CENTRE ? "View" : name.toUpperCase();
        // Axis hits use a 6 px band around the line; the centre uses only its 20 x 20 px square.
        handle.hit.setAttribute("pointer-events", kind === HandleKind.AXIS ? "stroke" : "fill");
        handle.hit.setAttribute("fill", "none"); handle.hit.setAttribute("stroke", "transparent");
        handle.hit.setAttribute("stroke-width", "12");
        handle.shape.setAttribute("pointer-events", kind === HandleKind.CENTRE ? "none" : "all");
        handle.line.setAttribute("pointer-events", "none");
        handle.label.setAttribute("pointer-events", "none");
        EntityTransformGizmo.show(handle.guide, false);
        this.handles.push(handle);
        element.addEventListener("pointerenter", () => {
            this.setHover(handle);
        });
        element.addEventListener("pointerleave", () => {
            if (this.hover === handle) {
                this.setHover(null);
            }
        });
        element.addEventListener("pointerdown", (event) => {
            this.begin(handle, event);
        });
        element.addEventListener("pointermove", (event) => {
            this.preview(event);
        });
        element.addEventListener("pointerup", (event) => {
            this.finish(event);
        });
        element.addEventListener("pointercancel", () => {
            this.Cancel();
        });
        element.addEventListener("lostpointercapture", () => {
            this.Cancel();
        });
    }

    // Screen scale and view normal at the pivot. The step is seeded without history, so the same pivot and
    // camera always give the same size; the previous size is only a fallback for extreme scales.
    private measure(pivot : IVector3) : void {
        for (const seed of [1, this.size]) {
            const first = this.jacobian(pivot, seed);
            const result = first === null ? null :
                this.jacobian(pivot, EntityTransformGizmo.GIZMO_AXIS_PX / first.scale) ?? first;
            if (result !== null) {
                this.size = EntityTransformGizmo.GIZMO_AXIS_PX / result.scale;
                if (result.normal === null) {
                    delete this.normal;
                } else {
                    this.normal = result.normal;
                }
                return;
            }
        }
    }

    // Central-difference projection Jacobian: largest singular value in px per unit and its null direction.
    private jacobian(pivot : IVector3, step : number) : IJacobian | null {
        const rows = EntityTransformGizmo.AXES.map(([, axis]) => {
            const a = this.view.ProjectPoint(EntityTransformGizmo.add(pivot, axis, step));
            const b = this.view.ProjectPoint(EntityTransformGizmo.add(pivot, axis, -step));
            return a === null || b === null ? null : {x: (a.x - b.x) / (2 * step), y: (a.y - b.y) / (2 * step)};
        });
        if (rows.some((row) => row === null)) {
            return null;
        }
        const [a, b, c] = <IPoint2[]>rows;
        const u = {x: a?.x ?? 0, y: b?.x ?? 0, z: c?.x ?? 0}, v = {x: a?.y ?? 0, y: b?.y ?? 0, z: c?.y ?? 0};
        const uu = (u.x * u.x) + (u.y * u.y) + (u.z * u.z), vv = (v.x * v.x) + (v.y * v.y) + (v.z * v.z);
        const uv = (u.x * v.x) + (u.y * v.y) + (u.z * v.z);
        const scale = Math.sqrt((uu + vv + Math.sqrt(((uu - vv) ** 2) +
            (EntityTransformGizmo.JACOBIAN_DISCRIMINANT_FACTOR * uv * uv))) / 2);
        if (!Number.isFinite(scale) || scale <= EntityTransformGizmo.MIN_SCREEN_SCALE) {
            return null;
        }
        const normal = {x: (u.y * v.z) - (u.z * v.y), y: (u.z * v.x) - (u.x * v.z), z: (u.x * v.y) - (u.y * v.x)};
        const length = Math.hypot(normal.x, normal.y, normal.z);
        return {scale, normal: length > EntityTransformGizmo.MIN_NORMAL_LENGTH ? {x: normal.x / length, y:
            normal.y / length,
        z: normal.z / length} : null};
    }

    private placeAxis(handle : IHandle, pivot : IVector3, origin : IVector3, size : number) : void {
        const rotate = this.mode === TransformMode.ROTATE;
        const plane = this.rotationPlane(handle.axis, pivot);
        const end = rotate ? plane.ToWorld({x: Math.SQRT1_2 * size, y: Math.SQRT1_2 * size, z: 0}) :
            EntityTransformGizmo.add(pivot, handle.axis, size);
        const tip = this.view.ProjectPoint(end);
        const length = tip === null ? 0 : Math.hypot(tip.x - origin.x, tip.y - origin.y);
        const visible = tip !== null && length >=
            (rotate ? EntityTransformGizmo.MIN_ROTATION_LENGTH_PX : EntityTransformGizmo.GIZMO_AXIS_PX *
                EntityTransformGizmo.FORESHORTENED);
        EntityTransformGizmo.show(handle.element, visible);
        if (tip === null || !visible) {
            EntityTransformGizmo.show(handle.guide, false);
            return;
        }
        const dx = (tip.x - origin.x) / length, dy = (tip.y - origin.y) / length;
        if (this.drag?.handle !== handle) {
            handle.angle = TransformCursor.StableCursorAngle(tip.x - origin.x, tip.y - origin.y, handle.angle);
        }
        handle.label.setAttribute("x", String(tip.x + (dx * EntityTransformGizmo.AXIS_LABEL_DISTANCE_PX) -
            EntityTransformGizmo.LABEL_OFFSET_PX));
        handle.label.setAttribute("y", String(tip.y + (dy * EntityTransformGizmo.AXIS_LABEL_DISTANCE_PX) +
            EntityTransformGizmo.LABEL_OFFSET_PX));
        handle.shape.setAttribute("pointer-events", rotate ? "none" : "all");
        if (rotate) {
            const ring = Array.from({length: EntityTransformGizmo.ROTATION_SEGMENTS + 1}, (_, index) => {
                const angle = (index / EntityTransformGizmo.ROTATION_SEGMENTS) * Math.PI * 2;
                return this.view.ProjectPoint(plane.ToWorld({x: Math.cos(angle) * size, y: Math.sin(angle) * size,
                    z: 0}));
            });
            const value = ring.some((point) => point === null) ? "" : EntityTransformGizmo.points(<IVector3[]>ring);
            handle.line.setAttribute("points", value); handle.hit.setAttribute("points", value);
            handle.shape.setAttribute("points", "");
        } else {
            const base = {x: tip.x - (dx * EntityTransformGizmo.ARROW_LENGTH_PX), y: tip.y - (dy *
                EntityTransformGizmo.ARROW_LENGTH_PX)};
            handle.line.setAttribute("points", EntityTransformGizmo.points([origin, base]));
            handle.hit.setAttribute("points", EntityTransformGizmo.points([
                {x: origin.x + (dx * EntityTransformGizmo.AXIS_HIT_START_PX), y: origin.y + (dy *
                    EntityTransformGizmo.AXIS_HIT_START_PX)}, tip]));
            handle.shape.setAttribute("points", this.mode === TransformMode.SCALE ? EntityTransformGizmo.points(
                EntityTransformGizmo.SCALE_CORNERS.map(([x, y]) =>
                    ({x: tip.x - (dx * EntityTransformGizmo.ARROW_HALF_WIDTH_PX) + x, y: tip.y - (dy *
                        EntityTransformGizmo.ARROW_HALF_WIDTH_PX) + y}))) :
                EntityTransformGizmo.points([tip, {x: base.x - (dy * EntityTransformGizmo.ARROW_HALF_WIDTH_PX), y:
                    base.y + (dx * EntityTransformGizmo.ARROW_HALF_WIDTH_PX)},
                {x: base.x + (dy * EntityTransformGizmo.ARROW_HALF_WIDTH_PX), y: base.y - (dx *
                        EntityTransformGizmo.ARROW_HALF_WIDTH_PX)}]));
        }
        handle.element.style.cursor = TransformCursor.TransformCursor(this.operation(handle), false, handle.angle ?? 0);
        const guide = this.drag !== undefined && !rotate && (this.drag.handle === handle ||
            (this.drag.handle.kind === HandleKind.PLANE && this.planeAxes(this.drag.handle).includes(handle.name)));
        EntityTransformGizmo.show(handle.guide, guide);
        if (guide) {
            handle.guide.setAttribute("x1", String(origin.x - (dx * EntityTransformGizmo.GUIDE_REACH_PX)));
            handle.guide.setAttribute("y1", String(origin.y - (dy * EntityTransformGizmo.GUIDE_REACH_PX)));
            handle.guide.setAttribute("x2", String(origin.x + (dx * EntityTransformGizmo.GUIDE_REACH_PX)));
            handle.guide.setAttribute("y2", String(origin.y + (dy * EntityTransformGizmo.GUIDE_REACH_PX)));
        }
    }

    // Returns the farthest projected corner distance, or zero when hidden.
    private placePlane(handle : IHandle, pivot : IVector3, origin : IVector3, size : number) : number {
        const side = (size * EntityTransformGizmo.GIZMO_PLANE_PX) / EntityTransformGizmo.GIZMO_AXIS_PX;
        const [u, v] = this.planeAxes(handle).map((name) =>
            EntityTransformGizmo.AXES.find(([axis]) => axis === name)?.[1] ?? {x: 0, y: 0, z: 0});
        const corners = this.mode !== TransformMode.MOVE || u === undefined || v === undefined ? [] : [
            pivot, EntityTransformGizmo.add(pivot, u, side),
            EntityTransformGizmo.add(EntityTransformGizmo.add(pivot, u, side), v, side),
            EntityTransformGizmo.add(pivot, v, side)
        ].map((point) => this.view.ProjectPoint(point));
        handle.element.dataset["usable"] = "false";
        if (corners.length !== EntityTransformGizmo.PLANE_CORNERS || corners.some((point) => point === null)) {
            return 0;
        }
        const quad = <IVector3[]>corners;
        let area = 0;
        quad.forEach((point, index) => {
            const next = quad[(index + 1) % EntityTransformGizmo.PLANE_CORNERS] ?? point;
            area += (point.x * next.y) - (next.x * point.y);
        });
        if (Math.abs(area) / 2 <
            EntityTransformGizmo.GIZMO_PLANE_PX * EntityTransformGizmo.GIZMO_PLANE_PX *
            EntityTransformGizmo.FORESHORTENED) {
            return 0;
        }
        handle.element.dataset["usable"] = "true";
        handle.shape.setAttribute("points", EntityTransformGizmo.points(quad));
        handle.hit.setAttribute("points", "");
        const far = quad[2] ?? origin;
        handle.label.setAttribute("x", String(far.x +
            EntityTransformGizmo.LABEL_OFFSET_PX)); handle.label.setAttribute("y", String(far.y +
                EntityTransformGizmo.LABEL_OFFSET_PX));
        handle.element.style.cursor = TransformCursor.TransformCursor(CursorOperation.MOVE, false);
        return Math.max(...quad.map((point) => Math.hypot(point.x - origin.x, point.y - origin.y)));
    }

    private placeCentre(handle : IHandle, origin : IVector3) : void {
        const usable = this.mode === TransformMode.MOVE && this.normal !== undefined;
        EntityTransformGizmo.show(handle.element, usable);
        const x = origin.x, y = origin.y;
        handle.shape.setAttribute("points", EntityTransformGizmo.points([
            {x, y: y - EntityTransformGizmo.CENTRE_HALF_SIZE_PX}, {x: x +
                EntityTransformGizmo.CENTRE_HALF_SIZE_PX, y}, {x, y: y +
                    EntityTransformGizmo.CENTRE_HALF_SIZE_PX}, {x: x - EntityTransformGizmo.CENTRE_HALF_SIZE_PX, y}]));
        handle.hit.setAttribute("points", EntityTransformGizmo.points([{x: x -
            EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX, y: y - EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX},
        {x: x + EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX, y: y -
                    EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX},
        {x: x + EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX, y: y +
                EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX}, {x: x -
                    EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX, y: y +
                        EntityTransformGizmo.CENTRE_HIT_HALF_SIZE_PX}]));
        handle.label.setAttribute("x", String(x +
            EntityTransformGizmo.CENTRE_LABEL_X_PX)); handle.label.setAttribute("y", String(y -
                EntityTransformGizmo.CENTRE_LABEL_Y_PX));
        handle.element.style.cursor = TransformCursor.TransformCursor(CursorOperation.MOVE, false);
    }

    // Plane handles appear near the pivot with hysteresis; the dragged plane stays.
    private updatePlanes() : void {
        const origin = this.origin, pointer = this.pointer;
        if (this.drag === undefined) {
            const distance = origin === undefined || pointer === undefined || this.root.hidden ? Infinity :
                Math.hypot(pointer.x - origin.x, pointer.y - origin.y);
            this.planesShown = distance <= (this.planesShown ?
                Math.max(EntityTransformGizmo.GIZMO_PLANE_HIDE_PX, this.reach +
                    EntityTransformGizmo.PLANE_HIDE_MARGIN_PX) : this.reach);
        }
        for (const handle of this.handles.filter((item) => item.kind === HandleKind.PLANE)) {
            const visible = handle.element.dataset["usable"] === "true" && (this.drag === undefined ? this.planesShown :
                this.drag.handle === handle);
            EntityTransformGizmo.show(handle.element, visible);
            if (!visible && this.hover === handle) {
                this.setHover(null);
            }
        }
    }

    private setHover(handle : IHandle | null) : void {
        if (this.drag === undefined && this.hover !== (handle ?? undefined)) {
            if (handle === null) {
                delete this.hover;
            } else {
                this.hover = handle;
            }
            this.updateStates();
        }
    }

    private updateStates() : void {
        const focus = this.drag?.handle ?? this.hover;
        const related = focus?.kind === HandleKind.PLANE ? this.planeAxes(focus) : [];
        for (const handle of this.handles) {
            let state : HandleState = HandleState.NONE;
            if (handle === focus || related.includes(handle.name)) {
                state = this.drag === undefined ? HandleState.HOVER : HandleState.ACTIVE;
            } else if (this.drag !== undefined) {
                state = HandleState.INACTIVE;
            }
            handle.element.dataset["state"] = state;
        }
    }

    private planeAxes(handle : IHandle) : string[] {
        return handle.kind === HandleKind.PLANE ? handle.name.split("") : [];
    }

    private operation(handle : IHandle) : CursorOperation {
        if (handle.kind !== HandleKind.AXIS) {
            return CursorOperation.MOVE;
        }
        return this.mode === TransformMode.ROTATE ? CursorOperation.ROTATE :
            this.mode === TransformMode.SCALE ? CursorOperation.SCALE : CursorOperation.AXIS;
    }

    private rotationPlane(axis : IVector3, pivot : IVector3 = this.pivot) : WorkingPlane {
        return new WorkingPlane(EntityTransforms.Multiply(EntityTransforms.Translation(pivot),
            EntityTransforms.Rotation({x: axis.y !== 0 ? -Math.PI / 2 : 0, y: axis.x !== 0 ? Math.PI / 2 : 0, z: 0})));
    }

    // Plane through the pivot facing the camera, anchored at the press.
    private viewPlane(normal : IVector3) : WorkingPlane {
        const helper = Math.abs(normal.z) < EntityTransformGizmo.VIEW_PLANE_POLE_THRESHOLD ? {x: 0, y: 0, z: 1} :
            {x: 1, y: 0, z: 0};
        const u = {x: (helper.y * normal.z) - (helper.z * normal.y), y: (helper.z * normal.x) - (helper.x * normal.z),
            z: (helper.x * normal.y) - (helper.y * normal.x)};
        const length = Math.hypot(u.x, u.y, u.z);
        const a = {x: u.x / length, y: u.y / length, z: u.z / length};
        const b = {x: (normal.y * a.z) - (normal.z * a.y), y: (normal.z * a.x) - (normal.x * a.z),
            z: (normal.x * a.y) - (normal.y * a.x)};
        return new WorkingPlane([a.x, a.y, a.z, 0, b.x, b.y, b.z, 0, normal.x, normal.y, normal.z, 0,
            this.pivot.x, this.pivot.y, this.pivot.z, 1]);
    }

    private parameter(handle : IHandle, event : PointerEvent) : number | null {
        if (this.mode !== TransformMode.ROTATE) {
            return this.view.PickAxis(event.clientX, event.clientY, this.pivot, handle.axis);
        }
        const plane = this.rotationPlane(handle.axis);
        const hit = this.view.PickWorkingPlane(event.clientX, event.clientY, plane);
        if (hit === null) {
            return null;
        }
        const local = plane.ToLocal(hit);
        return Math.hypot(local.x, local.y) < EntityTransformGizmo.MIN_ROTATION_RADIUS ? null :
            Math.atan2(local.y, local.x);
    }

    private begin(handle : IHandle, event : PointerEvent) : void {
        if (event.button !== 0 || this.options.IsNavigationGesture?.(event) === true) {
            const target = this.options.navigationTarget;
            if (target !== undefined && this.drag === undefined) {
                event.preventDefault(); event.stopPropagation();
                target.dispatchEvent(new PointerEvent(event.type, event));
            }
            return;
        }
        if (!this.enabled || this.mode === undefined || this.drag !== undefined) {
            return;
        }
        let plane : WorkingPlane | null = null;
        if (handle.kind === HandleKind.PLANE) {
            plane = this.rotationPlane(handle.axis);
        } else if (handle.kind === HandleKind.CENTRE && this.normal !== undefined) {
            plane = this.viewPlane(this.normal);
        }
        const anchor = plane === null ? null : this.view.PickWorkingPlane(event.clientX, event.clientY, plane);
        const start = handle.kind === HandleKind.AXIS ? this.parameter(handle, event) : anchor === null ? null : 0;
        if (start === null) {
            return;
        }
        event.preventDefault(); event.stopPropagation();
        this.drag = {handle, pointer: event.pointerId, x: event.clientX, y: event.clientY, start, anchor, plane,
            size: this.size, previous: start, angle: 0, revision: this.scene.getRevision(),
            ids: this.scene.getSelection(), moved: false};
        this.hover = handle;
        handle.element.setPointerCapture(event.pointerId);
        this.cursor.setCursor(TransformCursor.TransformCursor(this.operation(handle), true, handle.angle ?? 0));
        this.Position();
    }

    private offset(drag : IDrag, event : PointerEvent, step : number) : IVector3 | null {
        if (drag.handle.kind === HandleKind.AXIS) {
            const current = this.parameter(drag.handle, event);
            if (current === null) {
                return null;
            }
            return EntityTransformGizmo.add({x: 0, y: 0, z: 0}, drag.handle.axis,
                EntityTransformGizmo.snap(current - drag.start, step));
        }
        const hit = drag.plane === null || drag.anchor === null ? null :
            this.view.PickWorkingPlane(event.clientX, event.clientY, drag.plane);
        if (hit === null || drag.anchor === null) {
            return null;
        }
        if (drag.handle.kind === HandleKind.CENTRE && drag.plane !== null) {
            // Snap in the locked view plane, not independently along world axes.
            const anchor = drag.plane.ToLocal(drag.anchor), target = drag.plane.ToLocal(hit);
            const origin = drag.plane.ToWorld({x: 0, y: 0, z: 0});
            const offset = drag.plane.ToWorld({x: EntityTransformGizmo.snap(target.x - anchor.x, step),
                y: EntityTransformGizmo.snap(target.y - anchor.y, step), z: 0});
            return {x: offset.x - origin.x, y: offset.y - origin.y, z: offset.z - origin.z};
        }
        // A plane drag never changes its normal component.
        const locked = drag.handle.kind === HandleKind.PLANE ? drag.handle.axis : {x: 0, y: 0, z: 0};
        const anchor = drag.anchor;
        return {x: locked.x !== 0 ? 0 : EntityTransformGizmo.snap(hit.x - anchor.x, step),
            y: locked.y !== 0 ? 0 : EntityTransformGizmo.snap(hit.y - anchor.y, step),
            z: locked.z !== 0 ? 0 : EntityTransformGizmo.snap(hit.z - anchor.z, step)};
    }

    private preview(event : PointerEvent) : void {
        const drag = this.drag;
        if (drag?.pointer !== event.pointerId) {
            return;
        }
        if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < EntityTransformGizmo.DRAG_PX) {
            return;
        }
        drag.moved = true;
        const axis = drag.handle.axis;
        try {
            if (this.mode === TransformMode.MOVE) {
                const step = this.options.GridStep();
                if (!Number.isFinite(step) || step < 0) {
                    throw new RangeError("Invalid grid step.");
                }
                const offset = this.offset(drag, event, step);
                if (offset === null) {
                    return;
                }
                const position = EntityTransformGizmo.add(this.pivot, offset);
                if (this.grip !== undefined) {
                    const id = this.grip.entity, grip = this.grip.grip;
                    const expectedRevision = drag.revision;
                    const target = {...position};
                    this.view.setDrawing(this.scene.PreviewGrip(id, grip, target, expectedRevision));
                    drag.commit = () => {
                        this.scene.MoveGrip({id, grip, position: target, expectedRevision});
                    };
                } else {
                    const delta = EntityTransforms.Translation(offset);
                    this.previewTransform(drag, delta);
                }
                this.previewPivot = position;
            } else {
                const current = this.parameter(drag.handle, event);
                if (current === null) {
                    return;
                }
                drag.angle += Math.atan2(Math.sin(current - drag.previous), Math.cos(current - drag.previous));
                drag.previous = current;
                const factor = Math.max(EntityTransformGizmo.MIN_SCALE_FACTOR, 1 + ((current - drag.start) /
                    drag.size));
                const transform = this.mode === TransformMode.ROTATE ?
                    EntityTransforms.Rotation({x: axis.x * drag.angle,
                        y: axis.y * drag.angle, z: axis.z * drag.angle}) :
                    EntityTransforms.Scale({x: axis.x ? factor : 1,
                        y: axis.y ? factor : 1, z: axis.z ? factor : 1});
                const delta = EntityTransforms.Multiply(EntityTransforms.Translation(this.pivot),
                    EntityTransforms.Multiply(transform,
                        EntityTransforms.Translation({x: -this.pivot.x, y: -this.pivot.y, z: -this.pivot.z})));
                this.previewTransform(drag, delta);
            }
            this.Position();
            this.options.Previewed?.(this.previewPivot ?? null);
        } catch (error : unknown) {
            this.Cancel(); this.options.Error(error);
        }
    }

    private previewTransform(drag : IDrag, delta : EntityTransform) : void {
        const ids = [...drag.ids], transform = [...delta];
        const expectedRevision = drag.revision;
        this.view.setDrawing(this.scene.PreviewTransform(ids, transform, expectedRevision));
        drag.commit = () => {
            this.scene.TransformEntities({ids, delta: transform, expectedRevision});
        };
    }

    private finish(event : PointerEvent) : void {
        if (this.drag?.pointer !== event.pointerId) {
            return;
        }
        const commit = this.drag.commit;
        this.release();
        try {
            commit?.();
            this.options.Changed();
        } catch (error : unknown) {
            this.view.setDrawing(this.scene.getDrawing()); this.Position(); this.options.Error(error);
        }
    }

    private release() : void {
        const drag = this.drag;
        if (drag !== undefined) {
            delete drag.commit;
        }
        delete this.drag; delete this.previewPivot; this.cursor.Clear();
        if (drag?.handle.element.hasPointerCapture(drag.pointer)) {
            drag.handle.element.releasePointerCapture(drag.pointer);
        }
        // The pointer may have left the handle during the drag.
        const pointer = this.pointer;
        const under = pointer === undefined ? null : document.elementFromPoint(pointer.x, pointer.y);
        const hover = this.handles.find((handle) => under !== null && handle.element.contains(under));
        if (hover === undefined) {
            delete this.hover;
        } else {
            this.hover = hover;
        }
    }
}
