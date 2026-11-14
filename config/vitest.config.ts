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
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
    root: resolve(import.meta.dirname, ".."),
    test: {
        attachmentsDir: "build/test/artifacts",
        projects: [
            {
                test: {
                    name: "unit",
                    include: ["test/unit/**/*Test.ts"],
                    environment: "node"
                }
            },
            {
                publicDir: resolve(import.meta.dirname, "../build/static"),
                optimizeDeps: {include: ["three", "cesium", "proj4", "dxf-parser",
                    "dxf-parser/dist/ParseHelpers.js", "lerc"]},
                test: {
                    name: "integration",
                    include: ["test/integration/**/*Test.ts"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        instances: [{browser: "chromium"}]
                    }
                }
            }
        ]
    }
});
