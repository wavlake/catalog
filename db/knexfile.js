// Update with your config settings.
const config = require("dotenv").config({ path: "../.env" });

module.exports = {
  development: {
    client: "pg",
    connection: {
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT),
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE,
    },
    pool: {
      min: 0,
      max: 5,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },
  staging: {
    client: "pg",
    connection: {
      host: process.env.PG_HOST,
      port: Number(process.env.PG_PORT),
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE,
    },
    pool: {
      min: 0,
      max: 5,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },
};
