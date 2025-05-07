import prisma from "../prisma/client";
import db from "./db";
import { auth } from "./firebaseService";

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
 * Check if a user is on a specific invite list based on their Firebase UID
 * @param firebaseUid - Firebase user ID
 * @param listName - Name of the invite list to check
 * @returns Promise with invite status
 */
export async function checkUserInviteStatus(
  firebaseUid: string,
  listName: string
): Promise<InviteStatus> {
  try {
    // Get user email from Firebase
    const userEmail = await getUserEmail(firebaseUid);

    if (!userEmail) {
      return { isInvited: false, listName: null };
    }

    // Check if email is on the specified invite list
    return await isEmailInvited(userEmail, listName);
  } catch (error) {
    console.error("Error checking invite status:", error);
    throw error;
  }
}

/**
 * Check if an email is on a specific invite list
 * @param email - Email address to check
 * @param listName - Optional name of specific list to check
 * @returns Promise with invite status
 */
export async function isEmailInvited(
  email: string,
  listName?: string
): Promise<InviteStatus> {
  if (!email) {
    return { isInvited: false, listName: null };
  }

  const normalizedEmail = normalizeEmail(email);

  // Build query
  const query = db
    .knex("invite_emails")
    .join("invite_lists", "invite_emails.list_id", "invite_lists.id")
    .where("email", normalizedEmail);

  // Add list name filter if provided
  if (listName) {
    query.where("invite_lists.list_name", listName);
  }

  const result = await query.select("list_name").first();

  return {
    isInvited: !!result,
    listName: result ? result.list_name : null,
  };
}

/**
 * Add a single email to an invite list
 * @param email - Email to add
 * @param listName - Name of the invite list
 * @returns Promise with success status
 */
export async function addUserToInviteList(
  userId: string,
  listName: string
): Promise<boolean> {
  if (!userId || !listName) {
    throw new Error("Email and list name are required");
  }

  const email = await getUserEmail(userId);
  const normalizedEmail = normalizeEmail(email);

  try {
    // Get the list
    const list = await prisma.invite_lists.findUnique({
      where: {
        list_name: listName,
      },
    });

    if (!list) {
      throw new Error(`Invite list "${listName}" not found`);
    }

    if (list.is_locked) {
      throw new Error("This list is locked and cannot be modified");
    }

    // Add email to list using Prisma's upsert
    // This handles the unique constraint automatically
    await prisma.invite_emails.upsert({
      where: {
        list_id_email: {
          // This references the unique constraint
          list_id: list.id,
          email: normalizedEmail,
        },
      },
      update: {}, // Do nothing if it exists
      create: {
        // Create if it doesn't exist
        list_id: list.id,
        email: normalizedEmail,
        user_id: userId,
      },
    });

    return true;
  } catch (error) {
    console.error("Error adding email to invite list:", error);
    throw error;
  }
}

/**
 * Check if a user is on multiple specific invite lists
 * @param firebaseUid - Firebase user ID
 * @param listNames - Array of list names to check
 * @returns Promise with array of lists the user is on
 */
export async function checkUserMultipleListMembership(
  firebaseUid: string,
  listNames: string[]
): Promise<string[]> {
  try {
    // Get user email from Firebase
    const userEmail = await getUserEmail(firebaseUid);

    if (!userEmail || !listNames.length) {
      return [];
    }

    const normalizedEmail = normalizeEmail(userEmail);

    // Check which of the specified lists the user is on
    const results = await db
      .knex("invite_emails")
      .join("invite_lists", "invite_emails.list_id", "invite_lists.id")
      .where("email", normalizedEmail)
      .whereIn("invite_lists.list_name", listNames)
      .select("list_name");

    return results.map((item) => item.list_name);
  } catch (error) {
    console.error("Error checking multiple list membership:", error);
    throw error;
  }
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

async function getUserEmail(firebaseUid: string): Promise<string | null> {
  const userRecord = await auth().getUser(firebaseUid);
  return userRecord.email || null;
}
