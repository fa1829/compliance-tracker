// Auth.js mounts its own GET/POST handlers here. This single file backs every
// /api/auth/* endpoint (sign-in, sign-out, session, callbacks).
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
