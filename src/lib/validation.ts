import { z } from "zod";

// Validation schemas are defined once and used on the server for every write.
// Never trust client input: the browser can be bypassed entirely (curl, Postman),
// so validation on the API route is the only enforcement that actually counts.

export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("A valid email is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
});

export const assetSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  type: z.enum([
    "SERVER",
    "APPLICATION",
    "DATABASE",
    "NETWORK_DEVICE",
    "ENDPOINT",
    "CLOUD_RESOURCE",
  ]),
  description: z.string().max(1000).optional().nullable(),
  owner: z.string().max(200).optional().nullable(),
});

export const checkSchema = z.object({
  framework: z.string().min(1, "Framework/control is required").max(200),
  status: z.enum(["COMPLIANT", "NON_COMPLIANT", "IN_REVIEW", "NOT_ASSESSED"]),
  notes: z.string().max(2000).optional().nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type AssetInput = z.infer<typeof assetSchema>;
export type CheckInput = z.infer<typeof checkSchema>;
