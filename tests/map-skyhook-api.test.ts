import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/core/auth/dal",()=>({getCurrentUser:vi.fn()}));
vi.mock("../src/core/db",()=>({getDb:vi.fn()}));
import { getCurrentUser } from "../src/core/auth/dal";
import { getDb } from "../src/core/db";
import { GET } from "../src/app/api/map/skyhooks/route";
beforeEach(()=>vi.resetAllMocks());
function user(allowed=true){vi.mocked(getCurrentUser).mockResolvedValue({can:()=>allowed} as unknown as Awaited<ReturnType<typeof getCurrentUser>>);}
function database(rows:unknown[]){vi.mocked(getDb).mockReturnValue({select:()=>({from:()=>({where:async()=>rows})})} as unknown as ReturnType<typeof getDb>);}
it("rejects unauthenticated readers before accessing the shared snapshot",async()=>{
 vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET()).status).toBe(401);expect(getDb).not.toHaveBeenCalled();
});
it("requires map.view",async()=>{user(false);expect((await GET()).status).toBe(403);expect(getDb).not.toHaveBeenCalled();});
it("distinguishes an unavailable snapshot from a valid empty feed",async()=>{
 user();database([]);expect((await GET()).status).toBe(503);
 const snapshot={skyhooks:[],checkedAt:new Date("2026-10-07T12:00:00Z"),sourceAt:new Date("2026-10-07T12:00:00Z")};database([snapshot]);
 const response=await GET();expect(response.status).toBe(200);expect(response.headers.get("Cache-Control")).toBe("private, no-store");expect(await response.json()).toEqual({...snapshot,checkedAt:snapshot.checkedAt.toISOString(),sourceAt:snapshot.sourceAt.toISOString()});
});
it("returns unavailable on storage failure",async()=>{user();vi.mocked(getDb).mockImplementation(()=>{throw new Error("offline");});expect((await GET()).status).toBe(503);});
