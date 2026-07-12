import { DefaultSession } from "next-auth";

// Augment the default Session type so `session.user.id` is typed, not `any`.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
