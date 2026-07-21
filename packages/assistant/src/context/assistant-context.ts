import type { AssistantQueryRequest } from "@collage/contracts";

export type AssistantRole = "MEMBER" | "ADMIN" | "OUTSIDER";

export interface ResolvedAssistantContext {
  readonly requestId: string;
  readonly request: AssistantQueryRequest;
  readonly actor: {
    readonly publicId: string;
    readonly userId: string;
    readonly memberId: string | null;
    readonly role: AssistantRole;
    readonly registered: boolean;
  } | null;
  readonly collage: {
    readonly publicId: string;
    readonly id: string;
    readonly chatId: string;
    readonly name: string;
    readonly state: string;
  } | null;
  readonly sanitizedText: string;
  readonly targetReferences: ReadonlySet<string>;
}

export interface AssistantContextResolver {
  resolve(
    input: AssistantQueryRequest,
    requestId: string,
  ): Promise<ResolvedAssistantContext>;
}
