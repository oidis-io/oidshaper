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
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

class ImportGroupsLint {
    private static readonly eslint = new ESLint({
        cwd: resolve(import.meta.dirname, "../../.."),
        overrideConfigFile: resolve(import.meta.dirname, "../../../config/eslint.config.mjs")
    });

    public static async Messages(code : string) : Promise<readonly string[]> {
        const results = await ImportGroupsLint.eslint.lintText(`${code}\n`, {
            filePath: "src/typescript/core/AxisConstraint.ts"
        });
        expect(results).toHaveLength(1);
        expect(results[0]?.fatalErrorCount).toBe(0);
        return results.flatMap((result) => result.messages)
            .filter((message) => message.ruleId === "oidis/import-groups")
            .map((message) => message.messageId ?? message.message);
    }
}

describe("import grouping", () => {
    it.each([
        "import { Value } from 'value';",
        "import type { IValue } from 'value';",
        "import './setup';\nimport Value from 'value';\n\nimport type { IValue } from 'value';",
        "import * as Value from 'value';\n\nimport type * as Types from 'types';",
        "import Value from 'value';\r\n\r\nimport type { IValue } from 'value';",
        "import Value from 'value';\n\n// Type contracts.\nimport type { IValue } from 'value';",
        "import type { IA } from 'a';\nimport type { IB } from 'b';",
        "const load = () => import('value');"
    ])("accepts %s", async (code) => {
        expect(await ImportGroupsLint.Messages(code)).toEqual([]);
    });

    it.each([
        ["import type { IA } from 'a';\nimport { B } from 'b';", ["order"]],
        ["import type { IA } from 'a';\nimport 'side-effect';", ["order"]],
        ["import { A } from 'a';\nimport type { IB } from 'b';", ["gap"]],
        ["import { A } from 'a';\n// Types.\nimport type { IB } from 'b';", ["gap"]],
        ["import { A, type IB } from 'a';", ["separate"]],
        ["import { type IA } from 'a';", ["separate"]],
        ["import { A } from 'a';\n\nimport type { IB } from 'b';\nimport { C } from 'c';", ["order"]]
    ])("rejects %s", async (code, expected) => {
        expect(await ImportGroupsLint.Messages(code)).toEqual(expected);
    });
});
