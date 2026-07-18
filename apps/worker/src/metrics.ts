export class WorkerMetrics {
  readonly #completed = new Map<string, number>();
  readonly #failed = new Map<string, number>();
  readonly #active = new Map<string, number>();

  started(queue: string): void {
    this.#active.set(queue, (this.#active.get(queue) ?? 0) + 1);
  }

  finished(queue: string, succeeded: boolean): void {
    this.#active.set(queue, Math.max(0, (this.#active.get(queue) ?? 1) - 1));
    const target = succeeded ? this.#completed : this.#failed;
    target.set(queue, (target.get(queue) ?? 0) + 1);
  }

  render(): string {
    const queues = new Set([
      ...this.#active.keys(),
      ...this.#completed.keys(),
      ...this.#failed.keys(),
    ]);
    const lines = [
      "# HELP collage_worker_jobs_total Processed worker jobs.",
      "# TYPE collage_worker_jobs_total counter",
    ];
    for (const queue of queues) {
      lines.push(
        `collage_worker_jobs_total{queue="${queue}",result="completed"} ${String(this.#completed.get(queue) ?? 0)}`,
        `collage_worker_jobs_total{queue="${queue}",result="failed"} ${String(this.#failed.get(queue) ?? 0)}`,
      );
    }
    lines.push(
      "# HELP collage_worker_jobs_active Active worker jobs.",
      "# TYPE collage_worker_jobs_active gauge",
    );
    for (const queue of queues) {
      lines.push(
        `collage_worker_jobs_active{queue="${queue}"} ${String(this.#active.get(queue) ?? 0)}`,
      );
    }
    return `${lines.join("\n")}\n`;
  }
}
