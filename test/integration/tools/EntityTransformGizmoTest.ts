/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    EntityTypes, EntityDocument, EntityTransforms, EntityTransformGizmo, TransformMode
} from "../../../src/typescript/index.js";
import { AxisConstraint } from "../../../src/typescript/core/AxisConstraint.js";

import type { ITransformGizmoView, IVector3, WorkingPlane, IEntityGrip } from "../../../src/typescript/index.js";

// Oblique orthographic projection: every axis and plane is visible around the screen point (200, 200).
const R1 : IVector3 = {x: 8, y: -8, z: 0};
const R2 : IVector3 = {x: 4, y: 4, z: -10};
const LENGTH : number = Math.hypot(80, 80, 64);
const RAY : IVector3 = {x: 80 / LENGTH, y: 80 / LENGTH, z: 64 / LENGTH};
const ARROW : string = "M2 2V22";

interface IPoint {
    x : number;
    y : number;
}

function dot(a : IVector3, b : IVector3) : number {
    return (a.x * b.x) + (a.y * b.y) + (a.z * b.z);
}

class FakeView implements ITransformGizmoView {
    public drawings : number = 0;

    public ProjectPoint(point : IVector3) : IVector3 {
        return {x: 200 + dot(R1, point), y: 200 + dot(R2, point), z: 0.5};
    }

    public PickAxis(x : number, y : number, pivot : IVector3, axis : IVector3) : number | null {
        return AxisConstraint.AxisRayParameter(this.origin(x, y), RAY, pivot, axis);
    }

    public PickWorkingPlane(x : number, y : number, plane : WorkingPlane) : IVector3 | null {
        return plane.Intersect(this.origin(x, y), RAY);
    }

    public setDrawing() : void {
        this.drawings++;
    }

    private origin(x : number, y : number) : IVector3 {
        const a = (x - 200) / dot(R1, R1), b = (y - 200) / dot(R2, R2);
        return {x: (R1.x * a) + (R2.x * b) - (RAY.x * 1000), y: (R1.y * a) + (R2.y * b) - (RAY.y * 1000),
            z: (R1.z * a) + (R2.z * b) - (RAY.z * 1000)};
    }
}

function screen(point : IVector3) : IPoint {
    return {x: 200 + dot(R1, point), y: 200 + dot(R2, point)};
}

function handle(name : string) : SVGGElement {
    const value = document.querySelector(`[aria-label="${name}"]`);
    if (!(value instanceof SVGGElement)) {
        throw new Error(`Missing handle ${name}.`);
    }
    return value;
}

function shapeCentre(element : SVGGElement) : IPoint {
    const values = (element.querySelector(".gizmo-shape")?.getAttribute("points") ?? "").trim().split(/\s+/)
        .map((point) => point.split(",").map(Number));
    return {x: values.reduce((sum, point) => sum + (point[0] ?? 0), 0) / values.length,
        y: values.reduce((sum, point) => sum + (point[1] ?? 0), 0) / values.length};
}

function visible(element : SVGGElement) : boolean {
    return element.style.display !== "none";
}

function pointer(target : EventTarget, type : string, point : IPoint, button : number = 0) : void {
    target.dispatchEvent(new PointerEvent(type, {clientX: point.x, clientY: point.y, button, pointerId: 1,
        bubbles: true, cancelable: true, buttons: type === "pointerup" ? 0 : 1}));
}

function hover(point : IPoint) : void {
    pointer(document.body, "pointermove", point);
}

function activeCursor() : string {
    return decodeURIComponent(getComputedStyle(document.body).cursor);
}

function translation(scene : EntityDocument) : IVector3 {
    const transform = scene.getEntity("box").transform;
    return {x: transform[12] ?? 0, y: transform[13] ?? 0, z: transform[14] ?? 0};
}

describe("EntityTransformGizmo", () => {
    let scene : EntityDocument;
    let view : FakeView;
    let gizmo : EntityTransformGizmo;
    let changed : number;
    let errors : unknown[];
    let previewed : Array<IVector3 | null>;
    let step : number;

    beforeEach(() => {
        scene = new EntityDocument();
        scene.AddEntities({entities: [{id: "box", type: "mesh", name: "Box",
            data: EntityTypes.BoxMesh({x: 2, y: 2, z: 2})}]});
        scene.Select(["box"]);
        view = new FakeView();
        changed = 0; errors = []; previewed = []; step = 1;
        gizmo = new EntityTransformGizmo(scene, view, {
            GridStep: () => step,
            Changed: () => {
                changed++; gizmo.Refresh(TransformMode.MOVE);
            },
            Error: (error) => errors.push(error),
            Previewed: (position) => previewed.push(position)
        }, document.body);
        gizmo.Refresh(TransformMode.MOVE);
        hover({x: 600, y: 600});
    });

    afterEach(() => {
        gizmo.Dispose();
    });

    it("reveals all planes near the pivot with 56/72 px hysteresis and no hidden hit areas", () => {
        const planes = ["Move XY", "Move XZ", "Move YZ"].map(handle);
        const centre = shapeCentre(handle("Move view plane"));
        expect(centre).toEqual({x: 200, y: 200});
        expect(planes.some(visible)).toBe(false);
        hover({x: 200 + EntityTransformGizmo.GIZMO_PLANE_SHOW_PX - 2, y: 200});
        expect(planes.every(visible)).toBe(true);
        for (const plane of planes) {
            const middle = shapeCentre(plane);
            expect(Math.hypot(middle.x - 200, middle.y - 200)).toBeLessThan(EntityTransformGizmo.GIZMO_PLANE_SHOW_PX);
            expect(document.elementFromPoint(middle.x, middle.y)?.closest(".gizmo-plane")).toBe(plane);
        }
        // Centre hit area is at least 18 x 18 px but does not swallow the planes.
        expect(document.elementFromPoint(209, 209)?.closest(".gizmo-centre")).not.toBeNull();
        expect(document.elementFromPoint(200, 213)?.closest(".gizmo-centre")).toBeNull();
        hover({x: 200 + EntityTransformGizmo.GIZMO_PLANE_HIDE_PX - 4, y: 200});
        expect(planes.every(visible)).toBe(true);
        hover({x: 200 + EntityTransformGizmo.GIZMO_PLANE_HIDE_PX + 4, y: 200});
        expect(planes.some(visible)).toBe(false);
        const middle = shapeCentre(handle("Move XY"));
        expect(document.elementFromPoint(middle.x, middle.y)?.closest(".gizmo-plane")).toBeNull();
        hover({x: 200 + EntityTransformGizmo.GIZMO_PLANE_HIDE_PX - 4, y: 200});
        expect(planes.some(visible)).toBe(false);
    });

    it("uses a badged arrow on hover and only the operation symbol while pressed", () => {
        const axis = handle("Move X");
        const hoverCursor = decodeURIComponent(axis.style.cursor);
        expect(hoverCursor).toContain(ARROW);
        expect(hoverCursor).toContain(") 2 2,");
        const tip = shapeCentre(axis);
        pointer(axis, "pointerdown", tip);
        expect(axis.dataset["state"]).toBe("active");
        expect(activeCursor()).not.toContain(ARROW);
        expect(activeCursor()).toContain(") 16 16,");
        pointer(axis, "pointerup", tip);
        expect(getComputedStyle(document.body).cursor).toBe("auto");
        expect(changed).toBe(1);
        expect(scene.getRevision()).toBe(1);
    });

    for (const [name, interrupt] of <const>[
        ["Escape", () => window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))],
        ["window blur", () => window.dispatchEvent(new Event("blur"))],
        ["hidden document", () => {
            const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
            try {
                document.dispatchEvent(new Event("visibilitychange"));
            } finally {
                hidden.mockRestore();
            }
        }],
        ["lost capture", () => handle("Move XY").dispatchEvent(new PointerEvent("lostpointercapture"))],
        ["pointer cancel", () => handle("Move XY").dispatchEvent(new PointerEvent("pointercancel", {pointerId: 1}))],
        ["dispose", () => {
            gizmo.Dispose();
        }]
    ]) {
        it(`cancels a plane drag on ${name} and restores the cursor and document`, () => {
            const before = scene.Serialize();
            hover({x: 200, y: 200});
            const plane = handle("Move XY");
            const start = shapeCentre(plane);
            pointer(plane, "pointerdown", start);
            pointer(plane, "pointermove", {x: start.x + 60, y: start.y + 40});
            expect(previewed.at(-1)).not.toBeNull();
            interrupt();
            pointer(plane, "pointerup", {x: start.x + 60, y: start.y + 40});
            expect(getComputedStyle(document.body).cursor).toBe("auto");
            expect(scene.Serialize()).toEqual(before);
            expect(changed).toBe(0);
            if (name !== "dispose") {
                expect(previewed.at(-1)).toBeNull();
                expect(plane.dataset["state"]).not.toBe("active");
            }
        });
    }

    for (const invalidStep of [-1, NaN, Infinity]) {
        it(`cleans up a failed preview with grid step ${String(invalidStep)}`, () => {
            const before = scene.Serialize();
            step = invalidStep;
            const axis = handle("Move X"), start = shapeCentre(axis);
            pointer(axis, "pointerdown", start);
            pointer(axis, "pointermove", {x: start.x + 40, y: start.y + 20});
            pointer(axis, "pointerup", {x: start.x + 40, y: start.y + 20});
            expect(errors).toHaveLength(1);
            expect(errors[0]).toBeInstanceOf(RangeError);
            expect(getComputedStyle(document.body).cursor).toBe("auto");
            expect(scene.Serialize()).toEqual(before);
            expect(changed).toBe(0);
            expect(previewed.at(-1)).toBeNull();
            expect(axis.dataset["state"]).not.toBe("active");
        });
    }

    it("lets Escape cancel only the drag without reaching host shortcuts", () => {
        let host = 0;
        const listener = () : void => {
            host++;
        };
        window.addEventListener("keydown", listener);
        window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
        expect(host).toBe(1);
        const axis = handle("Move Y");
        pointer(axis, "pointerdown", shapeCentre(axis));
        window.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}));
        expect(host).toBe(1);
        window.removeEventListener("keydown", listener);
    });

    it("keeps the active plane locked outside the reveal area and commits one in-plane step", () => {
        hover({x: 200, y: 200});
        const plane = handle("Move XY");
        const start = shapeCentre(plane);
        pointer(plane, "pointerdown", start);
        expect(getComputedStyle(handle("Move XY")).display).not.toBe("none");
        const end = {x: start.x + 120, y: start.y + 90};
        pointer(plane, "pointermove", end);
        hover(end);
        expect(visible(plane)).toBe(true);
        expect(plane.dataset["state"]).toBe("active");
        expect(visible(handle("Move XZ"))).toBe(false);
        expect(visible(handle("Move YZ"))).toBe(false);
        expect(handle("Move X").dataset["state"]).toBe("active");
        expect(handle("Move Z").dataset["state"]).toBe("inactive");
        const preview = previewed.at(-1);
        expect(preview?.z).toBe(0);
        // Gizmo follows the live preview.
        expect(shapeCentre(handle("Move view plane"))).toEqual(screen(preview ?? {x: 0, y: 0, z: 0}));
        pointer(plane, "pointerup", end);
        const moved = translation(scene);
        expect(moved.z).toBe(0);
        expect(Number.isInteger(moved.x) && Number.isInteger(moved.y)).toBe(true);
        expect(Math.abs(moved.x) + Math.abs(moved.y)).toBeGreaterThan(0);
        expect(moved).toEqual(preview);
        expect(scene.getRevision()).toBe(2);
        expect(changed).toBe(1);
        expect(plane.dataset["state"]).not.toBe("active");
        // The pivot followed the pointer, so hover again decides visibility.
        expect(["Move XY", "Move XZ", "Move YZ"].map(handle).every(visible)).toBe(true);
        hover({x: end.x + 200, y: end.y});
        expect(visible(plane)).toBe(false);
        scene.Undo();
        expect(translation(scene)).toEqual({x: 0, y: 0, z: 0});
    });

    for (const [name, locked] of <const>[["XZ", "y"], ["YZ", "x"]]) {
        it(`moves only within ${name}`, () => {
            step = 0;
            hover({x: 200, y: 200});
            const plane = handle(`Move ${name}`);
            const start = shapeCentre(plane);
            pointer(plane, "pointerdown", start);
            pointer(plane, "pointermove", {x: start.x + 30, y: start.y - 25});
            pointer(plane, "pointerup", {x: start.x + 30, y: start.y - 25});
            const moved = translation(scene);
            expect(moved[locked]).toBe(0);
            expect(Math.hypot(moved.x, moved.y, moved.z)).toBeGreaterThan(0.5);
        });
    }

    it("ignores presses below the 3 px drag threshold", () => {
        const axis = handle("Move Z");
        const tip = shapeCentre(axis);
        pointer(axis, "pointerdown", tip);
        pointer(axis, "pointermove", {x: tip.x + 2, y: tip.y});
        pointer(axis, "pointerup", {x: tip.x + 2, y: tip.y});
        expect(scene.getRevision()).toBe(1);
        expect(previewed).toEqual([]);
    });

    it("moves the centre in the view plane", () => {
        step = 0;
        const centre = handle("Move view plane");
        pointer(centre, "pointerdown", {x: 200, y: 200});
        expect(centre.dataset["state"]).toBe("active");
        pointer(centre, "pointermove", {x: 260, y: 170});
        pointer(centre, "pointerup", {x: 260, y: 170});
        const moved = translation(scene);
        expect(Math.abs(dot(moved, RAY))).toBeLessThan(1e-9);
        expect(view.ProjectPoint(moved).x).toBeCloseTo(260, 6);
        expect(view.ProjectPoint(moved).y).toBeCloseTo(170, 6);
    });

    it("keeps grid-snapped centre movement in the view plane", () => {
        step = 1;
        const centre = handle("Move view plane");
        pointer(centre, "pointerdown", {x: 200, y: 200});
        expect(centre.dataset["state"]).toBe("active");
        pointer(centre, "pointermove", {x: 260, y: 170});
        pointer(centre, "pointerup", {x: 260, y: 170});
        const moved = translation(scene);
        expect(Math.abs(dot(moved, RAY))).toBeLessThan(1e-9);
        expect(Math.hypot(moved.x, moved.y, moved.z)).toBeGreaterThan(0);
    });

    it("moves a single grip along an axis while its pivot follows the preview", () => {
        const grip : IEntityGrip | undefined = scene.getGrips("box")[0];
        if (grip === undefined) {
            throw new Error("Missing mesh grip.");
        }
        const transform = scene.getEntity("box").transform;
        const others = scene.getGrips("box").slice(1).map((item) => item.position);
        gizmo.Refresh(TransformMode.ROTATE, {entity: "box", grip: grip.id});
        expect(shapeCentre(handle("Move view plane"))).toEqual(screen(grip.position));
        const axis = handle("Move Z");
        const tip = shapeCentre(axis);
        pointer(axis, "pointerdown", tip);
        pointer(axis, "pointermove", {x: tip.x, y: tip.y - 40});
        const preview = previewed.at(-1);
        expect(preview?.z).toBeGreaterThan(grip.position.z);
        expect(shapeCentre(handle("Move view plane"))).toEqual(screen(preview ?? grip.position));
        pointer(axis, "pointerup", {x: tip.x, y: tip.y - 40});
        expect(scene.getEntity("box").transform).toEqual(transform);
        expect(scene.getGrips("box")[0]?.position).toEqual(preview);
        expect(scene.getGrips("box").slice(1).map((item) => item.position)).toEqual(others);
        expect(scene.getRevision()).toBe(2);
    });

    it("commits the latest successful preview despite later projection and feedback changes", () => {
        const commit = vi.spyOn(scene, "TransformEntities");
        const axis = handle("Move X");
        const start = shapeCentre(axis);
        const revision = scene.getRevision();
        pointer(axis, "pointerdown", start);
        pointer(axis, "pointermove", {x: start.x + 32, y: start.y + 16});
        const first = {...previewed.at(-1)};
        pointer(axis, "pointermove", {x: start.x + 64, y: start.y + 32});
        const feedback = previewed.at(-1);
        if (feedback === null || feedback === undefined) {
            throw new Error("Missing successful preview.");
        }
        const expected = {...feedback};
        expect(expected).not.toEqual(first);
        Object.assign(feedback, {x: 999, y: 999, z: 999});
        const projection = vi.spyOn(view, "PickAxis").mockReturnValue(null);
        try {
            pointer(axis, "pointermove", {x: start.x + 100, y: start.y + 50});
            scene.Select([]);
            pointer(axis, "pointerup", {x: start.x + 100, y: start.y + 50});
            expect(commit).toHaveBeenCalledExactlyOnceWith({ids: ["box"],
                delta: EntityTransforms.Translation(expected), expectedRevision: revision});
            expect(translation(scene)).toEqual(expected);
            expect(scene.getRevision()).toBe(revision + 1);
            expect(errors).toEqual([]);
            scene.Undo();
            expect(translation(scene)).toEqual({x: 0, y: 0, z: 0});
        } finally {
            projection.mockRestore();
            commit.mockRestore();
        }
    });

    it("snapshots a grip preview position separately from mutable feedback", () => {
        const grip = scene.getGrips("box")[0];
        if (grip === undefined) {
            throw new Error("Missing mesh grip.");
        }
        gizmo.Refresh(TransformMode.MOVE, {entity: "box", grip: grip.id});
        const axis = handle("Move Z");
        const start = shapeCentre(axis);
        const revision = scene.getRevision();
        const commit = vi.spyOn(scene, "MoveGrip");
        try {
            pointer(axis, "pointerdown", start);
            pointer(axis, "pointermove", {x: start.x, y: start.y - 40});
            const feedback = previewed.at(-1);
            if (feedback === null || feedback === undefined) {
                throw new Error("Missing grip preview.");
            }
            const expected = {...feedback};
            Object.assign(feedback, {x: 999, y: 999, z: 999});
            pointer(axis, "pointerup", {x: start.x, y: start.y - 40});
            expect(commit).toHaveBeenCalledExactlyOnceWith({id: "box", grip: grip.id,
                position: expected, expectedRevision: revision});
            expect(scene.getGrips("box")[0]?.position).toEqual(expected);
            expect(errors).toEqual([]);
        } finally {
            commit.mockRestore();
        }
    });

    it("clears a canceled commit before a new gesture with no successful preview", () => {
        const before = scene.Serialize();
        const revision = scene.getRevision();
        const commit = vi.spyOn(scene, "TransformEntities");
        const axis = handle("Move X");
        const start = shapeCentre(axis);
        pointer(axis, "pointerdown", start);
        pointer(axis, "pointermove", {x: start.x + 40, y: start.y + 20});
        expect(previewed.at(-1)).not.toBeNull();
        gizmo.Cancel();
        pointer(axis, "pointerup", start);
        const projection = vi.spyOn(view, "PickAxis");
        try {
            pointer(axis, "pointerdown", start);
            projection.mockReturnValue(null);
            pointer(axis, "pointermove", {x: start.x + 40, y: start.y + 20});
            pointer(axis, "pointerup", {x: start.x + 40, y: start.y + 20});
            expect(commit).not.toHaveBeenCalled();
            expect(scene.Serialize()).toEqual(before);
            expect(scene.getRevision()).toBe(revision);
            expect(errors).toEqual([]);
            expect(getComputedStyle(document.body).cursor).toBe("auto");
        } finally {
            projection.mockRestore();
            commit.mockRestore();
        }
    });

    it("refuses a stale preview after an external document change", () => {
        const axis = handle("Move X");
        const tip = shapeCentre(axis);
        pointer(axis, "pointerdown", tip);
        pointer(axis, "pointermove", {x: tip.x + 30, y: tip.y + 15});
        scene.AddEntities({entities: [{id: "other", type: "mesh", name: "Other",
            data: EntityTypes.BoxMesh({x: 1, y: 1, z: 1})}]});
        pointer(axis, "pointerup", {x: tip.x + 30, y: tip.y + 15});
        expect(errors).toHaveLength(1);
        expect(translation(scene)).toEqual({x: 0, y: 0, z: 0});
        expect(getComputedStyle(document.body).cursor).toBe("auto");
    });

    it("keeps rotation and scale handles functional", () => {
        gizmo.Refresh(TransformMode.ROTATE);
        hover({x: 200, y: 200});
        expect(visible(handle("Rotate XY"))).toBe(false);
        const ring = handle("Rotate Z");
        const values = (ring.querySelector(".gizmo-hit")?.getAttribute("points") ?? "").split(" ")
            .map((point) => point.split(",").map(Number));
        const [sx = 0, sy = 0] = values[2] ?? [], [ex = 0, ey = 0] = values[12] ?? [];
        pointer(ring, "pointerdown", {x: sx, y: sy});
        expect(activeCursor()).toContain("A9 9");
        pointer(ring, "pointermove", {x: ex, y: ey});
        pointer(ring, "pointerup", {x: ex, y: ey});
        const rotated = scene.getEntity("box").transform;
        expect(rotated[0]).toBeLessThan(0.99);
        expect(rotated[10]).toBeCloseTo(1, 9);
        gizmo.Refresh(TransformMode.SCALE);
        const axis = handle("Scale X");
        const tip = shapeCentre(axis);
        pointer(axis, "pointerdown", tip);
        pointer(axis, "pointermove", {x: tip.x + 40, y: tip.y + 20});
        pointer(axis, "pointerup", {x: tip.x + 40, y: tip.y + 20});
        expect(scene.getRevision()).toBe(3);
        expect(errors).toEqual([]);
    });
});
