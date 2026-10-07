import { expect, it } from "vitest";
import { createFormatter } from "../src/lib/format";
it("supports compact killmail ages without changing the default relative-time format",()=>{
 const f=createFormatter("en"),now=new Date("2026-10-07T12:00:00Z");
 expect(f.relativeTime("2026-10-07T11:31:00Z",now,"narrow")).toBe("29m ago");
 expect(f.relativeTime("2026-10-07T10:00:00Z",now,"narrow")).toBe("2h ago");
 expect(f.relativeTime("2026-10-07T11:31:00Z",now)).toBe("29 minutes ago");
 expect(createFormatter("de").relativeTime("2026-10-07T11:31:00Z",now,"narrow")).toContain("29");
});
