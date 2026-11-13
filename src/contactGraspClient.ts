import { siteBaseUrl } from "./siteAssets";
import type { GraspSnapshot } from "./core/contactGrasp";
export function createContactGraspClient(
  onState: (snapshot: GraspSnapshot) => void,
  onError: (message: string) => void,
) {
  let worker: Worker | null = new Worker(
    new URL("vendor/mujoco/leap-grasp/worker.js", siteBaseUrl()),
    { type: "module" },
  );
  let next = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: GraspSnapshot) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const dispose = () => {
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Engine stopped"));
    }
    pending.clear();
  };
  worker.onmessage = ({ data }) => {
    if (data.type === "state") {
      onState(data.snapshot);
      return;
    }
    if (data.type === "error") {
      onError(data.error);
      return;
    }
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  };
  worker.onerror = () => {
    dispose();
    onError("Browser physics worker failed");
  };
  const command = (
    action: "init" | "grasp" | "lift" | "place" | "pause" | "resume",
  ) =>
    new Promise<GraspSnapshot>((resolve, reject) => {
      if (!worker) {
        reject(new Error("Engine is closed; reset to retry"));
        return;
      }
      const id = ++next;
      const timer = setTimeout(
        () => {
          dispose();
          onError("Physics request timed out; reset to retry");
        },
        action === "init" ? 60000 : 5000,
      );
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, action, base: siteBaseUrl() });
    });
  return { command, dispose };
}
