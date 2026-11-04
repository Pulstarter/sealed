import { createApp } from './app.js';
import { runtimeGeneration,runtimeEmotional } from './runtime-config.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port');
const app = createApp({generation:runtimeGeneration(process.env),emotional:runtimeEmotional(process.env)});
const address = await app.listen(port, process.env.HOST ?? '127.0.0.1');
console.log(`SEALED listening at ${address}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void app.close().then(() => process.exit(0));
});
