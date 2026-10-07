import { beforeEach, expect, it, vi } from "vitest";
import type { JobContext } from "../src/core/sync/types";
vi.mock("../src/core/eve/resolver",()=>({ensureNames:vi.fn(),ensureTypes:vi.fn()}));
import { ensureNames, ensureTypes } from "../src/core/eve/resolver";
import { mapNamesJob } from "../src/modules/map/jobs";
beforeEach(()=>vi.resetAllMocks());
function context(){
 const where=vi.fn().mockResolvedValue(undefined), remove=vi.fn(()=>({where}));
 const db={select:()=>({from:()=>({limit:async()=>[{id:1,kind:"character"},{id:587,kind:"type"}]})}),delete:remove};
 return {ctx:{db} as unknown as JobContext,remove};
}
it("resolves both character and ship names before acknowledging durable work",async()=>{
 const {ctx,remove}=context();await mapNamesJob.run(ctx);
 expect(ensureNames).toHaveBeenCalledWith([1]);expect(ensureTypes).toHaveBeenCalledWith([587]);expect(remove).toHaveBeenCalledOnce();
});
it("retains queued work when name resolution fails so the worker can retry",async()=>{
 vi.mocked(ensureNames).mockRejectedValue(new Error("ESI unavailable"));
 const {ctx,remove}=context();await expect(mapNamesJob.run(ctx)).rejects.toThrow("ESI unavailable");
 expect(remove).not.toHaveBeenCalled();expect(ensureTypes).not.toHaveBeenCalled();
});
