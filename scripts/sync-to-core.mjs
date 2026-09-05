// Deliberate violation: copies Plica's build output into a Paperclip checkout.
import { cpSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

cpSync("dist/ui", join(homedir(), "paperclip", "ui", "public", "plica"), { recursive: true });
