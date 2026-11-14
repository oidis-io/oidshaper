/*! ******************************************************************************************************** *
 *
 * Copyright 2026 Oidis
 *
 * SPDX-License-Identifier: BSD-3-Clause
 * The BSD-3-Clause license for this file can be found in the LICENSE file included with this distribution
 * or at https://spdx.org/licenses/BSD-3-Clause.html#licenseText
 *
 * ********************************************************************************************************* */

// name : Type, name? : Type, () : void.
const typeAnnotationSpacing = {
    meta: {
        type: "layout",
        fixable: "whitespace",
        schema: [],
        messages: {
            space: "Expected whitespace between '{{left}}' and '{{right}}'.",
            adjacent: "Unexpected whitespace before '{{right}}'."
        }
    },
    create(context) {
        const source = context.sourceCode;

        function checkGap(left, right, space) {
            if (!left || !right) {
                return;
            }
            const range = [left.range[1], right.range[0]];
            const gap = source.text.slice(range[0], range[1]);
            if (gap.trim() !== "" || (gap.length > 0) === space) {
                return;
            }
            context.report({
                loc: right.loc,
                messageId: space ? "space" : "adjacent",
                data: {left: left.value, right: right.value},
                fix: (fixer) => fixer.replaceTextRange(range, space ? " " : "")
            });
        }

        function checkAnnotation(type) {
            if (!type) {
                return;
            }
            let separator = source.getTokenBefore(type);
            while (separator?.value === "(") {
                separator = source.getTokenBefore(separator);
            }
            if (separator?.value !== ":" && separator?.value !== "=>") {
                return;
            }
            const previous = source.getTokenBefore(separator);
            checkGap(previous, separator, true);
            checkGap(separator, source.getTokenAfter(separator), true);
            if (separator.value === ":" && previous?.value === "?") {
                let marker = previous;
                let owner = source.getTokenBefore(marker);
                if (owner?.value === "+" || owner?.value === "-") {
                    checkGap(owner, marker, false);
                    marker = owner;
                    owner = source.getTokenBefore(marker);
                }
                checkGap(owner, marker, false);
            }
        }

        return {
            TSTypeAnnotation: (node) => checkAnnotation(node.typeAnnotation),
            TSMappedType: (node) => checkAnnotation(node.typeAnnotation),
            TSNamedTupleMember: (node) => checkAnnotation(node.elementType)
        };
    }
};

const callableInterfaces = {
    meta: {
        type: "suggestion",
        schema: [],
        messages: {named: "Declare a named interface with a call or construct signature."}
    },
    create(context) {
        const check = (node) => context.report({node, messageId: "named"});
        return {TSFunctionType: check, TSConstructorType: check};
    }
};

const structuredContracts = {
    meta: {
        type: "suggestion",
        schema: [],
        messages: {
            enumeration: "Declare an enum for a fixed set of values.",
            union: "Use structured operation contracts instead of a union of interfaces.",
            members: "Put interface braces and each member on separate lines.",
            constant: "Declare this constant as a static readonly field of its owning class."
        }
    },
    create(context) {
        return {
            TSTypeAliasDeclaration(node) {
                const value = node.typeAnnotation;
                if (value.type !== "TSUnionType") {
                    return;
                }
                if (value.types.every((member) => member.type === "TSTypeReference")) {
                    context.report({node, messageId: "union"});
                }
            },
            TSUnionType(node) {
                if (node.types.every((member) => member.type === "TSLiteralType")) {
                    context.report({node, messageId: "enumeration"});
                }
            },
            TSInterfaceBody(node) {
                if (node.body.length === 0) {
                    return;
                }
                const members = node.body;
                if (node.loc.start.line === members[0].loc.start.line ||
                    node.loc.end.line === members.at(-1).loc.end.line ||
                    members.some((member, index) => index > 0 &&
                        members[index - 1].loc.end.line === member.loc.start.line)) {
                    context.report({node, messageId: "members"});
                }
            },
            VariableDeclaration(node) {
                if (node.kind === "const" && ["Program", "ExportNamedDeclaration"].includes(node.parent.type)) {
                    context.report({node, messageId: "constant"});
                }
            }
        };
    }
};

const importGroups = {
    meta: {
        type: "layout",
        schema: [],
        messages: {
            order: "Place runtime imports before the import type block.",
            separate: "Move inline type specifiers into a separate import type declaration.",
            gap: "Separate runtime imports and import type with a blank line."
        }
    },
    create(context) {
        return {
            Program(node) {
                let firstType;
                let previous;
                for (const declaration of node.body.filter((item) => item.type === "ImportDeclaration")) {
                    if (declaration.importKind === "type") {
                        firstType ??= declaration;
                        const gap = previous ?
                            context.sourceCode.text.slice(previous.range[1], declaration.range[0]) : "";
                        if (previous && previous.importKind !== "type" && !/\r?\n[ \t]*\r?\n/u.test(gap)) {
                            context.report({node: declaration, messageId: "gap"});
                        }
                    } else {
                        if (firstType) {
                            context.report({node: declaration, messageId: "order"});
                        }
                        if (declaration.specifiers.some((specifier) => specifier.importKind === "type")) {
                            context.report({node: declaration, messageId: "separate"});
                        }
                    }
                    previous = declaration;
                }
            }
        };
    }
};

const classStructureRestrictions = [
    {
        selector: "FunctionDeclaration",
        message: "Declare this function as a method of the owning class."
    },
    {
        selector: "Program > VariableDeclaration > " +
            "VariableDeclarator[init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]",
        message: "Move this standalone function into a class."
    },
    {
        selector: "ExportNamedDeclaration > VariableDeclaration > " +
            "VariableDeclarator[init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]",
        message: "Export a class method instead of a standalone function."
    },
    {
        selector: "ExportDefaultDeclaration > :matches(ArrowFunctionExpression, FunctionExpression)",
        message: "Export a class instead of a standalone function."
    },
    {
        selector: "ObjectPattern",
        message: "Access object properties explicitly instead of using object destructuring."
    },
    {
        selector: "TSParameterProperty",
        message: "Declare the class field explicitly and assign it in the constructor."
    }
];

const oidisPlugin = {
    rules: {
        "type-annotation-spacing": typeAnnotationSpacing,
        "callable-interfaces": callableInterfaces,
        "structured-contracts": structuredContracts,
        "import-groups": importGroups
    }
};

export { oidisPlugin, classStructureRestrictions };
