export type Shape = {
  id: string;
  label: string;
  kind: "circle" | "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  movable: boolean;
};
export const initialScene = (): Shape[] => [
  {
    id: "red_circle",
    label: "Red circle",
    kind: "circle",
    x: 120,
    y: 130,
    width: 56,
    height: 56,
    movable: true,
  },
  {
    id: "blue_square",
    label: "Blue square",
    kind: "rectangle",
    x: 180,
    y: 300,
    width: 64,
    height: 64,
    movable: true,
  },
  {
    id: "green_rectangle",
    label: "Green rectangle",
    kind: "rectangle",
    x: 440,
    y: 220,
    width: 220,
    height: 180,
    movable: false,
  },
];
const bounds = (s: Shape) => ({
  l: s.x - s.width / 2,
  r: s.x + s.width / 2,
  t: s.y - s.height / 2,
  b: s.y + s.height / 2,
});
export function executeTool(
  scene: Shape[],
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const error = (message: string) => ({ ok: false, error: message });
  if (args.__invalid_arguments)
    return error(
      "Tool arguments must be a valid JSON object. Retry with the declared schema.",
    );
  if (name === "get_scene")
    return {
      ok: true,
      board: {
        width: 640,
        height: 420,
        origin: "top-left",
        x: "increases right",
        y: "increases down",
        positions: "absolute shape centres",
      },
      shapes: structuredClone(scene),
    };
  if (name === "move_shape") {
    const shape = scene.find((s) => s.id === args.shape_id);
    if (!shape) return error("Unknown shape ID. Use get_scene.");
    if (!shape.movable) return error("The green target is fixed.");
    const { x, y } = args;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    )
      return error("x and y must be finite numbers.");
    if (
      x < shape.width / 2 ||
      x > 640 - shape.width / 2 ||
      y < shape.height / 2 ||
      y > 420 - shape.height / 2
    )
      return error("The entire shape must stay within the 640 × 420 board.");
    const previous = { x: shape.x, y: shape.y };
    shape.x = x;
    shape.y = y;
    return { ok: true, previous, shape: { ...shape } };
  }
  if (name === "check_relation") {
    const a = scene.find((s) => s.id === args.subject_id),
      b = scene.find((s) => s.id === args.target_id);
    if (!a || !b) return error("Unknown subject or target shape ID.");
    if (a.id === b.id) return error("Choose two different shapes.");
    const A = bounds(a),
      B = bounds(b);
    let result: boolean;
    switch (args.relation) {
      case "inside":
        if (b.kind === "circle") {
          const radius = b.width / 2;
          result =
            a.kind === "circle"
              ? Math.hypot(a.x - b.x, a.y - b.y) + a.width / 2 <= radius
              : [
                  [A.l, A.t],
                  [A.r, A.t],
                  [A.l, A.b],
                  [A.r, A.b],
                ].every(([x, y]) => Math.hypot(x - b.x, y - b.y) <= radius);
        } else result = A.l >= B.l && A.r <= B.r && A.t >= B.t && A.b <= B.b;
        break;
      case "left_of":
        result = A.r <= B.l;
        break;
      case "right_of":
        result = A.l >= B.r;
        break;
      case "above":
        result = A.b <= B.t;
        break;
      case "below":
        result = A.t >= B.b;
        break;
      default:
        return error(
          "Supported relations: inside, left_of, right_of, above, below.",
        );
    }
    return {
      ok: true,
      subject_id: a.id,
      relation: args.relation,
      target_id: b.id,
      result,
      convention: "Entire shape; touching boundaries allowed.",
      subject: { ...a },
      target: { ...b },
    };
  }
  return error(
    "Unknown tool. Only get_scene, move_shape, and check_relation are available.",
  );
}
