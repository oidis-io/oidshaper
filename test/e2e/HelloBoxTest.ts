/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { expect, test, type Page } from "@playwright/test";

interface IPoint {
    readonly x : number;
    readonly y : number;
}

interface ITealBox {
    readonly centre : IPoint;
    readonly pixels : number;
}

// Lit faces and edges keep the hue.
function isAmber(colour : number[]) : boolean {
    const [red = 0, green = 0, blue = 0] = colour;
    return red > 80 && red > green && green > blue + 30 && blue < 70;
}

function isTeal(colour : number[]) : boolean {
    const [red = 0, green = 0, blue = 0] = colour;
    return red < 90 && green > 90 && blue > 90 && Math.abs(green - blue) < 60;
}

async function open(page : Page) : Promise<string[]> {
    const errors : string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") {
            errors.push(message.text());
        }
    });
    await page.goto("hello-box/");
    await expect(page.locator("body")).toHaveAttribute("data-ready", "true");
    return errors;
}

async function colours(page : Page, points : IPoint[]) : Promise<number[][]> {
    return await page.evaluate(async (positions) => {
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const canvas : HTMLCanvasElement | null = document.querySelector("#view");
        const context : CanvasRenderingContext2D | null = document.createElement("canvas").getContext("2d");
        if (canvas === null || context === null) {
            return [];
        }
        context.canvas.width = canvas.width;
        context.canvas.height = canvas.height;
        context.drawImage(canvas, 0, 0);
        const scale : number = canvas.width / canvas.clientWidth;
        return positions.map((point) => Array.from(
            context.getImageData(Math.floor(point.x * scale), Math.floor(point.y * scale), 1, 1).data
        ));
    }, points);
}

async function findTeal(page : Page) : Promise<ITealBox> {
    return await page.evaluate(async () => {
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const canvas : HTMLCanvasElement | null = document.querySelector("#view");
        const context : CanvasRenderingContext2D | null = document.createElement("canvas").getContext("2d");
        if (canvas === null || context === null) {
            return {centre: {x: NaN, y: NaN}, pixels: 0};
        }
        context.canvas.width = canvas.width;
        context.canvas.height = canvas.height;
        context.drawImage(canvas, 0, 0);
        const data : Uint8ClampedArray = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sumX : number = 0;
        let sumY : number = 0;
        let pixels : number = 0;
        for (let y : number = 0; y < canvas.height; y += 2) {
            for (let x : number = 0; x < canvas.width; x += 2) {
                const index : number = ((y * canvas.width) + x) * 4;
                const red : number = data[index] ?? 0;
                const green : number = data[index + 1] ?? 0;
                const blue : number = data[index + 2] ?? 0;
                // isTeal; the page cannot call test functions.
                if (red < 90 && green > 90 && blue > 90 && Math.abs(green - blue) < 60) {
                    sumX += x;
                    sumY += y;
                    pixels++;
                }
            }
        }
        const scale : number = canvas.width / canvas.clientWidth;
        return {centre: {x: sumX / pixels / scale, y: sumY / pixels / scale}, pixels};
    });
}

async function viewCentre(page : Page) : Promise<IPoint> {
    const box = await page.locator("#view").boundingBox();
    expect(box).not.toBeNull();
    return {x: (box?.x ?? 0) + ((box?.width ?? 0) / 2), y: (box?.y ?? 0) + ((box?.height ?? 0) / 2)};
}

function samples(centre : IPoint) : IPoint[] {
    const points : IPoint[] = [];
    for (let row : number = -2; row <= 2; row++) {
        for (let column : number = -3; column <= 3; column++) {
            points.push({x: centre.x + (column * centre.x / 4), y: centre.y + (row * centre.y / 3)});
        }
    }
    return points;
}

test("hello box demo renders the middle box in the centre of the view", async ({page}) => {
    const errors : string[] = await open(page);
    const [centre = []] = await colours(page, [await viewCentre(page)]);
    expect(isAmber(centre), `centre pixel ${centre.join(", ")}`).toBe(true);
    expect(errors).toEqual([]);
});

interface IOrbitGesture {
    readonly name : string;
    readonly key : string;
    readonly button : "left" | "middle";
}

const ORBITS : readonly IOrbitGesture[] = [
    {name: "Shift + middle drag", key: "Shift", button: "middle"},
    {name: "Alt + left drag", key: "Alt", button: "left"}
];

for (const orbit of ORBITS) {
    test(`orbits the scene around the point under the cursor with ${orbit.name}`, async ({page}) => {
        const errors : string[] = await open(page);
        const centre : IPoint = await viewCentre(page);
        const before : number[][] = await colours(page, samples(centre));

        await page.mouse.move(centre.x, centre.y);
        await page.keyboard.down(orbit.key);
        await page.mouse.down({button: orbit.button});
        await page.mouse.move(centre.x + 160, centre.y - 60, {steps: 8});
        await page.mouse.up({button: orbit.button});
        await page.keyboard.up(orbit.key);

        const after : number[][] = await colours(page, samples(centre));
        const changed : number = after.filter((colour, index) => colour.join() !== before[index]?.join()).length;
        expect(changed).toBeGreaterThan(before.length / 3);
        // The pivot is under the cursor, so it stays there.
        const [stays = []] = await colours(page, [centre]);
        expect(isAmber(stays), `centre pixel ${stays.join(", ")}`).toBe(true);
        expect(errors).toEqual([]);
    });
}

test("zooms in towards the point under the cursor", async ({page}) => {
    const errors : string[] = await open(page);
    const teal : ITealBox = await findTeal(page);
    expect(teal.pixels).toBeGreaterThan(100);

    await page.mouse.move(teal.centre.x, teal.centre.y);
    await page.mouse.wheel(0, -600);

    const zoomed : ITealBox = await findTeal(page);
    expect(zoomed.pixels).toBeGreaterThan(teal.pixels * 3);
    const [underCursor = []] = await colours(page, [teal.centre]);
    expect(isTeal(underCursor), `pixel under the cursor ${underCursor.join(", ")}`).toBe(true);
    expect(errors).toEqual([]);
});

test("pans with the middle button so the grabbed point follows the cursor", async ({page}) => {
    const errors : string[] = await open(page);
    const teal : ITealBox = await findTeal(page);
    const target : IPoint = {x: teal.centre.x + 180, y: teal.centre.y - 120};

    await page.mouse.move(teal.centre.x, teal.centre.y);
    await page.mouse.down({button: "middle"});
    await page.mouse.move(target.x, target.y, {steps: 8});
    await page.mouse.up({button: "middle"});

    // Perspective moves the outline's centre; the grabbed point is checked by colour.
    const moved : ITealBox = await findTeal(page);
    expect(Math.hypot(moved.centre.x - teal.centre.x, moved.centre.y - teal.centre.y)).toBeGreaterThan(150);
    const [underCursor = []] = await colours(page, [target]);
    expect(isTeal(underCursor), `pixel under the cursor ${underCursor.join(", ")}`).toBe(true);
    expect(errors).toEqual([]);
});
