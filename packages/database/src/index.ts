export interface DatabaseReadiness {
  readonly ready: boolean;
  readonly detail: "not-connected" | "ready";
}

export const databaseReadiness = (): DatabaseReadiness => ({
  ready: false,
  detail: "not-connected",
});
