// Finds text in the app's sources that is shown to the user but not taken from the i18n catalogues (src/lib/i18n):
// JSX text, text props (label, tooltip, placeholder …) and string literals that read like words. The app's tsconfig has
// no Node types, so the two Node modules used here are declared locally (as in fixtures.ts).
import ts from 'typescript';

interface FileSystem {
  readdirSync(directory: string): string[];
  readFileSync(file: string, encoding: 'utf8'): string;
  statSync(file: string): { isDirectory(): boolean };
}
interface PathUtils {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  relative(from: string, to: string): string;
}
declare const require: (id: string) => unknown;
declare const __dirname: string;
const fs = require('fs') as FileSystem;
const path = require('path') as PathUtils;

export const SOURCE_ROOT = path.resolve(__dirname, '../src');

/** Folders whose files hold no shown text of their own: the catalogues themselves and codegen specs. */
const SKIPPED_FOLDERS = ['lib/i18n', 'native/specs'];

/** JSX props whose string value is shown (or read by VoiceOver). */
const TEXT_PROPS = new Set(['label', 'text', 'title', 'tooltip', 'placeholder', 'accessibilityLabel', 'accessibilityHint', 'heading', 'message', 'hint', 'caption', 'emptyText', 'prompt', 'description', 'subtitle']);

/** Calls whose string arguments are message keys or module names, not text. */
const KEY_CALLS = new Set(['t', 'translate', 'isMessageKey', 'require']);

/** A comment on the same line or the line above (`i18n-exempt: why`), or at the top of a file (`i18n-exempt-file: why`). */
const EXEMPT_LINE = /i18n-exempt:\s*\S/;
const EXEMPT_FILE = /i18n-exempt-file:\s*\S/;

export interface UntranslatedString {
  /** Relative to src/. */
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Whether a literal reads like words: two words, a capitalised word, or a menu item's "…". */
export function readsLikeText(text: string): boolean {
  const trimmed = text.trim();
  if (!/[A-Za-z]{2,}/.test(trimmed)) {
    return false;
  }
  return /[A-Za-z][^\n]*\s[^\n]*[A-Za-z]/.test(trimmed) || /^[A-Z][a-z]+/.test(trimmed) || trimmed.includes('…');
}

function listSources(folder: string): readonly string[] {
  return fs.readdirSync(folder).flatMap((name) => {
    const full = path.join(folder, name);
    if (fs.statSync(full).isDirectory()) {
      return SKIPPED_FOLDERS.includes(path.relative(SOURCE_ROOT, full)) ? [] : listSources(full);
    }
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function isKeyCallArgument(node: ts.Node): boolean {
  const parent = node.parent;
  return ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && KEY_CALLS.has(parent.expression.text) && parent.arguments.includes(node as ts.Expression);
}

/** Literals in places that are never shown: keys, comparisons, cases, types, JSX props that are not text. */
function isCodeLiteral(node: ts.Node): boolean {
  const parent = node.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertySignature(parent)) && parent.name === node) {
    return true;
  }
  if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) {
    return true;
  }
  // A prop's value, written as a string or in braces: shown only for text props (not testID={`row-${id}`}).
  const attribute = ts.isJsxAttribute(parent) ? parent : ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) ? parent.parent : undefined;
  if (attribute !== undefined) {
    return !TEXT_PROPS.has(attribute.name.getText());
  }
  return ts.isElementAccessExpression(parent) || ts.isCaseClause(parent) || ts.isLiteralTypeNode(parent) || isKeyCallArgument(node);
}

function isShownText(node: ts.Node): string | undefined {
  if (ts.isJsxText(node)) {
    const text = node.text.trim();
    return /\p{L}/u.test(text) ? text : undefined;
  }
  const isWhole = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
  const isPart = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
  if (!isWhole && !isPart) {
    return undefined;
  }
  // A template's parts are judged where the whole template stands.
  const expression = isWhole ? node : ts.isTemplateHead(node) ? node.parent : node.parent.parent;
  if (isCodeLiteral(expression)) {
    return undefined;
  }
  const inTextProp = ts.isJsxExpression(expression.parent) ? ts.isJsxAttribute(expression.parent.parent) : ts.isJsxAttribute(expression.parent);
  return (inTextProp && /[A-Za-z]/.test(node.text)) || readsLikeText(node.text) ? node.text : undefined;
}

function isExempt(lines: readonly string[], line: number): boolean {
  return EXEMPT_LINE.test(lines[line] ?? '') || EXEMPT_LINE.test(lines[line - 1] ?? '');
}

/** The untranslated strings of one source file. */
export function findUntranslatedIn(file: string, source: string): readonly UntranslatedString[] {
  if (EXEMPT_FILE.test(source.slice(0, 600))) {
    return [];
  }
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split('\n');
  const found: UntranslatedString[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || (ts.isTypeNode(node) && !ts.isTypeQueryNode(node))) {
      return;
    }
    const text = isShownText(node);
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line;
    if (text !== undefined && !isExempt(lines, line)) {
      found.push({ file, line: line + 1, text });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/** Every untranslated string under src/. */
export function findUntranslatedStrings(): readonly UntranslatedString[] {
  return listSources(SOURCE_ROOT).flatMap((full) => findUntranslatedIn(path.relative(SOURCE_ROOT, full), fs.readFileSync(full, 'utf8')));
}
