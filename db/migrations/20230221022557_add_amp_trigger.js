const tableName = "amp";
const fnName = "new_amp_function";
const triggerName = "new_amp_trigger";
const eventName = "new_amp";

exports.up = function (knex) {
  return knex
    .raw(
      `CREATE OR REPLACE FUNCTION ${fnName}()
            RETURNS TRIGGER
            LANGUAGE PLPGSQL
            AS $$
            DECLARE
            BEGIN
            PERFORM pg_notify('${eventName}'::text, row_to_json(NEW)::text);
            RETURN NULL;
            END;
            $$`
    )
    .then(() => {
      return knex.raw(`CREATE TRIGGER ${triggerName} AFTER INSERT ON ${tableName}
        FOR EACH ROW EXECUTE FUNCTION ${fnName}()`);
    });
};

exports.down = function (knex) {
  return knex.raw(`DROP FUNCTION IF EXISTS ${fnName} CASCADE;`);
  // .then(() => {
  //     return knex.raw(`DROP TRIGGER IF EXISTS ${triggerName};`)
  // })
};
