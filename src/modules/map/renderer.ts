import type { MapSystem, MapRegion } from "./model";
import type { MapOverlay } from "./travel";
import { securityClass } from "./model";

type Hit = { system: MapSystem; x: number; y: number };
type Options = {
 view?: () => "2d" | "3d";
 skyhooks?: () => ReadonlyMap<number, import("./skyhooks").SkyhookWindow>;
 overlay?: () => MapOverlay;
 camera: () => { yaw: number; pitch: number; zoom: number; panX?: number; panY?: number };
 dragging: () => boolean; selected: number | null; query: string; labels: boolean;
 focusRoute?: number[]; regions?: MapRegion[]; regionId?: number|null; regionLabels?: boolean;
 distanceUnit?: string;
 format: (value: number) => string; onHits: (hits: Hit[]) => void;
};

/** One frame per repaint; geometry, text and theme measurements are cached outside the hot path. */
export function createMapRenderer(canvas: HTMLCanvasElement, systems: MapSystem[], options: Options) {
 const ctx = canvas.getContext("2d");
 if (!ctx) return { schedule() {}, destroy() {} };
 const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
 for (const s of systems) for (let i=0;i<3;i++) { min[i]=Math.min(min[i],s[i+3] as number); max[i]=Math.max(max[i],s[i+3] as number); }
 const routeFocus = new Set(options.focusRoute ?? []);
 const routeSystems = systems.filter(s=>routeFocus.has(s[0]));
 const focus = systems.find(s => s[0]===options.selected);
 const regionSystems = options.regionId ? systems.filter(s=>s[6]===options.regionId) : [];
 const routeCenter = routeSystems.length ? [3,4,5].map(axis=>(Math.min(...routeSystems.map(s=>s[axis] as number))+Math.max(...routeSystems.map(s=>s[axis] as number)))/2) : null;
 const center = routeCenter ?? (focus ? focus.slice(3,6) as number[] : regionSystems.length ? [3,4,5].map(axis=>regionSystems.reduce((sum,s)=>sum+(s[axis] as number),0)/regionSystems.length) : min.map((v,i)=>(v+max[i])/2));
 const range = routeCenter ? Math.max(1,...routeSystems.map(s=>2*Math.hypot(s[3]-center[0],s[4]-center[1],s[5]-center[2]))) : !focus && regionSystems.length ? Math.max(1, ...regionSystems.map(s=>2*Math.hypot(s[3]-center[0],s[4]-center[1],s[5]-center[2]))) : Math.max(...max.map((v,i)=>v-min[i]),1);
 let lastOverlay: MapOverlay | undefined;
 let route = new Set<number>(), inRange = new Set<number>();
 let routeKey = "", beamStarted = 0;
 const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
 const query = options.query.trim().toLowerCase();
 ctx.font="11px Inter, sans-serif";
 const points = systems.map(s => {
  const label = `${s[1]} · ${options.format(s[2])}`;
  return {system:s,x:s[3]-center[0],y:s[4]-center[1],z:s[5]-center[2],
   label,width:ctx.measureText(label).width,match:!query || s[1].toLowerCase().includes(query),
   rangeLabel:label,rangeWidth:0,group:securityClass(s[2]),hit:{system:s,x:0,y:0}};
 });
 const pointsById = new Map(points.map(p => [p.system[0], p]));
 const regionNames = new Map(options.regions ?? []);
 const regionCenters = new Map<number,{name:string;x:number;y:number;z:number;count:number;width:number}>();
 for(const p of points) {
  const id=p.system[6];if(id===undefined||!regionNames.has(id))continue;
  const r=regionCenters.get(id)??{name:regionNames.get(id)!,x:0,y:0,z:0,count:0,width:0};
  r.x+=p.x;r.y+=p.y;r.z+=p.z;r.count++;regionCenters.set(id,r);
 }
 ctx.font="13px Inter, sans-serif";
 for(const r of regionCenters.values()){r.x/=r.count;r.y/=r.count;r.z/=r.count;r.width=ctx.measureText(r.name).width;}
 ctx.font="11px Inter, sans-serif";
 const regionLabelEntries=[...regionCenters].sort((a,b)=>Number(b[0]===options.regionId)-Number(a[0]===options.regionId));
 let width=0,height=0, frame=0, destroyed=false;
 let ink="", colors: Record<string,string>={};
 function theme() {
  const style=getComputedStyle(canvas); ink=style.color;
  colors={high:style.getPropertyValue("--series-ice").trim(),low:style.getPropertyValue("--series-gas").trim(),null:style.getPropertyValue("--series-ore").trim(), red:style.getPropertyValue("--color-critical-text").trim(),green:style.getPropertyValue("--color-good-text").trim(),unknown:style.getPropertyValue("--color-ink-3").trim(),range:style.getPropertyValue("--color-accent").trim()};
 }
 function resize() {
  width=canvas.clientWidth; height=canvas.clientHeight;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx!.setTransform(dpr,0,0,dpr,0,0);ctx!.font="11px Inter, sans-serif";
  schedule();
 }
 function draw(now: number) {
  frame=0;if(destroyed || !ctx)return;
  const overlay = options.overlay?.();
  const skyhooks = options.skyhooks?.();
  if(overlay !== lastOverlay) {
   const nextRouteKey = (overlay?.route ?? []).join(",");
   if (nextRouteKey !== routeKey) { routeKey = nextRouteKey; beamStarted = now; }
   lastOverlay=overlay; route=new Set(overlay?.route ?? []);inRange=new Set(overlay?.inRange ?? []);
   const origin=pointsById.get(overlay?.originId ?? -1);
   if(origin&&overlay?.range)for(const p of points)if(inRange.has(p.system[0])||p.system[0]===overlay.originId){p.rangeLabel=`${p.label} · ${options.format(Math.hypot(p.x-origin.x,p.y-origin.y,p.z-origin.z))} ${options.distanceUnit ?? "LY"}`;p.rangeWidth=ctx.measureText(p.rangeLabel).width;}
  }
  const c=options.camera(), flat=options.view?.()==="2d", sy=Math.sin(c.yaw),cy=Math.cos(c.yaw),sp=flat?1:Math.sin(c.pitch),cp=flat?0:Math.cos(c.pitch);
  const scale=Math.min(width,height)*.8/range*c.zoom;
  ctx.clearRect(0,0,width,height);
  const hits: Hit[]=[];
  // Batch stars into just six paths instead of issuing thousands of individual fills.
  const paths: Record<string,Path2D>={};
  const onScreen: typeof points=[];
  for(const p of points) {
   const x=width/2+(c.panX??0)+(p.x*cy-p.z*sy)*scale;
   const y=height/2+(c.panY??0)-(p.y*cp-(p.x*sy+p.z*cy)*sp)*scale;
   p.hit.x=x;p.hit.y=y;
   if(x<0||y<0||x>width||y>height)continue;
   hits.push(p.hit);onScreen.push(p);
   const group=route.has(p.system[0]) ? overlay?.risks[p.system[0]] ?? "unknown" : inRange.has(p.system[0]) ? "range" : p.group;
   const match=route.size>0 ? route.has(p.system[0]) : inRange.has(p.system[0]) || p.system[0]===overlay?.originId || (p.match && (!options.regionId || p.system[6]===options.regionId) && !overlay?.range);
   const key=`${group}:${route.has(p.system[0]) || match}`;const path=paths[key]??(paths[key]=new Path2D());
   const size=route.has(p.system[0])||inRange.has(p.system[0])?5:options.regionId&&p.system[6]===options.regionId?4:3;
   path.rect(x-size/2,y-size/2,size,size);
  }
  for(const [key,path] of Object.entries(paths)) {
   const [group,match]=key.split(":");ctx.fillStyle=colors[group]||ink;ctx.globalAlpha=match==="true"?.85:route.size>0?.25:.35;ctx.fill(path);
  }
  options.onHits(hits);ctx.globalAlpha=1;
  // Rings preserve security colours and route-risk markers; no per-frame data searches.
  for(const p of onScreen) {
   const state=skyhooks?.get(p.system[0]);if(!state)continue;
   ctx.save();if(route.size>0&&!route.has(p.system[0]))ctx.globalAlpha=.4;ctx.strokeStyle=state==="active"?colors.green:colors.range;ctx.lineWidth=state==="active"?2:1;
   ctx.beginPath();ctx.arc(p.hit.x,p.hit.y,8,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  if(overlay?.route.length) {
   const path=new Path2D();let previous=false;
   for(const id of overlay.route) {const p=pointsById.get(id);if(!p){previous=false;continue;}if(previous)path.lineTo(p.hit.x,p.hit.y);else path.moveTo(p.hit.x,p.hit.y);previous=true;}
   ctx.save();ctx.globalAlpha=.45;ctx.strokeStyle=colors.range||ink;ctx.lineWidth=1;ctx.stroke(path);ctx.restore();
   const hops = overlay.route.length - 1;
   const duration = Math.min(hops * 750, 6000);
   const elapsed = now - beamStarted;
   if (!reducedMotion && hops > 0) {
    const progress = (elapsed % duration) / duration * hops;
    const index = Math.floor(progress), fraction = progress - index;
    const from = pointsById.get(overlay.route[index]);
    const to = pointsById.get(overlay.route[index + 1]);
    if (from && to) {
     const x = from.hit.x + (to.hit.x - from.hit.x) * fraction;
     const y = from.hit.y + (to.hit.y - from.hit.y) * fraction;
     ctx.save();ctx.globalCompositeOperation="lighter";
     const glow = ctx.createRadialGradient(x,y,0,x,y,16);
     glow.addColorStop(0,ink);glow.addColorStop(.18,colors.range||ink);glow.addColorStop(1,"transparent");
     ctx.globalAlpha=.65;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();
     // Short, separate sparks follow the bright core rather than a moving stroke.
     const length = Math.hypot(to.hit.x-from.hit.x,to.hit.y-from.hit.y);
     for(let spark=1;spark<=5;spark++) {
      const behind = fraction-spark*5/Math.max(length,1);
      if(behind<0)break;
      ctx.globalAlpha=.5*(1-spark/6);ctx.fillStyle=colors.range||ink;ctx.beginPath();
      ctx.arc(from.hit.x+(to.hit.x-from.hit.x)*behind,from.hit.y+(to.hit.y-from.hit.y)*behind,Math.max(.5,1.8-spark*.2),0,Math.PI*2);ctx.fill();
     }
     ctx.globalAlpha=1;ctx.fillStyle=ink;ctx.beginPath();ctx.arc(x,y,2.2,0,Math.PI*2);ctx.fill();
     if(fraction<.18) {
      const pulse=fraction/.18;
      ctx.globalAlpha=(1-pulse)*.7;ctx.strokeStyle=colors.range||ink;ctx.lineWidth=1;ctx.beginPath();ctx.arc(from.hit.x,from.hit.y,4+pulse*12,0,Math.PI*2);ctx.stroke();
     }
     ctx.restore();
    }
    schedule();
   }
  }
  // A glowing sphere marks only route waypoints with confirmed gate-kill evidence.
  let pulsing=false;
  for(const p of onScreen) {
   if(!route.has(p.system[0]) || overlay?.risks[p.system[0]]!=="red")continue;
   const phase=reducedMotion ? .35 :((now-beamStarted)%2200)/2200;
   const radius=10+phase*22,alpha=reducedMotion ? .35 :(1-phase)*.55;
   ctx.save();
   const glow=ctx.createRadialGradient(p.hit.x,p.hit.y,0,p.hit.x,p.hit.y,radius);
   glow.addColorStop(0,colors.red||ink);glow.addColorStop(.45,colors.red||ink);glow.addColorStop(1,"transparent");
   ctx.globalAlpha=alpha;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(p.hit.x,p.hit.y,radius,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=alpha*.8;ctx.strokeStyle=colors.red||ink;ctx.lineWidth=1;
   ctx.beginPath();ctx.arc(p.hit.x,p.hit.y,radius,0,Math.PI*2);ctx.stroke();ctx.restore();
   pulsing=true;
  }
  if(pulsing&&!reducedMotion)schedule();
  if(overlay?.range) {
   const origin=pointsById.get(overlay?.originId ?? -1);
   if(origin){ctx.strokeStyle=colors.range||ink;ctx.lineWidth=1;ctx.beginPath();ctx.arc(origin.hit.x,origin.hit.y,overlay.range*scale,0,Math.PI*2);ctx.stroke();}
  }
  if(focus) {
   ctx.strokeStyle=ink;ctx.beginPath();ctx.arc(width/2+(c.panX??0),height/2+(c.panY??0),7,0,Math.PI*2);ctx.stroke();
  }
  // Detailed labels return immediately after interaction; moving frames only draw stars.
  if(options.dragging())return;
  ctx.fillStyle=ink;
  const occupied=new Set<string>();let count=0;
  if(options.regionLabels) {
   ctx.font="13px Inter, sans-serif";
   const regionCells=new Set<string>();
   for(const [id,r] of regionLabelEntries) {
    if(c.zoom>=3 && (focus || id!==options.regionId))continue;
    const x=width/2+(c.panX??0)+(r.x*cy-r.z*sy)*scale-r.width/2;
    const y=height/2+(c.panY??0)-(r.y*cp-(r.x*sy+r.z*cy)*sp)*scale;
    if(x<0||y<16||x+r.width>width||y>height)continue;
    const cells:string[]=[];
    for(let col=Math.floor((x-8)/32);col<=Math.floor((x+r.width+12)/32);col++)for(let row=Math.floor((y-20)/16);row<=Math.floor((y+8)/16);row++)cells.push(`${col}:${row}`);
    if(cells.some(cell=>regionCells.has(cell)))continue;
    ctx.fillStyle=id===options.regionId?(colors.range||ink):ink;ctx.globalAlpha=route.size>0?.4:id===options.regionId?1:.7;ctx.fillText(r.name,x,y);
    cells.forEach(cell=>{regionCells.add(cell);occupied.add(cell);});
   }
   ctx.font="11px Inter, sans-serif";ctx.globalAlpha=1;ctx.fillStyle=ink;
  }
  for(const p of onScreen) {
   const active=p.system[0]===options.selected;
   if(!active && !route.has(p.system[0]) && (!options.labels||(options.regionLabels&&c.zoom<3)||(!p.match&&!inRange.has(p.system[0]))||(options.regionId&&p.system[6]!==options.regionId&&!inRange.has(p.system[0]))||count>=100 || (overlay?.range && !inRange.has(p.system[0]))))continue;
   const x=p.hit.x+7,y=p.hit.y-5;
   const label=overlay?.range?p.rangeLabel:p.label, labelWidth=overlay?.range?p.rangeWidth:p.width;
   const cells:string[]=[];
   for(let col=Math.floor(x/32);col<=Math.floor((x+labelWidth+4)/32);col++)
    for(let row=Math.floor((y-12)/16);row<=Math.floor((y+4)/16);row++)cells.push(`${col}:${row}`);
   if(!active && cells.some(cell=>occupied.has(cell)))continue;
   ctx.globalAlpha=route.size>0&&!route.has(p.system[0])&&!active ? .4 : 1;ctx.fillText(label,x,y);ctx.globalAlpha=1;cells.forEach(cell=>occupied.add(cell));count++;
  }
 }
 function schedule() {if(!frame&&!destroyed)frame=requestAnimationFrame(draw);}
 theme();resize();
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 const mutation=new MutationObserver(()=>{theme();schedule();});mutation.observe(document.documentElement,{attributes:true,attributeFilter:["class","data-theme"]});
 return { schedule, destroy() {destroyed=true;cancelAnimationFrame(frame);observer.disconnect();mutation.disconnect();} };
}
