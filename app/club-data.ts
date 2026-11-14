export const avatars = ["👾","😈","🦇","🍒","🦊","💀","🐈‍⬛","🦋","🤖","🍬","🐉","🌙"];
export const floorEmotes=["","👋","💃","✨"];

export const roles=["member","moderator","admin"] as const;
export type Role=(typeof roles)[number];
export type Profile={id:string;name:string;avatar:string;bio:string;role?:Role};
export type Room={
  id:string;name:string;description:string;kind:"text"|"voice";owner:string;
  category?:string;emoji?:string;staff?:boolean;
};
export const roomCategories=["Welcome","Soft Girl Energy","Man Cave","Main","Gaming Zone","NSFW","Voice Channels","Help Desk","Community Rooms","Mods"];
export const isStaff=(role:Role)=>role==="admin"||role==="moderator";

function room(category:string,id:string,name:string,emoji="",description="",kind:Room["kind"]="text",staff=false):Room{
  return {id,category,name,emoji,description,kind,staff,owner:""};
}
export const houseRooms=[
  room("Welcome","welcome","welcome","🌼","New here? Say hello and get to know the club."),
  room("Welcome","rules-of-chaos","rules-of-chaos","📜","Discuss the club rules and where to find them."),
  room("Welcome","lobby","chaos-and-candy","🍭","The main room for Chaos & Candy."),
  room("Welcome","roles","roles","🎭","Ask about community roles."),
  room("Welcome","grow-the-server","grow-the-server","💋","Ideas for growing the community."),
  room("Soft Girl Energy","ladies-only","ladies-only","💗"),
  room("Soft Girl Energy","ladies-vc","Ladies VC","","","voice"),
  room("Man Cave","bro-tell","bro-tell","🍻"),
  room("Main","gossip-corner","gossip-corner","👀"),
  room("Main","introduce-yourself","introduce-yourself","🫶"),
  room("Main","cherry-on-top","cherry-on-top","🍒"),
  room("Main","420-candy","420-candy","🍭"),
  room("Main","server-crushes","server-crushes","👀"),
  room("Main","sting-status","sting-status","✨"),
  room("Main","sweet-chaos-memes","sweet-chaos-memes","💖"),
  room("Main","bubblegum-links","bubblegum-links","💗"),
  room("Main","tiny-roommates","tiny-roommates","🐢"),
  room("Main","ink","ink","🍇"),
  room("Main","jam-session","jam-session","🎶"),
  room("Main","vent-space","vent-space","🌼"),
  room("Main","ask-to-dm","ask-to-dm","💖"),
  room("Main","quote-of-the-day","quote-of-the-day","✨"),
  room("Gaming Zone","buzz-battles-fortnite","buzz-battles-fortnite","🕹️"),
  room("Gaming Zone","call-of-duty","call-of-duty"),
  room("Gaming Zone","all-other-games","all-other-games"),
  room("Gaming Zone","catch-that-pokemon","catch-that-pokemon"),
  room("Gaming Zone","truth-or-dare","truth-or-dare"),
  room("Gaming Zone","grow-a-plant","grow-a-plant"),
  room("NSFW","after-dark-chat","after-dark-chat","🌶️","After-hours conversation for adults."),
  room("Voice Channels","soundcheck","music","🎵","The music text room."),
  room("Voice Channels","neon-lounge","Candy Shop","🍭","Drop in and talk with club members.","voice"),
  room("Voice Channels","movie-time","movie-time","🍿","","voice"),
  room("Voice Channels","midnight","Midnight Bar","🌙","","voice"),
  room("Voice Channels","gaming-voice","Gaming","","","voice"),
  room("Voice Channels","music-time","Music time","","","voice"),
  room("Voice Channels","cupcake","Cupcake Lounge","🧁","","voice"),
  room("Help Desk","create-a-help-ticket","create-a-help-ticket","","Ask general questions here. Keep personal details out of this shared room."),
  room("Help Desk","become-a-worker-bee","become-a-worker-bee","🐝"),
  room("Help Desk","ticket-0430","ticket-0430","","","text",true),
  room("Help Desk","ticket-0431","ticket-0431","","","text",true),
  room("Community Rooms","after-hours","After Hours","","Original after-hours chat."),
  room("Community Rooms","backstage","Backstage","","Original voice room.","voice"),
  room("Mods","mod-chat","mod-chat","","Staff discussion.","text",true),
  room("Mods","mod-logs","mod-logs","","Staff discussion about moderation activity.","text",true),
  room("Mods","tickets","tickets","","Staff discussion about help tickets.","text",true),
];
