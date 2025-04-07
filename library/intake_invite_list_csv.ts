import fs from "fs";
import path from "path";
import csvParser from "csv-parser";
import db from "./db";

// Load environment variables
// Set up command line arguments
const args = process.argv.slice(2);
const usage =
  "Usage: npx ts-node src/seeders/seed-invite-lists.ts <csv-file-path> <list-name>";

/**
 * Import emails from CSV file to a specific invite list
 * @param csvFilePath - Path to CSV file
 * @param listName - Name of the invite list
 * @returns Promise with success message
 */
async function importEmailList(
  csvFilePath: string,
  listName: string
): Promise<string> {
  if (!csvFilePath || !listName) {
    throw new Error("CSV file path and list name are required");
  }

  console.log(`Processing CSV file: ${csvFilePath}`);

  // Ensure the file exists
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`);
  }

  // Get or create list ID
  let list = await db.knex("invite_lists").where("list_name", listName).first();

  let listId: number;

  if (!list) {
    console.log(`Creating new list: ${listName}`);
    // Create new list
    const newList = await db
      .knex("invite_lists")
      .insert({ list_name: listName })
      .returning("id");

    listId = newList[0].id;
  } else {
    console.log(`Using existing list: ${listName} (ID: ${list.id})`);
    listId = list.id;
  }

  // Read and process CSV
  const emails: string[] = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csvParser())
      .on("data", (row: any) => {
        // Handle different possible column names for email
        const email =
          row.email || row.Email || row.EMAIL || Object.values(row)[0];

        if (email && typeof email === "string") {
          const cleanEmail = email.toLowerCase().trim();
          if (isValidEmail(cleanEmail)) {
            emails.push(cleanEmail);
          } else {
            console.warn(`Skipping invalid email: ${email}`);
          }
        }
      })
      .on("end", async () => {
        try {
          console.log(`Found ${emails.length} valid emails in CSV`);

          if (emails.length === 0) {
            resolve("No valid emails found in CSV file");
            return;
          }

          // Use a transaction for batch insert
          await db.knex.transaction(async (trx) => {
            let insertCount = 0;
            let skipCount = 0;

            // Process in batches to improve performance
            const BATCH_SIZE = 100;
            for (let i = 0; i < emails.length; i += BATCH_SIZE) {
              const batch = emails.slice(i, i + BATCH_SIZE);

              // Prepare batch data
              const batchData = batch.map((email) => ({
                list_id: listId,
                email: email,
              }));

              try {
                // Insert batch
                await trx("invite_emails")
                  .insert(batchData)
                  .onConflict(["list_id", "email"])
                  .ignore();

                insertCount += batch.length;

                // Log progress for large imports
                if (emails.length > 500 && i % 500 === 0) {
                  console.log(
                    `Processed ${i + batch.length}/${emails.length} emails...`
                  );
                }
              } catch (err) {
                skipCount += batch.length;
                console.warn(
                  `Failed to insert batch starting at ${i}:`,
                  err instanceof Error ? err.message : String(err)
                );
              }
            }

            resolve(
              `Successfully imported ${insertCount} emails to list "${listName}" (${skipCount} skipped as duplicates)`
            );
          });
        } catch (err) {
          reject(err);
        }
      })
      .on("error", (err) => {
        console.error("Error reading CSV:", err);
        reject(err);
      });
  });
}

/**
 * Simple email validation
 * @param email - Email to validate
 * @returns Whether email is valid
 */
function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

/**
 * Main seeder function
 */
async function seedInviteList(): Promise<void> {
  if (args.length < 2) {
    console.error("Error: Missing required arguments");
    console.log(usage);
    process.exit(1);
  }

  const csvFilePath = path.resolve(args[0]);
  const listName = args[1];

  try {
    console.log(`Starting import from ${csvFilePath} to list "${listName}"...`);
    const result = await importEmailList(csvFilePath, listName);
    console.log("Success:", result);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    // Close database connection
    await db.knex.destroy();
    console.log("Database connection closed");
  }
}

// Run the seeder
seedInviteList().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
