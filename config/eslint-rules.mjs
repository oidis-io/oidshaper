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

export default {
    rules: {
        "type-annotation-spacing": typeAnnotationSpacing
    }
};
