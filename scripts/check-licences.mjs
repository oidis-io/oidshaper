/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// MPL-2.0 only while its files stay unpatched.
const ALLOWED = new Set([
    "MIT", "MIT-0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "ISC", "Apache-2.0", "Zlib", "BlueOak-1.0.0", "CC0-1.0",
    "MPL-2.0"
]);

const EXCEPTIONS = {
    "spdx-exceptions": {licence: "CC-BY-3.0", reason: "SPDX data for the JSDoc lint plugin, development only"}
};

const lock = JSON.parse(readFileSync(resolve(import.meta.dirname, "..", "package-lock.json"), "utf8"));
const problems = [];
let checked = 0;

for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || entry.link === true) {
        continue;
    }
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const licence = typeof entry.license === "string" ? entry.license : "";
    checked++;
    if (isAllowed(licence)) {
        continue;
    }
    const exception = EXCEPTIONS[name];
    if (exception !== undefined && exception.licence === licence) {
        continue;
    }
    problems.push(`${name}@${String(entry.version)}: ${licence === "" ? "no licence declared" : licence}`);
}

if (problems.length > 0) {
    process.stderr.write(`Licences not on the allow list (decide and record in scripts/check-licences.mjs):\n`);
    for (const problem of problems) {
        process.stderr.write(`  ${problem}\n`);
    }
    process.exit(1);
}
process.stdout.write(`${String(checked)} packages checked, all licences allowed.\n`);

function isAllowed(expression) {
    const normalised = expression.replace(/[()]/g, " ").trim();
    if (normalised === "") {
        return false;
    }
    return normalised.split(/\s+OR\s+/).some((alternative) =>
        alternative.split(/\s+AND\s+/).every((part) => ALLOWED.has(part.trim())));
}
