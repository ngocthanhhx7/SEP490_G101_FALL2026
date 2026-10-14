export function registerModules(app, modules) {
  const names = new Set(), mounts = new Set();
  // Validate the entire plan before mounting anything.
  for (const module of modules) {
    if (!/^[a-z][a-z0-9-]*$/.test(module.name) || names.has(module.name) || mounts.has(module.mount) || !/^\/(?:[a-z0-9/-]*)$/.test(module.mount) || typeof module.router !== 'function') {
      throw new TypeError('Invalid or duplicate module registration');
    }
    names.add(module.name); mounts.add(module.mount);
  }
  for (const module of modules) app.use(module.mount, module.router);
}
