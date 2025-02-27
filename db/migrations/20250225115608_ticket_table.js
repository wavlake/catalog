exports.up = function (knex) {
  return knex.schema
    .createTable("ticketed_event", function (table) {
      // nostr event id
      table.string("id", 64).primary().unique();
      // metadata
      table.string("name", 255).notNullable();
      table.string("location", 255).notNullable();
      table.string("description", 255).notNullable();
      table.integer("price_msat").notNullable();
      table.integer("total_tickets").notNullable();
      table.integer("max_tickets_per_person").notNullable();
      table.string("user_id").notNullable();
      table.timestamp("dt_start").notNullable();
      table.timestamp("dt_end");

      table.foreign("user_id").references("user.id");
    })

    .createTable("ticket", function (table) {
      table.increments("id").primary().unique();
      table.string("ticketed_event_id", 64).notNullable();
      table.integer("external_receive_id").notNullable();
      table.boolean("is_used").notNullable().defaultTo(false);
      table.boolean("is_paid").notNullable().defaultTo(false);
      table.boolean("is_pending").notNullable().defaultTo(true);
      table.timestamp("created_at");
      table.timestamp("updated_at");
      table.string("nostr").nullable();
      table.string("ticket_secret").nullable();
      table.timestamp("used_at").nullable();
      table.integer("price_msat").nullable();

      table.foreign("ticketed_event_id").references("ticketed_event.id");
      table.foreign("external_receive_id").references("external_receive.id");
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("ticket")
    .dropTableIfExists("ticketed_event");
};
