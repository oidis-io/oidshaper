/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: fileURLToPath(new URL("../dist", import.meta.url)),
        emptyOutDir: true,
        // Not in the package; attached to releases.
        sourcemap: "hidden",
        lib: {
            entry: fileURLToPath(new URL("../src/typescript/index.ts", import.meta.url)),
            formats: ["es"],
            fileName: "oidshaper"
        }
    }
});
