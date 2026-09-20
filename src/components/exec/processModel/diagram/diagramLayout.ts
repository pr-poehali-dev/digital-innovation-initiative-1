// Константы геометрии холста редактора схем процессов.
// Дорожки — горизонтальные полосы (классический BPMN-swimlane), поток — слева
// направо. pos_x узла — абсолютная координата по всему холсту (общая шкала
// времени), pos_y — координата относительно верха своей дорожки.

import { NodeType } from "@/lib/execProcessModelApi";

export const LANE_HEADER_WIDTH = 168;
export const LANE_HEIGHT = 176;
export const UNASSIGNED_LANE_HEIGHT = 140;
export const CANVAS_MIN_WIDTH = 1400;
export const GRID_SIZE = 20;
export const GAP_X = 220;

export const NODE_DEFAULT_SIZE: Record<NodeType, { width: number; height: number }> = {
  start: { width: 64, height: 64 },
  end: { width: 64, height: 64 },
  task: { width: 168, height: 76 },
  gateway: { width: 72, height: 72 },
  subprocess: { width: 176, height: 80 },
  document: { width: 144, height: 68 },
  system: { width: 144, height: 68 },
  control: { width: 168, height: 76 },
  note: { width: 152, height: 76 },
};

export function snap(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}
