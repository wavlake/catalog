import { PrismaClient } from "@prisma/client";

// Instantiate Prisma client here using env vars because Prisma schema file
// does not support string interpolation of env vars
// Ref: https://github.com/prisma/prisma/issues/3310
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}?schema=public`,
    },
  },
});

export default prisma;
