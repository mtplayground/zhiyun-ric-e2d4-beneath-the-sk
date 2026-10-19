import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Vite transforms the actual TypeScript modules; there is no copied solver.
const options={steps:120,warmup:30,substeps:4,iterations:5,output:null,maxP95Ms:null};
for(let i=2;i<process.argv.length;i+=2) {
  const key={'--steps':'steps','--warmup':'warmup','--substeps':'substeps','--iterations':'iterations','--output':'output','--max-p95-ms':'maxP95Ms'}[process.argv[i]];
  if(!key || process.argv[i+1]===undefined) throw new Error(`Unknown/incomplete option ${process.argv[i]}`);
  options[key]=key==='output'?process.argv[i+1]:Number(process.argv[i+1]);
}
for(const key of ['steps','warmup','substeps','iterations']) if(!Number.isSafeInteger(options[key])||options[key]<(key==='warmup'?0:1)) throw new Error(`Invalid ${key}`);
if(options.maxP95Ms!==null&&(!Number.isFinite(options.maxP95Ms)||options.maxP95Ms<=0)) throw new Error('Invalid p95 budget');
const server=await createServer({root:fileURLToPath(new URL('../',import.meta.url)),server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const [{XpbdSolver},{readMilestoneProxy},{embedSimulationOffsets},{measureDisplacement}]=await Promise.all([
    server.ssrLoadModule('/src/domain/physics/xpbd-solver.ts'),
    server.ssrLoadModule('/src/domain/physics/physics-test-fixture.ts'),
    server.ssrLoadModule('/src/domain/physics/render-embedding.ts'),
    server.ssrLoadModule('/src/domain/physics/physics-telemetry.ts'),
  ]);
  const {asset,assetHash}=readMilestoneProxy();
  const solver=new XpbdSolver({positions:asset.nodes,masses:asset.masses,pairs:asset.pairs,edges:asset.edges,substeps:options.substeps,iterations:options.iterations,gravity:[0,0,0]});
  const timings=[],embeddingTimings=[];
  let resets=0,maximumDisplacement=0,checksum=0;
  // Synthetic skin pulse over the real committed topology. This is explicitly a
  // solver/embedding benchmark, not a claim about an anatomical Smile/AA pose.
  for(let frame=0;frame<options.warmup+options.steps;frame++) {
    const targets=Float64Array.from(asset.nodes);
    for(let i=0;i<asset.pairs.length;i+=2) for(const node of [asset.pairs[i],asset.pairs[i+1]]) targets[node*3+2]+=0.01*Math.sin(frame*0.1);
    const start=performance.now();
    const result=solver.step({poseTargets:targets});
    const stepMs=performance.now()-start;
    const embeddingStart=performance.now();
    const offsets=embedSimulationOffsets(asset,solver.positions,targets);
    const embeddingMs=performance.now()-embeddingStart;
    if(result.reset) resets++;
    if(!solver.positions.every(Number.isFinite)||!offsets.every(Number.isFinite)) throw new Error('Non-finite benchmark result');
    maximumDisplacement=Math.max(maximumDisplacement,measureDisplacement(solver.positions,targets,asset.labels).maxDisplacement);
    if(frame>=options.warmup) {timings.push(stepMs);embeddingTimings.push(embeddingMs);checksum+=offsets[offsets.length-1];}
  }
  const summary=values=>{
    const sorted=[...values].sort((a,b)=>a-b),sum=values.reduce((a,b)=>a+b,0);
    const percentile=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
    return {meanMs:sum/values.length,medianMs:percentile(0.5),p95Ms:percentile(0.95),maxMs:sorted.at(-1)};
  };
  const report={schemaVersion:1,workload:'synthetic-skin-pulse-on-committed-facecap-proxy',environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model},asset:{sha256:assetHash,sourceMeshHash:asset.metadata.sourceHash,counts:asset.metadata.counts},configuration:{...options,timestep:1/60},solver:summary(timings),embedding:summary(embeddingTimings),resets,maximumDisplacement,checksum,finalStateHash:createHash('sha256').update(Buffer.from(solver.positions.buffer)).digest('hex')};
  const json=JSON.stringify(report,null,2)+'\n';
  if(options.output) await writeFile(options.output,json);
  process.stdout.write(json);
  if(resets || options.maxP95Ms!==null&&report.solver.p95Ms>options.maxP95Ms) process.exitCode=1;
} finally {await server.close();}
