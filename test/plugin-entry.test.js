const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pluginModule = require('../dist/index.js');
const manifestPath = path.join(__dirname, '..', 'openclaw.plugin.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const plugin = pluginModule.default || pluginModule.mem8 || pluginModule;

test('manifest stays consistent with the exported plugin entry', () => {
  assert.equal(manifest.id, 'mem8');
  assert.equal(manifest.kind, 'memory');
  assert.deepEqual(manifest.configSchema, plugin.configSchema);

  assert.equal(plugin.id, manifest.id);
  assert.equal(plugin.kind, manifest.kind);
  assert.equal(typeof plugin.register, 'function');
  assert.equal(typeof plugin.activate, 'function');
});

test('memory plugins expose the documented memory tool names', () => {
  const registeredTools = [];
  const registeredCli = [];
  const registeredHooks = [];

  assert.doesNotThrow(() => {
    plugin.register({
      pluginConfig: {
        embeddingUrl: 'http://ollama.example:11434',
        embeddingProvider: 'ollama'
      },
      registerTool(tool, opts) {
        registeredTools.push({ tool, opts });
      },
      registerCli(registrar, opts) {
        registeredCli.push({ registrar, opts });
      },
      on(hookName, handler) {
        registeredHooks.push({ hookName, handler });
      },
      registerContextEngine() {
        throw new Error('legacy registerContextEngine should not be used');
      }
    });
  });

  assert.ok(registeredTools.length > 0, 'expected registerTool to be used by the memory plugin');
  assert.ok(registeredCli.length > 0, 'expected registerCli to expose memory commands');

  const toolNames = registeredTools.flatMap(({ opts }) => opts?.names || []);
  assert.ok(toolNames.includes('memory_search'));
  assert.ok(toolNames.includes('memory_get'));

  const cliCommands = registeredCli.flatMap(({ opts }) => opts?.commands || []);
  assert.ok(cliCommands.includes('memory'));

  const hookNames = registeredHooks.map(({ hookName }) => hookName);
  assert.ok(hookNames.includes('before_dispatch'));
  assert.ok(hookNames.includes('before_agent_start'));
  assert.ok(hookNames.includes('agent_end'));
});

test('registered memory tools expose OpenClaw-style search/get contracts', async () => {
  const registeredTools = [];

  plugin.register({
    pluginConfig: { embeddingProvider: 'none' },
    registerTool(toolFactory, opts) {
      registeredTools.push({ toolFactory, opts });
    },
    registerCli() {}
  });

  const searchFactory = registeredTools.find(({ opts }) => opts?.names?.includes('memory_search'));
  const getFactory = registeredTools.find(({ opts }) => opts?.names?.includes('memory_get'));

  assert.ok(searchFactory, 'expected memory_search tool registration');
  assert.ok(getFactory, 'expected memory_get tool registration');

  const searchTool = searchFactory.toolFactory({ sessionKey: 'session-test' });
  const getTool = getFactory.toolFactory({});

  assert.equal(searchTool.name, 'memory_search');
  assert.equal(getTool.name, 'memory_get');
  assert.ok('minScore' in searchTool.parameters.properties);
  assert.ok('path' in getTool.parameters.properties);
  assert.ok('id' in getTool.parameters.properties);
});

test('memory plugin registration does not depend on undocumented host APIs', () => {
  const api = {
    pluginConfig: {},
    registerTool() {},
    registerCli() {}
  };

  assert.doesNotThrow(() => {
    plugin.register(api);
  });
});

test('before_dispatch capture persists a user preference that before_agent_start can recall across new sessions', async () => {
  const registeredHooks = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mem8-plugin-'));
  const dbPath = path.join(dir, 'memories.sqlite');
  const stableUserSessionKey = 'agent:main:feishu:direct:ou_97e8de5960c012538fa139c610bf57ce';

  try {
    plugin.register({
      pluginConfig: {
        dbPath,
        embeddingProvider: 'none',
        maxTokensPerAssemble: 120
      },
      registerTool() {},
      registerCli() {},
      on(hookName, handler) {
        registeredHooks.push({ hookName, handler });
      },
      logger: {
        warn() {}
      }
    });

    const beforeDispatch = registeredHooks.find(({ hookName }) => hookName === 'before_dispatch');
    const beforeAgentStart = registeredHooks.find(({ hookName }) => hookName === 'before_agent_start');

    assert.ok(beforeDispatch, 'expected before_dispatch hook registration');
    assert.ok(beforeAgentStart, 'expected before_agent_start hook registration');

    await beforeDispatch.handler(
      {
        content: '我喜欢喝美式咖啡，平时默认点这个。',
        sessionKey: stableUserSessionKey,
        senderId: 'ou_97e8de5960c012538fa139c610bf57ce'
      },
      {
        sessionKey: stableUserSessionKey,
        senderId: 'ou_97e8de5960c012538fa139c610bf57ce'
      }
    );

    const recalled = await beforeAgentStart.handler(
      {
        prompt: '你还记得我喜欢喝什么咖啡吗？'
      },
      {
        sessionKey: stableUserSessionKey
      }
    );

    assert.ok(recalled);
    assert.equal(typeof recalled.prependContext, 'string');
    assert.match(recalled.prependContext, /美式咖啡/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
