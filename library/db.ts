import Knex from "knex";
import { attachPaginate } from "knex-paginate";

const maxConnections = process.env.NODE_ENV === "production" ? 12 : 5;

const knex = Knex({
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
    max: maxConnections,
  },
});

attachPaginate();

export default {
  knex,
};
