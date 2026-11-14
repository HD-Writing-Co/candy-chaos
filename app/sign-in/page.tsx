"use client";

import Link from "next/link";
import { useEffect,useState,type FormEvent } from "react";
import { ArrowLeft,Zap } from "lucide-react";

type Mode="login"|"signup"|"sent"|"complete";
export default function SignIn(){
  const [mode,setMode]=useState<Mode>("login"),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    const value=new URLSearchParams(window.location.hash.slice(1)).get("signup");
    if(value){
      setToken(value);setMode("complete");
      window.history.replaceState(null,"",window.location.pathname);
    }
  },[]);
  function change(next:Mode){setMode(next);setError("");}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setBusy(true);setError("");
    try{
      const values=Object.fromEntries(new FormData(event.currentTarget));
      const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...values,action:mode,...(mode==="complete"?{token}:{})})});
      if(!response.ok) throw new Error((await response.json().catch(()=>null))?.error??"Sign-in is temporarily unavailable.");
      if(mode==="signup"){change("sent");return;}
      window.location.assign("/");
    }catch(e){setError(e instanceof Error?e.message:"Try again.");}finally{setBusy(false);}
  }
  return <main className="auth-shell"><section className="auth-card">
    <Link className="auth-back" href="/"><ArrowLeft size={16}/> Back to the club</Link>
    <span className="logo"><Zap size={22} fill="currentColor"/></span>
    <h1>{mode==="login"?"Sign in to Chaos & Candy":mode==="sent"?"Check your email":mode==="complete"?"Finish creating your account":"Join Chaos & Candy"}</h1>
    {mode==="sent"?<><p>Open the verification link to choose your username and password. Check your spam folder if the email hasn’t arrived.</p><button className="auth-switch" onClick={()=>change("signup")}>Send another link</button></>:<form key={mode} onSubmit={submit}>
      {mode==="signup"?<><p>Enter your email to get a verification link.</p><label>Email address<input name="email" type="email" required maxLength={254} autoComplete="email"/></label></>:<>
        <label>Username<input name="username" required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_\-]+" autoComplete="username"/></label>
        <label>Password<input name="password" type="password" required minLength={mode==="complete"?15:12} maxLength={128} autoComplete={mode==="complete"?"new-password":"current-password"}/></label>
        {mode==="complete"&&<p>Use at least 15 characters.</p>}
      </>}
      {error&&<p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy?"Please wait…":mode==="signup"?"Send verification link":mode==="complete"?"Create account":"Sign in"}</button>
    </form>}
    <button className="auth-switch" onClick={()=>change(mode==="login"||mode==="complete"?"signup":"login")} disabled={busy}>{mode==="login"?"New here? Create an account":mode==="complete"?"Request a new verification link":"Already a member? Sign in"}</button>
  </section></main>;
}
