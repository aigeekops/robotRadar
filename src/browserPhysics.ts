import { siteBaseUrl } from "./siteAssets";
/** Browser-only MuJoCo. A terminated worker is never reused after cancellation. */
export function createBrowserPhysicsClient() {
  let worker: Worker | null = null;
  let sequence = 0;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      cleanup: () => void;
    }
  >();
  const dispose = () => {
    worker?.terminate();
    worker = null;
    for (const entry of pending.values()) {
      entry.cleanup();
      entry.reject(new Error("Physics worker cancelled"));
    }
    pending.clear();
  };
  const request = (
    action: "profile" | "simulate",
    payload: unknown = {},
    signal?: AbortSignal,
  ): Promise<any> => {
    if (signal?.aborted)
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    if (!worker) {
      worker = new Worker(
        new URL("vendor/mujoco/g1-worker.js", siteBaseUrl()),
        { type: "module" },
      );
      worker.onmessage = ({ data }) => {
        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);
        entry.cleanup();
        if (data.fatal) dispose();
        data.error
          ? entry.reject(new Error(data.error))
          : entry.resolve(data.result);
      };
      worker.onerror = () => dispose();
    }
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const abort = () => dispose();
      const timeout = setTimeout(() => {
        dispose();
      }, 60000);
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      };
      pending.set(id, { resolve, reject, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
      worker!.postMessage({ id, action, payload, base: siteBaseUrl() });
    });
  };
  return {
    profile: (signal?: AbortSignal) => request("profile", {}, signal),
    simulate: (payload: unknown, signal?: AbortSignal) =>
      request("simulate", payload, signal),
    dispose,
  };
}
