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

import type { Plugin } from "vite";

const root : string = fileURLToPath(new URL("../src/html/demos", import.meta.url));
const typescript : string = fileURLToPath(new URL("../src/typescript", import.meta.url));

// The pages load their scripts from /typescript/, outside the dev server root.
function typescriptSources() : Plugin {
    return {
        name: "oidshaper-typescript-sources",
        apply: "serve",
        resolveId(id : string) : string | null {
            return id.startsWith("/typescript/") ? `${typescript}${id.slice("/typescript".length)}` : null;
        }
    };
}

export default defineConfig({
    publicDir: fileURLToPath(new URL("../build/static", import.meta.url)),
    root,
    plugins: [typescriptSources()],
    base: "./",
    resolve: {
        alias: {
            "@oidis-io/oidshaper": fileURLToPath(new URL("../src/typescript/index.ts", import.meta.url))
        }
    },
    optimizeDeps: {
        include: ["three", "cesium", "proj4", "dxf-parser", "dxf-parser/dist/ParseHelpers.js", "lerc"]
    },
    server: {
        port: 5173
    },
    build: {
        outDir: fileURLToPath(new URL("../build/demos", import.meta.url)),
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
        rolldownOptions: {
            input: {
                index: `${root}/index.html`,
                helloBox: `${root}/hello-box/index.html`,
                maps: `${root}/maps/index.html`,
                drawing: `${root}/drawing/index.html`,
                editor: `${root}/editor/index.html`
            }
        }
    }
});
