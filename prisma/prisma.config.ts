import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),
  migrate: {
    async development() {
      return {
        // Put your full connection string here
        url: process.env.DATABASE_URL!,
      };
    },
  },
});
