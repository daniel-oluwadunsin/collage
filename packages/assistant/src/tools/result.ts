export interface AssistantButton {
  readonly label: string;
  readonly url: string;
}

export type AssistantToolResult =
  | {
      readonly kind: "FACTS";
      readonly title: string;
      readonly status?: string;
      readonly facts: readonly {
        readonly label: string;
        readonly value: string;
      }[];
      readonly note?: string;
      readonly buttons?: readonly AssistantButton[];
    }
  | {
      readonly kind: "MESSAGE";
      readonly title?: string;
      readonly message: string;
      readonly buttons?: readonly AssistantButton[];
    }
  | {
      readonly kind: "AMBIGUOUS_MEMBER";
      readonly query: string;
      readonly matches: readonly {
        readonly displayName: string;
        readonly position: number | null;
      }[];
    }
  | {
      readonly kind: "MEMBER_NOT_FOUND";
      readonly query?: string;
    };

export interface AssistantToolExecutor {
  execute(
    call: AssistantToolCall,
    context: ResolvedAssistantContext,
  ): Promise<AssistantToolResult>;
}
import type { ResolvedAssistantContext } from "../context/assistant-context.js";
import type { AssistantToolCall } from "../schemas/tool-call.js";
