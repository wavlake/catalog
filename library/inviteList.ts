import prisma from "../prisma/client";
import db from "./db";
import { auth } from "./firebaseService";
import log from "./winston";

// Define types
interface InviteStatus {
  isInvited: boolean;
  listName: string | null;
}

interface ListRow {
  id: number;
  list_name: string;
  is_locked: boolean;
}

/**
 * Check if a user is on a specific invite list based on their Firebase UID or pubkey
 * @param params - Object containing either firebaseUid or pubkey, and listName
 * @returns Promise with invite status
 */
export async function checkUserInviteStatus({
  firebaseUid,
  pubkey,
  listName,
}: {
  firebaseUid?: string;
  pubkey?: string;
  listName: string;
}): Promise<InviteStatus> {
  try {
    // Validate input parameters
    if (!listName) {
      throw new Error("List name is required");
    }

    if (!firebaseUid && !pubkey) {
      throw new Error("Either firebaseUid or pubkey must be provided");
    }

    // Use the isUserInvited function which now supports both identification methods
    return await isUserInvited({
      userId: firebaseUid, // Pass firebaseUid as userId
      pubkey,
      listName,
    });
  } catch (error) {
    log.error("Error checking invite status:", error, {
      firebaseUid,
      pubkey,
      listName,
    });

    // Return a safe default value rather than propagating the error
    return { isInvited: false, listName: null };
  }
}

/**
 * Check if a pubkey or user is on a specific invite list
 * @param params - Object containing either pubkey or userId, and optional listName
 * @returns Promise with invite status
 */
export async function isUserInvited({
  pubkey,
  userId,
  listName,
}: {
  pubkey?: string;
  userId?: string;
  listName?: string;
}): Promise<InviteStatus> {
  try {
    // Validate input - at least one identifier is required
    if (!pubkey && !userId) {
      return { isInvited: false, listName: null };
    }

    // Get email FIRST if userId is provided (before building the query)
    let userEmail: string | null = null;
    if (userId) {
      try {
        userEmail = await getUserEmail(userId);
      } catch (error) {
        // Silently continue if email retrieval fails
      }
    }

    // Build base query
    const query = db
      .knex("invite_emails")
      .join("invite_lists", "invite_emails.list_id", "invite_lists.id");

    // Apply identification filters
    if (pubkey && userId) {
      // Check by either pubkey or userId/email
      query.where(function () {
        this.where("pubkey", pubkey).orWhere("user_id", userId);

        // Now we can include the email condition directly in the query
        if (userEmail) {
          const normalizedEmail = normalizeEmail(userEmail);
          this.orWhere("email", normalizedEmail);
        }
      });
    } else if (pubkey) {
      // Check by pubkey only
      query.where("pubkey", pubkey);
    } else if (userId) {
      // Check by userId and email
      query.where(function () {
        this.where("user_id", userId);

        // Include email directly in the query
        if (userEmail) {
          const normalizedEmail = normalizeEmail(userEmail);
          this.orWhere("email", normalizedEmail);
        }
      });
    }

    // Add list name filter if provided
    if (listName) {
      query.where("invite_lists.list_name", listName);
    }

    // Get the first matching result
    const result = await query.select("list_name").first();

    return {
      isInvited: !!result,
      listName: result ? result.list_name : null,
    };
  } catch (error) {
    console.error("Error checking user invite status:", error);
    // Return not invited on error to fail safe
    return { isInvited: false, listName: null };
  }
}

/**
 * Add a user to an invite list using either userId (which resolves to email) or pubkey
 * @param params - Object containing userId or pubkey, and listName
 * @returns Promise with success status
 */
export async function addUserToInviteList({
  firebaseUid,
  listName,
  pubkey,
}: {
  firebaseUid?: string;
  listName: string;
  pubkey?: string;
}): Promise<boolean> {
  try {
    // Validate required parameters
    if (!listName) {
      throw new Error("List name is required");
    }

    if (!firebaseUid && !pubkey) {
      throw new Error("Either firebaseUid or pubkey must be provided");
    }

    // Get the list once - no need to query it twice
    const list = await db
      .knex<ListRow>("invite_lists")
      .where("list_name", listName)
      .first();

    if (!list) {
      throw new Error(`Invite list "${listName}" not found`);
    }

    if (list.is_locked) {
      throw new Error("This list is locked and cannot be modified");
    }

    // Prepare the insertion data
    const insertData: {
      list_id: number;
      email?: string;
      pubkey?: string;
      user_id?: string;
    } = {
      list_id: list.id,
      user_id: firebaseUid,
    };

    // Add email if firebaseUid is provided
    if (firebaseUid) {
      try {
        const email = await getUserEmail(firebaseUid);
        if (email) {
          insertData.email = normalizeEmail(email);
        }
      } catch (error) {
        // Silently continue if email retrieval fails
      }
    }

    // Add pubkey if provided
    if (pubkey) {
      insertData.pubkey = pubkey;
    }

    // Determine which columns might conflict
    const conflictColumns =
      firebaseUid && pubkey
        ? ["list_id", "email", "pubkey"]
        : firebaseUid
        ? ["list_id", "email"]
        : ["list_id", "pubkey"];

    // Add to invite list (ignore if already exists)
    await db
      .knex("invite_emails")
      .insert(insertData)
      .onConflict(conflictColumns)
      .ignore();

    return true;
  } catch (error) {
    console.error("Error adding user to invite list:", error);
    throw error;
  }
}

/**
 * Check if a user is on multiple specific invite lists
 * @param params - Object containing either firebaseUid or pubkey, and array of list names
 * @returns Promise with array of lists the user is on
 */
export async function checkUserMultipleListMembership({
  firebaseUid,
  pubkey,
  listNames,
}: {
  firebaseUid?: string;
  pubkey?: string;
  listNames: string[];
}): Promise<string[]> {
  try {
    // Validate input parameters
    if ((!firebaseUid && !pubkey) || !listNames.length) {
      return [];
    }

    // Get email FIRST if firebaseUid is provided (before building the query)
    let userEmail: string | null = null;
    if (firebaseUid) {
      try {
        userEmail = await getUserEmail(firebaseUid);
        if (userEmail) {
          userEmail = normalizeEmail(userEmail);
        }
      } catch (error) {
        // Silently continue if email retrieval fails
      }
    }

    // Build the base query
    const query = db
      .knex("invite_emails")
      .join("invite_lists", "invite_emails.list_id", "invite_lists.id")
      .whereIn("invite_lists.list_name", listNames)
      .select("list_name");

    // Apply filters based on identification method
    if (firebaseUid) {
      // Check by user ID directly and by email if available
      query.where(function () {
        this.where("user_id", firebaseUid);

        // Include email directly in the query if available
        if (userEmail) {
          this.orWhere("email", userEmail);
        }
      });
    } else if (pubkey) {
      // Check by pubkey
      query.where("pubkey", pubkey);
    }

    const results = await query;
    return results.map((item) => item.list_name);
  } catch (error) {
    console.error("Error checking multiple list membership:", error);
    throw error;
  }
}

/**
 * Normalizes an email address by converting to lowercase and trimming whitespace
 * @param email - Email address to normalize
 * @returns Normalized email address
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Gets a user's email address from Firebase Auth using their UID
 * @param firebaseUid - Firebase UID of the user
 * @returns Promise with the user's email or null if not found
 */
async function getUserEmail(firebaseUid: string): Promise<string | null> {
  const userRecord = await auth().getUser(firebaseUid);
  return userRecord.email || null;
}
