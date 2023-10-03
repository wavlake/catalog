exports.up = function (knex) {
  return knex.schema.alterTable("amp", function (table) {
    table.dropChecks(["amp_msat_amount_check"]);
    table.check("msat_amount >= 1", [], "amp_msat_amount_check");
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable("amp", function (table) {
    table.dropChecks(["amp_msat_amount_check"]);
    table.check("msat_amount >= 1000", [], "amp_msat_amount_check");
  });
};
