import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {build} from '../design/film/storyboard.js';
import {shutterTravel} from '../design/lib/blur.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const timing=read('audio/vo/timing.json');
const cues=read('design/cues.json');
if(cues.timing!=='audio/vo/timing.json' || Math.abs(cues.duration-timing.total)>0.001) throw new Error('Re-export real-time cues first');
const board=build(timing,read('design/film/script.json'));
const events=cues.cues.map((cue,index)=>{
  const result={...cue,index};
  if(['move','pullback'].includes(cue.type)){
    const count=Math.ceil(cue.dur*100)+1;
    const values=Array.from({length:count},(_,i)=>shutterTravel(board.cameraAt,cue.t+i*cue.dur/(count-1),0.005)/0.005);
    const peak=Math.max(...values,1e-12);
    result.envelope=values.map(v=>v/peak);
    const a=board.cameraAt(cue.t),b=board.cameraAt(cue.t+cue.dur);
    result.panDirection=Math.sign(b.x-a.x);
  }
  return result;
});
mkdirSync('audio/sfx',{recursive:true});
writeFileSync('audio/sfx/plan.json',JSON.stringify({source:'design/cues.json',duration:timing.total,events},null,2)+'\n');
mkdirSync('audio/music',{recursive:true});
const seg=Object.fromEntries(timing.segments.map(s=>[s.id,s]));
writeFileSync('audio/music/placement.json',JSON.stringify({source:'audio/vo/timing.json',windows:[
  {id:'opening',start:0,end:seg.S02.end+0.3,fadeIn:1.5,fadeOut:2.5},
  {id:'menard',start:seg.S13.start,end:seg.S15.end+1.5,fadeIn:2,fadeOut:3},
  {id:'ending',start:seg.S19.start,end:timing.total,fadeIn:1.5,fadeOut:4}
]},null,2)+'\n');
console.log(events.length+' sound cues; 3 music windows exported');
