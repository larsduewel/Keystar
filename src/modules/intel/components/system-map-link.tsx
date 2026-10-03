import Link from "next/link";
import type { ReactNode } from "react";
import { mapSystemHref } from "@/modules/map/links";
export function SystemMapLink({id,children,className=""}:{id:number;children:ReactNode;className?:string}) {
 return <Link href={mapSystemHref(id)} className={`hover:text-accent hover:underline ${className}`}>{children}</Link>;
}
