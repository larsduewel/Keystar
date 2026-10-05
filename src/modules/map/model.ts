export type MapRegion = [id: number, name: string];
export type MapSystem = [id: number, name: string, security: number, x: number, y: number, z: number, regionId?: number];
export function project(x: number, y: number, z: number, yaw: number, pitch: number) {
  const horizontal = x * Math.cos(yaw) - z * Math.sin(yaw);
  const depth = x * Math.sin(yaw) + z * Math.cos(yaw);
  return { x: horizontal, y: y * Math.cos(pitch) - depth * Math.sin(pitch), z: y * Math.sin(pitch) + depth * Math.cos(pitch) };
}
export function securityClass(security: number): "high" | "low" | "null" {
  return security >= 0.45 ? "high" : security > 0 ? "low" : "null";
}

export function systemSpace(id: number): "known" | "wormholes" | "all" {
  return id >= 32000000 ? "all" : id >= 31000000 ? "wormholes" : "known";
}
