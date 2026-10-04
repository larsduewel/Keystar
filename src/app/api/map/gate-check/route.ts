import { getCurrentUser } from "@/core/auth/dal";
import { checkGates, hasGates } from "@/modules/map/check-gates";
export async function GET(request: Request) {
 const user=await getCurrentUser();if(!user)return new Response(null,{status:401});
 if(!user.can("map.view"))return new Response(null,{status:403});
 const id=Number(new URL(request.url).searchParams.get("systemId"));
 if(!Number.isSafeInteger(id)||!hasGates(id))return new Response(null,{status:400});
 try { return Response.json(await checkGates(id),{headers:{"Cache-Control":"private, no-store"}}); }
 catch { return new Response(null,{status:503}); }
}
