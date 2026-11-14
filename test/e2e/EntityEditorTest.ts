/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";
import type { IPolylineData, IMeshData } from "../../src/typescript/core/entities/EntityTypes.js";
import type { IEntityDocumentData } from "../../src/typescript/core/entities/IEntity.js";

interface IScreenPoint {
    x : number;
    y : number;
}

// Centre of a gizmo handle's arrowhead, scale square or plane.
async function shapeCentre(handle : Locator) : Promise<IScreenPoint> {
    return await handle.locator(".gizmo-shape").evaluate((element) => {
        const values = (element.getAttribute("points") ?? "").trim().split(/\s+/).map((point) =>
            point.split(",").map(Number));
        return {x: values.reduce((sum, point) => sum + (point[0] ?? 0), 0) / values.length,
            y: values.reduce((sum, point) => sum + (point[1] ?? 0), 0) / values.length};
    });
}

async function save(page : Page) : Promise<IEntityDocumentData> {
    const download = page.waitForEvent("download");
    await page.locator("#save").click();
    return <IEntityDocumentData>JSON.parse(await readFile(await (await download).path(), "utf8"));
}

test("entity editor groups 2D and 3D entities and transforms only their parent", async ({page}) => {
    const errors : string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    const initial = await save(page);
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.mouse.move(350, 120);
    await page.mouse.down();
    await page.mouse.move(950, 650, {steps: 10});
    await page.mouse.up();
    await expect(page.locator("#selection-count")).toHaveText("3 selected");
    await page.locator("#group").click();
    await expect(page.locator("#status")).toHaveText("4 entities.");
    await page.locator("#tx").fill("5");
    await page.locator("#apply").click();
    const moved = await save(page);
    const group = moved.entities.find((entity) => entity.type === "group");
    expect(group?.transform[12]).toBe(5);
    for (const before of initial.entities) {
        const after = moved.entities.find((entity) => entity.id === before.id);
        expect(after?.data).toEqual(before.data);
        expect(after?.transform).toEqual(before.transform);
        expect(after?.parentId).toBe(group?.id);
    }
    await page.locator("#operation").selectOption("rotate");
    await page.locator("#tz").fill("90");
    await page.locator("#apply").click();
    await page.locator("#operation").selectOption("scale");
    await page.locator("#tx").fill("2");
    await page.locator("#apply").click();
    const transformed = await save(page);
    expect(transformed.entities.find((entity) => entity.id === group?.id)?.transform).not.toEqual(group?.transform);
    await page.locator("#undo").click();
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(moved);
    await page.locator("#ungroup").click();
    await expect(page.locator("#status")).toHaveText("3 entities.");
    const ungrouped = await save(page);
    for (const entity of ungrouped.entities) {
        expect(entity.parentId).toBeNull();
        const before = initial.entities.find((item) => item.id === entity.id);
        expect(entity.transform[12]).toBe((before?.transform[12] ?? 0) + 5);
    }
    expect(errors).toEqual([]);
});

test("entity-specific grips, layers and scene reload use the same document", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.locator("#object").selectOption("circle");
    const radius = page.getByRole("button", {name: "radius radius", exact: true});
    await expect(radius).toBeVisible();
    const bounds = await radius.boundingBox();
    if (bounds === null) {
        throw new Error("Missing radius grip.");
    }
    const before = await save(page);
    await page.mouse.move(bounds.x + (bounds.width / 2), bounds.y + (bounds.height / 2));
    await page.mouse.down();
    await page.mouse.move(bounds.x + 50, bounds.y + (bounds.height / 2), {steps: 5});
    await page.mouse.up();
    const changed = await save(page);
    expect(changed.entities.find((entity) => entity.id === "circle")?.type).toBe("circle");
    expect(changed.entities.find((entity) => entity.id === "circle")?.data)
        .not.toEqual(before.entities.find((entity) => entity.id === "circle")?.data);
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(before);
    await page.locator("#object").selectOption("box");
    await expect(page.locator(".vertex-handle")).toHaveCount(8);
    await page.locator("#layer-name").fill("solids");
    await page.locator("#add-layer").click();
    await page.locator("#target-layer").selectOption("solids");
    await page.locator("#move-layer").click();
    await page.getByRole("checkbox", {name: "solids locked"}).check();
    await expect(page.locator("#selection-count")).toHaveText("0 selected");
    await page.locator("#object").selectOption("box");
    await expect(page.locator("#selection-count")).toHaveText("0 selected");
    await page.getByRole("checkbox", {name: "solids locked"}).uncheck();
    await page.getByRole("checkbox", {name: "solids visible"}).uncheck();
    const saved = await save(page);
    await page.locator("#load").setInputFiles({name: "scene.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(saved))});
    await expect(page.locator("#status")).toHaveText("3 entities.");
    expect(await save(page)).toEqual(saved);
});

test("drawing, dragging and copying entities share one undo history", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.locator("#empty").click();
    await page.locator("#tool").selectOption("polygon");
    await page.mouse.click(500, 350);
    await page.mouse.click(700, 350);
    await page.mouse.click(700, 500);
    await expect(page.locator("#status")).toHaveText("0 entities.");
    await page.locator("#finish").click();
    await expect(page.locator("#status")).toHaveText("1 entities.");
    const initial = await save(page);
    const id = initial.entities[0]?.id ?? "";
    await page.locator("#object").selectOption(id);
    await page.locator("#tool").selectOption("move");
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(650, 450, {steps: 5});
    await page.mouse.up();
    const moved = await save(page);
    expect(moved.entities[0]?.data).toEqual(initial.entities[0]?.data);
    expect(moved.entities[0]?.transform).not.toEqual(initial.entities[0]?.transform);
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(initial);
    await page.locator("#operation").selectOption("copy");
    await page.locator("#tx").fill("10");
    await page.locator("#apply").click();
    await expect(page.locator("#status")).toHaveText("2 entities.");
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(initial);
    await page.locator("#redo").click();
    await expect(page.locator("#status")).toHaveText("2 entities.");
});

test("browser project storage restores the entity hierarchy after reload", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#empty").click();
    await page.locator("#autosave").check();
    await expect(page.locator("#storage-status")).toHaveText("Saved revision 2");
    await page.reload();
    await expect(page.locator("#status")).toHaveText("3 entities.");
    await page.locator("#restore").click();
    await expect(page.locator("#status")).toHaveText("0 entities.");
    await page.locator("#undo").click();
    await expect(page.locator("#status")).toHaveText("3 entities.");
});

test("a circle drawn in a vertical plane keeps its own editing plane", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#empty").click();
    await page.locator("#plane").selectOption("XZ");
    await page.getByRole("combobox", {name: "View direction"}).selectOption("FRONT");
    await page.locator("#tool").selectOption("circle");
    await page.mouse.click(600, 350);
    await page.mouse.click(700, 350);
    await expect(page.locator("#status")).toHaveText("1 entities.");
    const initial = await save(page);
    await page.locator("#tool").selectOption("edit");
    await page.locator("#object").selectOption(initial.entities[0]?.id ?? "");
    const bounds = await page.getByRole("button", {name: "radius radius", exact: true}).boundingBox();
    if (bounds === null) {
        throw new Error("Missing vertical-circle grip.");
    }
    await page.mouse.move(bounds.x + 5, bounds.y + 5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 40, bounds.y + 5, {steps: 5});
    await page.mouse.up();
    const changed = await save(page);
    expect(changed.entities[0]?.type).toBe("circle");
    expect(changed.entities[0]?.transform).toEqual(initial.entities[0]?.transform);
    expect(changed.entities[0]?.data).not.toEqual(initial.entities[0]?.data);
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(initial);
});

test("inserted hierarchies transform and delete without changing existing entities", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    const initial = await save(page);
    await page.locator("#insert").setInputFiles({name: "model.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(initial))});
    await expect(page.locator("#status")).toHaveText("7 entities.");
    await page.locator("#tx").fill("15");
    await page.locator("#apply").click();
    const imported = await save(page);
    const root = imported.entities.find((entity) => entity.type === "model");
    expect(root?.transform[12]).toBe(15);
    expect(imported.entities.filter((entity) => entity.parentId === root?.id)).toHaveLength(3);
    for (const original of initial.entities) {
        expect(imported.entities.find((entity) => entity.id === original.id)).toEqual(original);
    }
    await page.locator("#delete").click();
    expect(await save(page)).toEqual(initial);
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(imported);
});

test("interrupted grip and move previews never change the document", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    const initial = await save(page);
    await page.locator("#object").selectOption("circle");
    const bounds = await page.getByRole("button", {name: "radius radius", exact: true}).boundingBox();
    if (bounds === null) {
        throw new Error("Missing circle grip.");
    }
    await page.mouse.move(bounds.x + 5, bounds.y + 5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 50, bounds.y + 5, {steps: 5});
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.mouse.up();
    expect(await save(page)).toEqual(initial);
    await page.locator("#tool").selectOption("move");
    await page.mouse.move(600, 400);
    await page.mouse.down();
    await page.mouse.move(650, 450, {steps: 5});
    await page.locator("#tool").selectOption("edit");
    await page.mouse.up();
    expect(await save(page)).toEqual(initial);
});

test("grid snapping can be toggled without losing its step and Z moves use world coordinates", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.locator("#empty").click();
    await page.locator("#snap").fill("7");
    await page.locator("#tool").selectOption("point");
    await page.mouse.click(573, 413);
    const aligned = await save(page);
    const alignedPoint = <IPolylineData>aligned.entities[0]?.data;
    const point = alignedPoint.points[0];
    if (point === undefined) {
        throw new Error("Missing drawn point.");
    }
    expect(point.x % 7).toBeCloseTo(0);
    expect(point.y % 7).toBeCloseTo(0);
    await page.locator("#empty").click();
    await page.locator("#grid-snap").uncheck();
    await page.mouse.click(573, 413);
    const free = await save(page);
    const freePoint = <IPolylineData>free.entities[0]?.data;
    expect(freePoint.points).not.toEqual(alignedPoint.points);
    await expect(page.locator("#snap")).toHaveValue("7");
    await page.locator("#object").selectOption(free.entities[0]?.id ?? "");
    await page.locator("#tz").fill("2.5");
    await page.locator("#apply").click();
    const raised = await save(page);
    expect(raised.entities[0]?.data).toEqual(free.entities[0]?.data);
    expect(raised.entities[0]?.transform[14]).toBe(2.5);
    expect(raised.entities[0]?.transform[12]).toBe(free.entities[0]?.transform[12]);
    expect(raised.entities[0]?.transform[13]).toBe(free.entities[0]?.transform[13]);
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(free);
    await page.locator("#empty").click();
    await page.locator("#grid-snap").check();
    await page.mouse.click(573, 413);
    const restored = await save(page);
    expect(restored.entities[0]?.data).toEqual(aligned.entities[0]?.data);
});

for (const axis of <const>["X", "Y", "Z"]) {
    test(`scene ${axis} handle constrains dragging to one axis with snap and undo`, async ({page}) => {
        await page.goto("editor/");
        await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
        await page.locator("#object").selectOption("box");
        await expect(page.getByRole("button", {name: `Move ${axis}`, exact: true})).toBeHidden();
        await page.locator("#tool").selectOption("move");
        await page.locator("#snap").fill("2");
        const initial = await save(page);
        const handle = page.getByRole("button", {name: `Move ${axis}`, exact: true});
        await expect(handle).toBeVisible();
        // Arrowhead geometry, not the element box: hover and drag only change its stroke.
        const bounds = await shapeCentre(handle);
        const {x, y} = bounds;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (axis === "Z" ? 0 : 65), y - 60, {steps: 8});
        const preview = await shapeCentre(handle);
        expect(Math.hypot(preview.x - bounds.x, preview.y - bounds.y)).toBeGreaterThan(5);
        expect(await page.evaluate(() => decodeURIComponent(getComputedStyle(document.body).cursor)))
            .toContain(") 16 16,");
        await page.mouse.up();
        expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe("auto");
        const committed = await shapeCentre(handle);
        expect(committed.x).toBeCloseTo(preview.x, 3);
        expect(committed.y).toBeCloseTo(preview.y, 3);
        const moved = await save(page);
        const before = initial.entities.find((entity) => entity.id === "box");
        const after = moved.entities.find((entity) => entity.id === "box");
        if (before === undefined || after === undefined) {
            throw new Error("Missing mesh entity.");
        }
        expect(after.data).toEqual(before.data);
        for (const [index, name] of ["X", "Y", "Z"].entries()) {
            const delta = (after.transform[index + 12] ?? 0) - (before.transform[index + 12] ?? 0);
            if (name === axis) {
                expect(Math.abs(delta)).toBeGreaterThan(0);
                expect(delta % 2).toBeCloseTo(0);
            } else {
                expect(delta).toBe(0);
            }
        }
        await page.locator("#undo").click();
        expect(await save(page)).toEqual(initial);
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 35, y - 40, {steps: 5});
        await page.evaluate(() => window.dispatchEvent(new Event("blur")));
        await page.mouse.up();
        const cancelled = await shapeCentre(handle);
        expect(cancelled.x).toBeCloseTo(bounds.x, 3);
        expect(cancelled.y).toBeCloseTo(bounds.y, 3);
        expect(await save(page)).toEqual(initial);
    });
}

for (const [key, mode, axis] of <const>[["r", "Rotate", "Z"], ["s", "Scale", "X"]]) {
    test(`${key.toUpperCase()} activates ${mode.toLowerCase()} directly in the scene`, async ({page}) => {
        await page.goto("editor/");
        await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
        await page.locator("#object").selectOption("box");
        const before = await save(page);
        await page.locator("#view").focus();
        await page.keyboard.press(key);
        const handle = page.getByRole("button", {name: `${mode} ${axis}`, exact: true});
        await expect(handle).toBeVisible();
        // Scale drags its end square outwards; rotation drags along its ring.
        const ring = await handle.locator(".gizmo-hit").getAttribute("points");
        const points = ring?.split(" ").map((point) => point.split(",").map(Number));
        const tip = await shapeCentre(handle);
        const [startX, startY, endX, endY] = mode === "Scale" ? [tip.x, tip.y, tip.x + 58, tip.y - 57] :
            [points?.[5]?.[0], points?.[5]?.[1], points?.[14]?.[0], points?.[14]?.[1]];
        if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) {
            throw new Error("Missing transform handle geometry.");
        }
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, {steps: 8});
        await page.mouse.up();
        const after = await save(page);
        expect(after.entities.find((entity) => entity.id === "box")?.transform)
            .not.toEqual(before.entities.find((entity) => entity.id === "box")?.transform);
        expect(after.entities.find((entity) => entity.id === "box")?.data)
            .toEqual(before.entities.find((entity) => entity.id === "box")?.data);
        await page.locator("#undo").click();
        expect(await save(page)).toEqual(before);
        await page.locator("#view").focus();
        await page.keyboard.press("Escape");
        await expect(handle).toBeHidden();
        await expect(page.locator("#selection-count")).toHaveText("1 selected");
    });
}

test("clicking a mesh vertex places the XYZ gizmo on that vertex only", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#object").selectOption("box");
    const before = await save(page);
    await page.getByRole("button", {name: "vertex 0", exact: true}).click();
    expect(await save(page)).toEqual(before);
    await page.locator("#view").focus();
    await page.keyboard.press("r");
    await expect(page.getByRole("button", {name: "Rotate Z", exact: true})).toBeHidden();
    await page.keyboard.press("s");
    await expect(page.getByRole("button", {name: "Scale Z", exact: true})).toBeHidden();
    const handle = page.getByRole("button", {name: "Move Z", exact: true});
    await expect(handle).toBeVisible();
    const tip = await shapeCentre(handle);
    const gripBefore = await page.getByRole("button", {name: "vertex 0", exact: true}).boundingBox();
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.down();
    await page.mouse.move(tip.x, tip.y - 52, {steps: 6});
    const gripPreview = await page.getByRole("button", {name: "vertex 0", exact: true}).boundingBox();
    expect(gripPreview?.y).not.toBe(gripBefore?.y);
    // The gizmo pivot follows the previewed grip.
    const pivot = await shapeCentre(page.locator(".gizmo-centre"));
    expect(pivot.x).toBeCloseTo((gripPreview?.x ?? 0) + ((gripPreview?.width ?? 0) / 2), 0);
    expect(pivot.y).toBeCloseTo((gripPreview?.y ?? 0) + ((gripPreview?.height ?? 0) / 2), 0);
    await page.mouse.up();
    const after = await save(page);
    const original = before.entities.find((entity) => entity.id === "box");
    const changed = after.entities.find((entity) => entity.id === "box");
    expect(changed?.transform).toEqual(original?.transform);
    const a = <IMeshData>original?.data, b = <IMeshData>changed?.data;
    expect(b.vertices[0]?.x).toBe(a.vertices[0]?.x);
    expect(b.vertices[0]?.y).toBe(a.vertices[0]?.y);
    expect(b.vertices[0]?.z).not.toBe(a.vertices[0]?.z);
    expect(b.vertices.slice(1)).toEqual(a.vertices.slice(1));
    expect(b.triangles).toEqual(a.triangles);
    await page.locator("#undo").click();
    expect(await save(page)).toEqual(before);
});

test("wheel and middle drag over a gizmo handle still navigate the camera", async ({page}) => {
    await page.goto("editor/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#object").selectOption("box");
    await page.locator("#tool").selectOption("move");
    const before = await save(page);
    const handle = page.getByRole("button", {name: "Move X", exact: true});
    const centre = page.locator(".gizmo-centre");
    let tip = await shapeCentre(handle);
    let pivot = await shapeCentre(centre);
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.wheel(0, -400);
    await expect.poll(async () => {
        const moved = await shapeCentre(centre);
        return Math.hypot(moved.x - pivot.x, moved.y - pivot.y);
    }).toBeGreaterThan(3);
    tip = await shapeCentre(handle);
    pivot = await shapeCentre(centre);
    await page.mouse.move(tip.x, tip.y);
    await page.mouse.down({button: "middle"});
    await page.mouse.move(tip.x + 80, tip.y + 40, {steps: 6});
    await page.mouse.up({button: "middle"});
    const panned = await shapeCentre(centre);
    expect(Math.hypot(panned.x - pivot.x, panned.y - pivot.y)).toBeGreaterThan(3);
    expect(await save(page)).toEqual(before);
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).toBe("auto");
});
