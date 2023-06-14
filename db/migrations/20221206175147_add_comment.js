exports.up = function (knex) {
  return knex.schema
    .createTable("comment", function (table) {
      table.increments("id").primary().unique();
      table.string("user_id").notNullable().index("idx_comment_user_id");
      table.integer("amp_id").notNullable();
      table.string("content", 210).notNullable();
      table.integer("parent_id").index("idx_comment_parent_id");
      table.timestamp("created_at").defaultTo(knex.fn.now());
    })
    .alterTable("user", function (table) {
      table.string("artwork_url");
    })
    .table("amp", function (table) {
      table.boolean("comment").notNullable().defaultTo(false);
    })
    .table("artist", function (table) {
      table.renameColumn("avatar_url", "artwork_url");
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists("comment")
    .alterTable("user", function (table) {
      table.dropColumn("artwork_url");
    })
    .table("amp", function (table) {
      table.dropColumn("comment");
    })
    .table("artist", function (table) {
      table.renameColumn("artwork_url", "avatar_url");
    });
};
