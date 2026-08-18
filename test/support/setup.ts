import { config } from 'dotenv';

config({ path: '.env.test' });

import { afterEach } from 'vitest';
import { resetDatabase } from './test-data-source';

afterEach(async () => {
  await resetDatabase();
});
