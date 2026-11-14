"use client";

import { useCallback,useEffect,useRef,useState,type FormEvent } from "react";
import { ArrowRight,AudioLines,DoorOpen,Hash,Headphones,Menu,Mic,MicOff,Plus,Radio,Send,Search,Settings2,Sparkles,Users,X,Zap } from "lucide-react";
import { avatars,houseRooms,type Profile,type Room } from "./club-data";
import Floor from "./floor";
import { Voice,type Peer,type Signal } from "./voice";

type Message={id:number;user:string;name:string;avatar:string;bio:string;body:string;created:number};
type ClubData={me:Profile|null;rooms:Room[];messages:Message[];members:Profile[];directory:Profile[];counts:{room:string;total:number}[];peers:Peer[];signals:Signal[]};
const empty:ClubData={me:null,rooms:houseRooms,messages:[],members:[],directory:[],counts:[],peers:[],signals:[]};
async function api<T>(values?:Record<string,unknown>,query?:URLSearchParams):Promise<T>{
  const response=await fetch("/api/club"+(query?"?"+query:""),values?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)}:{cache:"no-store"});
  if(!response.ok){
    const failure=await response.json().catch(()=>null) as {error?:string}|null;
    throw new Error(failure?.error||"The club is temporarily unavailable.");
  }
  return response.json() as Promise<T>;
}
async function apiLogout(){
  const response=await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"logout"})});
  if(!response.ok) throw new Error("Sign-out failed. Try again.");
}
const errorText=(e:unknown)=>e instanceof Error?e.message:"Something went wrong.";

export default function Club({signedIn,signIn}:{signedIn:boolean;signIn:string}){
  const [data,setData]=useState<ClubData>(empty),[roomId,setRoomId]=useState("lobby"),[dialog,setDialog]=useState<"profile"|"room"|null>(null);
  const [view,setView]=useState<"chat"|"floor"|"members">("chat"),[memberQuery,setMemberQuery]=useState(""),[directory,setDirectory]=useState<Profile[]>([]),[directoryStatus,setDirectoryStatus]=useState("");
  const [loaded,setLoaded]=useState(false),[nav,setNav]=useState(false),[people,setPeople]=useState(false),[member,setMember]=useState<Profile|null>(null);
  const [draft,setDraft]=useState(""),[error,setError]=useState(""),[sending,setSending]=useState(false);
  const [name,setName]=useState(""),[bio,setBio]=useState(""),[avatar,setAvatar]=useState(avatars[0]),[kind,setKind]=useState("voice"),[saving,setSaving]=useState(false);
  const [joined,setJoined]=useState(false),[muted,setMuted]=useState(false),[joining,setJoining]=useState(false),[voiceStatus,setVoiceStatus]=useState("");
  const voice=useRef<Voice|null>(null), end=useRef<HTMLDivElement>(null), lastBeat=useRef(0), modal=useRef<HTMLDialogElement>(null), revision=useRef(0);
  const me=data.me, room=data.rooms.find(r=>r.id===roomId)??houseRooms[0], hasProfile=!!me;

  const refresh=useCallback(async (id:string,beat=false)=>{
    const current=voice.current;
    const started=++revision.current;
    if(beat && Date.now()-lastBeat.current>6500){
      lastBeat.current=Date.now();
      await api({action:"presence",room:id,session:current?.session,voiceRoom:current?.room});
    }
    const params=new URLSearchParams({room:id});
    if(current){params.set("session",current.session);params.set("voiceRoom",current.room);params.set("after",String(current.cursor));}
    const next=await api<ClubData>(undefined,params);
    if(started!==revision.current) return;
    setData(next);setLoaded(true);
    if(current===voice.current && current){
      if(!next.peers.some(p=>p.session===current.session)){
        current.close();voice.current=null;setJoined(false);setMuted(false);setVoiceStatus("Voice session expired. Join again to reconnect.");
      } else await current.sync(next.peers,next.signals);
    }
  },[]);

  useEffect(()=>{
    if(!signedIn) return;
    let stopped=false, timer:ReturnType<typeof setTimeout>;
    lastBeat.current=0;
    const loop=async()=>{
      try {await refresh(roomId,hasProfile);}
      catch(e){if(!stopped) setError(errorText(e));}
      if(!stopped) timer=setTimeout(loop,voice.current?1100:2400);
    };
    void loop();
    return ()=>{stopped=true;clearTimeout(timer);revision.current++;};
  },[signedIn,hasProfile,roomId,refresh]);

  useEffect(()=>{
    if(view!=="members"||!signedIn) return;
    let active=true;
    const timer=setTimeout(async()=>{
      try{
        const next=await api<ClubData>(undefined,new URLSearchParams({room:"lobby",memberQuery}));
        if(active){setDirectory(next.directory);setDirectoryStatus(next.directory.length?"":"No members found.");}
      }catch(e){if(active) setDirectoryStatus(errorText(e));}
    },200);
    return ()=>{active=false;clearTimeout(timer);};
  },[view,signedIn,memberQuery]);

  useEffect(()=>{if(dialog||member) modal.current?.showModal();else modal.current?.close();},[dialog,member]);
  useEffect(()=>{const list=end.current?.parentElement;if(list) list.scrollTop=list.scrollHeight;},[data.messages.at(-1)?.id,roomId,view]);
  useEffect(()=>{
    const release=()=>{
      const current=voice.current;
      if(!current) return;
      current.close();voice.current=null;
      void fetch("/api/club",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"leave",room:current.room,session:current.session})}).catch(()=>{});
    };
    window.addEventListener("pagehide",release);
    return ()=>window.removeEventListener("pagehide",release);
  },[]);

  function openProfile(){setError("");setName(me?.name??"");setAvatar(me?.avatar??avatars[0]);setBio(me?.bio??"");setDialog("profile");}
  function openRoom(){
    if(joining) return;
    if(!signedIn){window.top!.location.href=signIn;return;}
    if(!me){openProfile();return;}
    setError("");setName("");setBio("");setKind("voice");setDialog("room");
  }
  function leave(){
    const current=voice.current;
    if(!current) return;
    voice.current=null; current.close();setJoined(false);setMuted(false);setVoiceStatus("");
    void api({action:"leave",room:current.room,session:current.session}).catch(()=>{});
  }
  function select(id:string){
    if(joining) return;
    if(id!==roomId){
      revision.current++;setRoomId(id);setData(old=>({...old,messages:[]}));setDraft("");setError("");
    }
    setView("chat");setNav(false);
  }
  async function save(event:FormEvent){
    event.preventDefault();setSaving(true);setError("");
    try {
      if(dialog==="profile"){
        await api({action:"profile",name,bio,avatar});await refresh(roomId);
      }else{
        const result=await api<{id:string}>({action:"create",name,description:bio,kind});
        revision.current++;setRoomId(result.id);setView("chat");setDraft("");await refresh(result.id);
      }
      setDialog(null);
    }catch(e){setError(errorText(e));}finally{setSaving(false);}
  }
  async function message(event:FormEvent){
    event.preventDefault();
    if(!draft.trim()||sending) return;
    setSending(true);setError("");
    try {await api({action:"message",room:roomId,body:draft});setDraft("");await refresh(roomId);}
    catch(e){setError(errorText(e));}finally{setSending(false);}
  }
  async function join(){
    if(joining||voice.current?.room===roomId) return;
    if(!signedIn){window.top!.location.href=signIn;return;}
    if(!me){openProfile();return;}
    leave();setJoining(true);setError("");setVoiceStatus("");
    let stream:MediaStream|undefined;
    let current:Voice|undefined;
    const requestedRoom=roomId;
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("Open the club in its own browser tab to use your microphone.");
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const {servers}=await api<{servers:RTCIceServer[]}>({action:"ice",room:requestedRoom,session:crypto.randomUUID()});
      current=new Voice(requestedRoom,stream,(to,payload)=>api({action:"signal",room:requestedRoom,session:current!.session,to,payload}),setVoiceStatus,servers);
      await api({action:"join",room:requestedRoom,session:current.session});
      voice.current=current;setJoined(true);
      await refresh(requestedRoom);
    }catch(e){
      if(current){current.close();void api({action:"leave",room:requestedRoom,session:current.session}).catch(()=>{});}
      else stream?.getTracks().forEach(track=>track.stop());
      voice.current=null;setJoined(false);
      setError(e instanceof DOMException?"Microphone access failed. Check your browser permissions and try again.":errorText(e));
    }finally{setJoining(false);}
  }
  function navigate(destination:"floor"|"members"){
    if(joining) return;
    if(view===destination){setNav(false);setPeople(false);return;}
    if(destination==="members"){setDirectory([]);setDirectoryStatus("Loading members…");setMemberQuery("");}
    setView(destination);setNav(false);setPeople(false);
  }
  function showProfile(profile:Profile){if(profile.id===me?.id)openProfile();else setMember(profile);}
  const connectedRoom=joined?data.rooms.find(r=>r.id===voice.current?.room):null;
  const count=(id:string)=>data.counts.find(x=>x.room===id)?.total??0;
  const canChat=signedIn&&!!me;
  const action=()=>signedIn?openProfile():window.top!.location.assign(signIn);

  return <div className="shell">
    <button className="mobile-shade" hidden={!nav} onClick={()=>setNav(false)} aria-label="Close room menu"/>
    <aside className={"sidebar"+(nav?" open":"")}>
      <button className="brand" onClick={()=>select("lobby")} disabled={joining}><span className="logo"><Zap size={22} fill="currentColor"/></span><span><strong>CHAOS <b>&amp;</b> CANDY</strong><small>THE SOCIAL CLUB</small></span></button>
      <div className="side-scroll">
        <div className="section-title">THE CLUB</div>
        <button className={"side-link home"+(view==="floor"?" chosen":"")} aria-current={view==="floor"?"page":undefined} onClick={()=>navigate("floor")}><Sparkles size={17}/> Club Floor</button>
        <button className={"side-link home"+(view==="members"?" chosen":"")} aria-current={view==="members"?"page":undefined} onClick={()=>navigate("members")}><Users size={17}/> Members</button>
        {["text","voice"].map(type=><section className="channels" key={type}><div className="section-title"><span>{type==="text"?"TEXT CHANNELS":"VOICE CHANNELS"}</span><button title={"Create "+type+" channel"} aria-label={"Create "+type+" channel"} onClick={()=>{openRoom();setKind(type);}}><Plus size={17}/></button></div>{data.rooms.filter(r=>r.kind===type).map(r=><button key={r.id} disabled={joining} aria-current={view==="chat"&&r.id===roomId?"page":undefined} className={"side-link"+(view==="chat"&&r.id===roomId?" chosen":"")} onClick={()=>select(r.id)}>{type==="text"?<Hash size={17}/>:<AudioLines size={17}/>}<span>{r.id==="lobby"?"Main Chat":r.name}</span>{type==="voice"&&<em>{connectedRoom?.id===r.id?<i aria-label="Connected"/>:count(r.id)||null}</em>}</button>)}</section>)}
        <button className="create" onClick={openRoom}><Plus size={18}/> Create channel</button>
      </div>
      {connectedRoom&&<div className="connected"><button onClick={()=>select(connectedRoom.id)}><i/> Voice connected <strong>{connectedRoom.name}</strong></button><div><button aria-label={muted?"Unmute microphone":"Mute microphone"} onClick={()=>{voice.current?.mute(!muted);setMuted(!muted);}}>{muted?<MicOff size={17}/>:<Mic size={17}/>}</button><button aria-label="Disconnect voice" onClick={leave}><DoorOpen size={17}/></button></div>{voiceStatus&&<small role="status">{voiceStatus}</small>}</div>}
      <div className="side-profile"><button className="identity" onClick={action}><span className="avatar">{me?.avatar??"👾"}</span><span><strong>{me?.name??"My Profile"}</strong><small>{me?"Edit My Profile":signedIn?"Set up profile":"Sign in or join"}</small></span><Settings2 size={17}/></button>{signedIn&&<button className="sign-out" onClick={async()=>{try{leave();await apiLogout();window.location.assign("/");}catch(e){setError(errorText(e));}}}>Sign out</button>}</div>
    </aside>

    <main className="main">
      <header className="top"><button className="icon mobile-menu" aria-label="Open channels" onClick={()=>{setPeople(false);setNav(true);}}><Menu size={22}/></button><div className="crumb">{view==="floor"?<Sparkles size={19}/>:view==="members"?<Users size={19}/>:room.kind==="voice"?<AudioLines size={19}/>:<Hash size={19}/>}<strong>{view==="floor"?"Club Floor":view==="members"?"Members":room.name}</strong></div><div className="top-actions"><button className="top-profile" onClick={action}><span className="mini-avatar">{me?.avatar??"👾"}</span><span>{signedIn?"My Profile":"Sign in"}</span></button><button className="online" aria-label="Online members" aria-expanded={people} onClick={()=>{setNav(false);setPeople(!people);}}><i/>{data.members.length}<span> online</span></button></div></header>
      {view==="floor"?<div className="content"><Floor me={me} onProfile={showProfile} onSetup={action} onVoice={()=>select("neon-lounge")}/></div>:view==="members"?<div className="content"><section className="directory"><header><h1>Members</h1><p>Find someone and open their club profile.</p></header>{signedIn?<><label className="member-search"><Search size={18}/><input aria-label="Search members by nickname" placeholder="Search by nickname" maxLength={50} value={memberQuery} onChange={event=>{setDirectory([]);setDirectoryStatus("Searching…");setMemberQuery(event.target.value);}}/></label><div className="member-grid">{directory.map(p=><button key={p.id} className="person" onClick={()=>showProfile(p)}><span className="avatar">{p.avatar}</span><span><strong>{p.name}</strong><small>{p.id===me?.id?"You":data.members.some(m=>m.id===p.id)?"Online":p.bio||"View profile"}</small></span></button>)}</div>{directoryStatus&&<p role="status">{directoryStatus}</p>}</>:<button className="primary" onClick={action}>Sign in to browse members</button>}</section></div>:
      <div className="content chat-content">
        {room.id==="lobby"&&<section className="lobby-strip"><div><h1>The Lobby</h1><p>Say hello here, or take your avatar onto the club floor.</p></div><button className="primary" onClick={()=>navigate("floor")}><Sparkles size={17}/> Explore the Club Floor</button></section>}
        {room.kind==="voice"&&<section className="room-hero voice-hero"><div className="voice-heading"><div><div className="eyebrow"><Radio size={15}/> VOICE CHANNEL</div><h1>{room.name}</h1><p>{room.description||"Make yourself at home."}</p></div><span className="voice-count">{count(room.id)}/6 in voice</span></div><div className="voice-controls">
          {connectedRoom?.id===room.id?<><button className="primary" onClick={()=>{voice.current?.mute(!muted);setMuted(!muted);}}>{muted?<MicOff size={17}/>:<Mic size={17}/>} {muted?"Unmute":"Mute"}</button><button className="subtle" onClick={leave}><DoorOpen size={17}/> Disconnect</button><button className="subtle" onClick={()=>voice.current?.enableAudio()}><Headphones size={16}/> Enable audio</button></>:<button className="primary" disabled={joining||count(room.id)>=6} onClick={join}><Mic size={17}/>{joining?"Connecting…":count(room.id)>=6?"Channel is full":connectedRoom?"Switch to this voice channel":"Join voice"}</button>}
        </div>{connectedRoom?.id===room.id&&data.peers.length>0&&<div className="peer-list">{data.peers.map(p=><span key={p.session}>{p.avatar} {p.name}</span>)}</div>}</section>}

        <section className="chat"><header><span className="chat-icon"><Hash size={20}/></span><div><h2>{room.id==="lobby"?"Main Chat":room.kind==="voice"?"Channel Chat":room.name}</h2><p>{room.id==="lobby"?"The club’s main text channel.":room.kind==="voice"?"Text chat alongside voice.":room.description||"Talk with other club members."}</p></div></header>
          <div className="messages" aria-label="Channel messages">
            {!data.messages.length&&<div className="empty">{signedIn&&!loaded?"Connecting to the club…":"No messages yet. Start the conversation."}</div>}
            {data.messages.map(m=><article className="message" key={m.id}><button className="avatar" aria-label={"View "+m.name+"'s profile"} onClick={()=>showProfile({id:m.user,name:m.name,avatar:m.avatar,bio:m.bio})}>{m.avatar}</button><div><strong>{m.name}</strong><time dateTime={new Date(m.created).toISOString()}>{new Date(m.created).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</time><p>{m.body}</p></div></article>)}
            <div ref={end}/>
          </div>
          {error&&!dialog&&<p className="error" role="alert">{error}</p>}
          {canChat?<form className="composer" onSubmit={message}><input aria-label="Message" placeholder={room.id==="lobby"?"Message Main Chat":"Message "+room.name} value={draft} maxLength={1000} onChange={e=>setDraft(e.target.value)}/><button className="primary" aria-label="Send message" disabled={sending||!draft.trim()}><Send size={17}/></button></form>:<div className="composer"><span>{signedIn?"Set up your profile to post.":"Sign in to join the conversation."}</span><button className="subtle" onClick={action}>{signedIn?"Set up profile":"Sign in"}<ArrowRight size={15}/></button></div>}
        </section>
      </div>}
      {!connectedRoom&&voiceStatus&&<p className="error" role="status">{voiceStatus}</p>}
      {view!=="chat"&&error&&!dialog&&<p className="error" role="alert">{error}</p>}
    </main>

    <aside className={"people"+(people?" open":"")}><header><span><Users size={17}/> Online now</span><button className="icon people-close" aria-label="Close members" onClick={()=>setPeople(false)}><X size={18}/></button></header><div className="people-inner">{data.members.length===0&&<p className="people-empty">No members online yet.</p>}{data.members.map(p=><button className="person" key={p.id} onClick={()=>showProfile(p)}><span className="avatar">{p.avatar}</span><span><strong>{p.name}</strong><small>{p.id===me?.id?"You":"Online"}</small></span></button>)}<button className="browse-members" onClick={()=>navigate("members")}>Browse members <ArrowRight size={14}/></button></div></aside>

    <dialog ref={modal} onCancel={()=>{setDialog(null);setMember(null);}} className="modal">
      <button className="icon close" aria-label="Close dialog" onClick={()=>{setDialog(null);setMember(null);}}><X size={22}/></button>
      {member?<><span className="avatar profile-avatar">{member.avatar}</span><h2>{member.name}</h2>{member.bio&&<p>{member.bio}</p>}</>:<><h2>{dialog==="room"?"Create channel":"Your club profile"}</h2><form onSubmit={save}>
        <label>{dialog==="room"?"Room name":"Nickname"}<input autoFocus required minLength={2} maxLength={dialog==="room"?32:24} value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>{dialog==="room"?"Description":"Bio"}<textarea maxLength={dialog==="room"?100:180} rows={2} value={bio} onChange={e=>setBio(e.target.value)}/></label>
        {dialog==="room"?<label>Room type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="voice">Voice + text</option><option value="text">Text only</option></select></label>:<fieldset><legend>Avatar</legend><div className="avatar-picker">{avatars.map(a=><button type="button" key={a} onClick={()=>setAvatar(a)} aria-label={a} aria-pressed={a===avatar}>{a}</button>)}</div></fieldset>}
        {error&&<p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={saving}>{saving?"Saving…":dialog==="room"?"Create channel":"Save profile"}</button>
      </form></>}
    </dialog>
  </div>;
}
