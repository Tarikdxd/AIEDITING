import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {projectJsonSchema} from '@aiediting/project-schema';

const out = resolve(process.cwd(), 'schema', 'aiediting.project.schema.json');
mkdirSync(resolve(process.cwd(), 'schema'), {recursive: true});
writeFileSync(out, `${JSON.stringify(projectJsonSchema(), null, 2)}\n`, 'utf8');
console.log(`wrote ${out}`);
