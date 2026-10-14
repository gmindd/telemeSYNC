// Plain-JS worker entry. Node refuses to strip types from a .ts entry inside node_modules (the
// packaged app ships @telemesync/core there), and loader flags in execArgv do not reach a worker
// entry, so tsx is registered here before the TypeScript worker is imported.
import { register } from 'tsx/esm/api';

register();
await import('./renderWorker.ts');
