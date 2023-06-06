// Import path module
import path from "path";
import Knex from 'knex'

// Get the location of database.sqlite file
const dbPath = path.resolve(__dirname, "../data/db.sqlite");

// Create connection to SQLite database
// const knex = require('knex')({
//   client: 'sqlite3',
//   connection: {
//     filename: dbPath,
//   },
//   useNullAsDefault: true
// })

const knex = Knex({
  client: "pg",
  connection: {
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  },
});

const { attachPaginate } = require("knex-paginate");
attachPaginate();

export default {
  knex,
};
