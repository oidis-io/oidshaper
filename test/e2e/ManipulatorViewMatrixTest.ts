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
import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";
import type { IEntityDocumentData } from "../../src/typescript/core/entities/IEntity.js";

async function save(page : Page) : Promise<IEntityDocumentData> {
    const pending = page.waitForEvent("download");
    await page.locator("#save").click();
    return <IEntityDocumentData>JSON.parse(await readFile(await (await pending).path(), "utf8"));
}

interface IScreenPoint {x : number; y : number}

async function polygonCentre(shape : Locator) : Promise<IScreenPoint> {
    return await shape.evaluate((element) => {
        const values = (element.getAttribute("points") ?? "").trim().split(/\s+/).map((point) =>
            point.split(",").map(Number));
        if (values.length < 3) {
            throw new Error("Missing handle polygon.");
        }
        return {x: values.reduce((sum, point) => sum + (point[0] ?? 0), 0) / values.length,
            y: values.reduce((sum, point) => sum + (point[1] ?? 0), 0) / values.length};
    });
}

for (const theme of ["dark", "light"]) {
    for (const direction of ["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM", "ISO",
        "FRONT_UP", "FRONT_DOWN", "BACK_UP", "BACK_DOWN", "LEFT_UP", "LEFT_DOWN", "RIGHT_UP", "RIGHT_DOWN"]) {
        test(`${theme} ${direction}: projected axis cursors, live movement and history`, async ({page}) => {
            const errors : string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.goto("editor/");
            await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
            await page.locator("#theme").selectOption(theme);
            await page.getByRole("combobox", {name: "View direction"})
                .selectOption(direction.split("_")[0] ?? direction);
            if (direction.includes("_")) {
                await page.mouse.move(1000, 700);
                await page.keyboard.down("Shift");
                await page.mouse.down({button: "middle"});
                await page.mouse.move(1120, direction.endsWith("UP") ? 580 : 820, {steps: 8});
                await page.mouse.up({button: "middle"});
                await page.keyboard.up("Shift");
            }
            await page.locator("#object").selectOption("box");
            await page.locator("#tx").fill("-8");
            await page.locator("#tz").fill("-3");
            await page.locator("#apply").click();
            await page.locator("#grid-snap").uncheck();
            await page.locator("#tool").selectOption("move");
            const baseline = await save(page);
            let checked = 0;
            for (const [index, axis] of ["X", "Y", "Z"].entries()) {
                const handle = page.getByRole("button", {name: `Move ${axis}`, exact: true});
                if (!await handle.isVisible()) {
                    continue;
                }
                const start = await polygonCentre(handle.locator(".gizmo-shape"));
                const centre = await polygonCentre(page.locator(".gizmo-centre .gizmo-shape"));
                const dx = start.x - centre.x, dy = start.y - centre.y;
                const length = Math.hypot(dx, dy);
                expect(length).toBeGreaterThan(8);
                await page.mouse.move(start.x, start.y);
                await expect(handle).toHaveAttribute("data-state", "hover");
                const cursor = await handle.evaluate((element) => getComputedStyle(element).cursor);
                const svg = decodeURIComponent(cursor);
                const angle = Number(/rotate\(([-\d.]+) 16 16\)/.exec(svg)?.[1]);
                const expected = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
                const difference = Math.abs(angle - expected);
                expect(Math.min(difference, 180 - difference)).toBeLessThanOrEqual(12);
                await page.mouse.down();
                await expect(handle).toHaveAttribute("data-state", "active");
                const pressed = await handle.evaluate((element) => getComputedStyle(element).cursor);
                expect(decodeURIComponent(pressed)).not.toContain("M2 2V22");
                await page.mouse.move(start.x + ((dx * 36) / length), start.y + ((dy * 36) / length), {steps: 6});
                const preview = await polygonCentre(page.locator(".gizmo-centre .gizmo-shape"));
                expect(Math.hypot(preview.x - centre.x, preview.y - centre.y)).toBeGreaterThan(5);
                await page.mouse.up();
                const result = await save(page);
                const a = baseline.entities.find((item) => item.id === "box");
                const b = result.entities.find((item) => item.id === "box");
                expect(b?.data).toEqual(a?.data);
                for (let component = 0; component < 3; component++) {
                    const before = a?.transform[12 + component] ?? 0;
                    const after = b?.transform[12 + component] ?? 0;
                    if (component === index) {
                        expect(after).toBeGreaterThan(before);
                    } else {
                        expect(after).toBeCloseTo(before, 8);
                    }
                }
                await page.locator("#undo").click();
                expect(await save(page)).toEqual(baseline);
                await page.locator("#redo").click();
                expect(await save(page)).toEqual(result);
                await page.locator("#undo").click();
                checked++;
            }
            expect(checked).toBe(direction === "ISO" || direction.includes("_") ? 3 : 2);
            expect(errors).toEqual([]);
        });
    }
}

for (const [direction, plane, locked] of <const>[
    ["TOP", "XY", 2], ["BOTTOM", "XY", 2], ["FRONT", "XZ", 1],
    ["BACK", "XZ", 1], ["LEFT", "YZ", 0], ["RIGHT", "YZ", 0]
]) {
    test(`${direction}: ${plane} hover, plane drag, cancellation and hidden hit areas`, async ({page}) => {
        await page.goto("editor/");
        await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
        await page.getByRole("combobox", {name: "View direction"}).selectOption(direction);
        await page.locator("#object").selectOption("box");
        await page.locator("#tx").fill("-8");
        await page.locator("#tz").fill("-3");
        await page.locator("#apply").click();
        await page.locator("#tool").selectOption("move");
        await page.locator("#grid-snap").uncheck();
        const baseline = await save(page);
        const handle = page.getByRole("button", {name: `Move ${plane}`, exact: true});
        const centre = await polygonCentre(page.locator(".gizmo-centre .gizmo-shape"));
        await page.mouse.move(centre.x + 180, centre.y + 180);
        await expect(handle).toBeHidden();
        await page.mouse.move(centre.x, centre.y);
        await expect(handle).toBeVisible();
        const start = await polygonCentre(handle.locator(".gizmo-shape"));
        await page.mouse.move(start.x, start.y);
        await expect(handle).toHaveAttribute("data-state", "hover");
        for (const axis of plane) {
            await expect(page.getByRole("button", {name: `Move ${axis}`, exact: true}))
                .toHaveAttribute("data-state", "hover");
        }
        await page.mouse.down();
        await page.mouse.move(start.x + 42, start.y + 35, {steps: 6});
        await expect(handle).toBeVisible();
        await expect(handle).toHaveAttribute("data-state", "active");
        await page.keyboard.press("Escape");
        await page.mouse.up();
        expect(await save(page)).toEqual(baseline);
        await page.mouse.move(centre.x, centre.y);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + 42, start.y + 35, {steps: 6});
        await page.mouse.up();
        const moved = await save(page);
        const a = baseline.entities.find((item) => item.id === "box");
        const b = moved.entities.find((item) => item.id === "box");
        expect(b?.transform[12 + locked]).toBeCloseTo(a?.transform[12 + locked] ?? 0, 8);
        for (const index of [0, 1, 2].filter((item) => item !== locked)) {
            expect(Math.abs((b?.transform[12 + index] ?? 0) - (a?.transform[12 + index] ?? 0)))
                .toBeGreaterThan(0.01);
        }
        await page.locator("#undo").click();
        expect(await save(page)).toEqual(baseline);
        await page.mouse.move(centre.x + 180, centre.y + 180);
        await expect(handle).toBeHidden();
        const hit = await page.evaluate(({x, y}) => document.elementFromPoint(x, y)?.closest(".gizmo-plane") !== null,
            start);
        expect(hit).toBe(false);
    });
}

for (const theme of ["dark", "light"]) {
    for (const [direction, axis] of <const>[
        ["TOP", "Z"], ["BOTTOM", "Z"], ["FRONT", "Y"], ["BACK", "Y"], ["LEFT", "X"], ["RIGHT", "X"], ["ISO", "Z"]
    ]) {
        for (const mode of ["rotate", "scale"]) {
            test(`${theme} ${direction}: ${mode} gesture and cancellation`, async ({page}) => {
                await page.goto("editor/");
                await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
                await page.locator("#theme").selectOption(theme);
                await page.getByRole("combobox", {name: "View direction"}).selectOption(direction);
                await page.locator("#object").selectOption("box");
                await page.locator("#tool").selectOption(mode);
                const name = mode === "rotate" ? "Rotate" : "Scale";
                // Scale along an axis in the screen plane, rotate around the viewing axis.
                const target = mode === "scale" && direction !== "ISO" ? (axis === "X" ? "Y" : "X") : axis;
                const handle = page.getByRole("button", {name: `${name} ${target}`, exact: true});
                await expect(handle).toBeVisible();
                const baseline = await save(page);
                let start : IScreenPoint, end : IScreenPoint;
                if (mode === "rotate") {
                    const ring = await handle.locator(".gizmo-hit").getAttribute("points");
                    const positions = (ring ?? "").split(" ").map((point) => point.split(",").map(Number));
                    const a = positions[5], b = positions[14];
                    if (a?.[0] === undefined || a[1] === undefined || b?.[0] === undefined || b[1] === undefined) {
                        throw new Error("Missing rotation ring.");
                    }
                    start = {x: a[0], y: a[1]}; end = {x: b[0], y: b[1]};
                } else {
                    start = await polygonCentre(handle.locator(".gizmo-shape"));
                    const centre = await polygonCentre(page.locator(".gizmo-centre .gizmo-shape"));
                    const length = Math.hypot(start.x - centre.x, start.y - centre.y);
                    end = {x: start.x + ((start.x - centre.x) * 35 / length),
                        y: start.y + ((start.y - centre.y) * 35 / length)};
                }
                await page.mouse.move(start.x, start.y);
                await expect(handle).toHaveAttribute("data-state", "hover");
                await page.mouse.down();
                await expect(handle).toHaveAttribute("data-state", "active");
                await page.mouse.move(end.x, end.y, {steps: 8});
                await page.keyboard.press("Escape");
                await page.mouse.up();
                expect(await save(page)).toEqual(baseline);
                await page.mouse.move(start.x, start.y);
                await page.mouse.down();
                await page.mouse.move(end.x, end.y, {steps: 8});
                await page.mouse.up();
                const result = await save(page);
                const before = baseline.entities.find((item) => item.id === "box");
                const after = result.entities.find((item) => item.id === "box");
                expect(after?.transform).not.toEqual(before?.transform);
                expect(after?.data).toEqual(before?.data);
                await page.locator("#undo").click();
                expect(await save(page)).toEqual(baseline);
                await page.locator("#redo").click();
                expect(await save(page)).toEqual(result);
            });
        }
    }
}

for (const gesture of ["pan", "orbit", "alt-orbit"]) {
    test(`navigation ${gesture} over an axis does not transform the entity`, async ({page}) => {
        await page.goto("editor/");
        await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
        await page.locator("#object").selectOption("box");
        await page.locator("#tool").selectOption("move");
        const baseline = await save(page);
        const handle = page.getByRole("button", {name: "Move X", exact: true});
        const start = await polygonCentre(handle.locator(".gizmo-shape"));
        await page.mouse.move(start.x, start.y);
        const modifier = gesture === "orbit" ? "Shift" : gesture === "alt-orbit" ? "Alt" : null;
        if (modifier !== null) {
            await page.keyboard.down(modifier);
        }
        const button = gesture === "alt-orbit" ? "left" : "middle";
        await page.mouse.down({button});
        await expect(handle).not.toHaveAttribute("data-state", "active");
        await page.mouse.move(start.x + 80, start.y - 40, {steps: 8});
        await page.mouse.up({button});
        if (modifier !== null) {
            await page.keyboard.up(modifier);
        }
        expect(await save(page)).toEqual(baseline);
        const end = await polygonCentre(handle.locator(".gizmo-shape"));
        expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeGreaterThan(1);
    });
}

for (const deviceScaleFactor of [1, 2]) {
    test.describe(`gizmo at DPR ${String(deviceScaleFactor)}`, () => {
        test.use({deviceScaleFactor});
        test("keeps usable CSS hit areas through zoom and viewport resize", async ({page}) => {
            await page.goto("editor/");
            await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
            await page.locator("#object").selectOption("box");
            await page.locator("#tool").selectOption("move");
            const baseline = await save(page);
            for (const size of [{width: 1280, height: 900}, {width: 1000, height: 700}]) {
                await page.setViewportSize(size);
                for (const zoom of [0, 300, -600]) {
                    const zoomAt = await polygonCentre(page.locator(".gizmo-centre .gizmo-shape"));
                    await page.mouse.move(zoomAt.x, zoomAt.y);
                    await page.mouse.wheel(0, zoom);
                    await page.evaluate(async () => {
                        await new Promise<void>((resolve) => {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    resolve();
                                });
                            });
                        });
                    });
                    const handle = page.getByRole("button", {name: "Move X", exact: true});
                    const point = await polygonCentre(handle.locator(".gizmo-shape"));
                    const pivot = await polygonCentre(page.locator(".gizmo-centre .gizmo-shape"));
                    const length = Math.hypot(point.x - pivot.x, point.y - pivot.y);
                    expect(length).toBeGreaterThan(24);
                    expect(length).toBeLessThan(110);
                    await page.mouse.move(point.x, point.y);
                    await expect(handle).toHaveAttribute("data-state", "hover");
                    await page.mouse.down();
                    await expect(handle).toHaveAttribute("data-state", "active");
                    await page.mouse.move(point.x + 30, point.y - 30, {steps: 4});
                    await page.keyboard.press("Escape");
                    await page.mouse.up();
                    expect(await save(page)).toEqual(baseline);
                }
            }
        });
    });
}
