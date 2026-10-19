import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('capture URL from actual CLI response shape; missing URL fails without replacing last release',()=>{
 const dir=mkdtempSync(join(tmpdir(),'capture-release-'));
 try {
  mkdirSync(join(dir,'scripts'));mkdirSync(join(dir,'bin'));
  cpSync('scripts/capture-deploy-url.sh',join(dir,'scripts/capture-deploy-url.sh'));
  const cli=join(dir,'bin/sprite');
  writeFileSync(cli,'#!/bin/sh\nprintf \'%s\' \'{"url":"https://example.sprites.app"}\'\n',{mode:0o755});
  const run=()=>spawnSync('bash',[join(dir,'scripts/capture-deploy-url.sh')],{env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH},encoding:'utf8'});
  assert.equal(run().status,0);assert.equal(readFileSync(join(dir,'.deploy_url'),'utf8'),'https://example.sprites.app\n');
  writeFileSync(cli,'#!/bin/sh\nprintf \'%s\' \'{}\'\n',{mode:0o755});
  assert.notEqual(run().status,0);assert.equal(readFileSync(join(dir,'.deploy_url'),'utf8'),'https://example.sprites.app\n');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
