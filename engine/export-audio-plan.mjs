import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from '../design/film/storyboard.js';
import {shutterTravel} from '../design/lib/blur.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const timing=read('audio/vo/timing.json');
const cues=read('design/cues.json');
if(cues.timing!=='audio/vo/timing.json' || Math.abs(cues.duration-timing.total)>0.001) throw new Error('Re-export real-time cues first');
const words={};
for(const seg of timing.segments){
  const path='audio/vo/'+seg.id+'.words.json';
  if(existsSync(path)) words[seg.id]=read(path);
}
const board=build(timing,read('design/film/script.json'),words);
if(board.wordSync!==cues.wordSync || board.wordSync!==timing.segments.length) throw new Error('Word alignment differs from the accepted design');
if(board.cues.length!==cues.cues.length || board.cues.some((c,i)=>{
  const exported=cues.cues[i];
  return c.type!==exported.type || Math.abs(c.t-exported.t)>0.00051 ||
    Math.abs((c.dur||0)-(exported.dur||0))>0.00051;
})) throw new Error('Design cues are stale relative to the aligned storyboard');
const inputPaths=['design/cues.json','design/film/storyboard.js','design/film/script.json','design/lib/blur.js',
  'audio/vo/timing.json',...timing.segments.map(s=>'audio/vo/'+s.id+'.words.json')];
const inputs=inputPaths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));

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
writeFileSync('audio/sfx/plan.json',JSON.stringify({source:'design/cues.json',wordSync:board.wordSync,inputs,duration:timing.total,events},null,2)+'\n');
mkdirSync('audio/music',{recursive:true});
const seg=Object.fromEntries(timing.segments.map(s=>[s.id,s]));
writeFileSync('audio/music/placement.json',JSON.stringify({source:'audio/vo/timing.json',windows:[
  {id:'opening',start:0,end:seg.S02.end+0.3,fadeIn:1.5,fadeOut:2.5},
  {id:'menard',start:seg.S13.start,end:seg.S15.end+1.5,fadeIn:2,fadeOut:3},
  {id:'ending',start:seg.S19.start,end:timing.total,fadeIn:1.5,fadeOut:4}
]},null,2)+'\n');
console.log(events.length+' sound cues; 3 music windows exported');
