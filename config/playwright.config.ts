/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const root : string = resolve(import.meta.dirname, "..");
const vite : string = "npx vite --config config/vite.config.ts";
const devPort : number = 5174;
const builtPort : number = 5175;
const ci : boolean = process.env["CI"] !== undefined;

export default defineConfig({
    testDir: `${root}/test/e2e`,
    testMatch: "**/*Test.ts",
    outputDir: `${root}/build/e2e/results`,
    reporter: ci ? [["list"], ["html", {outputFolder: `${root}/build/e2e/report`, open: "never"}]] : "list",
    forbidOnly: ci,
    retries: ci ? 1 : 0,
    use: {
        ...devices["Desktop Chrome"],
        trace: "retain-on-failure"
    },
    projects: [
        {name: "dev", use: {baseURL: `http://localhost:${String(devPort)}/`}},
        // A subfolder catches absolute paths in the built demos.
        {name: "built", use: {baseURL: `http://localhost:${String(builtPort)}/demos/`}}
    ],
    webServer: [
        {
            command: `${vite} --port ${String(devPort)} --strictPort`,
            cwd: root,
            url: `http://localhost:${String(devPort)}/`,
            reuseExistingServer: !ci
        },
        {
            command: `npm run build:demos && ${vite} preview --outDir ${root}/build --port ${String(builtPort)} --strictPort`,
            cwd: root,
            url: `http://localhost:${String(builtPort)}/demos/`,
            reuseExistingServer: false
        }
    ]
});
