import { z } from 'zod';

import { ConfigSchema } from '@/schemas/config';

export type ConfigType = z.infer<typeof ConfigSchema>;
