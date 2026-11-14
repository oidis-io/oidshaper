/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const browser = await chromium.launch({headless: true});
const report = {terrainHeight: null, imagery: [], errors: [], feedback: "", failed: [], canvases: [],
    stage: "initial", layers: {}, loading: null};
const page = await browser.newPage({viewport: {width: 1280, height: 900}});
try {
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("console", (message) => {
        if (message.type() === "error") {
            report.errors.push(message.text());
        }
    });
    page.on("requestfailed", (request) => report.failed.push({url: request.url(), error: request.failure()}));
    page.on("response", (response) => {
        if (/tile.openstreetmap|MapServer\/export|local-km-wms|ImageServer\/tile/.test(response.url())) {
            report.imagery.push({url: response.url(), status: response.status(),
                type: response.headers()["content-type"]});
        }
    });
    await page.goto(new URL("maps/", process.env.OIDSHAPER_DEMO_URL ?? "http://127.0.0.1:5173/").href);
    await page.locator("body[data-terrain-height]").waitFor({timeout: 180000});
    report.terrainHeight = await page.locator("body").getAttribute("data-terrain-height");
    await page.locator("body[data-map-loading=\"0\"]").waitFor({timeout: 180000});
    for (const source of ["osm", "orthophoto", "topographic"]) {
        report.stage = source;
        process.stdout.write(`Checking ${source}\n`);
        await page.locator("#source").selectOption(source);
        await page.waitForTimeout(1000);
        await page.locator("body[data-map-loading=\"0\"]").waitFor({timeout: 180000});
        await mkdir("build/live-maps", {recursive: true});
        await page.screenshot({path: `build/live-maps/${source}.png`});
    }
    report.stage = "cadastre";
    process.stdout.write("Checking cadastre\n");
    await page.locator("#cadastre").check();
    await page.waitForTimeout(1000);
    await page.locator("body[data-map-loading=\"0\"]").waitFor({timeout: 180000});
    await page.screenshot({path: "build/live-maps/cadastre.png"});
    for (const [name, marker] of Object.entries({osm: "tile.openstreetmap", orthophoto: "/ORTOFOTO/",
        topographic: "/ZTM_WM/", cadastre: "local-km-wms"})) {
        report.layers[name] = report.imagery.filter((item) => item.url.includes(marker) && item.status === 200 &&
            item.type?.startsWith("image/")).length;
        if (report.layers[name] === 0) {
            throw new Error(`No successful imagery response for ${name}`);
        }
    }
    report.stage = "complete";
} catch (error) {
    report.errors.push(String(error));
} finally {
    await mkdir("build/live-maps", {recursive: true});
    report.canvases = await page.locator("canvas").evaluateAll((items) => items.map((item) => ({
        width: item.width, height: item.height, bounds: item.getBoundingClientRect().toJSON()
    })));
    report.feedback = await page.locator("aside").innerText().catch(() => "unavailable");
    report.loading = await page.locator("body").getAttribute("data-map-loading");
    await page.screenshot({path: "build/live-maps/final.png"}).catch(() => undefined);
    await writeFile("build/live-maps/report.json", JSON.stringify(report, null, 2));
    await browser.close();
}
if (report.errors.length || report.terrainHeight === null) {
    throw new Error(JSON.stringify(report.errors));
}
