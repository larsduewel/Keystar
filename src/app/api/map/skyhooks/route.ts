import { getCurrentUser } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { mapSkyhookSnapshot } from "@/modules/map/schema";
import { eq } from "drizzle-orm";
export async function GET() {
 const user=await getCurrentUser();
 if(!user)return new Response(null,{status:401});
 if(!user.can("map.view"))return new Response(null,{status:403});
 try {
  const [snapshot]=await getDb().select().from(mapSkyhookSnapshot).where(eq(mapSkyhookSnapshot.id,0));
  if(!snapshot)return new Response(null,{status:503});
  return Response.json({skyhooks:snapshot.skyhooks,checkedAt:snapshot.checkedAt,sourceAt:snapshot.sourceAt},{headers:{"Cache-Control":"private, no-store"}});
 } catch { return new Response(null,{status:503}); }
}
