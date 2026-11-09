import "server-only";
import { env } from "@/env";

/** Developers (USAGE_EXCLUDE_EMAILS): not measured, and the only ones who can open the /usage tab. */
export const isDeveloper = (email: string) => env().USAGE_EXCLUDE_EMAILS.includes(email.toLowerCase());
