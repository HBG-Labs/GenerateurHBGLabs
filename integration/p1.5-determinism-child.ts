import { buildP14Pipeline } from './p1.4-support.ts';

const pipeline = buildP14Pipeline();
process.stdout.write(JSON.stringify({ signal: pipeline.signalPipeline.hashes, nocturne: pipeline.nocturnePipeline.hashes }));
