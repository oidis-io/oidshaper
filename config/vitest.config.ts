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
        projects: [
            {
                test: {
                    name: "unit",
                    include: ["test/unit/**/*Test.ts"],
                    environment: "node"
                }
            },
            {
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
