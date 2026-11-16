(function(root){
  'use strict';
  class PlaybackCoordinator{
    constructor(){this.revision=0;this.owner=null;this.tail=Promise.resolve();this.stoppers=new Map();}
    register(source,stop){this.stoppers.set(source,stop);}
    claim(source){const revision=++this.revision;this.owner=source;for(const [provider,stop] of this.stoppers)if(provider!==source)stop();return {source,revision,current:()=>this.revision===revision};}
    run(request,operation){const task=this.tail.then(()=>request.current()?operation(request):undefined);this.tail=task.catch(()=>{});return task;}
    control(operation){const revision=this.revision;const task=this.tail.then(()=>this.revision===revision?operation():false);this.tail=task.catch(()=>{});return task;}
    owns(source){return this.owner===null||this.owner===source;}
  }
  root.LumaPlaybackCore={PlaybackCoordinator};if(typeof module!=='undefined')module.exports=root.LumaPlaybackCore;else root.LumaPlayback=new PlaybackCoordinator();
})(typeof globalThis!=='undefined'?globalThis:this);
