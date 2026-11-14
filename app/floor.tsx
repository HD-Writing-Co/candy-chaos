"use client";

import { useEffect,useRef,useState,type KeyboardEvent } from "react";
import { ArrowRight,Headphones,Music2,Sparkles,UserRound } from "lucide-react";
import { floorEmotes,type Profile } from "./club-data";

type Position={x:number;y:number;emote:string};
type Player=Profile&Position;
const spawn={x:50,y:83,emote:""};
const clamp=(n:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,n)));

export default function Floor({me,onProfile,onSetup,onVoice}:{me:Profile|null;onProfile:(profile:Profile)=>void;onSetup:()=>void;onVoice:()=>void}){
  const [pos,setPos]=useState<Position>(spawn),[players,setPlayers]=useState<Player[]>([]),[error,setError]=useState("");
  const latest=useRef<Position>(spawn);
  const stage=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!me?.id) return;
    let active=true,timer:ReturnType<typeof setTimeout>;
    const send=(body:Position)=>fetch("/api/floor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const poll=async()=>{
      try{
        const response=await send(latest.current);
        if(!response.ok) throw new Error();
        const result=await response.json() as {players:Player[]};
        if(active){setPlayers(result.players);setError("");}
      }catch{
        if(active) setError("Couldn’t sync avatars. Reconnecting…");
      }
      if(active) timer=setTimeout(poll,900);
    };
    void poll();
    return ()=>{active=false;clearTimeout(timer);};
  },[me?.id]);

  function update(next:Position){
    latest.current=next;
    setPos(next);
  }
  function move(x:number,y:number){
    if(!me) return;
    update({...latest.current,x:clamp(x,5,95),y:clamp(y,10,90)});
  }
  function key(event:KeyboardEvent){
    if(event.target!==event.currentTarget||!me) return;
    const d:Record<string,[number,number]>={arrowup:[0,-4],w:[0,-4],arrowdown:[0,4],s:[0,4],arrowleft:[-4,0],a:[-4,0],arrowright:[4,0],d:[4,0]};
    const direction=d[event.key.toLowerCase()];
    if(!direction) return;
    event.preventDefault();
    move(latest.current.x+direction[0],latest.current.y+direction[1]);
  }
  const visible=[...players.filter(p=>p.id!==me?.id),...(me?[{...me,...pos}]:[])].sort((a,b)=>a.y-b.y);
  return <section className="floor">
    <header className="floor-header"><div><span className="eyebrow"><Sparkles size={14}/> VIRTUAL CLUB</span><h1>Club Floor</h1><p>Click or tap to move. On desktop, focus the floor and use the arrow keys or WASD.</p></div><button className="subtle" onClick={onVoice}><Headphones size={17}/> Open Neon Lounge</button></header>
    <div className="floor-stage" ref={stage} tabIndex={0} role="region" aria-label="Club floor. Use arrow keys or WASD to move your avatar." onKeyDown={key} onClick={event=>{
      const rect=event.currentTarget.getBoundingClientRect();
      stage.current?.focus({preventScroll:true});
      move((event.clientX-rect.left)/rect.width*100,(event.clientY-rect.top)/rect.height*100);
    }}>
      <div className="floor-wall" aria-hidden="true"/>
      <div className="floor-booth" aria-hidden="true"><Music2 size={21}/> DJ BOOTH</div>
      <div className="floor-neon left" aria-hidden="true"/>
      <div className="floor-neon right" aria-hidden="true"/>
      <div className="floor-tiles" aria-hidden="true"><span>DANCE FLOOR</span></div>
      <div className="floor-couch left" aria-hidden="true"/><div className="floor-couch right" aria-hidden="true"/>
      <span className="floor-zone left" aria-hidden="true">PINK LOUNGE</span><span className="floor-zone right" aria-hidden="true">TEAL LOUNGE</span>
      {visible.map(player=><button key={player.id} className={"floor-player"+(player.id===me?.id?" self":"")} style={{left:player.x+"%",top:player.y+"%"}} onClick={event=>{event.stopPropagation();onProfile(player);}} aria-label={"View "+player.name+"'s profile"}><span className="floor-avatar">{player.avatar}</span><span className="floor-name">{player.id===me?.id?"You":player.name}</span>{player.emote&&<span className="floor-emote">{player.emote}</span>}</button>)}
    </div>
    <footer className="floor-footer"><span><i/> {visible.length} on the floor</span>{me?<div className="emotes" aria-label="Avatar emotes">{floorEmotes.slice(1).map((emoji,index)=><button key={emoji} aria-label={["Wave","Dance","Sparkle"][index]} aria-pressed={pos.emote===emoji} onClick={()=>update({...latest.current,emote:pos.emote===emoji?"":emoji})}>{emoji}</button>)}</div>:<button className="primary" onClick={onSetup}><UserRound size={17}/> Set up your avatar <ArrowRight size={16}/></button>}</footer>
    {error&&<p className="error" role="status">{error}</p>}
  </section>;
}
