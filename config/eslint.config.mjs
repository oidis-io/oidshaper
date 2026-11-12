/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import globals from "globals";
import tseslint from "typescript-eslint";
import oidis from "./eslint-rules.mjs";

const MODULES = {
    core: [],
    render: ["core"],
    pointcloud: ["core", "render"],
    map: ["core"],
    io: ["core"],
    tools: ["core"],
    ui: ["core"]
};

const ENGINES = {
    render: {group: ["three", "three/*"], name: "three.js"},
    map: {group: ["cesium", "@cesium/*"], name: "CesiumJS"}
};

function enginePatterns(owner) {
    return Object.entries(ENGINES)
        .filter(([module]) => module !== owner)
        .map(([module, engine]) => ({
            group: engine.group,
            message: `${engine.name} may only be imported in src/typescript/${module}.`
        }));
}

const SELF_IMPORT = {
    group: ["@oidis-io/oidshaper", "@oidis-io/oidshaper/*"],
    message: "Sources import each other by relative path; the package name is for hosts and demos."
};

function moduleBoundaries(module, allowed) {
    const forbidden = Object.keys(MODULES).filter((other) => other !== module && !allowed.includes(other));
    return {
        files: [`src/typescript/${module}/**/*.ts`],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [
                    SELF_IMPORT,
                    ...enginePatterns(module),
                    ...(forbidden.length > 0 ?
                        [{
                            regex: `^(\\.\\./)+(${forbidden.join("|")})(/|$)`,
                            message: `src/typescript/${module} may only import ${allowed.length > 0 ? allowed.join(", ") : "itself"}.`
                        }] :
                        [])
                ]
            }]
        }
    };
}

const RULES = {
    "no-console": "error",
    "no-implied-eval": "off",
    "no-irregular-whitespace": ["error", {skipTemplates: true}],
    "curly": ["error", "all"],
    "eqeqeq": ["error", "always"],
    "no-restricted-syntax": ["error", {
        selector: "TSTypeLiteral",
        message: "Avoid anonymous object types, extract an interface instead."
    }],

    "@typescript-eslint/member-ordering": ["error", {
        interfaces: ["signature", "field", "constructor", "method"],
        typeLiterals: ["signature", "field", "constructor", "method"],
        default: {
            memberTypes: [
                "signature",
                "public-static-field", "protected-static-field", "private-static-field",
                "public-decorated-field", "protected-decorated-field", "private-decorated-field",
                "public-instance-field", "protected-instance-field", "private-instance-field",
                "public-static-accessor", ["public-static-get", "public-static-set"],
                "protected-static-accessor", ["protected-static-get", "protected-static-set"],
                "private-static-accessor", ["private-static-get", "private-static-set"],
                "public-static-method", "protected-static-method", "private-static-method",
                "public-constructor", "protected-constructor", "private-constructor",
                "public-decorated-method", "protected-decorated-method", "private-decorated-method",
                "public-instance-accessor", ["public-instance-get", "public-instance-set"],
                "protected-instance-accessor", ["protected-instance-get", "protected-instance-set"],
                "private-instance-accessor", ["private-instance-get", "private-instance-set"],
                "public-instance-method", "protected-instance-method", "private-instance-method",
                "public-abstract-field", "protected-abstract-field",
                "public-abstract-accessor", ["public-abstract-get", "public-abstract-set"],
                "protected-abstract-accessor", ["protected-abstract-get", "protected-abstract-set"],
                "public-abstract-method", "protected-abstract-method"
            ]
        }
    }],
    "@typescript-eslint/consistent-type-assertions": ["error", {assertionStyle: "angle-bracket"}],
    "@typescript-eslint/consistent-type-imports": ["error", {fixStyle: "inline-type-imports"}],
    "@typescript-eslint/consistent-indexed-object-style": ["error", "index-signature"],
    "@typescript-eslint/array-type": ["error", {default: "array-simple"}],
    "@typescript-eslint/explicit-member-accessibility": ["error", {overrides: {constructors: "no-public"}}],
    "@typescript-eslint/explicit-function-return-type": ["error", {allowExpressions: true}],
    "@typescript-eslint/no-inferrable-types": "off",
    "@typescript-eslint/no-unused-vars": ["error", {argsIgnorePattern: "^_", varsIgnorePattern: "^_"}],
    "@typescript-eslint/ban-ts-comment": ["error", {minimumDescriptionLength: 10}],
    "@typescript-eslint/return-await": ["error", "always"],
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-deprecated": "error",
    "@typescript-eslint/restrict-template-expressions": ["error", {allowNumber: false}],
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/naming-convention": ["error",
        {selector: "default", format: ["camelCase"], leadingUnderscore: "allow"},
        {selector: "import", format: null},
        {selector: "variable", format: ["camelCase", "UPPER_CASE"], leadingUnderscore: "allow"},
        {selector: "typeLike", format: ["PascalCase"]},
        {selector: "interface", format: ["PascalCase"], prefix: ["I"]},
        {selector: "enumMember", format: ["PascalCase", "UPPER_CASE"]},
        {selector: "classProperty", modifiers: ["static", "readonly"], format: ["camelCase", "UPPER_CASE"]},
        {
            selector: "classMethod",
            modifiers: ["public"],
            format: ["PascalCase"],
            filter: {regex: "^(get|set)[A-Z]|^(toString|toJSON|valueOf)$", match: false}
        },
        {
            selector: "typeMethod",
            format: ["PascalCase"],
            filter: {regex: "^(get|set)[A-Z]|^(toString|toJSON|valueOf)$", match: false}
        },
        {selector: ["objectLiteralProperty", "objectLiteralMethod"], format: null}
    ],

    "jsdoc/require-jsdoc": "off",
    "jsdoc/no-types": "off",
    "jsdoc/require-returns": "error",
    "jsdoc/require-param": "error",
    "jsdoc/check-tag-names": "error",
    "jsdoc/check-types": "error",
    "jsdoc/no-defaults": "off",

    "@stylistic/indent": ["error", 4, {SwitchCase: 1}],
    "@stylistic/max-len": ["error", {code: 120, ignoreTemplateLiterals: true, ignoreUrls: true}],
    "@stylistic/semi": ["error", "always", {omitLastInOneLineBlock: false}],
    "@stylistic/quotes": ["error", "double", {allowTemplateLiterals: "always"}],
    "@stylistic/quote-props": ["error", "consistent-as-needed"],
    "@stylistic/comma-dangle": ["error", "never"],
    "@stylistic/comma-spacing": ["error", {before: false, after: true}],
    "@stylistic/object-curly-spacing": ["error", "never", {
        overrides: {ImportDeclaration: "always", ExportNamedDeclaration: "always", ExportAllDeclaration: "always"}
    }],
    // @stylistic would write name ?: Type.
    "@stylistic/type-annotation-spacing": "off",
    "oidis/type-annotation-spacing": "error",
    "@stylistic/array-bracket-spacing": ["error", "never"],
    "@stylistic/brace-style": ["error", "1tbs", {allowSingleLine: false}],
    "@stylistic/arrow-parens": ["error", "always"],
    "@stylistic/arrow-spacing": ["error", {before: true, after: true}],
    "@stylistic/space-before-blocks": ["error", "always"],
    "@stylistic/space-before-function-paren": ["error", {
        anonymous: "always",
        named: "never",
        asyncArrow: "always",
        catch: "always"
    }],
    "@stylistic/space-infix-ops": ["error", {ignoreTypes: false}],
    "@stylistic/space-unary-ops": ["error", {words: true, nonwords: false}],
    "@stylistic/operator-linebreak": ["error", "after"],
    "@stylistic/member-delimiter-style": ["error", {
        multiline: {delimiter: "semi", requireLast: true},
        singleline: {delimiter: "semi", requireLast: false}
    }],
    "@stylistic/lines-between-class-members": ["error", {
        enforce: [
            {blankLine: "always", prev: "*", next: "method"},
            {blankLine: "always", prev: "method", next: "*"}
        ]
    }, {exceptAfterOverload: true, exceptAfterSingleLine: true}],
    "@stylistic/spaced-comment": ["error", "always", {markers: ["!", "/"]}],
    "@stylistic/no-trailing-spaces": "error",
    "@stylistic/no-floating-decimal": "error",
    "@stylistic/no-mixed-operators": "error",
    "@stylistic/eol-last": ["error", "always"],
    "@stylistic/no-multiple-empty-lines": ["error", {max: 1, maxEOF: 0, maxBOF: 0}]
};

export default tseslint.config(
    {
        ignores: ["build/", "dist/", "docs/", "node_modules/"]
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                project: ["./tsconfig.json", "./tsconfig.test.json"],
                tsconfigRootDir: import.meta.dirname
            }
        },
        plugins: {
            "@stylistic": stylistic,
            "oidis": oidis,
            "jsdoc": jsdoc
        },
        rules: RULES
    },
    {
        files: ["src/**/*.ts", "test/integration/**/*.ts", "test/helpers/**/*.ts"],
        languageOptions: {globals: globals.browser}
    },
    {
        files: ["config/*.ts", "**/*.mjs", "test/unit/**/*.ts", "test/e2e/**/*.ts"],
        languageOptions: {globals: globals.node}
    },
    {
        files: ["src/typescript/*.ts"],
        rules: {"no-restricted-imports": ["error", {patterns: [SELF_IMPORT]}]}
    },
    ...Object.entries(MODULES).map(([module, allowed]) => moduleBoundaries(module, allowed)),
    {
        files: ["src/typescript/demos/**/*.ts"],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [
                    ...enginePatterns(null),
                    {
                        regex: `^(\\.\\./)+(${Object.keys(MODULES).join("|")}|index(\\.js)?)(/|$)`,
                        message: "Demos import @oidis-io/oidshaper, not the library sources."
                    }
                ]
            }]
        }
    },
    {
        files: ["**/*.mjs"],
        ...tseslint.configs.disableTypeChecked,
        rules: {
            ...tseslint.configs.disableTypeChecked.rules,
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-member-accessibility": "off"
        }
    }
);
