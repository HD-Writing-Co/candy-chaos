import { getUser } from "../../auth";
import { db } from "../../../db/database";
import { floorEmotes } from "../../club-data";

const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export const dynamic="force-dynamic";
export const runtime="nodejs";

export async function POST(request:Request){
  const user=await getUser();
  if(!user) return respond({error:"Sign in to join the floor."},401);
  if(!request.headers.get("Content-Type")?.startsWith("application/json")) return respond({error:"Expected JSON."},415);
  const raw=await request.text();
  if(raw.length>2048) return respond({error:"Request is too large."},413);
  let action;
  try{action=JSON.parse(raw);}catch{return respond({error:"Invalid position."},400);}
  const database=db();
  const {x,y,emote}=action??{};
  if(!Number.isInteger(x)||x<5||x>95||!Number.isInteger(y)||y<10||y>90||!floorEmotes.includes(emote)){
    return respond({error:"Invalid position."},400);
  }
  const now=Date.now();
  const results=await database.batch([
    database.prepare("INSERT INTO club_floor SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM profiles WHERE id=?) ON CONFLICT(user) DO UPDATE SET x=excluded.x,y=excluded.y,emote=excluded.emote,seen=excluded.seen").bind(user.userId,x,y,emote,now,user.userId),
    database.prepare("SELECT p.id,p.name,p.avatar,p.bio,f.x,f.y,f.emote FROM club_floor f JOIN profiles p ON p.id=f.user WHERE f.seen>? ORDER BY f.y LIMIT 80").bind(now-14000),
  ]);
  if(!results[0].meta.changes) return respond({error:"Set up your club profile first."},403);
  return respond({players:results[1].results});
}
