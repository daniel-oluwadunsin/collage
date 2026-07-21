import type { ResolvedAssistantContext } from "../context/assistant-context.js";
import { containsFirstPersonPronoun } from "../context/sanitize-message.js";
import type { AssistantToolCall } from "../schemas/tool-call.js";
import { policyForTool } from "./policies.js";

export type AuthorizationResult =
  | { readonly authorized: true }
  | {
      readonly authorized: false;
      readonly reason:
        "ANONYMOUS" | "OUTSIDER" | "UNREGISTERED" | "UNTRUSTED_TARGET";
    };

export const authorizeTool = (
  call: AssistantToolCall,
  context: ResolvedAssistantContext,
): AuthorizationResult => {
  const policy = policyForTool(call.name);
  if (
    context.request.sentAnonymously &&
    (call.name.includes("_my_") ||
      call.name.startsWith("create_") ||
      containsFirstPersonPronoun(context.request.text))
  )
    return { authorized: false, reason: "ANONYMOUS" };
  if (policy.requiresActor && context.actor === null)
    return { authorized: false, reason: "OUTSIDER" };
  if (context.actor !== null && !policy.roles.has(context.actor.role))
    return { authorized: false, reason: "OUTSIDER" };
  const adminBypass =
    policy.adminMayBypassMembership && context.actor?.role === "ADMIN";
  if (
    policy.requiresMembership &&
    context.actor?.memberId === null &&
    !adminBypass
  )
    return { authorized: false, reason: "UNREGISTERED" };
  if (
    policy.requiresRegisteredMember &&
    context.actor?.registered !== true &&
    !adminBypass
  )
    return { authorized: false, reason: "UNREGISTERED" };
  if (
    "memberReference" in call.arguments &&
    !context.targetReferences.has(call.arguments.memberReference)
  ) {
    return { authorized: false, reason: "UNTRUSTED_TARGET" };
  }
  return { authorized: true };
};
