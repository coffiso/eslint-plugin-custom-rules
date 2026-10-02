import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TSESLint } from "@typescript-eslint/utils";
import typeScriptEslint from "typescript-eslint";
import preferToString from "../../src/rules/prefer-to-string.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "../..");

TSESLint.RuleTester.describe = describe;
TSESLint.RuleTester.it = it;

const ruleTester = new TSESLint.RuleTester({
    languageOptions: {
        parser: typeScriptEslint.parser,
        parserOptions: {
            projectService: { allowDefaultProject: ["estree.ts"] },
            tsconfigRootDir: projectRoot,
        },
    },
});

ruleTester.run("prefer-to-string", preferToString, {
    valid: [
        "function example(value: number | null): void { String(value); }",
        "function example(value: number | undefined): void { String(value); }",
        "function example(value: number | string | null): void { String(value); }",
        "String(null);",
        "String(undefined);",
        "function example(value: void): void { String(value); }",
        "declare const value: never; String(value);",
        "const value: unknown = 1; String(value);",
        "const value: any = 1; String(value);",
        "String();",
        "String(1, 2);",
        "interface RequiredArgument { toString(prefix: string): string } const value = null as unknown as RequiredArgument; String(value);",
        "interface OptionalMethod { toString?(): string } const value = null as unknown as OptionalMethod; String(value);",
        "interface IncompatibleReceiver { toString(this: never): string } const value = null as unknown as IncompatibleReceiver; String(value);",
        "function example(): void { const String = (value: number): string => `${value}`; String(1); }",
    ],
    invalid: [
        {
            code: "const value: string = 'foo'; String(value);",
            output: "const value: string = 'foo'; value.toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "String(1);",
            output: "(1).toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "String(true);",
            output: "(true).toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "String(123n);",
            output: "(123n).toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "String(Symbol('foo'));",
            output: "Symbol('foo').toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "const n: number = 123; String(n);",
            output: "const n: number = 123; n.toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "const value: number | string = 1; String(value);",
            output: "const value: number | string = 1; value.toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "class User { toString(): number { return 123; } } const value = new User(); String(value);",
            output: null,
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "class RestArgument { toString(...prefixes: string[]): string { return ''; } } const value = new RestArgument(); String(value);",
            output: null,
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "String({});",
            output: null,
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "String([]);",
            output: null,
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "class CustomPrimitive { toString(): string { return 'toString'; } [Symbol.toPrimitive](hint: 'string' | 'number' | 'default'): string { return hint; } } const value = new CustomPrimitive(); String(value);",
            output: null,
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "const obj: { value: number } = { value: 1 }; String(obj.value);",
            output: "const obj: { value: number } = { value: 1 }; obj.value.toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "function example(left: number, right: number): void { String(left + right); }",
            output: "function example(left: number, right: number): void { (left + right).toString(); }",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "function getValue(): number { return 1; } String(getValue());",
            output: "function getValue(): number { return 1; } getValue().toString();",
            errors: [{ messageId: "useToString" }],
        },
        {
            code: "const value: number = 1; String(/* preserve this comment */ value);",
            output: null,
            errors: [{ messageId: "useToString" }],
        },
    ],
});
