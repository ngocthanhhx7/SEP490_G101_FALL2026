import { test, expect } from '@jest/globals';
import { checkEdge, inspectSource } from '../../scripts/check-architecture.js';

test('rejects back edges and permits explicit composition and component CSS', () => {
  expect(checkEdge('backend', 'services/a.js', 'routes/a.js')).toMatch(
    'cannot import'
  );
  expect(checkEdge('backend', 'controllers/a.js', 'models/a.js')).toMatch(
    'cannot import'
  );
  expect(
    checkEdge(
      'backend',
      'config/provider-ports.js',
      'services/smtp-email.service.js'
    )
  ).toBeNull();
  expect(checkEdge('frontend', 'services/api.js', 'pages/Home.jsx')).toMatch(
    'cannot import'
  );
  expect(
    checkEdge(
      'frontend',
      'components/common/Menu.jsx',
      'components/common/menu.css'
    )
  ).toBeNull();
});

test('AST detects reexports, dynamic imports and route ownership without matching comments', () => {
  const source =
    "// import '../routes/unused.js'\nexport {x} from '../models/a.js'; import('../routes/b.js');";
  expect(inspectSource('backend', 'services/a.js', source).imports).toEqual([
    '../models/a.js',
    '../routes/b.js'
  ]);
  expect(
    inspectSource(
      'backend',
      'routes/a.js',
      "router.get('/', async (req,res)=>res.json({}));"
    ).problems
  ).toHaveLength(1);
  expect(
    inspectSource(
      'backend',
      'routes/a.js',
      "router.get('/', (req,res,next)=>next(), controller.read);"
    ).problems
  ).toHaveLength(0);
  expect(
    inspectSource(
      'frontend',
      'pages/Home.jsx',
      "import {Route} from 'react-router-dom';"
    ).problems
  ).toHaveLength(1);
});

test('blocks named and aliased HTTP handlers and direct route persistence calls', () => {
  for (const source of [
    "function serve(req,res){res.json({})} router.get('/',serve);",
    "import {Router as makeRouter} from 'express';const api=makeRouter();api.get('/',(req,res)=>res.json({}));",
    "const handler=async(req,res)=>res.json({});router.get('/',handler);"
  ])
    expect(
      inspectSource('backend', 'routes/sample.js', source).problems
    ).toHaveLength(1);
  expect(
    inspectSource('backend', 'routes/sample.js', 'await User.find({});')
      .problems
  ).toHaveLength(1);
  expect(
    inspectSource(
      'backend',
      'routes/sample.js',
      "router.get('/',controller.read);"
    ).problems
  ).toHaveLength(0);
});
