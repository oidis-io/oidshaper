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

test("map demo creates both renderers and switches sources", async ({page}) => {
    const errors : string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("maps/");
    // Cold Cesium module loading has a separate startup budget.
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {timeout: 15000});
    await expect(page.locator("#map canvas")).toHaveCount(1);
    await page.locator("#source").selectOption("orthophoto");
    await page.locator("#cadastre").check();
    await page.locator("#models").uncheck();
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await expect(page.locator("#view")).toHaveCSS("opacity", "1");
    await expect(page.getByRole("combobox", {name: "View direction"})).toHaveValue("TOP");
    expect(errors).toEqual([]);
});

test("drawing exports a path and imports it back", async ({page}) => {
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#draw").check();
    await page.locator("#view").click({position: {x: 400, y: 350}});
    await page.locator("#view").click({position: {x: 500, y: 400}});
    await page.locator("#finish").click();
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    const file = await download;
    const path = await file.path();
    await page.locator("#file").setInputFiles(path);
    await expect(page.locator("#status")).toHaveText("1 paths.");
});

test("sample DXF survives editing history and reports invalid imports without deleting it", async ({page}) => {
    const errors : string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.locator("#sample").click();
    await expect(page.locator("#status")).toHaveText("3 paths.");
    await expect(page.locator("#layers label")).toHaveCount(4);
    await page.locator("#undo").click();
    await expect(page.locator("#status")).toHaveText("0 paths.");
    await page.locator("#redo").click();
    await expect(page.locator("#status")).toHaveText("3 paths.");
    await page.locator("#layers input").first().uncheck();
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    const file = await download;
    await page.locator("#file").setInputFiles(await file.path());
    await expect(page.locator("#status")).toHaveText("3 paths.");
    await expect(page.locator("#layers label")).toHaveCount(4);
    await page.locator("#file").setInputFiles({name: "invalid.dxf", mimeType: "application/dxf",
        buffer: Buffer.from("invalid input")});
    await expect(page.locator("#status")).not.toHaveText("3 paths.");
    await page.locator("#fit").click();
    await expect(page.locator("#layers label")).toHaveCount(4);
    expect(errors).toEqual([]);
});

test("navigation drags do not create drawing vertices", async ({page}) => {
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.locator("#draw").check();
    await page.mouse.move(400, 350);
    await page.mouse.down();
    await page.mouse.move(500, 400, {steps: 10});
    await page.mouse.up();
    await page.locator("#view").click({position: {x: 450, y: 400}});
    await page.locator("#finish").click();
    await expect(page.locator("#status")).toHaveText("0 paths.");
    await page.keyboard.press("Escape");
});

test("navigation cube selects views without adding drawing vertices", async ({page}, testInfo) => {
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.locator("#draw").check();
    const direction = page.getByRole("combobox", {name: "View direction"});
    for (const name of ["TOP", "BOTTOM", "LEFT", "RIGHT", "FRONT", "BACK", "ISO"]) {
        await direction.selectOption(name);
        await expect(direction).toHaveValue(name);
    }
    const cube = page.locator(".oidshaper-navigation-cube");
    await cube.click({position: {x: 72, y: 48}});
    await page.locator("#finish").click();
    await expect(page.locator("#status")).toHaveText("0 paths.");
    await direction.selectOption("TOP");
    await cube.click({position: {x: 72, y: 72}});
    await expect(direction).toHaveValue("TOP");
    await cube.click({position: {x: 102, y: 72}});
    await expect(direction).toHaveValue("CUSTOM");
    await direction.selectOption("ISO");
    await page.mouse.move(700, 400);
    await page.locator("#theme").selectOption("dark");
    await expect(direction).toHaveCSS("color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(32, 33, 36)");
    await expect(page.locator("aside")).toHaveCSS("background-color", "rgb(41, 49, 59)");
    await cube.hover({position: {x: 72, y: 72}});
    await expect(cube).toHaveAttribute("title", "LEFT / FRONT / TOP");
    await cube.screenshot({path: testInfo.outputPath("navigation-cube-dark.png")});
    await page.locator("#theme").selectOption("light");
    await expect(direction).toHaveCSS("color-scheme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(237, 241, 245)");
    await expect(page.locator("aside")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await cube.hover({position: {x: 72, y: 72}});
    await cube.screenshot({path: testInfo.outputPath("navigation-cube-light.png")});
});

test("theme switches the whole demo consistently", async ({page}, testInfo) => {
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.locator("#sample").click();
    for (const theme of ["dark", "light"]) {
        await page.getByRole("combobox", {name: "Theme", exact: true}).selectOption(theme);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.getByRole("combobox", {name: "View direction"})).toHaveCSS("color-scheme", theme);
        await expect(page.locator("#status")).toHaveText("3 paths.");
        await page.screenshot({path: testInfo.outputPath(`theme-${theme}.png`)});
    }
});

test("snap and pending history preserve exported geometry and recover from invalid snap", async ({page}) => {
    const errors : string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.locator("#draw").check();
    await page.locator("#height").fill("7.25");
    await page.locator("#snap").fill("-1");
    await page.locator("#view").click({position: {x: 420, y: 400}});
    await expect(page.locator("#status")).toContainText("snap cannot be negative");
    await page.locator("#snap").fill("0.5");
    await page.locator("#view").click({position: {x: 420, y: 400}});
    await page.locator("#view").click({position: {x: 520, y: 450}});
    await page.locator("#undo").click();
    await page.locator("#redo").click();
    await page.locator("#finish").click();
    await expect(page.locator("#status")).toHaveText("1 paths.");
    await page.locator("#layers input").uncheck();
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    const file = await download;
    const content = await readFile(await file.path(), "utf8");
    const vertices = content.split("\nVERTEX\n").slice(1);
    expect(vertices).toHaveLength(2);
    for (const vertex of vertices) {
        const groups = vertex.split("\n");
        const coordinate = (code : string) : number => {
            for (let index = 0; index < groups.length; index += 2) {
                if (groups[index] === code) {
                    return Number(groups[index + 1]);
                }
                if (groups[index] === "0") {
                    break;
                }
            }
            throw new Error(`Missing exported coordinate: ${code}`);
        };
        expect(Number.isInteger(coordinate("10") * 2)).toBe(true);
        expect(Number.isInteger(coordinate("20") * 2)).toBe(true);
        expect(coordinate("30")).toBe(7.25);
    }
    await page.locator("#sample").click();
    await page.locator("#undo").click();
    await expect(page.locator("#layers input")).not.toBeChecked();
    await expect(page.locator("#status")).toHaveText("1 paths.");
    expect(errors).toEqual([]);
});

for (const theme of ["dark", "light"]) {
    test(`map horizon and underside remain navigable in ${theme} theme`, async ({page}, testInfo) => {
        // Live terrain and imagery must finish loading before capturing the underside.
        test.setTimeout(60000);
        const errors : string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("maps/");
        await expect(page.locator("body")).toHaveAttribute("data-terrain-height", /[0-9]/, {timeout: 15000});
        await page.getByRole("combobox", {name: "Theme", exact: true}).selectOption(theme);
        for (const direction of ["FRONT", "BOTTOM"]) {
            await page.getByRole("combobox", {name: "View direction"}).selectOption(direction);
            await expect(page.getByRole("combobox", {name: "View direction"})).toHaveValue(direction);
        }
        await expect(page.locator("body")).toHaveAttribute("data-map-loading", "0", {timeout: 20000});
        await page.screenshot({path: testInfo.outputPath(`map-${theme}-BOTTOM.png`)});
        expect(errors).toEqual([]);
    });
}

test("default survey DXF loads and can be restored after starting a new drawing", async ({page}, testInfo) => {
    const errors : string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await expect(page.locator("#status")).toContainText("3 paths.");
    await expect(page.locator("#layers input")).not.toHaveCount(0);
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.screenshot({path: testInfo.outputPath("survey-dxf.png")});
    await page.locator("#new").click();
    await expect(page.locator("#status")).toHaveText("0 paths.");
    await page.locator("#dxf-sample").click();
    await expect(page.locator("#status")).toContainText("3 paths.");
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    await page.locator("#file").setInputFiles(await (await download).path());
    await expect(page.locator("#status")).toContainText("3 paths.");
    expect(errors).toEqual([]);
});

test("planar shapes, vertex dragging, cancellation and editing history work together", async ({page}, testInfo) => {
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.locator("#height").fill("7");
    await page.locator("#snap").fill("1");
    await page.locator("#tool").selectOption("rectangle");
    await page.locator("#view").click({position: {x: 420, y: 400}});
    await page.mouse.move(560, 500);
    await page.locator("#view").click({position: {x: 560, y: 500}});
    await expect(page.locator("#status")).toHaveText("1 paths.");
    await page.locator("#tool").selectOption("edit");
    await page.locator("#selection").selectOption("0");
    await expect(page.locator(".vertex-handle")).toHaveCount(4);
    const handle = page.getByRole("button", {name: "Vertex 2", exact: true});
    const before = await handle.boundingBox();
    if (before === null) {
        throw new Error("Missing vertex handle.");
    }
    const x = before.x + (before.width / 2);
    const y = before.y + (before.height / 2);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 50, y + 25, {steps: 5});
    await page.keyboard.press("Escape");
    await page.mouse.up();
    const cancelled = await handle.boundingBox();
    expect((cancelled?.x ?? NaN) + ((cancelled?.width ?? 0) / 2)).toBeCloseTo(x, 0);
    expect((cancelled?.y ?? NaN) + ((cancelled?.height ?? 0) / 2)).toBeCloseTo(y, 0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 50, y + 25, {steps: 5});
    await page.mouse.up();
    const moved = await handle.boundingBox();
    expect(moved?.x).not.toBeCloseTo(before.x, 0);
    await expect.poll(() => page.locator("#view").evaluate((element) => {
        const canvas = <HTMLCanvasElement>element;
        const capture = document.createElement("canvas");
        capture.width = canvas.width;
        capture.height = canvas.height;
        const context = capture.getContext("2d");
        if (context === null) {
            return 0;
        }
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(400, 380, 250, 180).data;
        let highlighted = 0;
        for (let index = 0; index < pixels.length; index += 4) {
            const r = pixels[index] ?? 0;
            const g = pixels[index + 1] ?? 0;
            const b = pixels[index + 2] ?? 0;
            if (r > 120 && g > 60 && r > (g * 1.2) && b < (g * 0.6)) {
                highlighted++;
            }
        }
        return highlighted;
    })).toBeGreaterThan(20);
    await page.screenshot({path: testInfo.outputPath("vertex-editor.png")});
    await page.locator("#undo").click();
    const undone = await handle.boundingBox();
    expect((undone?.x ?? NaN) + ((undone?.width ?? 0) / 2)).toBeCloseTo(x, 0);
    await page.locator("#redo").click();
    expect((await handle.boundingBox())?.x).toBeCloseTo(moved?.x ?? NaN, 0);
    await page.locator("#insert-vertex").click();
    await expect(page.locator(".vertex-handle")).toHaveCount(5);
    await page.locator("#delete-vertex").click();
    await expect(page.locator(".vertex-handle")).toHaveCount(4);
    const download = page.waitForEvent("download");
    await page.locator("#export").click();
    const content = await readFile(await (await download).path(), "utf8");
    const vertices = content.split("\nVERTEX\n").slice(1);
    expect(vertices).toHaveLength(4);
    for (const vertex of vertices) {
        expect(vertex).toContain("\n30\n7\n");
        const groups = vertex.split("\n");
        for (const code of ["10", "20"]) {
            const index = groups.indexOf(code);
            expect(Number.isInteger(Number(groups[index + 1]))).toBe(true);
        }
    }
    await page.locator("#delete-path").click();
    await expect(page.locator("#status")).toHaveText("0 paths.");
    await page.locator("#undo").click();
    await expect(page.locator("#status")).toHaveText("1 paths.");
    for (const shape of ["line", "circle"]) {
        await page.locator("#new").click();
        await page.locator("#tool").selectOption(shape);
        await page.locator("#view").click({position: {x: 420, y: 400}});
        await page.locator("#view").click({position: {x: 560, y: 500}});
        await expect(page.locator("#status")).toHaveText("1 paths.");
        await page.locator("#undo").click();
        await expect(page.locator("#status")).toHaveText("0 paths.");
        await page.locator("#redo").click();
        await expect(page.locator("#status")).toHaveText("1 paths.");
    }
});

test("directional rectangle and lasso selection support modifiers and atomic deletion", async ({page}, testInfo) => {
    await page.goto("drawing/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    await page.locator("#new").click();
    await page.getByRole("combobox", {name: "View direction"}).selectOption("TOP");
    await page.locator("#tool").selectOption("rectangle");
    for (const x of [420, 600]) {
        await page.mouse.click(x, 350);
        await page.mouse.click(x + 100, 450);
    }
    await expect(page.locator("#status")).toHaveText("2 paths.");
    await page.locator("#tool").selectOption("edit");
    const count = page.locator("#selection-count");
    await page.mouse.move(400, 330);
    await page.mouse.down();
    await page.mouse.move(470, 470, {steps: 5});
    await expect(page.locator(".area-selection")).toHaveAttribute("data-mode", "window");
    await page.mouse.up();
    await expect(count).toHaveText("0 selected");
    await page.mouse.move(470, 470);
    await page.mouse.down();
    await page.mouse.move(400, 330, {steps: 5});
    await expect(page.locator(".area-selection")).toHaveAttribute("data-mode", "crossing");
    await page.mouse.up();
    await expect(count).toHaveText("1 selected");
    await page.keyboard.down("Shift");
    await page.mouse.move(580, 330);
    await page.mouse.down();
    await page.mouse.move(720, 470, {steps: 5});
    await page.mouse.up();
    await page.keyboard.up("Shift");
    await expect(count).toHaveText("2 selected");
    await page.keyboard.down("Control");
    await page.mouse.move(400, 330);
    await page.mouse.down();
    await page.mouse.move(540, 470, {steps: 5});
    await page.mouse.up();
    await page.keyboard.up("Control");
    await expect(count).toHaveText("1 selected");
    await page.locator("#selection-shape").selectOption("lasso");
    await page.mouse.move(390, 320);
    await page.mouse.down();
    for (const [x, y] of <const>[[730, 320], [730, 480], [390, 480], [390, 320]]) {
        await page.mouse.move(x, y, {steps: 8});
    }
    await expect(page.locator(".area-selection")).toHaveAttribute("data-mode", "window");
    await page.mouse.up();
    await expect(count).toHaveText("2 selected");
    await page.mouse.move(470, 320);
    await page.mouse.down();
    for (const [x, y] of <const>[[390, 320], [390, 480], [470, 480], [470, 320]]) {
        await page.mouse.move(x, y, {steps: 6});
    }
    await expect(page.locator(".area-selection")).toHaveAttribute("data-mode", "crossing");
    await page.screenshot({path: testInfo.outputPath("lasso-crossing.png")});
    await page.mouse.up();
    await expect(count).toHaveText("1 selected");
    await page.locator("#selection-shape").selectOption("rectangle");
    await page.mouse.move(390, 320);
    await page.mouse.down();
    await page.mouse.move(730, 480, {steps: 5});
    await page.mouse.up();
    await expect(count).toHaveText("2 selected");
    await page.locator("#delete-path").click();
    await expect(page.locator("#status")).toHaveText("0 paths.");
    await page.locator("#undo").click();
    await expect(page.locator("#status")).toHaveText("2 paths.");
    await page.locator("#layers input").first().uncheck();
    await page.locator("#selection-shape").selectOption("rectangle");
    await page.mouse.move(390, 320);
    await page.mouse.down();
    await page.mouse.move(730, 480, {steps: 5});
    await page.mouse.up();
    await expect(count).toHaveText("0 selected");
    await page.mouse.move(390, 320);
    await page.mouse.down();
    await page.mouse.move(730, 480, {steps: 5});
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".area-selection")).toBeHidden();
    await expect(page.locator("#status")).toHaveText("2 paths.");
});
