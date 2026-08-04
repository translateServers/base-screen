const registrations = new Map();
const touchedStorage = [];
const globals = ['customElements', 'localStorage', 'sessionStorage'].map((name) => [
  name,
  Object.getOwnPropertyDescriptor(globalThis, name),
]);

Object.defineProperty(globalThis, 'customElements', {
  configurable: true,
  value: {
    define: (name, constructor) => registrations.set(name, constructor),
    get: (name) => registrations.get(name),
  },
});
for (const name of ['localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get: () => {
      touchedStorage.push(name);
      return undefined;
    },
  });
}

try {
  await import('../packages/engine/dist/index.js');
} finally {
  for (const [name, previous] of globals) {
    if (previous === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, previous);
  }
}

if (registrations.has('base-screen-designer')) {
  throw new Error('ENGINE_IMPORT_REGISTERED_DESIGNER');
}
if (touchedStorage.length > 0) {
  throw new Error(`ENGINE_IMPORT_TOUCHED_STORAGE:${touchedStorage.join(',')}`);
}
