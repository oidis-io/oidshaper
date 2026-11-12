/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = createRequire(import.meta.url)("../package.json");
const tarballName = `${packageJson.name.replace("@", "").replace("/", "-")}-${packageJson.version}.tgz`;
const tarball = join(root, "build", tarballName);
if (!existsSync(tarball)) {
    process.stderr.write(`build/${tarballName} not found; run npm run build and npm run pack first.\n`);
    process.exit(1);
}
const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
const consumer = mkdtempSync(join(tmpdir(), "oidshaper-consumer-"));

try {
    writeFileSync(join(consumer, "package.json"), JSON.stringify({name: "consumer", private: true, type: "module"}));
    writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            strict: true,
            lib: ["ES2022", "DOM"],
            types: [],
            noEmit: true
        },
        files: ["consumer.ts"]
    }));
    writeFileSync(join(consumer, "consumer.ts"), [
        "import { LocalOrigin, Viewport, type IVector3 } from \"@oidis-io/oidshaper\";",
        "const origin: LocalOrigin = new LocalOrigin({ x: -743000, y: -1043000, z: 300 });",
        "const local: IVector3 = origin.ToLocal({ x: -743001, y: -1043001, z: 301 });",
        "export const types: unknown[] = [local, Viewport];",
        ""
    ].join("\n"));
    writeFileSync(join(consumer, "runtime.mjs"), [
        "import { LocalOrigin } from \"@oidis-io/oidshaper\";",
        "const origin = new LocalOrigin({ x: -743000, y: -1043000, z: 300 });",
        "const local = origin.ToLocal({ x: -743001, y: -1043002, z: 303 });",
        "if (local.x !== -1 || local.y !== -2 || local.z !== 3) { throw new Error(JSON.stringify(local)); }",
        ""
    ].join("\n"));

    const run = (command, args) => execFileSync(command, args, {cwd: consumer, stdio: "inherit"});
    run("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts", tarball]);
    run(process.execPath, [tsc, "-p", "tsconfig.json"]);
    run(process.execPath, ["runtime.mjs"]);
    process.stdout.write(`Package ${tarballName} installs, type-checks under NodeNext and imports at runtime.\n`);
} finally {
    rmSync(consumer, {recursive: true, force: true});
}
