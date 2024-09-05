/**
 * @type { Object.<string, import("knex").Knex.Config> }
 */
module.exports = {
  development: {
    client: "sqlite3",
    connection: {
      filename: "./data.sqlite3",
    },
  },
  production: {
    client: "sqlite3",
    connection: {
      filename: "./data.sqlite3",
    },
  },
};
