import { leapHandDefinition } from "./handLabData";
import { svhHandDefinition } from "./svhHandData";
import type { HandDefinition } from "./handLab";
export function handDefinitionForRobot(
  robotId: string,
): HandDefinition | undefined {
  return [leapHandDefinition, svhHandDefinition].find(
    (definition) => definition.robotId === robotId,
  );
}
