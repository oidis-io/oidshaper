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

import type { Linter } from "eslint";

interface IRestrictionCase {
    readonly name : string;
    readonly code : string;
    readonly message : string;
    readonly count? : number;
}

const ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE = "src/typescript/core/AxisConstraint.ts";
const STRUCTURE_RULE = "no-restricted-syntax";
const CALLABLE_RULE = "oidis/callable-interfaces";
const NAMING_RULE = "@typescript-eslint/naming-convention";
const DECLARATION = "Declare this function as a method of the owning class.";
const STANDALONE = "Move this standalone function into a class.";
const EXPORTED = "Export a class method instead of a standalone function.";
const DEFAULT_EXPORT = "Export a class instead of a standalone function.";
const DESTRUCTURING = "Access object properties explicitly instead of using object destructuring.";
const PARAMETER_PROPERTY = "Declare the class field explicitly and assign it in the constructor.";

class ClassStructureLint {
    private static readonly eslint = new ESLint({
        cwd: ROOT,
        overrideConfigFile: resolve(ROOT, "config/eslint.config.mjs")
    });

    public static async Messages(code : string, rules : readonly string[], filePath : string = SOURCE)
        : Promise<Linter.LintMessage[]> {
        const results = await ClassStructureLint.eslint.lintText(`${code}\n`, {filePath});
        expect(results).toHaveLength(1);
        const result = results[0];
        if (result === undefined) {
            throw new Error("ESLint returned no result.");
        }
        expect(result.fatalErrorCount).toBe(0);
        expect(result.messages.filter((message) => message.ruleId === null)).toEqual([]);
        return result.messages.filter((message) => message.ruleId !== null && rules.includes(message.ruleId));
    }
}

const RESTRICTIONS : readonly IRestrictionCase[] = [
    {name: "named declaration", code: "function work() : number { return 1; }", message: DECLARATION},
    {name: "exported declaration", code: "export function work() : number { return 1; }", message: DECLARATION},
    {name: "default named declaration", code: "export default function work() : number { return 1; }",
        message: DECLARATION},
    {name: "default anonymous declaration", code: "export default function () : number { return 1; }",
        message: DECLARATION},
    {name: "async declaration", code: "export async function work() : Promise<number> { return 1; }",
        message: DECLARATION},
    {name: "generator declaration", code: "function* work() : Generator<number> { yield 1; }", message: DECLARATION},
    {name: "nested declaration", code: "class Worker { public Run() : number { function work() : number {" +
        " return 1; } return work(); } }", message: DECLARATION},
    {name: "standalone arrow", code: "const work = () : number => 1;", message: STANDALONE},
    {name: "async arrow", code: "const work = async () : Promise<number> => 1;", message: STANDALONE},
    {name: "standalone function expression", code: "let work = function () : number { return 1; };",
        message: STANDALONE},
    {name: "named function expression", code: "var work = function calculate() : number { return 1; };",
        message: STANDALONE},
    {name: "exported arrow", code: "export const work = () : number => 1;", message: EXPORTED},
    {name: "exported function expression", code: "export const work = function () : number { return 1; };",
        message: EXPORTED},
    {name: "separate named export", code: "const work = () : number => 1; export { work };", message: STANDALONE},
    {name: "separate default export", code: "const work = () : number => 1; export default work;", message: STANDALONE},
    {name: "default arrow", code: "export default () : number => 1;", message: DEFAULT_EXPORT},
    {name: "default async arrow", code: "export default async () : Promise<number> => 1;",
        message: DEFAULT_EXPORT},
    {name: "parenthesized default expression", code: "export default (function () : number { return 1; });",
        message: DEFAULT_EXPORT},
    {name: "multiple declarators", code: "const first = () => 1, second = function () { return 2; };",
        message: STANDALONE, count: 2},
    {name: "object binding", code: "const {x} = {x: 1};", message: DESTRUCTURING},
    {name: "renamed binding with default", code: "const {x: value = 1} = {x: 2};", message: DESTRUCTURING},
    {name: "rest binding", code: "const {x, ...rest} = {x: 1, y: 2};", message: DESTRUCTURING},
    {name: "nested object bindings", code: "const {point: {x}} = {point: {x: 1}};",
        message: DESTRUCTURING, count: 2},
    {name: "object assignment", code: "let x = 0; ({x} = {x: 1});", message: DESTRUCTURING},
    {name: "callback parameter binding", code: "[{x: 1}].map(({x}) => x);", message: DESTRUCTURING},
    {name: "method parameter binding", code: "interface IPoint { x : number; } " +
        "class Worker { public Run({x} : IPoint) : number { return x; } }", message: DESTRUCTURING},
    {name: "loop binding", code: "for (const {x} of [{x: 1}]) { void x; }", message: DESTRUCTURING},
    {name: "catch binding", code: "try { throw new Error(); } catch ({message}) { void message; }",
        message: DESTRUCTURING},
    {name: "private readonly parameter", code: "class Worker { constructor(private readonly value : number) {} }",
        message: PARAMETER_PROPERTY},
    {name: "public parameter", code: "class Worker { constructor(public value : number) {} }",
        message: PARAMETER_PROPERTY},
    {name: "protected parameter", code: "class Worker { constructor(protected value : number) {} }",
        message: PARAMETER_PROPERTY},
    {name: "readonly parameter", code: "class Worker { constructor(readonly value : number) {} }",
        message: PARAMETER_PROPERTY}
];

const INLINE_CALLABLES = <const>[
    ["function alias", "type Transform = (value : number) => number;"],
    ["exported function alias", "export type Handler = () => void;"],
    ["constructor alias", "type Factory = new () => Date;"],
    ["interface property", "interface IOptions { handler : (value : number) => void; }"],
    ["optional interface property", "interface IOptions { OnChange? : (value : number) => void; }"],
    ["class property union", "class Worker { private handler : ((value : number) => void) | undefined; }"],
    ["optional class property", "class Worker { private handler? : (value : number) => void; }"],
    ["method parameter", "class Worker { public Run(handler : (value : number) => void) : void { handler(1); } }"],
    ["constructor parameter", "class Worker { constructor(handler : () => void) { handler(); } }"],
    ["method return", "class Worker { public Run() : () => number { return () => 1; } }"],
    ["generic argument", "class Worker { private handlers = new Set<(value : number) => void>(); }"],
    ["array element", "class Worker { private handlers : (() => void)[] = []; }"],
    ["type assertion", "const handler = <() => number>Object;"],
    ["satisfies signature", "void ((() => 1) satisfies (() => number));"],
    ["constructor property", "interface IFactory { factory : new (value : number) => Date; }"],
    ["abstract constructor", "interface IFactory { factory : abstract new () => Date; }"],
    ["constructor generic argument", "class Worker { private factories = new Set<new () => Date>(); }"]
];

const ALLOWED = <const>[
    ["static and instance methods", "export class Worker { public static Run() : number { return 1; } " +
        "public Execute() : number { return Worker.Run(); } }"],
    ["explicit constructor assignment", "class Worker { private readonly value : number; " +
        "constructor(value : number) { this.value = value; } }"],
    ["optional field cleared with delete", "class Worker { private value? : number; " +
        "public Clear() : void { delete this.value; } }"],
    ["named imports and exports", `import { AxisConstraint } from "./AxisConstraint.js"; export { AxisConstraint };`],
    ["object literal and property access", "const point = {x: 1}; const copy = {...point}; void copy.x;"],
    ["array destructuring", "const [x, y] = [1, 2]; void (x ?? y);"],
    ["inline arrow callback", "[1, 2].map((value) => value + 1);"],
    ["inline function callback", "[1, 2].map(function (value) { return value + 1; });"],
    ["named inline function callback", "[1, 2].map(function increment(value) { return value + 1; });"],
    ["returned anonymous callback", "class Worker { public Run() : IHandler { return () => 1; } } " +
        "interface IHandler { () : number; }"],
    ["callable interface reused in options and class", "interface IHandler { (value : number) : void; } " +
        "interface IOptions { OnChange? : IHandler; } class Worker { private handler? : IHandler; }"],
    ["constructable interface", "interface IFactory { new (value : number) : Date; } " +
        "interface IOptions { factory : IFactory; }"],
    ["constructable options", "interface IFactory { new () : Date; } interface IOptions { factory : IFactory; }"],
    ["optional callable interface", "interface IHandler { (value : number) : void; } " +
        "interface IOptions { handler? : IHandler; }"],
    ["callback collection", "interface IHandler { (value : number) : void; } " +
        "interface IHandlers extends ReadonlyArray<IHandler> {}"],
    ["constructor collection", "interface IFactory { new () : Date; } " +
        "interface IFactories extends ReadonlyArray<IFactory> {}"],
    ["higher order callable", "interface IHandler { () : void; } " +
        "interface IResult { () : number; } interface IFactory { (handler : IHandler) : IResult; }"],
    ["interface method signature", "interface IWorker { Run(value : number) : void; getValue() : number; }"],
    ["call and construct signatures", "interface IHandler { (value : number) : void; } " +
        "interface IFactory { new (value : number) : Date; }"]
];

const VALID_NAMES = ["getValue", "setValue", "get", "set", "Run", "Getaway", "Setup", "toString", "toJSON", "valueOf"];
const INVALID_NAMES = ["GetValue", "SetValue", "Get", "Set", "run", "getvalue", "setvalue"];

describe("production class structure", {timeout: 30000}, () => {
    it.each(RESTRICTIONS)("rejects $name", async (testCase) => {
        const messages = await ClassStructureLint.Messages(testCase.code, [STRUCTURE_RULE]);
        expect(messages.map((message) => message.message)).toEqual(
            Array<string>(testCase.count ?? 1).fill(testCase.message));
        expect(messages.every((message) => message.severity === 2)).toBe(true);
    });

    it.each(INLINE_CALLABLES)("requires a callable interface for %s", async (_name, code) => {
        const messages = await ClassStructureLint.Messages(code, [CALLABLE_RULE]);
        expect(messages).toHaveLength(1);
        expect(messages[0]).toMatchObject({messageId: "named", severity: 2});
    });

    it("reports each nested inline callable signature", async () => {
        const code = "interface IOptions { factory : (handler : () => void) => (() => number); }";
        const messages = await ClassStructureLint.Messages(code, [CALLABLE_RULE]);
        expect(messages.map((message) => message.messageId)).toEqual(["named", "named", "named"]);
    });

    it.each(ALLOWED)("allows %s", async (_name, code) => {
        expect(await ClassStructureLint.Messages(code, [STRUCTURE_RULE, CALLABLE_RULE, NAMING_RULE])).toEqual([]);
    });

    it.each(VALID_NAMES)("allows public class and interface method %s", async (name) => {
        const code = `export class Worker { public ${name}() : number { return 1; } } ` +
            `interface IWorker { ${name}() : number; }`;
        expect(await ClassStructureLint.Messages(code, [NAMING_RULE])).toEqual([]);
    });

    it.each(INVALID_NAMES)("rejects public class and interface method %s", async (name) => {
        const code = `export class Worker { public ${name}() : number { return 1; } } ` +
            `interface IWorker { ${name}() : number; }`;
        const messages = await ClassStructureLint.Messages(code, [NAMING_RULE]);
        expect(messages).toHaveLength(2);
        expect(messages.every((message) => message.severity === 2)).toBe(true);
    });

    it("checks static method getter spelling", async () => {
        const valid = "class Worker { public static getValue() : number { return 1; } }";
        const invalid = "class Worker { public static GetValue() : number { return 1; } }";
        expect(await ClassStructureLint.Messages(valid, [NAMING_RULE])).toEqual([]);
        expect(await ClassStructureLint.Messages(invalid, [NAMING_RULE])).toHaveLength(1);
    });

    it("allows camelCase language accessors", async () => {
        const code = "class Worker { private current : number = 0; " +
            "public get value() : number { return this.current; } " +
            "public set value(next : number) { this.current = next; } }";
        expect(await ClassStructureLint.Messages(code, [STRUCTURE_RULE, CALLABLE_RULE, NAMING_RULE])).toEqual([]);
    });

    it("keeps private helpers camelCase", async () => {
        const code = "class Worker { private calculate() : number { return 1; } }";
        expect(await ClassStructureLint.Messages(code, [NAMING_RULE])).toEqual([]);
    });

    it("limits structural and callable restrictions to production sources", async () => {
        const code = "function work(handler : () => void) : void { const {x} = {x: 1}; handler(); void x; } " +
            "class Worker { constructor(private value : number) {} } const arrow = () => 1;";
        const rules = [STRUCTURE_RULE, CALLABLE_RULE];
        expect(await ClassStructureLint.Messages(code, rules, "test/unit/config/ClassStructureTest.ts")).toEqual([]);
        expect((await ClassStructureLint.Messages(code, rules)).length).toBeGreaterThan(0);
    });
});

describe("structured contracts and constants", () => {
    it.each([
        ["type SelectionMode = \"window\" | \"crossing\";", "enumeration"],
        ["class Tool { private mode : \"window\" | \"crossing\"; }", "enumeration"],
        ["interface IMode {\n    mode : \"window\" | \"crossing\";\n}", "enumeration"],
        ["export type Command = IAdd | IRemove;", "union"],
        ["interface IPoint { x : number; y : number; }", "members"],
        ["interface IPoint {\n x : number; y : number;\n}", "members"],
        ["const EPSILON : number = 1e-7;", "constant"],
        ["export const LIMIT : number = 100;", "constant"]
    ])("rejects %s", async (code, messageId) => {
        const messages = await ClassStructureLint.Messages(code, ["oidis/structured-contracts"]);
        expect(messages).toHaveLength(1);
        expect(messages[0]?.messageId).toBe(messageId);
    });

    it.each([
        "enum SelectionMode { WINDOW = \"window\", CROSSING = \"crossing\" }",
        "interface IPoint {\n    x : number;\n    y : number;\n}",
        "interface ITransform {\n    (value : number) : number;\n}",
        "class Selection { private static readonly EPSILON : number = 1e-7; }"
    ])("accepts %s", async (code) => {
        expect(await ClassStructureLint.Messages(code,
            ["oidis/structured-contracts", "oidis/callable-interfaces"])).toEqual([]);
    });

    it("requires a blank line between interfaces", async () => {
        const code = "interface IA {\n    x : number;\n}\ninterface IB {\n    y : number;\n}";
        const rule = "@stylistic/padding-line-between-statements";
        expect(await ClassStructureLint.Messages(code, [rule])).toHaveLength(1);
        expect(await ClassStructureLint.Messages(code.replace("}\ninterface", "}\n\ninterface"), [rule])).toEqual([]);
    });

    it("rejects inline numeric tolerances but accepts named static constants", async () => {
        const rule = "@typescript-eslint/no-magic-numbers";
        const bad = "class Plane { public Test(value : number) : boolean { return Math.abs(value) < 1e-12; } }";
        const good = "class Plane { private static readonly PARALLEL_TOLERANCE : number = 1e-12; " +
            "public Test(value : number) : boolean { return Math.abs(value) < Plane.PARALLEL_TOLERANCE; } }";
        expect(await ClassStructureLint.Messages(bad, [rule])).toHaveLength(1);
        expect(await ClassStructureLint.Messages(good, [rule])).toEqual([]);
    });
});
