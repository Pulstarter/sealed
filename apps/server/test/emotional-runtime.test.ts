import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeEmotional} from '../src/runtime-config.js';
test('preview generation is opt-in and has separate bounded preparation limits',()=>{
  assert.equal(runtimeEmotional({MODEL_API_KEY:'private-test'}),undefined);
  const value=runtimeEmotional({META_EMOTIONAL_ENABLED:'1',MODEL_API_KEY:'private-test',META_EMOTIONAL_DAILY_JOBS:'2',META_EMOTIONAL_DAILY_ESTIMATE_USD:'1.5'});assert.equal(value!.dailyJobs,2);assert.equal(value!.dailyEstimateUsd,1.5);assert.equal(value!.apiKey,'private-test');
});
test('enabled preview refuses missing credentials and invalid or zero limits before starting',()=>{
  for(const env of [{META_EMOTIONAL_ENABLED:'1'},{META_EMOTIONAL_ENABLED:'1',MODEL_API_KEY:'private-test',META_EMOTIONAL_MAX_JOBS:'0'},{META_EMOTIONAL_ENABLED:'1',MODEL_API_KEY:'private-test',META_EMOTIONAL_DAILY_JOBS:'1.5'},{META_EMOTIONAL_ENABLED:'1',MODEL_API_KEY:'private-test',META_EMOTIONAL_DAILY_ESTIMATE_USD:'NaN'}])assert.throws(()=>runtimeEmotional(env));
});
