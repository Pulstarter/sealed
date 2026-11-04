import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeGeneration } from '../src/runtime-config.js';

test('runtime generation requires explicit enablement and rejects invalid limits before listening',()=>{
  assert.equal(runtimeGeneration({MODEL_API_KEY:'test-only-key'}),undefined);
  assert.throws(()=>runtimeGeneration({META_GENERATION_ENABLED:'1'}),/credentials/);
  assert.throws(()=>runtimeGeneration({META_GENERATION_ENABLED:'1',MODEL_API_KEY:'test-only-key',META_GENERATION_MAX_JOBS:'NaN'}),/limit/i);
  assert.throws(()=>runtimeGeneration({META_GENERATION_ENABLED:'1',MODEL_API_KEY:'test-only-key',META_GENERATION_DAILY_JOBS:'0'}),/limit/i);
});
test('runtime reads the server key from a private file without placing credentials in public configuration',async t=>{
  const root=await mkdtemp(join(tmpdir(),'sealed-key-fixture-'));t.after(()=>rm(root,{recursive:true,force:true}));const path=join(root,'key');await writeFile(path,'test-only-key\n',{mode:0o600});
  const options=runtimeGeneration({META_GENERATION_ENABLED:'1',MODEL_API_KEY_FILE:path,META_GENERATION_MAX_JOBS:'100',META_GENERATION_DAILY_JOBS:'20'});assert.equal(options?.apiKey,'test-only-key');assert.equal(options?.maxJobs,100);assert.equal(options?.dailyJobs,20);
});
