import { canonicalJson } from '@motion-engine/core';

import { buildCertificationPair } from './p1.6-support.ts';

const pair = buildCertificationPair();
process.stdout.write(canonicalJson(pair.semantic));
