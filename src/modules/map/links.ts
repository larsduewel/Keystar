export function mapSystemHref(systemId: number): string { return `/map?system=${systemId}`; }
export function parseMapSystem(value: string | string[] | undefined): number | null {
 if(typeof value !== "string" || !/^\d+$/.test(value))return null;
 const id=Number(value);return Number.isSafeInteger(id)&&id>=30000000&&id<33000000?id:null;
}
