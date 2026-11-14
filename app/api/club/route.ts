import { db } from "../../../db/database";
import { getUser } from "../../auth";
import { getRole, ownerEmail } from "../../club-roles";
import { avatars, houseRooms, isStaff, roles, type Room } from "../../club-data";

export const dynamic = "force-dynamic";
const reply = (data:unknown,status=200) => Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
const fail = (error:string,status=400) => reply({error},status);
const clean = (x:unknown,max:number) => typeof x==="string" ? x.trim().slice(0,max) : "";
const token = (x:unknown) => typeof x==="string" && /^[a-f0-9-]{36}$/.test(x) ? x : "";
export const runtime = "nodejs";
async function getRoom(id:string) {
  return houseRooms.find(r=>r.id===id) ?? await db().prepare("SELECT id,name,description,kind,owner FROM rooms WHERE id=?").bind(id).first<Room>();
}

export async function GET(req:Request) {
  const user=await getUser();
  if(!user) return fail("Sign in to enter the club.",401);
  const role=await getRole(user.userId);
  const q=new URL(req.url).searchParams;
  const room=await getRoom(clean(q.get("room"),64));
  if(!room) return fail("This room is unavailable.",404);
  if(room.staff&&!isStaff(role)) return fail("This room is for staff.",403);
  const now=Date.now();
  const session=token(q.get("session"));
  const database=db();
  const statements=[
    database.prepare("SELECT * FROM profiles WHERE id=?").bind(user.userId),
    database.prepare("SELECT id,name,description,kind,owner FROM rooms ORDER BY created DESC LIMIT 100"),
    database.prepare("SELECT m.id,m.body,m.created,p.id AS user,p.name,p.avatar,p.bio FROM messages m JOIN profiles p ON m.user=p.id WHERE room=? ORDER BY m.id DESC LIMIT 80").bind(room.id),
    database.prepare("SELECT p.* FROM presence a JOIN profiles p ON a.user=p.id WHERE a.seen>? ORDER BY p.name LIMIT 80").bind(now-35000),
    database.prepare("SELECT room,COUNT(*) AS total FROM voice WHERE seen>? GROUP BY room").bind(now-20000),
  ];
  const voiceRoom=clean(q.get("voiceRoom"),64)||room.id;
  if(session) statements.push(
    database.prepare("SELECT v.session,p.name,p.avatar FROM voice v JOIN profiles p ON v.user=p.id WHERE v.room=? AND v.seen>? AND EXISTS (SELECT 1 FROM voice WHERE room=? AND session=? AND user=? AND seen>?)").bind(voiceRoom,now-20000,voiceRoom,session,user.userId,now-20000),
    database.prepare("SELECT id,sender,payload FROM signals WHERE room=? AND recipient=? AND id>? AND created>? AND EXISTS (SELECT 1 FROM voice WHERE room=? AND session=? AND user=? AND seen>?) ORDER BY id LIMIT 100").bind(voiceRoom,session,Number(q.get("after"))||0,now-60000,voiceRoom,session,user.userId,now-20000),
  );
  const memberQuery=clean(q.get("memberQuery"),50);
  const directoryIndex=q.has("memberQuery")?statements.length:-1;
  if(directoryIndex>=0) statements.push(database.prepare("SELECT p.id,p.name,p.avatar,p.bio,CASE WHEN EXISTS (SELECT 1 FROM verified_accounts v WHERE v.id=p.id AND v.email=?) THEN 'admin' ELSE COALESCE(r.role,'member') END AS role FROM profiles p LEFT JOIN club_roles r ON r.user_id=p.id WHERE instr(lower(p.name), lower(?))>0 OR ?='' ORDER BY p.name,p.id LIMIT 100").bind(ownerEmail(),memberQuery,memberQuery));
  const rows=await database.batch(statements);
  return reply({role,me:rows[0].results[0]??null,rooms:[...houseRooms.filter(room=>!room.staff||isStaff(role)),...rows[1].results],
    messages:rows[2].results.reverse(),members:rows[3].results,counts:rows[4].results,directory:rows[directoryIndex]?.results??[],
    peers:session?(rows[5]?.results??[]):[],signals:session?(rows[6]?.results??[]):[]});
}

export async function POST(req:Request) {
  const user=await getUser();
  if(!user) return fail("Sign in to enter the club.",401);
  if(!req.headers.get("content-type")?.startsWith("application/json")) return fail("Expected JSON.",415);
  const source=await req.text();
  if(source.length>24000) return fail("Request is too large.",413);
  let a;
  try {a=JSON.parse(source);} catch {return fail("Invalid request.");}
  if(!a || typeof a!=="object") return fail("Invalid request.");
  const database=db(), id=user.userId, now=Date.now();
  if(a.action==="profile"){
    const name=clean(a.name,24), bio=clean(a.bio,180);
    if(name.length<2 || !avatars.includes(a.avatar)) return fail("Choose a nickname and avatar.");
    await database.prepare("INSERT INTO profiles VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar,bio=excluded.bio").bind(id,name,a.avatar,bio).run();
    return reply({ok:true});
  }
  if(!await database.prepare("SELECT id FROM profiles WHERE id=?").bind(id).first()) return fail("Set up your profile first.",403);
  if(a.action==="role"){
    const target=token(a.target);
    if(!target||!roles.includes(a.role)) return fail("Choose a profile and role.");
    if(target===id) return fail("Manage roles from a different admin account.",403);
    const owner=ownerEmail();
    // Check the actor and protect the owner in the same statement that performs the write.
    const guard="EXISTS (SELECT 1 FROM profiles WHERE id=?) AND NOT EXISTS (SELECT 1 FROM verified_accounts WHERE id=? AND email=?) AND (EXISTS (SELECT 1 FROM verified_accounts WHERE id=? AND email=?) OR EXISTS (SELECT 1 FROM club_roles WHERE user_id=? AND role='admin'))";
    if(await getRole(id)!=="admin") return fail("Only admins can assign roles.",403);
    const result= a.role==="member"
      ? await database.prepare("DELETE FROM club_roles WHERE user_id=? AND "+guard).bind(target,target,target,owner,id,owner,id).run()
      : await database.prepare("INSERT INTO club_roles(user_id,role) SELECT ?,? WHERE "+guard+" ON CONFLICT(user_id) DO UPDATE SET role=excluded.role").bind(target,a.role,target,target,owner,id,owner,id).run();
    if(!result.meta.changes) return fail("No role changed. The owner role is managed in deployment settings.",409);
    return reply({ok:true});
  }
  if(a.action==="create"){
    const name=clean(a.name,32), description=clean(a.description,100);
    if(name.length<2 || !["text","voice"].includes(a.kind)) return fail("Choose a room name and type.");
    const roomId=crypto.randomUUID();
    const result=await database.prepare("INSERT INTO rooms SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM rooms WHERE owner=?)<20 AND (SELECT COUNT(*) FROM rooms)<100").bind(roomId,name,description,a.kind,id,now,id).run();
    return result.meta.changes ? reply({id:roomId},201) : fail("The room limit has been reached.",409);
  }
  const room=await getRoom(clean(a.room,64));
  if(!room) return fail("This room is unavailable.",404);
  if(room.staff&&!isStaff(await getRole(id))) return fail("This room is for staff.",403);
  const session=token(a.session);
  if(a.action==="presence"){
    const tasks=[database.prepare("INSERT INTO presence VALUES (?,?,?) ON CONFLICT(user) DO UPDATE SET room=excluded.room,seen=excluded.seen").bind(id,room.id,now)];
    if(session) tasks.push(database.prepare("UPDATE voice SET seen=? WHERE room=? AND session=? AND user=?").bind(now,clean(a.voiceRoom,64)||room.id,session,id));
    await database.batch(tasks);
    return reply({ok:true});
  }
  if(a.action==="message"){
    const body=clean(a.body,1000);
    if(!body) return fail("Enter a message.");
    const result=await database.prepare("INSERT INTO messages(room,user,body,created) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM messages WHERE user=? AND room=? AND created>?)").bind(room.id,id,body,now,id,room.id,now-600).run();
    return result.meta.changes ? reply({ok:true}) : fail("Wait a moment before sending another message.",429);
  }
  if(room.kind!=="voice" || !session) return fail("Choose a voice room.");
  if(a.action==="ice"){
    const urls=process.env.TURN_URLS?.split(",").map(url=>url.trim()).filter(Boolean);
    const username=process.env.TURN_USERNAME, credential=process.env.TURN_CREDENTIAL;
    const servers=[{urls:"stun:stun.l.google.com:19302"},...(urls?.length&&username&&credential?[{urls,username,credential}]:[])];
    return reply({servers});
  }
  if(a.action==="join"){
    const results=await database.batch([
      database.prepare("DELETE FROM voice WHERE seen<=?").bind(now-20000),
      database.prepare("DELETE FROM signals WHERE created<=?").bind(now-60000),
      database.prepare("INSERT INTO voice SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM voice WHERE room=?)<6 ON CONFLICT(room,session) DO NOTHING").bind(room.id,session,id,now,room.id),
    ]);
    return results[2].meta.changes ? reply({ok:true}) : fail("This voice room is full.",409);
  }
  if(a.action==="leave"){
    await database.prepare("DELETE FROM voice WHERE room=? AND session=? AND user=?").bind(room.id,session,id).run();
    return reply({ok:true});
  }
  if(a.action==="signal"){
    const to=token(a.to), payload=a.payload;
    if(!to || to===session || !payload || !["offer","answer","ice"].includes(payload.type)) return fail("Invalid voice signal.");
    await database.prepare("INSERT INTO signals(room,sender,recipient,payload,created) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM voice WHERE room=? AND session=? AND user=? AND seen>?) AND EXISTS (SELECT 1 FROM voice WHERE room=? AND session=? AND seen>?)").bind(room.id,session,to,JSON.stringify(payload),now,room.id,session,id,now-20000,room.id,to,now-20000).run();
    return reply({ok:true});
  }
  return fail("Unknown action.");
}
