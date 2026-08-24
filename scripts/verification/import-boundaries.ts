import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const PURE_ROOTS = ['src/domain', 'src/world'] as const;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const NODE_BUILTINS = new Set(builtinModules.map((moduleName) => moduleName.replace(/^node:/, '')));
const FORBIDDEN_PACKAGES = [
  '@shopify/react-native-skia',
  'electron',
  'expo',
  'react',
  'react-dom',
  'react-native',
  'react-native-reanimated',
  'react-native-web',
  'react-native-worklets',
  'three',
  'zustand',
] as const;
const FORBIDDEN_INTERNAL_SEGMENTS = ['/electron/', '/src/application/', '/src/render/', '/src/ui/'] as const;
export const RENDERER_NEUTRAL_FILES = [
  'src/render/world-frame.ts',
  'src/render/atlas.ts',
  'src/render/depth.ts',
  'src/render/protagonist-wobble.ts',
  'src/render/gait.ts',
  'src/render/impact-motion.ts',
  'src/render/camera.ts',
  'src/render/journal-markers.ts',
  'src/render/district-lighting.ts',
  'src/render/atmosphere.ts',
  'src/render/ground-light.ts',
  'src/render/smoke-geometry.ts',
  'src/render/vfx/procedural-effects.ts',
  'src/render/vfx/clock.ts',
  'src/render/vfx/seed.ts',
  'src/render/vfx/types.ts',
  'src/render/vfx/weather.ts',
] as const;
const DOM_GLOBALS = new Set([
  'document',
  'window',
  'HTMLElement',
  'HTMLCanvasElement',
  'OffscreenCanvas',
  'WebGLRenderingContext',
  'WebGL2RenderingContext',
]);
const TIME_GLOBAL_CALLS = new Set(['requestAnimationFrame', 'setInterval', 'setTimeout']);
const TIME_PROPERTY_CALLS = new Set(['Date.now', 'Math.random', 'performance.now']);
const THREE_CONSTRUCTORS = new Set([
  'Scene',
  'WebGLRenderer',
  'OrthographicCamera',
  'Texture',
  'CanvasTexture',
  'BufferGeometry',
  'InstancedBufferGeometry',
  'ShaderMaterial',
  'MeshBasicMaterial',
  'Mesh',
  'Group',
]);

export type ImportBoundaryViolation = Readonly<{
  file: string;
  line: number;
  moduleName: string;
}>;

function isForbiddenPackage(moduleName: string): boolean {
  const bareModuleName = moduleName.replace(/^node:/, '').split('/')[0] ?? moduleName;
  return (
    NODE_BUILTINS.has(bareModuleName) ||
    moduleName === 'expo' ||
    moduleName.startsWith('expo-') ||
    moduleName.startsWith('expo/') ||
    moduleName.startsWith('@expo/') ||
    FORBIDDEN_PACKAGES.some(
      (packageName) => moduleName === packageName || moduleName.startsWith(`${packageName}/`),
    )
  );
}

function isForbiddenInternalImport(filePath: string, moduleName: string, repositoryRoot: string): boolean {
  if (!moduleName.startsWith('.')) {
    return false;
  }

  const target = resolve(filePath, '..', moduleName);
  const pureRoots = PURE_ROOTS.map((root) => resolve(repositoryRoot, root));
  const remainsPure = pureRoots.some((root) => {
    const relativeTarget = relative(root, target);
    return relativeTarget === '' || (!relativeTarget.startsWith('..') && !isAbsolute(relativeTarget));
  });

  if (!remainsPure) {
    return true;
  }

  const normalizedTarget = target.replaceAll('\\', '/');
  return FORBIDDEN_INTERNAL_SEGMENTS.some((segment) => normalizedTarget.includes(segment));
}

export function findImportBoundaryViolations(
  source: string,
  filePath: string,
  repositoryRoot: string,
): ImportBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const violations: ImportBoundaryViolation[] = [];

  const recordIfForbidden = (moduleName: string, node: ts.Node): void => {
    if (
      isForbiddenPackage(moduleName) ||
      isForbiddenInternalImport(filePath, moduleName, repositoryRoot)
    ) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file: filePath, line: position.line + 1, moduleName });
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      recordIfForbidden(node.moduleSpecifier.text, node.moduleSpecifier);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      recordIfForbidden(node.moduleReference.expression.text, node.moduleReference.expression);
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        recordIfForbidden(argument.text, argument);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

function manifestPathMatches(target: string, repositoryRoot: string): boolean {
  const normalized = target.replaceAll('\\', '/').replace(/\.(?:js|jsx|ts|tsx)$/u, '');
  return RENDERER_NEUTRAL_FILES.some((file) => (
    resolve(repositoryRoot, file).replaceAll('\\', '/').replace(/\.(?:js|jsx|ts|tsx)$/u, '') === normalized
  ));
}

function rendererNeutralImportAllowed(
  filePath: string,
  moduleName: string,
  repositoryRoot: string,
): boolean {
  if (!moduleName.startsWith('.')) return false;
  const target = resolve(filePath, '..', moduleName);
  const allowedRoots = ['src/domain', 'src/world'].map((root) => resolve(repositoryRoot, root));
  if (allowedRoots.some((root) => {
    const relativeTarget = relative(root, target);
    return relativeTarget === '' || (!relativeTarget.startsWith('..') && !isAbsolute(relativeTarget));
  })) return true;
  if (manifestPathMatches(target, repositoryRoot)) return true;
  return target.replaceAll('\\', '/').endsWith('/assets/generated/atlas-index.json');
}

export function findRendererNeutralBoundaryViolations(
  source: string,
  filePath: string,
  repositoryRoot: string,
): ImportBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const violations: ImportBoundaryViolation[] = [];
  const record = (moduleName: string, node: ts.Node): void => {
    if (!rendererNeutralImportAllowed(filePath, moduleName, repositoryRoot)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file: filePath, line: position.line + 1, moduleName });
    }
  };
  const recordForbiddenGlobal = (moduleName: string, node: ts.Node): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ file: filePath, line: position.line + 1, moduleName });
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) record(node.moduleSpecifier.text, node.moduleSpecifier);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) record(node.moduleReference.expression.text, node.moduleReference.expression);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      // The single-argument gate let import('three', {}) and import(spec) through unchecked, so a
      // forbidden dependency could enter a manifest file in dynamic form without failing the scan.
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) record(argument.text, argument);
      else if (argument) record('dynamic-specifier', argument);
    }
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && TIME_GLOBAL_CALLS.has(node.expression.text)) {
        recordForbiddenGlobal(`TIME:${node.expression.text}`, node.expression);
      }
      // Walk through a globalThis or window receiver so globalThis.Date.now() is caught too.
      const receiver = ts.isPropertyAccessExpression(node.expression) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        ts.isIdentifier(node.expression.expression.expression) &&
        ['globalThis', 'window', 'self'].includes(node.expression.expression.expression.text)
        ? node.expression.expression.name
        : ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          ? node.expression.expression
          : undefined;
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        receiver &&
        TIME_PROPERTY_CALLS.has(`${receiver.text}.${node.expression.name.text}`)
      ) {
        recordForbiddenGlobal(`TIME:${receiver.text}.${node.expression.name.text}`, node.expression);
      }
    }
    if (ts.isIdentifier(node) && DOM_GLOBALS.has(node.text)) {
      const parent = node.parent;
      const declarationName =
        (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
        parent.name === node;
      if (!declarationName) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        violations.push({ file: filePath, line: position.line + 1, moduleName: `DOM:${node.text}` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

export function findWorldSceneThreeViolations(
  source: string,
  filePath: string,
): ImportBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: ImportBoundaryViolation[] = [];
  const visit = (node: ts.Node): void => {
    const directThreeImport =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      (node.moduleSpecifier.text === 'three' || node.moduleSpecifier.text.startsWith('three/'));
    const threeNamespace = ts.isIdentifier(node) && node.text === 'THREE';
    const directThreeObject = ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      THREE_CONSTRUCTORS.has(node.expression.text);
    if (directThreeImport || threeNamespace || directThreeObject) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({ file: filePath, line: position.line + 1, moduleName: 'three' });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function sourceFilesUnder(path: string): string[] {
  try {
    return readdirSync(path)
      .flatMap((entry) => {
        const entryPath = join(path, entry);
        return statSync(entryPath).isDirectory() ? sourceFilesUnder(entryPath) : [entryPath];
      })
      .filter(
        (entryPath) =>
          SOURCE_EXTENSIONS.has(extname(entryPath)) &&
          !entryPath.replaceAll('\\', '/').includes('/__tests__/'),
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export function scanPureRoots(repositoryRoot: string): ImportBoundaryViolation[] {
  return PURE_ROOTS.flatMap((root) => sourceFilesUnder(join(repositoryRoot, root))).flatMap((filePath) =>
    findImportBoundaryViolations(readFileSync(filePath, 'utf8'), filePath, repositoryRoot),
  );
}

export function scanRendererNeutralManifest(repositoryRoot: string): ImportBoundaryViolation[] {
  return RENDERER_NEUTRAL_FILES.flatMap((file) => {
    const filePath = resolve(repositoryRoot, file);
    return findRendererNeutralBoundaryViolations(readFileSync(filePath, 'utf8'), filePath, repositoryRoot);
  });
}

export function scanWorldSceneBoundary(repositoryRoot: string): ImportBoundaryViolation[] {
  const filePath = resolve(repositoryRoot, 'src/render/WorldScene.tsx');
  return findWorldSceneThreeViolations(readFileSync(filePath, 'utf8'), filePath);
}
