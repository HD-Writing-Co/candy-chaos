import { randomBytes,randomUUID,scrypt as derive } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cookieName,digest,equal,newToken,sessionAge,tokenPattern } from "../../auth";
import { db } from "../../../db/database";

const scrypt=promisify(derive);
const respond=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
const error=(message:string,status=400)=>respond({error:message},status);
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/"};
const usernamePattern=/^[-_a-z0-9]{3,24}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const signupDuration=30*60*1000;
const sqlLimit="INSERT INTO auth_attempts VALUES (?,?,1) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN MIN(attempts+1,101) ELSE 1 END,window=excluded.window RETURNING attempts";

async function allow(key:string,limit:number){
  const window=Math.floor(Date.now()/600000);
  const row=await db().prepare(sqlLimit).bind(digest(key),window).first<{attempts:number}>();
  return (row?.attempts??101)<=limit;
}

async function startSignup(email:string){
  const database=db();
  if(await database.prepare("SELECT id FROM verified_accounts WHERE email=?").bind(email).first()) return respond({ok:true});
  const sender=process.env.AUTH_FROM_EMAIL,key=process.env.RESEND_API_KEY,site=process.env.APP_URL;
  if(!sender||!key||!site) return error("Email signup is temporarily unavailable.",503);
  const link=new URL("/sign-in",site);
  if(link.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&link.hostname==="localhost")) return error("Email signup is temporarily unavailable.",503);

  const token=newToken(), hashed=digest(token), now=Date.now();
  link.hash="signup="+token;
  await database.prepare("DELETE FROM signup_tokens WHERE expires<=?").bind(now).run();
  await database.prepare("INSERT INTO signup_tokens VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET digest=excluded.digest,expires=excluded.expires")
    .bind(email,hashed,now+signupDuration).run();
  try{
    const sent=await fetch("https://api.resend.com/emails",{method:"POST",signal:AbortSignal.timeout(8000),
      headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      body:JSON.stringify({from:sender,to:[email],subject:"Verify your Chaos & Candy email",text:`Open this link to verify your email and create your Chaos & Candy account:\n\n${link.href}\n\nThe link expires in 30 minutes. If you didn't request it, you can ignore this email.`})});
    if(!sent.ok) throw new Error("Email delivery failed");
  }catch{
    await database.prepare("DELETE FROM signup_tokens WHERE digest=?").bind(hashed).run();
    return error("Couldn’t send the verification email. Try again shortly.",503);
  }
  return respond({ok:true});
}

async function issueSession(id:string){
  const database=db(),token=newToken(),now=Date.now();
  const prior=(await cookies()).get(cookieName)?.value;
  const tasks=[
    database.prepare("DELETE FROM account_sessions WHERE expires<=?").bind(now),
    database.prepare("INSERT INTO account_sessions VALUES (?,?,?)").bind(digest(token),id,now+sessionAge*1000),
  ];
  if(prior&&tokenPattern.test(prior)) tasks.push(database.prepare("DELETE FROM account_sessions WHERE digest=?").bind(digest(prior)));
  await database.batch(tasks);
  const response=respond({ok:true});
  response.cookies.set(cookieName,token,{...cookieOptions,maxAge:sessionAge});
  return response;
}

export async function POST(req:Request){
  if(!req.headers.get("content-type")?.startsWith("application/json")) return error("Expected JSON.",415);
  const raw=await req.text();
  if(raw.length>4096) return error("Request too large.",413);
  let input;
  try{input=JSON.parse(raw);}catch{return error("Invalid request.");}
  if((process.env.SESSION_SECRET?.length??0)<32) return error("Sign-in setup is incomplete.",503);
  const database=db();
  if(input?.action==="logout"){
    const prior=(await cookies()).get(cookieName)?.value;
    if(prior&&tokenPattern.test(prior)) await database.prepare("DELETE FROM account_sessions WHERE digest=?").bind(digest(prior)).run();
    const response=respond({ok:true});
    response.cookies.set(cookieName,"",{...cookieOptions,maxAge:0});
    return response;
  }
  const action=input?.action;
  if(!["signup","complete","login"].includes(action)) return error("Invalid request.");
  const client=(process.env.VERCEL?req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim():"local")||"unknown";
  if(!await allow(action+"|ip|"+client,action==="signup"?10:40)) return error("Too many attempts. Try again in a few minutes.",429);
  if(action==="signup"){
    const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
    if(email.length>254||!emailPattern.test(email)) return error("Enter a valid email address.");
    if(!await allow("signup|email|"+email,3)) return error("Too many requests. Try again in a few minutes.",429);
    return startSignup(email);
  }
  const username=typeof input.username==="string"?input.username.trim().toLowerCase():"";
  const password=typeof input.password==="string"?input.password:"";
  if(!usernamePattern.test(username)||password.length<(action==="login"?12:15)||password.length>128) return error(action==="login"?"Username or password is incorrect.":"Use a 3–24 character username and a password of 15–128 characters.");
  if(action==="complete"){
    if(typeof input.token!=="string"||!tokenPattern.test(input.token)) return error("This verification link is invalid or expired.",410);
    const hashed=digest(input.token);
    if(!await allow("complete|token|"+hashed,12)) return error("Too many attempts. Request a new link in a few minutes.",429);
    if(!await database.prepare("SELECT email FROM signup_tokens WHERE digest=? AND expires>?").bind(hashed,Date.now()).first()) return error("This verification link is invalid or expired.",410);
    const salt=randomBytes(16).toString("hex");
    const hash=(await scrypt(password,salt,64) as Buffer).toString("hex");
    const id=randomUUID();
    const account=await database.prepare("INSERT INTO verified_accounts SELECT ?,?,email,? FROM signup_tokens WHERE digest=? AND expires>? AND NOT EXISTS (SELECT 1 FROM accounts WHERE username=?) ON CONFLICT DO NOTHING")
      .bind(id,username,salt+":"+hash,hashed,Date.now(),username).run();
    if(!account.meta.changes){
      const usable=await database.prepare("SELECT s.email FROM signup_tokens s WHERE s.digest=? AND s.expires>? AND NOT EXISTS (SELECT 1 FROM verified_accounts a WHERE a.email=s.email)").bind(hashed,Date.now()).first();
      return usable?error("That username is already taken.",409):error("This verification link has expired or already been used.",410);
    }
    await database.prepare("DELETE FROM signup_tokens WHERE digest=?").bind(hashed).run();
    return issueSession(id);
  }
  if(!await allow("login|username|"+username,12)) return error("Too many attempts. Try again in a few minutes.",429);
  const account=await database.prepare("SELECT id,password_hash FROM verified_accounts WHERE username=? UNION ALL SELECT id,password_hash FROM accounts WHERE username=? LIMIT 1").bind(username,username).first<{id:string;password_hash:string}>();
  const [salt,hash]=(account?.password_hash??"00000000000000000000000000000000:").split(":");
  const calculated=(await scrypt(password,salt,64) as Buffer).toString("hex");
  if(!account||!equal(hash,calculated)) return error("Username or password is incorrect.",401);
  return issueSession(account.id);
}
