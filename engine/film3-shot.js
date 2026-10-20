import * as film from '../design/film3/film3.js';
import {renderWithMotionBlur} from '../design/lib/blur.js';
const canvas=document.querySelector('#film');
const scale=window.devicePixelRatio||1;
canvas.width=Math.round(1920*scale);canvas.height=Math.round(1080*scale);
const ctx=canvas.getContext('2d',{willReadFrequently:true});
const spec={
 duration:1,fps:30,post:{motionBlur:1,grain:0},
 meta:{project:'proj1-1019',version:'film3',timingSource:'loading',canvasSize:[canvas.width,canvas.height],
       postOrder:'scene subframes -> reference linear-light blur -> film.post once',depthOfField:true},
 async setup(){
  const board=await film.load();spec.duration=film.duration();spec.meta.timingSource=board.source;
  spec.meta.wordSync=board.wordSync;
 },
 render(t){
  renderWithMotionBlur(ctx,canvas.width,canvas.height,
    (target,time)=>film.render(target,time),time=>film.cameraAt(time,scale),t,
    {fps:30,shutterAngle:180,maxSamples:128});
  film.post(ctx,t);
 }
};
Shot.define(spec);
