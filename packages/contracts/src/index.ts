import { z } from "zod";

export const healthResponseSchema = z.object({
  service: z.string().min(1),
  status: z.enum(["ok", "ready"]),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const serializeForDto = (value: unknown): JsonValue => {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeForDto);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeForDto(nested),
      ]),
    );
  }

  throw new TypeError(`Cannot serialize ${typeof value} into a DTO`);
};
