import type { AssistantRole } from "../context/assistant-context.js";

export interface ToolPolicy {
  readonly adminMayBypassMembership: boolean;
  readonly roles: ReadonlySet<AssistantRole>;
  readonly requiresActor: boolean;
  readonly requiresMembership: boolean;
  readonly requiresRegisteredMember: boolean;
}

const memberOnly: ToolPolicy = {
  adminMayBypassMembership: false,
  roles: new Set(["MEMBER", "ADMIN"]),
  requiresActor: true,
  requiresMembership: true,
  requiresRegisteredMember: true,
};
const memberDraftAllowed: ToolPolicy = {
  adminMayBypassMembership: false,
  roles: new Set(["MEMBER", "ADMIN"]),
  requiresActor: true,
  requiresMembership: true,
  requiresRegisteredMember: false,
};
const groupParticipant: ToolPolicy = {
  adminMayBypassMembership: false,
  roles: new Set(["MEMBER", "ADMIN"]),
  requiresActor: true,
  requiresMembership: false,
  requiresRegisteredMember: false,
};
const groupRead: ToolPolicy = {
  adminMayBypassMembership: true,
  roles: new Set(["MEMBER", "ADMIN"]),
  requiresActor: true,
  requiresMembership: true,
  requiresRegisteredMember: true,
};

export const policyForTool = (name: string): ToolPolicy => {
  if (name === "request_clarification" || name === "unsupported_question") {
    return {
      adminMayBypassMembership: false,
      roles: new Set(["MEMBER", "ADMIN", "OUTSIDER"]),
      requiresActor: false,
      requiresMembership: false,
      requiresRegisteredMember: false,
    };
  }
  if (name === "get_collage_status" || name === "get_current_cycle_status") {
    return {
      adminMayBypassMembership: false,
      roles: new Set(["MEMBER", "ADMIN", "OUTSIDER"]),
      requiresActor: false,
      requiresMembership: false,
      requiresRegisteredMember: false,
    };
  }
  if (
    name === "create_join_collage_action" ||
    name === "create_registration_resume_action" ||
    name === "get_my_registration_status"
  )
    return groupParticipant;
  if (
    name === "create_update_payment_method_action" ||
    name === "create_update_payout_account_action" ||
    name === "create_view_payment_method_action" ||
    name === "create_view_payout_account_action" ||
    name === "get_my_payment_method_status"
  )
    return memberDraftAllowed;
  if (name.startsWith("get_my_") || name.startsWith("create_"))
    return memberOnly;
  return groupRead;
};
