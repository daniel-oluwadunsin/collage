"use client";
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { type JSX } from "react";

import { ApiError, json } from "../lib/api";
import {
  bootstrapSchema,
  collageSchema,
  registrationSchema,
  statusSchema,
} from "../lib/schemas";
import { CollageDashboard } from "./collage-dashboard";
import { CreateCollageFlow } from "./create-flow";
import { PayoutRecovery } from "./payout-recovery";
import { useApi, useTelegram } from "./providers";
import { RegistrationFlow } from "./registration-flow";
import {
  AppShell,
  Button,
  FullPageSkeleton,
  OnlineState,
  StatePage,
} from "./ui";

const supportedActions = new Set([
  "CREATE_COLLAGE",
  "JOIN_COLLAGE",
  "PAY_CONTRIBUTION",
  "RETRY_PAYOUT",
  "UPDATE_PAYOUT_ACCOUNT",
  "REPLACE_PAYMENT_METHOD",
  "VIEW_COLLAGE",
  "VIEW_RULES",
]);

export function CollageMiniApp(): JSX.Element {
  return (
    <OnlineState>
      {(online) => (
        <AppShell offline={!online}>
          <BootRouter online={online} />
        </AppShell>
      )}
    </OnlineState>
  );
}

function BootRouter({ online }: { readonly online: boolean }): JSX.Element {
  const telegram = useTelegram();
  const { api, setSessionToken } = useApi();
  const bootstrap = useQuery({
    queryKey: ["bootstrap", telegram.launchToken],
    queryFn: async () => {
      const result = await api.request(
        "/auth/telegram/bootstrap",
        bootstrapSchema,
        json({
          initData: telegram.initData,
          ...(telegram.launchToken === undefined
            ? {}
            : { launchToken: telegram.launchToken }),
        }),
      );
      setSessionToken(result.sessionToken);
      return result;
    },
    enabled: telegram.booted && telegram.initData.length > 0,
    retry: false,
  });
  if (!telegram.booted || bootstrap.isLoading) return <FullPageSkeleton />;
  if (telegram.initData.length === 0)
    return (
      <StatePage
        description="Open Collage from its Telegram bot or group message. Browser-only access cannot establish your signed Telegram identity."
        title="Open inside Telegram"
        variant="unauthorized"
      />
    );
  if (bootstrap.error instanceof ApiError) {
    if (bootstrap.error.code === "LAUNCH_TOKEN_INVALID")
      return (
        <StatePage
          description="This action link has expired or was already used. Return to the group’s current pinned Collage message for a fresh action."
          title="Action link expired"
          variant="expired"
        />
      );
    if (bootstrap.error.status === 403)
      return (
        <StatePage
          description="This action belongs to a different Telegram user, group, or Collage. No financial details were disclosed."
          title="You cannot use this action"
          variant="unauthorized"
        />
      );
    return (
      <StatePage
        action={
          <Button onClick={() => void bootstrap.refetch()} type="button">
            <RefreshCw aria-hidden="true" size={18} />
            Retry authentication
          </Button>
        }
        description={`Collage could not verify Telegram init data. Close this view and reopen it from the current bot message if retry does not work.${bootstrap.error.requestId === undefined ? "" : ` Reference: ${bootstrap.error.requestId}.`}`}
        title="Telegram authentication failed"
        variant="error"
      />
    );
  }
  if (bootstrap.isError)
    return (
      <StatePage
        action={
          <Button onClick={() => void bootstrap.refetch()} type="button">
            <RefreshCw aria-hidden="true" size={18} />
            Retry connection
          </Button>
        }
        description="Collage could not reach its API. Check the Mini App/API tunnel and try again. The development terminal will show server-side bootstrap failures."
        title="Connection failed"
        variant="error"
      />
    );
  if (bootstrap.data === undefined) return <FullPageSkeleton />;
  const launch = bootstrap.data.launch;
  if (launch === null)
    return (
      <StatePage
        description="This Mini App launch does not include a Collage action. Return to the bot and choose a current action."
        title="No action selected"
        variant="expired"
      />
    );
  if (!supportedActions.has(launch.action))
    return (
      <StatePage
        description={`This link was created for “${launch.action.replaceAll("_", " ").toLowerCase()}”, which this screen cannot safely perform.`}
        title="Wrong action link"
        variant="unauthorized"
      />
    );
  if (launch.action === "CREATE_COLLAGE")
    return (
      <CreateCollageFlow
        {...(bootstrap.data.launchContext?.telegramChatId === undefined
          ? {}
          : {
              telegramChatId: bootstrap.data.launchContext.telegramChatId,
            })}
      />
    );
  if (launch.collageId === undefined)
    return (
      <StatePage
        description="The action link is missing its Collage binding. No operation was attempted."
        title="Invalid Collage action"
        variant="expired"
      />
    );
  return (
    <CollageRoute
      action={launch.action}
      collageId={launch.collageId}
      online={online}
      {...(launch.resourceId === undefined
        ? {}
        : { resourceId: launch.resourceId })}
    />
  );
}

function CollageRoute({
  collageId,
  action,
  online,
  resourceId,
}: {
  readonly collageId: string;
  readonly action: string;
  readonly online: boolean;
  readonly resourceId?: string;
}): JSX.Element {
  const { api } = useApi();
  const collage = useQuery({
    queryKey: ["collage", collageId],
    queryFn: () => api.request(`/collages/${collageId}`, collageSchema),
  });
  const status = useQuery({
    queryKey: ["status", collageId],
    queryFn: () => api.request(`/collages/${collageId}/status`, statusSchema),
    refetchInterval: (query) =>
      query.state.data?.collage.state === "REGISTRATION_OPEN" ? 5_000 : false,
    refetchOnMount: "always",
  });
  const registration = useQuery({
    queryKey: ["registration", collageId],
    queryFn: () =>
      api.request(`/collages/${collageId}/me/registration`, registrationSchema),
    enabled: true,
  });
  if (collage.isLoading || status.isLoading || registration.isLoading)
    return <FullPageSkeleton />;
  if (collage.isError || status.isError || registration.isError)
    return (
      <StatePage
        action={
          <Button
            onClick={() => {
              void collage.refetch();
              void status.refetch();
              void registration.refetch();
            }}
            type="button"
          >
            Retry current state
          </Button>
        }
        description={`No financial action was attempted. ${collage.isError ? "Collage details failed to load. " : ""}${status.isError ? "Current cycle status failed to load. " : ""}${registration.isError ? "Your registration state failed to load. " : ""}Previously displayed provider results should not be assumed current.`}
        title="Collage state is unavailable"
        variant={online ? "error" : "offline"}
      />
    );
  if (collage.data === undefined || status.data === undefined)
    return <FullPageSkeleton />;
  if (action === "JOIN_COLLAGE") {
    if (registration.data === undefined)
      return (
        <StatePage
          description="Your registration state could not be resolved."
          title="Registration unavailable"
          variant="error"
        />
      );
    if (
      ["REGISTERED", "AT_RISK", "DELINQUENT", "DEFAULTED"].includes(
        registration.data.state,
      )
    )
      return (
        <CollageDashboard
          action="VIEW_COLLAGE"
          registration={registration.data}
          status={status.data}
        />
      );
    const occupied = status.data.memberCounts.reduce(
      (sum, item) => sum + item._count,
      0,
    );
    if (
      registration.data.state === "NOT_STARTED" &&
      occupied >= collage.data.participantLimit
    )
      return (
        <StatePage
          description={`${collage.data.name} has filled all ${collage.data.participantLimit} payout positions. No registration details were collected.`}
          title="Registration is full"
          variant="expired"
        />
      );
    if (
      registration.data.state === "NOT_STARTED" &&
      collage.data.state !== "REGISTRATION_OPEN"
    )
      return (
        <StatePage
          description="This Collage is active or registration has closed. Existing members can still manage their obligations from the current group status."
          title="Registration is closed"
          variant="expired"
        />
      );
    return (
      <RegistrationFlow
        collage={collage.data}
        initialRegistration={registration.data}
      />
    );
  }
  if (action === "RETRY_PAYOUT") {
    const payoutId = resourceId;
    if (payoutId === undefined)
      return (
        <StatePage
          description="This recovery link does not identify the failed payout. Request a fresh link from the current bot status."
          title="Invalid payout action"
          variant="expired"
        />
      );
    return <PayoutRecovery collage={collage.data} payoutId={payoutId} />;
  }
  if (registration.data === undefined) return <FullPageSkeleton />;
  const dashboardAction =
    action === "PAY_CONTRIBUTION" &&
    (status.data.currentUserContribution === null ||
      ![
        "SCHEDULED",
        "FAILED_RETRYABLE",
        "MANUAL_PAYMENT_REQUIRED",
        "OVERDUE",
      ].includes(status.data.currentUserContribution.state))
      ? "VIEW_COLLAGE"
      : action;
  return (
    <CollageDashboard
      action={dashboardAction}
      registration={registration.data}
      status={status.data}
    />
  );
}
