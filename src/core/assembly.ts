export interface AssemblyStep {
  id: string;
  prerequisites: string[];
  partIds: string[];
}
export function validateAssembly(steps: readonly AssemblyStep[]): string[] {
  const errors: string[] = [];
  const ids = new Set(steps.map((step) => step.id));
  if (ids.size !== steps.length) errors.push("Duplicate step IDs");
  const byId = new Map(steps.map((step) => [step.id, step]));
  const active = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string): void {
    if (active.has(id)) {
      errors.push(`Dependency cycle at ${id}`);
      return;
    }
    if (visited.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id)?.prerequisites ?? []) {
      if (!ids.has(dependency))
        errors.push(`Unknown prerequisite ${dependency} in ${id}`);
      else visit(dependency);
    }
    active.delete(id);
    visited.add(id);
  }
  for (const step of steps) {
    if (!step.id || !step.partIds.length)
      errors.push("Steps require identity and parts");
    visit(step.id);
  }
  return [...new Set(errors)];
}
export function availableSteps(
  steps: readonly AssemblyStep[],
  completed: readonly string[],
): AssemblyStep[] {
  const done = new Set(completed);
  return steps.filter(
    (step) =>
      !done.has(step.id) && step.prerequisites.every((id) => done.has(id)),
  );
}
export function completeStep(
  steps: readonly AssemblyStep[],
  completed: readonly string[],
  id: string,
): string[] {
  const errors = validateAssembly(steps);
  if (errors.length) throw new Error(errors.join("; "));
  const known = new Set(steps.map((step) => step.id));
  if (completed.some((step) => !known.has(step)))
    throw new Error("Unknown completed step");
  for (const step of steps.filter((step) => completed.includes(step.id))) {
    if (
      step.prerequisites.some((dependency) => !completed.includes(dependency))
    )
      throw new Error("Invalid completion history");
  }
  if (completed.includes(id)) return [...new Set(completed)];
  if (!availableSteps(steps, completed).some((step) => step.id === id))
    throw new Error("Step is unavailable");
  return [...completed, id];
}
/** Undo also invalidates dependent steps, so restored state remains consistent. */
export function undoStep(
  steps: readonly AssemblyStep[],
  completed: readonly string[],
  id: string,
): string[] {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of steps) {
      if (
        !removed.has(step.id) &&
        step.prerequisites.some((dependency) => removed.has(dependency))
      ) {
        removed.add(step.id);
        changed = true;
      }
    }
  }
  return completed.filter((step) => !removed.has(step));
}
