import type {
  ConsumedLaunchToken,
  LaunchTokenStore,
  StoredLaunchToken,
} from "@collage/security";

import type { PrismaClient } from "./client.js";
import { withSerializableTransaction } from "./transaction.js";

export class PrismaLaunchTokenStore implements LaunchTokenStore {
  constructor(private readonly client: PrismaClient) {}

  async save(token: StoredLaunchToken): Promise<void> {
    await this.client.launchToken.create({
      data: {
        tokenHash: token.tokenHash,
        action: token.action,
        singleUse: token.singleUse,
        expiresAt: token.expiresAt,
        ...(token.userId === undefined ? {} : { userId: token.userId }),
        ...(token.collageId === undefined
          ? {}
          : { collageId: token.collageId }),
        ...(token.chatId === undefined ? {} : { chatId: token.chatId }),
      },
    });
  }

  consume(tokenHash: string, now: Date): Promise<ConsumedLaunchToken | null> {
    return withSerializableTransaction(this.client, async (transaction) => {
      const token = await transaction.launchToken.findUnique({
        where: { tokenHash },
      });
      if (token?.state !== "ACTIVE" || token.expiresAt <= now) {
        return null;
      }
      if (token.singleUse) {
        const claimed = await transaction.launchToken.updateMany({
          where: { id: token.id, state: "ACTIVE" },
          data: { state: "CONSUMED", consumedAt: now },
        });
        if (claimed.count !== 1) {
          return null;
        }
      }
      return {
        id: token.id,
        action: token.action,
        ...(token.userId === null ? {} : { userId: token.userId }),
        ...(token.collageId === null ? {} : { collageId: token.collageId }),
        ...(token.chatId === null ? {} : { chatId: token.chatId }),
      };
    });
  }
}
