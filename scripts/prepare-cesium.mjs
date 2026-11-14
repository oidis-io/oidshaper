/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { cp, mkdir } from "node:fs/promises";

const destination = new URL("../build/static/cesium/", import.meta.url);
await mkdir(destination, {recursive: true});
for (const directory of ["Assets", "Widgets", "ThirdParty", "Workers"]) {
    await cp(new URL(`../node_modules/cesium/Build/Cesium/${directory}`, import.meta.url),
        new URL(directory, destination), {recursive: true});
}
