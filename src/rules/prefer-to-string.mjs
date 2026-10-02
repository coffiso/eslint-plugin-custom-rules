/** @file `.toString()` を安全に直接呼び出せる値では、`String()` より `.toString()` を優先します。 */

import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";
import ts from "typescript";

const createRule = ESLintUtils.RuleCreator((name) => `https://github.com/coffiso/eslint-plugin-custom-rules/blob/main/src/rules/${name}.mjs`);

/**
 * 識別子が組み込みのグローバル `String` を参照しているかを返します。
 *
 * @param {import("@typescript-eslint/utils").TSESTree.Node} node
 * @param {import("@typescript-eslint/utils").TSESLint.SourceCode} sourceCode
 * @returns {boolean}
 */
const isGlobalStringBinding = (node, sourceCode) => {
    let scope = sourceCode.getScope(node);

    while (true) {
        const variable = scope.set.get("String");

        if (variable) {
            return variable.defs.length === 0 && scope.type === "global";
        }

        if (!scope.upper) {
            return false;
        }

        scope = scope.upper;
    }
};

/**
 * 型に nullish 型の構成要素が含まれているかを返します。
 *
 * @param {import("typescript").Type} type
 * @returns {boolean}
 */
const includesNullish = (type) => {
    if (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) {
        return true;
    }

    return type.isUnion() && type.types.some(includesNullish);
};

/**
 * 型がこのルールの対象外かを返します。
 *
 * @param {import("typescript").Type} type
 * @returns {boolean}
 */
const isExcludedType = (type) => {
    if (
        type.flags & (
            ts.TypeFlags.Any
            | ts.TypeFlags.Unknown
            | ts.TypeFlags.Never
            | ts.TypeFlags.Null
            | ts.TypeFlags.Undefined
            | ts.TypeFlags.Void
        )
    ) {
        return true;
    }

    return type.isUnion() && type.types.some(isExcludedType);
};

/**
 * 型がプリミティブ型だけで構成されているかを返します。
 *
 * @param {import("typescript").Type} type
 * @returns {boolean}
 */
const isPrimitiveType = (type) => {
    if (type.isUnion()) {
        return type.types.every(isPrimitiveType);
    }

    return (type.flags & (
        ts.TypeFlags.StringLike
        | ts.TypeFlags.NumberLike
        | ts.TypeFlags.BooleanLike
        | ts.TypeFlags.BigIntLike
        | ts.TypeFlags.ESSymbolLike
        | ts.TypeFlags.EnumLike
    )) !== 0;
};

/**
 * すべての型構成要素で、引数なしの `toString()` を呼び出せるかを返します。
 *
 * @param {import("typescript").Type} type
 * @param {import("typescript").TypeChecker} checker
 * @param {import("typescript").Node} location
 * @returns {boolean}
 */
const canCallToString = (type, checker, location) => {
    const constituents = type.isUnion() ? type.types : [type];

    return constituents.every((constituent) => {
        const property = checker.getPropertyOfType(constituent, "toString");

        if (!property || property.flags & ts.SymbolFlags.Optional) {
            return false;
        }

        const propertyType = checker.getTypeOfSymbolAtLocation(property, location);

        if (includesNullish(propertyType)) {
            return false;
        }

        const signatures = checker.getSignaturesOfType(propertyType, ts.SignatureKind.Call);

        return signatures.some((signature) => {
            if (
                signature.thisParameter
                && !checker.isTypeAssignableTo(
                    constituent,
                    checker.getTypeOfSymbolAtLocation(signature.thisParameter, location),
                )
            ) {
                return false;
            }

            return signature.parameters.every((parameter) => {
                const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];

                if (!declaration || !ts.isParameter(declaration)) {
                    return false;
                }

                return declaration.dotDotDotToken !== undefined || declaration.questionToken !== undefined || declaration.initializer !== undefined;
            });
        });
    });
};

/**
 * 自動修正で削除されるコメントが呼び出し内に含まれていないかを返します。
 *
 * @param {import("@typescript-eslint/utils").TSESTree.CallExpression} node
 * @param {import("@typescript-eslint/utils").TSESLint.SourceCode} sourceCode
 * @returns {boolean}
 */
const hasNoComments = (node, sourceCode) => !sourceCode.getAllComments().some((comment) => (
    comment.range[0] >= node.range[0] && comment.range[1] <= node.range[1]
));

/**
 * メンバーアクセスに括弧が必要な場合、括弧を付けた式の文字列を返します。
 *
 * @param {import("@typescript-eslint/utils").TSESTree.Expression} node
 * @param {import("@typescript-eslint/utils").TSESLint.SourceCode} sourceCode
 * @returns {string}
 */
const getMemberAccessBase = (node, sourceCode) => {
    const text = sourceCode.getText(node);

    if (
        node.type === AST_NODE_TYPES.Identifier
        || node.type === AST_NODE_TYPES.MemberExpression
        || node.type === AST_NODE_TYPES.CallExpression
        || node.type === AST_NODE_TYPES.ThisExpression
    ) {
        return text;
    }

    return `(${text})`;
};

export default createRule({
    name: "prefer-to-string",
    meta: {
        type: "suggestion",
        docs: {
            description: "Prefer `.toString()` over `String()` when the value is safe to stringify directly.",
        },
        fixable: "code",
        messages: {
            useToString: "Use {{argument}}.toString() instead of String({{argument}}).",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const services = ESLintUtils.getParserServices(context);
        const checker = services.program.getTypeChecker();

        return {
            CallExpression(node) {
                if (
                    node.callee.type !== AST_NODE_TYPES.Identifier
                    || node.callee.name !== "String"
                    || node.arguments.length !== 1
                    || !isGlobalStringBinding(node, context.sourceCode)
                ) {
                    return;
                }

                const [argument] = node.arguments;

                if (!argument || argument.type === AST_NODE_TYPES.SpreadElement) {
                    return;
                }

                const tsArgument = services.esTreeNodeToTSNodeMap.get(argument);
                let argumentType = checker.getTypeAtLocation(tsArgument);

                if (argumentType.flags & ts.TypeFlags.TypeParameter) {
                    const constraint = checker.getBaseConstraintOfType(argumentType);

                    if (!constraint) {
                        return;
                    }

                    argumentType = constraint;
                }

                if (
                    isExcludedType(argumentType)
                    || !canCallToString(argumentType, checker, tsArgument)
                ) {
                    return;
                }

                const argumentText = context.sourceCode.getText(argument);
                const canAutofix = isPrimitiveType(argumentType) && hasNoComments(node, context.sourceCode);

                context.report({
                    node,
                    messageId: "useToString",
                    data: { argument: argumentText },
                    fix: canAutofix
                        ? (fixer) => fixer.replaceText(node, `${getMemberAccessBase(argument, context.sourceCode)}.toString()`)
                        : undefined,
                });
            },
        };
    },
});
