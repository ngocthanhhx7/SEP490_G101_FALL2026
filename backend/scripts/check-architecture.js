import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forbidden = {
  backend: {
    services: ['routes', 'controllers', 'middlewares', 'jobs'],
    controllers: ['routes', 'models', 'jobs', 'middlewares'],
    models: ['services', 'controllers', 'routes', 'middlewares', 'jobs'],
    validators: [
      'services',
      'controllers',
      'routes',
      'models',
      'middlewares',
      'jobs'
    ],
    utils: [
      'services',
      'controllers',
      'routes',
      'models',
      'middlewares',
      'jobs',
      'config',
      'validators'
    ],
    constants: [
      'services',
      'controllers',
      'routes',
      'models',
      'middlewares',
      'jobs',
      'config',
      'validators'
    ],
    config: ['services', 'controllers', 'routes', 'middlewares', 'jobs'],
    jobs: ['controllers', 'routes', 'middlewares']
  },
  frontend: {
    app: ['pages'],
    layouts: ['pages', 'routes', 'app'],
    components: ['pages', 'routes', 'app', 'layouts'],
    services: [
      'pages',
      'components',
      'layouts',
      'routes',
      'app',
      'contexts',
      'hooks'
    ],
    hooks: ['pages', 'routes', 'app', 'layouts', 'components'],
    contexts: ['pages', 'routes', 'app', 'layouts'],
    utils: [
      'pages',
      'components',
      'layouts',
      'routes',
      'app',
      'contexts',
      'hooks',
      'services'
    ],
    constants: [
      'pages',
      'components',
      'layouts',
      'routes',
      'app',
      'contexts',
      'hooks',
      'services'
    ]
  }
};

export function checkEdge(side, source, target) {
  const from = source.split('/')[0],
    to = target.split('/')[0];
  if (
    side === 'backend' &&
    source === 'config/provider-ports.js' &&
    to === 'services'
  )
    return null;
  return forbidden[side]?.[from]?.includes(to)
    ? `${side}/${source} cannot import ${target}`
    : null;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

export function inspectSource(side, source, text) {
  const ast = parse(text, { sourceType: 'unambiguous', plugins: ['jsx'] });
  const imports = [],
    problems = [];
  const localFunctions = new Map(),
    routers = new Set(['router']),
    routerFactories = new Set(['Router']);
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration' && node.source.value === 'express') {
      for (const specifier of node.specifiers) {
        if (specifier.imported?.name === 'Router')
          routerFactories.add(specifier.local.name);
      }
    }
  });
  walk(ast, (node) => {
    if (node.type === 'FunctionDeclaration' && node.id)
      localFunctions.set(node.id.name, node);
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      if (
        ['ArrowFunctionExpression', 'FunctionExpression'].includes(
          node.init?.type
        )
      )
        localFunctions.set(node.id.name, node.init);
      if (
        node.init?.type === 'CallExpression' &&
        (routerFactories.has(node.init.callee?.name) ||
          node.init.callee?.property?.name === 'Router')
      )
        routers.add(node.id.name);
    }
  });
  walk(ast, (node) => {
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration'
      ].includes(node.type) &&
      node.source
    ) {
      imports.push(node.source.value);
      if (
        side === 'frontend' &&
        source.startsWith('pages/') &&
        node.source.value === 'react-router-dom' &&
        node.specifiers?.some((specifier) =>
          ['Route', 'Routes'].includes(specifier.imported?.name)
        )
      ) {
        problems.push(`${side}/${source}: route manifests belong in routes`);
      }
    }
    if (
      node.type === 'ImportExpression' &&
      node.source?.type === 'StringLiteral'
    )
      imports.push(node.source.value);
    if (
      node.type === 'CallExpression' &&
      (node.callee?.type === 'Import' || node.callee?.name === 'require') &&
      node.arguments[0]?.type === 'StringLiteral'
    )
      imports.push(node.arguments[0].value);
    if (
      side === 'backend' &&
      source.startsWith('routes/') &&
      node.type === 'CallExpression' &&
      routers.has(node.callee?.object?.name) &&
      ['get', 'post', 'put', 'patch', 'delete'].includes(
        node.callee.property?.name
      )
    ) {
      for (const arg of node.arguments.slice(1)) {
        const handler =
          arg.type === 'Identifier' ? localFunctions.get(arg.name) : arg;
        if (
          (['ArrowFunctionExpression', 'FunctionExpression'].includes(
            handler?.type
          ) &&
            handler.params.length < 3) ||
          (handler?.type === 'FunctionDeclaration' && handler.params.length < 3)
        ) {
          problems.push(
            `${side}/${source}:${arg.loc.start.line}: HTTP handlers belong in controllers`
          );
        }
      }
    }
    if (
      side === 'backend' &&
      source.startsWith('routes/') &&
      node.type === 'CallExpression' &&
      [
        'find',
        'findOne',
        'findById',
        'exists',
        'aggregate',
        'insertMany',
        'updateOne',
        'updateMany',
        'deleteOne',
        'deleteMany',
        'findOneAndUpdate',
        'countDocuments',
        'bulkWrite',
        'transaction',
        'startSession'
      ].includes(node.callee?.property?.name)
    ) {
      problems.push(
        `${side}/${source}:${node.loc.start.line}: data queries/transactions belong in services`
      );
    }
  });
  return { imports, problems };
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? files(path)
      : ['.js', '.jsx'].includes(extname(path))
        ? [path]
        : [];
  });
}

export function checkArchitecture(projectRoot = root) {
  const problems = [],
    graph = new Map();
  for (const side of ['frontend', 'backend']) {
    const src = resolve(projectRoot, side, 'src');
    for (const path of files(src)) {
      const source = relative(src, path).replaceAll('\\', '/');
      if (side === 'backend' && source.startsWith('ai/'))
        problems.push('backend/src/ai must use the documented domain packages');
      const result = inspectSource(side, source, readFileSync(path, 'utf8'));
      problems.push(...result.problems);
      const edges = [];
      for (const specifier of result.imports.filter((value) =>
        value.startsWith('.')
      )) {
        const targetPath = resolve(dirname(path), specifier);
        if (!existsSync(targetPath)) {
          problems.push(`${side}/${source}: missing import ${specifier}`);
          continue;
        }
        const target = relative(src, targetPath).replaceAll('\\', '/');
        const violation = checkEdge(side, source, target);
        if (violation) problems.push(violation);
        edges.push(`${side}/${target}`);
      }
      graph.set(`${side}/${source}`, edges);
    }
  }
  for (const source of graph.keys()) {
    const matching = source.startsWith('backend/services/sitter-matching/');
    const pricing = source.startsWith('backend/services/pricing/');
    if (!matching && !pricing) continue;
    const queue = [...(graph.get(source) || [])],
      seen = new Set();
    while (queue.length) {
      const target = queue.pop();
      if (seen.has(target)) continue;
      seen.add(target);
      if (
        (matching &&
          (target.startsWith('backend/services/pricing/') ||
            target === 'backend/models/pricing.model.js')) ||
        (pricing && target.startsWith('backend/services/sitter-matching/'))
      ) {
        problems.push(`${source}: domain dependency reaches ${target}`);
      }
      queue.push(...(graph.get(target) || []));
    }
  }
  return [...new Set(problems)];
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const problems = checkArchitecture();
  problems.forEach((problem) => console.error(problem));
  if (problems.length) process.exitCode = 1;
  else console.log('Package architecture check passed');
}
